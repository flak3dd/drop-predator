/**
 * app/routes/api.ai.listing.jsx
 * ---------------------------------------------------------
 * Streams a complete Shopify product listing (title, description,
 * tags, SEO fields) using Vercel AI Gateway.
 *
 * POST /api/ai/listing
 * Body: { name, category, vendor, price, compareAt, sku, notes }
 */

import { authenticate } from "../shopify.server";
import { getGatewayModel, MODELS } from "../services/ai/gateway.js";

export async function action({ request }) {
  await authenticate.admin(request);
  const { name, category, vendor, price, compareAt, sku, notes } = await request.json();

  if (!name) {
    return Response.json({ error: "Product name is required" }, { status: 400 });
  }

  const { streamText } = await import('ai');
  const model = await getGatewayModel(MODELS.smart);

  const prompt = `
You are an expert Shopify copywriter. Generate a complete product listing for:

Product name: ${name}
Category: ${category || 'General'}
Vendor/Brand: ${vendor || 'Unknown'}
Price: $${price || 'TBD'}${compareAt ? ` (compare at $${compareAt})` : ''}
SKU: ${sku || 'N/A'}
Notes: ${notes || 'None'}

Return EXACTLY this structure (no markdown backticks):

TITLE: [compelling Shopify product title, max 80 chars]

DESCRIPTION:
[2-3 engaging paragraphs for the product description, highlight benefits]

KEY FEATURES:
- [feature 1]
- [feature 2]
- [feature 3]
- [feature 4]

TAGS: [comma-separated list of 8-12 relevant tags]

SEO TITLE: [60-char SEO title]

META DESCRIPTION: [155-char meta description with a call to action]
`.trim();

  const result = streamText({
    model,
    prompt,
    maxTokens: 800,
    temperature: 0.7,
  });

  return result.toTextStreamResponse();
}
