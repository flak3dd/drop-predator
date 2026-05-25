/**
 * app/routes/api.ai.shipping.jsx
 * ---------------------------------------------------------
 * Converts plain-English shipping requirements into a structured
 * Shopify shipping rule. Returns JSON (not streamed).
 *
 * POST /api/ai/shipping
 * Body: { prompt }
 */

import { authenticate } from "../shopify.server";
import { getGatewayModel, MODELS } from "../services/ai/gateway.js";

export async function action({ request }) {
  await authenticate.admin(request);
  const { prompt } = await request.json();

  if (!prompt) {
    return Response.json({ error: "Prompt is required" }, { status: 400 });
  }

  const { generateObject } = await import('ai');
  const { z } = await import('zod');
  const model = await getGatewayModel(MODELS.fast);

  const ShippingRuleSchema = z.object({
    zone: z.string().describe('Shipping zone name, e.g. "New Zealand (NZ)"'),
    method: z.string().describe('Shipping method name, e.g. "Standard International"'),
    rate: z.string().describe('Rate in dollars, e.g. "$0.00" or "$14.95"'),
    estimatedDelivery: z.string().describe('Delivery estimate, e.g. "7-10 business days"'),
    minOrderValue: z.string().nullable().describe('Minimum order value or null if no minimum'),
    condition: z.string().nullable().describe('Human-readable condition string if applicable'),
    explanation: z.string().describe('Short explanation of what this rule does'),
  });

  const { object } = await generateObject({
    model,
    schema: ShippingRuleSchema,
    prompt: `
You are a Shopify shipping configuration expert.
Convert this plain-English shipping requirement into a structured shipping rule:

"${prompt}"

Be precise with zones (use country/region codes where possible),
realistic with delivery estimates, and clear with conditions.
`.trim(),
  });

  return Response.json(object);
}
