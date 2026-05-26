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
import { negotiateSupplier, algorithmicNegotiate } from './negotiate.js';
import { computePricing, computePricingWithCompetitors, getActivePrice } from './price.js';
import { importListings } from './importer.js';
import { enrichWithBrandResearch } from './brand-research.js';
import { getNicheConfig } from '../../data/products.js';
import { runRiskChecks, autoStopEngine } from './risk-guard.js';
import { getCompetitorIntel } from './competitor-price.js';
import { publish, emit, Events, registerDefaultListeners } from '../core/event-bus.js';
import { checkBudget, flushCost, logCostSummary, clearRunAccumulator } from '../ai/cost-tracker.js';
import { allBreakerStatus } from '../circuit-breaker.js';
import prisma from '../../db.server.js';

// Register default system listeners once at module load
registerDefaultListeners();

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
    seoTitle: p.seoTitle || null,
    brandKeywords: (() => { try { return JSON.parse(p.brandKeywords || '[]'); } catch { return []; } })(),
    aliProductId: p.aliProductId || null,
  };
}

// ─── DB write helpers (non-throwing) ──────────────────────────────────────

async function dbSetPhase(runId, phase, phaseSub) {
  await prisma.engineRun.update({
    where: { id: runId },
    data: { phase, phaseSub: phaseSub || '' },
  }).catch(() => {});
}

const _pendingLogs = new Map(); // runId → { logs: [] }

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

/**
 * Returns niche configuration metadata (keywords, subreddits, label).
 * Actual products are discovered live during pipeline execution — CJ Dropshipping
 * and AliExpress are the primary sources, static fallback only if all APIs fail.
 */
export async function getEngineProducts(niche) {
  const conf = getNicheConfig(niche);
  return {
    niche,
    label: conf.label,
    keywords: conf.keywords,
    subreddits: conf.redditSubs,
    note: 'Run the engine to fetch live products from CJ Dropshipping and AliExpress.',
    products: [],
  };
}

/**
 * Start the engine pipeline.
 * Pass `admin` (Shopify GraphQL client from authenticate.admin) to enable
 * auto-import in Phase 5 when `importEnabled: true` is set in config.
 */
export async function startEngine(shop, niche, config = {}, admin = null) {
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

  emit(Events.ENGINE_STARTED, { runId: engineRun.id, shop, niche });

  // Fire-and-forget: the pipeline continues running in the same
  // Vercel Fluid Compute invocation after the HTTP response is sent.
  runPipeline(engineRun.id, shop, niche, mergedConfig, admin)
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

  const brandResearch = (() => { try { return JSON.parse(run.brandResearch || '{}'); } catch { return {}; } })();

  return {
    running: run.status === 'RUNNING',
    phase: run.phase,
    phaseSub: run.phaseSub || '',
    niche: run.niche,
    engineRunId: run.id,
    products,
    brandResearch,
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

async function runPipeline(runId, shop, niche, config, admin = null) {
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
    await log('SCOUT', `Niche: ${niche} — sourcing from CJ Dropshipping · AliExpress · Reddit · Google Trends`);

    const raw = await scoutProducts(niche, config, msg => log('SCOUT', msg));

    await setPhase(1, `found ${raw.length} candidates`);
    await log('SCOUT', `${raw.length} raw candidates located`);

    // ── Phase 1b: Brand Research enrichment (ADK / Gemini) ──────────────
    // Adds SEO-optimised titles (seoTitle field) and extracts keywords +
    // market insights. Skipped gracefully when service is not running.
    let brandKeywords = [];
    let brandInsights = {};
    if (raw.length > 0 && config.brandResearch !== false) {
      const { keywords, insights, enrichedProducts } = await enrichWithBrandResearch(
        niche, raw, msg => log('BRAND', msg),
      );
      // enrichedProducts may be the same array reference as raw when the service
      // is offline — copy before clearing to avoid emptying both at once.
      const enrichedCopy = [...enrichedProducts];
      raw.length = 0;
      raw.push(...enrichedCopy);
      brandKeywords = keywords;
      brandInsights = insights;

      if (keywords.length || Object.keys(insights).length) {
        await prisma.engineRun.update({
          where: { id: runId },
          data: { brandResearch: JSON.stringify({ keywords, insights }) },
        }).catch(() => {});
      }
    }

    await sleep(300);

    if (await stopped()) return;

    // ── Phase 1c: Risk checks ────────────────────────────────────────────
    const riskReport = await runRiskChecks(shop, admin);
    if (riskReport.warnings.length) {
      for (const w of riskReport.warnings) await log('RISK', `⚠️  ${w}`, 'warn');
    }
    if (!riskReport.ok) {
      for (const b of riskReport.blockers) await log('RISK', `🛑 BLOCKED: ${b}`, 'warn');
      await autoStopEngine(shop, riskReport.blockers[0]);
      return;
    }

    // ── Phase 2: Score + filter ──────────────────────────────────────────
    await setPhase(2, 'scoring & filtering');
    await log('SCOUT', `Margin floor: ${marginFloor}% · Score: ${scoreThreshold} · MOQ: ${moqMax}`);

    const filtered = raw
      .filter(p => {
        if (p.score < scoreThreshold) return false;
        if (p.margin < marginFloor) return false;
        if (p.moq > moqMax) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score); // highest score first — important for AI tiering

    await setPhase(2, `${filtered.length}/${raw.length} passed`);
    await log('SCOUT', `${filtered.length} products passed scoring`);

    emit(Events.ENGINE_PRODUCTS_SCORED, { runId, shop, passed: filtered.length, total: raw.length });

    // Persist to DB
    await persistProducts(runId, shop, filtered);
    await flushLogs(runId);

    if (await stopped()) return;
    await sleep(300);

    // ── Phase 3: Negotiate (tiered — AI for top 10%, algorithmic for rest) ───
    if (!negotiationEnabled) {
      await log('SYSTEM', 'Negotiation disabled — skipping');
    } else {
      await setPhase(3, `negotiating ${filtered.length} suppliers`);

      // ── Token tiering: only burn AI on the best candidates ───────────
      // Top 10% (floor 1, cap 8) → full AI negotiation
      // Bottom 90% → fast algorithmic negotiation (no token spend)
      const aiTierCount = Math.min(8, Math.max(1, Math.round(filtered.length * 0.10)));
      await log('NEGOTIATE', `AI-negotiate top ${aiTierCount}/${filtered.length} candidates — rest use algorithmic`);

      let dealsClosed = 0;
      for (let i = 0; i < filtered.length; i++) {
        const p = filtered[i];
        if (await stopped()) break;

        const useAI = i < aiTierCount;
        await setPhase(3, p.supplier);

        let deal;
        if (useAI) {
          await log('NEGOTIATE', `[AI] Outreach → ${p.supplier} for "${p.name}"`);
          deal = await negotiateSupplier(p); // full AI path
        } else {
          // Algorithmic — no AI API calls
          deal = algorithmicNegotiate(p);
          await log('NEGOTIATE', `[algo] ${p.supplier} — ${deal.discount}% off`, 'negotiate');
        }

        p.negState = 5;
        p.discount = deal.discount;
        p.landed   = deal.landed;
        p.margin   = deal.margin;
        if (deal.moq) p.moq = deal.moq;
        p.aiPowered = deal.aiPowered;
        dealsClosed++;

        if (useAI) {
          const badge = deal.aiPowered ? ' [AI]' : ' [fallback]';
          await log('NEGOTIATE', `Deal closed${badge}: ${p.supplier} — ${p.discount}% off, MOQ ${p.moq}`, 'negotiate');
        }

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

        await sleep(useAI && autonomyLevel >= 4 ? 400 : 150);
      }

      await prisma.engineRun.update({
        where: { id: runId },
        data: { dealsClosed },
      }).catch(() => {});

      // ── Budget check after AI-heavy negotiate phase ─────────────────
      const budgetCheck = await checkBudget(runId);
      await flushCost(runId);
      logCostSummary(runId, (msg) => log('COST', msg));
      if (!budgetCheck.ok) {
        await log('COST', `🛑 AI budget exceeded: $${budgetCheck.spent.toFixed(4)} > $${budgetCheck.budget} — stopping`, 'warn');
        emit(Events.ENGINE_BUDGET_EXCEEDED, { runId, shop, spent: budgetCheck.spent, budget: budgetCheck.budget });
        await autoStopEngine(shop, `AI budget exceeded ($${budgetCheck.spent.toFixed(4)} > $${budgetCheck.budget})`);
        return;
      }
    }

    if (await stopped()) return;

    // ── Phase 4: Price (competitor-benchmarked where possible) ──────────
    if (!pricingEnabled) {
      await log('SYSTEM', 'Pricing disabled — skipping');
    } else {
      await setPhase(4, 'computing prices');
      const hasSerpApi = !!process.env.SERPAPI_KEY;
      await log('PRICE', hasSerpApi
        ? 'Competitor-benchmarked dynamic pricing running…'
        : 'Dynamic pricing running (set SERPAPI_KEY for live competitor benchmarking)…',
      );

      for (const p of filtered) {
        let competitorIntel = null;
        let finalPrice      = p.price;

        if (hasSerpApi) {
          try {
            competitorIntel = await getCompetitorIntel(p.name, p.cat, p.cost);
          } catch { /* non-fatal */ }
        }

        const pricingResult = computePricingWithCompetitors(p, competitorIntel, { surgeEnabled });
        p.activePrice      = pricingResult.mode;
        p.competitorPrice  = pricingResult.price;
        finalPrice         = pricingResult.price;

        const compNote = pricingResult.competitorAvg
          ? ` (comp avg $${pricingResult.competitorAvg.toFixed(2)})`
          : '';
        await log('PRICE', `"${p.name}" → ${p.activePrice} $${finalPrice.toFixed(2)}${compNote}`, 'price');

        const dbProd = await prisma.engineProduct.findFirst({
          where: { engineRunId: runId, sourceId: p.id },
        });
        if (dbProd) {
          await prisma.engineProduct.update({
            where: { id: dbProd.id },
            data: {
              activePrice: p.activePrice,
              price:       finalPrice, // update to competitor-benchmarked price
            },
          });
        }
      }
    }

    if (await stopped()) return;

    // ── Phase 5: Import ──────────────────────────────────────────────────
    if (!importEnabled) {
      await log('SYSTEM', 'Auto-import disabled — products ready to import manually');
    } else if (!admin) {
      await log('SYSTEM', 'Auto-import skipped — no Shopify admin context in pipeline. Use the Import button in the UI to push products to your store.');
    } else {
      await setPhase(5, `importing ${filtered.length} listings`);
      await log('IMPORT', 'Creating store listings…');

      const importResult = await importListings(filtered, admin);
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

    const finalBudget = await checkBudget(runId);
    await flushCost(runId);
    logCostSummary(runId, (msg) => log('COST', msg));
    clearRunAccumulator(runId);

    // Log circuit breaker status so operators can see service health
    const cbStatus = allBreakerStatus().filter(b => b.state !== 'CLOSED');
    if (cbStatus.length) {
      await log('SYSTEM', `Circuit breakers: ${cbStatus.map(b => `${b.name}=${b.state}`).join(', ')}`);
    }

    await log('SYSTEM', `Pipeline complete. ${filtered.length} products live. AI spend: $${finalBudget.spent.toFixed(4)}`);
    await flushLogs(runId);

    const stats = {
      products:   filtered.length,
      avgMargin:  calcAvgMargin(filtered),
      dealsClosed: filtered.filter(p => p.negState === 5).length,
      aiSpend:    finalBudget.spent,
    };

    await prisma.engineRun.update({
      where: { id: runId },
      data:  { status: 'COMPLETED', endedAt: new Date(), phase: 6 },
    }).catch(() => {});

    emit(Events.ENGINE_COMPLETE, { runId, shop, stats });

  } catch (err) {
    await log('ERROR', err.message, 'warn');
    await flushLogs(runId);
    await flushCost(runId).catch(() => {});
    clearRunAccumulator(runId);
    emit(Events.ENGINE_ERROR, { runId, shop, error: err.message });
    await prisma.engineRun.update({
      where: { id: runId },
      data:  { status: 'ERROR', endedAt: new Date(), phaseSub: err.message },
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
          seoTitle: p.seoTitle || null,
          brandKeywords: JSON.stringify(p.brandKeywords || []),
          aliProductId: p.aliProductId || p._productId || null,
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
