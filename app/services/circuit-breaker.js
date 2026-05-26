/**
 * app/services/circuit-breaker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure-Node circuit breaker — no external dependency.
 *
 * States
 * ──────
 * CLOSED    → requests pass through, failures counted
 * OPEN      → requests blocked immediately with CircuitOpenError
 * HALF_OPEN → one probe request allowed; success closes it, failure re-opens
 *
 * Usage
 * ──────
 * import { getBreaker } from '../services/circuit-breaker.js';
 * const cb = getBreaker('cj-api');
 * const data = await cb.fire(() => fetch(url).then(r => r.json()));
 *
 * The global registry means getBreaker('cj-api') returns the same instance
 * everywhere in the process — state persists across calls within a deployment.
 *
 * Health endpoint
 * ───────────────
 * import { allBreakerStatus } from '../services/circuit-breaker.js';
 * // → [{ name, state, failures, successRate, nextRetry }]
 */

// ─── Error type ────────────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  constructor(name, retryAt) {
    const retryMs = Math.max(0, retryAt - Date.now());
    super(`Circuit OPEN: ${name} — retry in ${(retryMs / 1000).toFixed(1)}s`);
    this.name = 'CircuitOpenError';
    this.circuit = name;
    this.retryAt = retryAt;
    this.circuitOpen = true;
  }
}

// ─── Core breaker ──────────────────────────────────────────────────────────

class CircuitBreaker {
  static CLOSED    = 'CLOSED';
  static OPEN      = 'OPEN';
  static HALF_OPEN = 'HALF_OPEN';

  constructor(name, opts = {}) {
    this.name = name;
    this._state   = CircuitBreaker.CLOSED;
    this._failures  = 0;
    this._successes = 0;
    this._calls     = 0;
    this._nextRetry = 0;

    this._opts = {
      /** Consecutive failures before opening */
      failureThreshold:  opts.failureThreshold  ?? 5,
      /** Consecutive successes (in HALF_OPEN) before closing */
      successThreshold:  opts.successThreshold  ?? 2,
      /** ms to wait in OPEN before allowing a probe */
      timeout:           opts.timeout           ?? 30_000,
      /** Minimum call volume before opening (avoids opening on first flap) */
      volumeThreshold:   opts.volumeThreshold   ?? 3,
      /** Only count errors matching this predicate (default: 5xx or network) */
      isFailure: opts.isFailure ?? ((err) => !err.status || err.status >= 500),
      onOpen:     opts.onOpen     ?? null,
      onClose:    opts.onClose    ?? null,
      onHalfOpen: opts.onHalfOpen ?? null,
    };
  }

  // ── State machine ─────────────────────────────────────────────────────────

  get state() { return this._state; }

  _canAttempt() {
    if (this._state === CircuitBreaker.CLOSED)    return true;
    if (this._state === CircuitBreaker.HALF_OPEN) return true;
    if (this._state === CircuitBreaker.OPEN) {
      if (Date.now() >= this._nextRetry) {
        this._transition(CircuitBreaker.HALF_OPEN);
        return true; // one probe through
      }
      return false;
    }
    return true;
  }

  _onSuccess() {
    this._failures = 0;
    this._calls++;
    if (this._state === CircuitBreaker.HALF_OPEN) {
      this._successes++;
      if (this._successes >= this._opts.successThreshold) {
        this._transition(CircuitBreaker.CLOSED);
      }
    }
  }

  _onFailure(err) {
    this._calls++;
    if (!this._opts.isFailure(err)) return; // 4xx etc — don't count

    this._failures++;
    this._successes = 0;

    const shouldOpen =
      this._state !== CircuitBreaker.OPEN &&
      this._failures >= this._opts.failureThreshold &&
      this._calls    >= this._opts.volumeThreshold;

    if (shouldOpen || this._state === CircuitBreaker.HALF_OPEN) {
      this._transition(CircuitBreaker.OPEN);
    }
  }

  _transition(to) {
    const from = this._state;
    this._state = to;

    if (to === CircuitBreaker.OPEN) {
      this._nextRetry = Date.now() + this._opts.timeout;
      this._failures  = 0;
      console.warn(
        `[circuit-breaker] ⚡ OPEN: ${this.name}` +
        ` — blocked for ${this._opts.timeout / 1000}s`,
      );
      this._opts.onOpen?.(this.name, this._nextRetry);
    } else if (to === CircuitBreaker.CLOSED) {
      this._failures  = 0;
      this._successes = 0;
      console.log(`[circuit-breaker] ✅ CLOSED: ${this.name} — recovered`);
      this._opts.onClose?.(this.name);
    } else if (to === CircuitBreaker.HALF_OPEN) {
      this._successes = 0;
      console.log(`[circuit-breaker] 🔄 HALF_OPEN: ${this.name} — probing`);
      this._opts.onHalfOpen?.(this.name);
    }

    void from; // suppress linter
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Execute `fn` through the circuit breaker.
   * Throws CircuitOpenError immediately if OPEN.
   * All other errors propagate normally after recording failure.
   */
  async fire(fn) {
    if (!this._canAttempt()) {
      throw new CircuitOpenError(this.name, this._nextRetry);
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure(err);
      throw err;
    }
  }

  /**
   * Execute `fn` but return `fallback` value instead of throwing when OPEN.
   * Errors from `fn` itself still propagate after recording.
   */
  async fireWithFallback(fn, fallback) {
    try {
      return await this.fire(fn);
    } catch (err) {
      if (err.circuitOpen) return fallback;
      throw err;
    }
  }

  get status() {
    return {
      name:        this.name,
      state:       this._state,
      failures:    this._failures,
      totalCalls:  this._calls,
      nextRetry:   this._state === CircuitBreaker.OPEN
        ? new Date(this._nextRetry).toISOString()
        : null,
    };
  }
}

// ─── Global registry ───────────────────────────────────────────────────────

const _registry = new Map();

/**
 * Get (or create) a named circuit breaker.
 * Same name always returns the same instance within the process.
 *
 * @param {string} name
 * @param {object} [opts]  — only applied on first creation
 * @returns {CircuitBreaker}
 */
export function getBreaker(name, opts = {}) {
  if (!_registry.has(name)) {
    _registry.set(name, new CircuitBreaker(name, opts));
  }
  return _registry.get(name);
}

/**
 * Pre-configured breakers for every external service.
 * Import these directly to skip the getBreaker(name, opts) dance.
 */
export const breakers = {
  // Supplier APIs
  cj:          getBreaker('cj-api',          { failureThreshold: 4, timeout: 60_000 }),
  aliAffiliate: getBreaker('ali-affiliate',  { failureThreshold: 4, timeout: 60_000 }),
  aliDs:        getBreaker('ali-ds',         { failureThreshold: 5, timeout: 45_000 }),
  ali1688:      getBreaker('ali-1688',       { failureThreshold: 3, timeout: 30_000 }),

  // AI services
  aiGateway:   getBreaker('ai-gateway',      { failureThreshold: 3, timeout: 20_000,
    // 429 (rate limit) and 503 count as failures; 4xx auth errors don't
    isFailure: (err) => !err.status || err.status >= 500 || err.status === 429,
  }),

  // Enrichment
  serpapi:     getBreaker('serpapi',         { failureThreshold: 3, timeout: 30_000 }),
  brandResearch: getBreaker('brand-research', { failureThreshold: 2, timeout: 15_000 }),
  reddit:      getBreaker('reddit',          { failureThreshold: 5, timeout: 120_000,
    // Reddit 403 is "we banned your UA" not a transient error
    isFailure: (err) => err.status !== 403 && (!err.status || err.status >= 500),
  }),
};

/**
 * Snapshot of every breaker's current state — for a health/status endpoint.
 */
export function allBreakerStatus() {
  return [..._registry.values()].map(b => b.status);
}
