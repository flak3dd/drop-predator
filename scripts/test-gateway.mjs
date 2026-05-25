/**
 * scripts/test-gateway.mjs
 * ---------------------------------------------------------
 * Standalone smoke test for Vercel AI Gateway.
 * Runs outside the app context to verify connectivity.
 *
 * Setup:
 *   1. npm install ai @ai-sdk/gateway
 *   2. vc env pull .env.local          (populates VERCEL_OIDC_TOKEN)
 *   3. node --env-file=.env.local scripts/test-gateway.mjs
 *
 * Or set AI_GATEWAY_API_KEY in .env.local for local-only dev.
 */

import { streamText } from 'ai';
import { createGateway } from '@ai-sdk/gateway';

const apiKey = process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;

if (!apiKey) {
  console.error(
    '❌  No credentials found.\n' +
    '    Run: vc env pull .env.local\n' +
    '    Or set AI_GATEWAY_API_KEY in .env.local',
  );
  process.exit(1);
}

const gateway = createGateway({ apiKey });

console.log('✅  AI Gateway connected — streaming test prompt...\n');
console.log('━'.repeat(50));

const result = streamText({
  model: gateway('openai/gpt-4o-mini'),
  prompt: 'In 2 sentences, explain what Vercel AI Gateway does and why it is useful for Shopify automation.',
  maxTokens: 200,
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

console.log('\n' + '━'.repeat(50));
console.log('\n✅  Test complete. AI Gateway is working correctly.');
