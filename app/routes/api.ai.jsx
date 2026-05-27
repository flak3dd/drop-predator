/**
 * app/routes/api.ai.jsx
 * ---------------------------------------------------------
 * Main AI agent endpoint. Accepts a natural-language goal,
 * runs the orchestrator or individual agents, and streams
 * back an NDJSON event log so the UI can show progress.
 *
 * POST /api/ai
 * Body: { goal: string, agents?: string[] }
 *
 * Response: newline-delimited JSON (NDJSON) event stream
 */

import { authenticate } from "../shopify.server";
import {
  runOrchestratorAgent,
  runProductAgent,
  runMediaAgent,
  runEmailAgent,
  runShippingAgent,
  runInventoryAgent,
} from "../services/ai/agents.js";

const AGENT_RUNNERS = {
  ProductAgent:   (task, admin) => runProductAgent(task, admin),
  MediaAgent:     (task, admin) => runMediaAgent(task, admin),
  EmailAgent:     (task) => runEmailAgent(task),
  ShippingAgent:  (task) => runShippingAgent(task),
  InventoryAgent: (task, admin) => runInventoryAgent(task, admin),
};

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { goal, agents } = body;

  if (!goal || typeof goal !== "string" || !goal.trim()) {
    return Response.json({ error: "Goal is required" }, { status: 400 });
  }

  // Check AI Gateway availability early
  try {
    const { getGatewayModel, MODELS } = await import("../services/ai/gateway.js");
    await getGatewayModel(MODELS.fast);
  } catch (err) {
    return Response.json({
      error: `AI Gateway unavailable: ${err.message}. Check that AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is set.`,
    }, { status: 503 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event) => {
        if (!event.timestamp) event.timestamp = new Date().toISOString();
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          /* stream may have been cancelled */
        }
      };

      try {
        emit({ type: "start", goal, shop: session.shop });

        if (agents && agents.length > 0) {
          // ─── Manual mode: run specific agents ──────────────────────
          emit({ type: "info", message: `Running ${agents.length} agent${agents.length > 1 ? "s" : ""} in sequence...` });

          for (const agentName of agents) {
            const runner = AGENT_RUNNERS[agentName];
            if (!runner) {
              emit({ type: "agent_error", agent: agentName, error: `Unknown agent: ${agentName}` });
              continue;
            }

            emit({ type: "agent_start", agent: agentName, task: goal });

            try {
              const result = await runner(goal, admin);

              for (const call of result.toolCalls) {
                emit({
                  type: "tool_call",
                  agent: agentName,
                  tool: call.tool,
                  input: call.input,
                  result: call.result,
                });
              }
              emit({
                type: "agent_done",
                agent: agentName,
                steps: result.steps,
                output: result.output,
              });
            } catch (err) {
              emit({ type: "agent_error", agent: agentName, error: err.message });
            }
          }

          emit({ type: "done", message: "All specified agents completed." });
        } else {
          // ─── Auto mode: full orchestrated run ──────────────────────
          emit({ type: "orchestrator_planning", message: "Analysing goal and planning agent tasks..." });

          const { plan, agentResults, summary } = await runOrchestratorAgent(goal, admin);

          emit({ type: "orchestrator_plan", plan });

          for (const result of agentResults) {
            emit({ type: "agent_start", agent: result.agent });

            for (const call of result.toolCalls) {
              emit({
                type: "tool_call",
                agent: result.agent,
                tool: call.tool,
                input: call.input,
                result: call.result,
              });
            }

            if (result.error) {
              emit({ type: "agent_error", agent: result.agent, error: result.error });
            } else {
              emit({
                type: "agent_done",
                agent: result.agent,
                steps: result.steps,
                output: result.output,
              });
            }
          }

          emit({ type: "summary", summary });
          emit({ type: "done" });
        }
      } catch (err) {
        emit({ type: "fatal_error", error: err.message });
      } finally {
        try {
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
