/**
 * app/components/pilot/ResearchAgent.jsx
 * ---------------------------------------------------------
 * Terminal-style product research & sentiment analysis agent.
 * Streams NDJSON from /api/ai/research and renders:
 *   • Sidebar workflow modes + tool info
 *   • Streaming log area with tagged events
 *   • Results panel: score, reviews, sentiment bar, themes
 */

import { useState, useRef, useCallback, useEffect } from "react";

// ─── Constants ──────────────────────────────────────────────────────────────

const MODES = [
  { id: "full",      label: "Full pipeline",    icon: "⚡" },
  { id: "sentiment", label: "Sentiment only",   icon: "😊" },
  { id: "compare",   label: "Compare products", icon: "📊" },
  { id: "themes",    label: "Theme mining",     icon: "🏷️" },
];

const TOOLS = [
  { id: "web_search",    label: "web_search",    icon: "🌐", desc: "Searches Reddit, HN, Google Trends for product discussions" },
  { id: "review_scrape", label: "review_scrape", icon: "🔍", desc: "Scrapes reviews from Amazon, Reddit, Best Buy, RTINGS, Wirecutter" },
  { id: "llm_analyze",   label: "llm_analyze",   icon: "🧠", desc: "AI sentiment analysis + theme extraction" },
  { id: "report_gen",    label: "report_gen",     icon: "📄", desc: "Compiles structured JSON/Markdown output" },
];

const TAG_STYLES = {
  sys:   { bg: "#D3D1C7", color: "#2C2C2A" },
  tool:  { bg: "#B5D4F4", color: "#042C53" },
  agent: { bg: "#9FE1CB", color: "#04342C" },
  warn:  { bg: "#FAC775", color: "#412402" },
  err:   { bg: "#F7C1C1", color: "#501313" },
};

const QUICK_PROMPTS = [
  { label: "top pain points", prompt: "What are the top pain points for this product?" },
  { label: "competitive analysis", prompt: "How does this product compare to its competitors?" },
  { label: "improvement requests", prompt: "What product improvements do reviewers most request?" },
  { label: "full report", prompt: "Summarize the key findings in a report format" },
];

// ─── Component ──────────────────────────────────────────────────────────────

export function ResearchAgent() {
  const [mode, setMode] = useState("full");
  const [product, setProduct] = useState("");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState(null);
  const [showTool, setShowTool] = useState(null);

  const logRef = useRef(null);
  const abortRef = useRef(null);

  const scrollLog = useCallback(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollLog();
  }, [logs, scrollLog]);

  // ─── Run the research agent ───────────────────────────────────────

  const runAgent = async () => {
    if (running || !product.trim()) return;

    setRunning(true);
    setLogs([]);
    setResults(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/ai/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: product.trim(), mode }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        setLogs([{
          tag: "err",
          cls: "tag-err",
          msg: `API error ${res.status}: ${errText}`,
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

            if (event.tag === "results" && event.data) {
              setResults(event.data);
            }

            setLogs(prev => [...prev, event]);
          } catch {
            /* skip malformed */
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        setLogs(prev => [...prev, {
          tag: "err",
          cls: "tag-err",
          msg: `Error: ${err.message}`,
          timestamp: new Date().toISOString(),
        }]);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const stopAgent = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const clearAll = () => {
    setLogs([]);
    setResults(null);
  };

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div style={styles.shell}>
      {/* ─── Top bar ───────────────────────────────────────────── */}
      <div style={styles.topbar}>
        <div style={{ ...styles.dot, background: "#E24B4A" }} />
        <div style={{ ...styles.dot, background: "#EF9F27" }} />
        <div style={{ ...styles.dot, background: "#639922" }} />
        <span style={styles.topbarTitle}>drop-predator / product-research v2.0</span>
        <div style={styles.status}>
          <div style={{
            ...styles.pulse,
            background: running ? "#EF9F27" : "#639922",
            animation: running ? "research-pulse 1s infinite" : "research-pulse 2s infinite",
          }} />
          <span>{running ? "running" : "idle"}</span>
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`@keyframes research-pulse { 0%, 100% { opacity:1; } 50% { opacity: 0.3; } }`}</style>
      <style>{`@keyframes research-fadein { from { opacity:0; transform: translateY(4px); } to { opacity:1; transform: translateY(0); } }`}</style>

      {/* ─── Body ──────────────────────────────────────────────── */}
      <div style={styles.body}>
        {/* ─── Sidebar ───────────────────────────────────────── */}
        <div style={styles.sidebar}>
          <div style={styles.sidebarLabel}>Workflows</div>
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              style={{
                ...styles.sidebarBtn,
                ...(mode === m.id ? styles.sidebarBtnActive : {}),
              }}
            >
              <span>{m.icon}</span> {m.label}
            </button>
          ))}

          <div style={{ ...styles.sidebarLabel, marginTop: 16 }}>Tools</div>
          {TOOLS.map(t => (
            <button
              key={t.id}
              onClick={() => setShowTool(showTool === t.id ? null : t.id)}
              style={{
                ...styles.sidebarBtn,
                ...(showTool === t.id ? styles.sidebarBtnActive : {}),
              }}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
          {showTool && (
            <div style={styles.toolInfo}>
              {TOOLS.find(t => t.id === showTool)?.desc}
            </div>
          )}
        </div>

        {/* ─── Main panel ────────────────────────────────────── */}
        <div style={styles.mainPanel}>
          {/* Input row */}
          <div style={styles.inputRow}>
            <input
              type="text"
              value={product}
              onChange={e => setProduct(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runAgent();
                }
              }}
              placeholder='product name or URL, e.g. Sony WH-1000XM5'
              style={styles.productInput}
              disabled={running}
            />
            {running ? (
              <button onClick={stopAgent} style={{ ...styles.runBtn, background: "#E24B4A" }}>
                ■ stop
              </button>
            ) : (
              <button onClick={runAgent} disabled={!product.trim()} style={styles.runBtn}>
                ▶ run agent
              </button>
            )}
          </div>

          {/* Log area */}
          <div ref={logRef} style={styles.logArea}>
            {logs.length === 0 ? (
              <div style={styles.emptyState}>
                <span style={styles.emptyIcon}>⌨</span>
                <span>Enter a product and run the agent.</span>
                <span style={{ fontSize: 11, marginTop: 4, color: "var(--p-color-text-secondary)" }}>
                  Logs will stream here in real time.
                </span>
              </div>
            ) : (
              <>
                {logs.filter(l => l.tag !== "results").map((log, i) => (
                  <LogLine key={i} log={log} />
                ))}
                {running && (
                  <div style={{ ...styles.logLine, opacity: 0.5 }}>
                    <span style={styles.logTs}>{formatTs()}</span>
                    <span style={{ ...styles.logTag, ...TAG_STYLES.sys }}>...</span>
                    <span style={{
                      display: "inline-block",
                      width: 6,
                      height: 12,
                      background: "var(--p-color-text)",
                      animation: "research-pulse 1s infinite",
                    }} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Results panel */}
          {results && (
            <div style={styles.resultsPanel}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={styles.resultsHeader}>Analysis output</div>
                <button
                  onClick={() => navigator.clipboard?.writeText(JSON.stringify(results, null, 2))}
                  style={styles.copyBtn}
                >
                  Copy JSON
                </button>
              </div>

              {/* Metrics */}
              <div style={styles.metricsRow}>
                <MetricCard label="Overall score" value={results.score} sub="out of 10" />
                <MetricCard label="Signals found" value={results.reviews} sub="across sources" />
                <MetricCard label="Positive" value={results.pos} sub="of all signals" color="#3B6D11" />
                <MetricCard label="Critical" value={results.neg} sub="of all signals" color="#A32D2D" />
              </div>

              {/* Sentiment bar */}
              <div style={styles.sentimentWrap}>
                <div style={styles.barLabelRow}>
                  <span>Sentiment distribution</span>
                  <span>{results.posN}% / {results.neuN}% / {results.negN}%</span>
                </div>
                <div style={styles.barTrack}>
                  <div style={{ height: "100%", background: "#639922", width: `${results.posN}%`, transition: "width 1s ease" }} />
                  <div style={{ height: "100%", background: "#888780", width: `${results.neuN}%`, transition: "width 1s ease" }} />
                  <div style={{ height: "100%", background: "#E24B4A", width: `${results.negN}%`, transition: "width 1s ease" }} />
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 10, color: "var(--p-color-text-secondary)" }}>
                  <span><span style={{ color: "#639922" }}>■</span> Positive</span>
                  <span><span style={{ color: "#888780" }}>■</span> Neutral</span>
                  <span><span style={{ color: "#E24B4A" }}>■</span> Negative</span>
                </div>
              </div>

              {/* Themes */}
              {results.themes?.length > 0 && (
                <div>
                  <div style={{ ...styles.barLabelRow, marginBottom: 6 }}>Top themes</div>
                  <div style={styles.themesList}>
                    {results.themes.map((t, i) => (
                      <span key={i} style={styles.themePill}>{t}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick action buttons */}
              <div style={styles.askRow}>
                {QUICK_PROMPTS.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setProduct(q.prompt);
                      // Could wire this to the orchestrator in future
                    }}
                    style={styles.quickBtn}
                  >
                    → {q.label} ↗
                  </button>
                ))}
              </div>

              {/* Top signals detail */}
              {results.topSignals?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ ...styles.barLabelRow, marginBottom: 6 }}>Top signals</div>
                  {results.topSignals.slice(0, 5).map((s, i) => (
                    <div key={i} style={styles.signalRow}>
                      <span style={styles.signalSource}>{s.source}</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.title}
                      </span>
                      <span style={{
                        fontWeight: 600,
                        color: s.sentiment >= 0 ? "#639922" : "#E24B4A",
                        flexShrink: 0,
                      }}>
                        {s.sentiment > 0 ? "+" : ""}{s.sentiment.toFixed(1)}
                      </span>
                      <span style={{
                        fontWeight: 700,
                        color: s.hypeScore >= 60 ? "#E24B4A" : s.hypeScore >= 30 ? "#EF9F27" : "#639922",
                        flexShrink: 0,
                        width: 30,
                        textAlign: "right",
                      }}>
                        {s.hypeScore}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Clear button */}
          {logs.length > 0 && !running && (
            <div style={{ padding: "8px 18px", borderTop: "1px solid var(--p-color-border-subdued)" }}>
              <button onClick={clearAll} style={styles.copyBtn}>
                Clear logs
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function LogLine({ log }) {
  const tagStyle = TAG_STYLES[log.tag] || TAG_STYLES.sys;

  return (
    <div style={styles.logLine}>
      <span style={styles.logTs}>{formatTs(log.timestamp)}</span>
      <span style={{ ...styles.logTag, ...tagStyle }}>{log.tag}</span>
      <span style={styles.logMsg}>{log.msg}</span>
    </div>
  );
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={styles.metricCard}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={{ ...styles.metricValue, ...(color ? { color } : {}) }}>{value}</div>
      <div style={styles.metricSub}>{sub}</div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTs(ts) {
  try {
    const d = ts ? new Date(ts) : new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(n => String(n).padStart(2, "0")).join(":");
  } catch {
    return "";
  }
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  shell: {
    background: "var(--p-color-bg-surface)",
    border: "1px solid var(--p-color-border)",
    borderRadius: 12,
    overflow: "hidden",
    fontFamily: "'Courier New', monospace",
    minHeight: 560,
    display: "flex",
    flexDirection: "column",
  },
  topbar: {
    background: "var(--p-color-bg-surface-secondary)",
    borderBottom: "1px solid var(--p-color-border-subdued)",
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },
  topbarTitle: {
    fontSize: 12,
    color: "var(--p-color-text-secondary)",
    marginLeft: 4,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  status: {
    marginLeft: "auto",
    fontSize: 11,
    color: "var(--p-color-text-secondary)",
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  pulse: {
    width: 7,
    height: 7,
    borderRadius: "50%",
  },
  body: {
    display: "flex",
    flex: 1,
    minHeight: 0,
  },
  sidebar: {
    width: 200,
    flexShrink: 0,
    borderRight: "1px solid var(--p-color-border-subdued)",
    padding: "16px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  sidebarLabel: {
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--p-color-text-secondary)",
    marginBottom: 8,
    marginTop: 8,
  },
  sidebarBtn: {
    background: "none",
    border: "none",
    padding: "7px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontFamily: "'Courier New', monospace",
    color: "var(--p-color-text-secondary)",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    transition: "background 0.15s",
    width: "100%",
  },
  sidebarBtnActive: {
    background: "var(--p-color-bg-surface-secondary)",
    color: "var(--p-color-text)",
    border: "1px solid var(--p-color-border)",
  },
  toolInfo: {
    fontSize: 10,
    color: "var(--p-color-text-secondary)",
    padding: "6px 10px",
    lineHeight: 1.5,
    borderRadius: 6,
    background: "var(--p-color-bg-surface-secondary)",
    marginTop: 4,
  },
  mainPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  inputRow: {
    padding: "14px 18px",
    borderBottom: "1px solid var(--p-color-border-subdued)",
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  productInput: {
    flex: 1,
    fontFamily: "'Courier New', monospace",
    fontSize: 13,
    padding: "8px 12px",
    border: "1px solid var(--p-color-border)",
    borderRadius: 6,
    background: "var(--p-color-bg-surface-secondary)",
    color: "var(--p-color-text)",
    outline: "none",
    boxSizing: "border-box",
  },
  runBtn: {
    padding: "8px 18px",
    fontSize: 12,
    fontFamily: "'Courier New', monospace",
    background: "var(--p-color-text)",
    color: "var(--p-color-bg-surface)",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
    opacity: 1,
    transition: "opacity 0.15s",
  },
  logArea: {
    flex: 1,
    padding: "16px 18px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    fontSize: 12,
    minHeight: 200,
    maxHeight: 340,
  },
  logLine: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    lineHeight: 1.6,
    animation: "research-fadein 0.2s ease",
  },
  logTs: {
    color: "var(--p-color-text-secondary)",
    flexShrink: 0,
    fontSize: 11,
    fontFamily: "monospace",
    minWidth: 52,
  },
  logTag: {
    flexShrink: 0,
    borderRadius: 3,
    padding: "0 5px",
    fontSize: 10,
    letterSpacing: "0.05em",
    fontWeight: 500,
    alignSelf: "center",
    textTransform: "uppercase",
  },
  logMsg: {
    color: "var(--p-color-text)",
    flex: 1,
  },
  emptyState: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--p-color-text-secondary)",
    fontSize: 12,
    letterSpacing: "0.04em",
    flexDirection: "column",
    gap: 6,
    padding: 24,
    textAlign: "center",
  },
  emptyIcon: {
    fontSize: 32,
    color: "var(--p-color-border)",
    marginBottom: 4,
  },
  resultsPanel: {
    borderTop: "1px solid var(--p-color-border-subdued)",
    padding: "14px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    background: "var(--p-color-bg-surface-secondary)",
    maxHeight: 380,
    overflowY: "auto",
  },
  resultsHeader: {
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--p-color-text-secondary)",
    borderBottom: "1px solid var(--p-color-border-subdued)",
    paddingBottom: 8,
  },
  metricsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 10,
  },
  metricCard: {
    background: "var(--p-color-bg-surface)",
    border: "1px solid var(--p-color-border-subdued)",
    borderRadius: 6,
    padding: "10px 12px",
  },
  metricLabel: {
    fontSize: 10,
    color: "var(--p-color-text-secondary)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 500,
    color: "var(--p-color-text)",
  },
  metricSub: {
    fontSize: 11,
    color: "var(--p-color-text-secondary)",
    marginTop: 2,
  },
  sentimentWrap: {
    background: "var(--p-color-bg-surface)",
    border: "1px solid var(--p-color-border-subdued)",
    borderRadius: 6,
    padding: "10px 12px",
  },
  barLabelRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    color: "var(--p-color-text-secondary)",
    marginBottom: 6,
  },
  barTrack: {
    height: 6,
    background: "var(--p-color-bg-fill-secondary)",
    borderRadius: 3,
    overflow: "hidden",
    display: "flex",
    marginBottom: 6,
  },
  themesList: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  themePill: {
    fontSize: 11,
    padding: "3px 10px",
    borderRadius: 20,
    background: "var(--p-color-bg-surface)",
    border: "1px solid var(--p-color-border)",
    color: "var(--p-color-text-secondary)",
  },
  askRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    paddingTop: 10,
  },
  quickBtn: {
    fontSize: 11,
    fontFamily: "'Courier New', monospace",
    padding: "5px 12px",
    background: "none",
    border: "1px solid var(--p-color-border)",
    borderRadius: 6,
    color: "var(--p-color-text-secondary)",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  copyBtn: {
    fontSize: 10,
    padding: "3px 8px",
    borderRadius: 4,
    border: "1px solid var(--p-color-border)",
    background: "var(--p-color-bg-surface)",
    color: "var(--p-color-text-secondary)",
    cursor: "pointer",
    fontFamily: "'Courier New', monospace",
  },
  signalRow: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    padding: "4px 0",
    fontSize: 11,
    borderBottom: "1px solid var(--p-color-border-subdued)",
  },
  signalSource: {
    fontSize: 9,
    fontWeight: 600,
    textTransform: "uppercase",
    color: "var(--p-color-text-secondary)",
    width: 50,
    flexShrink: 0,
  },
};
