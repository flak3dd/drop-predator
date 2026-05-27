/**
 * app/services/engine/price.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Dynamic pricing engine.
 *
 * Modes
 * ──────
 * surge       — viral/trending product, premium +12%
 * undercut    — high-competition or dying lifecycle, price −4%
 * psych       — mature/impulse products, psychological .99 trick
 * dynamic     — competitor-benchmarked: uses competitorPrice field if set
 * standard    — no adjustment, raw price
 *
 * Usage
 * ──────
 * computePricing(product, opts)       — choose the best mode string
 * getActivePrice(product)             — apply the stored mode → final number
 * computePricingWithCompetitors(product, intel, opts)  — full pipeline
 */

import { calcOptimalPrice, repriceByVelocity } from './competitor-price.js';

// ─── Mode selection ────────────────────────────────────────────────────────

/**
 * Decide the optimal pricing mode for a product.
 * If competitor intel is supplied, `dynamic` is preferred for most cases.
 *
 * @param {object} product  — engine product schema
 * @param {object} [opts]   — { surgeEnabled, competitorIntel, marginFloor }
 * @returns {string}        — pricing mode key
 */
export function computePricing(product, opts = {}) {
  const { surgeEnabled = true, competitorIntel = null } = opts;

  // Viral + real trend data → surge pricing (demand supports a premium)
  if (product.lifecycle === 'viral' && product.trend > 15 && surgeEnabled) {
    return 'surge';
  }

  // We have live competitor data → use dynamic mode
  if (competitorIntel && competitorIntel.source !== 'heuristic') {
    return 'dynamic';
  }

  // Dying / high-competition → clear inventory with a price cut
  if (product.lifecycle === 'dying' || product.competition === 'high') {
    return 'undercut';
  }

  // Everything else → psychological pricing
  return 'psych';
}

/**
 * Full pipeline: fetch/use competitor intel, run velocity repricing, return mode + price.
 *
 * @param {object} product
 * @param {import('./competitor-price.js').CompetitorIntel|null} intel
 * @param {object} [opts]
 * @returns {{ mode: string, price: number, competitorAvg: number|null }}
 */
export function computePricingWithCompetitors(product, intel = null, opts = {}) {
  const { surgeEnabled = true, marginFloor = 35 } = opts;

  if (!intel || intel.pricePoints.length === 0) {
    // No live data — fall back to standard mode logic
    const mode = computePricing(product, { surgeEnabled });
    return { mode, price: product.price, competitorAvg: null };
  }

  // Velocity-adjusted price
  const velocityResult = repriceByVelocity(product, intel);

  // If surge conditions, let velocity-surge take priority
  if (product.lifecycle === 'viral' && product.trend > 15 && surgeEnabled) {
    return { mode: 'surge', price: velocityResult.price, competitorAvg: intel.avgPrice };
  }

  // Velocity-clearance for slow movers
  if (velocityResult.mode === 'velocity-clearance') {
    return { mode: 'undercut', price: velocityResult.price, competitorAvg: intel.avgPrice };
  }

  // Standard competitive pricing
  const optimal = calcOptimalPrice(intel, product.landed || product.cost * 1.18, marginFloor);
  return { mode: 'dynamic', price: optimal.price, competitorAvg: intel.avgPrice };
}

// ─── Price application ────────────────────────────────────────────────────

/**
 * Apply the product's stored pricing mode to compute the final sell price.
 *
 * @param {object} product  — must have .price, .activePrice, and optionally .competitorPrice
 * @returns {number}
 */
export function getActivePrice(product) {
  const base = product.price;

  switch (product.activePrice) {
    case 'surge':
      return parseFloat((base * 1.12).toFixed(2));

    case 'undercut':
      return parseFloat((base * 0.96).toFixed(2));

    case 'psych':
      return parseFloat((Math.floor(base) - 0.01).toFixed(2));

    case 'dynamic':
      // competitorPrice is pre-calculated by computePricingWithCompetitors and stored on
      // the product when the pipeline runs with SERPAPI_KEY set.
      if (product.competitorPrice && product.competitorPrice > 0) {
        return product.competitorPrice;
      }
      // Fallback: 3% below our listed price (conservative undercut)
      return parseFloat((base * 0.97).toFixed(2));

    default:
      return base;
  }
}
