/**
 * app/components/engine-ui.jsx
 * ---------------------------------------------------------
 * Shared UI components used by both the Engine page
 * and the AI Pilot page. Extracted from app.engine.jsx
 * for reuse across the app.
 */


// ─── StatCard ───────────────────────────────────────────────────────────────

export function StatCard({ label, value, color = "info" }) {
  const colorMap = {
    info: "var(--p-color-text-info)",
    success: "var(--p-color-text-success)",
    warning: "var(--p-color-text-caution)",
    critical: "var(--p-color-text-critical)",
  };

  return (
    <div style={{
      flex: 1,
      background: "var(--p-color-bg-surface)",
      borderRadius: 8,
      padding: "10px 14px",
      border: "1px solid var(--p-color-border)",
    }}>
      <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color: colorMap[color] || colorMap.info }}>
        {value}
      </div>
    </div>
  );
}


// ─── ConfigSlider ───────────────────────────────────────────────────────────

export function ConfigSlider({ label, value, min, max, step, suffix = "", onChange }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
        <span style={{ color: "var(--p-color-text-secondary)" }}>{label}</span>
        <span style={{ fontWeight: 600 }}>{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--p-color-bg-fill-brand)" }}
      />
    </div>
  );
}


// ─── ConfigToggle ───────────────────────────────────────────────────────────

export function ConfigToggle({ label, checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!checked); } }}
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "6px 0",
        cursor: "pointer",
        fontSize: 12,
      }}
    >
      <span>{label}</span>
      <div style={{
        width: 32,
        height: 18,
        borderRadius: 9,
        background: checked ? "var(--p-color-bg-fill-success)" : "var(--p-color-bg-fill-secondary)",
        position: "relative",
        transition: "background 0.2s",
      }}>
        <div style={{
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "white",
          position: "absolute",
          top: 2,
          left: checked ? 16 : 2,
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </div>
    </div>
  );
}


// ─── DetailTable ────────────────────────────────────────────────────────────

export function DetailTable({ rows }) {
  return (
    <div style={{ fontSize: 11 }}>
      {rows.map(([label, value], i) => (
        <div key={i} style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "4px 0",
          borderBottom: i < rows.length - 1 ? "1px solid var(--p-color-border-subdued)" : "none",
        }}>
          <span style={{ color: "var(--p-color-text-secondary)" }}>{label}</span>
          <span style={{ fontWeight: 600 }}>{value}</span>
        </div>
      ))}
    </div>
  );
}


// ─── LifecycleBadge ─────────────────────────────────────────────────────────

const LIFECYCLE_COLORS = {
  viral: { bg: "var(--p-color-bg-fill-critical)", color: "var(--p-color-text-critical)" },
  growing: { bg: "var(--p-color-bg-fill-success)", color: "var(--p-color-text-success)" },
  peak: { bg: "var(--p-color-bg-fill-info)", color: "var(--p-color-text-info)" },
  mature: { bg: "var(--p-color-bg-fill-secondary)", color: "var(--p-color-text-secondary)" },
  dying: { bg: "var(--p-color-bg-fill-caution)", color: "var(--p-color-text-caution)" },
};

export function LifecycleBadge({ lifecycle }) {
  const colors = LIFECYCLE_COLORS[lifecycle] || LIFECYCLE_COLORS.mature;
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 600,
      padding: "1px 6px",
      borderRadius: 8,
      background: colors.bg,
      color: colors.color,
      textTransform: "uppercase",
      letterSpacing: "0.3px",
    }}>
      {lifecycle}
    </span>
  );
}


// ─── LogTag ─────────────────────────────────────────────────────────────────

const LOG_TAG_CONFIG = {
  scout:     { color: "#2979FF", bg: "rgba(41,121,255,0.10)", icon: "🔍" },
  brand:     { color: "#7C4DFF", bg: "rgba(124,77,255,0.10)",  icon: "🎯" },
  risk:      { color: "#FF6D00", bg: "rgba(255,109,0,0.10)",   icon: "🛡️" },
  negotiate: { color: "#FFB300", bg: "rgba(255,179,0,0.10)",   icon: "🤝" },
  price:     { color: "#00C853", bg: "rgba(0,200,83,0.10)",    icon: "💰" },
  import:    { color: "#AA00FF", bg: "rgba(170,0,255,0.10)",   icon: "🚀" },
  cost:      { color: "#00BFA5", bg: "rgba(0,191,165,0.10)",   icon: "📊" },
  system:    { color: "#78909C", bg: "rgba(120,144,156,0.08)", icon: "⚙️" },
  warn:      { color: "#FF5252", bg: "rgba(255,82,82,0.10)",   icon: "⚠️" },
  error:     { color: "#FF1744", bg: "rgba(255,23,68,0.12)",   icon: "❌" },
  ai:        { color: "#E040FB", bg: "rgba(224,64,251,0.10)",  icon: "🧠" },
};

export function LogTag({ tag, cls }) {
  const cfg = LOG_TAG_CONFIG[cls] || LOG_TAG_CONFIG[tag?.toLowerCase()] || LOG_TAG_CONFIG.system;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 3,
      fontSize: 9,
      fontWeight: 700,
      padding: "2px 7px",
      borderRadius: 4,
      marginRight: 6,
      background: cfg.bg,
      color: cfg.color,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      whiteSpace: "nowrap",
    }}>
      <span style={{ fontSize: 10 }}>{cfg.icon}</span>
      {tag}
    </span>
  );
}


// ─── LogMessage — styled message text with semantic coloring ─────────────────

const MSG_STYLES = {
  negotiate: { color: "#FFB300" },
  price:     { color: "#00C853" },
  import:    { color: "#AA00FF" },
  warn:      { color: "#FF5252", fontWeight: 600 },
  error:     { color: "#FF1744", fontWeight: 600 },
};

export function LogMessage({ msg, cls }) {
  const style = MSG_STYLES[cls] || {};
  // Highlight dollar amounts, percentages, and quoted names
  const parts = (msg || "").split(/(\$[\d,.]+|[\d.]+%|"[^"]*")/g);
  return (
    <span style={{ color: style.color || "var(--p-color-text)", fontWeight: style.fontWeight || 400 }}>
      {parts.map((part, i) => {
        if (/^\$[\d,.]+$/.test(part)) {
          return <span key={i} style={{ color: "#00C853", fontWeight: 600 }}>{part}</span>;
        }
        if (/^[\d.]+%$/.test(part)) {
          return <span key={i} style={{ color: "#FFB300", fontWeight: 600 }}>{part}</span>;
        }
        if (/^"[^"]*"$/.test(part)) {
          return <span key={i} style={{ color: "#82B1FF", fontStyle: "italic" }}>{part}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}


// ─── ProcessLog — full log panel with auto-scroll, filtering, stats ─────────

import { useRef, useEffect, useState, useMemo } from "react";

const LOG_FILTERS = [
  { key: "all",       label: "All" },
  { key: "scout",     label: "Scout" },
  { key: "negotiate", label: "Negotiate" },
  { key: "price",     label: "Price" },
  { key: "import",    label: "Import" },
  { key: "warn",      label: "Warnings" },
];

export function ProcessLog({ logLines = [], running = false, stepHistory = [], currentStep = "" }) {
  const scrollRef = useRef(null);
  const [filter, setFilter] = useState("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const prevCountRef = useRef(0);

  // Auto-scroll on new entries
  useEffect(() => {
    if (autoScroll && scrollRef.current && logLines.length > prevCountRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevCountRef.current = logLines.length;
  }, [logLines.length, autoScroll]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 30);
  };

  const filtered = useMemo(() => {
    if (filter === "all") return logLines;
    if (filter === "warn") return logLines.filter(l => l.cls === "warn" || l.cls === "error" || l.tag === "ERROR");
    return logLines.filter(l => l.cls === filter || l.tag?.toLowerCase() === filter);
  }, [logLines, filter]);

  // Count warnings/errors
  const warnCount = useMemo(
    () => logLines.filter(l => l.cls === "warn" || l.cls === "error" || l.tag === "ERROR").length,
    [logLines],
  );

  const maxHeight = expanded ? 500 : 260;

  return (
    <s-card>
      <s-box padding="400">
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <s-text variant="headingSm">Process Log</s-text>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 99,
            background: "var(--p-color-bg-fill-secondary)", color: "var(--p-color-text-secondary)",
          }}>
            {logLines.length}
          </span>
          {warnCount > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 99,
              background: "rgba(255,82,82,0.12)", color: "#FF5252",
              cursor: "pointer",
            }}
            role="button"
            tabIndex={0}
            onClick={() => setFilter(f => f === "warn" ? "all" : "warn")}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFilter(f => f === "warn" ? "all" : "warn"); } }}
            >
              {warnCount} warning{warnCount !== 1 ? "s" : ""}
            </span>
          )}
          {running && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              fontSize: 10, fontWeight: 600, color: "var(--p-color-text-success)",
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: "var(--p-color-bg-fill-success)",
                animation: "dp-log-pulse 1.5s ease-in-out infinite",
              }} />
              LIVE
            </span>
          )}
          <span style={{ flex: 1 }} />
          <button
            onClick={() => setAutoScroll(true)}
            title="Scroll to bottom"
            style={{
              background: autoScroll ? "var(--p-color-bg-fill-brand)" : "var(--p-color-bg-fill-secondary)",
              color: autoScroll ? "#fff" : "var(--p-color-text-secondary)",
              border: "none", borderRadius: 4, padding: "2px 6px", fontSize: 10,
              cursor: "pointer", fontWeight: 600,
            }}
          >
            Auto-scroll {autoScroll ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 13, color: "var(--p-color-text-secondary)", padding: "0 4px",
            }}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▲" : "▼"}
          </button>
        </div>

        {/* Step progress bar */}
        {stepHistory.length > 0 && (
          <div style={{
            display: "flex", gap: 2, marginBottom: 10, padding: "6px 8px",
            background: "var(--p-color-bg-surface-secondary)", borderRadius: 6,
          }}>
            {stepHistory.map((s, i) => (
              <div key={i} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}>
                <div style={{
                  width: "100%", height: 3, borderRadius: 2,
                  background: s.status === "COMPLETED" ? "#00C853"
                    : s.status === "SKIPPED" ? "#78909C"
                    : s.status === "FAILED" ? "#FF5252"
                    : s.status === "RUNNING" ? "#FFB300"
                    : "var(--p-color-border-subdued)",
                }} />
                <span style={{
                  fontSize: 8, fontWeight: 600, letterSpacing: "0.02em",
                  color: s.name === currentStep ? "var(--p-color-text)" : "var(--p-color-text-secondary)",
                  textTransform: "uppercase",
                }}>
                  {s.name.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 3, marginBottom: 8, flexWrap: "wrap" }}>
          {LOG_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "3px 10px", borderRadius: 99, fontSize: 10, fontWeight: 600,
                border: "1px solid",
                borderColor: filter === f.key ? "var(--p-color-border-emphasis)" : "var(--p-color-border)",
                background: filter === f.key ? "var(--p-color-bg-surface-selected)" : "transparent",
                color: filter === f.key ? "var(--p-color-text)" : "var(--p-color-text-secondary)",
                cursor: "pointer",
                transition: "all 120ms ease",
              }}
            >
              {f.label}
              {f.key !== "all" && (() => {
                const count = f.key === "warn"
                  ? warnCount
                  : logLines.filter(l => l.cls === f.key || l.tag?.toLowerCase() === f.key).length;
                return count > 0 ? ` (${count})` : "";
              })()}
            </button>
          ))}
        </div>

        {/* Log entries */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          style={{
            maxHeight,
            overflowY: "auto",
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontSize: 11,
            lineHeight: 1.7,
            scrollBehavior: "smooth",
            transition: "max-height 300ms ease",
          }}
        >
          {filtered.length === 0 ? (
            <div style={{
              padding: "32px 16px", textAlign: "center",
              color: "var(--p-color-text-secondary)", fontSize: 12,
            }}>
              {logLines.length === 0
                ? "Engine ready. Press Run Engine to begin."
                : `No ${filter} entries.`}
            </div>
          ) : (
            filtered.map((l, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 6,
                  padding: "3px 6px",
                  borderRadius: 4,
                  marginBottom: 1,
                  background: l.cls === "warn" || l.cls === "error"
                    ? "rgba(255,82,82,0.04)" : "transparent",
                  borderLeft: l.cls === "warn" || l.cls === "error"
                    ? "2px solid #FF5252"
                    : l.cls === "negotiate" ? "2px solid rgba(255,179,0,0.3)"
                    : "2px solid transparent",
                  transition: "background 150ms ease",
                }}
              >
                <span style={{
                  fontSize: 9, color: "var(--p-color-text-secondary)",
                  flexShrink: 0, minWidth: 56, fontVariantNumeric: "tabular-nums",
                  opacity: 0.7,
                }}>
                  {new Date(l.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <LogTag tag={l.tag} cls={l.cls} />
                <LogMessage msg={l.msg} cls={l.cls} />
              </div>
            ))
          )}
        </div>

        {/* Footer status */}
        {logLines.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            marginTop: 6, paddingTop: 6,
            borderTop: "1px solid var(--p-color-border-subdued)",
            fontSize: 10, color: "var(--p-color-text-secondary)",
          }}>
            <span>{logLines.length} entries</span>
            <span style={{ opacity: 0.4 }}>|</span>
            <span>Showing {filtered.length}{filter !== "all" ? ` (${filter})` : ""}</span>
            {!autoScroll && filtered.length > 5 && (
              <>
                <span style={{ opacity: 0.4 }}>|</span>
                <button
                  onClick={() => {
                    setAutoScroll(true);
                    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                  }}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--p-color-text-info)", fontSize: 10, padding: 0,
                  }}
                >
                  Jump to latest
                </button>
              </>
            )}
          </div>
        )}
      </s-box>

      {/* Pulse animation */}
      <style>{`
        @keyframes dp-log-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </s-card>
  );
}
