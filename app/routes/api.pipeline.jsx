/**
 * app/routes/api.pipeline.jsx
 * ---------------------------------------------------------
 * Profit Maximization Pipeline — streaming endpoint.
 *
 * POST /api/pipeline
 * Body: {
 *   niche: string,
 *   config?: {
 *     scoreThreshold?: number,
 *     marginFloor?: number,
 *     moqMax?: number,
 *     surgeEnabled?: boolean,
 *     autoImport?: boolean,
 *     autoMedia?: boolean,
 *     maxProducts?: number,
 *     listingTierOverride?: 'smart' | 'fast' | 'template',
 *   }
 * }
 *
 * Response: NDJSON event stream
 */

import { authenticate } from "../shopify.server";
import { runProfitPipeline } from "../services/pipeline/profit-pipeline.js";

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { niche, config = {} } = body;

  if (!niche || typeof niche !== "string" || !niche.trim()) {
    return Response.json({ error: "Niche is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (tag, cls, msg, data) => {
        const event = { tag, cls, msg, timestamp: new Date().toISOString() };
        if (data) event.data = data;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch { /* stream cancelled */ }
      };

      try {
        emit("sys", "tag-sys", `Profit Pipeline starting — niche: "${niche}", shop: ${session.shop}`);

        await runProfitPipeline({
          niche: niche.trim(),
          admin,
          shop: session.shop,
          config,
          emit,
        });

      } catch (err) {
        emit("err", "tag-err", `Fatal: ${err.message}`);
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
