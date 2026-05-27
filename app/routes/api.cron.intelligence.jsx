/**
 * app/routes/api.cron.intelligence.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Cron-triggered background intelligence scan.
 *
 * Runs the Market Intelligence Monitor for all active shops:
 *   • Scans Reddit, HN, Google Trends for sentiment signals
 *   • Detects cross-platform trending products
 *   • Identifies catalog gaps and product opportunities
 *   • Persists insights for the Intelligence Dashboard
 *
 * Vercel Cron: every 30 minutes
 *   crons: [{ path: "/api/cron/intelligence", schedule: "*/30 * * * *" }]
 *
 * Can also be triggered manually for a specific shop:
 *   GET /api/cron/intelligence?shop=my-store.myshopify.com
 */

import prisma from '../db.server.js';
import { getMonitor } from '../services/intelligence/index.js';

export async function loader({ request }) {
  // Verify cron secret in production
  const url = new URL(request.url);
  const cronSecret = request.headers.get('authorization');

  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow manual trigger with shop param for development
    if (!url.searchParams.get('shop')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const monitor = getMonitor();
  const results = [];

  // Single shop mode (manual trigger)
  const targetShop = url.searchParams.get('shop');
  if (targetShop) {
    const result = await monitor.runCycle(targetShop);
    return Response.json({ ok: true, results: [result] });
  }

  // Cron mode: scan all shops with intelligence enabled
  try {
    const settings = await prisma.setting.findMany({
      select: { shop: true, engineConfig: true },
    });

    for (const setting of settings) {
      try {
        const config = setting.engineConfig ? JSON.parse(setting.engineConfig) : {};
        // Only scan shops that have monitoring enabled or have run the engine
        if (config.intelligenceEnabled === false) continue;

        const result = await monitor.runCycle(setting.shop);
        results.push({
          shop: setting.shop,
          signals: result.stats.signalCount,
          alerts: result.stats.alertCount,
          opportunities: result.stats.opportunityCount,
          duration: result.stats.durationMs,
        });
      } catch (err) {
        results.push({ shop: setting.shop, error: err.message });
      }
    }
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    scannedAt: new Date().toISOString(),
    shopCount: results.length,
    results,
  });
}
