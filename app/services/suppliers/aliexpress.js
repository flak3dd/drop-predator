/* eslint-disable no-undef */
/**
 * app/services/suppliers/aliexpress.js
 * AliExpress Affiliate (search/scout) + DS (orders/tracking) supplier.
 *
 * Two APIs under one supplier:
 *   Affiliate API — keyword product search, no per-shop auth required
 *   DS API        — freight, order placement, tracking (requires per-shop OAuth token)
 */

import crypto    from 'crypto';
import { SupplierBase } from './interface.js';
import { breakers }     from '../circuit-breaker.js';
import cache            from '../engine/catalog-cache.js';
import {
  getDsFreight,
  createDsOrder,
  getDsTracking,
} from '../engine/aliexpress-ds.js';

const API_TTL   = 30 * 60 * 1000;
const ALI_API   = 'https://api-sg.aliexpress.com/sync';

// ── HMAC signing (Affiliate + DS APIs) ───────────────────────────────────
function aliSign(params, secret) {
  const sorted = Object.keys(params).sort();
  const str    = sorted.map(k => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', secret).update(str).digest('hex').toUpperCase();
}

// ── Retry helper ─────────────────────────────────────────────────────────
async function withRetry(fn, retries = 3, baseMs = 600) {
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

// ── Supplier ─────────────────────────────────────────────────────────────

export class AliExpressSupplier extends SupplierBase {
  get name() { return 'AliExpress'; }

  get isConfigured() {
    return !!(process.env.ALI_APP_KEY && process.env.ALI_APP_SECRET);
  }

  async ping() {
    return this.isConfigured;
  }

  // ── Scout / Affiliate product search ─────────────────────────────────

  async search(keywords, opts = {}) {
    if (!this.isConfigured) return [];
    const { log = () => {}, country = 'US', currency = 'USD' } = opts;
    const allProducts = [];

    for (const kw of keywords.slice(0, 4)) {
      const cacheKey = `ali:${kw}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        log(`AliExpress cache hit: "${kw}" (${cached.length})`);
        allProducts.push(...cached);
        continue;
      }

      try {
        const items = await withRetry(() =>
          breakers.aliAffiliate.fire(async () => {
            const params = {
              app_key:         process.env.ALI_APP_KEY,
              method:          'aliexpress.affiliate.product.query',
              sign_method:     'hmac-sha256',
              timestamp:       new Date().toISOString().replace('T', ' ').slice(0, 19),
              format:          'json',
              v:               '2.0',
              keywords:        kw,
              page_size:       '20',
              target_currency: currency,
              target_language: 'EN',
              ship_to_country: country,
              sort:            'SALE_PRICE_ASC',
            };
            params.sign = aliSign(params, process.env.ALI_APP_SECRET);

            const url = new URL(ALI_API);
            for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

            const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
            if (!res.ok) throw Object.assign(new Error(`AliExpress ${res.status}`), { status: res.status });
            return res.json();
          }),
        );

        const products = items.aliexpress_affiliate_product_query_response
          ?.resp_result?.result?.products?.product || [];

        const mapped = products.map(p => {
          const retail = parseFloat(p.target_sale_price) || parseFloat(p.target_original_price) || 0;
          return {
            _source:       'aliexpress',
            name:          p.product_title || kw,
            cat:           kw,
            price:         parseFloat((retail * 2.5).toFixed(2)),
            cost:          parseFloat((retail * 0.35).toFixed(2)),
            supplier:      p.shop_name || 'AliExpress Seller',
            supScore:      75,
            moq:           1,
            images:        p.product_main_image_url || '',
            orders:        parseInt(p.lastest_volume) || 0,
            _totalResults: items.aliexpress_affiliate_product_query_response
              ?.resp_result?.result?.total_record_count || 0,
            aliProductId:  String(p.product_id || ''),
          };
        });

        cache.set(cacheKey, mapped, API_TTL);
        allProducts.push(...mapped);
        log(`AliExpress "${kw}": ${mapped.length} products`);
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        log(`AliExpress "${kw}" failed: ${err.message}`);
      }
    }

    return allProducts;
  }

  // ── DS freight ────────────────────────────────────────────────────────

  async getFreight(productId, qty, opts = {}, token = null) {
    return breakers.aliDs.fire(() =>
      getDsFreight(productId, qty, { country: opts.country || 'US', skuId: opts.skuId || null }, token),
    );
  }

  // ── DS order placement ────────────────────────────────────────────────

  async createOrder(items, address, token = null) {
    if (!token) throw new Error('AliExpress DS order requires per-shop OAuth token');
    return withRetry(() =>
      breakers.aliDs.fire(() => createDsOrder({ productItems: items, address }, token)),
    );
  }

  // ── DS tracking ───────────────────────────────────────────────────────

  async getTracking(params, token = null) {
    if (!token) throw new Error('AliExpress DS tracking requires OAuth token');
    return breakers.aliDs.fire(() => getDsTracking(params, token));
  }
}
