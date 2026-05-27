/**
 * app/routes/api.intelligence.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Market Intelligence API.
 *
 * GET  /api/intelligence                  — latest intelligence data + history
 * GET  /api/intelligence?intent=signals   — top signals only
 * GET  /api/intelligence?intent=trends    — trend velocity analysis
 *
 * POST /api/intelligence  intent=scan     — trigger immediate scan
 * POST /api/intelligence  intent=config   — update monitor config (keywords, subreddits)
 */

import { authenticate } from '../shopify.server';
import { getMonitor } from '../services/intelligence/monitor.server.js';
import prisma from '../db.server.js';

// ─── Loader (GET) ────────────────────────────────────────────────────────────

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const intent = url.searchParams.get('intent') || 'latest';

  const monitor = getMonitor();

  if (intent === 'latest') {
    const data = await monitor.getLatest(shop);
    return Response.json(data);
  }

  if (intent === 'signals') {
    const data = await monitor.getLatest(shop);
    return Response.json({
      signals: data.latest?.topSignals || [],
      scannedAt: data.latest?.ts || null,
    });
  }

  if (intent === 'trends') {
    const data = await monitor.getLatest(shop);
    return Response.json({
      crossPlatform: data.latest?.crossPlatform || [],
      opportunities: data.latest?.opportunities || [],
      gaps: data.latest?.gaps || [],
      scannedAt: data.latest?.ts || null,
    });
  }

  return Response.json({ error: 'Unknown intent' }, { status: 400 });
}

// ─── Action (POST) ───────────────────────────────────────────────────────────

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { intent } = body;

  if (intent === 'scan') {
    const monitor = getMonitor();
    const result = await monitor.runCycle(shop);
    return Response.json({
      ok: true,
      stats: result.stats,
      alertCount: result.alerts.length,
      opportunityCount: result.opportunities.length,
    });
  }

  if (intent === 'config') {
    const { keywords, subreddits, enabled } = body;
    const settings = await prisma.setting.findUnique({ where: { shop } });
    const config = settings?.engineConfig ? JSON.parse(settings.engineConfig) : {};

    if (keywords !== undefined) {
      if (!Array.isArray(keywords) || !keywords.every(k => typeof k === 'string')) {
        return Response.json({ error: 'keywords must be string[]' }, { status: 400 });
      }
      config.monitorKeywords = keywords;
    }
    if (subreddits !== undefined) {
      if (!Array.isArray(subreddits) || !subreddits.every(s => typeof s === 'string')) {
        return Response.json({ error: 'subreddits must be string[]' }, { status: 400 });
      }
      config.monitorSubreddits = subreddits;
    }
    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') {
        return Response.json({ error: 'enabled must be boolean' }, { status: 400 });
      }
      config.intelligenceEnabled = enabled;
    }

    await prisma.setting.upsert({
      where: { shop },
      update: { engineConfig: JSON.stringify(config) },
      create: { shop, engineConfig: JSON.stringify(config) },
    });

    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unknown intent' }, { status: 400 });
}
