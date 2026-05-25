import { useEffect, useState, useCallback, useRef } from "react";
import PropTypes from "prop-types";

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
    config: { scoreThreshold: 80, marginFloor: 40, moqMax: 25, autonomyLevel: 2 }
  },
  balanced: {
    label: "Balanced",
    description: "Good quality with moderate risk",
    config: { scoreThreshold: 70, marginFloor: 35, moqMax: 50, autonomyLevel: 3 }
  },
  aggressive: {
    label: "Aggressive",
    description: "Maximize profit potential",
    config: { scoreThreshold: 60, marginFloor: 30, moqMax: 100, autonomyLevel: 4 }
  },
};

const PHASES = ["idle", "Scout", "Score", "Negotiate", "Price", "Import", "Monitor"];

function fmt$(n) {
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return "$" + (n / 1000).toFixed(0) + "k";
  return "$" + Math.round(n).toLocaleString();
}

function getActivePrice(p) {
  if (p.activePrice === "surge") return parseFloat((p.price * 1.12).toFixed(2));
  if (p.activePrice === "undercut") return parseFloat((p.price * 0.96).toFixed(2));
  if (p.activePrice === "psych") return parseFloat((Math.floor(p.price) - 0.01).toFixed(2));
  return p.price;
}

export default function EnginePage() {
  const [running, setRunning] = useState(false);
  const [niche, setNiche] = useState("gym");
  const [phase, setPhase] = useState(0);
  const [phaseSub, setPhaseSub] = useState("");
  const [products, setProducts] = useState([]);
  const [stats, setStats] = useState({ products: 0, avgMargin: 0, deals: 0, projRevenue: 0, sessionRev: 0 });
  const [logLines, setLogLines] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [config, setConfig] = useState({
    scoreThreshold: 65, marginFloor: 35, moqMax: 50, autonomyLevel: 3,
    negotiationEnabled: true, pricingEnabled: true, importEnabled: false,
    deathPredictor: true, surgeEnabled: true,
  });
  const [activeTab, setActiveTab] = useState("control");
  const [scheduling, setScheduling] = useState({
    enabled: false,
    frequency: "manual", // manual, hourly, daily, weekly
    scheduledTime: "09:00",
    maxProducts: 100,
    autoStop: false,
    stopAfterHours: 4,
  });
  const [alerts, setAlerts] = useState({
    enabled: false,
    scoreThreshold: 80,
    marginThreshold: 40,
    lowStockAlert: true,
    priceDropAlert: true,
    notifyChannels: ["app"], // app, email, webhook
  });
  const [selectedPreset, setSelectedPreset] = useState("balanced");
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => clearInterval(pollRef.current);
  }, [poll]);

  const apiCall = async (body) => {
    const res = await fetch("/api/engine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  };

  const startPipeline = async () => {
    await apiCall({ intent: "start", niche, config });
    setRunning(true);
  };

  const stopPipeline = async () => {
    await apiCall({ intent: "stop" });
    setRunning(false);
  };

  const negotiateProduct = async (productId) => {
    await apiCall({ intent: "negotiate", productId });
  };

  const setPriceMode = async (productId, mode) => {
    await apiCall({ intent: "setPrice", productId, mode });
  };

  const importProducts = async (productIds) => {
    await apiCall({ intent: "import", productIds });
  };

  // eslint-disable-next-line no-unused-vars
  const createDropFromProducts = async (productIds) => {
    const title = `Engine Drop - ${niche} - ${new Date().toLocaleDateString()}`;
    await apiCall({ intent: "createDrop", title, productIds });
  };

  // eslint-disable-next-line no-unused-vars
  const importToDrop = async (dropId, productIds) => {
    await apiCall({ intent: "importToDrop", dropId, productIds });
  };

  const applyPreset = (presetName) => {
    const preset = PRESETS[presetName];
    if (preset) {
      setConfig(prev => ({ ...prev, ...preset.config }));
      setSelectedPreset(presetName);
    }
  };

  const saveConfiguration = async () => {
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engineConfig: JSON.stringify({ ...config, scheduling, alerts }),
        }),
      });
      if (res.ok) {
        // Show success message
      }
    } catch (error) {
      console.error("Failed to save configuration:", error);
    }
  };

  const selected = products.find(p => p.id === selectedId);

  return (
    <s-page title="AI Automation Control Panel" subtitle="Autonomous product lifecycle engine">
      <div slot="primaryAction">
        {running ? (
          <s-button variant="destructive" onClick={stopPipeline}>Stop Engine</s-button>
        ) : (
          <s-button variant="primary" onClick={startPipeline}>Run Engine</s-button>
        )}
      </div>

      {/* Tab Navigation */}
      <s-box padding="400" background="bg-surface-secondary" borderRadius="300" style={{ marginBottom: "16px" }}>
        <s-inline gap="200">
          <s-button 
            variant={activeTab === "control" ? "primary" : "tertiary"} 
            size="slim" 
            onClick={() => setActiveTab("control")}
          >
            Control Panel
          </s-button>
          <s-button 
            variant={activeTab === "monitoring" ? "primary" : "tertiary"} 
            size="slim" 
            onClick={() => setActiveTab("monitoring")}
          >
            Monitoring
          </s-button>
          <s-button 
            variant={activeTab === "scheduling" ? "primary" : "tertiary"} 
            size="slim" 
            onClick={() => setActiveTab("scheduling")}
          >
            Scheduling
          </s-button>
          <s-button 
            variant={activeTab === "alerts" ? "primary" : "tertiary"} 
            size="slim" 
            onClick={() => setActiveTab("alerts")}
          >
            Alerts
          </s-button>
        </s-inline>
      </s-box>

      {activeTab === "control" ? (
        <>
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
                        borderColor: status === "active" ? "var(--p-color-border-success)" : status === "done" ? "var(--p-color-border-success)" : "var(--p-color-border)",
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
                    <s-button size="slim" variant="tertiary" onClick={() => setShowAdvanced(!showAdvanced)}>
                      {showAdvanced ? "Simple" : "Advanced"}
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
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedId(p.id);
                            }
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

            {/* Right: Detail + Pricing + Actions */}
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
                          <span style={{ marginLeft: 6, fontSize: 11, padding: "1px 6px", borderRadius: 8, background: "var(--p-color-bg-fill-secondary)", color: "var(--p-color-text-secondary)" }}>{selected.cat}</span>
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
                        <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)", marginTop: 8 }}>Sources: {selected.sources.join(" · ")}</div>
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
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setPriceMode(selected.id, pm.mode);
                              }
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
                        <s-button size="slim" onClick={() => negotiateProduct(selected.id)} disabled={selected.negState >= 5}>
                          Re-negotiate
                        </s-button>
                        <s-button size="slim" variant="primary" onClick={() => importProducts([selected.id])} disabled={selected.imported}>
                          Import to store
                        </s-button>
                      </s-inline>
                      {products.filter(p => !p.imported).length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <s-button size="slim" onClick={() => importProducts(products.filter(p => !p.imported).map(p => p.id))}>
                            Import all ({products.filter(p => !p.imported).length})
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
                  <s-button variant="primary" size="slim" style={{ marginTop: "12px" }} onClick={saveConfiguration}>
                    Save Configuration
                  </s-button>
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

// Monitoring Dashboard Component
function MonitoringDashboard({ stats, products, running }) {
  const highScoringProducts = products.filter(p => p.score >= 80).length;
  const trendingProducts = products.filter(p => p.trend > 10).length;
  const importedProducts = products.filter(p => p.imported).length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16 }}>
      <s-card>
        <s-box padding="400">
          <s-text variant="headingSm">Performance Metrics</s-text>
          <div style={{ marginTop: 12 }}>
            <MetricRow label="High scoring products" value={highScoringProducts} total={products.length} />
            <MetricRow label="Trending products" value={trendingProducts} total={products.length} />
            <MetricRow label="Imported products" value={importedProducts} total={products.length} />
            <MetricRow label="Success rate" value={stats.products > 0 ? Math.round((stats.deals / stats.products) * 100) : 0} suffix="%" />
          </div>
        </s-box>
      </s-card>
      <s-card>
        <s-box padding="400">
          <s-text variant="headingSm">Revenue Projection</s-text>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--p-color-text-success)", marginBottom: 4 }}>
              {fmt$(stats.projRevenue)}
            </div>
            <div style={{ fontSize: 11, color: "var(--p-color-text-secondary)" }}>
              Projected monthly revenue based on current products
            </div>
          </div>
        </s-box>
      </s-card>
      <s-card>
        <s-box padding="400">
          <s-text variant="headingSm">Engine Status</s-text>
          <div style={{ marginTop: 12 }}>
            <StatusBadge running={running} />
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--p-color-text-secondary)" }}>
              {running ? "Engine is actively processing" : "Engine is idle"}
            </div>
          </div>
        </s-box>
      </s-card>
      <s-card>
        <s-box padding="400">
          <s-text variant="headingSm">Product Lifecycle Distribution</s-text>
          <div style={{ marginTop: 12, fontSize: 11 }}>
            {Object.entries({
              viral: products.filter(p => p.lifecycle === 'viral').length,
              growing: products.filter(p => p.lifecycle === 'growing').length,
              peak: products.filter(p => p.lifecycle === 'peak').length,
              mature: products.filter(p => p.lifecycle === 'mature').length,
              dying: products.filter(p => p.lifecycle === 'dying').length,
            }).filter(([_, count]) => count > 0).map(([stage, count]) => (
              <div key={stage} style={{ marginBottom: 4, display: "flex", alignItems: "center" }}>
                <LifecycleBadge lifecycle={stage} />
                <span style={{ marginLeft: 8 }}>{count} products</span>
              </div>
            ))}
          </div>
        </s-box>
      </s-card>
    </div>
  );
}

// Scheduling Configuration Component
function SchedulingConfig({ scheduling, setScheduling }) {
  return (
    <s-card>
      <s-box padding="400">
        <s-text variant="headingSm">Automation Scheduling</s-text>
        <div style={{ marginTop: 12, fontSize: 12 }}>
          <ConfigToggle label="Enable scheduling" checked={scheduling.enabled} onChange={v => setScheduling(c => ({ ...c, enabled: v }))} />
          
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, fontSize: 11, color: "var(--p-color-text-secondary)" }}>Frequency</div>
            <select 
              value={scheduling.frequency}
              onChange={(e) => setScheduling(c => ({ ...c, frequency: e.target.value }))}
              disabled={!scheduling.enabled}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid var(--p-color-border)",
                background: "var(--p-color-bg-surface)",
                color: "var(--p-color-text)",
                fontSize: 12,
              }}
            >
              <option value="manual">Manual</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          {scheduling.frequency !== 'manual' && (
            <div style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 4, fontSize: 11, color: "var(--p-color-text-secondary)" }}>Scheduled Time</div>
              <input
                type="time"
                value={scheduling.scheduledTime}
                onChange={(e) => setScheduling(c => ({ ...c, scheduledTime: e.target.value }))}
                disabled={!scheduling.enabled}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--p-color-border)",
                  background: "var(--p-color-bg-surface)",
                  color: "var(--p-color-text)",
                  fontSize: 12,
                }}
              />
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <ConfigSlider label="Max products per run" value={scheduling.maxProducts} min={10} max={500} step={10} onChange={v => setScheduling(c => ({ ...c, maxProducts: v }))} />
          </div>

          <ConfigToggle label="Auto-stop after time limit" checked={scheduling.autoStop} onChange={v => setScheduling(c => ({ ...c, autoStop: v }))} />
          
          {scheduling.autoStop && (
            <ConfigSlider label="Stop after (hours)" value={scheduling.stopAfterHours} min={1} max={24} step={1} onChange={v => setScheduling(c => ({ ...c, stopAfterHours: v }))} />
          )}
        </div>
      </s-box>
    </s-card>
  );
}

// Alerts Configuration Component
function AlertsConfig({ alerts, setAlerts }) {
  return (
    <s-card>
      <s-box padding="400">
        <s-text variant="headingSm">Alert Configuration</s-text>
        <div style={{ marginTop: 12, fontSize: 12 }}>
          <ConfigToggle label="Enable alerts" checked={alerts.enabled} onChange={v => setAlerts(a => ({ ...a, enabled: v }))} />
          
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, fontSize: 11, color: "var(--p-color-text-secondary)" }}>Alert Thresholds</div>
            <ConfigSlider label="Score threshold" value={alerts.scoreThreshold} min={50} max={95} step={5} onChange={v => setAlerts(a => ({ ...a, scoreThreshold: v }))} />
            <ConfigSlider label="Margin threshold" value={alerts.marginThreshold} min={20} max={60} step={1} suffix="%" onChange={v => setAlerts(a => ({ ...a, marginThreshold: v }))} />
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, fontSize: 11, color: "var(--p-color-text-secondary)" }}>Alert Types</div>
            <ConfigToggle label="Low stock alerts" checked={alerts.lowStockAlert} onChange={v => setAlerts(a => ({ ...a, lowStockAlert: v }))} />
            <ConfigToggle label="Price drop alerts" checked={alerts.priceDropAlert} onChange={v => setAlerts(a => ({ ...a, priceDropAlert: v }))} />
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, fontSize: 11, color: "var(--p-color-text-secondary)" }}>Notification Channels</div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <label style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, background: alerts.notifyChannels.includes("app") ? "var(--p-color-bg-fill-success)" : "var(--p-color-bg-surface)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={alerts.notifyChannels.includes("app")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setAlerts(a => ({ ...a, notifyChannels: [...a.notifyChannels, "app"] }));
                    } else {
                      setAlerts(a => ({ ...a, notifyChannels: a.notifyChannels.filter(c => c !== "app") }));
                    }
                  }}
                  disabled={!alerts.enabled}
                />
                App Notifications
              </label>
              <label style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, background: alerts.notifyChannels.includes("email") ? "var(--p-color-bg-fill-success)" : "var(--p-color-bg-surface)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={alerts.notifyChannels.includes("email")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setAlerts(a => ({ ...a, notifyChannels: [...a.notifyChannels, "email"] }));
                    } else {
                      setAlerts(a => ({ ...a, notifyChannels: a.notifyChannels.filter(c => c !== "email") }));
                    }
                  }}
                  disabled={!alerts.enabled}
                />
                Email
              </label>
              <label style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, background: alerts.notifyChannels.includes("webhook") ? "var(--p-color-bg-fill-success)" : "var(--p-color-bg-surface)", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={alerts.notifyChannels.includes("webhook")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setAlerts(a => ({ ...a, notifyChannels: [...a.notifyChannels, "webhook"] }));
                    } else {
                      setAlerts(a => ({ ...a, notifyChannels: a.notifyChannels.filter(c => c !== "webhook") }));
                    }
                  }}
                  disabled={!alerts.enabled}
                />
                Webhook
              </label>
            </div>
          </div>
        </div>
      </s-box>
    </s-card>
  );
}

// Additional helper components
function MetricRow({ label, value, total, suffix = "" }) {
  const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11 }}>
      <span style={{ color: "var(--p-color-text-secondary)" }}>{label}</span>
      <span>
        <strong>{value}</strong> / {total} ({percentage}%){suffix && <span> {suffix}</span>}
      </span>
    </div>
  );
}

function StatusBadge({ running }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
      background: running ? "var(--p-color-bg-fill-success)" : "var(--p-color-bg-surface-tertiary)",
      color: running ? "var(--p-color-text-success)" : "var(--p-color-text-secondary)",
    }}>
      {running ? "🟢 Running" : "⚪ Idle"}
    </span>
  );
}

// PropTypes for new components
MetricRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  total: PropTypes.number,
  suffix: PropTypes.string,
};

StatusBadge.propTypes = {
  running: PropTypes.bool.isRequired,
};

MonitoringDashboard.propTypes = {
  stats: PropTypes.object.isRequired,
  products: PropTypes.array.isRequired,
  running: PropTypes.bool.isRequired,
};

SchedulingConfig.propTypes = {
  scheduling: PropTypes.object.isRequired,
  setScheduling: PropTypes.func.isRequired,
};

AlertsConfig.propTypes = {
  alerts: PropTypes.object.isRequired,
  setAlerts: PropTypes.func.isRequired,
};