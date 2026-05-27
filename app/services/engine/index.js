/**
 * app/services/engine/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Engine Core Module — public API.
 *
 * The autonomous product lifecycle engine:
 *   • 9-step state machine (risk → scout → brand → score → negotiate → budget → price → import → finalize)
 *   • Per-shop concurrency locks with crash-safe cleanup
 *   • Resumable runs with DB-persisted step state
 *   • Live product catalog with supplier routing
 *
 * Usage:
 *   import { engine } from '../services/engine/index.js';
 *   const { runId } = await engine.start(shop, 'gym', config, admin);
 *   const status = await engine.getStatus(shop);
 *   await engine.stop(shop);
 */

import {
  startEngine,
  stopEngine,
  getEngineStatus,
  getEngineProducts,
  negotiateProduct,
  setPriceMode,
  resumeRun,
  STEPS,
  StepStatus,
  RunStatus,
} from './pipeline.js';

import { startRun } from './orchestrator.js';
import { acquireLock, releaseLock, renewLock, cleanStaleLocks } from './concurrency.js';
import { fetchLiveProducts } from './live-catalog.js';

// ─── Convenience facade ─────────────────────────────────────────────────────

export const engine = {
  // Pipeline control
  start: startEngine,
  stop: stopEngine,
  getStatus: getEngineStatus,
  getProducts: getEngineProducts,

  // Product operations
  negotiateProduct,
  setPriceMode,

  // Orchestrator
  startRun,
  resumeRun,

  // Concurrency
  acquireLock,
  releaseLock,
  renewLock,
  cleanStaleLocks,

  // Catalog
  fetchLiveProducts,

  // Step definitions
  STEPS,
  StepStatus,
  RunStatus,
};

// Re-export everything for granular imports
export {
  startEngine,
  stopEngine,
  getEngineStatus,
  getEngineProducts,
  negotiateProduct,
  setPriceMode,
  resumeRun,
  startRun,
  acquireLock,
  releaseLock,
  renewLock,
  cleanStaleLocks,
  fetchLiveProducts,
  STEPS,
  StepStatus,
  RunStatus,
};
