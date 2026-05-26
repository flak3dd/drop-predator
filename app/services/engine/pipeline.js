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

import { negotiateSupplier } from './negotiate.js';
import { getActivePrice } from './price.js';
import { getNicheConfig } from '../../data/products.js';
import { emit, Events, registerDefaultListeners } from '../core/event-bus.js';
import { startRun } from './orchestrator.js';
import './steps/loader.js';
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
  const mergedConfig = { ...settingsConfig, ...config, niche };

  const engineRun = await prisma.engineRun.create({
    data: {
      shop,
      niche,
      status: 'QUEUED',
      phase: 0,
      phaseSub: 'starting…',
      config: JSON.stringify(mergedConfig),
    },
  });

  activePipelines.add(shop);

  startRun(engineRun.id, shop, { admin })
    .catch(err => console.error(`[engine] Pipeline error ${shop}:`, err.message))
    .finally(() => activePipelines.delete(shop));

  return { runId: engineRun.id };
}

export async function stopEngine(shop) {
  activePipelines.delete(shop);
  await prisma.engineRun.updateMany({
    where: { shop, status: { in: ['RUNNING', 'QUEUED'] } },
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

  const stepHistory = (() => { try { return JSON.parse(run.stepHistory || '[]'); } catch { return []; } })();

  return {
    running: run.status === 'RUNNING' || run.status === 'QUEUED',
    status: run.status,
    phase: run.phase,
    phaseSub: run.phaseSub || '',
    currentStep: run.currentStep || '',
    stepHistory,
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

// ── Resume support ────────────────────────────────────────────────────────

export { resumeRun } from './orchestrator.js';
export { STEPS, StepStatus, RunStatus } from './steps/index.js';
