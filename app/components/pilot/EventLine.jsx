import PropTypes from "prop-types";
import { LogTag } from "../engine-ui";

export function EventLine({ event }) {
  const typeMap = {
    start: { tag: "START", cls: "system" },
    orchestrator_planning: { tag: "PLAN", cls: "ai" },
    orchestrator_plan: { tag: "PLAN", cls: "ai" },
    agent_start: { tag: event.agent?.replace("Agent", "").toUpperCase() || "AGENT", cls: "scout" },
    agent_done: { tag: "DONE", cls: "import" },
    agent_error: { tag: "ERROR", cls: "error" },
    tool_call: { tag: "TOOL", cls: "negotiate" },
    summary: { tag: "SUMMARY", cls: "system" },
    done: { tag: "DONE", cls: "import" },
    fatal_error: { tag: "FATAL", cls: "error" },
  };

  const { tag, cls } = typeMap[event.type] || { tag: event.type, cls: "system" };

  let message = "";
  if (event.type === "start") message = `Goal: "${event.goal}"`;
  else if (event.type === "orchestrator_planning") message = event.message;
  else if (event.type === "orchestrator_plan") message = `Plan: ${event.plan}`;
  else if (event.type === "agent_start") message = `Starting ${event.agent}...`;
  else if (event.type === "agent_done") message = `${event.agent} completed (${event.steps} steps)`;
  else if (event.type === "agent_error") message = `${event.agent} failed: ${event.error}`;
  else if (event.type === "tool_call") message = `${event.agent} → ${event.tool}()`;
  else if (event.type === "summary") message = "Summary ready";
  else if (event.type === "done") message = event.message || "All agents completed.";
  else if (event.type === "fatal_error") message = `Fatal: ${event.error}`;

  return (
    <div style={{ borderBottom: "1px solid var(--p-color-border-subdued)", padding: "3px 0" }}>
      <LogTag tag={tag} cls={cls} />
      <span>{message}</span>
    </div>
  );
}

EventLine.propTypes = {
  event: PropTypes.object.isRequired,
};
