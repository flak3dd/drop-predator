/**
 * app/services/risk/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Risk & Compliance Module — public API.
 *
 * Provides automated guardrails for the engine and order flow:
 *   • Refund rate monitoring & auto-pause
 *   • Per-order and daily spend caps
 *   • AliExpress account health checks
 *   • Circuit breaker for supplier API resilience
 *   • Combined risk reporting for pipeline pre-flight
 *
 * Usage:
 *   import { risk } from '../services/risk/index.js';
 *   const report = await risk.runChecks(shop, admin);
 *   const capCheck = await risk.checkOrderCaps({ shop, totalCost: 150 });
 */

import {
  runRiskChecks,
  checkRefundRate,
  checkOrderCaps,
  checkAliAccountHealth,
  autoStopEngine,
  DEFAULT_CAPS,
} from './risk-guard.js';

import {
  CircuitBreaker,
  breakers,
  getBreaker,
  allBreakerStatus,
} from './circuit-breaker.js';

// ─── Convenience facade ─────────────────────────────────────────────────────

export const risk = {
  // Combined risk report
  runChecks: runRiskChecks,

  // Individual checks
  checkRefundRate,
  checkOrderCaps,
  checkAliAccountHealth,

  // Engine control
  autoStopEngine,

  // Defaults
  DEFAULT_CAPS,

  // Circuit breaker
  getBreaker,
  allBreakerStatus,
};

// Re-export everything for granular imports
export {
  runRiskChecks,
  checkRefundRate,
  checkOrderCaps,
  checkAliAccountHealth,
  autoStopEngine,
  DEFAULT_CAPS,
  CircuitBreaker,
  breakers,
  getBreaker,
  allBreakerStatus,
};
