/* eslint-disable no-undef */
/**
 * brand-research.js
 *
 * Client for the Drop Predator Brand Research Python service.
 * The service wraps Google ADK brand-search-optimization agents
 * (adapted from google/adk-samples) to provide:
 *
 *   • Keyword research     — high-intent buyer search terms
 *   • Title optimisation   — SEO-ready Shopify product titles
 *   • Market insights      — saturation, audience, positioning angle
 *
 * The Python service must be running separately:
 *   cd python/brand-research && uv run server.py
 *
 * If the service is not reachable, all functions return empty/null
 * gracefully so the engine pipeline continues unaffected.
 */

const SERVICE_URL = process.env.BRAND_RESEARCH_URL || 'http://localhost:8765';
const TIMEOUT_MS  = parseInt(process.env.BRAND_RESEARCH_TIMEOUT_MS || '30000', 10);

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function post(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${SERVICE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether the brand-research service is running.
 * Returns true/false — never throws.
 */
export async function isBrandResearchAvailable() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${SERVICE_URL}/health`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Full analysis: keyword research + title optimisation + market insights.
 * Runs three ADK sub-agents in parallel (~10-30s depending on model latency).
 *
 * @param {string} niche — e.g. "gym", "pet", "home"
 * @param {Array}  products — engine product objects (name, category, price, etc.)
 * @returns {Promise<BrandResearchResult>}
 */
export async function analyzeProducts(niche, products) {
  const payload = {
    niche,
    products: products.map(p => ({
      name:     p.name,
      category: p.cat || niche,
      supplier: p.supplier || '',
      price:    p.price || 0,
      cost:     p.cost  || 0,
      sources:  p.sources || [],
    })),
  };

  const data = await post('/analyze', payload);
  return data;
}

/**
 * Keyword research only (faster than full analysis).
 * Returns an array of keyword objects.
 */
export async function getKeywords(niche, products) {
  const data = await post('/keywords', {
    niche,
    products: products.slice(0, 10).map(p => ({
      name: p.name, category: p.cat || niche,
    })),
  });
  return data.keywords || [];
}

/**
 * Title optimisation only (faster than full analysis).
 * Returns an array of { original, optimized, seo_score, reasoning }.
 */
export async function getOptimizedTitles(niche, products) {
  const data = await post('/titles', {
    niche,
    products: products.slice(0, 10).map(p => ({
      name: p.name, category: p.cat || niche, price: p.price || 0,
    })),
  });
  return data.optimized_titles || [];
}

/**
 * Run brand research as an engine pipeline enrichment step.
 * Enriches products with an `seoTitle` field and returns
 * { keywords, insights, enrichedProducts }.
 *
 * Never throws — returns empty results on any failure.
 */
export async function enrichWithBrandResearch(niche, products, log) {
  const logFn = log || (() => {});

  const available = await isBrandResearchAvailable();
  if (!available) {
    logFn('Brand Research service not running — skipping (start python/brand-research/server.py)');
    return { keywords: [], insights: {}, enrichedProducts: products };
  }

  logFn(`Brand Research: analysing ${products.length} products in "${niche}" niche…`);

  try {
    const result = await analyzeProducts(niche, products);

    if (!result.ok) {
      logFn(`Brand Research error: ${result.error}`);
      return { keywords: [], insights: {}, enrichedProducts: products };
    }

    logFn(`Brand Research: ${result.keywords.length} keywords, ${result.optimized_titles.length} title suggestions`);

    // Map optimized titles back onto products by matching original name
    const titleMap = new Map(
      (result.optimized_titles || []).map(t => [
        t.original?.toLowerCase().trim(),
        t.optimized,
      ])
    );

    const enrichedProducts = products.map(p => {
      const seoTitle = titleMap.get(p.name.toLowerCase().trim());
      return seoTitle ? { ...p, seoTitle } : p;
    });

    if (result.insights?.recommended_angle) {
      logFn(`Market angle: ${result.insights.recommended_angle}`);
    }
    if (result.insights?.market_saturation) {
      logFn(`Market saturation: ${result.insights.market_saturation}`);
    }

    return {
      keywords:         result.keywords || [],
      insights:         result.insights || {},
      enrichedProducts,
    };
  } catch (err) {
    logFn(`Brand Research failed: ${err.message}`);
    return { keywords: [], insights: {}, enrichedProducts: products };
  }
}

/**
 * @typedef {Object} BrandResearchResult
 * @property {boolean} ok
 * @property {string}  niche
 * @property {number}  product_count
 * @property {Array<{keyword:string, intent:string, competition:string, monthly_searches:string, relevance:string}>} keywords
 * @property {Array<{original:string, optimized:string, primary_keyword:string, seo_score:number, reasoning:string}>} optimized_titles
 * @property {{market_saturation:string, recommended_angle:string, top_ad_keywords:string[], pricing_insight:string, target_audience:string, seasonal_notes:string, risk_flags:string[]}} insights
 */
