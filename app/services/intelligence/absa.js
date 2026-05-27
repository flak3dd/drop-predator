/**
 * app/services/intelligence/absa.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Aspect-Based Sentiment Analysis (ABSA)
 *
 * Extracts per-attribute sentiment scores for product-related signals:
 *   quality, value, shipping, packaging, usability
 *
 * Two-pass approach:
 *   1. Fast local pre-extraction via keyword matching
 *   2. Optional AI enrichment via Claude Haiku for top signals
 *
 * Usage:
 *   import { extractAspectMentions, aiAspectAnalysis, aggregateAspects } from './absa.js';
 *   const aspects = extractAspectMentions("Great quality but shipping was slow");
 *   // { quality: 0.8, shipping: -0.5, ... }
 */

// ─── Aspect keyword lexicons ───────────────────────────────────────────────

const ASPECT_KEYWORDS = {
  quality: {
    positive: ['quality', 'well made', 'durable', 'sturdy', 'solid', 'premium', 'excellent build',
               'high quality', 'well built', 'reliable', 'long lasting', 'heavy duty'],
    negative: ['cheap', 'flimsy', 'broke', 'broke after', 'fell apart', 'poor quality',
               'low quality', 'defective', 'fragile', 'thin', 'weak'],
  },
  value: {
    positive: ['worth it', 'great deal', 'good price', 'affordable', 'bang for buck',
               'value for money', 'great value', 'bargain', 'steal', 'best price'],
    negative: ['overpriced', 'too expensive', 'not worth', 'waste of money', 'rip off',
               'ripoff', 'better options', 'cheaper alternatives'],
  },
  shipping: {
    positive: ['fast shipping', 'quick delivery', 'arrived early', 'well packaged',
               'shipped quickly', 'fast delivery', 'next day', 'on time'],
    negative: ['slow shipping', 'took forever', 'delayed', 'late delivery', 'lost in transit',
               'shipping damage', 'never arrived', 'took weeks', 'took months'],
  },
  packaging: {
    positive: ['great packaging', 'well packaged', 'nice box', 'good packaging',
               'secure packaging', 'premium packaging', 'beautifully packaged'],
    negative: ['bad packaging', 'damaged box', 'poor packaging', 'arrived broken',
               'crushed box', 'no protection', 'minimal packaging'],
  },
  usability: {
    positive: ['easy to use', 'user friendly', 'intuitive', 'simple setup', 'works great',
               'works perfectly', 'easy setup', 'plug and play', 'straightforward'],
    negative: ['hard to use', 'complicated', 'confusing', 'difficult', 'poorly designed',
               'bad instructions', 'no instructions', 'frustrating', 'unusable'],
  },
};

const ASPECTS = Object.keys(ASPECT_KEYWORDS);

// ─── Local extraction ──────────────────────────────────────────────────────

/**
 * Extract aspect-level sentiment from text using keyword matching.
 * Returns null for aspects not mentioned.
 *
 * @param {string} text
 * @returns {{ [aspect: string]: number | null }} scores from -1.0 to 1.0, null if not mentioned
 */
export function extractAspectMentions(text) {
  if (!text) return Object.fromEntries(ASPECTS.map(a => [a, null]));

  const lower = text.toLowerCase();
  const result = {};

  for (const aspect of ASPECTS) {
    const { positive, negative } = ASPECT_KEYWORDS[aspect];
    let posHits = 0, negHits = 0;

    for (const phrase of positive) {
      if (lower.includes(phrase)) posHits++;
    }
    for (const phrase of negative) {
      if (lower.includes(phrase)) negHits++;
    }

    if (posHits === 0 && negHits === 0) {
      result[aspect] = null; // not mentioned
    } else {
      const total = posHits + negHits;
      result[aspect] = parseFloat(((posHits - negHits) / total).toFixed(2));
    }
  }

  return result;
}

// ─── AI enrichment ─────────────────────────────────────────────────────────

/**
 * Run Claude Haiku ABSA on a batch of signals.
 * Attaches `signal._aspects` to each analyzed signal.
 *
 * @param {object[]} signals — top signals to analyze (max 10)
 * @returns {Promise<object[]>} same signals with _aspects attached
 */
export async function aiAspectAnalysis(signals) {
  if (!process.env.ANTHROPIC_API_KEY || !signals.length) return signals;

  const batch = signals.slice(0, 10);

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const texts = batch.map((s, i) => `${i}: "${s.title} ${s.body}"`).join('\n');

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: 'You are a product review aspect analyst. Return ONLY valid JSON array, no markdown.',
      messages: [{
        role: 'user',
        content: `Analyze the aspect-based sentiment of these product-related social posts.
For each post, extract sentiment scores for these aspects: quality, value, shipping, packaging, usability.
Use null for aspects not mentioned, and a score from -1.0 to 1.0 for mentioned aspects.
Also provide a confidence score (0-1) for each aspect rating.

${texts}

Return JSON array: [{"i": 0, "aspects": {"quality": {"score": 0.8, "confidence": 0.9}, "value": null, ...}}, ...]`,
      }],
    });

    const raw = msg.content[0].text.trim();
    const results = JSON.parse(raw.match(/\[.*\]/s)[0]);

    for (const r of results) {
      if (typeof r.i === 'number' && batch[r.i] && r.aspects) {
        const aspects = {};
        for (const aspect of ASPECTS) {
          const val = r.aspects[aspect];
          if (val === null || val === undefined) {
            aspects[aspect] = null;
          } else if (typeof val === 'object' && val.score !== undefined) {
            aspects[aspect] = {
              score: Math.max(-1, Math.min(1, val.score)),
              confidence: Math.max(0, Math.min(1, val.confidence || 0.5)),
            };
          } else if (typeof val === 'number') {
            aspects[aspect] = { score: Math.max(-1, Math.min(1, val)), confidence: 0.7 };
          }
        }
        batch[r.i]._aspects = aspects;
      }
    }
  } catch { /* non-fatal */ }

  return signals;
}

// ─── Aggregation ───────────────────────────────────────────────────────────

/**
 * Aggregate aspect scores across multiple signals for a product.
 *
 * @param {object[]} signals — signals with _aspects attached
 * @returns {{ [aspect: string]: { avg: number, count: number, confidence: number } }}
 */
export function aggregateAspects(signals) {
  const agg = {};

  for (const aspect of ASPECTS) {
    const values = [];

    for (const s of signals) {
      if (!s._aspects) continue;
      const val = s._aspects[aspect];
      if (val === null || val === undefined) continue;

      const score = typeof val === 'number' ? val : val.score;
      if (typeof score === 'number') values.push(score);
    }

    if (values.length === 0) {
      agg[aspect] = null;
    } else {
      agg[aspect] = {
        avg: parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)),
        count: values.length,
        confidence: Math.min(1, values.length / 5), // more data points = higher confidence
      };
    }
  }

  return agg;
}

export { ASPECTS };
