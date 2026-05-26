/* eslint-disable no-undef */

/**
 * Generate a product listing.
 *
 * @param {object} product
 * @param {object} [opts]
 * @param {'smart'|'fast'|'template'} [opts.tier='smart']
 *   smart    → full Sonnet/GPT-4o copy — use for top-tier products only
 *   fast     → GPT-4o-mini, shorter prompt — good for mid-tier
 *   template → no AI, zero token spend — use for bulk / bottom-tier
 */
export async function generateListing(product, opts = {}) {
  const tier = opts.tier || 'smart';

  if (tier === 'template') {
    return templateListing(product);
  }

  // Prefer AI Gateway if configured, fall back to direct Anthropic SDK, then template
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    try {
      return await gatewayGenerateListing(product, tier);
    } catch { /* fall through */ }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await aiGenerateListing(product, tier);
    } catch { /* fall through to template */ }
  }
  return templateListing(product);
}

async function gatewayGenerateListing(product, tier = 'smart') {
  const { getGatewayModel, MODELS } = await import('../ai/gateway.js');
  const { generateText } = await import('ai');

  // fast tier → cheaper model, shorter prompt, lower token budget
  const model = tier === 'fast'
    ? await getGatewayModel(MODELS.fast)
    : await getGatewayModel(MODELS.smart);

  const systemPrompt = tier === 'fast'
    ? 'You are an e-commerce copywriter. Return ONLY valid JSON, no fences.'
    : 'You are a viral e-commerce copywriter obsessed with conversion. Titles trigger emotion, descriptions open with pain points, bullets sell benefits not specs. Return ONLY valid JSON, no markdown fences.';

  const promptBody = tier === 'fast'
    ? `Write a Shopify listing for "${product.name}" ($${product.price.toFixed(2)}, ${product.cat}).\nReturn JSON: {"title":"<70 chars>","description":"<2 sentences>","descriptionHtml":"<p>...</p>","bulletPoints":["...","...","..."],"seoTags":["...","...","...","..."],"metaDescription":"<160 chars>","collections":["${product.cat}"],"productType":"${product.cat}"}`
    : `Write a VIRAL Shopify product listing for a ${product.cat} store.\n\nProduct: "${product.name}"\nSell price: $${product.price.toFixed(2)}\nLifecycle: ${product.lifecycle} (trend ${product.trend > 0 ? '+' : ''}${product.trend})\nSearch volume: ${product.searches}/mo · Impulse: ${product.impulse}/100 · Margin: ${product.margin}%\nCompetition: ${product.competition || 'medium'}\n\nRules:\n- Title: trigger an EMOTION or desire, not a product description (max 70 chars)\n- Description: open with the pain point this product solves\n- Bullets: benefits that make the buyer feel smart, not specs\n- Tags: include lifecycle ("${product.lifecycle}"), category, virality hooks, audience identity markers\n\nReturn JSON:\n{"title":"...","description":"...","descriptionHtml":"...","bulletPoints":["...","...","...","...","..."],"seoTags":["...","...","...","...","...","..."],"metaDescription":"...","collections":["...","..."],"productType":"..."}`;

  const result = await generateText({
    model,
    system: systemPrompt,
    prompt: promptBody,
    maxTokens: tier === 'fast' ? 400 : 900,
  });

  const raw = result.text.trim();
  const listing = JSON.parse(raw.match(/\{.*\}/s)[0]);
  return { ...listing, aiGenerated: true, gateway: true, tier, productId: product.id, generatedAt: Date.now() };
}

async function aiGenerateListing(product) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const fast = tier === 'fast';
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: fast ? 400 : 800,
    system: 'You are a professional e-commerce copywriter specializing in Shopify stores. Return ONLY valid JSON, no markdown fences.',
    messages: [{
      role: 'user',
      content: fast
        ? `Write a concise Shopify listing for "${product.name}" in ${product.cat}. Price: $${product.price.toFixed(2)}.\nReturn JSON: {"title":"<70 chars>","description":"<2 sentences>","descriptionHtml":"<p>...</p>","bulletPoints":["...","...","..."],"seoTags":["...","...","...","..."],"metaDescription":"<160 chars>","collections":["${product.cat}"],"productType":"${product.cat}"}`
        : `Write a complete Shopify product listing for a ${product.cat} store.\n\nProduct: "${product.name}"\nSell price: $${product.price.toFixed(2)}\nCategory: ${product.cat}\nTrend: ${product.trend > 0 ? 'trending up' : product.trend < 0 ? 'declining' : 'stable'} (${product.lifecycle})\nSearch volume: ${product.searches}/mo\nImpulse score: ${product.impulse}/100\nCompetition: ${product.competition || 'medium'}\n\nReturn JSON:\n{\n  "title": "<SEO title max 70 chars>",\n  "description": "<plain text 2-3 sentence description>",\n  "descriptionHtml": "<rich HTML product description>",\n  "bulletPoints": ["<benefit 1>", "<benefit 2>", "<benefit 3>", "<benefit 4>", "<benefit 5>"],\n  "seoTags": ["<tag1>", "<tag2>", "<tag3>", "<tag4>", "<tag5>"],\n  "metaDescription": "<SEO meta description max 160 chars>",\n  "collections": ["<collection 1>", "<collection 2>"],\n  "productType": "<Shopify product type category>"\n}`,
    }],
  });

  const raw = msg.content[0].text.trim();
  const listing = JSON.parse(raw.match(/\{.*\}/s)[0]);

  return { ...listing, aiGenerated: true, tier, productId: product.id, generatedAt: Date.now() };
}

function templateListing(product) {
  const lifecycle = product.lifecycle;
  const urgency = lifecycle === 'viral' ? 'Trending Now — ' : lifecycle === 'growing' ? 'Rising Demand — ' : '';
  const title = `${urgency}${product.name} | ${product.cat} | Free Shipping`.slice(0, 70);

  const descriptions = {
    viral: `${product.name} is going viral with ${product.searches.toLocaleString()}+ monthly searches. Premium quality at an unbeatable price.`,
    growing: `${product.name} is quickly becoming a must-have in the ${product.cat.toLowerCase()} space. Sourced directly from top-rated manufacturers.`,
    peak: `${product.name} — a proven bestseller in ${product.cat.toLowerCase()}. Trusted by thousands.`,
    mature: `${product.name} — a reliable favorite. Factory-direct pricing means premium quality at the best price.`,
    dying: `${product.name} — limited stock remaining at clearance pricing.`,
  };

  const htmlBlocks = {
    viral: `<h3>Trending Now</h3><p>${product.name} is <strong>going viral</strong> with ${product.searches.toLocaleString()}+ monthly searches.</p><ul><li>Premium quality ${product.cat.toLowerCase()} product</li><li>${product.margin}% below typical retail pricing</li><li>Fast shipping included</li></ul>`,
    growing: `<h3>Rising Star</h3><p>${product.name} is rapidly gaining popularity in ${product.cat.toLowerCase()}.</p><ul><li>Factory-direct pricing</li><li>Growing demand — ${product.searches.toLocaleString()} monthly searches</li><li>Free shipping</li></ul>`,
    peak: `<h3>Bestseller</h3><p>${product.name} — trusted by thousands.</p><ul><li>Proven bestseller</li><li>Competitive pricing</li><li>Fast, reliable shipping</li></ul>`,
    mature: `<h3>Reliable Choice</h3><p>${product.name} — a dependable favorite at factory-direct pricing.</p><ul><li>Stable demand</li><li>Best-value pricing</li><li>Free shipping</li></ul>`,
    dying: `<h3>Clearance — Limited Stock</h3><p>${product.name} — final units at reduced pricing.</p><ul><li>Clearance pricing</li><li>Limited stock</li><li>Free shipping while supplies last</li></ul>`,
  };

  const tags = [product.cat.toLowerCase(), product.lifecycle, 'free shipping', 'trending', 'best seller'];
  const bullets = [
    `Premium quality ${product.cat.toLowerCase()} product`,
    `${product.searches.toLocaleString()}+ monthly searches — proven demand`,
    `${product.margin}% margin — profitable and competitive`,
    `Reliable supplier (${product.supScore}/100 rating)`,
    `Free shipping on every order`,
  ];

  return {
    title,
    description: descriptions[lifecycle] || descriptions.mature,
    descriptionHtml: htmlBlocks[lifecycle] || htmlBlocks.mature,
    bulletPoints: bullets,
    seoTags: tags,
    metaDescription: `Shop ${product.name} — ${product.cat}. Free shipping.`.slice(0, 160),
    collections: [product.cat, lifecycle === 'viral' || lifecycle === 'growing' ? 'Trending' : 'Shop All'],
    productType: product.cat,
    aiGenerated: false,
    productId: product.id,
    generatedAt: Date.now(),
  };
}
