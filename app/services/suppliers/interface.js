/**
 * app/services/suppliers/interface.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Abstract base class for all dropshipping supplier integrations.
 *
 * Every concrete supplier (CJ, AliExpress, Temu, manual…) must extend
 * SupplierBase and implement the methods below.
 *
 * The SupplierRouter in router.js composes multiple SupplierBase instances
 * and handles failover, health tracking, and circuit-breaker integration.
 */

export class SupplierBase {
  /**
   * Human-readable name used in logs and health reports.
   * @returns {string}
   */
  get name() {
    throw new Error(`${this.constructor.name}: name getter not implemented`);
  }

  /**
   * Whether this supplier has all required credentials/config available.
   * SupplierRouter skips unconfigured suppliers silently.
   * @returns {boolean}
   */
  get isConfigured() {
    return false;
  }

  /**
   * Search for products matching the given keywords.
   * Called during the Scout phase in parallel across all configured suppliers.
   *
   * @param {string[]} keywords   — niche keywords (e.g. ['resistance band', 'gym gear'])
   * @param {object}   opts       — { country?, currency?, pageSize?, log? }
   * @returns {Promise<RawProduct[]>}
   */
  async search(keywords, opts = {}) {   // eslint-disable-line no-unused-vars
    return [];
  }

  /**
   * Get full DS product details by supplier-specific product ID.
   * Used during pricing/import enrichment.
   *
   * @param {string} productId
   * @param {object} opts        — { country?, currency? }
   * @returns {Promise<object>}
   */
  async getProduct(productId, opts = {}) { // eslint-disable-line no-unused-vars
    return null;
  }

  /**
   * Get freight/shipping options for a product.
   *
   * @param {string} productId
   * @param {number} qty
   * @param {object} opts        — { country?, skuId? }
   * @param {string} [token]     — per-shop OAuth token (required for DS APIs)
   * @returns {Promise<FreightOption[]>}
   */
  async getFreight(productId, qty, opts = {}, token = null) { // eslint-disable-line no-unused-vars
    return [];
  }

  /**
   * Place a dropshipping order.
   *
   * @param {{ productId, name, quantity, skuAttr, shippingService, cost }[]} items
   * @param {{ name, address1, city, countryCode, zip, phone }} address
   * @param {string} [token]     — per-shop OAuth token
   * @returns {Promise<OrderResult>}
   */
  async createOrder(items, address, token = null) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.name}: createOrder not implemented`);
  }

  /**
   * Get tracking info for a placed order.
   *
   * @param {{ orderId?, logisticsNo?, outRef?, serviceName?, toArea? }} params
   * @param {string} [token]
   * @returns {Promise<TrackingResult>}
   */
  async getTracking(params, token = null) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.name}: getTracking not implemented`);
  }

  /**
   * Cancel an order (supplier-side).
   * Not all suppliers support this — return { ok: false, reason: 'unsupported' } if not.
   *
   * @param {string} orderId
   * @param {string} [token]
   * @returns {Promise<{ ok: boolean, reason?: string }>}
   */
  async cancelOrder(orderId, token = null) { // eslint-disable-line no-unused-vars
    return { ok: false, reason: `${this.name}: cancelOrder not supported` };
  }

  /**
   * Health check — fast ping to verify the supplier API is reachable.
   * Returns true if healthy, false otherwise. Must not throw.
   * @returns {Promise<boolean>}
   */
  async ping() {
    return this.isConfigured;
  }
}

/**
 * @typedef {Object} RawProduct
 * @property {string}  _source    — supplier name ('cj' | 'aliexpress' | '1688' | ...)
 * @property {string}  name
 * @property {string}  cat
 * @property {number}  price      — suggested retail price
 * @property {number}  cost       — supplier cost
 * @property {string}  supplier
 * @property {number}  supScore
 * @property {number}  moq
 * @property {string}  images
 * @property {number}  orders     — historical order count
 * @property {number}  _totalResults
 * @property {string}  [aliProductId]
 */

/**
 * @typedef {Object} FreightOption
 * @property {string} serviceName
 * @property {number} price
 * @property {string} currency
 * @property {number} estimatedDays
 * @property {boolean} tracked
 */

/**
 * @typedef {Object} OrderResult
 * @property {boolean} success
 * @property {string}  [orderId]
 * @property {string}  [errorCode]
 * @property {string}  [errorMsg]
 */

/**
 * @typedef {Object} TrackingResult
 * @property {string}  [trackingNumber]
 * @property {string}  [carrierCode]
 * @property {string}  [status]
 * @property {Array}   [events]
 */
