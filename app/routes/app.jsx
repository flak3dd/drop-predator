import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate, IS_DEV_BYPASS } from "../shopify.server";

export const loader = async ({ request }) => {
  if (!IS_DEV_BYPASS) {
    await authenticate.admin(request);
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", devBypass: IS_DEV_BYPASS };
};

export default function App() {
  const { apiKey, devBypass } = useLoaderData();

  // In dev bypass mode there is no Shopify Admin iframe, so App Bridge is not
  // initialised. Stub window.shopify before child routes call useAppBridge().
  if (devBypass && typeof window !== "undefined" && !window.shopify) {
    window.shopify = {
      toast: {
        show: (msg) =>
          console.log(`%c[Toast] ${msg}`, "color:#00b906;font-weight:bold"),
      },
      config: { apiKey: "" },
    };
  }

  return (
    <AppProvider embedded={!devBypass} apiKey={apiKey}>
      {devBypass && (
        <div style={{
          background: "#1a1a2e", color: "#f0a500", fontSize: 11, fontFamily: "monospace",
          padding: "6px 16px", borderBottom: "1px solid #f0a50044",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span>⚡ DEV BYPASS</span>
          <span style={{ opacity: 0.6 }}>— auth skipped · shop: y01186-25.myshopify.com</span>
        </div>
      )}
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/drops">Drops</s-link>
        <s-link href="/app/engine">Engine</s-link>
        <s-link href="/app/pilot">AI Pilot</s-link>
        <s-link href="/app/settings">Settings</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
