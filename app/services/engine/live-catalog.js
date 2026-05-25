/* eslint-disable no-undef */
import crypto from 'crypto';
import cache from './catalog-cache.js';
import { fullSentimentScan } from './sentiment.js';
import { runDiscovery } from './discovery.js';
import { getProducts, getNicheConfig } from '../../../engine/data/products.js';

const SCRAPE_TTL = 60 * 60 * 1000;
const API_TTL    = 30 * 60 * 1000;

let cjToken = null;
let cjTokenExpiry = 0;

async function getCJToken() {
  if (cjToken && Date.now() < cjTokenExpiry) return cjToken;

  const res = await fetch('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.CJ_EMAIL, password: process.env.CJ_PASSWORD }),
  });

  if (!res.ok) throw new Error(`CJ auth failed: ${res.status}`);
  const data = await res.json();
  if (!data.data?.accessToken) throw new Error('CJ auth: no token in response');

  cjToken = data.data.accessToken;
  cjTokenExpiry = Date.now() + 14 * 24 * 60 * 60 * 1000;
  return cjToken;
}

export async function fetchFromCJ(keywords, log) {
  if (!process.env.CJ_EMAIL || !process.env.CJ_PASSWORD) return [];
  const token = await getCJToken();
  const allProducts = [];

  for (const kw of keywords.slice(0, 4)) {
    const cacheKey = `cj:${kw}`;
    const cached = cache.get(cacheKey);
    if (cached) { log(`CJ cache hit: "${kw}" (${cached.length} products)`); allProducts.push(...cached); continue; }

    try {
      log(`CJ search: "${kw}"…`);
      const url = new URL('https://developers.cjdropshipping.com/api2.0/v1/product/list');
      url.searchParams.set('productNameEn', kw);
      url.searchParams.set('pageNum', '1');
      url.searchParams.set('pageSize', '20');

      const res = await fetch(url.toString(), { headers: { 'CJ-Access-Token': token } });
      if (!res.ok) { log(`CJ "${kw}" returned ${res.status}`); continue; }

      const data = await res.json();
      const items = (data.data?.list || []).map(p => ({
        _source: 'cj', name: p.productNameEn || p.productName || kw, cat: p.categoryName || kw,
        price: parseFloat(p.sellPrice) || 0, cost: parseFloat(p.productPrice) || 0,
        supplier: 'CJ – ' + (p.supplierName || 'CJ Dropshipping'), supScore: 80, moq: p.packingMinAmount || 10,
        images: p.productImage || '', orders: 0, _totalResults: data.data?.total || 0,
      }));

      cache.set(cacheKey, items, API_TTL);
      allProducts.push(...items);
      log(`CJ "${kw}": ${items.length} products`);
      await sleep(1100);
    } catch (err) { log(`CJ "${kw}" failed: ${err.message}`); }
  }

  return allProducts;
}

function aliSign(params, secret) {
  const sorted = Object.keys(params).sort();
  const str = sorted.map(k => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', secret).update(str).digest('hex').toUpperCase();
}

export async function fetchFromAliExpress(keywords, log) {
  if (!process.env.ALI_APP_KEY || !process.env.ALI_APP_SECRET) return [];
  const allProducts = [];

  for (const kw of keywords.slice(0, 4)) {
    const cacheKey = `ali:${kw}`;
    const cached = cache.get(cacheKey);
    if (cached) { log(`AliExpress cache hit: "${kw}" (${cached.length} products)`); allProducts.push(...cached); continue; }

    try {
      log(`AliExpress search: "${kw}"…`);
      const params = {
        app_key: process.env.ALI_APP_KEY, method: 'aliexpress.affiliate.product.query',
        sign_method: 'hmac-sha256', timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
        format: 'json', v: '2.0', keywords: kw, page_size: '20', target_currency: 'USD', target_language: 'EN', sort: 'SALE_PRICE_ASC',
      };
      params.sign = aliSign(params, process.env.ALI_APP_SECRET);

      const url = new URL('https://api-sg.aliexpress.com/sync');
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

      const res = await fetch(url.toString());
      if (!res.ok) { log(`AliExpress "${kw}" returned ${res.status}`); continue; }

      const data = await res.json();
      const products = data.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product || [];
      const total = data.aliexpress_affiliate_product_query_response?.resp_result?.result?.total_record_count || 0;

      const items = products.map(p => {
        const retail = parseFloat(p.target_sale_price) || parseFloat(p.target_original_price) || 0;
        return {
          _source: 'aliexpress', name: p.product_title || kw, cat: kw,
          price: parseFloat((retail * 2.5).toFixed(2)), cost: parseFloat((retail * 0.35).toFixed(2)),
          supplier: p.shop_name || 'AliExpress Seller', supScore: 75, moq: 1,
          images: p.product_main_image_url || '', orders: parseInt(p.lastest_volume) || 0, _totalResults: total,
        };
      });

      cache.set(cacheKey, items, API_TTL);
      allProducts.push(...items);
      log(`AliExpress "${kw}": ${items.length} products`);
      await sleep(500);
    } catch (err) { log(`AliExpress "${kw}" failed: ${err.message}`); }
  }

  return allProducts;
}

export async function scrapeAliExpress(keywords, log) {
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
  const landed = parseFloat((cost * 1.18).toFixed(2));
  const price = raw.price || parseFloat((landed * 2.5).toFixed(2)) || 19.99;
  const margin = price > 0 ? Math.round((price - landed) / price * 100) : 40;

  const matched = matchSignals(raw.name, signals);
  const avgHype = matched.length ? matched.reduce((a, s) => a + s.hypeScore, 0) / matched.length : 30;

  const trendsSignal = matched.find(s => s.source === 'google-trends');
  const trendVelocity = trendsSignal?.raw?.velocity || 0;
  const trend = Math.max(-50, Math.min(50, Math.round(trendVelocity)));
  const lifecycle = trend > 25 ? 'viral' : trend > 5 ? 'growing' : trend > -5 ? 'peak' : trend > -15 ? 'mature' : 'dying';

  const resultCount = raw._totalResults || 0;
  const competition = resultCount > 500 ? 'high' : resultCount > 100 ? 'medium' : 'low';

  const priceImpulse = Math.max(0, Math.min(100, Math.round(100 - price * 1.5)));
  const impulse = Math.min(100, Math.round(avgHype * 0.6 + priceImpulse * 0.4));
  const searches = trendsSignal ? trendsSignal.score * 150 : 0;
  const velocity = raw.orders > 0 ? Math.round(raw.orders / 30 * 12) : Math.max(10, Math.round(searches * 0.04));

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

  return { id, name: raw.name, cat: raw.cat, score, margin, price, cost, landed, velocity, trend, lifecycle, competition, supplier: raw.supplier, supScore: raw.supScore || 75, moq: raw.moq || 10, discount: 0, sources, searches, impulse, warns, imported: false, negState: 0, activePrice: 'standard' };
}

function discoveryToSchema(disc, signals) {
  const id = disc.id || `D${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const price = disc.estimatedPrice || 29.99;
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

  let rawProducts = [];

  try {
    const cjProducts = await fetchFromCJ(keywords, log);
    if (cjProducts.length) { rawProducts.push(...cjProducts); log(`CJ Dropshipping: ${cjProducts.length} total products`); }
  } catch (err) { log(`CJ Dropshipping unavailable: ${err.message}`); }

  try {
    const aliProducts = await fetchFromAliExpress(keywords, log);
    if (aliProducts.length) { rawProducts.push(...aliProducts); log(`AliExpress API: ${aliProducts.length} total products`); }
  } catch (err) { log(`AliExpress API unavailable: ${err.message}`); }

  if (!rawProducts.length) {
    try {
      const scraped = await scrapeAliExpress(keywords, log);
      if (scraped.length) { rawProducts.push(...scraped); log(`AliExpress scrape: ${scraped.length} total products`); }
    } catch (err) { log(`AliExpress scrape failed: ${err.message}`); }
  }

  if (!rawProducts.length) {
    log('All live sources failed — falling back to static catalog');
    return getProducts(niche);
  }

  rawProducts = deduplicateProducts(rawProducts);

  log('Running sentiment scan…');
  let signals = [];
  try {
    signals = await fullSentimentScan({
      subreddits: nicheConf.redditSubs || [], keywords,
      enableReddit: true, enableHN: false, enableTrends: true, enableTikTok: true,
      enableAiAnalysis: !!process.env.ANTHROPIC_API_KEY,
    }, (src, count) => log(`Sentiment: ${src} → ${count} signals`));
    log(`Sentiment scan complete: ${signals.length} total signals`);
  } catch (err) { log(`Sentiment scan failed (${err.message})`); }

  let products = rawProducts.map(raw => mapToSchema(raw, signals));

  if (config.enableDiscovery !== false && signals.length > 0) {
    try {
      const existing = products.concat(getProducts(niche));
      const disc = await runDiscovery(signals, niche, existing, { enableAi: !!process.env.ANTHROPIC_API_KEY });
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
