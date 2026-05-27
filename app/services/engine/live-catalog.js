import { supplierRouter } from '../suppliers/index.js';
import cache from './catalog-cache.js';
import { fullSentimentScan } from '../intelligence/sentiment.js';
import { runDiscovery } from '../intelligence/discovery.js';
import { getNicheConfig } from '../../data/products.js';

const SCRAPE_TTL = 60 * 60 * 1000;

// ── Legacy direct fetch exports (kept for backward compat, now delegate to supplierRouter) ──
export async function fetchFromCJ(keywords, log) {
  const cj = supplierRouter._suppliers.find(s => s.name === 'CJ Dropshipping');
  return cj ? cj.search(keywords, { log }) : [];
}

export async function fetchFromAliExpress(keywords, log) {
  const ali = supplierRouter._suppliers.find(s => s.name === 'AliExpress');
  return ali ? ali.search(keywords, { log }) : [];
}

export async function scrapeAliExpress(keywords, log) {
  // Disabled by default — violates AliExpress ToS and produces estimated (not real DS) prices.
  // Set ENABLE_SCRAPE_FALLBACK=1 only for local development/testing.
  if (!process.env.ENABLE_SCRAPE_FALLBACK) {
    log('AliExpress HTML scraping is disabled (set ENABLE_SCRAPE_FALLBACK=1 to enable for dev).');
    return [];
  }
  const allProducts = [];
  const USER_AGENTS = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  ];

  for (const kw of keywords.slice(0, 3)) {
    const cacheKey = `scrape:${kw}`;
    const cached = cache.get(cacheKey);
    if (cached) { log(`Scrape cache hit: "${kw}" (${cached.length} products)`); allProducts.push(...cached); continue; }

    try {
      log(`Scraping AliExpress: "${kw}"…`);
      const slug = encodeURIComponent(kw).replace(/%20/g, '-');
      const url = `https://www.aliexpress.com/w/wholesale-${slug}.html`;
      const headers = { 'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)], 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' };

      const res = await fetch(url, { headers });
      if (!res.ok) { log(`Scrape "${kw}" returned ${res.status}`); continue; }

      const html = await res.text();
      const items = parseAliExpressHTML(html, kw);

      cache.set(cacheKey, items, SCRAPE_TTL);
      allProducts.push(...items);
      log(`Scrape "${kw}": ${items.length} products`);
      await sleep(3000);
    } catch (err) { log(`Scrape "${kw}" failed: ${err.message}`); }
  }

  return allProducts;
}

function parseAliExpressHTML(html, keyword) {
  const items = [];
  const patterns = [/window\._dida_config_\s*=\s*({.*?});/s, /"itemList"\s*:\s*(\[.*?\])/s, /"items"\s*:\s*(\[.*?\])/s];
  let products = null;
  for (const pat of patterns) {
    const match = html.match(pat);
    if (match) {
      try { products = JSON.parse(match[1]); if (Array.isArray(products)) break; products = null; } catch { /* next */ }
    }
  }

  if (!products) return items;

  for (const p of products.slice(0, 20)) {
    const title = p.title || p.name || p.productTitle || '';
    const priceVal = parseFloat(p.price || p.salePrice || p.minPrice || 0);
    if (!title || !priceVal) continue;
    items.push({
      _source: 'scrape', name: title, cat: keyword,
      price: parseFloat((priceVal * 2.5).toFixed(2)), cost: parseFloat((priceVal * 0.35).toFixed(2)),
      supplier: p.store?.name || p.sellerName || 'AliExpress Seller', supScore: 70, moq: 1,
      images: p.image || p.imgUrl || '', orders: parseInt(p.orders || p.tradeCount || 0) || 0, _totalResults: 0,
    });
  }
  return items;
}

function matchSignals(productName, signals) {
  const words = productName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  return signals.filter(s => {
    const text = `${s.title} ${s.body}`.toLowerCase();
    return words.some(w => text.includes(w));
  });
}

function mapToSchema(raw, signals) {
  const id = `${raw._source[0].toUpperCase()}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const cost = raw.cost || 0;
  // DS API products (from normalizeDsListItem) supply their own landed estimate.
  // CJ/Affiliate items don't set raw.landed, so they still use the 1.18 multiplier.
  const landed = raw.landed
    ? parseFloat(raw.landed.toFixed(2))
    : parseFloat((cost * 1.18).toFixed(2));
  const price = raw.price || parseFloat((landed * 2.5).toFixed(2)) || 19.99;
  const margin = price > 0 ? Math.round((price - landed) / price * 100) : 40;

  const matched = matchSignals(raw.name, signals);
  // When no signals match, seed from supplier score (real supplier validation data)
  // rather than a hardcoded 30. DS products with supScore=91 → avgHype≈64.
  const avgHype = matched.length
    ? matched.reduce((a, s) => a + s.hypeScore, 0) / matched.length
    : Math.round((raw.supScore || 50) * 0.7);

  const trendsSignal = matched.find(s => s.source === 'google-trends');
  const trendVelocity = trendsSignal?.raw?.velocity || 0;
  const trend = Math.max(-50, Math.min(50, Math.round(trendVelocity)));
  const lifecycle = trend > 25 ? 'viral' : trend > 5 ? 'growing' : trend > -5 ? 'peak' : trend > -15 ? 'mature' : 'dying';

  const resultCount = raw._totalResults || 0;
  const competition = resultCount > 500 ? 'high' : resultCount > 100 ? 'medium' : 'low';

  const priceImpulse = Math.max(0, Math.min(100, Math.round(100 - price * 1.5)));
  const impulse = Math.min(100, Math.round(avgHype * 0.6 + priceImpulse * 0.4));
  const searches = trendsSignal ? trendsSignal.score * 150 : 0;
  // Do NOT apply a minimum floor — no orders + no trends data should produce velocity=0,
  // not a fake 10. Projected revenue will be honest rather than inflated.
  const velocity = raw.orders > 0
    ? Math.round(raw.orders / 30 * 12)
    : Math.round(searches * 0.04);

  const score = Math.min(100, Math.max(0, Math.round(margin * 0.3 + avgHype * 0.3 + priceImpulse * 0.2 + (raw.supScore || 75) * 0.2)));

  const warns = [];
  if (competition === 'high') warns.push('high competition');
  if (trend < -5) warns.push('declining trend');
  if (margin < 35) warns.push('thin margin');

  const sources = [raw._source === 'cj' ? 'CJ Dropshipping' : 'AliExpress'];
  matched.forEach(s => {
    const src = s.source === 'reddit' ? 'Reddit' : s.source === 'google-trends' ? 'Google Trends' : s.source === 'tiktok' ? 'TikTok' : null;
    if (src && !sources.includes(src)) sources.push(src);
  });

  return {
    id, name: raw.name, cat: raw.cat, score, margin, price, cost, landed,
    velocity, trend, lifecycle, competition, supplier: raw.supplier,
    supScore: raw.supScore || 75, moq: raw.moq || 10, discount: 0, sources,
    searches, impulse, warns, imported: false, negState: 0, activePrice: 'standard',
    // Pass DS product ID through so auto-ordering webhook can find the AliExpress product
    aliProductId: raw.aliProductId || raw._productId || null,
  };
}

function discoveryToSchema(disc, signals) {
  const id = disc.id || `D${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  // null (template discovery) and 0 (legacy sentinel) both mean "unknown price"
  const price = (disc.estimatedPrice != null && disc.estimatedPrice > 0)
    ? disc.estimatedPrice
    : 29.99;
  const margin = disc.estimatedMargin || 40;
  const cost = parseFloat((price * (1 - margin / 100) / 1.18).toFixed(2));
  const landed = parseFloat((cost * 1.18).toFixed(2));

  const matched = matchSignals(disc.name, signals);
  const avgHype = matched.length ? matched.reduce((a, s) => a + s.hypeScore, 0) / matched.length : disc.signalStrength || 50;
  const demand = disc.estimatedDemand || 'medium';
  const velocity = demand === 'viral' ? 400 : demand === 'high' ? 250 : demand === 'medium' ? 120 : 50;

  const priceImpulse = Math.max(0, Math.min(100, Math.round(100 - price * 1.5)));
  const score = Math.min(100, Math.max(0, Math.round(margin * 0.3 + avgHype * 0.3 + priceImpulse * 0.2 + 75 * 0.2)));

  return {
    id, name: disc.name, cat: disc.category || 'Discovery', score, margin, price, cost, landed,
    velocity, trend: demand === 'viral' ? 30 : demand === 'high' ? 15 : 5,
    lifecycle: demand === 'viral' ? 'viral' : 'growing',
    competition: disc.riskLevel === 'high' ? 'high' : disc.riskLevel === 'medium' ? 'medium' : 'low',
    supplier: 'To be sourced', supScore: 70, moq: 10, discount: 0, sources: ['AI Discovery'],
    searches: 0, impulse: Math.min(100, Math.round(avgHype * 0.6 + priceImpulse * 0.4)),
    warns: disc.riskLevel === 'high' ? ['high risk'] : [], imported: false, negState: 0, activePrice: 'standard',
  };
}

function deduplicateProducts(products) {
  const seen = new Map();
  return products.filter(p => {
    const key = p.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (seen.has(key)) return false;
    seen.set(key, true);
    return true;
  });
}

export async function fetchLiveProducts(niche, config, log) {
  const nicheConf = getNicheConfig(niche);
  const keywords = nicheConf.keywords || [niche];

  // ── Route through supplier router (parallel, health-aware, circuit-broken) ──
  let rawProducts;
  try {
    rawProducts = await supplierRouter.search(keywords, { log });
  } catch (err) {
    throw new Error(`${err.message} — configure CJ_EMAIL+CJ_PASSWORD, ALI_APP_KEY+ALI_APP_SECRET, or SERPAPI_KEY`);
  }

  if (!rawProducts.length) {
    throw new Error(
      `No live products found for niche "${niche}". ` +
      'Configure CJ_EMAIL + CJ_PASSWORD (CJ Dropshipping), ' +
      'ALI_APP_KEY + ALI_APP_SECRET (AliExpress DS), or ' +
      'SERPAPI_KEY (1688/Alibaba factory sourcing).',
    );
  }

  rawProducts = deduplicateProducts(rawProducts);

  log('Running sentiment scan…');
  let signals = [];
  try {
    signals = await fullSentimentScan({
      subreddits: nicheConf.redditSubs || [], keywords,
      enableReddit: true, enableHN: false, enableTrends: true, enableTikTok: false,
      enableAiAnalysis: !!process.env.ANTHROPIC_API_KEY,
    }, (src, count) => log(`Sentiment: ${src} → ${count} signals`));
    log(`Sentiment scan complete: ${signals.length} total signals`);
  } catch (err) { log(`Sentiment scan failed (${err.message})`); }

  let products = rawProducts.map(raw => mapToSchema(raw, signals));

  if (config.enableDiscovery !== false && signals.length > 0) {
    try {
      // Pass live products as context so AI doesn't re-discover what we already found
      const disc = await runDiscovery(signals, niche, products, { enableAi: !!process.env.ANTHROPIC_API_KEY });
      if (disc.discoveries.length) {
        const discovered = disc.discoveries.slice(0, 3).map(d => discoveryToSchema(d, signals));
        products = products.concat(discovered);
        log(`Discovery: added ${discovered.length} AI-discovered products`);
      }
    } catch (err) { log(`Discovery skipped (${err.message})`); }
  }

  products.sort((a, b) => b.score - a.score);
  return products.slice(0, 12);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
