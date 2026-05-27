/* eslint-disable no-undef */
/**
 * app/services/engine/risk-guard.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Automated risk management for the engine pipeline and order flow.
 *
 * Guards
 * ──────
 * • Refund-rate auto-pause  — shops exceeding X% refund rate are flagged/stopped
 * • Order value caps        — single-order + daily spend limits per shop
 * • AliExpress account health — token validity + 7-day order error rate
 * • Engine auto-stop        — writes STOPPED + reason to DB, logs to console
 * • Combined risk report    — `runRiskChecks(shop, admin)` for pipeline Phase 1
 */

import prisma from '../../db.server.js';

// ─── Default thresholds (overridable per-call) ────────────────────────────

export const DEFAULT_CAPS = {
  maxOrderValueUsd:       500,   // Per-order hard cap
  maxDailySpendUsd:       2000,  // Per-shop daily rolling cap
  refundRateThreshold:    0.08,  // 8% = auto-pause (30-day window)
  refundRateWarnAt:       0.04,  // 4% = warning only
  aliErrorRateThreshold:  0.20,  // 20% FAILED orders in 7d = flag
  aliTokenWarnHours:      24,    // Warn when token expires within this window
};

// ─── Refund Rate ───────────────────────────────────────────────────────────

/**
 * Check the shop's refund rate over the last 30 days via Shopify Admin GraphQL.
 *
 * Returns { refundRate, refundCount, orderCount, ok, reason, checkError? }
 *
 * @param {object} admin      — Shopify Admin graphql client
 * @param {object} [opts]     — { threshold: 0.08 }
 */
export async function checkRefundRate(admin, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_CAPS.refundRateThreshold;
  const warnAt    = opts.warnAt    ?? DEFAULT_CAPS.refundRateWarnAt;

  try {
    const since = thirtyDaysAgo();
    const res = await admin.graphql(`
      query RefundRateCheck {
        orders(first: 250, query: "created_at:>='${since}'") {
          edges {
            node {
              id
              refunds { id }
            }
          }
        }
      }
    `);
    const { data } = await res.json();
    const edges      = data?.orders?.edges || [];
    const orderCount = edges.length;
    const refundCount = edges.filter(e => (e.node.refunds?.length || 0) > 0).length;
    const refundRate  = orderCount > 0 ? refundCount / orderCount : 0;

    const blocker = refundRate >= threshold
      ? `Refund rate ${pct(refundRate)} exceeds ${pct(threshold)} threshold (${refundCount}/${orderCount} orders in last 30d)`
      : null;

    const warning = !blocker && refundRate >= warnAt
      ? `Refund rate ${pct(refundRate)} — trending toward auto-pause threshold of ${pct(threshold)}`
      : null;

    return { refundRate, refundCount, orderCount, ok: !blocker, reason: blocker, warning };
  } catch (err) {
    // Can't check — assume OK but surface the error
    return { refundRate: 0, refundCount: 0, orderCount: 0, ok: true, reason: null, checkError: err.message };
  }
}

// ─── Order Value Caps ─────────────────────────────────────────────────────

/**
 * Validate a proposed order against value caps before placement.
 *
 * @param {{ shop: string, totalCost: number, supplier?: string }} order
 * @param {object} [caps]   — partial overrides for DEFAULT_CAPS
 * @returns {Promise<{ ok: boolean, violations: string[] }>}
 */
export async function checkOrderCaps(order, caps = {}) {
  const c = { ...DEFAULT_CAPS, ...caps };
  const violations = [];

  // 1. Single-order hard cap
  if (order.totalCost > c.maxOrderValueUsd) {
    violations.push(
      `Order total $${order.totalCost.toFixed(2)} exceeds per-order cap of $${c.maxOrderValueUsd}`,
    );
  }

  // 2. Daily rolling spend cap
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const todayOrders = await prisma.aliOrder.findMany({
      where: {
        shop:    order.shop,
        status:  { notIn: ['CANCELLED', 'FAILED'] },
        createdAt: { gte: dayStart },
      },
      select: { totalCost: true },
    });

    const spent    = todayOrders.reduce((s, o) => s + (o.totalCost || 0), 0);
    const newTotal = spent + order.totalCost;

    if (newTotal > c.maxDailySpendUsd) {
      violations.push(
        `Daily spend would reach $${newTotal.toFixed(2)} — cap is $${c.maxDailySpendUsd} (already spent $${spent.toFixed(2)} today)`,
      );
    }
  } catch (err) {
    console.warn('[risk-guard] Daily spend check failed, proceeding cautiously:', err.message);
  }

  return { ok: violations.length === 0, violations };
}

// ─── AliExpress Account Health ────────────────────────────────────────────

/**
 * Check AliExpress account health:
 *   - Token expiry (blocker if expired, warning if < 24h)
 *   - 7-day order failure rate
 *
 * @param {string} shop
 * @returns {Promise<{ ok: boolean, issues: string[], warnings: string[] }>}
 */
export async function checkAliAccountHealth(shop) {
  const issues   = [];
  const warnings = [];

  try {
    const cred = await prisma.aliCredential.findUnique({ where: { shop } });

    if (!cred) {
      // Not a pipeline blocker — scouting/pricing works without AliExpress.
      // Only auto-ordering requires a connected account.
      warnings.push('AliExpress account not connected — auto-ordering will be unavailable until you connect via Settings');
      return { ok: true, issues, warnings };
    }

    // Token expiry
    const expiresInMs = (cred.accessTokenExpiry?.getTime() || 0) - Date.now();
    if (expiresInMs <= 0) {
      issues.push('AliExpress access token has expired — reconnect in Settings');
    } else if (expiresInMs < DEFAULT_CAPS.aliTokenWarnHours * 3_600_000) {
      warnings.push(
        `AliExpress token expires in ${Math.round(expiresInMs / 3_600_000)}h — reconnect soon`,
      );
    }

    // 7-day order failure rate
    const since7d = new Date(Date.now() - 7 * 24 * 3_600_000);
    const recent = await prisma.aliOrder.findMany({
      where: { shop, createdAt: { gte: since7d } },
      select: { status: true },
    });

    if (recent.length >= 5) {
      const failed    = recent.filter(o => o.status === 'FAILED').length;
      const errorRate = failed / recent.length;

      if (errorRate >= DEFAULT_CAPS.aliErrorRateThreshold) {
        issues.push(
          `AliExpress order failure rate ${pct(errorRate)} in last 7d (${failed}/${recent.length}) — check account or credentials`,
        );
      } else if (errorRate >= 0.10) {
        warnings.push(
          `AliExpress order failure rate ${pct(errorRate)} in last 7d (${failed}/${recent.length})`,
        );
      }
    }
  } catch (err) {
    issues.push(`Account health check error: ${err.message}`);
  }

  const blockerIssues = issues.filter(i => !i.includes('expires in'));
  return { ok: blockerIssues.length === 0, issues, warnings };
}

// ─── Engine Auto-Stop ─────────────────────────────────────────────────────

/**
 * Immediately stop all running engine runs for a shop and record the reason.
 * Safe to call even if no run is active.
 *
 * @param {string} shop
 * @param {string} reason   — human-readable reason for the auto-pause
 */
export async function autoStopEngine(shop, reason) {
  const tag = `AUTO-PAUSED: ${reason}`;
  try {
    await prisma.engineRun.updateMany({
      where:  { shop, status: 'RUNNING' },
      data:   { status: 'STOPPED', endedAt: new Date(), phaseSub: tag },
    });
  } catch (err) {
    console.error('[risk-guard] Failed to auto-stop engine:', err.message);
  }
  console.warn(`[risk-guard] ${shop} engine auto-stopped — ${reason}`);
}

// ─── Combined Risk Report ─────────────────────────────────────────────────

/**
 * Run all health checks and return a combined report.
 * Use at the start of the pipeline (after Phase 1 Scout, before Phase 3 Negotiate).
 *
 * Blockers  → engine should stop (or skip the affected phase)
 * Warnings  → engine can continue, but log for the operator
 *
 * @param {string}  shop
 * @param {object}  [admin]   — Shopify admin client (optional; skips refund check if null)
 * @returns {Promise<RiskReport>}
 */
export async function runRiskChecks(shop, admin = null) {
  const report = {
    ok:       true,
    blockers: [],
    warnings: [],
  };

  // AliExpress health
  const aliHealth = await checkAliAccountHealth(shop);
  report.blockers.push(...aliHealth.issues);
  report.warnings.push(...aliHealth.warnings);

  // Refund rate (only when Shopify admin is available)
  if (admin) {
    const refundCheck = await checkRefundRate(admin);
    if (refundCheck.checkError) {
      report.warnings.push(`Refund rate check unavailable: ${refundCheck.checkError}`);
    } else {
      if (!refundCheck.ok && refundCheck.reason) report.blockers.push(refundCheck.reason);
      if (refundCheck.warning) report.warnings.push(refundCheck.warning);
    }
  }

  report.ok = report.blockers.length === 0;
  return report;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function thirtyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split('T')[0];
}

function pct(r) {
  return `${(r * 100).toFixed(1)}%`;
}

/**
 * @typedef {Object} RiskReport
 * @property {boolean}  ok
 * @property {string[]} blockers   — stop-the-engine reasons
 * @property {string[]} warnings   — non-blocking but worth logging
 */
