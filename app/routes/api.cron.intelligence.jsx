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
 * Vercel Cron: daily at 6:00 AM UTC
 *   vercel.json → schedule: "0 6 * * *"
 *
 * Can also be triggered manually for a specific shop:
 *   GET /api/cron/intelligence?shop=my-store.myshopify.com
 */

import prisma from '../db.server.js';
import { getMonitor } from '../services/intelligence/monitor.server.js';

export async function loader({ request }) {
  // Verify cron secret
  const url = new URL(request.url);
  const targetShop = url.searchParams.get('shop');
  const cronSecret = request.headers.get('authorization');
  const isAuthorized = process.env.CRON_SECRET
    ? cronSecret === `Bearer ${process.env.CRON_SECRET}`
    : process.env.NODE_ENV !== 'production';

  // In production, always require auth. In non-prod, allow manual single-shop trigger.
  if (!isAuthorized && !(process.env.NODE_ENV !== 'production' && targetShop)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const monitor = getMonitor();
  const results = [];

  // Single shop mode (manual trigger)
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
