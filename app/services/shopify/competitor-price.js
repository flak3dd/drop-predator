/* eslint-disable no-undef */
/**
 * app/services/engine/competitor-price.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Live competitor price intelligence.
 *
 * Sources (tried in order):
 *   1. SerpAPI Google Shopping  (if SERPAPI_KEY is set)
 *   2. Heuristic estimate based on cost + category multipliers
 *
 * Primary export:
 *   getCompetitorIntel(productName, category, ourCost) → intel object
 *   calcOptimalPrice(intel, landedCost, marginFloor)   → { price, mode, margin }
 *   repriceByVelocity(product, intel)                  → adjusted price
 */

import cache from '../engine/catalog-cache.js';

const PRICE_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours — prices don't move that fast

// ─── Category multipliers for heuristic fallback ──────────────────────────
// Typical retail / AliExpress-cost ratio per category
const CAT_MULTIPLIERS = {
  gym:        3.2,
  fitness:    3.2,
  pet:        2.8,
  home:       2.5,
  kitchen:    2.6,
  beauty:     3.5,
  tech:       2.2,
  fashion:    3.0,
  outdoor:    2.7,
  default:    2.8,
};

// ─── Main API ──────────────────────────────────────────────────────────────

/**
 * Fetch competitor prices for a product.
 *
 * @param {string} productName
 * @param {string} category
 * @param {number} [ourCost=0]    — our landed unit cost (anchors heuristic)
 * @returns {Promise<CompetitorIntel>}
 */
export async function getCompetitorIntel(productName, category, ourCost = 0) {
  const key = `comp:${productName.slice(0, 40).toLowerCase().replace(/\s+/g, '-')}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let result;

  if (process.env.SERPAPI_KEY) {
    try {
      result = await serpGoogleShopping(productName, category);
    } catch (err) {
      console.warn('[competitor-price] SerpAPI failed:', err.message);
    }
  }

  if (!result || result.pricePoints.length === 0) {
    result = heuristicIntel(productName, category, ourCost);
  }

  cache.set(key, result, PRICE_CACHE_TTL);
  return result;
}

/**
 * Given competitor intel + our landed cost, choose an optimal price.
 *
 * Priority order:
 *   1. Beat cheapest competitor by 4% (if margin holds)
 *   2. Sit 5% below competitor avg (still competitive)
 *   3. Price for margin floor (we can't compete on price)
 *
 * @param {CompetitorIntel} intel
 * @param {number} ourLandedCost
 * @param {number} [marginFloor=35]
 * @returns {{ price: number, mode: string, margin: number }}
 */
export function calcOptimalPrice(intel, ourLandedCost, marginFloor = 35) {
  const { minPrice, avgPrice } = intel;

  if (!ourLandedCost || ourLandedCost <= 0) {
    return { price: avgPrice, mode: 'margin-floor', margin: null };
  }

  // Strategy 1: undercut cheapest by 4%
  const aggressivePrice = parseFloat((minPrice * 0.96).toFixed(2));
  const aggressiveMargin = Math.round((aggressivePrice - ourLandedCost) / aggressivePrice * 100);

  if (aggressiveMargin >= marginFloor) {
    return { price: aggressivePrice, mode: 'comp-undercut', margin: aggressiveMargin };
  }

  // Strategy 2: blend on avg − 5%
  const blendPrice = parseFloat((avgPrice * 0.95).toFixed(2));
  const blendMargin = Math.round((blendPrice - ourLandedCost) / blendPrice * 100);

  if (blendMargin >= marginFloor) {
    return { price: blendPrice, mode: 'comp-blend', margin: blendMargin };
  }

  // Strategy 3: price for margin floor — we're the premium option
  const marginPrice = parseFloat((ourLandedCost / (1 - marginFloor / 100)).toFixed(2));

  return { price: marginPrice, mode: 'margin-floor', margin: marginFloor };
}

/**
 * Dynamic repricing based on inventory velocity vs competitor prices.
 * Call this when a product's velocity changes (e.g. from a weekly cron).
 *
 * @param {object} product  — engine product with velocity, lifecycle, landed
 * @param {CompetitorIntel} intel
 * @returns {{ price: number, mode: string, delta: number }}
 */
export function repriceByVelocity(product, intel) {
  const base = calcOptimalPrice(intel, product.landed || product.cost * 1.18, 35);

  // Hot product (viral lifecycle or velocity > 400/mo) → premium position
  if (product.lifecycle === 'viral' || product.velocity > 400) {
    const surgePrice = parseFloat((intel.avgPrice * 1.05).toFixed(2));
    const currentPrice = product.price || base.price;
    return {
      price: surgePrice,
      mode: 'velocity-surge',
      delta: parseFloat((surgePrice - currentPrice).toFixed(2)),
    };
  }

  // Slow-moving (velocity < 30/mo) → discount to move inventory
  if (product.velocity < 30 && product.lifecycle !== 'viral') {
    const clearancePrice = parseFloat((intel.minPrice * 0.90).toFixed(2));
    const floorPrice = (product.landed || 0) * 1.15; // absolute minimum
    const finalPrice = Math.max(clearancePrice, floorPrice);
    const currentPrice = product.price || base.price;
    return {
      price: finalPrice,
      mode: 'velocity-clearance',
      delta: parseFloat((finalPrice - currentPrice).toFixed(2)),
    };
  }

  // Normal band — just sit at optimal comp price
  return { price: base.price, mode: base.mode, delta: 0 };
}

// ─── SerpAPI Google Shopping ───────────────────────────────────────────────

async function serpGoogleShopping(productName, category) {
  const query = `${productName} ${category}`.slice(0, 120);
  const url = new URL('https://serpapi.com/search');
  url.searchParams.set('engine', 'google_shopping');
  url.searchParams.set('q', query);
  url.searchParams.set('num', '10');
  url.searchParams.set('gl', 'us');
  url.searchParams.set('hl', 'en');
  url.searchParams.set('api_key', process.env.SERPAPI_KEY);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`SerpAPI returned ${res.status}`);

  const data = await res.json();
  const items = data.shopping_results || [];
  if (!items.length) throw new Error('No shopping results from SerpAPI');

  const pricePoints = items
    .map(item => {
      const raw = String(item.extracted_price || item.price || '').replace(/[^0-9.]/g, '');
      return {
        source: item.source || 'Google Shopping',
        price: parseFloat(raw) || 0,
        title: item.title || '',
        rating: item.rating || null,
      };
    })
    .filter(p => p.price > 0.5)
    .slice(0, 8);

  if (!pricePoints.length) throw new Error('No parseable prices in SerpAPI results');

  const prices = pricePoints.map(p => p.price);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

  return {
    avgPrice:    parseFloat(avg.toFixed(2)),
    minPrice:    Math.min(...prices),
    maxPrice:    Math.max(...prices),
    pricePoints,
    source:      'serpapi-google-shopping',
    queriedAt:   Date.now(),
  };
}

// ─── Heuristic fallback ───────────────────────────────────────────────────

function heuristicIntel(productName, category, ourCost) {
  const normalizedCat = (category || '').toLowerCase().split(/[\s/,-]/)[0];
  const multiplier = CAT_MULTIPLIERS[normalizedCat] || CAT_MULTIPLIERS.default;
  const base = ourCost > 0 ? ourCost * multiplier : 29.99;

  // Simulate realistic spread: cheapest ~80% of avg, priciest ~130%
  return {
    avgPrice:    parseFloat(base.toFixed(2)),
    minPrice:    parseFloat((base * 0.80).toFixed(2)),
    maxPrice:    parseFloat((base * 1.30).toFixed(2)),
    pricePoints: [],
    source:      'heuristic',
    queriedAt:   Date.now(),
  };
}

/**
 * @typedef {Object} CompetitorIntel
 * @property {number}   avgPrice
 * @property {number}   minPrice
 * @property {number}   maxPrice
 * @property {Array<{source:string, price:number, title:string}>} pricePoints
 * @property {string}   source       — 'serpapi-google-shopping' | 'heuristic'
 * @property {number}   queriedAt
 */
