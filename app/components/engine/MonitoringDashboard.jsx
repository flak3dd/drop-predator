import PropTypes from "prop-types";
import { LifecycleBadge } from "../engine-ui";
import { fmt$ } from "../../lib/format";

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

MetricRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  total: PropTypes.number,
  suffix: PropTypes.string,
};

function StatusBadge({ running }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 12,
      background: running ? "var(--p-color-bg-fill-success)" : "var(--p-color-bg-surface-tertiary)",
      color: running ? "var(--p-color-text-success)" : "var(--p-color-text-secondary)",
    }}>
      {running ? "Running" : "Idle"}
    </span>
  );
}

StatusBadge.propTypes = {
  running: PropTypes.bool.isRequired,
};

export function MonitoringDashboard({ stats, products, running }) {
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
            }).filter(([, count]) => count > 0).map(([stage, count]) => (
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

MonitoringDashboard.propTypes = {
  stats: PropTypes.object.isRequired,
  products: PropTypes.array.isRequired,
  running: PropTypes.bool.isRequired,
};
