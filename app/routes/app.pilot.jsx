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

import { useState, useRef, useCallback } from "react";
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
  { id: "ProductAgent", label: "Product", icon: "📦", desc: "Create listings, write descriptions, manage tags" },
  { id: "MediaAgent", label: "Media", icon: "🖼️", desc: "Source images via search engines, dorking, and crawling" },
  { id: "EmailAgent", label: "Email", icon: "📧", desc: "Draft replies, classify urgency, clear inbox" },
  { id: "ShippingAgent", label: "Shipping", icon: "🚚", desc: "Configure zones, rates, free shipping rules" },
  { id: "InventoryAgent", label: "Inventory", icon: "📊", desc: "Check stock levels, flag low items" },
];

const QUICK_GOALS = [
  "Find 6 high-quality product images for a tactical resistance band set and attach them to my store",
  "Process all unreplied customer emails and send empathetic responses",
  "Check inventory levels and flag products below 20 units",
  "Create a product listing for a premium yoga mat priced at $89.99 and source images for it",
  "Set up shipping rules for Australia, NZ, and US with free shipping over $100",
];

export default function PilotPage() {
  const [goal, setGoal] = useState("");
  const [activeTab, setActiveTab] = useState("orchestrator");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [stats, setStats] = useState({ agents: 0, tools: 0, steps: 0 });

  // Content generation state
  const [genTab, setGenTab] = useState("listing");
  const [genOutput, setGenOutput] = useState("");
  const [genLoading, setGenLoading] = useState(false);

  const abortRef = useRef(null);
  const eventEndRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    eventEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // ─── Run agent orchestrator ─────────────────────────────────────────

  const runGoal = async () => {
    if (!goal.trim() || running) return;

    setRunning(true);
    setEvents([]);
    setSummary(null);
    setStats({ agents: 0, tools: 0, steps: 0 });

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

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            setEvents(prev => [...prev, event]);

            // Update running stats
            if (event.type === 'agent_done') {
              setStats(prev => ({
                ...prev,
                agents: prev.agents + 1,
                steps: prev.steps + (event.steps || 0),
              }));
            }
            if (event.type === 'tool_call') {
              setStats(prev => ({ ...prev, tools: prev.tools + 1 }));
            }
            if (event.type === 'summary') {
              setSummary(event.summary);
            }

            scrollToBottom();
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setEvents(prev => [...prev, { type: 'fatal_error', error: err.message }]);
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
      prev.includes(agentId)
        ? prev.filter(a => a !== agentId)
        : [...prev, agentId]
    );
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

  return (
    <s-page title="AI Pilot" subtitle="Natural-language store automation">
      <div slot="primaryAction">
        {running ? (
          <s-button variant="destructive" onClick={stopRun}>Stop</s-button>
        ) : (
          <s-button variant="primary" onClick={runGoal} disabled={!goal.trim()}>
            Run Pilot
          </s-button>
        )}
      </div>

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
              <StatCard label="Agents run" value={stats.agents} color="info" />
              <StatCard label="Tool calls" value={stats.tools} color="warning" />
              <StatCard label="Total steps" value={stats.steps} color="success" />
            </s-inline>
          </s-box>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
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
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runGoal(); } }}
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
                    <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)", marginBottom: 6 }}>Quick goals:</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {QUICK_GOALS.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => setGoal(q)}
                          style={{
                            fontSize: 10,
                            padding: "4px 8px",
                            borderRadius: 4,
                            border: "1px solid var(--p-color-border)",
                            background: "var(--p-color-bg-surface)",
                            color: "var(--p-color-text-secondary)",
                            cursor: "pointer",
                          }}
                        >
                          {q.length > 50 ? q.slice(0, 50) + '...' : q}
                        </button>
                      ))}
                    </div>
                  </div>
                </s-box>
              </s-card>

              {/* Event Stream */}
              <s-card>
                <s-box padding="400">
                  <s-text variant="headingSm">Event Stream</s-text>
                  <div style={{
                    maxHeight: 400,
                    overflowY: "auto",
                    marginTop: 8,
                    fontFamily: "monospace",
                    fontSize: 11,
                    lineHeight: 1.8,
                  }}>
                    {events.length === 0 ? (
                      <div style={{ color: "var(--p-color-text-secondary)", padding: "20px 0", textAlign: "center" }}>
                        Set a goal and press Run Pilot to start.
                      </div>
                    ) : (
                      events.map((event, i) => (
                        <EventLine key={i} event={event} />
                      ))
                    )}
                    <div ref={eventEndRef} />
                  </div>
                </s-box>
              </s-card>

              {/* Summary */}
              {summary && (
                <s-card>
                  <s-box padding="400">
                    <s-text variant="headingSm">Executive Summary</s-text>
                    <div style={{
                      marginTop: 8,
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap",
                      color: "var(--p-color-text)",
                    }}>
                      {summary}
                    </div>
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
                    Select specific agents or leave empty for auto-orchestration.
                  </div>
                  {AGENTS.map(agent => (
                    <div
                      key={agent.id}
                      onClick={() => toggleAgent(agent.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAgent(agent.id); } }}
                      role="checkbox"
                      aria-checked={selectedAgents.includes(agent.id)}
                      tabIndex={0}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 8,
                        cursor: "pointer",
                        marginBottom: 6,
                        border: selectedAgents.includes(agent.id)
                          ? "1px solid var(--p-color-border-emphasis)"
                          : "1px solid var(--p-color-border)",
                        background: selectedAgents.includes(agent.id)
                          ? "var(--p-color-bg-surface-secondary)"
                          : "transparent",
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{agent.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{agent.label}</div>
                        <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)", marginTop: 2 }}>
                          {agent.desc}
                        </div>
                      </div>
                      <div style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: "2px solid var(--p-color-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        background: selectedAgents.includes(agent.id) ? "var(--p-color-bg-fill-brand)" : "transparent",
                        color: "white",
                      }}>
                        {selectedAgents.includes(agent.id) && "✓"}
                      </div>
                    </div>
                  ))}
                </s-box>
              </s-card>

              {/* Agent info card */}
              <s-card>
                <s-box padding="400">
                  <s-text variant="headingSm">How it works</s-text>
                  <div style={{ fontSize: 11, lineHeight: 1.6, marginTop: 8, color: "var(--p-color-text-secondary)" }}>
                    <p style={{ marginBottom: 8 }}>
                      <strong>Auto mode:</strong> The orchestrator reads your goal, plans which agents to use, runs them in sequence, and produces a summary.
                    </p>
                    <p style={{ marginBottom: 8 }}>
                      <strong>Manual mode:</strong> Select specific agents to run directly against your goal. Useful when you know exactly which task to automate.
                    </p>
                    <p>
                      Each agent has specialised tools that interact with your Shopify store via the Admin API.
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
                { id: "listing", label: "Product Listing" },
                { id: "description", label: "Description" },
                { id: "images", label: "Image Search" },
                { id: "shipping", label: "Shipping Rule" },
                { id: "email", label: "Email Reply" },
              ].map(tab => (
                <s-button
                  key={tab.id}
                  variant={genTab === tab.id ? "primary" : "tertiary"}
                  size="slim"
                  onClick={() => { setGenTab(tab.id); setGenOutput(""); }}
                >
                  {tab.label}
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
                  {genTab === "listing" && <ListingForm onSubmit={data => generateContent("/api/ai/listing", data)} loading={genLoading} />}
                  {genTab === "description" && <DescriptionForm onSubmit={data => generateContent("/api/ai/description", data)} loading={genLoading} />}
                  {genTab === "images" && <ImageSearchForm onSubmit={data => generateContent("/api/ai/media", { ...data, intent: "search" })} loading={genLoading} />}
                  {genTab === "shipping" && <ShippingForm onSubmit={data => generateContent("/api/ai/shipping", data)} loading={genLoading} />}
                  {genTab === "email" && <EmailForm onSubmit={data => generateContent("/api/ai/email", data)} loading={genLoading} />}
                </div>
              </s-box>
            </s-card>

            {/* Output panel */}
            <s-card>
              <s-box padding="400">
                <s-text variant="headingSm">Output</s-text>
                <div style={{
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
                }}>
                  {genLoading && !genOutput && (
                    <span style={{ color: "var(--p-color-text-secondary)" }}>Generating...</span>
                  )}
                  {genOutput || (!genLoading && <span style={{ color: "var(--p-color-text-secondary)" }}>Output will appear here.</span>)}
                </div>
              </s-box>
            </s-card>
          </div>
        </>
      )}
    </s-page>
  );
}
