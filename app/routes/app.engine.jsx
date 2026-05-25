import { useEffect, useState, useCallback, useRef } from "react";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { StatCard, ConfigSlider, ConfigToggle, DetailTable, LifecycleBadge, LogTag } from "../components/engine-ui";
import { MonitoringDashboard } from "../components/engine/MonitoringDashboard";
import { SchedulingConfig } from "../components/engine/SchedulingConfig";
import { AlertsConfig } from "../components/engine/AlertsConfig";
import { fmt$ } from "../lib/format";

// ─── Server exports ───────────────────────────────────────────────────────────

export const headers = (headersArgs) => boundary.headers(headersArgs);

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.setting.findUnique({ where: { shop: session.shop } });
  const savedConfig = settings?.engineConfig ? JSON.parse(settings.engineConfig) : null;
  return { savedConfig };
};

// ─── Constants ────────────────────────────────────────────────────────────────

const NICHES = [
  { value: "gym", label: "Gym & tactical", icon: "🏋️" },
  { value: "anxiety", label: "Wellness", icon: "🧠" },
  { value: "home", label: "Home & kitchen", icon: "🏠" },
  { value: "pet", label: "Pet accessories", icon: "🐾" },
  { value: "tech", label: "Tech & gadgets", icon: "📱" },
  { value: "beauty", label: "Beauty & skincare", icon: "💄" },
];

const PRESETS = {
  conservative: {
    label: "Conservative",
    description: "High quality, low risk products",
    config: { scoreThreshold: 80, marginFloor: 40, moqMax: 25, autonomyLevel: 2 },
  },
  balanced: {
    label: "Balanced",
    description: "Good quality with moderate risk",
    config: { scoreThreshold: 70, marginFloor: 35, moqMax: 50, autonomyLevel: 3 },
  },
  aggressive: {
    label: "Aggressive",
    description: "Maximize profit potential",
    config: { scoreThreshold: 60, marginFloor: 30, moqMax: 100, autonomyLevel: 4 },
  },
};

const PHASES = ["idle", "Scout", "Score", "Negotiate", "Price", "Import", "Monitor"];

const DEFAULT_CONFIG = {
  scoreThreshold: 65, marginFloor: 35, moqMax: 50, autonomyLevel: 3,
  negotiationEnabled: true, pricingEnabled: true, importEnabled: false,
  deathPredictor: true, surgeEnabled: true,
};

const DEFAULT_SCHEDULING = {
  enabled: false, frequency: "manual", scheduledTime: "09:00",
  maxProducts: 100, autoStop: false, stopAfterHours: 4,
};

const DEFAULT_ALERTS = {
  enabled: false, scoreThreshold: 80, marginThreshold: 40,
  lowStockAlert: true, priceDropAlert: true, notifyChannels: ["app"],
};

function getActivePrice(p) {
  if (p.activePrice === "surge") return parseFloat((p.price * 1.12).toFixed(2));
  if (p.activePrice === "undercut") return parseFloat((p.price * 0.96).toFixed(2));
  if (p.activePrice === "psych") return parseFloat((Math.floor(p.price) - 0.01).toFixed(2));
  return p.price;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EnginePage() {
  const { savedConfig } = useLoaderData();
  const shopify = useAppBridge();

  // Split persisted config into core / scheduling / alerts
  const { scheduling: savedScheduling, alerts: savedAlerts, ...savedCore } = savedConfig || {};

  const [running, setRunning] = useState(false);
  const [niche, setNiche] = useState("gym");
  const [phase, setPhase] = useState(0);
  const [phaseSub, setPhaseSub] = useState("");
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({ products: 0, avgMargin: 0, deals: 0, projRevenue: 0, sessionRev: 0 });
  const [logLines, setLogLines] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [config, setConfig] = useState(() => ({ ...DEFAULT_CONFIG, ...savedCore }));
  const [activeTab, setActiveTab] = useState("control");
  const [scheduling, setScheduling] = useState(savedScheduling || DEFAULT_SCHEDULING);
  const [alerts, setAlerts] = useState(savedAlerts || DEFAULT_ALERTS);
  const [selectedPreset, setSelectedPreset] = useState("balanced");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Loading / error states
  const [actionLoading, setActionLoading] = useState(null); // null | string key
  const [actionError, setActionError] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'

  const pollRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/engine");
      const data = await res.json();
      setRunning(data.running);
      setPhase(data.phase || 0);
      setPhaseSub(data.phaseSub || "");
      if (data.products?.length) setProducts(data.products);
      if (data.stats) setStats(data.stats);
      if (data.log?.length) setLogLines(data.log);
    } catch { /* silent poll failures */ }
  }, []);

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => clearInterval(pollRef.current);
  }, [poll]);

  // ── API helpers ─────────────────────────────────────────────────────────────

  const apiCall = async (body) => {
    const res = await fetch("/api/engine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const startPipeline = async () => {
    setActionLoading("start");
    setActionError(null);
    try {
      await apiCall({ intent: "start", niche, config });
      setRunning(true);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const stopPipeline = async () => {
    setActionLoading("stop");
    setActionError(null);
    try {
      await apiCall({ intent: "stop" });
      setRunning(false);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const negotiateProduct = async (productId) => {
    setActionLoading(`negotiate-${productId}`);
    setActionError(null);
    try {
      await apiCall({ intent: "negotiate", productId });
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const setPriceMode = async (productId, mode) => {
    try {
      await apiCall({ intent: "setPrice", productId, mode });
    } catch (err) {
      setActionError(err.message);
    }
  };

  const importProducts = async (productIds) => {
    setActionLoading("import");
    setActionError(null);
    try {
      await apiCall({ intent: "import", productIds });
      shopify.toast.show(`${productIds.length} product${productIds.length !== 1 ? "s" : ""} imported to store`);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const createDropFromProducts = async (productIds) => {
    const title = `Engine Drop — ${niche} — ${new Date().toLocaleDateString()}`;
    setActionLoading("createDrop");
    setActionError(null);
    try {
      await apiCall({ intent: "createDrop", title, productIds });
      shopify.toast.show("Drop created successfully");
    } catch (err) {
      setActionError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const applyPreset = (presetName) => {
    const preset = PRESETS[presetName];
    if (preset) {
      setConfig(prev => ({ ...prev, ...preset.config }));
      setSelectedPreset(presetName);
    }
  };

  const saveConfiguration = async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engineConfig: JSON.stringify({ ...config, scheduling, alerts }),
        }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      setSaveStatus("saved");
      shopify.toast.show("Configuration saved");
      setTimeout(() => setSaveStatus(null), 3000);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 5000);
    }
  };

  const selected = products.find(p => p.id === selectedId);
  const unimportedIds = products.filter(p => !p.imported).map(p => p.id);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <s-page title="AI Automation Control Panel" subtitle="Autonomous product lifecycle engine">
      <div slot="primaryAction">
        {running ? (
          <s-button
            variant="destructive"
            onClick={stopPipeline}
            disabled={actionLoading === "stop"}
          >
            {actionLoading === "stop" ? "Stopping…" : "Stop Engine"}
          </s-button>
        ) : (
          <s-button
            variant="primary"
            onClick={startPipeline}
            disabled={actionLoading === "start"}
          >
            {actionLoading === "start" ? "Starting…" : "Run Engine"}
          </s-button>
        )}
      </div>

      {/* Tab Navigation */}
      <s-box padding="400" background="bg-surface-secondary" borderRadius="300" style={{ marginBottom: "16px" }}>
        <s-inline gap="200">
          {["control", "monitoring", "scheduling", "alerts"].map(tab => (
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

      {activeTab === "control" ? (
        <>
          {/* Error banner */}
          {actionError && (
            <div style={{
              marginBottom: 16, padding: "10px 14px", borderRadius: 6, fontSize: 12,
              background: "var(--p-color-bg-fill-critical-secondary)",
              border: "1px solid var(--p-color-border-critical)",
              color: "var(--p-color-text-critical)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span>⚠ {actionError}</span>
              <button
                onClick={() => setActionError(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "inherit", padding: "0 4px" }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Preset Selection */}
          <s-card style={{ marginBottom: "16px" }}>
            <s-box padding="400">
              <s-text variant="headingSm" style={{ marginBottom: "12px" }}>Configuration Presets</s-text>
              <s-inline gap="200">
                {Object.entries(PRESETS).map(([key, preset]) => (
                  <s-button
                    key={key}
                    variant={selectedPreset === key ? "primary" : "tertiary"}
                    size="slim"
                    onClick={() => applyPreset(key)}
                  >
                    {preset.label}
                  </s-button>
                ))}
              </s-inline>
              <div style={{ marginTop: "8px", fontSize: 11, color: "var(--p-color-text-secondary)" }}>
                {PRESETS[selectedPreset]?.description}
              </div>
            </s-box>
          </s-card>

          {/* Niche + Stats */}
          <s-box padding="400" background="bg-surface-secondary" borderRadius="300" style={{ marginBottom: "16px" }}>
            <s-inline gap="200" blockAlign="center" style={{ marginBottom: "12px" }}>
              {NICHES.map(n => (
                <s-button key={n.value} variant={niche === n.value ? "primary" : "tertiary"} size="slim" onClick={() => setNiche(n.value)}>
                  {n.icon} {n.label}
                </s-button>
              ))}
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 13, color: "var(--p-color-text-secondary)" }}>
                Session: <strong style={{ color: "var(--p-color-text-success)" }}>{fmt$(stats.sessionRev)}</strong>
              </span>
            </s-inline>

            <s-inline gap="300">
              <StatCard label="Products" value={stats.products} color="info" />
              <StatCard label="Avg margin" value={stats.avgMargin ? stats.avgMargin + "%" : "—"} color={stats.avgMargin >= 45 ? "success" : "warning"} />
              <StatCard label="Deals closed" value={stats.deals} color="warning" />
              <StatCard label="Proj. revenue" value={fmt$(stats.projRevenue)} color="success" />
            </s-inline>
          </s-box>

          {/* Pipeline */}
          <s-card>
            <s-box padding="400">
              <s-text variant="headingSm">Automation Pipeline</s-text>
              <div style={{ display: "flex", gap: 0, marginTop: 12 }}>
                {PHASES.slice(1).map((name, i) => {
                  const step = i + 1;
                  const status = step < phase ? "done" : step === phase ? "active" : "pending";
                  return (
                    <div key={name} style={{ flex: 1, display: "flex", alignItems: "center" }}>
                      <div style={{
                        flex: 1, padding: "8px 10px", textAlign: "center", fontSize: 11, fontWeight: 600,
                        borderRadius: i === 0 ? "6px 0 0 6px" : i === 5 ? "0 6px 6px 0" : 0,
                        border: "1px solid",
                        borderColor: status !== "pending" ? "var(--p-color-border-success)" : "var(--p-color-border)",
                        background: status === "active" ? "var(--p-color-bg-fill-success)" : status === "done" ? "var(--p-color-bg-surface-success)" : "var(--p-color-bg-surface)",
                        color: status === "pending" ? "var(--p-color-text-secondary)" : status === "active" ? "var(--p-color-text-success)" : "var(--p-color-text-secondary)",
                      }}>
                        {name}
                        {step === phase && phaseSub && <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{phaseSub}</div>}
                      </div>
                      {i < 5 && <div style={{ width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderLeft: "6px solid var(--p-color-border)", flexShrink: 0 }} />}
                    </div>
                  );
                })}
              </div>
            </s-box>
          </s-card>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, marginTop: 16 }}>
            {/* Left: Products + Log */}
            <div>
              {/* Product List */}
              <s-card>
                <s-box padding="400">
                  <s-inline gap="200" blockAlign="center" style={{ marginBottom: 12 }}>
                    <s-text variant="headingSm">Product Results ({products.length})</s-text>
                    <s-button size="slim" variant="tertiary" onClick={() => setShowAdvanced(v => !v)}>
                      {showAdvanced ? "Simple view" : "Advanced view"}
                    </s-button>
                  </s-inline>

                  {products.length === 0 ? (
                    <s-text tone="subdued">No products yet. Run the engine to scout products.</s-text>
                  ) : (
                    <div style={{ maxHeight: 400, overflowY: "auto" }}>
                      {products.map(p => (
                        <div
                          key={p.id}
                          onClick={() => setSelectedId(p.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedId(p.id); }
                          }}
                          role="button"
                          tabIndex={0}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6,
                            cursor: "pointer", marginBottom: 4,
                            border: selectedId === p.id ? "1px solid var(--p-color-border-emphasis)" : "1px solid transparent",
                            background: selectedId === p.id ? "var(--p-color-bg-surface-secondary)" : "transparent",
                          }}
                        >
                          <div style={{
                            width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: 700, flexShrink: 0,
                            border: `2px solid ${p.score >= 80 ? "var(--p-color-border-success)" : p.score >= 60 ? "var(--p-color-border-caution)" : "var(--p-color-border-critical)"}`,
                            color: p.score >= 80 ? "var(--p-color-text-success)" : p.score >= 60 ? "var(--p-color-text-caution)" : "var(--p-color-text-critical)",
                          }}>
                            {p.score}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {p.name}
                              {p.imported && <span style={{ color: "var(--p-color-text-success)", fontSize: 10, marginLeft: 6 }}>✓ listed</span>}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--p-color-text-secondary)", marginTop: 2 }}>
                              <LifecycleBadge lifecycle={p.lifecycle} />
                              <span style={{ marginLeft: 6, color: p.trend > 0 ? "var(--p-color-text-success)" : p.trend < 0 ? "var(--p-color-text-critical)" : "inherit" }}>
                                {p.trend > 0 ? "+" : ""}{p.trend}%
                              </span>
                              <span style={{ marginLeft: 8 }}>{p.margin}% margin</span>
                              <span style={{ marginLeft: 8, opacity: 0.6 }}>{p.velocity}/mo</span>
                            </div>
                            {showAdvanced && (
                              <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)", marginTop: 3, display: "flex", gap: 10 }}>
                                <span>MOQ: {p.moq}</span>
                                <span>{p.supplier}</span>
                                {p.warns?.length > 0 && (
                                  <span style={{ color: "var(--p-color-text-critical)" }}>⚠ {p.warns.join(", ")}</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>${getActivePrice(p).toFixed(2)}</div>
                            <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)" }}>{p.activePrice}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </s-box>
              </s-card>

              {/* Log */}
              <s-card>
                <s-box padding="400">
                  <s-text variant="headingSm">Automation Log</s-text>
                  <div style={{ maxHeight: 180, overflowY: "auto", marginTop: 8, fontFamily: "monospace", fontSize: 11, lineHeight: 1.8 }}>
                    {logLines.length === 0 ? (
                      <div style={{ color: "var(--p-color-text-secondary)" }}>Engine ready. Press Run Engine to begin.</div>
                    ) : (
                      logLines.map((l, i) => (
                        <div key={i} style={{ borderBottom: "1px solid var(--p-color-border-subdued)", padding: "2px 0" }}>
                          <span style={{ color: "var(--p-color-text-secondary)", marginRight: 8 }}>{new Date(l.ts).toLocaleTimeString()}</span>
                          <LogTag tag={l.tag} cls={l.cls} />
                          {l.msg}
                        </div>
                      ))
                    )}
                  </div>
                </s-box>
              </s-card>
            </div>

            {/* Right: Detail + Pricing + Actions + Config */}
            <div>
              {selected ? (
                <>
                  {/* Detail */}
                  <s-card>
                    <s-box padding="400">
                      <s-text variant="headingSm">Product Detail</s-text>
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{selected.name}</div>
                        <div style={{ marginBottom: 8 }}>
                          <LifecycleBadge lifecycle={selected.lifecycle} />
                          <span style={{ marginLeft: 6, fontSize: 11, padding: "1px 6px", borderRadius: 8, background: "var(--p-color-bg-fill-secondary)", color: "var(--p-color-text-secondary)" }}>
                            {selected.cat}
                          </span>
                        </div>
                        <DetailTable rows={[
                          ["Sell price", "$" + selected.price.toFixed(2)],
                          ["Landed cost", "$" + selected.landed.toFixed(2)],
                          ["Gross margin", selected.margin + "%"],
                          ["Velocity", selected.velocity + " units/mo"],
                          ["Searches", selected.searches.toLocaleString() + "/mo"],
                          ["Trend", (selected.trend > 0 ? "+" : "") + selected.trend + "%"],
                          ["Competition", selected.competition],
                          ["Supplier", selected.supplier],
                          ["Supplier score", selected.supScore + "/100"],
                          ["MOQ", selected.moq + " units"],
                          ["Proj. revenue", fmt$(selected.velocity * getActivePrice(selected)) + "/mo"],
                        ]} />
                        <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)", marginTop: 8 }}>
                          Sources: {selected.sources.join(" · ")}
                        </div>
                      </div>
                    </s-box>
                  </s-card>

                  {/* Pricing */}
                  <s-card>
                    <s-box padding="400">
                      <s-text variant="headingSm">Dynamic Pricing</s-text>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 8 }}>
                        {[
                          { mode: "psych", label: "Psychological", price: (Math.floor(selected.price) - 0.01).toFixed(2), note: "+2.1% CVR" },
                          { mode: "undercut", label: "Undercut", price: (selected.price * 0.96).toFixed(2), note: "-4% margin" },
                          { mode: "surge", label: "Surge", price: (selected.price * 1.12).toFixed(2), note: "viral mode" },
                          { mode: "standard", label: "Standard", price: selected.price.toFixed(2), note: "base price" },
                        ].map(pm => (
                          <div
                            key={pm.mode}
                            onClick={() => setPriceMode(selected.id, pm.mode)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPriceMode(selected.id, pm.mode); }
                            }}
                            role="button"
                            tabIndex={0}
                            style={{
                              padding: "8px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11,
                              border: selected.activePrice === pm.mode ? "1px solid var(--p-color-border-success)" : "1px solid var(--p-color-border)",
                              background: selected.activePrice === pm.mode ? "var(--p-color-bg-surface-success)" : "var(--p-color-bg-surface)",
                            }}
                          >
                            <div style={{ fontWeight: 600, fontSize: 10, color: "var(--p-color-text-secondary)" }}>{pm.label}</div>
                            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>${pm.price}</div>
                            <div style={{ fontSize: 10, marginTop: 2, color: "var(--p-color-text-secondary)" }}>{pm.note}</div>
                          </div>
                        ))}
                      </div>
                    </s-box>
                  </s-card>

                  {/* Actions */}
                  <s-card>
                    <s-box padding="400">
                      <s-text variant="headingSm">Actions</s-text>
                      <s-inline gap="200" style={{ marginTop: 8 }}>
                        <s-button
                          size="slim"
                          onClick={() => negotiateProduct(selected.id)}
                          disabled={selected.negState >= 5 || actionLoading === `negotiate-${selected.id}`}
                        >
                          {actionLoading === `negotiate-${selected.id}` ? "Negotiating…" : "Re-negotiate"}
                        </s-button>
                        <s-button
                          size="slim"
                          variant="primary"
                          onClick={() => importProducts([selected.id])}
                          disabled={selected.imported || actionLoading === "import"}
                        >
                          {selected.imported ? "Imported" : "Import to store"}
                        </s-button>
                      </s-inline>
                      {unimportedIds.length > 0 && (
                        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                          <s-button
                            size="slim"
                            onClick={() => importProducts(unimportedIds)}
                            disabled={actionLoading === "import"}
                          >
                            {actionLoading === "import" ? "Importing…" : `Import all (${unimportedIds.length})`}
                          </s-button>
                          <s-button
                            size="slim"
                            variant="tertiary"
                            onClick={() => createDropFromProducts(unimportedIds)}
                            disabled={actionLoading === "createDrop"}
                          >
                            {actionLoading === "createDrop" ? "Creating…" : `Create Drop (${unimportedIds.length})`}
                          </s-button>
                        </div>
                      )}
                    </s-box>
                  </s-card>
                </>
              ) : (
                <s-card>
                  <s-box padding="400">
                    <s-text tone="subdued">Select a product to view details, pricing, and actions.</s-text>
                    {unimportedIds.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <s-button
                          size="slim"
                          variant="tertiary"
                          onClick={() => createDropFromProducts(unimportedIds)}
                          disabled={actionLoading === "createDrop"}
                        >
                          {actionLoading === "createDrop" ? "Creating…" : `Create Drop (${unimportedIds.length})`}
                        </s-button>
                      </div>
                    )}
                  </s-box>
                </s-card>
              )}

              {/* Config */}
              <s-card>
                <s-box padding="400">
                  <s-text variant="headingSm">Engine Config</s-text>
                  <div style={{ marginTop: 8, fontSize: 12 }}>
                    <ConfigSlider label="Score threshold" value={config.scoreThreshold} min={50} max={95} step={5} onChange={v => setConfig(c => ({ ...c, scoreThreshold: v }))} />
                    <ConfigSlider label="Margin floor" value={config.marginFloor} min={20} max={60} step={1} suffix="%" onChange={v => setConfig(c => ({ ...c, marginFloor: v }))} />
                    <ConfigSlider label="Max MOQ" value={config.moqMax} min={10} max={200} step={10} onChange={v => setConfig(c => ({ ...c, moqMax: v }))} />
                    <ConfigSlider label="Autonomy" value={config.autonomyLevel} min={1} max={5} step={1} onChange={v => setConfig(c => ({ ...c, autonomyLevel: v }))} />
                    <ConfigToggle label="Negotiation" checked={config.negotiationEnabled} onChange={v => setConfig(c => ({ ...c, negotiationEnabled: v }))} />
                    <ConfigToggle label="Dynamic pricing" checked={config.pricingEnabled} onChange={v => setConfig(c => ({ ...c, pricingEnabled: v }))} />
                    <ConfigToggle label="Auto import" checked={config.importEnabled} onChange={v => setConfig(c => ({ ...c, importEnabled: v }))} />
                    <ConfigToggle label="Death predictor" checked={config.deathPredictor} onChange={v => setConfig(c => ({ ...c, deathPredictor: v }))} />
                    <ConfigToggle label="Surge pricing" checked={config.surgeEnabled} onChange={v => setConfig(c => ({ ...c, surgeEnabled: v }))} />
                  </div>
                  <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                    <s-button
                      variant="primary"
                      size="slim"
                      onClick={saveConfiguration}
                      disabled={saveStatus === "saving"}
                    >
                      {saveStatus === "saving" ? "Saving…" : "Save Configuration"}
                    </s-button>
                    {saveStatus === "saved" && (
                      <span style={{ fontSize: 11, color: "var(--p-color-text-success)" }}>✓ Saved</span>
                    )}
                    {saveStatus === "error" && (
                      <span style={{ fontSize: 11, color: "var(--p-color-text-critical)" }}>Save failed</span>
                    )}
                  </div>
                </s-box>
              </s-card>
            </div>
          </div>
        </>
      ) : activeTab === "monitoring" ? (
        <MonitoringDashboard stats={stats} products={products} running={running} />
      ) : activeTab === "scheduling" ? (
        <SchedulingConfig scheduling={scheduling} setScheduling={setScheduling} />
      ) : (
        <AlertsConfig alerts={alerts} setAlerts={setAlerts} />
      )}
    </s-page>
  );
}
