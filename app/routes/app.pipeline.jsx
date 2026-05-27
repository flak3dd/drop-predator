/**
 * app/routes/app.pipeline.jsx
 * ---------------------------------------------------------
 * PROFIT PIPELINE — unified end-to-end profit maximization dashboard.
 *
 * Chains: Market Intelligence → Product Sourcing → Profit Validation →
 * AI Listings + Dynamic Pricing → Shopify Import → Image Sourcing → Revenue Report
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const headers = (headersArgs) => boundary.headers(headersArgs);
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return {};
};

// ─── Constants ──────────────────────────────────────────────────────────────

const NICHES = [
  { id: "gym",     label: "Gym & Fitness",    icon: "💪", keywords: "resistance bands, yoga mats, dumbbells" },
  { id: "tech",    label: "Tech & Gadgets",   icon: "📱", keywords: "phone accessories, smart home, USB-C" },
  { id: "beauty",  label: "Beauty & Skincare", icon: "💄", keywords: "serums, LED masks, jade rollers" },
  { id: "home",    label: "Home & Kitchen",   icon: "🏠", keywords: "organizers, cookware, smart lighting" },
  { id: "outdoor", label: "Outdoor & Camping", icon: "⛺", keywords: "hammocks, solar chargers, survival gear" },
  { id: "pets",    label: "Pet Products",     icon: "🐕", keywords: "interactive toys, grooming, GPS trackers" },
];

const PHASES = [
  { id: 1, label: "Discover",  icon: "🔍", desc: "Market intelligence scan" },
  { id: 2, label: "Source",    icon: "📦", desc: "Multi-pathway product sourcing" },
  { id: 3, label: "Validate",  icon: "✅", desc: "Profit potential filtering" },
  { id: 4, label: "Optimize",  icon: "⚡", desc: "AI listings + dynamic pricing" },
  { id: 5, label: "Launch",    icon: "🚀", desc: "Import to Shopify" },
  { id: 6, label: "Enhance",   icon: "🖼️", desc: "Image sourcing" },
  { id: 7, label: "Report",    icon: "📊", desc: "Revenue projections" },
];

const TAG_STYLES = {
  "tag-sys":   { bg: "#D3D1C7", color: "#2C2C2A" },
  "tag-tool":  { bg: "#B5D4F4", color: "#042C53" },
  "tag-agent": { bg: "#9FE1CB", color: "#04342C" },
  "tag-warn":  { bg: "#FAC775", color: "#412402" },
  "tag-err":   { bg: "#F7C1C1", color: "#501313" },
};

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PipelinePage() {
  const shopify = useAppBridge();
  const showToast = (msg) => { try { shopify?.toast?.show(msg); } catch { /* dev */ } };

  const [niche, setNiche] = useState("gym");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [currentPhase, setCurrentPhase] = useState(0);
  const [results, setResults] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  // Config
  const [scoreThreshold, setScoreThreshold] = useState(55);
  const [marginFloor, setMarginFloor] = useState(30);
  const [autoImport, setAutoImport] = useState(true);
  const [autoMedia, setAutoMedia] = useState(true);
  const [maxProducts, setMaxProducts] = useState(15);
  const [showConfig, setShowConfig] = useState(false);

  const logRef = useRef(null);
  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  const scrollLog = useCallback(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, []);

  useEffect(() => { scrollLog(); }, [logs, scrollLog]);

  // Timer
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

  // ─── Run pipeline ─────────────────────────────────────────────────

  const runPipeline = async () => {
    if (running) return;
    setRunning(true);
    setLogs([]);
    setResults(null);
    setCurrentPhase(0);
    setElapsed(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          config: {
            scoreThreshold,
            marginFloor,
            autoImport,
            autoMedia,
            maxProducts,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        setLogs([{ tag: "err", cls: "tag-err", msg: `API error: ${errText}`, timestamp: new Date().toISOString() }]);
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

            if (event.tag === "phase" && event.data?.phase) {
              setCurrentPhase(event.data.phase);
            }
            if (event.tag === "results" && event.data) {
              setResults(event.data);
            }

            setLogs(prev => [...prev, event]);
          } catch { /* skip malformed */ }
        }
      }

      showToast("Pipeline complete");
    } catch (err) {
      if (err.name !== "AbortError") {
        setLogs(prev => [...prev, { tag: "err", cls: "tag-err", msg: `Error: ${err.message}`, timestamp: new Date().toISOString() }]);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const stopPipeline = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const formatElapsed = (s) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  const formatMoney = (n) => `$${(n || 0).toLocaleString()}`;

  const stats = results?.stats || {};
  const products = results?.products || [];
  const actions = results?.actions || [];

  return (
    <s-page title="Profit Pipeline" subtitle="Automated end-to-end profit maximization">
      <div slot="primaryAction">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {running && (
            <span style={{ fontSize: 11, color: "var(--p-color-text-caution)", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#FF9800", animation: "pp-pulse 1.5s infinite" }} />
              {formatElapsed(elapsed)}
            </span>
          )}
          {running ? (
            <s-button variant="destructive" onClick={stopPipeline}>Stop Pipeline</s-button>
          ) : (
            <s-button variant="primary" onClick={runPipeline}>
              Launch Profit Pipeline
            </s-button>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes pp-fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Phase Progress Bar */}
      <s-card>
        <s-box padding="400">
          <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
            {PHASES.map(phase => {
              const isActive = currentPhase === phase.id;
              const isDone = currentPhase > phase.id;
              return (
                <div key={phase.id} style={{
                  flex: 1,
                  padding: "8px 4px",
                  textAlign: "center",
                  borderRadius: 6,
                  background: isDone ? "rgba(0,200,83,0.1)" : isActive ? "rgba(41,121,255,0.1)" : "var(--p-color-bg-surface-secondary)",
                  border: isActive ? "1px solid #2979FF" : isDone ? "1px solid #00C853" : "1px solid transparent",
                  transition: "all 0.3s ease",
                }}>
                  <div style={{ fontSize: 16 }}>{isDone ? "✓" : phase.icon}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: isDone ? "#00C853" : isActive ? "#2979FF" : "var(--p-color-text-secondary)", marginTop: 2 }}>
                    {phase.label}
                  </div>
                </div>
              );
            })}
          </div>
          {currentPhase > 0 && (
            <div style={{ height: 3, borderRadius: 2, background: "var(--p-color-bg-fill-secondary)", overflow: "hidden" }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg, #00C853, #2979FF)", width: `${(currentPhase / 7) * 100}%`, transition: "width 0.5s ease", borderRadius: 2 }} />
            </div>
          )}
        </s-box>
      </s-card>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, marginTop: 16 }}>
        {/* ─── Left Panel: Config ──────────────────────────────── */}
        <div>
          {/* Niche Selector */}
          <s-card>
            <s-box padding="400">
              <s-text variant="headingSm">Target Niche</s-text>
              <div style={{ marginTop: 10 }}>
                {NICHES.map(n => (
                  <button
                    key={n.id}
                    onClick={() => setNiche(n.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                      width: "100%", borderRadius: 8, cursor: "pointer", marginBottom: 4,
                      border: niche === n.id ? "1px solid var(--p-color-border-emphasis)" : "1px solid var(--p-color-border)",
                      background: niche === n.id ? "var(--p-color-bg-surface-secondary)" : "transparent",
                      textAlign: "left", fontSize: 12, fontFamily: "inherit",
                      color: "var(--p-color-text)", transition: "all 0.15s ease",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{n.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{n.label}</div>
                      <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)", marginTop: 1 }}>{n.keywords}</div>
                    </div>
                  </button>
                ))}
              </div>
            </s-box>
          </s-card>

          {/* Config */}
          <s-card>
            <s-box padding="400">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <s-text variant="headingSm">Pipeline Config</s-text>
                <button onClick={() => setShowConfig(!showConfig)} style={{
                  fontSize: 10, padding: "2px 8px", borderRadius: 4,
                  border: "1px solid var(--p-color-border)", background: "transparent",
                  color: "var(--p-color-text-secondary)", cursor: "pointer",
                }}>
                  {showConfig ? "Hide" : "Show"}
                </button>
              </div>

              {showConfig && (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                  <ConfigSlider label="Min Score" value={scoreThreshold} min={30} max={90} step={5} onChange={setScoreThreshold} />
                  <ConfigSlider label="Min Margin" value={marginFloor} min={15} max={60} step={5} suffix="%" onChange={setMarginFloor} />
                  <ConfigSlider label="Max Products" value={maxProducts} min={5} max={30} step={5} onChange={setMaxProducts} />

                  <div style={{ display: "flex", gap: 8 }}>
                    <ToggleChip label="Auto-Import" active={autoImport} onClick={() => setAutoImport(!autoImport)} />
                    <ToggleChip label="Auto-Media" active={autoMedia} onClick={() => setAutoMedia(!autoMedia)} />
                  </div>
                </div>
              )}
            </s-box>
          </s-card>

          {/* Results Summary (when done) */}
          {results && (
            <s-card>
              <s-box padding="400">
                <s-text variant="headingSm">Profit Summary</s-text>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <SummaryRow label="Monthly Revenue" value={formatMoney(stats.projectedMonthlyRevenue)} color="#2979FF" />
                  <SummaryRow label="Monthly Profit" value={formatMoney(stats.projectedMonthlyProfit)} color="#00C853" />
                  <SummaryRow label="Avg Margin" value={`${stats.avgMargin}%`} color={stats.avgMargin >= 40 ? "#00C853" : "#FFB300"} />
                  <SummaryRow label="Products Live" value={`${stats.productsImported}/${stats.productsFiltered}`} />
                  <SummaryRow label="Signals Found" value={stats.signalsFound} />
                  <SummaryRow label="Images" value={stats.imagesAttached} />
                  <SummaryRow label="AI Spend" value={`$${(stats.aiSpendEstimate || 0).toFixed(3)}`} />
                </div>
              </s-box>
            </s-card>
          )}
        </div>

        {/* ─── Right Panel: Stream + Results ───────────────────── */}
        <div>
          {/* Event Stream */}
          <s-card>
            <s-box padding="400">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <s-text variant="headingSm">Pipeline Stream</s-text>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {logs.length > 0 && (
                    <span style={{ fontSize: 10, color: "var(--p-color-text-secondary)" }}>{logs.length} events</span>
                  )}
                  {logs.length > 0 && !running && (
                    <button onClick={() => { setLogs([]); setResults(null); setCurrentPhase(0); }} style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--p-color-border)",
                      background: "transparent", color: "var(--p-color-text-secondary)", cursor: "pointer",
                    }}>
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div ref={logRef} style={{
                maxHeight: 500, overflowY: "auto", fontFamily: "'Courier New', monospace",
                fontSize: 11, lineHeight: 1.7, padding: "8px 0",
                borderRadius: 8, background: "var(--p-color-bg-surface-secondary)",
                border: "1px solid var(--p-color-border-subdued)",
              }}>
                {logs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--p-color-text-secondary)" }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>🚀</div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}>Ready to maximize profit</div>
                    <div style={{ fontSize: 11, marginTop: 6, maxWidth: 400, margin: "6px auto 0", lineHeight: 1.6 }}>
                      Select a niche, configure thresholds, and launch the pipeline.
                      The system will scan markets, source products, optimize pricing, generate listings,
                      import to Shopify, and project revenue — all automatically.
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: "0 12px" }}>
                    {logs.filter(l => l.tag !== "results").map((log, i) => (
                      <LogLine key={i} log={log} />
                    ))}
                    {running && (
                      <div style={{ display: "flex", gap: 10, alignItems: "center", opacity: 0.5, padding: "2px 0" }}>
                        <span style={{ color: "var(--p-color-text-secondary)", fontSize: 10, minWidth: 52 }}>{formatTs()}</span>
                        <span style={{ display: "inline-block", width: 6, height: 12, background: "var(--p-color-text)", animation: "pp-pulse 1s infinite" }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </s-box>
          </s-card>

          {/* Best Product Highlight */}
          {results?.stats?.bestProduct && (
            <s-card>
              <s-box padding="400">
                <s-text variant="headingSm">Top Profit Driver</s-text>
                <div style={{
                  marginTop: 10, padding: "16px", borderRadius: 10,
                  background: "linear-gradient(135deg, rgba(0,200,83,0.05), rgba(41,121,255,0.05))",
                  border: "1px solid rgba(0,200,83,0.2)",
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{stats.bestProduct.name}</div>
                  <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                    <MetricChip label="Profit/mo" value={formatMoney(stats.bestProduct.monthlyProfit)} color="#00C853" />
                    <MetricChip label="Revenue/mo" value={formatMoney(stats.bestProduct.monthlyRevenue)} color="#2979FF" />
                    <MetricChip label="Margin" value={`${stats.bestProduct.margin}%`} color={stats.bestProduct.margin >= 40 ? "#00C853" : "#FFB300"} />
                    <MetricChip label="Price" value={`$${stats.bestProduct.sellPrice.toFixed(2)}`} />
                    <MetricChip label="Units/mo" value={stats.bestProduct.monthlyUnits} />
                    <MetricChip label="Score" value={stats.bestProduct.score} />
                    <MetricChip label="Lifecycle" value={stats.bestProduct.lifecycle} color={stats.bestProduct.lifecycle === "viral" ? "#FF1744" : stats.bestProduct.lifecycle === "growing" ? "#00C853" : undefined} />
                  </div>
                </div>
              </s-box>
            </s-card>
          )}

          {/* Product Results Table */}
          {products.length > 0 && (
            <s-card>
              <s-box padding="400">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <s-text variant="headingSm">Products ({products.length})</s-text>
                  <button
                    onClick={() => navigator.clipboard?.writeText(JSON.stringify(results, null, 2))}
                    style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--p-color-border)", background: "transparent", color: "var(--p-color-text-secondary)", cursor: "pointer" }}
                  >
                    Copy JSON
                  </button>
                </div>
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid var(--p-color-border)", textAlign: "left" }}>
                        <th style={{ padding: "6px 8px", fontWeight: 600 }}>Product</th>
                        <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Score</th>
                        <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Margin</th>
                        <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Price</th>
                        <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Pricing</th>
                        <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "right" }}>Velocity</th>
                        <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Lifecycle</th>
                        <th style={{ padding: "6px 8px", fontWeight: 600, textAlign: "center" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--p-color-border-subdued)" }}>
                          <td style={{ padding: "8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <div style={{ fontWeight: 600 }}>{p.listingTitle}</div>
                            <div style={{ fontSize: 9, color: "var(--p-color-text-secondary)" }}>
                              {(p.sources || []).slice(0, 3).join(" · ")}
                            </div>
                          </td>
                          <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: p.score >= 70 ? "#00C853" : p.score >= 55 ? "#FFB300" : "#FF5252" }}>
                            {p.score}
                          </td>
                          <td style={{ padding: "8px", textAlign: "right", fontWeight: 600, color: p.margin >= 40 ? "#00C853" : p.margin >= 30 ? "#FFB300" : "#FF5252" }}>
                            {p.margin}%
                          </td>
                          <td style={{ padding: "8px", textAlign: "right", fontWeight: 600 }}>
                            ${p.price?.toFixed(2)}
                          </td>
                          <td style={{ padding: "8px", textAlign: "center" }}>
                            <span style={{
                              fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                              background: p.pricingMode === "surge" ? "rgba(255,23,68,0.1)" : p.pricingMode === "dynamic" ? "rgba(41,121,255,0.1)" : "rgba(0,0,0,0.05)",
                              color: p.pricingMode === "surge" ? "#FF1744" : p.pricingMode === "dynamic" ? "#2979FF" : "var(--p-color-text-secondary)",
                            }}>
                              {p.pricingMode}
                            </span>
                          </td>
                          <td style={{ padding: "8px", textAlign: "right" }}>{p.velocity}/mo</td>
                          <td style={{ padding: "8px", textAlign: "center" }}>
                            <span style={{
                              fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                              background: p.lifecycle === "viral" ? "rgba(255,23,68,0.1)" : p.lifecycle === "growing" ? "rgba(0,200,83,0.1)" : "rgba(0,0,0,0.05)",
                              color: p.lifecycle === "viral" ? "#FF1744" : p.lifecycle === "growing" ? "#00C853" : "var(--p-color-text-secondary)",
                            }}>
                              {p.lifecycle}
                            </span>
                          </td>
                          <td style={{ padding: "8px", textAlign: "center" }}>
                            {p.imported ? (
                              <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(0,200,83,0.1)", color: "#00C853" }}>LIVE</span>
                            ) : (
                              <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: "rgba(0,0,0,0.05)", color: "var(--p-color-text-secondary)" }}>READY</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </s-box>
            </s-card>
          )}

          {/* Action Items */}
          {actions.length > 0 && (
            <s-card>
              <s-box padding="400">
                <s-text variant="headingSm">Action Items ({actions.length})</s-text>
                <div style={{ marginTop: 10 }}>
                  {actions.map((a, i) => (
                    <div key={i} style={{
                      padding: "8px 12px", borderRadius: 6, marginBottom: 4,
                      background: "rgba(255,179,0,0.06)",
                      borderLeft: "3px solid #FFB300",
                      fontSize: 12, color: "var(--p-color-text)",
                    }}>
                      → {a}
                    </div>
                  ))}
                </div>
              </s-box>
            </s-card>
          )}
        </div>
      </div>
    </s-page>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function LogLine({ log }) {
  const tagStyle = TAG_STYLES[log.cls] || TAG_STYLES["tag-sys"];
  const isPhase = log.tag === "phase";

  return (
    <div style={{
      display: "flex", gap: 10, alignItems: "flex-start", lineHeight: 1.6,
      animation: "pp-fadein 0.2s ease", padding: "2px 0",
      ...(isPhase ? { marginTop: 8, marginBottom: 4, fontWeight: 600 } : {}),
    }}>
      <span style={{ color: "var(--p-color-text-secondary)", flexShrink: 0, fontSize: 10, minWidth: 52 }}>
        {formatTs(log.timestamp)}
      </span>
      <span style={{
        flexShrink: 0, borderRadius: 3, padding: "0 5px", fontSize: 9,
        letterSpacing: "0.05em", fontWeight: 600, alignSelf: "center",
        textTransform: "uppercase", ...tagStyle,
      }}>
        {log.tag}
      </span>
      <span style={{ color: "var(--p-color-text)", flex: 1 }}>{log.msg}</span>
    </div>
  );
}

function ConfigSlider({ label, value, min, max, step, suffix = "", onChange }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: "var(--p-color-text-secondary)" }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{value}{suffix}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "#2979FF" }}
      />
    </div>
  );
}

function ToggleChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 11, fontFamily: "inherit",
      border: active ? "1px solid #00C853" : "1px solid var(--p-color-border)",
      background: active ? "rgba(0,200,83,0.08)" : "transparent",
      color: active ? "#00C853" : "var(--p-color-text-secondary)",
      cursor: "pointer", fontWeight: 600, transition: "all 0.15s",
    }}>
      {active ? "✓" : "○"} {label}
    </button>
  );
}

function SummaryRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: "var(--p-color-text-secondary)" }}>{label}</span>
      <span style={{ fontWeight: 700, color: color || "var(--p-color-text)" }}>{value}</span>
    </div>
  );
}

function MetricChip({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "var(--p-color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: color || "var(--p-color-text)", marginTop: 2 }}>{value}</div>
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
