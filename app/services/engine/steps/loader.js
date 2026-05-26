/**
 * Import all step modules to trigger their registerStep() calls.
 * Must be imported once before the orchestrator runs.
 */
import './risk-check.js';
import './scout.js';
import './brand-research.js';
import './score-filter.js';
import './negotiate.js';
import './budget-gate.js';
import './price.js';
import './import.js';
import './finalize.js';
