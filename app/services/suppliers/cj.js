/* eslint-disable no-undef */
/**
 * app/services/suppliers/cj.js
 * CJ Dropshipping supplier implementation.
 * Extracted from live-catalog.js + wrapped with circuit breaker + retry.
 */

import { SupplierBase } from './interface.js';
import { breakers }    from '../risk/circuit-breaker.js';
import cache           from '../engine/catalog-cache.js';

const API_TTL = 30 * 60 * 1000;
const BASE    = 'https://developers.cjdropshipping.com/api2.0/v1';

// ── Token cache (module-level singleton) ─────────────────────────────────
let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const res = await fetch(`${BASE}/authentication/getAccessToken`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: process.env.CJ_EMAIL, password: process.env.CJ_PASSWORD }),
    signal:  AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw Object.assign(new Error(`CJ auth failed: ${res.status}`), { status: res.status });
  const data = await res.json();
  if (!data.data?.accessToken) throw new Error('CJ auth: no accessToken in response');

  _token       = data.data.accessToken;
  _tokenExpiry = Date.now() + 14 * 24 * 3_600_000; // 14-day validity
  return _token;
}

// ── Retry helper (exp backoff + jitter) ──────────────────────────────────
async function withRetry(fn, retries = 3, baseMs = 500) {
  let last;
  for (let i = 0; i < retries; i++) {
    try { return await fn(); } catch (err) {
      last = err;
      if (err.circuitOpen) throw err;                    // don't retry open circuits
      if (err.status && err.status < 500) throw err;    // don't retry 4xx
      const delay = baseMs * 2 ** i + Math.random() * 200;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw last;
}

// ── Supplier ─────────────────────────────────────────────────────────────

export class CJSupplier extends SupplierBase {
  get name() { return 'CJ Dropshipping'; }

  get isConfigured() {
    return !!(process.env.CJ_EMAIL && process.env.CJ_PASSWORD);
  }

  async ping() {
    if (!this.isConfigured) return false;
    try { await getToken(); return true; } catch { return false; }
  }

  async search(keywords, opts = {}) {
    if (!this.isConfigured) {
      (opts.log || (() => {}))('[CJ] Skipped — CJ_EMAIL or CJ_PASSWORD not set');
      return [];
    }
    const { log = () => {}, pageSize = 20 } = opts;
    // Pre-flight: try to authenticate so we surface auth errors early
    try {
      await getToken();
      log('[CJ] Authenticated successfully');
    } catch (authErr) {
      log(`[CJ] ⚠️  Authentication failed: ${authErr.message} — check CJ_EMAIL and CJ_PASSWORD are valid CJ API credentials`);
      return [];
    }
    const allProducts = [];

    for (const kw of keywords.slice(0, 4)) {
      const cacheKey = `cj:${kw}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        log(`CJ cache hit: "${kw}" (${cached.length})`);
        allProducts.push(...cached);
        continue;
      }

      try {
        const items = await withRetry(() =>
          breakers.cj.fire(async () => {
            const token = await getToken();
            const url = new URL(`${BASE}/product/list`);
            url.searchParams.set('productNameEn', kw);
            url.searchParams.set('pageNum', '1');
            url.searchParams.set('pageSize', String(pageSize));

            const res = await fetch(url.toString(), {
              headers: { 'CJ-Access-Token': token },
              signal:  AbortSignal.timeout(12_000),
            });
            if (!res.ok) throw Object.assign(new Error(`CJ ${res.status}`), { status: res.status });
            return res.json();
          }),
        );

        const mapped = (items.data?.list || []).map(p => ({
          _source:      'cj',
          name:         p.productNameEn || p.productName || kw,
          cat:          p.categoryName  || kw,
          price:        parseFloat(p.sellPrice)    || 0,
          cost:         parseFloat(p.productPrice) || 0,
          supplier:     `CJ – ${p.supplierName || 'CJ Dropshipping'}`,
          supScore:     80,
          moq:          p.packingMinAmount || 10,
          images:       p.productImage || '',
          orders:       0,
          _totalResults: items.data?.total || 0,
        }));

        cache.set(cacheKey, mapped, API_TTL);
        allProducts.push(...mapped);
        log(`CJ "${kw}": ${mapped.length} products`);
        await new Promise(r => setTimeout(r, 1100)); // CJ rate limit
      } catch (err) {
        log(`[CJ] "${kw}" failed: ${err.message}`);
      }
    }

    return allProducts;
  }

  // CJ doesn't have a standalone DS order API in the same style as AliExpress.
  // Orders are placed through the CJ merchant dashboard — this is a stub.
  async createOrder(items, address, token = null) {
    void token;
    return { success: false, errorMsg: 'CJ order placement requires merchant dashboard — use AliExpress DS' };
  }
}
