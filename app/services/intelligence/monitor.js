/**
 * app/services/intelligence/monitor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Market Intelligence Monitor — continuous background system.
 *
 * Runs on a cron schedule (api.cron.intelligence.jsx) to:
 *   1. Scan social platforms for trending products & sentiment signals
 *   2. Detect cross-platform signal correlation (Reddit + Trends + HN)
 *   3. Identify catalog gaps — trending products not in the store
 *   4. Score and rank opportunities by hype velocity
 *   5. Persist insights to DB for the Intelligence Dashboard
 *   6. Fire alerts when high-hype signals exceed thresholds
 *
 * Each shop gets its own scan cycle based on saved niche + keywords.
 * The monitor is stateless across invocations (serverless-safe).
 */

import prisma from '../../db.server.js';
import { fullSentimentScan } from './sentiment.js';
import { runDiscovery, crossNicheCorrelation } from './discovery.js';
import { getNicheConfig } from '../../data/products.js';

// ─── Alert thresholds ────────────────────────────────────────────────────────

const ALERT_THRESHOLDS = {
  viralHype:         80,   // Signal hype score to flag as "viral opportunity"
  trendVelocity:     25,   // Google Trends velocity for "breakout" alert
  crossPlatformMin:   3,   // Min sources for cross-platform correlation alert
  gapScore:          60,   // Catalog gap score to surface as opportunity
  sentimentFloor:   -0.3,  // Below this = negative sentiment alert
};

// ─── MarketMonitor class ─────────────────────────────────────────────────────

export class MarketMonitor {
  constructor(opts = {}) {
    this.thresholds = { ...ALERT_THRESHOLDS, ...opts.thresholds };
  }

  /**
   * Run a full monitoring cycle for a shop.
   * Called by the cron route on a schedule (e.g. every 30 min).
   *
   * @param {string} shop — Shopify shop domain
   * @returns {Promise<MonitorResult>}
   */
  async runCycle(shop) {
    const startTime = Date.now();
    const result = {
      shop,
      ts: new Date().toISOString(),
      signals: [],
      alerts: [],
      opportunities: [],
      crossPlatform: [],
      gaps: [],
      stats: { signalCount: 0, alertCount: 0, opportunityCount: 0, durationMs: 0 },
    };

    try {
      // Load shop's intelligence config
      const settings = await prisma.setting.findUnique({ where: { shop } });
      const config = settings?.engineConfig ? JSON.parse(settings.engineConfig) : {};
      const niche = config.niche || config.lastNiche || 'gym';
      const nicheConf = getNicheConfig(niche);

      const keywords = config.monitorKeywords || nicheConf.keywords || [niche];
      const subreddits = config.monitorSubreddits || nicheConf.redditSubs || [];

      // ── 1. Sentiment scan ──────────────────────────────────────────────
      const signals = await fullSentimentScan({
        subreddits,
        keywords,
        enableReddit: true,
        enableHN: true,
        enableTrends: true,
        enableTikTok: false,
        enableAiAnalysis: !!process.env.ANTHROPIC_API_KEY,
      });

      result.signals = signals;
      result.stats.signalCount = signals.length;

      // ── 2. Detect alerts from high-hype signals ────────────────────────
      for (const signal of signals) {
        if (signal.hypeScore >= this.thresholds.viralHype) {
          result.alerts.push({
            type: 'viral_signal',
            severity: 'high',
            signal: signal.id,
            title: `Viral signal detected: "${signal.title.slice(0, 80)}"`,
            detail: `Hype: ${signal.hypeScore}/100, Source: ${signal.source}, Sentiment: ${signal.sentiment}`,
            ts: new Date().toISOString(),
          });
        }

        if (signal.sentiment <= this.thresholds.sentimentFloor) {
          result.alerts.push({
            type: 'negative_sentiment',
            severity: 'medium',
            signal: signal.id,
            title: `Negative sentiment: "${signal.title.slice(0, 80)}"`,
            detail: `Sentiment: ${signal.sentiment}, Source: ${signal.source}`,
            ts: new Date().toISOString(),
          });
        }
      }

      // ── 3. Cross-platform correlation ──────────────────────────────────
      const crossPlatform = crossNicheCorrelation(signals);
      result.crossPlatform = crossPlatform;

      for (const corr of crossPlatform) {
        if (corr.sourceCount >= this.thresholds.crossPlatformMin) {
          result.alerts.push({
            type: 'cross_platform_trend',
            severity: 'high',
            title: `Cross-platform trend: "${corr.keyword}"`,
            detail: `Trending across ${corr.sources.join(', ')} — ${corr.signalCount} signals, avg hype ${corr.avgHype}`,
            ts: new Date().toISOString(),
          });
        }
      }

      // ── 4. Discovery + catalog gaps ────────────────────────────────────
      // Pull existing products from latest engine run for gap analysis
      const latestRun = await prisma.engineRun.findFirst({
        where: { shop },
        orderBy: { startedAt: 'desc' },
        include: { products: { select: { name: true } } },
      });
      const existingProducts = (latestRun?.products || []).map(p => ({ name: p.name }));

      if (signals.length > 5) {
        const disc = await runDiscovery(signals, niche, existingProducts, {
          enableAi: !!process.env.ANTHROPIC_API_KEY,
        });

        result.opportunities = disc.discoveries.map(d => ({
          name: d.name,
          category: d.category,
          demand: d.estimatedDemand,
          margin: d.estimatedMargin,
          risk: d.riskLevel,
          signalStrength: d.signalStrength,
          aiGenerated: d.aiGenerated,
        }));

        result.gaps = disc.gaps.filter(g => g.gapScore >= this.thresholds.gapScore);

        for (const opp of result.opportunities) {
          if (opp.signalStrength >= 70) {
            result.alerts.push({
              type: 'product_opportunity',
              severity: opp.demand === 'viral' ? 'critical' : 'medium',
              title: `Product opportunity: ${opp.name}`,
              detail: `Demand: ${opp.demand}, Est. margin: ${opp.margin}%, Signal strength: ${opp.signalStrength}`,
              ts: new Date().toISOString(),
            });
          }
        }
      }

      result.stats.alertCount = result.alerts.length;
      result.stats.opportunityCount = result.opportunities.length;

      // ── 5. Persist to DB ───────────────────────────────────────────────
      await this.persistInsights(shop, result);

    } catch (err) {
      result.alerts.push({
        type: 'monitor_error',
        severity: 'high',
        title: 'Intelligence monitor error',
        detail: err.message,
        ts: new Date().toISOString(),
      });
    }

    result.stats.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Persist intelligence insights to the Setting model's engineConfig.
   * Stores the latest scan result for the Intelligence Dashboard.
   */
  async persistInsights(shop, result) {
    try {
      const settings = await prisma.setting.findUnique({ where: { shop } });
      const config = settings?.engineConfig ? JSON.parse(settings.engineConfig) : {};

      // Store the latest intelligence report (keep it compact)
      config.latestIntelligence = {
        ts: result.ts,
        signalCount: result.stats.signalCount,
        alertCount: result.stats.alertCount,
        opportunityCount: result.stats.opportunityCount,
        topSignals: result.signals
          .sort((a, b) => b.hypeScore - a.hypeScore)
          .slice(0, 20)
          .map(s => ({
            id: s.id,
            source: s.source,
            keyword: s.keyword,
            title: s.title.slice(0, 120),
            hypeScore: s.hypeScore,
            sentiment: s.sentiment,
            url: s.url,
            ts: s.ts,
          })),
        alerts: result.alerts.slice(0, 20),
        opportunities: result.opportunities.slice(0, 10),
        crossPlatform: result.crossPlatform.slice(0, 10),
        gaps: result.gaps.slice(0, 10),
      };

      // Maintain a rolling history (last 24 entries)
      if (!config.intelligenceHistory) config.intelligenceHistory = [];
      config.intelligenceHistory.unshift({
        ts: result.ts,
        signals: result.stats.signalCount,
        alerts: result.stats.alertCount,
        opportunities: result.stats.opportunityCount,
        duration: result.stats.durationMs,
      });
      config.intelligenceHistory = config.intelligenceHistory.slice(0, 24);

      await prisma.setting.upsert({
        where: { shop },
        update: { engineConfig: JSON.stringify(config) },
        create: { shop, engineConfig: JSON.stringify(config) },
      });
    } catch (err) {
      console.error('[intelligence] Failed to persist insights:', err.message);
    }
  }

  /**
   * Get the latest intelligence data for a shop (from DB).
   * Used by the Intelligence Dashboard API.
   */
  async getLatest(shop) {
    const settings = await prisma.setting.findUnique({ where: { shop } });
    const config = settings?.engineConfig ? JSON.parse(settings.engineConfig) : {};
    return {
      latest: config.latestIntelligence || null,
      history: config.intelligenceHistory || [],
      monitorKeywords: config.monitorKeywords || [],
      monitorSubreddits: config.monitorSubreddits || [],
      niche: config.niche || config.lastNiche || 'gym',
    };
  }
}

/**
 * @typedef {Object} MonitorResult
 * @property {string}   shop
 * @property {string}   ts
 * @property {Array}    signals
 * @property {Array}    alerts
 * @property {Array}    opportunities
 * @property {Array}    crossPlatform
 * @property {Array}    gaps
 * @property {{ signalCount: number, alertCount: number, opportunityCount: number, durationMs: number }} stats
 */
