import { Outlet, useLoaderData, useRouteError, useLocation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate, IS_DEV_BYPASS } from "../shopify.server";
import logoUrl from "../assets/ccreids_logo_modern.svg";

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
          console.log(`%c[Toast] ${msg}`, "color:#5B4FE0;font-weight:bold"),
      },
      config: { apiKey: "" },
    };
  }

  return (
    <AppProvider embedded={!devBypass} apiKey={apiKey}>
      {devBypass ? (
        <DevNav />
      ) : (
        <s-app-nav>
          <s-link href="/app">Dashboard</s-link>
          <s-link href="/app/drops">Drops</s-link>
          <s-link href="/app/engine">Engine</s-link>
          <s-link href="/app/intelligence">Intelligence</s-link>
          <s-link href="/app/pilot">AI Pilot</s-link>
          <s-link href="/app/pipeline">Profit Pipeline</s-link>
          <s-link href="/app/settings">Settings</s-link>
        </s-app-nav>
      )}
      <Outlet />
    </AppProvider>
  );
}

/* ── Dev-bypass navigation bar ─────────────────────────────────────────────── */

const NAV_LINKS = [
  { href: "/app",          label: "Dashboard" },
  { href: "/app/drops",    label: "Drops" },
  { href: "/app/engine",       label: "Engine" },
  { href: "/app/intelligence", label: "Intelligence" },
  { href: "/app/pilot",        label: "AI Pilot" },
  { href: "/app/pipeline",    label: "Profit Pipeline" },
  { href: "/app/settings", label: "Settings" },
];

function DevNav() {
  const location = useLocation();
  return (
    <nav className="dp-dev-nav">
      {/* Brand: logo + wordmark */}
      <a href="/app" className="dp-dev-nav__logo-wrap">
        <img src={logoUrl} alt="CCREIDS" className="dp-dev-nav__logo-img" />
        <span className="dp-dev-nav__wordmark">Drop Predator</span>
      </a>

      <span className="dp-dev-nav__divider" />

      {/* Nav links */}
      {NAV_LINKS.map(({ href, label }) => {
        const active =
          location.pathname === href ||
          (href !== "/app" && location.pathname.startsWith(href));
        return (
          <a
            key={href}
            href={href}
            className={`dp-dev-nav__link${active ? " dp-dev-nav__link--active" : ""}`}
          >
            {label}
          </a>
        );
      })}

      <span className="dp-dev-nav__spacer" />

      {/* Environment badge */}
      <span className="dp-dev-nav__env">DEV · ccreids.myshopify.com</span>
    </nav>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
