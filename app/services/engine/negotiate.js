/* eslint-disable no-undef */
import { trackedGenerate } from '../ai/cost-tracker.js';

export async function negotiateSupplier(product, ctx = {}) {
  // Prefer AI Gateway if configured, fall back to direct Anthropic SDK, then algorithmic
  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    try {
      return await gatewayNegotiate(product, ctx);
    } catch { /* fall through */ }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await aiNegotiate(product, ctx);
    } catch { /* fall through to algorithmic */ }
  }
  return algorithmicNegotiate(product);
}

async function gatewayNegotiate(product, ctx = {}) {
  const { getGatewayModel, MODELS } = await import('../ai/gateway.js');
  const model = await getGatewayModel(MODELS.fast);

  const result = await trackedGenerate({
    model,
    system: 'You are a professional buyer negotiating discounts with a Chinese manufacturer. Reply only with valid JSON.',
    prompt: `Negotiate with "${product.supplier}" for "${product.name}".\nCurrent: $${product.cost}/unit, ${product.discount}% discount, MOQ ${product.moq}.\nMonthly velocity: ${product.velocity} units.\nReturn JSON: {"discount": <improved integer>, "moq": <integer>, "reason": "<short string>"}`,
    maxTokens: 150,
  }, { runId: ctx.runId, purpose: 'negotiate' });

  const raw = result.text.trim();
  const parsed = JSON.parse(raw.match(/\{.*\}/s)[0]);

  const newDiscount = Math.min(parsed.discount, product.discount + 10);
  const newMoq = parsed.moq || product.moq;
  const landed = parseFloat((product.cost * (1 - newDiscount / 100) * 1.18).toFixed(2));
  const margin = Math.round((product.price - landed) / product.price * 100);

  return { discount: newDiscount, moq: newMoq, landed, margin, aiPowered: true, gateway: true };
}

async function aiNegotiate(product, ctx = {}) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { recordTokens } = await import('../ai/cost-tracker.js');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const MODEL = 'claude-haiku-4-5-20251001';
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 150,
    system: 'You are a professional buyer negotiating discounts with a Chinese manufacturer. Reply only with valid JSON.',
    messages: [{
      role: 'user',
      content: `Negotiate with "${product.supplier}" for "${product.name}".\nCurrent: $${product.cost}/unit, ${product.discount}% discount, MOQ ${product.moq}.\nMonthly velocity: ${product.velocity} units.\nReturn JSON: {"discount": <improved integer>, "moq": <integer>, "reason": "<short string>"}`,
    }],
  });

  if (ctx.runId && msg.usage) {
    recordTokens(ctx.runId, `anthropic/${MODEL}`, { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens }, 'negotiate');
  }

  const raw = msg.content[0].text.trim();
  const result = JSON.parse(raw.match(/\{.*\}/s)[0]);

  const newDiscount = Math.min(result.discount, product.discount + 10);
  const newMoq = result.moq || product.moq;
  const landed = parseFloat((product.cost * (1 - newDiscount / 100) * 1.18).toFixed(2));
  const margin = Math.round((product.price - landed) / product.price * 100);

  return { discount: newDiscount, moq: newMoq, landed, margin, aiPowered: true };
}

export function algorithmicNegotiate(product) {
  const volumeTier = product.velocity > 300 ? 3 : product.velocity > 150 ? 2 : 1;
  const leverage = volumeTier - Math.floor((product.supScore - 70) / 15);
  const improvement = Math.max(1, Math.min(8, 2 + leverage));

  const newDiscount = product.discount + improvement;
  const landed = parseFloat((product.cost * (1 - newDiscount / 100) * 1.18).toFixed(2));
  const margin = Math.round((product.price - landed) / product.price * 100);

  return { discount: newDiscount, moq: product.moq, landed, margin, aiPowered: false };
}
