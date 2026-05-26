/**
 * engine/orchestrator.js
 * Resumable step-based state machine that replaces the monolithic runPipeline().
 * Each step is a discrete unit with retry logic, timeout, and DB-persisted state.
 */

import prisma from '../../db.server.js';
import { acquireLock, releaseLock, renewLock } from './concurrency.js';
import { STEPS, StepStatus, RunStatus, getStepHandler, getStepConfig } from './steps/index.js';
import { emit, Events } from '../core/event-bus.js';
import { flushCost, clearRunAccumulator } from '../ai/cost-tracker.js';

// ── Step history helpers ────────────────────────────────────────────────────

function parseStepHistory(run) {
  try { return JSON.parse(run.stepHistory || '[]'); } catch { return []; }
}

function parseStepData(run) {
  try { return JSON.parse(run.stepData || '{}'); } catch { return {}; }
}

async function saveStepHistory(runId, history) {
  await prisma.engineRun.update({
    where: { id: runId },
    data: { stepHistory: JSON.stringify(history) },
  }).catch(() => {});
}

async function saveStepData(runId, data) {
  await prisma.engineRun.update({
    where: { id: runId },
    data: { stepData: JSON.stringify(data) },
  }).catch(() => {});
}

// ── Logging (same buffered approach as pipeline.js) ─────────────────────────

const _pendingLogs = new Map();

function dbLog(runId, tag, msg, cls) {
  if (!_pendingLogs.has(runId)) _pendingLogs.set(runId, []);
  _pendingLogs.get(runId).push({ tag, msg, cls: cls || tag.toLowerCase(), ts: Date.now() });
}

async function flushLogs(runId) {
  const pending = _pendingLogs.get(runId);
  if (!pending || pending.length === 0) return;
  const toWrite = pending.splice(0);

  try {
    const run = await prisma.engineRun.findUnique({
      where: { id: runId },
      select: { logs: true },
    });
    const existing = (() => { try { return JSON.parse(run?.logs || '[]'); } catch { return []; } })();
    const combined = [...existing, ...toWrite].slice(-200);
    await prisma.engineRun.update({
      where: { id: runId },
      data: { logs: JSON.stringify(combined) },
    });
  } catch { /* non-critical */ }
}

// ── Core orchestrator ───────────────────────────────────────────────────────

export async function startRun(runId, shop, runtimeOpts = {}) {
  const token = await acquireLock(runId, shop);
  if (!token) {
    throw new Error(`Shop ${shop} already has a running pipeline`);
  }

  await prisma.engineRun.update({
    where: { id: runId },
    data: { status: RunStatus.RUNNING, currentStep: STEPS[0].name },
  });

  emit(Events.ENGINE_STARTED, { runId, shop });

  try {
    await executeSteps(runId, shop, token, runtimeOpts);
  } finally {
    await releaseLock(runId);
    _pendingLogs.delete(runId);
  }
}

export async function resumeRun(runId) {
  const run = await prisma.engineRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status !== RunStatus.RUNNING && run.status !== RunStatus.QUEUED) {
    throw new Error(`Run ${runId} is ${run.status}, cannot resume`);
  }

  const token = await acquireLock(runId, run.shop);
  if (!token) throw new Error(`Shop ${run.shop} already has a running pipeline`);

  try {
    await executeSteps(runId, run.shop, token);
  } finally {
    await releaseLock(runId);
    _pendingLogs.delete(runId);
  }
}

async function executeSteps(runId, shop, lockToken, runtimeOpts = {}) {
  const run = await prisma.engineRun.findUnique({ where: { id: runId } });
  const config = (() => { try { return JSON.parse(run.config || '{}'); } catch { return {}; } })();
  if (runtimeOpts.admin) config._admin = runtimeOpts.admin;
  const history = parseStepHistory(run);
  let stepData = parseStepData(run);

  const completedSteps = new Set(
    history.filter(h => h.status === StepStatus.COMPLETED || h.status === StepStatus.SKIPPED).map(h => h.name),
  );

  const log = (tag, msg, cls) => dbLog(runId, tag, msg, cls);

  for (const stepDef of STEPS) {
    if (completedSteps.has(stepDef.name)) continue;

    const isStopped = await checkStopped(runId);
    if (isStopped) {
      emit(Events.ENGINE_STOPPED, { shop, reason: 'user requested stop' });
      return;
    }

    const renewed = await renewLock(runId, lockToken);
    if (!renewed) {
      log('SYSTEM', 'Lock lost — another invocation may have taken over', 'warn');
      await flushLogs(runId);
      return;
    }

    await prisma.engineRun.update({
      where: { id: runId },
      data: {
        currentStep: stepDef.name,
        phase: stepDef.phase,
        phaseSub: stepDef.label,
      },
    }).catch(() => {});

    const handler = getStepHandler(stepDef.name);
    if (!handler) {
      log('SYSTEM', `No handler for step "${stepDef.name}" — skipping`);
      recordStep(history, stepDef.name, StepStatus.SKIPPED, 'no handler registered');
      await saveStepHistory(runId, history);
      continue;
    }

    const context = {
      runId,
      shop,
      config,
      stepData,
      log,
      flushLogs: () => flushLogs(runId),
      setPhase: (phase, sub) =>
        prisma.engineRun.update({
          where: { id: runId },
          data: { phase, phaseSub: sub || '' },
        }).catch(() => {}),
      isStopped: () => checkStopped(runId),
      renewLock: () => renewLock(runId, lockToken),
    };

    const result = await runStep(stepDef, handler, context);

    recordStep(history, stepDef.name, result.status, result.error);
    await saveStepHistory(runId, history);

    if (result.data) {
      stepData = { ...stepData, ...result.data };
      await saveStepData(runId, stepData);
    }

    await flushLogs(runId);

    if (result.status === StepStatus.FAILED) {
      if (stepDef.required) {
        log('ERROR', `Required step "${stepDef.name}" failed: ${result.error}`, 'warn');
        await flushLogs(runId);
        await failRun(runId, shop, `Step "${stepDef.name}" failed: ${result.error}`);
        return;
      }
      log('SYSTEM', `Optional step "${stepDef.name}" failed — continuing: ${result.error}`);
    }
  }

  await completeRun(runId, shop);
}

async function runStep(stepDef, handler, context) {
  const { maxRetries, timeoutMs } = stepDef;
  let lastError = null;
  const attempts = maxRetries + 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      context.log('SYSTEM', `Retrying "${stepDef.name}" (attempt ${attempt + 1}/${attempts})`);
    }

    try {
      const promise = handler.execute(context);
      const result = timeoutMs > 0
        ? await Promise.race([
            promise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`Step "${stepDef.name}" timed out after ${timeoutMs}ms`)), timeoutMs),
            ),
          ])
        : await promise;

      return {
        status: StepStatus.COMPLETED,
        data: result?.data || null,
        error: null,
      };
    } catch (err) {
      lastError = err.message;
      context.log(stepDef.name.toUpperCase(), `Error: ${err.message}`, 'warn');
    }
  }

  if (!stepDef.required) {
    return { status: StepStatus.SKIPPED, data: null, error: lastError };
  }
  return { status: StepStatus.FAILED, data: null, error: lastError };
}

function recordStep(history, name, status, error) {
  history.push({
    name,
    status,
    error: error || null,
    completedAt: new Date().toISOString(),
  });
}

async function checkStopped(runId) {
  const run = await prisma.engineRun.findUnique({
    where: { id: runId },
    select: { status: true },
  }).catch(() => null);
  return !run || run.status === RunStatus.STOPPED;
}

async function failRun(runId, shop, reason) {
  await flushCost(runId).catch(() => {});
  clearRunAccumulator(runId);
  await prisma.engineRun.update({
    where: { id: runId },
    data: {
      status: RunStatus.FAILED,
      endedAt: new Date(),
      phaseSub: reason,
    },
  }).catch(() => {});
  emit(Events.ENGINE_ERROR, { runId, shop, error: reason });
}

async function completeRun(runId, shop) {
  await flushCost(runId).catch(() => {});
  clearRunAccumulator(runId);
  await flushLogs(runId);
  await prisma.engineRun.update({
    where: { id: runId },
    data: {
      status: RunStatus.COMPLETED,
      endedAt: new Date(),
      phase: 6,
      phaseSub: 'complete',
      currentStep: '',
    },
  }).catch(() => {});
  emit(Events.ENGINE_COMPLETE, { runId, shop });
}
