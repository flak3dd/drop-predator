/* eslint-disable no-undef */
/**
 * app/services/suppliers/alibaba1688.js
 * Factory-direct sourcing from Alibaba.com (1688 wholesale layer).
 *
 * Uses SerpAPI Google Shopping with site:alibaba.com to surface factory
 * wholesale prices — typically 40-60% cheaper than AliExpress retail.
 * Order placement is NOT supported — this is a sourcing/research supplier only.
 */

import { SupplierBase } from './interface.js';
import { breakers }     from '../risk/circuit-breaker.js';
import cache            from '../engine/catalog-cache.js';

const API_TTL = 4 * 60 * 60 * 1000; // factory prices change slowly

async function withRetry(fn, retries = 2, baseMs = 800) {
  let last;
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } catch (err) {
      last = err;
      if (err.circuitOpen) throw err;
      if (err.status && err.status < 500) throw err;
      await new Promise(r => setTimeout(r, baseMs * 2 ** i + Math.random() * 300));
    }
  }
  throw last;
}

export class Alibaba1688Supplier extends SupplierBase {
  get name() { return '1688/Alibaba'; }

  get isConfigured() {
    return !!process.env.SERPAPI_KEY;
  }

  async ping() { return this.isConfigured; }

  async search(keywords, opts = {}) {
    if (!this.isConfigured) {
      (opts.log || (() => {}))('[1688/Alibaba] Skipped — SERPAPI_KEY not set');
      return [];
    }
    const { log = () => {} } = opts;
    log('[1688/Alibaba] Searching with configured SERPAPI key');
    const allProducts = [];

    for (const kw of keywords.slice(0, 3)) {
      const cacheKey = `ali1688:${kw}`;
      const cached = cache.get(cacheKey);
      if (cached) { log(`1688 cache hit: "${kw}" (${cached.length})`); allProducts.push(...cached); continue; }

      try {
        const data = await withRetry(() =>
          breakers.ali1688.fire(async () => {
            const url = new URL('https://serpapi.com/search');
            url.searchParams.set('engine', 'google_shopping');
            url.searchParams.set('q', `${kw} wholesale factory site:alibaba.com`);
            url.searchParams.set('num', '15');
            url.searchParams.set('gl', 'us');
            url.searchParams.set('api_key', process.env.SERPAPI_KEY);

            const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
            if (!res.ok) throw Object.assign(new Error(`SerpAPI ${res.status}`), { status: res.status });
            return res.json();
          }),
        );

        const items = (data.shopping_results || []).slice(0, 12).flatMap(p => {
          const wholesale = parseFloat(String(p.extracted_price || '').replace(/[^0-9.]/g, '')) || 0;
          if (!wholesale) return [];
          const cost  = parseFloat((wholesale * 1.05).toFixed(2));
          const price = parseFloat((cost * 2.8).toFixed(2));
          return [{
            _source:       '1688',
            name:          p.title || kw,
            cat:           kw,
            price,
            cost,
            supplier:      p.source || 'Alibaba Factory',
            supScore:      72,
            moq:           10,
            images:        p.thumbnail || '',
            orders:        0,
            _totalResults: data.shopping_results?.length || 0,
          }];
        });

        cache.set(cacheKey, items, API_TTL);
        allProducts.push(...items);
        log(`1688/Alibaba "${kw}": ${items.length} factory listings`);
        await new Promise(r => setTimeout(r, 600));
      } catch (err) {
        const hint = err.message?.includes('401') || err.message?.includes('403')
          ? ' — SERPAPI_KEY may be invalid or expired'
          : '';
        log(`[1688/Alibaba] "${kw}" failed: ${err.message}${hint}`);
      }
    }

    return allProducts;
  }

  async createOrder() {
    return { success: false, errorMsg: '1688/Alibaba does not support direct DS ordering' };
  }
}
