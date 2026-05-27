/**
 * app/services/intelligence/trend-cagr.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Trend growth-rate analysis using Compound Annual Growth Rate (CAGR)
 * instead of simple linear velocity (end − start).
 *
 * CAGR smooths out short-term noise and gives a normalized growth metric
 * that is comparable across keywords with different absolute volumes.
 *
 * Usage:
 *   import { computeTrendCAGR } from './trend-cagr.js';
 *   const metrics = computeTrendCAGR([10, 22, 38, 55, 72]);
 *   // { cagr: 0.63, weeklyCagr: 0.12, velocity: 62, acceleration: 0.34,
 *   //   trendDirection: 'explosive' }
 */

/**
 * Compute CAGR and related trend metrics from a timeseries of interest values.
 *
 * @param {number[]} values — sequential data points (e.g. Google Trends weekly values)
 * @returns {{ cagr: number, weeklyCagr: number, velocity: number,
 *             acceleration: number, trendDirection: string }}
 */
export function computeTrendCAGR(values) {
  const result = {
    cagr: 0,
    weeklyCagr: 0,
    velocity: 0,
    acceleration: 0,
    trendDirection: 'stable',
  };

  if (!values || values.length < 2) return result;

  const clean = values.map(v => Math.max(0, Number(v) || 0));
  const startValue = clean[0] || 1; // avoid division by zero
  const endValue = clean[clean.length - 1] || 0;
  const periods = clean.length - 1;

  // ── Linear velocity (preserved for backward compat) ────────────────────
  result.velocity = endValue - startValue;

  // ── CAGR: (end/start)^(1/periods) - 1 ─────────────────────────────────
  if (startValue > 0 && endValue > 0) {
    result.cagr = Math.pow(endValue / startValue, 1 / periods) - 1;
  } else if (startValue === 0 && endValue > 0) {
    // From zero — infinite growth technically, cap at 1.0 (100%)
    result.cagr = 1.0;
  } else {
    result.cagr = endValue > startValue ? 0.1 : -0.1;
  }

  // Weekly equivalent (for display/comparison)
  result.weeklyCagr = result.cagr; // values are already weekly in Google Trends

  // ── Acceleration: compare first-half vs second-half growth ─────────────
  const mid = Math.floor(clean.length / 2);
  if (mid > 0 && clean.length >= 4) {
    const firstHalf = clean.slice(0, mid);
    const secondHalf = clean.slice(mid);

    const firstGrowth = (firstHalf[firstHalf.length - 1] - firstHalf[0]) / Math.max(1, firstHalf[0] || 1);
    const secondGrowth = (secondHalf[secondHalf.length - 1] - secondHalf[0]) / Math.max(1, secondHalf[0] || 1);

    result.acceleration = secondGrowth - firstGrowth;
  }

  // ── Trend direction classification ─────────────────────────────────────
  const cagrPct = result.cagr * 100;
  if (cagrPct > 50)        result.trendDirection = 'explosive';
  else if (cagrPct > 10)   result.trendDirection = 'growing';
  else if (cagrPct > -10)  result.trendDirection = 'stable';
  else if (cagrPct > -30)  result.trendDirection = 'declining';
  else                     result.trendDirection = 'collapsing';

  // Round for readability
  result.cagr = parseFloat(result.cagr.toFixed(4));
  result.weeklyCagr = parseFloat(result.weeklyCagr.toFixed(4));
  result.acceleration = parseFloat(result.acceleration.toFixed(4));

  return result;
}

/**
 * Map CAGR metrics to a sentiment value for use in signal scoring.
 *
 * @param {{ cagr: number, acceleration: number }} metrics
 * @returns {number} sentiment from -1.0 to 1.0
 */
export function cagrToSentiment(metrics) {
  const cagrPct = (metrics.cagr || 0) * 100;
  const accel = metrics.acceleration || 0;

  let base;
  if (cagrPct > 50)       base = 0.8;
  else if (cagrPct > 20)  base = 0.6;
  else if (cagrPct > 10)  base = 0.4;
  else if (cagrPct > 0)   base = 0.2;
  else if (cagrPct > -10) base = 0;
  else if (cagrPct > -20) base = -0.3;
  else                    base = -0.5;

  // Accelerating trends get a boost, decelerating get a penalty
  const accelBonus = Math.max(-0.2, Math.min(0.2, accel * 0.1));

  return parseFloat(Math.max(-1, Math.min(1, base + accelBonus)).toFixed(2));
}
