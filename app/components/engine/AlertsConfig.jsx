import { ConfigSlider, ConfigToggle } from "../engine-ui";

export function AlertsConfig({ alerts, setAlerts }) {
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

