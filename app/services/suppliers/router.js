/* eslint-disable no-undef */
/**
 * app/services/suppliers/router.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Health-aware supplier router.
 *
 * Responsibilities
 * ────────────────
 * • Runs search() across all configured suppliers in parallel
 * • Routes order placement to the best-health supplier that can handle it
 * • Tracks per-supplier error rate and marks unhealthy suppliers as degraded
 * • Exposes health snapshots for the observability dashboard
 *
 * Supplier priority (order matters for fallback):
 *   1. AliExpress DS  — primary ordering channel, has OAuth per shop
 *   2. CJ Dropshipping — secondary (search only currently)
 *   3. 1688/Alibaba   — factory sourcing, no ordering
 *
 * Adding a new supplier: implement SupplierBase, add to SUPPLIERS array in index.js
 */

const DEGRADED_THRESHOLD = 0.40; // >40% errors → mark degraded
const HEALTH_WINDOW      = 20;   // rolling window of last N calls

export class SupplierRouter {
  /**
   * @param {import('./interface.js').SupplierBase[]} suppliers
   */
  constructor(suppliers = []) {
    this._suppliers = suppliers;
    // name → { calls: number[], errors: number[] }  (rolling booleans)
    this._health = new Map();
  }

  // ── Health tracking ────────────────────────────────────────────────────

  _recordCall(name, ok) {
    if (!this._health.has(name)) {
      this._health.set(name, { ok: [], total: 0 });
    }
    const h = this._health.get(name);
    h.ok.push(ok ? 1 : 0);
    h.total++;
    if (h.ok.length > HEALTH_WINDOW) h.ok.shift();
  }

  _errorRate(name) {
    const h = this._health.get(name);
    if (!h || h.ok.length === 0) return 0;
    const errors = h.ok.filter(v => v === 0).length;
    return errors / h.ok.length;
  }

  _isHealthy(supplier) {
    if (!supplier.isConfigured) return false;
    return this._errorRate(supplier.name) < DEGRADED_THRESHOLD;
  }

  // ── Public interface ────────────────────────────────────────────────────

  /** All configured + healthy suppliers */
  get available() {
    return this._suppliers.filter(s => this._isHealthy(s));
  }

  /** All configured suppliers (including degraded) */
  get configured() {
    return this._suppliers.filter(s => s.isConfigured);
  }

  /**
   * Run search() across all healthy suppliers in parallel.
   * Returns deduplicated merged results.
   *
   * @param {string[]} keywords
   * @param {object}   opts
   * @returns {Promise<import('./interface.js').RawProduct[]>}
   */
  async search(keywords, opts = {}) {
    const log = opts.log || (() => {});

    // ── Diagnostic: show configuration + health status for every supplier ──
    for (const s of this._suppliers) {
      const configured = s.isConfigured;
      const healthy    = this._isHealthy(s);
      const errRate    = this._errorRate(s.name);
      const calls      = this._health.get(s.name)?.total || 0;
      const status     = !configured ? 'NOT CONFIGURED'
                       : !healthy    ? `DEGRADED (${(errRate * 100).toFixed(0)}% errors over ${calls} calls)`
                       :               'OK';
      log(`[Supplier] ${s.name}: ${status}`);
    }

    const targets = this.available;
    if (!targets.length) {
      // Show which suppliers are configured but degraded vs unconfigured
      const unconfigured = this._suppliers.filter(s => !s.isConfigured);
      const degraded     = this._suppliers.filter(s => s.isConfigured && !this._isHealthy(s));

      const parts = [];
      if (degraded.length) {
        parts.push(`Degraded: ${degraded.map(s => `${s.name} (${(this._errorRate(s.name) * 100).toFixed(0)}% error rate)`).join(', ')}`);
      }
      if (unconfigured.length) {
        parts.push(`Not configured: ${unconfigured.map(s => s.name).join(', ')}`);
      }
      throw new Error(
        `No healthy suppliers available. ${parts.join('. ')}. ` +
        'Configure CJ_EMAIL+CJ_PASSWORD, ALI_APP_KEY+ALI_APP_SECRET, or SERPAPI_KEY.',
      );
    }

    log(`Sourcing from [${targets.map(s => s.name).join(', ')}] in parallel…`);

    const settled = await Promise.allSettled(
      targets.map(s =>
        s.search(keywords, opts)
          .then(items => { this._recordCall(s.name, true); return items; })
          .catch(err  => { this._recordCall(s.name, false); throw err; }),
      ),
    );

    const allProducts = [];
    for (let i = 0; i < settled.length; i++) {
      const r = settled[i];
      const name = targets[i].name;
      if (r.status === 'fulfilled') {
        if (r.value.length) log(`${name}: ${r.value.length} products`);
        allProducts.push(...r.value);
      } else {
        log(`${name} unavailable: ${r.reason?.message}`);
      }
    }

    return allProducts;
  }

  /**
   * Place an order via the best available supplier that supports ordering.
   * Tries in priority order, falls through on failure.
   *
   * @param {object[]} items
   * @param {object}   address
   * @param {string}   [token]            — per-shop OAuth token
   * @param {string}   [preferredSupplier] — supplier.name to try first
   */
  async createOrder(items, address, token = null, preferredSupplier = null) {
    const orderable = this._suppliers.filter(s => {
      if (!s.isConfigured) return false;
      // Skip suppliers that explicitly don't support ordering
      return s.name !== '1688/Alibaba';
    });

    // Put preferred supplier first
    const sorted = preferredSupplier
      ? [
          ...orderable.filter(s => s.name === preferredSupplier),
          ...orderable.filter(s => s.name !== preferredSupplier),
        ]
      : orderable;

    const errors = [];
    for (const supplier of sorted) {
      try {
        const result = await supplier.createOrder(items, address, token);
        if (result.success) {
          this._recordCall(supplier.name, true);
          return { ...result, via: supplier.name };
        }
        errors.push(`${supplier.name}: ${result.errorMsg}`);
        this._recordCall(supplier.name, false);
      } catch (err) {
        errors.push(`${supplier.name}: ${err.message}`);
        this._recordCall(supplier.name, false);
      }
    }

    throw new Error(`All suppliers failed to place order:\n${errors.join('\n')}`);
  }

  /**
   * Get freight options from a specific supplier (AliExpress DS).
   */
  async getFreight(supplierName, productId, qty, opts, token) {
    const supplier = this._suppliers.find(s => s.name === supplierName);
    if (!supplier) throw new Error(`Supplier not found: ${supplierName}`);
    return supplier.getFreight(productId, qty, opts, token);
  }

  /**
   * Get tracking from a specific supplier.
   */
  async getTracking(supplierName, params, token) {
    const supplier = this._suppliers.find(s => s.name === supplierName);
    if (!supplier) throw new Error(`Supplier not found: ${supplierName}`);
    return supplier.getTracking(params, token);
  }

  /**
   * Snapshot of all supplier health for the dashboard.
   */
  healthSnapshot() {
    return this._suppliers.map(s => ({
      name:        s.name,
      configured:  s.isConfigured,
      healthy:     this._isHealthy(s),
      errorRate:   parseFloat((this._errorRate(s.name) * 100).toFixed(1)),
      totalCalls:  this._health.get(s.name)?.total || 0,
    }));
  }
}
