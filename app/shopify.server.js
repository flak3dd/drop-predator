import "@shopify/shopify-app-react-router/adapters/node";
import "dotenv/config";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October25,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

// ─── Dev bypass ──────────────────────────────────────────────────────────────
// Set DEV_BYPASS_AUTH=true in .env to skip Shopify OAuth when running locally.
// This lets you preview all /app/* routes in the Vite dev server without a
// real Shopify Admin session. NEVER ship this to production.

// eslint-disable-next-line no-undef
const DEV_BYPASS = process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production";

const DEV_SESSION = {
  shop: "y01186-25.myshopify.com",
  accessToken: "dev-bypass-token",
  id: "offline_y01186-25.myshopify.com",
};

const DEV_ADMIN = {
  graphql: async () => ({
    json: async () => ({ data: {} }),
  }),
};

const devAuthenticateAdmin = async () => ({
  session: DEV_SESSION,
  admin: DEV_ADMIN,
  cors: (response) => response,
});

export default shopify;
export const apiVersion = ApiVersion.October25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = DEV_BYPASS
  ? { ...shopify.authenticate, admin: devAuthenticateAdmin }
  : shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
export const IS_DEV_BYPASS = DEV_BYPASS;
