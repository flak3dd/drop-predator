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

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const { goal, agents } = await request.json();

  if (!goal) {
    return Response.json({ error: "Goal is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      };

      try {
        emit({ type: 'start', goal, shop: session.shop, timestamp: new Date().toISOString() });

        if (agents && agents.length > 0) {
          // Run specific agents directly (no orchestrator)
          for (const agentName of agents) {
            emit({ type: 'agent_start', agent: agentName });

            let result;
            try {
              if (agentName === 'ProductAgent') result = await runProductAgent(goal, admin);
              else if (agentName === 'MediaAgent') result = await runMediaAgent(goal, admin);
              else if (agentName === 'EmailAgent') result = await runEmailAgent(goal);
              else if (agentName === 'ShippingAgent') result = await runShippingAgent(goal);
              else if (agentName === 'InventoryAgent') result = await runInventoryAgent(goal, admin);
              else {
                emit({ type: 'error', agent: agentName, error: 'Unknown agent' });
                continue;
              }

              for (const call of result.toolCalls) {
                emit({ type: 'tool_call', agent: agentName, tool: call.tool, input: call.input, result: call.result });
              }
              emit({ type: 'agent_done', agent: agentName, steps: result.steps, output: result.output });
            } catch (err) {
              emit({ type: 'agent_error', agent: agentName, error: err.message });
            }
          }
          emit({ type: 'done', message: 'All specified agents completed.' });
        } else {
          // Full orchestrated run
          emit({ type: 'orchestrator_planning', message: 'Analysing goal and planning agent tasks...' });

          const { plan, agentResults, summary } = await runOrchestratorAgent(goal, admin);

          emit({ type: 'orchestrator_plan', plan });

          for (const result of agentResults) {
            emit({ type: 'agent_start', agent: result.agent });
            for (const call of result.toolCalls) {
              emit({ type: 'tool_call', agent: result.agent, tool: call.tool, input: call.input, result: call.result });
            }
            if (result.error) {
              emit({ type: 'agent_error', agent: result.agent, error: result.error });
            } else {
              emit({ type: 'agent_done', agent: result.agent, steps: result.steps, output: result.output });
            }
          }

          emit({ type: 'summary', summary });
          emit({ type: 'done' });
        }
      } catch (err) {
        emit({ type: 'fatal_error', error: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  });
}
