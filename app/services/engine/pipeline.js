/* eslint-disable no-undef */
/**
 * engine/pipeline.js
 *
 * All persistent state lives in the DB (EngineRun + EngineProduct).
 * The in-memory `activePipelines` Set is only a per-invocation guard
 * against double-starts; it is NOT the source-of-truth for status.
 *
 * Status polls (getEngineStatus) always read from DB so they work
 * correctly across Vercel serverless invocations.
 */

import { scoutProducts } from './scout.js';
import { negotiateSupplier } from './negotiate.js';
import { computePricing, getActivePrice } from './price.js';
import { importListings } from './importer.js';
import { getProducts } from '../../data/products.js';
import prisma from '../../db.server.js';

// ─── Per-invocation guard only ─────────────────────────────────────────────
const activePipelines = new Set();

// ─── Helpers ───────────────────────────────────────────────────────────────

function calcAvgMargin(products) {
  if (!products.length) return 0;
  return Math.round(products.reduce((a, p) => a + p.margin, 0) / products.length);
}

/** Map a DB EngineProduct row → the shape the UI/API expects. */
function toUiProduct(p) {
  return {
    id: p.id,
    sourceId: p.sourceId,
    name: p.name,
    cat: p.category,
    score: p.score,
    margin: p.margin,
    price: p.price,
    cost: p.cost,
    landed: p.landedCost,
    velocity: p.velocity,
    trend: p.trend,
    lifecycle: p.lifecycle,
    competition: p.competition,
    supplier: p.supplier,
    supScore: p.supplierScore,
    moq: p.moq,
    discount: p.discount,
    sources: (() => { try { return JSON.parse(p.sources); } catch { return []; } })(),
    searches: p.searches,
    impulse: p.impulse,
    warns: (() => { try { return JSON.parse(p.warnings); } catch { return []; } })(),
    negState: p.negState,
    activePrice: p.activePrice,
    imported: p.imported,
    aiPowered: p.aiNegotiated,
    shopifyProductId: p.shopifyProductId,
    discountImproved: p.discountImproved,
    moqImproved: p.moqImproved,
  };
}

// ─── DB write helpers (non-throwing) ──────────────────────────────────────

async function dbSetPhase(runId, phase, phaseSub) {
  await prisma.engineRun.update({
    where: { id: runId },
    data: { phase, phaseSub: phaseSub || '' },
  }).catch(() => {});
}

let _logFlushTimer = null;
const _pendingLogs = new Map(); // runId → { logs: [], timer }

async function dbLog(runId, tag, msg, cls) {
  if (!_pendingLogs.has(runId)) {
    _pendingLogs.set(runId, { logs: [] });
  }
  const entry = _pendingLogs.get(runId);
  entry.logs.push({ tag, msg, cls: cls || tag.toLowerCase(), ts: Date.now() });

  // Flush when batch is large enough
  if (entry.logs.length >= 10) {
    await flushLogs(runId);
  }
}

async function flushLogs(runId) {
  const entry = _pendingLogs.get(runId);
  if (!entry || entry.logs.length === 0) return;
  const toWrite = entry.logs.splice(0);

  try {
    const run = await prisma.engineRun.findUnique({
      where: { id: runId },
      select: { logs: true },
    });
    const existing = (() => { try { return JSON.parse(run?.logs || '[]'); } catch { return []; } })();
    const combined = [...existing, ...toWrite].slice(-200); // keep last 200
    await prisma.engineRun.update({
      where: { id: runId },
      data: { logs: JSON.stringify(combined) },
    });
  } catch { /* non-critical */ }
}

async function dbIsStopped(runId) {
  const run = await prisma.engineRun.findUnique({
    where: { id: runId },
    select: { status: true },
  }).catch(() => null);
  return !run || run.status === 'STOPPED';
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function getEngineProducts(niche) {
  return getProducts(niche);
}

export async function startEngine(shop, niche, config = {}) {
  await stopEngine(shop);

  const settings = await prisma.setting.findUnique({ where: { shop } });
  const settingsConfig = settings?.engineConfig ? JSON.parse(settings.engineConfig) : {};
  const mergedConfig = { ...settingsConfig, ...config };

  const engineRun = await prisma.engineRun.create({
    data: {
      shop,
      niche,
      status: 'RUNNING',
      phase: 0,
      phaseSub: 'starting…',
      config: JSON.stringify(mergedConfig),
    },
  });

  activePipelines.add(shop);

  // Fire-and-forget: the pipeline continues running in the same
  // Vercel Fluid Compute invocation after the HTTP response is sent.
  runPipeline(engineRun.id, shop, niche, mergedConfig)
    .catch(err => console.error(`[engine] Pipeline error ${shop}:`, err.message))
    .finally(() => activePipelines.delete(shop));

  return { runId: engineRun.id };
}

export async function stopEngine(shop) {
  activePipelines.delete(shop);
  await prisma.engineRun.updateMany({
    where: { shop, status: 'RUNNING' },
    data: { status: 'STOPPED', endedAt: new Date(), phaseSub: 'stopped by user' },
  }).catch(() => {});
}

export async function getEngineStatus(shop) {
  const run = await prisma.engineRun.findFirst({
    where: { shop },
    orderBy: { startedAt: 'desc' },
  });

  if (!run) {
    return {
      running: false, phase: 0, phaseSub: '', products: [], log: [],
      stats: { products: 0, avgMargin: 0, deals: 0, projRevenue: 0, sessionRev: 0 },
    };
  }

  const dbProducts = await prisma.engineProduct.findMany({
    where: { engineRunId: run.id },
    orderBy: { score: 'desc' },
    take: 100,
  });

  const products = dbProducts.map(toUiProduct);
  const logs = (() => { try { return JSON.parse(run.logs || '[]'); } catch { return []; } })();

  return {
    running: run.status === 'RUNNING',
    phase: run.phase,
    phaseSub: run.phaseSub || '',
    niche: run.niche,
    engineRunId: run.id,
    products,
    log: logs.slice(-50),
    stats: {
      products: products.length,
      avgMargin: calcAvgMargin(products),
      deals: run.dealsClosed,
      projRevenue: Math.round(
        products.reduce((a, p) => a + p.velocity * getActivePrice(p), 0),
      ),
      sessionRev: run.sessionRev,
    },
  };
}

export async function negotiateProduct(shop, productId) {
  const product = await prisma.engineProduct.findUnique({ where: { id: productId } });
  if (!product) return null;

  const deal = await negotiateSupplier(toUiProduct(product));

  const finalMoq = deal.moq || product.moq;
  await prisma.engineProduct.update({
    where: { id: productId },
    data: {
      discount: deal.discount,
      landedCost: deal.landed,
      margin: deal.margin,
      moq: finalMoq,
      negState: 5,
      aiNegotiated: deal.aiPowered || false,
      discountImproved: Math.max(0, deal.discount - product.discount),
      moqImproved: Math.max(0, product.moq - finalMoq),
    },
  });

  return { ...toUiProduct(product), ...deal };
}

export async function setPriceMode(shop, productId, mode) {
  const validModes = ['surge', 'undercut', 'psych', 'standard'];
  if (!validModes.includes(mode)) return null;

  const product = await prisma.engineProduct.findUnique({ where: { id: productId } });
  if (!product) return null;

  await prisma.engineProduct.update({
    where: { id: productId },
    data: { activePrice: mode },
  });

  return { ...toUiProduct(product), activePrice: mode };
}

// ─── Pipeline ──────────────────────────────────────────────────────────────

async function runPipeline(runId, shop, niche, config) {
  const {
    scoreThreshold = 65,
    marginFloor = 35,
    moqMax = 100,
    autonomyLevel = 3,
    negotiationEnabled = true,
    pricingEnabled = true,
    importEnabled = false,
    deathPredictor = true,
    surgeEnabled = true,
  } = config;

  const log = (tag, msg, cls) => dbLog(runId, tag, msg, cls);
  const setPhase = (phase, sub) => dbSetPhase(runId, phase, sub);
  const stopped = () => dbIsStopped(runId);

  try {
    // ── Phase 1: Scout ───────────────────────────────────────────────────
    await setPhase(1, 'scanning sources…');
    await log('SCOUT', `Niche: ${niche} — scanning TikTok · AliExpress · Reddit · Google Trends`);

    const raw = await scoutProducts(niche, config, msg => log('SCOUT', msg));

    await setPhase(1, `found ${raw.length} candidates`);
    await log('SCOUT', `${raw.length} raw candidates located`);
    await sleep(300);

    if (await stopped()) return;

    // ── Phase 2: Score + filter ──────────────────────────────────────────
    await setPhase(2, 'scoring & filtering');
    await log('SCOUT', `Margin floor: ${marginFloor}% · Score: ${scoreThreshold} · MOQ: ${moqMax}`);

    const filtered = raw.filter(p => {
      if (p.score < scoreThreshold) return false;
      if (p.margin < marginFloor) return false;
      if (p.moq > moqMax) return false;
      return true;
    });

    await setPhase(2, `${filtered.length}/${raw.length} passed`);
    await log('SCOUT', `${filtered.length} products passed scoring`);

    // Persist to DB
    await persistProducts(runId, shop, filtered);
    await flushLogs(runId);

    if (await stopped()) return;
    await sleep(300);

    // ── Phase 3: Negotiate ───────────────────────────────────────────────
    if (!negotiationEnabled) {
      await log('SYSTEM', 'Negotiation disabled — skipping');
    } else {
      await setPhase(3, `negotiating ${filtered.length} suppliers`);
      await log('NEGOTIATE', 'Starting supplier negotiations…');

      let dealsClosed = 0;
      for (const p of filtered) {
        if (await stopped()) break;
        await setPhase(3, p.supplier);
        await log('NEGOTIATE', `Outreach → ${p.supplier} for "${p.name}"`);

        const deal = await negotiateSupplier(p);
        p.negState = 5;
        p.discount = deal.discount;
        p.landed = deal.landed;
        p.margin = deal.margin;
        if (deal.moq) p.moq = deal.moq;
        p.aiPowered = deal.aiPowered;
        dealsClosed++;

        const badge = deal.aiPowered ? ' [AI]' : '';
        await log('NEGOTIATE', `Deal closed${badge}: ${p.supplier} — ${p.discount}% off, MOQ ${p.moq}`, 'negotiate');

        // Update DB product record
        const dbProd = await prisma.engineProduct.findFirst({
          where: { engineRunId: runId, sourceId: p.id },
        });
        if (dbProd) {
          const finalMoq = deal.moq || dbProd.moq;
          await prisma.engineProduct.update({
            where: { id: dbProd.id },
            data: {
              discount: deal.discount,
              landedCost: deal.landed,
              margin: deal.margin,
              moq: finalMoq,
              negState: 5,
              aiNegotiated: deal.aiPowered || false,
              discountImproved: Math.max(0, deal.discount - dbProd.discount),
              moqImproved: Math.max(0, dbProd.moq - finalMoq),
            },
          });
        }

        await sleep(autonomyLevel >= 4 ? 400 : 900);
      }

      await prisma.engineRun.update({
        where: { id: runId },
        data: { dealsClosed },
      }).catch(() => {});
    }

    if (await stopped()) return;

    // ── Phase 4: Price ───────────────────────────────────────────────────
    if (!pricingEnabled) {
      await log('SYSTEM', 'Pricing disabled — skipping');
    } else {
      await setPhase(4, 'computing prices');
      await log('PRICE', 'Dynamic pricing engine running…');

      for (const p of filtered) {
        p.activePrice = computePricing(p, { surgeEnabled });
        await log('PRICE', `"${p.name}" → ${p.activePrice} mode ($${getActivePrice(p).toFixed(2)})`, 'price');

        const dbProd = await prisma.engineProduct.findFirst({
          where: { engineRunId: runId, sourceId: p.id },
        });
        if (dbProd) {
          await prisma.engineProduct.update({
            where: { id: dbProd.id },
            data: { activePrice: p.activePrice },
          });
        }
      }
    }

    if (await stopped()) return;

    // ── Phase 5: Import ──────────────────────────────────────────────────
    if (!importEnabled) {
      await log('SYSTEM', 'Auto-import disabled — products ready to import manually');
    } else {
      await setPhase(5, `importing ${filtered.length} listings`);
      await log('IMPORT', 'Creating store listings…');

      const importResult = await importListings(filtered);
      for (const r of importResult.results) {
        if (r.ok) {
          await log('IMPORT', `Listed: "${filtered.find(x => x.id === r.id)?.name}"`, 'import');
          const dbProd = await prisma.engineProduct.findFirst({
            where: { engineRunId: runId, sourceId: r.id },
          });
          if (dbProd) {
            await prisma.engineProduct.update({
              where: { id: dbProd.id },
              data: { imported: true, shopifyProductId: r.shopifyId || null },
            });
          }
        } else {
          await log('IMPORT', `Failed: product ${r.id} — ${r.error || r.status}`, 'warn');
        }
      }
    }

    await sleep(300);
    if (await stopped()) return;

    // ── Phase 6: Done ────────────────────────────────────────────────────
    await setPhase(6, `${filtered.length} products ready`);
    await log('SYSTEM', `Pipeline complete. ${filtered.length} products live.`);
    await flushLogs(runId);

    await prisma.engineRun.update({
      where: { id: runId },
      data: { status: 'COMPLETED', endedAt: new Date(), phase: 6 },
    }).catch(() => {});

  } catch (err) {
    await log('ERROR', err.message, 'warn');
    await flushLogs(runId);
    await prisma.engineRun.update({
      where: { id: runId },
      data: { status: 'ERROR', endedAt: new Date(), phaseSub: err.message },
    }).catch(() => {});
  }
}

// ─── Persist scouted products to DB ───────────────────────────────────────

async function persistProducts(runId, shop, products) {
  for (const p of products) {
    try {
      await prisma.engineProduct.upsert({
        where: { engineRunId_sourceId: { engineRunId: runId, sourceId: p.id } },
        update: {
          score: p.score,
          margin: p.margin,
          discount: p.discount ?? 0,
          landedCost: p.landed ?? 0,
          moq: p.moq ?? 0,
          activePrice: p.activePrice || 'standard',
          aiNegotiated: p.aiPowered || false,
        },
        create: {
          engineRunId: runId,
          shop,
          sourceId: p.id,
          name: p.name,
          category: p.cat || '',
          score: p.score,
          margin: p.margin,
          price: p.price ?? 0,
          cost: p.cost ?? 0,
          landedCost: p.landed ?? 0,
          velocity: p.velocity ?? 0,
          trend: p.trend ?? 0,
          lifecycle: p.lifecycle || 'mature',
          competition: p.competition || 'medium',
          supplier: p.supplier || '',
          supplierScore: p.supScore ?? 0,
          moq: p.moq ?? 0,
          discount: p.discount ?? 0,
          sources: JSON.stringify(p.sources || []),
          searches: p.searches ?? 0,
          impulse: p.impulse ?? 0,
          warnings: JSON.stringify(p.warns || []),
          negState: p.negState ?? 0,
          activePrice: p.activePrice || 'standard',
          aiNegotiated: p.aiPowered || false,
        },
      });
    } catch (err) {
      console.error('[engine] persist failed:', p.id, err.message);
    }
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
