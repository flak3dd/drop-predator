import { useEffect, useState, useCallback } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getMonitor } from "../services/intelligence/index.js";

// ─── Server exports ───────────────────────────────────────────────────────────

export const headers = (headersArgs) => boundary.headers(headersArgs);

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const monitor = getMonitor();
  const data = await monitor.getLatest(session.shop);
  return { data };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_ICONS = {
  reddit: "🔴", hackernews: "🟠", "google-trends": "📈",
  tiktok: "🎵", ai: "🧠", producthunt: "🚀",
};

const SEVERITY_COLORS = {
  critical: { bg: "rgba(255,23,68,0.08)", border: "#FF1744", text: "#FF1744" },
  high: { bg: "rgba(255,82,82,0.08)", border: "#FF5252", text: "#FF5252" },
  medium: { bg: "rgba(255,179,0,0.08)", border: "#FFB300", text: "#7a4900" },
  low: { bg: "rgba(0,200,83,0.06)", border: "#00C853", text: "#00C853" },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SignalCard({ signal }) {
  const icon = SOURCE_ICONS[signal.source] || "📡";
  const hypeColor = signal.hypeScore >= 70 ? "#FF1744" : signal.hypeScore >= 40 ? "#FFB300" : "#00C853";

  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8, marginBottom: 6,
      border: "1px solid var(--p-color-border-subdued)",
      background: signal.hypeScore >= 70 ? "rgba(255,23,68,0.03)" : "var(--p-color-bg-surface)",
      transition: "border-color 150ms ease",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, lineHeight: 1.3,
            overflow: "hidden", textOverflow: "ellipsis",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>
            {signal.title}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 10, color: "var(--p-color-text-secondary)" }}>
            <span style={{ fontWeight: 600, textTransform: "uppercase" }}>{signal.source}</span>
            <span>kw: {signal.keyword}</span>
            {signal.ts && <span>{new Date(signal.ts).toLocaleDateString()}</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: hypeColor }}>{signal.hypeScore}</div>
          <div style={{ fontSize: 9, color: "var(--p-color-text-secondary)", textTransform: "uppercase" }}>hype</div>
        </div>
      </div>
      {/* Sentiment bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: 9, color: "var(--p-color-text-secondary)", width: 55 }}>Sentiment</span>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--p-color-bg-fill-secondary)", position: "relative" }}>
          <div style={{
            position: "absolute", top: 0, left: "50%", height: 4, borderRadius: 2,
            width: `${Math.abs(signal.sentiment) * 50}%`,
            marginLeft: signal.sentiment >= 0 ? 0 : `-${Math.abs(signal.sentiment) * 50}%`,
            background: signal.sentiment >= 0 ? "#00C853" : "#FF5252",
          }} />
        </div>
        <span style={{ fontSize: 9, fontWeight: 600, width: 30, textAlign: "right",
          color: signal.sentiment >= 0 ? "#00C853" : "#FF5252" }}>
          {signal.sentiment > 0 ? "+" : ""}{signal.sentiment.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function AlertCard({ alert }) {
  const colors = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.medium;
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8, marginBottom: 6,
      background: colors.bg, borderLeft: `3px solid ${colors.border}`,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>{alert.title}</div>
      <div style={{ fontSize: 11, color: "var(--p-color-text-secondary)", marginTop: 2 }}>{alert.detail}</div>
      <div style={{ fontSize: 9, color: "var(--p-color-text-secondary)", marginTop: 4 }}>
        {alert.type.replace(/_/g, " ")} · {new Date(alert.ts).toLocaleTimeString()}
      </div>
    </div>
  );
}

function OpportunityCard({ opp }) {
  const demandColor = { viral: "#FF1744", high: "#FFB300", medium: "#00C853", low: "var(--p-color-text-secondary)" };
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 8, marginBottom: 6,
      border: "1px solid var(--p-color-border-subdued)",
      background: opp.demand === "viral" ? "rgba(255,23,68,0.03)" : "var(--p-color-bg-surface)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{opp.name}</div>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
          background: demandColor[opp.demand] || "#ccc", color: "#fff",
        }}>
          {opp.demand}
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "var(--p-color-text-secondary)" }}>
        <span>Margin: <strong>{opp.margin}%</strong></span>
        <span>Signal: <strong>{opp.signalStrength}</strong></span>
        <span>Risk: <strong>{opp.risk}</strong></span>
        {opp.aiGenerated && <span style={{ color: "#E040FB" }}>AI discovered</span>}
      </div>
    </div>
  );
}

function CrossPlatformCard({ item }) {
  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8, marginBottom: 6,
      border: "1px solid var(--p-color-border-subdued)",
      borderLeft: `3px solid ${item.sourceCount >= 3 ? "#FF1744" : "#FFB300"}`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>"{item.keyword}"</div>
      <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 11, color: "var(--p-color-text-secondary)" }}>
        <span>{item.sources.map(s => SOURCE_ICONS[s] || "📡").join(" ")} {item.sourceCount} platforms</span>
        <span>{item.signalCount} signals</span>
        <span>Hype: {item.avgHype}</span>
        <span style={{ color: item.avgSentiment >= 0 ? "#00C853" : "#FF5252" }}>
          Sent: {item.avgSentiment > 0 ? "+" : ""}{item.avgSentiment}
        </span>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 100, padding: "14px 16px", borderRadius: 10,
      background: "var(--p-color-bg-surface)", border: "1px solid var(--p-color-border-subdued)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 600,
          letterSpacing: "0.5px", color: "var(--p-color-text-secondary)" }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || "var(--p-color-text)" }}>{value}</div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function IntelligencePage() {
  const { data: initialData } = useLoaderData();
  const shopify = useAppBridge();
  const showToast = (msg) => { try { shopify?.toast?.show(msg); } catch { /* dev mode */ } };

  const [data, setData] = useState(initialData);
  const [scanning, setScanning] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const latest = data?.latest || {};
  const history = data?.history || [];

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/intelligence");
      const fresh = await res.json();
      setData(fresh);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [poll]);

  const triggerScan = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "scan" }),
      });
      const result = await res.json();
      if (result.ok) {
        showToast(`Scan complete: ${result.stats.signalCount} signals, ${result.alertCount} alerts`);
        await poll();
      }
    } catch (err) {
      showToast("Scan failed: " + err.message);
    } finally {
      setScanning(false);
    }
  };

  const signals = latest.topSignals || [];
  const alerts = latest.alerts || [];
  const opportunities = latest.opportunities || [];
  const crossPlatform = latest.crossPlatform || [];
  const gaps = latest.gaps || [];

  return (
    <s-page title="Market Intelligence" subtitle="AI-powered continuous market monitoring">
      <div slot="primaryAction">
        <s-button
          variant="primary"
          onClick={triggerScan}
          disabled={scanning}
        >
          {scanning ? "Scanning..." : "Run Scan Now"}
        </s-button>
      </div>

      {/* Tab Navigation */}
      <s-box padding="400" background="bg-surface-secondary" borderRadius="300" style={{ marginBottom: "16px" }}>
        <s-inline gap="200">
          {["overview", "signals", "opportunities", "trends"].map(tab => (
            <s-button
              key={tab}
              variant={activeTab === tab ? "primary" : "tertiary"}
              size="slim"
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </s-button>
          ))}
        </s-inline>
      </s-box>

      {activeTab === "overview" && (
        <>
          {/* Stats Row */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <StatBox label="Signals" value={latest.signalCount || 0} icon="📡" color="#2979FF" />
            <StatBox label="Alerts" value={latest.alertCount || 0} icon="🚨" color={latest.alertCount > 0 ? "#FF5252" : "#00C853"} />
            <StatBox label="Opportunities" value={latest.opportunityCount || 0} icon="💎" color="#E040FB" />
            <StatBox label="Last Scan" value={latest.ts ? new Date(latest.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Never"} icon="🕐" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Alerts */}
            <s-card>
              <s-box padding="400">
                <s-text variant="headingSm">Active Alerts ({alerts.length})</s-text>
                <div style={{ maxHeight: 300, overflowY: "auto", marginTop: 10 }}>
                  {alerts.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "var(--p-color-text-secondary)", fontSize: 12 }}>
                      No alerts. Market is stable.
                    </div>
                  ) : alerts.map((a, i) => <AlertCard key={i} alert={a} />)}
                </div>
              </s-box>
            </s-card>

            {/* Top Opportunities */}
            <s-card>
              <s-box padding="400">
                <s-text variant="headingSm">Top Opportunities ({opportunities.length})</s-text>
                <div style={{ maxHeight: 300, overflowY: "auto", marginTop: 10 }}>
                  {opportunities.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "var(--p-color-text-secondary)", fontSize: 12 }}>
                      Run a scan to discover opportunities.
                    </div>
                  ) : opportunities.map((o, i) => <OpportunityCard key={i} opp={o} />)}
                </div>
              </s-box>
            </s-card>
          </div>

          {/* Cross-platform trends */}
          {crossPlatform.length > 0 && (
            <s-card style={{ marginTop: 16 }}>
              <s-box padding="400">
                <s-text variant="headingSm">Cross-Platform Trends</s-text>
                <div style={{ marginTop: 10 }}>
                  {crossPlatform.slice(0, 5).map((c, i) => <CrossPlatformCard key={i} item={c} />)}
                </div>
              </s-box>
            </s-card>
          )}

          {/* Scan History */}
          {history.length > 0 && (
            <s-card style={{ marginTop: 16 }}>
              <s-box padding="400">
                <s-text variant="headingSm">Scan History</s-text>
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", gap: 4, fontSize: 10, fontWeight: 600, color: "var(--p-color-text-secondary)", padding: "4px 8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    <span style={{ flex: 1 }}>Time</span>
                    <span style={{ width: 60, textAlign: "right" }}>Signals</span>
                    <span style={{ width: 60, textAlign: "right" }}>Alerts</span>
                    <span style={{ width: 60, textAlign: "right" }}>Opps</span>
                    <span style={{ width: 60, textAlign: "right" }}>Duration</span>
                  </div>
                  {history.slice(0, 12).map((h, i) => (
                    <div key={i} style={{ display: "flex", gap: 4, fontSize: 11, padding: "5px 8px", borderTop: "1px solid var(--p-color-border-subdued)" }}>
                      <span style={{ flex: 1, color: "var(--p-color-text-secondary)" }}>{new Date(h.ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                      <span style={{ width: 60, textAlign: "right", fontWeight: 600 }}>{h.signals}</span>
                      <span style={{ width: 60, textAlign: "right", fontWeight: 600, color: h.alerts > 0 ? "#FF5252" : "inherit" }}>{h.alerts}</span>
                      <span style={{ width: 60, textAlign: "right", fontWeight: 600, color: h.opportunities > 0 ? "#E040FB" : "inherit" }}>{h.opportunities}</span>
                      <span style={{ width: 60, textAlign: "right", color: "var(--p-color-text-secondary)" }}>{(h.duration / 1000).toFixed(1)}s</span>
                    </div>
                  ))}
                </div>
              </s-box>
            </s-card>
          )}
        </>
      )}

      {activeTab === "signals" && (
        <s-card>
          <s-box padding="400">
            <s-text variant="headingSm">All Signals ({signals.length})</s-text>
            <div style={{ marginTop: 10 }}>
              {signals.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--p-color-text-secondary)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
                  <div style={{ fontSize: 13 }}>No signals yet. Run a scan to start monitoring the market.</div>
                </div>
              ) : signals.map((s, i) => <SignalCard key={i} signal={s} />)}
            </div>
          </s-box>
        </s-card>
      )}

      {activeTab === "opportunities" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <s-card>
            <s-box padding="400">
              <s-text variant="headingSm">Product Opportunities ({opportunities.length})</s-text>
              <div style={{ marginTop: 10 }}>
                {opportunities.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: "var(--p-color-text-secondary)" }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>💎</div>
                    <div style={{ fontSize: 13 }}>No opportunities detected yet.</div>
                  </div>
                ) : opportunities.map((o, i) => <OpportunityCard key={i} opp={o} />)}
              </div>
            </s-box>
          </s-card>

          <s-card>
            <s-box padding="400">
              <s-text variant="headingSm">Catalog Gaps ({gaps.length})</s-text>
              <div style={{ marginTop: 10, fontSize: 12 }}>
                {gaps.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: "var(--p-color-text-secondary)" }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                    <div style={{ fontSize: 13 }}>No catalog gaps detected.</div>
                  </div>
                ) : gaps.map((g, i) => (
                  <div key={i} style={{
                    padding: "10px 12px", borderRadius: 8, marginBottom: 4,
                    border: "1px solid var(--p-color-border-subdued)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{g.term}</div>
                      <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)", marginTop: 2 }}>
                        {g.mentions} mentions · Sentiment: {g.avgSentiment > 0 ? "+" : ""}{g.avgSentiment}
                      </div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: g.gapScore >= 60 ? "#FF1744" : "#FFB300" }}>
                      {g.gapScore}
                    </div>
                  </div>
                ))}
              </div>
            </s-box>
          </s-card>
        </div>
      )}

      {activeTab === "trends" && (
        <s-card>
          <s-box padding="400">
            <s-text variant="headingSm">Cross-Platform Trends</s-text>
            <div style={{ marginTop: 10 }}>
              {crossPlatform.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--p-color-text-secondary)" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📈</div>
                  <div style={{ fontSize: 13 }}>No cross-platform trends detected. Signals need to appear across 2+ sources.</div>
                </div>
              ) : crossPlatform.map((c, i) => <CrossPlatformCard key={i} item={c} />)}
            </div>
          </s-box>
        </s-card>
      )}
    </s-page>
  );
}
