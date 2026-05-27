/**
 * app/services/intelligence/ad-competition.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Ad Competition Analysis — checks Google search ad density for products.
 *
 * Uses SerpAPI (existing SERPAPI_KEY) to count paid ads and shopping results
 * for a product query. Detects big-brand presence (Amazon, Walmart, Target, etc.)
 * and returns a risk assessment.
 *
 * Results are cached for 6 hours to minimize API costs.
 *
 * Usage:
 *   import { analyzeAdCompetition, adCompetitionMultiplier } from './ad-competition.js';
 *   const result = await analyzeAdCompetition('resistance bands', 'fitness');
 *   const multiplier = adCompetitionMultiplier(result);
 *   adjustedScore = originalScore * multiplier;
 */

// ─── Big brand detection ───────────────────────────────────────────────────

const BIG_BRANDS = new Set([
  'amazon', 'walmart', 'target', 'costco', 'bestbuy', 'best buy',
  'home depot', 'lowes', "lowe's", 'wayfair', 'overstock', 'ebay',
  'aliexpress', 'wish', 'temu', 'shein', 'nike', 'adidas',
  'under armour', 'apple', 'samsung', 'ikea', 'nordstrom',
  'macys', "macy's", 'kohls', "kohl's", 'sephora', 'ulta',
]);

// ─── Cache ─────────────────────────────────────────────────────────────────

const cache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  // Prune if cache is too large
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (const [k] of oldest.slice(0, 50)) cache.delete(k);
  }
  cache.set(key, { data, ts: Date.now() });
}

// ─── Main analysis ─────────────────────────────────────────────────────────

/**
 * Analyze ad competition for a product + category query.
 *
 * @param {string} productName — product name or search term
 * @param {string} [category] — optional category for context
 * @returns {Promise<{
 *   adDensity: 'light'|'moderate'|'heavy'|'saturated',
 *   adCount: number,
 *   shoppingCount: number,
 *   bigBrandCount: number,
 *   risk: 'low'|'medium'|'high'|'extreme',
 *   topAdvertisers: string[],
 *   query: string,
 * }>}
 */
export async function analyzeAdCompetition(productName, category = '') {
  const query = category ? `${productName} ${category}` : productName;
  const cacheKey = `ad:${query.toLowerCase()}`;

  // Check cache
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const result = {
    adDensity: 'light',
    adCount: 0,
    shoppingCount: 0,
    bigBrandCount: 0,
    risk: 'low',
    topAdvertisers: [],
    query,
  };

  if (!process.env.SERPAPI_KEY) return result;

  try {
    const url = new URL('https://serpapi.com/search');
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', `buy ${query}`);
    url.searchParams.set('num', '20');
    url.searchParams.set('api_key', process.env.SERPAPI_KEY);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return result;
    const data = await res.json();

    // Count paid ads
    const ads = data.ads || [];
    result.adCount = ads.length;

    // Count shopping results
    const shopping = data.shopping_results || [];
    result.shoppingCount = shopping.length;

    // Extract advertisers and detect big brands
    const advertisers = new Set();

    for (const ad of ads) {
      const domain = extractDomain(ad.displayed_link || ad.link || '');
      if (domain) advertisers.add(domain);
    }

    for (const item of shopping) {
      const source = (item.source || '').toLowerCase();
      if (source) advertisers.add(source);
    }

    // Also check organic results for big brand dominance
    const organicResults = data.organic_results || [];
    for (const org of organicResults.slice(0, 10)) {
      const domain = extractDomain(org.link || '');
      if (domain) {
        for (const brand of BIG_BRANDS) {
          if (domain.includes(brand.replace(/['\s]/g, ''))) {
            result.bigBrandCount++;
            break;
          }
        }
      }
    }

    // Count big brands in ads/shopping
    for (const adv of advertisers) {
      for (const brand of BIG_BRANDS) {
        if (adv.includes(brand.replace(/['\s]/g, ''))) {
          result.bigBrandCount++;
          break;
        }
      }
    }

    result.topAdvertisers = [...advertisers].slice(0, 8);

    // Classify ad density
    const totalAds = result.adCount + result.shoppingCount;
    if (totalAds >= 12)     result.adDensity = 'saturated';
    else if (totalAds >= 7) result.adDensity = 'heavy';
    else if (totalAds >= 3) result.adDensity = 'moderate';
    else                    result.adDensity = 'light';

    // Classify risk
    const riskScore = totalAds * 2 + result.bigBrandCount * 5;
    if (riskScore >= 30)      result.risk = 'extreme';
    else if (riskScore >= 18) result.risk = 'high';
    else if (riskScore >= 8)  result.risk = 'medium';
    else                      result.risk = 'low';

    setCache(cacheKey, result);
  } catch { /* non-fatal */ }

  return result;
}

// ─── Score multiplier ──────────────────────────────────────────────────────

/**
 * Convert ad competition result to a score multiplier.
 * Apply to product profit scores to penalize saturated markets
 * and reward low-competition niches.
 *
 * @param {{ risk: string }} adResult
 * @returns {number} multiplier (0.6 to 1.15)
 */
export function adCompetitionMultiplier(adResult) {
  switch (adResult?.risk) {
    case 'extreme': return 0.6;
    case 'high':    return 0.75;
    case 'medium':  return 0.85;
    case 'low':     return 1.15;
    default:        return 1.0;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractDomain(url) {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname
      .replace(/^www\./, '')
      .toLowerCase();
  } catch {
    return (url || '').toLowerCase().split('/')[0];
  }
}
