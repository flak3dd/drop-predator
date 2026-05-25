/**
 * app/services/ai/gateway.js
 * ---------------------------------------------------------
 * Shared Vercel AI Gateway client for Drop Predator.
 *
 * Authentication priority (per Vercel docs):
 *   1. VERCEL_OIDC_TOKEN  -- auto-populated on Vercel deployments
 *   2. AI_GATEWAY_API_KEY -- local dev fallback
 *
 * Usage:
 *   import { gateway, gatewayModel, MODELS } from '../services/ai/gateway';
 *   const result = await streamText({ model: gatewayModel(MODELS.smart), prompt });
 */

/* eslint-disable no-undef */

let _gateway = null;
let _initError = null;

/**
 * Lazily initialise the gateway so the import doesn't throw
 * if `@ai-sdk/gateway` isn't installed yet.
 */
async function initGateway() {
  if (_gateway) return _gateway;
  if (_initError) throw _initError;

  try {
    const { createGateway } = await import('@ai-sdk/gateway');

    const apiKey =
      process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;

    if (!apiKey) {
      console.warn(
        '[Drop Predator] No AI Gateway credentials found. ' +
        'Run `vc env pull .env.local` or set AI_GATEWAY_API_KEY.',
      );
    }

    _gateway = createGateway({
      apiKey,
      headers: {
        'x-title': 'Drop Predator AI',
        'http-referer': process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'http://localhost:3000',
      },
    });

    return _gateway;
  } catch (err) {
    _initError = err;
    throw err;
  }
}

/**
 * Returns a gateway model handle by provider/model string.
 * Supports any model in Vercel AI Gateway, e.g.:
 *   'openai/gpt-4o'
 *   'anthropic/claude-sonnet-4-6'
 */
export async function getGatewayModel(model) {
  const gw = await initGateway();
  return gw(model);
}

/**
 * Get the raw gateway instance (for advanced use).
 */
export async function getGateway() {
  return initGateway();
}

/**
 * Default models used by Drop Predator AI features.
 * Change these strings to swap models across the whole app.
 */
export const MODELS = {
  /** Fast model for tags, short copy, classification */
  fast: 'openai/gpt-4o-mini',
  /** Smart model for long descriptions, negotiations, emails */
  smart: 'anthropic/claude-sonnet-4-6',
  /** Fallback chain if primary model is unavailable */
  fallbacks: ['anthropic/claude-sonnet-4-6', 'openai/gpt-4o'],
};
