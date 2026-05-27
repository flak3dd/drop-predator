import { useState } from "react";
import { LogTag } from "../engine-ui";

export function EventLine({ event }) {
  const [expanded, setExpanded] = useState(false);

  const typeMap = {
    start:                 { tag: "START",   cls: "system" },
    orchestrator_planning: { tag: "PLAN",    cls: "ai" },
    orchestrator_plan:     { tag: "PLAN",    cls: "ai" },
    agent_start:           { tag: event.agent?.replace("Agent", "").toUpperCase() || "AGENT", cls: "scout" },
    agent_done:            { tag: "DONE",    cls: "import" },
    agent_error:           { tag: "ERROR",   cls: "error" },
    tool_call:             { tag: "TOOL",    cls: "negotiate" },
    tool_result:           { tag: "RESULT",  cls: "price" },
    summary:               { tag: "SUMMARY", cls: "ai" },
    done:                  { tag: "DONE",    cls: "import" },
    fatal_error:           { tag: "FATAL",   cls: "error" },
    info:                  { tag: "INFO",    cls: "system" },
  };

  const { tag, cls } = typeMap[event.type] || { tag: event.type, cls: "system" };

  let message = "";
  let detail = null;
  let hasDetail = false;

  if (event.type === "start") {
    message = `Goal: "${truncate(event.goal, 80)}"`;
  } else if (event.type === "orchestrator_planning") {
    message = event.message;
  } else if (event.type === "orchestrator_plan") {
    message = `Plan: ${truncate(event.plan, 120)}`;
    if (event.plan?.length > 120) { detail = event.plan; hasDetail = true; }
  } else if (event.type === "agent_start") {
    message = `Starting ${event.agent}...`;
    if (event.task) { detail = `Task: ${event.task}`; hasDetail = true; }
  } else if (event.type === "agent_done") {
    message = `${event.agent} completed (${event.steps} steps)`;
    if (event.output) { detail = event.output; hasDetail = true; }
  } else if (event.type === "agent_error") {
    message = `${event.agent} failed: ${truncate(event.error, 100)}`;
    if (event.error?.length > 100) { detail = event.error; hasDetail = true; }
  } else if (event.type === "tool_call") {
    const args = event.input ? summarizeArgs(event.input) : "";
    message = `${event.agent} → ${event.tool}(${args})`;
    if (event.result !== undefined) {
      detail = typeof event.result === "string" ? event.result : JSON.stringify(event.result, null, 2);
      hasDetail = true;
    }
  } else if (event.type === "summary") {
    message = "Executive summary ready";
  } else if (event.type === "done") {
    message = event.message || "All agents completed.";
  } else if (event.type === "fatal_error") {
    message = `Fatal: ${event.error}`;
  } else if (event.type === "info") {
    message = event.message || "";
  }

  const time = event.timestamp ? formatTime(event.timestamp) : null;

  return (
    <div style={{ borderBottom: "1px solid var(--p-color-border-subdued)", padding: "4px 0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          cursor: hasDetail ? "pointer" : "default",
        }}
        onClick={() => hasDetail && setExpanded(!expanded)}
        onKeyDown={e => { if (hasDetail && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setExpanded(!expanded); } }}
        role={hasDetail ? "button" : undefined}
        tabIndex={hasDetail ? 0 : undefined}
      >
        {time && (
          <span style={{ fontSize: 9, color: "var(--p-color-text-secondary)", fontFamily: "monospace", minWidth: 48 }}>
            {time}
          </span>
        )}
        <LogTag tag={tag} cls={cls} />
        <span style={{ flex: 1, fontSize: 11 }}>{message}</span>
        {hasDetail && (
          <span style={{ fontSize: 9, color: "var(--p-color-text-secondary)", marginLeft: 4 }}>
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </div>
      {expanded && detail && (
        <div style={{
          marginTop: 4,
          marginLeft: 52,
          padding: "6px 10px",
          borderRadius: 6,
          background: "var(--p-color-bg-surface-secondary)",
          border: "1px solid var(--p-color-border-subdued)",
          fontSize: 10,
          fontFamily: "monospace",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: 200,
          overflowY: "auto",
          color: "var(--p-color-text-secondary)",
        }}>
          {detail}
        </div>
      )}
    </div>
  );
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

function summarizeArgs(input) {
  if (!input || typeof input !== "object") return "";
  const keys = Object.keys(input);
  if (keys.length === 0) return "";
  if (keys.length <= 2) {
    return keys.map(k => {
      const v = input[k];
      const s = typeof v === "string" ? `"${truncate(v, 20)}"` : JSON.stringify(v);
      return `${k}: ${s}`;
    }).join(", ");
  }
  return `${keys.length} params`;
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}
