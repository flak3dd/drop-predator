import PropTypes from "prop-types";
import { ConfigSlider, ConfigToggle } from "../engine-ui";

export function SchedulingConfig({ scheduling, setScheduling }) {
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

SchedulingConfig.propTypes = {
  scheduling: PropTypes.object.isRequired,
  setScheduling: PropTypes.func.isRequired,
};
