/**
 * app/routes/api.modules.research.jsx
 * 
 * Modular API endpoint for product research.
 * Demonstrates the new module system with clear separation of concerns.
 * 
 * POST /api/modules/research
 * Body: { product: string, mode: 'full'|'sentiment'|'compare'|'themes' }
 * 
 * Response: NDJSON event stream with tagged log lines + final results.
 */

import { authenticate } from "../shopify.server";
import { ResearchModule } from "../modules/research/research-module.js";
import { getModuleConfig } from "../modules/config.js";

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { product, mode = "full" } = body;

  if (!product || typeof product !== "string" || !product.trim()) {
    return Response.json({ error: "Product name is required" }, { status: 400 });
  }

  const validModes = ["full", "sentiment", "compare", "themes"];
  if (!validModes.includes(mode)) {
    return Response.json({ error: `Invalid mode. Use: ${validModes.join(", ")}` }, { status: 400 });
  }

  // Initialize Research Module with configuration
  const config = getModuleConfig('research');
  const researchModule = new ResearchModule(config);
  
  await researchModule.initialize();

  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (tag, cls, msg, data) => {
        const event = {
          tag,
          cls,
          msg,
          timestamp: new Date().toISOString(),
        };
        if (data) event.data = data;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          /* stream cancelled */
        }
      };

      try {
        emit("sys", "tag-sys", `Research Module initialized — mode: ${mode}`);
        emit("sys", "tag-sys", `Target: "${product.trim()}"`);

        // Use the modular research function
        const results = await researchModule.researchProduct({
          product: product.trim(),
          mode,
          onProgress: (progress) => {
            if (progress.phase) {
              emit("agent", "tag-agent", `${progress.phase}: ${progress.message || ''}`);
              if (progress.detail) {
                emit("tool", "tag-tool", `Detail: ${JSON.stringify(progress.detail)}`);
              }
            }
          },
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        emit("sys", "tag-sys", `Research complete ✓ — ${elapsed}s elapsed`);

        // Emit final results in the expected format
        emit("results", "tag-sys", "Analysis complete", {
          score: results.sentiment?.score || "—",
          reviews: String(results.sentiment?.signals || 0),
          pos: `${results.sentiment?.positive || 0}%`,
          neg: `${results.sentiment?.negative || 0}%`,
          posN: results.sentiment?.positive || 0,
          neuN: results.sentiment?.neutral || 0,
          negN: results.sentiment?.negative || 0,
          themes: results.themes || [],
          avgSentiment: results.sentiment?.avgSentiment || "0.00",
          avgHype: results.sentiment?.avgHype || 0,
          topSignals: results.topSignals || [],
          mentions: results.discovery?.mentions || [],
          crossPlatform: results.discovery?.crossPlatform || [],
          competitors: results.discovery?.competitors || [],
        });

      } catch (err) {
        emit("err", "tag-err", `Research failed: ${err.message}`);
        console.error("[ResearchModule] Error:", err);
      } finally {
        try {
          await researchModule.cleanup();
          controller.close();
        } catch {
          /* already closed */
        }
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