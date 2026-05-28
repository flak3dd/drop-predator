/**
 * app/routes/api.modules.pipeline.jsx
 * 
 * Modular API endpoint for the profit pipeline.
 * Demonstrates orchestration between Research and Shopify modules.
 * 
 * POST /api/modules/pipeline
 * Body: { 
 *   product: string,
 *   importEnabled: boolean,
 *   researchMode: string,
 *   config: object
 * }
 * 
 * Response: NDJSON event stream with pipeline progress and results.
 */

import { authenticate } from "../shopify.server";
import { initializeModuleSystem } from "../modules/index.js";
import { getModuleConfig } from "../modules/config.js";

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { product, importEnabled = false, researchMode = "full", config = {} } = body;

  if (!product || typeof product !== "string" || !product.trim()) {
    return Response.json({ error: "Product name is required" }, { status: 400 });
  }

  // Initialize module system
  const moduleConfig = {
    research: getModuleConfig('research'),
    shopify: {
      ...getModuleConfig('shopify'),
      admin: admin,
      shop: session.shop,
    },
    orchestration: {
      ...getModuleConfig('orchestration'),
      ...config,
    },
  };

  const { researchModule, shopifyModule, orchestrationModule } = await initializeModuleSystem(moduleConfig);

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
        emit("sys", "tag-sys", `Module system initialized`);
        emit("sys", "tag-sys", `Starting profit pipeline for "${product.trim()}"`);
        emit("sys", "tag-sys", `Import enabled: ${importEnabled}, Research mode: ${researchMode}`);

        // Execute the orchestrated pipeline
        const pipelineResults = await orchestrationModule.executeProfitPipeline({
          product: product.trim(),
          shopifyContext: importEnabled ? { admin, shop: session.shop } : null,
          config: {
            researchMode,
            importEnabled,
            ...config,
          },
          onProgress: (progress) => {
            if (progress.phase) {
              emit("agent", "tag-agent", `${progress.phase}: ${progress.message || ''}`);
              if (progress.workflow) {
                emit("sys", "tag-sys", `Workflow: ${progress.workflow}`);
              }
              if (progress.results) {
                emit("tool", "tag-tool", `Results: ${JSON.stringify(progress.results).substring(0, 200)}...`);
              }
              if (progress.productData) {
                emit("tool", "tag-tool", `Product data transformed`);
              }
              if (progress.importResult) {
                emit("tool", "tag-tool", `Import result: ${JSON.stringify(progress.importResult).substring(0, 200)}...`);
              }
            }
          },
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        emit("sys", "tag-sys", `Pipeline complete ✓ — ${elapsed}s elapsed`);

        // Emit final results
        emit("results", "tag-sys", "Pipeline complete", {
          success: pipelineResults.success,
          research: {
            sentiment: pipelineResults.research?.sentiment,
            themes: pipelineResults.research?.themes,
            signals: pipelineResults.research?.sentiment?.signals,
          },
          product: pipelineResults.product ? {
            title: pipelineResults.product.title,
            price: pipelineResults.product.price,
            tags: pipelineResults.product.tags,
          } : null,
          import: pipelineResults.import ? {
            productId: pipelineResults.import?.productId,
            success: true,
          } : null,
        });

      } catch (err) {
        emit("err", "tag-err", `Pipeline failed: ${err.message}`);
        console.error("[Pipeline] Error:", err);
      } finally {
        try {
          // Cleanup module system
          const { cleanupModuleSystem } = await import("../modules/index.js");
          await cleanupModuleSystem();
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