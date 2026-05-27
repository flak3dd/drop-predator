/**
 * app/routes/app.pilot.jsx
 * ---------------------------------------------------------
 * AI Pilot — natural-language store automation dashboard.
 * Users type a goal, the orchestrator plans which agents to run,
 * and the UI streams back real-time progress via NDJSON.
 *
 * Also provides quick-access panels for AI content generation
 * (listings, descriptions, shipping rules, email replies).
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { StatCard } from "../components/engine-ui";
import { EventLine } from "../components/pilot/EventLine";
import {
  ListingForm,
  DescriptionForm,
  ShippingForm,
  EmailForm,
  ImageSearchForm,
} from "../components/pilot/GenerateForms";

const AGENTS = [
  { id: "ProductAgent",   label: "Product",   icon: "📦", desc: "Create listings, write descriptions, manage tags" },
  { id: "MediaAgent",     label: "Media",     icon: "🖼️", desc: "Source images via search engines, dorking, and crawling" },
  { id: "EmailAgent",     label: "Email",     icon: "📧", desc: "Draft replies, classify urgency, clear inbox" },
  { id: "ShippingAgent",  label: "Shipping",  icon: "🚚", desc: "Configure zones, rates, free shipping rules" },
  { id: "InventoryAgent", label: "Inventory", icon: "📊", desc: "Check stock levels, flag low items" },
];

const QUICK_GOALS = [
  { text: "Find 6 high-quality product images for a tactical resistance band set and attach them to my store", icon: "🖼️" },
  { text: "Process all unreplied customer emails and send empathetic responses", icon: "📧" },
  { text: "Check inventory levels and flag products below 20 units", icon: "📊" },
  { text: "Create a product listing for a premium yoga mat priced at $89.99 and source images for it", icon: "📦" },
  { text: "Set up shipping rules for Australia, NZ, and US with free shipping over $100", icon: "🚚" },
];

export default function PilotPage() {
  const [goal, setGoal] = useState("");
  const [activeTab, setActiveTab] = useState("orchestrator");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [stats, setStats] = useState({ agents: 0, tools: 0, steps: 0, errors: 0 });
  const [elapsed, setElapsed] = useState(0);
  const [lastGoal, setLastGoal] = useState("");

  // Content generation state
  const [genTab, setGenTab] = useState("listing");
  const [genOutput, setGenOutput] = useState("");
  const [genLoading, setGenLoading] = useState(false);

  const abortRef = useRef(null);
  const eventEndRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    eventEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Elapsed time ticker
  useEffect(() => {
    if (running) {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [running]);

  // ─── Run agent orchestrator ─────────────────────────────────────────

  const runGoal = async () => {
    if (!goal.trim() || running) return;

    setRunning(true);
    setEvents([]);
    setSummary(null);
    setStats({ agents: 0, tools: 0, steps: 0, errors: 0 });
    setElapsed(0);
    setLastGoal(goal);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const body = { goal };
      if (selectedAgents.length > 0) {
        body.agents = selectedAgents;
      }

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        setEvents(prev => [...prev, {
          type: "fatal_error",
          error: `API error ${res.status}: ${errText}`,
          timestamp: new Date().toISOString(),
        }]);
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            // Add timestamp if missing
            if (!event.timestamp) event.timestamp = new Date().toISOString();

            setEvents(prev => [...prev, event]);

            // Update running stats
            if (event.type === "agent_done") {
              setStats(prev => ({
                ...prev,
                agents: prev.agents + 1,
                steps: prev.steps + (event.steps || 0),
              }));
            }
            if (event.type === "tool_call") {
              setStats(prev => ({ ...prev, tools: prev.tools + 1 }));
            }
            if (event.type === "agent_error" || event.type === "fatal_error") {
              setStats(prev => ({ ...prev, errors: prev.errors + 1 }));
            }
            if (event.type === "summary") {
              setSummary(event.summary);
            }

            scrollToBottom();
          } catch {
            /* skip malformed lines */
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setEvents(prev => [
          ...prev,
          { type: "fatal_error", error: err.message, timestamp: new Date().toISOString() },
        ]);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const stopRun = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const toggleAgent = (agentId) => {
    setSelectedAgents(prev =>
      prev.includes(agentId) ? prev.filter(a => a !== agentId) : [...prev, agentId],
    );
  };

  const clearEvents = () => {
    setEvents([]);
    setSummary(null);
    setStats({ agents: 0, tools: 0, steps: 0, errors: 0 });
    setElapsed(0);
  };

  // ─── Content generation ─────────────────────────────────────────────

  const generateContent = async (endpoint, body) => {
    setGenLoading(true);
    setGenOutput("");

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        setGenOutput(`Error ${res.status}: ${errText}`);
        return;
      }

      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json();
        setGenOutput(JSON.stringify(data, null, 2));
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let text = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          setGenOutput(text);
        }
      }
    } catch (err) {
      setGenOutput(`Error: ${err.message}`);
    } finally {
      setGenLoading(false);
    }
  };

  const copyOutput = () => {
    if (genOutput) navigator.clipboard?.writeText(genOutput);
  };

  const formatElapsed = (s) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <s-page title="AI Pilot" subtitle="Natural-language store automation">
      <div slot="primaryAction">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {running && (
            <span style={{
              fontSize: 11,
              color: "var(--p-color-text-caution)",
              fontFamily: "monospace",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#FF9800", animation: "pulse 1.5s infinite" }} />
              {formatElapsed(elapsed)}
            </span>
          )}
          {running ? (
            <s-button variant="destructive" onClick={stopRun}>Stop</s-button>
          ) : (
            <s-button variant="primary" onClick={runGoal} disabled={!goal.trim()}>
              Run Pilot
            </s-button>
          )}
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>

      {/* Tab Navigation */}
      <s-box padding="400" background="bg-surface-secondary" borderRadius="300" style={{ marginBottom: "16px" }}>
        <s-inline gap="200">
          <s-button
            variant={activeTab === "orchestrator" ? "primary" : "tertiary"}
            size="slim"
            onClick={() => setActiveTab("orchestrator")}
          >
            Agent Orchestrator
          </s-button>
          <s-button
            variant={activeTab === "generate" ? "primary" : "tertiary"}
            size="slim"
            onClick={() => setActiveTab("generate")}
          >
            AI Generate
          </s-button>
        </s-inline>
      </s-box>

      {activeTab === "orchestrator" ? (
        <>
          {/* Stats */}
          <s-box padding="400" background="bg-surface-secondary" borderRadius="300" style={{ marginBottom: "16px" }}>
            <s-inline gap="300">
              <StatCard label="Agents" value={stats.agents} color="info" />
              <StatCard label="Tool calls" value={stats.tools} color="warning" />
              <StatCard label="Steps" value={stats.steps} color="success" />
              {stats.errors > 0 && <StatCard label="Errors" value={stats.errors} color="critical" />}
              {elapsed > 0 && <StatCard label="Elapsed" value={formatElapsed(elapsed)} color="info" />}
            </s-inline>
          </s-box>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16 }}>
            {/* Left: Goal + Events */}
            <div>
              {/* Goal Input */}
              <s-card>
                <s-box padding="400">
                  <s-text variant="headingSm">Goal</s-text>
                  <div style={{ marginTop: 8 }}>
                    <textarea
                      value={goal}
                      onChange={e => setGoal(e.target.value)}
                      placeholder="Describe what you want to automate..."
                      rows={3}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          runGoal();
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: "1px solid var(--p-color-border)",
                        background: "var(--p-color-bg-surface)",
                        color: "var(--p-color-text)",
                        fontSize: 13,
                        fontFamily: "inherit",
                        resize: "vertical",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)", marginBottom: 6 }}>
                      Quick goals:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {QUICK_GOALS.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => setGoal(q.text)}
                          style={{
                            fontSize: 10,
                            padding: "4px 8px",
                            borderRadius: 4,
                            border: goal === q.text
                              ? "1px solid var(--p-color-border-emphasis)"
                              : "1px solid var(--p-color-border)",
                            background: goal === q.text
                              ? "var(--p-color-bg-surface-secondary)"
                              : "var(--p-color-bg-surface)",
                            color: "var(--p-color-text-secondary)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 3,
                          }}
                        >
                          <span>{q.icon}</span>
                          {q.text.length > 50 ? q.text.slice(0, 50) + "..." : q.text}
                        </button>
                      ))}
                    </div>
                  </div>
                </s-box>
              </s-card>

              {/* Event Stream */}
              <s-card>
                <s-box padding="400">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <s-text variant="headingSm">Event Stream</s-text>
                    <div style={{ display: "flex", gap: 6 }}>
                      {events.length > 0 && !running && (
                        <button
                          onClick={clearEvents}
                          style={{
                            fontSize: 10,
                            padding: "3px 8px",
                            borderRadius: 4,
                            border: "1px solid var(--p-color-border)",
                            background: "var(--p-color-bg-surface)",
                            color: "var(--p-color-text-secondary)",
                            cursor: "pointer",
                          }}
                        >
                          Clear
                        </button>
                      )}
                      {events.length > 0 && (
                        <span style={{ fontSize: 10, color: "var(--p-color-text-secondary)", padding: "3px 0" }}>
                          {events.length} events
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      maxHeight: 420,
                      overflowY: "auto",
                      fontFamily: "monospace",
                      fontSize: 11,
                      lineHeight: 1.6,
                    }}
                  >
                    {events.length === 0 ? (
                      <div
                        style={{
                          color: "var(--p-color-text-secondary)",
                          padding: "32px 0",
                          textAlign: "center",
                          fontSize: 12,
                        }}
                      >
                        <div style={{ fontSize: 28, marginBottom: 8 }}>🤖</div>
                        <div>Set a goal and press <strong>Run Pilot</strong> to start.</div>
                        <div style={{ fontSize: 10, marginTop: 4 }}>
                          The orchestrator will plan which agents to run and stream progress here.
                        </div>
                      </div>
                    ) : (
                      events.map((event, i) => <EventLine key={i} event={event} />)
                    )}
                    <div ref={eventEndRef} />
                  </div>
                </s-box>
              </s-card>

              {/* Summary */}
              {summary && (
                <s-card>
                  <s-box padding="400">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <s-text variant="headingSm">Executive Summary</s-text>
                      <button
                        onClick={() => navigator.clipboard?.writeText(summary)}
                        style={{
                          fontSize: 10,
                          padding: "3px 8px",
                          borderRadius: 4,
                          border: "1px solid var(--p-color-border)",
                          background: "var(--p-color-bg-surface)",
                          color: "var(--p-color-text-secondary)",
                          cursor: "pointer",
                        }}
                      >
                        Copy
                      </button>
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        lineHeight: 1.7,
                        whiteSpace: "pre-wrap",
                        color: "var(--p-color-text)",
                        padding: "12px",
                        borderRadius: 8,
                        background: "var(--p-color-bg-surface-secondary)",
                        border: "1px solid var(--p-color-border-subdued)",
                      }}
                    >
                      {summary}
                    </div>
                    {lastGoal && (
                      <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)", marginTop: 8 }}>
                        Goal: &quot;{lastGoal}&quot; | {stats.agents} agents | {stats.tools} tools | {formatElapsed(elapsed)}
                      </div>
                    )}
                  </s-box>
                </s-card>
              )}
            </div>

            {/* Right: Agent selector */}
            <div>
              <s-card>
                <s-box padding="400">
                  <s-text variant="headingSm">Agents</s-text>
                  <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)", marginTop: 4, marginBottom: 12 }}>
                    {selectedAgents.length === 0
                      ? "Auto-orchestration — AI picks the best agents for your goal."
                      : `${selectedAgents.length} agent${selectedAgents.length > 1 ? "s" : ""} selected — will run in order.`}
                  </div>
                  {AGENTS.map(agent => {
                    const selected = selectedAgents.includes(agent.id);
                    return (
                      <div
                        key={agent.id}
                        onClick={() => toggleAgent(agent.id)}
                        onKeyDown={e => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleAgent(agent.id);
                          }
                        }}
                        role="checkbox"
                        aria-checked={selected}
                        tabIndex={0}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          borderRadius: 8,
                          cursor: "pointer",
                          marginBottom: 6,
                          border: selected
                            ? "1px solid var(--p-color-border-emphasis)"
                            : "1px solid var(--p-color-border)",
                          background: selected
                            ? "var(--p-color-bg-surface-secondary)"
                            : "transparent",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span style={{ fontSize: 20 }}>{agent.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{agent.label}</div>
                          <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)", marginTop: 2 }}>
                            {agent.desc}
                          </div>
                        </div>
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 4,
                            border: selected
                              ? "2px solid var(--p-color-bg-fill-brand)"
                              : "2px solid var(--p-color-border)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 12,
                            background: selected ? "var(--p-color-bg-fill-brand)" : "transparent",
                            color: "white",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {selected && "✓"}
                        </div>
                      </div>
                    );
                  })}

                  {selectedAgents.length > 0 && (
                    <button
                      onClick={() => setSelectedAgents([])}
                      style={{
                        width: "100%",
                        marginTop: 8,
                        fontSize: 10,
                        padding: "6px",
                        borderRadius: 4,
                        border: "1px solid var(--p-color-border)",
                        background: "transparent",
                        color: "var(--p-color-text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      Clear selection (use auto-orchestration)
                    </button>
                  )}
                </s-box>
              </s-card>

              {/* How it works */}
              <s-card>
                <s-box padding="400">
                  <s-text variant="headingSm">How it works</s-text>
                  <div style={{ fontSize: 11, lineHeight: 1.6, marginTop: 8, color: "var(--p-color-text-secondary)" }}>
                    <p style={{ marginBottom: 8 }}>
                      <strong>Auto mode:</strong> The orchestrator reads your goal, plans which
                      agents to use, runs them in sequence, and produces a summary.
                    </p>
                    <p style={{ marginBottom: 8 }}>
                      <strong>Manual mode:</strong> Select specific agents to run directly against
                      your goal. Useful when you know exactly which task to automate.
                    </p>
                    <p>
                      Each agent has specialised tools that interact with your Shopify store via the
                      Admin API. Click any tool call in the event stream to see its result.
                    </p>
                  </div>
                </s-box>
              </s-card>
            </div>
          </div>
        </>
      ) : (
        /* ─── AI Generate tab ──────────────────────────────────────────── */
        <>
          <s-box padding="400" background="bg-surface-secondary" borderRadius="300" style={{ marginBottom: "16px" }}>
            <s-inline gap="200">
              {[
                { id: "listing",     label: "Product Listing", icon: "📦" },
                { id: "description", label: "Description",     icon: "📝" },
                { id: "images",      label: "Image Search",    icon: "🖼️" },
                { id: "shipping",    label: "Shipping Rule",   icon: "🚚" },
                { id: "email",       label: "Email Reply",     icon: "📧" },
              ].map(tab => (
                <s-button
                  key={tab.id}
                  variant={genTab === tab.id ? "primary" : "tertiary"}
                  size="slim"
                  onClick={() => {
                    setGenTab(tab.id);
                    setGenOutput("");
                  }}
                >
                  {tab.icon} {tab.label}
                </s-button>
              ))}
            </s-inline>
          </s-box>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Input panel */}
            <s-card>
              <s-box padding="400">
                <s-text variant="headingSm">Input</s-text>
                <div style={{ marginTop: 12 }}>
                  {genTab === "listing" && (
                    <ListingForm
                      onSubmit={data => generateContent("/api/ai/listing", data)}
                      loading={genLoading}
                    />
                  )}
                  {genTab === "description" && (
                    <DescriptionForm
                      onSubmit={data => generateContent("/api/ai/description", data)}
                      loading={genLoading}
                    />
                  )}
                  {genTab === "images" && (
                    <ImageSearchForm
                      onSubmit={data => generateContent("/api/ai/media", { ...data, intent: "search" })}
                      loading={genLoading}
                    />
                  )}
                  {genTab === "shipping" && (
                    <ShippingForm
                      onSubmit={data => generateContent("/api/ai/shipping", data)}
                      loading={genLoading}
                    />
                  )}
                  {genTab === "email" && (
                    <EmailForm
                      onSubmit={data => generateContent("/api/ai/email", data)}
                      loading={genLoading}
                    />
                  )}
                </div>
              </s-box>
            </s-card>

            {/* Output panel */}
            <s-card>
              <s-box padding="400">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <s-text variant="headingSm">Output</s-text>
                  <div style={{ display: "flex", gap: 6 }}>
                    {genOutput && !genLoading && (
                      <>
                        <button
                          onClick={copyOutput}
                          style={{
                            fontSize: 10,
                            padding: "3px 8px",
                            borderRadius: 4,
                            border: "1px solid var(--p-color-border)",
                            background: "var(--p-color-bg-surface)",
                            color: "var(--p-color-text-secondary)",
                            cursor: "pointer",
                          }}
                        >
                          Copy
                        </button>
                        <button
                          onClick={() => setGenOutput("")}
                          style={{
                            fontSize: 10,
                            padding: "3px 8px",
                            borderRadius: 4,
                            border: "1px solid var(--p-color-border)",
                            background: "var(--p-color-bg-surface)",
                            color: "var(--p-color-text-secondary)",
                            cursor: "pointer",
                          }}
                        >
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    minHeight: 200,
                    maxHeight: 500,
                    overflowY: "auto",
                    fontFamily: "monospace",
                    fontSize: 12,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    padding: "12px",
                    borderRadius: 8,
                    border: "1px solid var(--p-color-border)",
                    background: "var(--p-color-bg-surface-secondary)",
                    color: "var(--p-color-text)",
                    wordBreak: "break-word",
                  }}
                >
                  {genLoading && !genOutput && (
                    <div style={{ color: "var(--p-color-text-secondary)", textAlign: "center", padding: "20px 0" }}>
                      <div style={{ fontSize: 20, marginBottom: 6 }}>✨</div>
                      <div>Generating...</div>
                    </div>
                  )}
                  {genLoading && genOutput && (
                    <>
                      {genOutput}
                      <span style={{
                        display: "inline-block",
                        width: 6,
                        height: 14,
                        background: "var(--p-color-text)",
                        animation: "pulse 1s infinite",
                        marginLeft: 1,
                        verticalAlign: "text-bottom",
                      }} />
                    </>
                  )}
                  {!genLoading && genOutput && genOutput}
                  {!genLoading && !genOutput && (
                    <div style={{ color: "var(--p-color-text-secondary)", textAlign: "center", padding: "20px 0" }}>
                      <div style={{ fontSize: 20, marginBottom: 6 }}>📄</div>
                      <div>Output will appear here.</div>
                    </div>
                  )}
                </div>
              </s-box>
            </s-card>
          </div>
        </>
      )}
    </s-page>
  );
}
