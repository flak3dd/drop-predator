/**
 * app/services/shopify/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Shopify API Management Module — public API.
 *
 * Centralizes all Shopify store interactions:
 *   • Product listings — create, import, publish, SEO optimization
 *   • Dynamic pricing — competitor benchmarking, surge/undercut/psych modes
 *   • AliExpress fulfillment — DS orders, tracking, credential management
 *   • Listing generation — AI-powered descriptions, bullet points, tags
 *
 * Usage:
 *   import { shopifyAPI } from '../services/shopify/index.js';
 *   const listing = await shopifyAPI.generateListing(product, niche, admin);
 *   const price = shopifyAPI.getActivePrice(product);
 */

import { importListings } from './importer.js';
import { generateListing, generateFallbackListing } from './listing-generator.js';
import {
  getActivePrice,
  computePricingWithCompetitors,
  computePricing,
} from './pricing.js';
import { getCompetitorIntel } from './competitor-price.js';
import {
  getDsProductDetails,
  getDsFreight,
  createDsOrder,
  getDsOrder,
  getDsTracking,
  getOAuthUrl,
  exchangeOAuthCode,
  refreshOAuthToken,
} from './aliexpress-ds.js';
import { getShopCredential } from './ali-credentials.js';

// ─── Convenience facade ─────────────────────────────────────────────────────

export const shopifyAPI = {
  // Product management
  importListings,
  generateListing,
  generateFallbackListing,

  // Pricing
  getActivePrice,
  computePricingWithCompetitors,
  computePricing,
  getCompetitorIntel,

  // AliExpress fulfillment
  getDsProductDetails,
  getDsFreight,
  createDsOrder,
  getDsOrder,
  getDsTracking,
  getOAuthUrl,
  exchangeOAuthCode,
  refreshOAuthToken,
  getShopCredential,
};

// Re-export everything for granular imports
export {
  importListings,
  generateListing,
  generateFallbackListing,
  getActivePrice,
  computePricingWithCompetitors,
  computePricing,
  getCompetitorIntel,
  getDsProductDetails,
  getDsFreight,
  createDsOrder,
  getDsOrder,
  getDsTracking,
  getOAuthUrl,
  exchangeOAuthCode,
  refreshOAuthToken,
  getShopCredential,
};
