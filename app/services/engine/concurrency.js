/**
 * engine/concurrency.js
 * DB-based per-shop concurrency lock for the orchestrator.
 * Uses lockToken (UUID) + lockExpiresAt (5min TTL) on EngineRun.
 * Crash-safe: expired locks are cleaned up by the next acquireLock call.
 */

import { randomUUID } from 'crypto';
import prisma from '../../db.server.js';

const LOCK_TTL_MS = 5 * 60 * 1000;

export async function acquireLock(runId, shop) {
  await cleanStaleLocks(shop);

  const existing = await prisma.engineRun.findFirst({
    where: {
      shop,
      status: 'RUNNING',
      lockToken: { not: null },
      lockExpiresAt: { gt: new Date() },
      id: { not: runId },
    },
    select: { id: true },
  });

  if (existing) return null;

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + LOCK_TTL_MS);

  await prisma.engineRun.update({
    where: { id: runId },
    data: {
      lockToken: token,
      lockExpiresAt: expiresAt,
      lastHeartbeat: new Date(),
    },
  });

  return token;
}

export async function releaseLock(runId) {
  await prisma.engineRun.update({
    where: { id: runId },
    data: { lockToken: null, lockExpiresAt: null },
  }).catch(() => {});
}

export async function renewLock(runId, token) {
  const run = await prisma.engineRun.findUnique({
    where: { id: runId },
    select: { lockToken: true },
  });

  if (!run || run.lockToken !== token) return false;

  await prisma.engineRun.update({
    where: { id: runId },
    data: {
      lockExpiresAt: new Date(Date.now() + LOCK_TTL_MS),
      lastHeartbeat: new Date(),
    },
  });
  return true;
}

export async function cleanStaleLocks(shop) {
  await prisma.engineRun.updateMany({
    where: {
      shop,
      lockToken: { not: null },
      lockExpiresAt: { lt: new Date() },
    },
    data: { lockToken: null, lockExpiresAt: null },
  }).catch(() => {});
}
