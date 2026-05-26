/**
 * app/services/core/event-bus.js
 * ─────────────────────────────────────────────────────────────────────────────
 * In-process typed event bus.
 *
 * Today: synchronous in-process dispatch with async handlers.
 * Tomorrow: swap `publish` for an Inngest / BullMQ call — zero handler changes.
 *
 * Events
 * ──────
 * engine.run.started       { runId, shop, niche }
 * engine.phase.changed     { runId, shop, phase, phaseSub }
 * engine.scout.complete    { runId, shop, count }
 * engine.products.scored   { runId, shop, passed, total }
 * engine.negotiate.done    { runId, shop, dealsClosed, aiCalls, algoCalls }
 * engine.pricing.done      { runId, shop, modes: { surge, dynamic, psych, undercut, standard } }
 * engine.import.done       { runId, shop, imported, failed }
 * engine.run.complete      { runId, shop, stats }
 * engine.run.stopped       { runId, shop, reason }
 * engine.run.error         { runId, shop, error }
 * engine.budget.exceeded   { runId, shop, spent, budget }
 * supplier.order.placed    { shop, orderId, via, shopifyOrderId }
 * supplier.order.failed    { shop, shopifyOrderId, error, supplier }
 * supplier.health.degraded { supplier, errorRate }
 * risk.alert               { shop, type, value, threshold }
 */

// ─── Registry ──────────────────────────────────────────────────────────────

/** @type {Map<string, Array<{handler: Function, once: boolean}>>} */
const _handlers = new Map();

// ─── Core API ──────────────────────────────────────────────────────────────

/**
 * Subscribe to an event.
 *
 * @param {string}   event
 * @param {Function} handler  — async (payload) => void
 * @returns {Function}         — unsubscribe function
 */
export function on(event, handler) {
  if (!_handlers.has(event)) _handlers.set(event, []);
  const entry = { handler, once: false };
  _handlers.get(event).push(entry);
  return () => off(event, handler);
}

/**
 * Subscribe to an event once.
 */
export function once(event, handler) {
  if (!_handlers.has(event)) _handlers.set(event, []);
  const entry = { handler, once: true };
  _handlers.get(event).push(entry);
  return () => off(event, handler);
}

/**
 * Unsubscribe a specific handler.
 */
export function off(event, handler) {
  const list = _handlers.get(event);
  if (!list) return;
  _handlers.set(event, list.filter(e => e.handler !== handler));
}

/**
 * Publish an event. Fires all handlers in parallel.
 * Non-throwing — errors in handlers are logged but don't propagate.
 *
 * @param {string} event
 * @param {object} payload
 */
export async function publish(event, payload = {}) {
  const list = _handlers.get(event) || [];
  const toRun = [...list];

  // Remove once-handlers before running (avoid double-fire in race)
  _handlers.set(event, list.filter(e => !e.once));

  if (!toRun.length) return;

  await Promise.allSettled(
    toRun.map(({ handler }) =>
      Promise.resolve(handler({ event, ...payload })).catch(err =>
        console.error(`[event-bus] handler error on "${event}":`, err.message),
      ),
    ),
  );
}

/**
 * Synchronous fire-and-forget variant — returns immediately.
 * Use for non-critical events where you don't want to await handlers.
 */
export function emit(event, payload = {}) {
  publish(event, payload).catch(err =>
    console.error(`[event-bus] async emit error "${event}":`, err.message),
  );
}

// ─── Typed helpers ──────────────────────────────────────────────────────────
// These document what each event looks like and enforce payload shape.

export const Events = Object.freeze({
  ENGINE_STARTED:          'engine.run.started',
  ENGINE_PHASE_CHANGED:    'engine.phase.changed',
  ENGINE_SCOUT_COMPLETE:   'engine.scout.complete',
  ENGINE_PRODUCTS_SCORED:  'engine.products.scored',
  ENGINE_NEGOTIATE_DONE:   'engine.negotiate.done',
  ENGINE_PRICING_DONE:     'engine.pricing.done',
  ENGINE_IMPORT_DONE:      'engine.import.done',
  ENGINE_COMPLETE:         'engine.run.complete',
  ENGINE_STOPPED:          'engine.run.stopped',
  ENGINE_ERROR:            'engine.run.error',
  ENGINE_BUDGET_EXCEEDED:  'engine.budget.exceeded',
  SUPPLIER_ORDER_PLACED:   'supplier.order.placed',
  SUPPLIER_ORDER_FAILED:   'supplier.order.failed',
  SUPPLIER_DEGRADED:       'supplier.health.degraded',
  RISK_ALERT:              'risk.alert',
});

// ─── Default system listeners ───────────────────────────────────────────────
// Wire these up once at app startup. They log key events and can trigger
// side effects (Sentry, Slack, DB writes) in future.

let _defaultListenersRegistered = false;

export function registerDefaultListeners() {
  if (_defaultListenersRegistered) return;
  _defaultListenersRegistered = true;
  on(Events.ENGINE_BUDGET_EXCEEDED, ({ runId, shop, spent, budget }) => {
    console.warn(`[event-bus] 💸 Budget exceeded: ${shop} run=${runId} $${spent.toFixed(4)} > $${budget}`);
  });

  on(Events.ENGINE_ERROR, ({ runId, shop, error }) => {
    console.error(`[event-bus] 💥 Engine error: ${shop} run=${runId}: ${error}`);
  });

  on(Events.SUPPLIER_DEGRADED, ({ supplier, errorRate }) => {
    console.warn(`[event-bus] ⚠️  Supplier degraded: ${supplier} (${errorRate.toFixed(0)}% errors)`);
  });

  on(Events.RISK_ALERT, ({ shop, type, value, threshold }) => {
    console.warn(`[event-bus] 🚨 Risk alert [${shop}] ${type}: ${value} > threshold ${threshold}`);
  });

  on(Events.ENGINE_STOPPED, ({ shop, reason }) => {
    if (reason) console.warn(`[event-bus] 🛑 Engine stopped [${shop}]: ${reason}`);
  });
}

// ─── Inngest migration stub ─────────────────────────────────────────────────
// When you're ready to move to Inngest:
//
//   import { Inngest } from 'inngest';
//   const inngest = new Inngest({ id: 'drop-predator' });
//
//   export async function publish(event, payload) {
//     await inngest.send({ name: event, data: payload });
//   }
//
// Handlers become Inngest functions via inngest.createFunction().
// The on/once/off API stays for in-process subscribers that don't need durability.
