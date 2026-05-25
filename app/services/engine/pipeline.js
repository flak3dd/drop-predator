/* eslint-disable no-undef */
import { scoutProducts } from './scout.js';
import { negotiateSupplier } from './negotiate.js';
import { computePricing, getActivePrice } from './price.js';
import { importListings } from './importer.js';
import { getProducts } from '../../../engine/data/products.js';
import prisma from '../../db.server.js';

const runs = new Map();

function calcAvgMargin(products) {
  if (!products.length) return 0;
  return Math.round(products.reduce((a, p) => a + p.margin, 0) / products.length);
}

export function getEngineRun(shop) {
  return runs.get(shop) || null;
}

export function getEngineProducts(niche) {
  return getProducts(niche);
}

export function stopEngine(shop) {
  const run = runs.get(shop);
  if (!run) return;
  run.running = false;
  run.intervals.forEach(clearInterval);
  run.intervals = [];

  // Update database record
  if (run.engineRunId) {
    prisma.engineRun.update({
      where: { id: run.engineRunId },
      data: {
        status: 'STOPPED',
        endedAt: new Date(),
        phase: run.phase,
      },
    }).catch(() => {}); // Non-critical
  }
}

export async function startEngine(shop, niche, config = {}) {
  stopEngine(shop);

  // Load settings and merge with config
  const settings = await prisma.setting.findUnique({ where: { shop } });
  const settingsConfig = settings?.engineConfig ? JSON.parse(settings.engineConfig) : {};
  const mergedConfig = { ...settingsConfig, ...config };

  // Create database record for engine run
  const engineRun = await prisma.engineRun.create({
    data: {
      shop,
      niche,
      status: 'RUNNING',
      phase: 0,
      config: JSON.stringify(mergedConfig),
    },
  });

  const run = {
    id: engineRun.id,
    shop,
    niche,
    running: true,
    phase: 0,
    products: [],
    dealsClosed: 0,
    sessionRev: 0,
    log: [],
    intervals: [],
    startedAt: Date.now(),
    config: mergedConfig,
    engineRunId: engineRun.id,
  };

  runs.set(shop, run);

  runPipeline(run).catch(err => {
    addLog(run, 'ERROR', err.message, 'warn');
  });

  return run;
}

function addLog(run, tag, msg, cls) {
  run.log.push({ tag, msg, cls: cls || tag.toLowerCase(), ts: Date.now() });
  if (run.log.length > 200) run.log = run.log.slice(-150);
}

async function runPipeline(run) {
  const { niche, config } = run;
  const {
    scoreThreshold = 65, marginFloor = 35, moqMax = 100,
    autonomyLevel = 3, negotiationEnabled = true, pricingEnabled = true,
    importEnabled = false, deathPredictor = true, surgeEnabled = true,
  } = config;

  const log = (tag, msg, cls) => addLog(run, tag, msg, cls);
  const setPhase = (phase, sub) => { run.phase = phase; run.phaseSub = sub; };

  // Phase 1: Scout
  setPhase(1, 'scanning sources…');
  log('SCOUT', `Niche: ${niche} — scanning TikTok · AliExpress · Reddit · Google Trends`);

  const raw = await scoutProducts(niche, config, (msg) => log('SCOUT', msg));
  run.products = raw;

  if (!run.running) return;
  setPhase(1, `found ${raw.length} candidates`);
  log('SCOUT', `${raw.length} raw candidates located`);

  await sleep(400);

  // Phase 2: Score + filter
  setPhase(2, 'scoring & filtering');
  log('SCOUT', `Margin floor: ${marginFloor}% · Score threshold: ${scoreThreshold} · Max MOQ: ${moqMax}`);

  const preFlt = run.products.length;
  run.products = run.products.filter(p => {
    if (p.score < scoreThreshold) { log('SCOUT', `⊘ ${p.name} — score ${p.score} < ${scoreThreshold}`); return false; }
    if (p.margin < marginFloor) { log('SCOUT', `⊘ ${p.name} — margin ${p.margin}% < ${marginFloor}%`); return false; }
    if (p.moq > moqMax) { log('SCOUT', `⊘ ${p.name} — MOQ ${p.moq} > ${moqMax}`); return false; }
    return true;
  });

  const passed = run.products.length;
  setPhase(2, `${passed}/${preFlt} passed`);
  log('SCOUT', `${passed} products passed scoring`);

  // Persist products to database
  await persistProducts(run, run.products);

  if (!run.running) return;
  await sleep(400);

  // Phase 3: Negotiate
  if (!negotiationEnabled) {
    log('SYSTEM', 'Negotiation disabled — skipping');
  } else {
    setPhase(3, `negotiating ${passed} suppliers`);
    log('NEGOTIATE', 'Starting supplier negotiations…');

    for (const p of run.products) {
      if (!run.running) break;
      setPhase(3, p.supplier);
      log('NEGOTIATE', `Outreach → ${p.supplier} for "${p.name}"`);

      const deal = await negotiateSupplier(p);
      p.negState = 5;
      p.discount = deal.discount;
      p.landed = deal.landed;
      p.margin = deal.margin;
      if (deal.moq) p.moq = deal.moq;
      run.dealsClosed++;

      const badge = deal.aiPowered ? ' [AI]' : '';
      log('NEGOTIATE', `Deal closed${badge}: ${p.supplier} — ${p.discount}% off, MOQ ${p.moq}`, 'negotiate');

      await sleep(autonomyLevel >= 4 ? 500 : 1100);
    }
  }

  if (!run.running) return;

  // Phase 4: Price
  if (!pricingEnabled) {
    log('SYSTEM', 'Pricing disabled — skipping');
  } else {
    setPhase(4, 'computing prices');
    log('PRICE', 'Dynamic pricing engine running…');

    run.products.forEach(p => {
      p.activePrice = computePricing(p, { surgeEnabled });
      log('PRICE', `"${p.name}" → ${p.activePrice} mode ($${getActivePrice(p).toFixed(2)})`, 'price');
    });
  }

  if (!run.running) return;

  // Phase 5: Import
  if (!importEnabled) {
    log('SYSTEM', 'Auto-import disabled — skipping');
  } else {
    setPhase(5, `importing ${run.products.length} listings`);
    log('IMPORT', 'Creating store listings…');

    const importResult = await importListings(run.products);
    importResult.results.forEach(r => {
      if (r.ok) {
        const p = run.products.find(x => x.id === r.id);
        if (p) p.imported = true;
        log('IMPORT', `Listed: "${p?.name}"`, 'import');
      } else {
        log('IMPORT', `Failed: product ${r.id} — ${r.error || r.status}`, 'warn');
      }
    });
  }

  await sleep(400);
  if (!run.running) return;

  // Phase 6: Monitor
  setPhase(6, `monitoring ${run.products.length} products`);
  log('SYSTEM', 'All products live. Monitoring active.');

  const t1 = setInterval(() => {
    if (!run.running) { clearInterval(t1); return; }
    run.products.forEach(p => {
      p.velocity = Math.max(10, p.velocity + Math.floor(Math.random() * 12 - 5));
    });
  }, 2500);

  const t2 = deathPredictor ? setInterval(() => {
    if (!run.running) { clearInterval(t2); return; }
    run.products.forEach(p => {
      if (p.trend < 0 && Math.random() < 0.15) {
        log('WARN', `Death signal: "${p.name}" — trend ${p.trend}%, consider killing ads`, 'warn');
      }
    });
  }, 8000) : null;

  const t3 = setInterval(() => {
    if (!run.running) { clearInterval(t3); return; }
    run.sessionRev += Math.floor(Math.random() * 80 + 20);
  }, 1500);

  run.intervals = [t1, t3, ...(t2 ? [t2] : [])];
}

export function negotiateProduct(shop, productId) {
  const run = runs.get(shop);
  if (!run) return null;
  return run.products.find(p => p.id === productId) || null;
}

export function setPriceMode(shop, productId, mode) {
  const run = runs.get(shop);
  if (!run) return null;
  const product = run.products.find(p => p.id === productId);
  if (!product) return null;
  const validModes = ['surge', 'undercut', 'psych', 'standard'];
  if (!validModes.includes(mode)) return null;
  product.activePrice = mode;
  return product;
}

export function getEngineStatus(shop) {
  const run = runs.get(shop);
  if (!run) {
    return { running: false, phase: 0, products: [], log: [], stats: { products: 0, avgMargin: 0, deals: 0, projRevenue: 0, sessionRev: 0 } };
  }
  return {
    running: run.running,
    phase: run.phase,
    phaseSub: run.phaseSub || '',
    niche: run.niche,
    products: run.products,
    log: run.log.slice(-50),
    stats: {
      products: run.products.length,
      avgMargin: calcAvgMargin(run.products),
      deals: run.dealsClosed,
      projRevenue: Math.round(run.products.reduce((a, p) => a + p.velocity * getActivePrice(p), 0)),
      sessionRev: run.sessionRev,
    },
  };
}

async function persistProducts(run, products) {
  if (!run.engineRunId) return;

  for (const product of products) {
    try {
      await prisma.engineProduct.upsert({
        where: { sourceId: product.id },
        update: {
          score: product.score,
          margin: product.margin,
          discount: product.discount,
          landedCost: product.landed,
          moq: product.moq,
          activePrice: product.activePrice,
          aiNegotiated: product.aiPowered || false,
          updatedAt: new Date(),
        },
        create: {
          engineRunId: run.engineRunId,
          shop: run.shop,
          sourceId: product.id,
          name: product.name,
          category: product.cat,
          score: product.score,
          margin: product.margin,
          price: product.price,
          cost: product.cost,
          landedCost: product.landed,
          velocity: product.velocity,
          trend: product.trend,
          lifecycle: product.lifecycle,
          competition: product.competition,
          supplier: product.supplier,
          supplierScore: product.supScore,
          moq: product.moq,
          discount: product.discount,
          sources: JSON.stringify(product.sources || []),
          searches: product.searches,
          impulse: product.impulse,
          warnings: JSON.stringify(product.warns || []),
          negState: product.negState,
          activePrice: product.activePrice,
          aiNegotiated: product.aiPowered || false,
        },
      });
    } catch (err) {
      // Non-critical, log but continue
      console.error('Failed to persist product:', product.id, err.message);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
