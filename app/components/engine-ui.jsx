/**
 * app/components/engine-ui.jsx
 * ---------------------------------------------------------
 * Shared UI components used by both the Engine page
 * and the AI Pilot page. Extracted from app.engine.jsx
 * for reuse across the app.
 */

import PropTypes from "prop-types";

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

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  color: PropTypes.oneOf(["info", "success", "warning", "critical"]),
};

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

ConfigSlider.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number.isRequired,
  suffix: PropTypes.string,
  onChange: PropTypes.func.isRequired,
};

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

ConfigToggle.propTypes = {
  label: PropTypes.string.isRequired,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
};

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

DetailTable.propTypes = {
  rows: PropTypes.arrayOf(PropTypes.array).isRequired,
};

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

LifecycleBadge.propTypes = {
  lifecycle: PropTypes.string.isRequired,
};

// ─── LogTag ─────────────────────────────────────────────────────────────────

const LOG_TAG_COLORS = {
  scout: "var(--p-color-text-info)",
  negotiate: "var(--p-color-text-caution)",
  price: "var(--p-color-text-success)",
  import: "var(--p-color-text-brand)",
  system: "var(--p-color-text-secondary)",
  warn: "var(--p-color-text-critical)",
  error: "var(--p-color-text-critical)",
  ai: "var(--p-color-text-magic)",
};

export function LogTag({ tag, cls }) {
  const color = LOG_TAG_COLORS[cls] || LOG_TAG_COLORS[tag?.toLowerCase()] || "var(--p-color-text-secondary)";
  return (
    <span style={{
      fontSize: 9,
      fontWeight: 700,
      padding: "1px 5px",
      borderRadius: 4,
      marginRight: 6,
      background: "var(--p-color-bg-surface-secondary)",
      color,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
    }}>
      {tag}
    </span>
  );
}

LogTag.propTypes = {
  tag: PropTypes.string.isRequired,
  cls: PropTypes.string,
};
