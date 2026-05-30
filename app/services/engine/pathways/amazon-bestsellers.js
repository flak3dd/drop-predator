/* eslint-disable no-undef */
/**
 * Pathway E: Amazon Bestsellers Discovery
 *
 * Searches Amazon product data via SERPAPI's Amazon engine to find
 * bestselling and trending products in a niche. Amazon bestseller rank,
 * review count, and rating provide strong demand validation signals.
 *
 * Requires: SERPAPI_KEY
 * Returns:  Raw products in the standard _source schema
 */

import cache from '../catalog-cache.js';

const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export const name = 'Amazon Bestsellers';

export function isAvailable() {
  return !!process.env.SERPAPI_KEY;
}

export async function search(keywords, opts = {}) {
  const { log = () => {} } = opts;

  if (!isAvailable()) {
    log('[Amazon] Skipped — SERPAPI_KEY not set');
    return [];
  }

  const allProducts = [];

  for (const kw of keywords.slice(0, 3)) {
    const cacheKey = `amazon:${kw}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      log(`[Amazon] Cache hit: "${kw}" (${cached.length})`);
      allProducts.push(...cached);
      continue;
    }

    try {
      const url = new URL('https://serpapi.com/search');
      url.searchParams.set('engine', 'amazon');
      url.searchParams.set('amazon_domain', 'amazon.com');
      url.searchParams.set('k', kw);
      url.searchParams.set('api_key', process.env.SERPAPI_KEY);

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`SerpAPI Amazon ${res.status}`);
      const data = await res.json();

      const items = (data.organic_results || []).slice(0, 15).flatMap(p => {
        const price = parseFloat(
          String(p.price?.extracted || p.price?.raw || '').replace(/[^0-9.]/g, '')
        ) || 0;
        if (!price || price < 3 || price > 500) return [];

        // Estimate DS cost from Amazon retail price
        // Amazon pricing tends to be competitive; DS cost is typically retail ÷ 2.5–3x
        const estCost = parseFloat((price / 2.8).toFixed(2));

        const reviews = p.reviews || p.rating_count || 0;
        const rating = parseFloat(p.rating || '0') || 0;

        return [{
          _source:       'amazon',
          name:          (p.title || kw).slice(0, 80),
          cat:           kw,
          price,
          cost:          estCost,
          supplier:      'Amazon Marketplace',
          supScore:      rating >= 4.5 ? 85 : rating >= 4.0 ? 75 : rating >= 3.5 ? 65 : 55,
          moq:           1,
          images:        p.thumbnail || '',
          orders:        estimateMonthlyOrders(reviews, rating),
          _totalResults: data.organic_results?.length || 0,
          _retailPrice:  price,
          _rating:       rating,
          _reviews:      reviews,
          _amazonAsin:   p.asin || null,
          _position:     p.position || 0,
          _isPrime:      p.is_prime || false,
          _isBestseller: p.badge?.includes?.('Best Seller') || false,
        }];
      });

      cache.set(cacheKey, items, CACHE_TTL);
      allProducts.push(...items);
      log(`[Amazon] "${kw}": ${items.length} products`);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      log(`[Amazon] "${kw}" failed: ${err.message}`);
    }
  }

  return allProducts;
}

/**
 * Estimate monthly orders from review count and rating.
 * Industry rule of thumb: ~1-2% of buyers leave reviews.
 * Higher-rated products tend to have higher conversion rates.
 */
function estimateMonthlyOrders(reviews, rating) {
  if (!reviews) return 0;

  // Estimate total purchases from reviews (1.5% review rate)
  const totalPurchases = Math.round(reviews / 0.015);

  // Assume product has been listed for ~12 months on average
  const monthlyEstimate = Math.round(totalPurchases / 12);

  // Higher-rated products sell more
  const ratingMultiplier = rating >= 4.5 ? 1.3 : rating >= 4.0 ? 1.0 : 0.7;

  return Math.round(monthlyEstimate * ratingMultiplier);
}
