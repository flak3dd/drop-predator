/* eslint-disable no-undef */
/**
 * Pathway C: AI-Powered Product Research
 *
 * Uses Claude to generate viable product ideas based on niche context,
 * then validates pricing via Google Shopping data when available.
 *
 * This is a "zero-API" pathway — works with just ANTHROPIC_API_KEY,
 * no supplier accounts needed. Produces research-grade product leads
 * that the engine can score, filter, and present for sourcing.
 *
 * Requires: ANTHROPIC_API_KEY
 * Optional: SERPAPI_KEY (for price validation)
 * Returns:  Raw products in the standard _source schema
 */

import cache from '../catalog-cache.js';

const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours — AI results don't go stale fast

export const name = 'AI Research';

export function isAvailable() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function search(keywords, opts = {}) {
  const { log = () => {}, niche = 'general', signals = [] } = opts;

  if (!isAvailable()) {
    log('[AI Research] Skipped — ANTHROPIC_API_KEY not set');
    return [];
  }

  const cacheKey = `ai-research:${niche}:${keywords.slice(0, 2).join(',')}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    log(`[AI Research] Cache hit (${cached.length} products)`);
    return cached;
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Build context from available trend signals
    let signalContext = '';
    if (signals.length > 0) {
      const top = signals
        .filter(s => s.hypeScore > 25)
        .sort((a, b) => b.hypeScore - a.hypeScore)
        .slice(0, 8);
      if (top.length) {
        signalContext = `\n\nCurrent trending signals:\n${top.map(s =>
          `- [${s.source}] "${s.title}" (hype: ${s.hypeScore}, sentiment: ${s.sentiment > 0 ? '+' : ''}${s.sentiment})`
        ).join('\n')}`;
      }
    }

    log('[AI Research] Generating product ideas via Claude…');

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: `You are a senior dropshipping product researcher. You identify REAL, specific, sourceable products — not generic categories.

Rules:
- Products must be physical goods that can be sourced from AliExpress/CJ Dropshipping
- Price range: $10–$80 retail (impulse buy sweet spot)
- Focus on products with clear visual appeal (good for social ads)
- Each product must have a specific name — "LED strip lights 5m RGB" not "lights"
- Estimate realistic costs (AliExpress wholesale is typically 30-40% of retail)
- Return ONLY valid JSON, no markdown`,
      messages: [{
        role: 'user',
        content: `Find 8-12 winning dropshipping products for the "${niche}" niche.

Keywords: ${keywords.join(', ')}${signalContext}

For each product provide:
- name: specific product name (5-8 words max)
- category: sub-category within the niche
- retailPrice: estimated retail price USD
- supplierCost: estimated AliExpress/CJ cost USD
- margin: estimated margin percentage
- demandLevel: "low" | "medium" | "high" | "viral"
- competition: "low" | "medium" | "high"
- adAngle: one-line ad hook for this product
- whyNow: why this product is trending right now

Return JSON: {"products": [...]}`,
      }],
    });

    const raw = msg.content[0].text.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI returned non-JSON response');
    const result = JSON.parse(jsonMatch[0]);
    const aiProducts = result.products || [];

    log(`[AI Research] Claude suggested ${aiProducts.length} products`);

    // Validate pricing via Google Shopping if SERPAPI available
    const validated = await validatePricing(aiProducts, log);

    const mapped = validated.map(p => ({
      _source:       'ai-research',
      name:          (p.name || 'Unknown product').slice(0, 80),
      cat:           p.category || niche,
      price:         parseFloat(p.retailPrice) || 29.99,
      cost:          parseFloat(p.supplierCost) || parseFloat(p.retailPrice * 0.35) || 10,
      supplier:      'AI Research — to be sourced',
      supScore:      60,
      moq:           1,
      images:        '',
      orders:        0,
      _totalResults: 0,
      _adAngle:      p.adAngle || '',
      _whyNow:       p.whyNow || '',
      _aiValidated:  !!p._priceValidated,
      _demandLevel:  p.demandLevel || 'medium',
      _competition:  p.competition || 'medium',
    }));

    cache.set(cacheKey, mapped, CACHE_TTL);
    return mapped;
  } catch (err) {
    log(`[AI Research] Failed: ${err.message}`);
    return [];
  }
}

/**
 * Cross-reference AI-suggested products with Google Shopping
 * to validate pricing estimates and confirm products exist.
 */
async function validatePricing(products, log) {
  if (!process.env.SERPAPI_KEY || !products.length) return products;

  log('[AI Research] Validating prices via Google Shopping…');
  let validated = 0;

  for (const product of products.slice(0, 6)) {
    try {
      const url = new URL('https://serpapi.com/search');
      url.searchParams.set('engine', 'google_shopping');
      url.searchParams.set('q', product.name);
      url.searchParams.set('num', '5');
      url.searchParams.set('gl', 'us');
      url.searchParams.set('api_key', process.env.SERPAPI_KEY);

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) continue;
      const data = await res.json();

      const prices = (data.shopping_results || [])
        .map(r => parseFloat(String(r.extracted_price || '').replace(/[^0-9.]/g, '')))
        .filter(p => p > 0);

      if (prices.length >= 2) {
        const median = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
        product.retailPrice = parseFloat(median.toFixed(2));
        product.supplierCost = parseFloat((median * 0.35).toFixed(2));
        product.margin = Math.round((1 - product.supplierCost / product.retailPrice) * 100);
        product._priceValidated = true;
        validated++;
      }

      await new Promise(r => setTimeout(r, 400));
    } catch { /* non-fatal */ }
  }

  if (validated > 0) log(`[AI Research] Price-validated ${validated} products`);
  return products;
}
