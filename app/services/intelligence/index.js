/**
 * app/services/intelligence/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Market Intelligence Module — public API.
 *
 * AI-operated continuous system for:
 *   • Real-time sentiment analysis (Reddit, HN, Google Trends, TikTok)
 *   • Product discovery from social signals
 *   • Brand research & SEO keyword optimization
 *   • Trend velocity monitoring with alert thresholds
 *   • Background market scanning (cron-driven)
 *
 * Usage:
 *   import { intelligence } from '../services/intelligence/index.js';
 *   const report = await intelligence.scan(shop, { niche: 'gym', keywords: [...] });
 *   const trends = await intelligence.getTrends(shop);
 */

import { fullSentimentScan, quickSentiment, computeHypeScore } from './sentiment.js';
import { runDiscovery, extractProductMentions, crossNicheCorrelation } from './discovery.js';
import {
  enrichWithBrandResearch,
  isBrandResearchAvailable,
  getKeywords,
  getOptimizedTitles,
  analyzeProducts,
} from './brand-research.js';
// NOTE: MarketMonitor lives in monitor.server.js (imports db.server.js).
// It cannot be imported here — even dynamically — because React Router's Vite
// plugin forbids .server.js references from non-.server modules.
// Callers needing getMonitor() should import from './monitor.server.js' directly.

// ─── Convenience facade ─────────────────────────────────────────────────────

export const intelligence = {
  /**
   * Run a full market intelligence scan for a shop/niche.
   * Combines sentiment analysis, product discovery, and brand research.
   */
  async scan(shop, config = {}, onProgress) {
    const {
      niche = 'gym',
      keywords = [],
      subreddits = [],
      enableReddit = true,
      enableHN = true,
      enableTrends = true,
      enableTikTok = false,
      enableInstagram = false,
      enableAiAnalysis = true,
      enableDiscovery = true,
      enableBrandResearch = true,
      existingProducts = [],
      instagramHashtags = [],
    } = config;

    const result = {
      signals: [],
      discoveries: [],
      crossNiche: [],
      gaps: [],
      brandResearch: null,
      scannedAt: new Date().toISOString(),
      niche,
    };

    // 1. Sentiment scan
    result.signals = await fullSentimentScan({
      subreddits,
      keywords,
      enableReddit,
      enableHN,
      enableTrends,
      enableTikTok,
      enableInstagram,
      instagramHashtags,
      enableAiAnalysis: enableAiAnalysis && !!process.env.ANTHROPIC_API_KEY,
    }, onProgress);

    // 2. Product discovery from signals
    if (enableDiscovery && result.signals.length > 0) {
      const disc = await runDiscovery(
        result.signals,
        niche,
        existingProducts,
        { enableAi: !!process.env.ANTHROPIC_API_KEY },
      );
      result.discoveries = disc.discoveries;
      result.crossNiche = disc.crossNiche;
      result.gaps = disc.gaps;
    }

    // 3. Brand research enrichment
    if (enableBrandResearch && existingProducts.length > 0) {
      const available = await isBrandResearchAvailable();
      if (available) {
        try {
          result.brandResearch = await analyzeProducts(niche, existingProducts);
        } catch { /* non-fatal */ }
      }
    }

    return result;
  },

  /**
   * Quick sentiment check on a single text string.
   * Returns a value from -1.0 (negative) to 1.0 (positive).
   */
  quickSentiment,

  /**
   * Compute a hype score (0-100) for a signal object.
   */
  computeHypeScore,

  /**
   * Extract product mentions from social signals.
   */
  extractProductMentions,

  /**
   * Find topics trending across multiple sources.
   */
  crossNicheCorrelation,

  /**
   * Check if the Brand Research Python service is running.
   */
  isBrandResearchAvailable,

  /**
   * SEO keyword research for a niche + product set.
   */
  getKeywords,

  /**
   * AI-optimized product titles for SEO.
   */
  getOptimizedTitles,

  /**
   * Full brand analysis (keywords + titles + market insights).
   */
  analyzeProducts,

  /**
   * Enrich products with SEO titles from brand research.
   */
  enrichWithBrandResearch,
};

// Re-export everything for granular imports
// (MarketMonitor omitted — use getMonitor() or import monitor.server.js directly)
export {
  fullSentimentScan,
  quickSentiment,
  computeHypeScore,
  runDiscovery,
  extractProductMentions,
  crossNicheCorrelation,
  enrichWithBrandResearch,
  isBrandResearchAvailable,
  getKeywords,
  getOptimizedTitles,
  analyzeProducts,
};
