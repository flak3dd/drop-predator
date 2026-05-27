/**
 * app/services/intelligence/intent-scorer.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Purchase Intent Scoring — classifies social signal text by buying intent.
 *
 * Uses a three-tier lexicon (HIGH / MEDIUM / NEGATIVE intent phrases) with
 * weighted scoring to produce a 0-100 purchase intent score.
 *
 * Usage:
 *   import { scorePurchaseIntent, computeProductIntent } from './intent-scorer.js';
 *   const score = scorePurchaseIntent("just bought this and it's amazing");
 *   // → 82
 */

// ─── Intent lexicons ───────────────────────────────────────────────────────

const HIGH_INTENT = [
  'where can i buy', 'where to buy', 'just bought', 'just ordered',
  'add to cart', 'in stock', 'sold out', 'back in stock', 'coupon code',
  'discount code', 'promo code', 'how much does', 'price drop',
  'buying this', 'ordered mine', 'take my money', 'shut up and take',
  'link please', 'drop the link', 'need this', 'want this so bad',
  'just got mine', 'copped this',
];
const HIGH_WEIGHT = 15;

const MEDIUM_INTENT = [
  'worth it', 'recommend', 'should i buy', 'alternative to',
  'review', 'compared to', 'vs', 'better than', 'upgrade from',
  'thinking about getting', 'looking for', 'any suggestions',
  'best budget', 'affordable', 'deal on', 'on sale',
  'worth the price', 'bang for buck', 'value for money',
];
const MEDIUM_WEIGHT = 7;

const NEG_INTENT = [
  'waste of money', 'scam', 'refund', 'broke after', 'fell apart',
  'returned it', 'do not buy', "don't buy", 'terrible quality',
  'cheaply made', 'false advertising', 'misleading', 'knockoff',
  'rip off', 'ripoff', 'overpriced junk', 'buyer beware',
];
const NEG_WEIGHT = -12;

// ─── Single-text scoring ───────────────────────────────────────────────────

/**
 * Score the purchase intent of a text string.
 *
 * @param {string} text — signal title, body, or combined text
 * @returns {number} 0-100 intent score (higher = stronger buying intent)
 */
export function scorePurchaseIntent(text) {
  if (!text || typeof text !== 'string') return 0;

  const lower = text.toLowerCase();
  let rawScore = 0;
  let matchCount = 0;

  for (const phrase of HIGH_INTENT) {
    if (lower.includes(phrase)) {
      rawScore += HIGH_WEIGHT;
      matchCount++;
    }
  }

  for (const phrase of MEDIUM_INTENT) {
    if (lower.includes(phrase)) {
      rawScore += MEDIUM_WEIGHT;
      matchCount++;
    }
  }

  for (const phrase of NEG_INTENT) {
    if (lower.includes(phrase)) {
      rawScore += NEG_WEIGHT;
      matchCount++;
    }
  }

  if (matchCount === 0) return 0;

  // Sigmoid-like normalization to 0-100
  // rawScore typically ranges from -24 to ~50+
  const normalized = 100 / (1 + Math.exp(-0.12 * rawScore));

  return Math.max(0, Math.min(100, Math.round(normalized)));
}

// ─── Product-level intent ──────────────────────────────────────────────────

/**
 * Compute aggregate purchase intent for a product based on related signals.
 *
 * @param {{ name: string }} product — product with a name field
 * @param {object[]} signals — array of Signal objects
 * @returns {{ intentScore: number, intentSignals: number, intentBreakdown: object }}
 */
export function computeProductIntent(product, signals) {
  if (!product?.name || !signals?.length) {
    return { intentScore: 0, intentSignals: 0, intentBreakdown: {} };
  }

  const nameLower = product.name.toLowerCase();
  const nameWords = nameLower.split(/\s+/).filter(w => w.length > 3);

  // Find signals that mention this product
  const related = signals.filter(s => {
    const text = `${s.title} ${s.body}`.toLowerCase();
    // At least 2 significant words from the product name must appear
    const matches = nameWords.filter(w => text.includes(w));
    return matches.length >= Math.min(2, nameWords.length);
  });

  if (related.length === 0) {
    return { intentScore: 0, intentSignals: 0, intentBreakdown: {} };
  }

  // Score each related signal
  const scores = related.map(s => scorePurchaseIntent(`${s.title} ${s.body}`));
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Weight by signal count (more mentions = stronger signal)
  const countBoost = Math.min(20, related.length * 4);

  const breakdown = {
    avgSignalIntent: Math.round(avgScore),
    relatedSignals: related.length,
    countBoost,
    highIntentCount: scores.filter(s => s > 65).length,
    negIntentCount: scores.filter(s => s < 30 && s > 0).length,
  };

  return {
    intentScore: Math.max(0, Math.min(100, Math.round(avgScore + countBoost))),
    intentSignals: related.length,
    intentBreakdown: breakdown,
  };
}
