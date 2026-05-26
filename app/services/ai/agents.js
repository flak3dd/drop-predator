/**
 * app/services/ai/agents.js
 * ---------------------------------------------------------
 * Specialised AI agents for each Drop Predator domain.
 * Each agent has a focused system prompt, a curated tool set,
 * and is called by the Orchestrator agent.
 *
 * Uses Vercel AI SDK v5 `generateText` with `stopWhen: stepCountIs(N)`
 * for agentic loops — the model keeps calling tools until done.
 * NOTE: AI SDK v5 replaced maxSteps with stopWhen.
 */

import { getGatewayModel, MODELS } from './gateway.js';
import { createShopifyTools, createEmailTools, createShippingTools, createMediaTools } from './tools.js';

// Lazy-load stopWhen helpers from AI SDK v5
let _stepCountIs = null;
async function getStepCountIs() {
  if (!_stepCountIs) {
    const { stepCountIs } = await import('ai');
    _stepCountIs = stepCountIs;
  }
  return _stepCountIs;
}

// ─── Agent result helper ────────────────────────────────────────────────────

function makeResult(agent, result, toolCalls) {
  return {
    agent,
    steps: result.steps?.length || 0,
    toolCalls,
    output: result.text || '',
  };
}

/**
 * onStepFinish handler compatible with AI SDK v5.
 * In v5, toolResults is a separate array keyed by toolCallId.
 * Merges calls + results into the shared toolCalls accumulator.
 */
function makeStepHandler(toolCalls) {
  return ({ toolCalls: calls, toolResults: results }) => {
    calls?.forEach(c => {
      const res = results?.find(r => r.toolCallId === c.toolCallId);
      toolCalls.push({ tool: c.toolName, input: c.args, result: res?.result });
    });
  };
}

// ─── 1. Product Listing Agent ───────────────────────────────────────────────

export async function runProductAgent(task, admin) {
  const { generateText } = await import('ai');
  const stepCountIs = await getStepCountIs();
  const model = await getGatewayModel(MODELS.smart);
  const tools = await createShopifyTools(admin);
  const toolCalls = [];

  // Fetch winners context before the agent runs — inject into the prompt
  const winnersContext = await buildWinnersContext(admin, tools);

  const result = await generateText({
    model,
    system: `You are a viral product launch strategist obsessed with margin and social momentum.
Your mandate: every listing you create should make people stop scrolling, feel FOMO, and click "Buy Now" before they've finished reading the title.

## Non-negotiable rules
1. NEVER write a title that describes the product — write one that triggers an emotion or desire.
   Bad:  "Resistance Band Set - 5 Pieces"
   Good: "The Home Gym Secret PTs Don't Want You To Know"
2. Open every description with the PAIN POINT, not the product.
3. Price anchoring is mandatory — always reference what competitors charge.
4. Tags must include social platform hooks (tiktok-viral, instagram-trending), audience identity markers (gym-girl, plant-parent), and urgency signals (limited-stock, trending-now).
5. Bullet points = benefits that make the buyer feel smart for buying, not specs.
6. If a product has a margin below 35%, do NOT create the listing — tell the user to fix the cost first.

## Process
1. Call getProducts to see what's already in the store — study any winners (look for products tagged engine-import with many tags or sold count signals).
2. Identify the EMOTIONAL core of this product: is it status, FOMO, problem-solving, identity, or transformation?
3. Build the listing around that emotional core.
4. Call createProduct with a killer title, ruthless description, and 12+ tags.
5. Call generateSEOFields for meta title and description.
6. Call updateProduct to attach SEO fields.
7. Call publishProduct to make it live.
8. Report the emotional angle you chose, the tags you used, and why the listing will convert.

## What past winners look like in this store
${winnersContext}`,
    prompt: task,
    tools: {
      createProduct:    tools.createProduct,
      publishProduct:   tools.publishProduct,
      updateProduct:    tools.updateProduct,
      generateSEOFields: tools.generateSEOFields,
      getProducts:      tools.getProducts,
      bulkUpdateTags:   tools.bulkUpdateTags,
    },
    stopWhen: stepCountIs(10),
    onStepFinish: makeStepHandler(toolCalls),
  });

  return makeResult('ProductAgent', result, toolCalls);
}

/**
 * Pull the top-performing imported products from the last 60 days and format
 * them as a short winners brief for the ProductAgent system prompt.
 * Never throws — returns a placeholder string on any failure.
 */
async function buildWinnersContext(admin, tools) {
  try {
    // Use the getProducts Shopify tool to find engine-imported products
    const result = await tools.getProducts.execute({ limit: 50, query: 'tag:engine-import' });
    const products = result?.products || [];
    if (!products.length) {
      return 'No past winners in store yet — you are setting the baseline. Make it count.';
    }

    // Sort by tag count as a proxy for listing richness, take top 5
    const winners = products
      .sort((a, b) => (b.tags?.length || 0) - (a.tags?.length || 0))
      .slice(0, 5);

    const lines = winners.map(p =>
      `• "${p.title}" — $${p.priceRange?.minVariantPrice?.amount || '?'} — tags: ${(p.tags || []).slice(0, 6).join(', ')}`,
    );

    return `Top ${winners.length} existing engine products (study their tag strategy):\n${lines.join('\n')}`;
  } catch {
    return 'Winner data unavailable — focus on emotional triggers and margin discipline.';
  }
}

// ─── 2. Email Agent ─────────────────────────────────────────────────────────

export async function runEmailAgent(task) {
  const { generateText } = await import('ai');
  const stepCountIs = await getStepCountIs();
  const model = await getGatewayModel(MODELS.smart);
  const tools = await createEmailTools();
  const toolCalls = [];

  const result = await generateText({
    model,
    system: `You are a customer service specialist for an online Shopify store.
Your job is to handle all unreplied customer emails with empathy and efficiency.

Process:
1. Call getUnrepliedEmails to fetch the queue
2. For each email, call classifyEmailUrgency to prioritise
3. Draft a warm, specific reply addressing their exact concern
4. Call sendEmailReply for each response
5. Report a summary of what was handled

Tone: friendly, empathetic, specific. Never vague.
Sign off as "Drop Predator Store Team".`,
    prompt: task,
    tools: {
      getUnrepliedEmails: tools.getUnrepliedEmails,
      sendEmailReply: tools.sendEmailReply,
      classifyEmailUrgency: tools.classifyEmailUrgency,
    },
    stopWhen: stepCountIs(12),
    onStepFinish: makeStepHandler(toolCalls),
  });

  return makeResult('EmailAgent', result, toolCalls);
}

// ─── 3. Shipping Agent ──────────────────────────────────────────────────────

export async function runShippingAgent(task) {
  const { generateText } = await import('ai');
  const stepCountIs = await getStepCountIs();
  const model = await getGatewayModel(MODELS.fast);
  const tools = await createShippingTools();
  const toolCalls = [];

  const result = await generateText({
    model,
    system: `You are a Shopify shipping configuration expert.
Your job is to set up and manage shipping zones, rates, and rules.

When asked to configure shipping:
1. Call getShippingRules to understand current setup
2. Create the required rules with accurate rates and delivery estimates
3. Always create a free shipping tier for orders over the store's threshold
4. Use realistic delivery timeframes based on the destination
5. Report a clear summary of rules created`,
    prompt: task,
    tools: {
      createShippingRule: tools.createShippingRule,
      getShippingRules: tools.getShippingRules,
    },
    stopWhen: stepCountIs(10),
    onStepFinish: makeStepHandler(toolCalls),
  });

  return makeResult('ShippingAgent', result, toolCalls);
}

// ─── 4. Inventory Agent ─────────────────────────────────────────────────────

export async function runInventoryAgent(task, admin) {
  const { generateText } = await import('ai');
  const stepCountIs = await getStepCountIs();
  const model = await getGatewayModel(MODELS.fast);
  const tools = await createShopifyTools(admin);
  const toolCalls = [];

  const result = await generateText({
    model,
    system: `You are a Shopify inventory manager.
Your job is to monitor stock levels and take corrective action.

On each run:
1. Call checkInventory to find low/out-of-stock items
2. Flag items below reorder point (< 20 units)
3. Generate a clear report: what's low, what's out, recommended actions

Be specific with quantities and product names.`,
    prompt: task,
    tools: {
      checkInventory: tools.checkInventory,
      getProducts: tools.getProducts,
      getStoreMetrics: tools.getStoreMetrics,
    },
    stopWhen: stepCountIs(6),
    onStepFinish: makeStepHandler(toolCalls),
  });

  return makeResult('InventoryAgent', result, toolCalls);
}

// ─── 5. Media Agent ────────────────────────────────────────────────────────

/**
 * Media agent — sources, scores, validates, and attaches product images.
 *
 * Capabilities:
 *   - Multi-engine image dorking (Google, Bing, AliExpress, CJ, DDG, Unsplash)
 *   - Image URL validation (HEAD checks)
 *   - AI-generated alt text for SEO & accessibility
 *   - Direct attachment to Shopify products via Admin API
 *   - Existing product image audit (list / remove low-quality)
 *
 * @param {string} task - Natural-language description of what to do
 * @param {object} admin - Authenticated Shopify admin client
 */
export async function runMediaAgent(task, admin) {
  const { generateText } = await import('ai');
  const stepCountIs = await getStepCountIs();
  const model = await getGatewayModel(MODELS.smart);
  const mediaTools = await createMediaTools(admin);
  const shopifyTools = await createShopifyTools(admin);
  const toolCalls = [];

  const result = await generateText({
    model,
    system: `You are a product media specialist for a Shopify dropshipping store.
Your job is to find, validate, and attach high-quality product images.

You have powerful image sourcing tools that search across Google Images (with dork queries),
Bing Images, AliExpress, CJ Dropshipping, DuckDuckGo, and Unsplash simultaneously.

When asked to source images for a product:
1. Call searchProductImages with the product name and category — this runs all search
   strategies in parallel and returns scored, deduplicated candidates.
2. Review the results: prefer images with score > 60, from real product listings
   (aliexpress, cj, google), with good resolution.
3. If you need more specific results, call buildImageDorkQueries to get advanced
   search strings you can refine with.
4. Call validateImageUrls on your top picks to confirm they're reachable.
5. Call generateImageAltText for each image to create SEO-friendly alt text.
6. If a Shopify product ID is provided, call attachImagesToShopifyProduct to
   attach the validated images directly to the product.

When auditing existing product images:
1. Call getProductImages to see what's currently attached.
2. Identify low-quality, broken, or duplicate images.
3. Call removeProductImage for images that should be replaced.
4. Source new images to fill the gaps.

Image quality guidelines:
- Prefer white/clean background product photos for the hero image.
- Include lifestyle/context shots as secondary images.
- Avoid stock photos with watermarks, tiny icons, or placeholder images.
- Aim for 4-8 images per product (hero + angles + lifestyle + detail).
- Every image MUST have descriptive alt text.

Report a detailed summary of what images you found, from which sources,
and which ones you attached or recommend.`,
    prompt: task,
    tools: {
      searchProductImages: mediaTools.searchProductImages,
      buildImageDorkQueries: mediaTools.buildImageDorkQueries,
      validateImageUrls: mediaTools.validateImageUrls,
      generateImageAltText: mediaTools.generateImageAltText,
      attachImagesToShopifyProduct: mediaTools.attachImagesToShopifyProduct,
      getProductImages: mediaTools.getProductImages,
      removeProductImage: mediaTools.removeProductImage,
      getProducts: shopifyTools.getProducts,
    },
    stopWhen: stepCountIs(15),
    onStepFinish: makeStepHandler(toolCalls),
  });

  return makeResult('MediaAgent', result, toolCalls);
}

// ─── 6. Orchestrator Agent ──────────────────────────────────────────────────

/**
 * The top-level agent. Reads a high-level goal, decides which
 * sub-agents to run, and synthesises their outputs into a report.
 *
 * @param {string} goal - Natural language goal
 * @param {object} admin - Authenticated Shopify admin client
 */
export async function runOrchestratorAgent(goal, admin) {
  const { generateText } = await import('ai');
  const model = await getGatewayModel(MODELS.smart);

  // Step 1: Plan which agents to run
  const planResult = await generateText({
    model,
    system: `You are the Drop Predator AI Orchestrator. You coordinate specialised agents to automate a Shopify store end-to-end.

Available agents and what they do:
- ProductAgent: creates product listings, writes descriptions, publishes products, manages tags
- MediaAgent: sources product images from search engines (Google dorking, Bing, AliExpress, CJ, DDG), validates URLs, generates alt text, attaches images to Shopify products
- EmailAgent: reads customer emails, classifies urgency, drafts and sends replies
- ShippingAgent: creates/updates shipping zones, rates, and free-shipping rules
- InventoryAgent: checks stock levels, flags low stock, processes restocks

Given a high-level goal, output a JSON plan like:
{
  "reasoning": "why you chose these agents",
  "agents": [
    { "agent": "EmailAgent", "task": "Process all unreplied customer emails and send replies." },
    { "agent": "ProductAgent", "task": "Create a listing for Merino Wool Beanie priced at $49.99." }
  ]
}

Only include agents that are needed. Order them logically.
Output ONLY the JSON, no commentary.`,
    prompt: `Goal: ${goal}`,
  });

  let plan;
  try {
    const cleaned = planResult.text.replace(/```json|```/g, '').trim();
    plan = JSON.parse(cleaned);
  } catch {
    plan = {
      reasoning: 'Could not parse plan, running all agents.',
      agents: [
        { agent: 'InventoryAgent', task: goal },
        { agent: 'EmailAgent', task: goal },
        { agent: 'ProductAgent', task: goal },
        { agent: 'MediaAgent', task: goal },
        { agent: 'ShippingAgent', task: goal },
      ],
    };
  }

  // Step 2: Run each planned agent
  const agentResults = [];

  for (const { agent, task } of plan.agents) {
    try {
      let result;
      if (agent === 'ProductAgent') result = await runProductAgent(task, admin);
      else if (agent === 'MediaAgent') result = await runMediaAgent(task, admin);
      else if (agent === 'EmailAgent') result = await runEmailAgent(task);
      else if (agent === 'ShippingAgent') result = await runShippingAgent(task);
      else if (agent === 'InventoryAgent') result = await runInventoryAgent(task, admin);
      else {
        result = { agent, steps: 0, toolCalls: [], output: `Unknown agent: ${agent}`, error: 'Agent not found' };
      }
      agentResults.push(result);
    } catch (err) {
      agentResults.push({ agent, steps: 0, toolCalls: [], output: '', error: err.message });
    }
  }

  // Step 3: Synthesise a final report
  const summaryResult = await generateText({
    model,
    system: 'You are summarising the results of an automated Shopify store management run. Be concise, specific, and use bullet points.',
    prompt: `Original goal: ${goal}

Agent results:
${agentResults.map(r => `
## ${r.agent} (${r.steps} steps, ${r.toolCalls.length} tool calls)
${r.error ? `ERROR: ${r.error}` : r.output}
`).join('\n')}

Write a concise executive summary of what was accomplished, what actions were taken, and any issues that need human attention.`,
    maxTokens: 600,
  });

  return {
    plan: plan.reasoning,
    agentResults,
    summary: summaryResult.text,
  };
}
