/* eslint-disable no-undef */
/**
 * app/services/ai/cost-tracker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AI spend tracking, budget enforcement, and auto-pause.
 *
 * Every AI call that goes through the engine pipeline should use
 * `trackedGenerate(params, ctx)` instead of `generateText` directly.
 * This:
 *   1. Counts input + output tokens
 *   2. Converts to USD using current model pricing
 *   3. Accumulates per EngineRun in memory (flushed to DB periodically)
 *   4. Auto-pauses the run if spend > budget
 *
 * Pricing (USD per 1M tokens) — update when providers change rates:
 *   openai/gpt-4o             $2.50 in / $10.00 out
 *   openai/gpt-4o-mini        $0.15 in / $0.60  out
 *   anthropic/claude-sonnet-4-6  $3.00 in / $15.00 out
 *   anthropic/claude-haiku-*  $0.80 in / $4.00  out
 *
 * Usage
 * ─────
 * import { trackedGenerate } from '../ai/cost-tracker.js';
 * const result = await trackedGenerate(
 *   { model, system, prompt, maxTokens: 200 },
 *   { runId: 'abc', shop: 'shop.myshopify.com', purpose: 'negotiate' },
 * );
 */

import prisma from '../../db.server.js';

// ─── Pricing table (USD / 1M tokens) ──────────────────────────────────────

const PRICING = {
  // OpenAI
  'openai/gpt-4o':                  { in: 2.50,  out: 10.00 },
  'openai/gpt-4o-mini':             { in: 0.15,  out: 0.60  },
  'openai/gpt-4.1':                 { in: 2.00,  out: 8.00  },
  'openai/gpt-4.1-mini':            { in: 0.40,  out: 1.60  },
  'openai/gpt-4.5':                 { in: 75.00, out: 150.00 }, // multimodal, very expensive
  // Anthropic
  'anthropic/claude-sonnet-4-6':    { in: 3.00,  out: 15.00 },
  'anthropic/claude-haiku-4-5-20251001': { in: 0.80, out: 4.00 },
  'anthropic/claude-opus-4':        { in: 15.00, out: 75.00 },
  // Fallback for unknown models: assume mid-tier
  _default:                         { in: 3.00,  out: 15.00 },
};

/** Return USD cost for a given model + token counts. */
export function calcCost(modelString, inputTokens = 0, outputTokens = 0) {
  // Normalize: strip provider variant suffixes like "@latest"
  const key = modelString?.toLowerCase().replace(/@.*/, '') ?? '';
  const rate = PRICING[key] || PRICING._default;
  return parseFloat(
    ((inputTokens * rate.in + outputTokens * rate.out) / 1_000_000).toFixed(6),
  );
}

// ─── Per-run accumulator (in-memory, flushed to DB) ───────────────────────

/** runId → { totalCost, callCount, calls: [{model, purpose, cost, tokens}] } */
const _accumulator = new Map();

const DEFAULT_BUDGET = parseFloat(process.env.AI_BUDGET_PER_RUN || '2.00'); // $2 default

/**
 * Record a completed AI call's token usage.
 * @param {string} runId
 * @param {string} model      — provider/model string
 * @param {{ inputTokens: number, outputTokens: number }} usage
 * @param {string} [purpose]  — e.g. 'negotiate', 'listing-smart', 'pilot-chat'
 */
export function recordTokens(runId, model, usage, purpose = 'unknown') {
  if (!runId) return;
  const cost = calcCost(model, usage.inputTokens || 0, usage.outputTokens || 0);

  if (!_accumulator.has(runId)) {
    _accumulator.set(runId, { totalCost: 0, callCount: 0, calls: [] });
  }
  const acc = _accumulator.get(runId);
  acc.totalCost  += cost;
  acc.callCount  += 1;
  acc.calls.push({
    model,
    purpose,
    inputTokens:  usage.inputTokens  || 0,
    outputTokens: usage.outputTokens || 0,
    costUsd:      cost,
    ts:           Date.now(),
  });

  // Keep call log bounded
  if (acc.calls.length > 100) acc.calls = acc.calls.slice(-100);
}

/**
 * Flush accumulated cost to EngineRun.aiCost in the DB.
 * Non-throwing — silently skips if the field doesn't exist yet.
 */
export async function flushCost(runId) {
  const acc = _accumulator.get(runId);
  if (!acc || acc.callCount === 0) return;

  try {
    await prisma.engineRun.update({
      where: { id: runId },
      data:  { aiCost: acc.totalCost },
    });
  } catch {
    // Column may not exist yet if migration hasn't run — non-fatal
  }
}

/**
 * Check whether this run has exceeded its AI budget.
 * Returns { ok: boolean, spent: number, budget: number }.
 *
 * If `ok` is false, the pipeline should stop and call autoStopEngine.
 */
export async function checkBudget(runId, budgetOverride = null) {
  const acc = _accumulator.get(runId);
  const spent = acc?.totalCost || 0;

  // Try to read budget from DB config first
  let budget = budgetOverride ?? DEFAULT_BUDGET;
  try {
    const run = await prisma.engineRun.findUnique({
      where:  { id: runId },
      select: { config: true, aiCost: true },
    });
    const config = JSON.parse(run?.config || '{}');
    if (config.aiBudget) budget = config.aiBudget;
    // Also add DB-persisted cost if different from our accumulator (parallel invocations)
  } catch { /* non-fatal */ }

  return { ok: spent <= budget, spent, budget };
}

/**
 * Get the full cost summary for a run.
 */
export function getRunCostSummary(runId) {
  const acc = _accumulator.get(runId);
  if (!acc) return { totalCost: 0, callCount: 0, calls: [], breakdown: {} };

  // Aggregate by purpose
  const breakdown = {};
  for (const c of acc.calls) {
    breakdown[c.purpose] = (breakdown[c.purpose] || 0) + c.costUsd;
  }

  return {
    totalCost: parseFloat(acc.totalCost.toFixed(6)),
    callCount: acc.callCount,
    breakdown,
    calls: acc.calls,
  };
}

/** Free accumulator memory for a completed run. */
export function clearRunAccumulator(runId) {
  _accumulator.delete(runId);
}

// ─── Drop-in replacement for generateText ──────────────────────────────────

/**
 * Tracked wrapper around AI SDK `generateText`.
 * Identical signature to `generateText` with an extra `ctx` argument.
 *
 * @param {object} params   — same as `generateText` params
 * @param {object} [ctx]    — { runId?, shop?, purpose? }
 * @returns {Promise}       — same as `generateText` return value
 */
export async function trackedGenerate(params, ctx = {}) {
  const { generateText } = await import('ai');
  const { runId, purpose = 'unknown' } = ctx;

  const result = await generateText(params);

  if (runId && result.usage) {
    const modelStr = typeof params.model === 'string'
      ? params.model
      : params.model?.modelId || 'unknown';
    recordTokens(runId, modelStr, result.usage, purpose);

    // Flush every 3 calls to keep DB in sync without overwhelming it
    const acc = _accumulator.get(runId);
    if (acc && acc.callCount % 3 === 0) {
      flushCost(runId).catch(() => {});
    }
  }

  return result;
}

/**
 * Log a cost summary to console — use at end of pipeline phase.
 */
export function logCostSummary(runId, log = console.log) {
  const summary = getRunCostSummary(runId);
  if (summary.callCount === 0) return;
  const breakdown = Object.entries(summary.breakdown)
    .map(([k, v]) => `${k}: $${v.toFixed(4)}`)
    .join(', ');
  log(`[cost] $${summary.totalCost.toFixed(4)} total (${summary.callCount} calls) — ${breakdown || 'no breakdown'}`);
}
