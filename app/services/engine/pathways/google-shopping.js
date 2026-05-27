/* eslint-disable no-undef */
/**
 * Pathway B: Google Shopping Discovery
 *
 * Broad Google Shopping search via SERPAPI — finds real products with
 * real prices from any retailer, not restricted to a single supplier.
 *
 * Requires: SERPAPI_KEY
 * Returns:  Raw products in the standard _source schema
 */

import cache from '../catalog-cache.js';

const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export const name = 'Google Shopping';

export function isAvailable() {
  return !!process.env.SERPAPI_KEY;
}

export async function search(keywords, opts = {}) {
  const { log = () => {} } = opts;

  if (!isAvailable()) {
    log('[Google Shopping] Skipped — SERPAPI_KEY not set');
    return [];
  }

  const allProducts = [];

  for (const kw of keywords.slice(0, 3)) {
    const cacheKey = `gshop:${kw}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      log(`[Google Shopping] Cache hit: "${kw}" (${cached.length})`);
      allProducts.push(...cached);
      continue;
    }

    try {
      const url = new URL('https://serpapi.com/search');
      url.searchParams.set('engine', 'google_shopping');
      url.searchParams.set('q', kw);
      url.searchParams.set('num', '20');
      url.searchParams.set('gl', 'us');
      url.searchParams.set('hl', 'en');
      url.searchParams.set('api_key', process.env.SERPAPI_KEY);

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
      if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
      const data = await res.json();

      const items = (data.shopping_results || []).slice(0, 15).flatMap(p => {
        const retail = parseFloat(String(p.extracted_price || '').replace(/[^0-9.]/g, '')) || 0;
        if (!retail || retail < 3 || retail > 500) return [];

        // Estimate DS cost: retail ÷ 2.5 (typical DS markup is 2.5x–3x)
        const estCost = parseFloat((retail / 2.8).toFixed(2));

        return [{
          _source:       'google-shopping',
          name:          (p.title || kw).slice(0, 80),
          cat:           kw,
          price:         retail,
          cost:          estCost,
          supplier:      p.source || 'Google Shopping',
          supScore:      65,
          moq:           1,
          images:        p.thumbnail || '',
          orders:        0,
          _totalResults: data.shopping_results?.length || 0,
          _retailPrice:  retail,
          _rating:       p.rating || 0,
          _reviews:      p.reviews || 0,
        }];
      });

      cache.set(cacheKey, items, CACHE_TTL);
      allProducts.push(...items);
      log(`[Google Shopping] "${kw}": ${items.length} products`);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      log(`[Google Shopping] "${kw}" failed: ${err.message}`);
    }
  }

  return allProducts;
}
