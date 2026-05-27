/**
 * app/services/intelligence/pii-strip.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PII anonymization for social signals.
 *
 * Strips personally identifiable information from signal text before storage:
 *   - Reddit usernames (u/name)
 *   - Social handles (@username)
 *   - Email addresses
 *   - Phone numbers
 *   - Tracking/UTM parameters from URLs
 *
 * Called inside createSignal() so every scanner benefits automatically.
 */

// ─── Patterns ──────────────────────────────────────────────────────────────

const REDDIT_USER   = /\/?u\/[\w-]{3,20}/gi;
const SOCIAL_HANDLE = /@[\w]{1,15}\b/g;
const EMAIL         = /[\w.+-]+@[\w-]+\.[\w.]+/gi;
const PHONE         = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/g;

// UTM and common tracking query params
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'dclid', 'msclkid', 'twclid', 'igshid',
  'ref', 'ref_src', 'ref_url', '_ga', 'mc_cid', 'mc_eid',
]);

// ─── Text sanitization ────────────────────────────────────────────────────

/**
 * Strip PII from a text string.
 * @param {string} text — signal title, body, or any free-text field
 * @returns {string} sanitized text with PII replaced by placeholders
 */
export function stripPII(text) {
  if (!text || typeof text !== 'string') return text || '';

  return text
    .replace(REDDIT_USER,   '[user]')
    .replace(EMAIL,         '[email]')
    .replace(SOCIAL_HANDLE, '[user]')
    .replace(PHONE,         '[phone]');
}

// ─── URL sanitization ──────────────────────────────────────────────────────

/**
 * Remove tracking/UTM query parameters from a URL.
 * @param {string} url
 * @returns {string} cleaned URL
 */
export function stripTrackingParams(url) {
  if (!url || typeof url !== 'string') return url || '';

  try {
    const parsed = new URL(url);
    let changed = false;

    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key);
        changed = true;
      }
    }

    return changed ? parsed.toString() : url;
  } catch {
    // Not a valid URL — return as-is
    return url;
  }
}

// ─── Combined sanitizer ────────────────────────────────────────────────────

/**
 * Sanitize a signal object's text fields and URL in place.
 * @param {{ title?: string, body?: string, url?: string }} signal
 * @returns {void} mutates signal
 */
export function sanitizeSignal(signal) {
  if (signal.title) signal.title = stripPII(signal.title);
  if (signal.body)  signal.body  = stripPII(signal.body);
  if (signal.url)   signal.url   = stripTrackingParams(signal.url);
}
