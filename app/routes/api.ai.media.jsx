/**
 * app/routes/api.ai.media.jsx
 * ---------------------------------------------------------
 * Product image sourcing API endpoint.
 *
 * GET  /api/ai/media?product=...&category=...   — quick image search
 * POST /api/ai/media                            — full media agent run
 *
 * GET returns images immediately (no AI agent, just raw search).
 * POST runs the full MediaAgent with AI-driven selection and optional
 * Shopify product attachment.
 */

import { authenticate } from "../shopify.server";
import { sourceProductImages, buildImageDorks } from "../services/ai/media.js";
import { runMediaAgent } from "../services/ai/agents.js";

export async function loader({ request }) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const intent = url.searchParams.get("intent");

  if (intent === "dorks") {
    const product = url.searchParams.get("product") || "";
    const category = url.searchParams.get("category") || "";
    if (!product) return Response.json({ error: "product param required" }, { status: 400 });
    return Response.json(buildImageDorks(product, category));
  }

  // Default: quick image search
  const product = url.searchParams.get("product");
  const category = url.searchParams.get("category") || "";
  const max = parseInt(url.searchParams.get("max") || "8");
  const strategies = url.searchParams.get("strategies")?.split(",").filter(Boolean);

  if (!product) {
    return Response.json({ error: "product query param required" }, { status: 400 });
  }

  const result = await sourceProductImages(product, {
    category,
    maxImages: Math.min(max, 20),
    strategies,
    log: () => {},
  });

  return Response.json(result);
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();
  const { intent } = body;

  if (intent === "search") {
    // Direct image search without AI agent
    const { product, category, maxImages, strategies, validate } = body;
    if (!product) return Response.json({ error: "product is required" }, { status: 400 });

    const result = await sourceProductImages(product, {
      category,
      maxImages: maxImages || 8,
      strategies,
      validate: validate || false,
      log: () => {},
    });

    return Response.json(result);
  }

  if (intent === "agent") {
    // Full MediaAgent run — streams NDJSON
    const { task } = body;
    if (!task) return Response.json({ error: "task is required" }, { status: 400 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event) => {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        };

        try {
          emit({ type: 'agent_start', agent: 'MediaAgent', task });
          const result = await runMediaAgent(task, admin);

          for (const call of result.toolCalls) {
            emit({ type: 'tool_call', agent: 'MediaAgent', tool: call.tool, input: call.input, result: call.result });
          }

          emit({ type: 'agent_done', agent: 'MediaAgent', steps: result.steps, output: result.output });
          emit({ type: 'done' });
        } catch (err) {
          emit({ type: 'agent_error', agent: 'MediaAgent', error: err.message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
    });
  }

  return Response.json({ error: "Unknown intent. Use 'search' or 'agent'." }, { status: 400 });
}
