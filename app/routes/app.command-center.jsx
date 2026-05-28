/**
 * app/routes/app.command-center.jsx
 * ---------------------------------------------------------
 * COMMAND CENTER — unified automation hub combining:
 *   - Profit Pipeline (end-to-end profit maximization)
 *   - Engine (product lifecycle management)
 *   - AI Pilot (natural-language agent orchestrator)
 *
 * Single page with top-level tab navigation.
 */

import { useState } from "react";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PipelineTab } from "../components/command-center/PipelineTab";
import { EngineTab } from "../components/command-center/EngineTab";
import { PilotTab } from "../components/command-center/PilotTab";

// ─── Server exports ──────────────────────────────────────────────────────────

export const headers = (headersArgs) => boundary.headers(headersArgs);

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const settings = await prisma.setting.findUnique({ where: { shop: session.shop } });
  const savedConfig = settings?.engineConfig ? JSON.parse(settings.engineConfig) : null;
  return { savedConfig };
};

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS = [
  { id: "pipeline", label: "Profit Pipeline", icon: "\u{1F680}", desc: "End-to-end profit maximization" },
  { id: "engine",   label: "Engine",          icon: "⚙️",          desc: "Product lifecycle automation" },
  { id: "pilot",    label: "AI Pilot",        icon: "\u{1F916}", desc: "Natural-language automation" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function CommandCenterPage() {
  const { savedConfig } = useLoaderData();
  const [activeTab, setActiveTab] = useState("pipeline");

  return (
    <s-page title="Command Center" subtitle="Unified automation hub">
      {/* Shared animations */}
      <style>{`
        @keyframes cc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes cc-fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Top-level tab navigation */}
      <s-box padding="400" background="bg-surface-secondary" borderRadius="300" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 16px",
                borderRadius: 10,
                cursor: "pointer",
                border: activeTab === tab.id
                  ? "2px solid var(--p-color-border-emphasis)"
                  : "2px solid transparent",
                background: activeTab === tab.id
                  ? "var(--p-color-bg-surface)"
                  : "transparent",
                fontFamily: "inherit",
                color: "var(--p-color-text)",
                transition: "all 0.2s ease",
                boxShadow: activeTab === tab.id
                  ? "0 2px 8px rgba(0,0,0,0.08)"
                  : "none",
              }}
            >
              <span style={{ fontSize: 22 }}>{tab.icon}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: activeTab === tab.id ? "var(--p-color-text)" : "var(--p-color-text-secondary)",
                }}>
                  {tab.label}
                </div>
                <div style={{ fontSize: 10, color: "var(--p-color-text-secondary)", marginTop: 1 }}>
                  {tab.desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      </s-box>

      {/* Tab content */}
      {activeTab === "pipeline" && <PipelineTab />}
      {activeTab === "engine" && <EngineTab savedConfig={savedConfig} />}
      {activeTab === "pilot" && <PilotTab />}
    </s-page>
  );
}
