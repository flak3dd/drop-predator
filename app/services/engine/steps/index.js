/**
 * engine/steps/index.js
 * Step registry — defines the pipeline as an ordered list of named steps.
 * Each step maps to a handler module with an execute(context) function.
 */

export const StepStatus = Object.freeze({
  PENDING:   'PENDING',
  RUNNING:   'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED:    'FAILED',
  SKIPPED:   'SKIPPED',
});

export const RunStatus = Object.freeze({
  QUEUED:    'QUEUED',
  RUNNING:   'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED:    'FAILED',
  STOPPED:   'STOPPED',
  TIMED_OUT: 'TIMED_OUT',
});

export const STEPS = [
  {
    name: 'risk_check',
    label: 'Risk checks',
    phase: 1,
    required: true,
    maxRetries: 1,
    timeoutMs: 30_000,
  },
  {
    name: 'scout',
    label: 'Scouting products',
    phase: 1,
    required: true,
    maxRetries: 2,
    timeoutMs: 60_000,
  },
  {
    name: 'brand_research',
    label: 'Brand research',
    phase: 1,
    required: false,
    maxRetries: 1,
    timeoutMs: 45_000,
  },
  {
    name: 'score_filter',
    label: 'Scoring & filtering',
    phase: 2,
    required: true,
    maxRetries: 1,
    timeoutMs: 30_000,
  },
  {
    name: 'negotiate',
    label: 'Negotiating suppliers',
    phase: 3,
    required: false,
    maxRetries: 1,
    timeoutMs: 120_000,
  },
  {
    name: 'budget_gate',
    label: 'Budget check',
    phase: 3,
    required: true,
    maxRetries: 0,
    timeoutMs: 10_000,
  },
  {
    name: 'price',
    label: 'Dynamic pricing',
    phase: 4,
    required: false,
    maxRetries: 1,
    timeoutMs: 60_000,
  },
  {
    name: 'import',
    label: 'Importing listings',
    phase: 5,
    required: false,
    maxRetries: 1,
    timeoutMs: 120_000,
  },
  {
    name: 'finalize',
    label: 'Finalizing',
    phase: 6,
    required: true,
    maxRetries: 0,
    timeoutMs: 15_000,
  },
];

const _handlers = new Map();

export function registerStep(name, handler) {
  _handlers.set(name, handler);
}

export function getStepHandler(name) {
  return _handlers.get(name) || null;
}

export function getStepConfig(name) {
  return STEPS.find(s => s.name === name) || null;
}
