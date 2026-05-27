/**
 * scripts/migrate-intelligence-to-tables.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time migration: moves intelligence data from Setting.engineConfig JSON
 * into the new IntelligenceScan + IntelligenceSignal tables.
 *
 * Safe to run multiple times — skips shops that already have scan records.
 *
 * Usage:
 *   node scripts/migrate-intelligence-to-tables.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[migrate] Scanning settings for intelligence data...');

  const settings = await prisma.setting.findMany({
    select: { shop: true, engineConfig: true },
  });

  let migrated = 0;
  let skipped = 0;

  for (const setting of settings) {
    if (!setting.engineConfig) {
      skipped++;
      continue;
    }

    let config;
    try {
      config = JSON.parse(setting.engineConfig);
    } catch {
      skipped++;
      continue;
    }

    const latest = config.latestIntelligence;
    if (!latest || !latest.topSignals?.length) {
      skipped++;
      continue;
    }

    // Check if this shop already has scan records
    const existingScans = await prisma.intelligenceScan.count({
      where: { shop: setting.shop },
    });
    if (existingScans > 0) {
      console.log(`  [skip] ${setting.shop} — already has ${existingScans} scans`);
      skipped++;
      continue;
    }

    // Create a scan record from the latest intelligence data
    const scan = await prisma.intelligenceScan.create({
      data: {
        shop: setting.shop,
        niche: config.niche || config.lastNiche || 'gym',
        trigger: 'migration',
        status: 'COMPLETED',
        signalCount: latest.signalCount || 0,
        alertCount: latest.alertCount || 0,
        opportunityCount: latest.opportunityCount || 0,
        durationMs: 0,
        alerts: JSON.stringify(latest.alerts || []),
        opportunities: JSON.stringify(latest.opportunities || []),
        crossPlatform: JSON.stringify(latest.crossPlatform || []),
        gaps: JSON.stringify(latest.gaps || []),
        completedAt: new Date(latest.ts || Date.now()),
        startedAt: new Date(latest.ts || Date.now()),
      },
    });

    // Insert signals
    const signals = (latest.topSignals || []).slice(0, 50);
    if (signals.length > 0) {
      await prisma.intelligenceSignal.createMany({
        data: signals.map(s => ({
          shop: setting.shop,
          scanId: scan.id,
          source: s.source || 'unknown',
          keyword: s.keyword || '',
          title: (s.title || '').slice(0, 500),
          body: '',
          url: (s.url || '').slice(0, 500),
          hypeScore: s.hypeScore || 0,
          sentiment: s.sentiment || 0,
          engagement: 0,
          intentScore: 0,
          aiAnalyzed: false,
          raw: '{}',
          signalTs: new Date(s.ts || Date.now()),
        })),
      });
    }

    console.log(`  [ok] ${setting.shop} — migrated ${signals.length} signals`);
    migrated++;

    // Also migrate history entries as additional scan records
    const history = config.intelligenceHistory || [];
    for (const h of history.slice(0, 23)) { // skip first, it's the latest we already migrated
      await prisma.intelligenceScan.create({
        data: {
          shop: setting.shop,
          niche: config.niche || config.lastNiche || 'gym',
          trigger: 'migration',
          status: 'COMPLETED',
          signalCount: h.signals || 0,
          alertCount: h.alerts || 0,
          opportunityCount: h.opportunities || 0,
          durationMs: h.duration || 0,
          completedAt: new Date(h.ts || Date.now()),
          startedAt: new Date(h.ts || Date.now()),
        },
      });
    }
  }

  console.log(`\n[migrate] Done. Migrated: ${migrated}, Skipped: ${skipped}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
