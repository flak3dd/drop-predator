/**
 * app/routes/api.ai.description.jsx
 * ---------------------------------------------------------
 * Streams a detailed SEO product description with configurable
 * tone, length, sections, and target audience.
 *
 * POST /api/ai/description
 * Body: { product, tone, length, audience, keywords, sections }
 */

import { authenticate } from "../shopify.server";
import { getGatewayModel, MODELS } from "../services/ai/gateway.js";

export async function action({ request }) {
  await authenticate.admin(request);

  const {
    product,
    tone = 'Professional & trustworthy',
    length = 'Medium (100-200 words)',
    audience = 'general shoppers',
    keywords = '',
    sections = ['Key features', 'Materials', 'Size guide', 'SEO tags'],
  } = await request.json();

  if (!product) {
    return Response.json({ error: "Product name is required" }, { status: 400 });
  }

  const { streamText } = await import('ai');
  const model = await getGatewayModel(MODELS.smart);

  const keywordsText = keywords
    ? `Naturally include these keywords: ${keywords}.`
    : '';

  const prompt = `
You are a world-class Shopify product copywriter.

Write a ${length} product description for: "${product}"
Tone: ${tone}
Target audience: ${audience}
${keywordsText}

Include these sections: ${sections.join(', ')}

Guidelines:
- Write in flowing HTML-ready prose (use <br><br> between paragraphs, <strong> for section headers)
- No markdown, no backticks
- Persuasive but honest — no fake superlatives
- End with a subtle call to action
`.trim();

  const result = streamText({
    model,
    prompt,
    maxTokens: 600,
    temperature: 0.75,
  });

  return result.toTextStreamResponse();
}
