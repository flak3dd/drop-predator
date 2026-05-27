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

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeParseJson(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

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
      const config = safeParseJson(settings?.engineConfig);
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
        enableTikTok:    config.enableTikTok || false,
        enableInstagram: config.enableInstagram || false,
        instagramHashtags: nicheConf.instagramHashtags || [],
        enableAiAnalysis: !!process.env.ANTHROPIC_API_KEY,
      });

      // Store niche for persistence
      result.niche = niche;

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

    } catch (err) {
      result.alerts.push({
        type: 'monitor_error',
        severity: 'high',
        title: 'Intelligence monitor error',
        detail: err.message,
        ts: new Date().toISOString(),
      });
      result.stats.alertCount = result.alerts.length;
      result.stats.opportunityCount = result.opportunities.length;
    }

    // Compute duration before persisting so stored history has accurate timing
    result.stats.durationMs = Date.now() - startTime;

    // ── 5. Persist to DB (always, even on error — stores the error alert) ──
    await this.persistInsights(shop, result);

    return result;
  }

  /**
   * Persist intelligence insights to the IntelligenceScan + IntelligenceSignal tables.
   * Creates a scan record and batch-inserts top signals.
   */
  async persistInsights(shop, result) {
    try {
      const niche = result.niche || 'gym';

      // Create the scan record
      const scan = await prisma.intelligenceScan.create({
        data: {
          shop,
          niche,
          trigger:          result.trigger || 'cron',
          status:           result.stats.alertCount >= 0 ? 'COMPLETED' : 'FAILED',
          signalCount:      result.stats.signalCount,
          alertCount:       result.stats.alertCount,
          opportunityCount: result.stats.opportunityCount,
          durationMs:       result.stats.durationMs,
          alerts:           JSON.stringify(result.alerts.slice(0, 20)),
          opportunities:    JSON.stringify(result.opportunities.slice(0, 10)),
          crossPlatform:    JSON.stringify(result.crossPlatform.slice(0, 10)),
          gaps:             JSON.stringify(result.gaps.slice(0, 10)),
          completedAt:      new Date(),
        },
      });

      // Batch insert top 50 signals
      const topSignals = result.signals
        .sort((a, b) => b.hypeScore - a.hypeScore)
        .slice(0, 50);

      if (topSignals.length > 0) {
        await prisma.intelligenceSignal.createMany({
          data: topSignals.map(s => ({
            shop,
            scanId:     scan.id,
            source:     s.source,
            keyword:    s.keyword || '',
            title:      (s.title || '').slice(0, 500),
            body:       (s.body || '').slice(0, 1000),
            url:        (s.url || '').slice(0, 500),
            hypeScore:  s.hypeScore || 0,
            sentiment:  s.sentiment || 0,
            engagement: (s.score || 0) + (s.comments || 0) * 2,
            intentScore: s.intentScore || 0,
            aiAnalyzed: !!s._aiAnalyzed,
            raw:        JSON.stringify(s.raw || {}),
            signalTs:   new Date(s.ts || Date.now()),
          })),
        });
      }

      // Auto-prune: keep only the latest 100 scans per shop
      const oldScans = await prisma.intelligenceScan.findMany({
        where: { shop },
        orderBy: { createdAt: 'desc' },
        skip: 100,
        select: { id: true },
      });

      if (oldScans.length > 0) {
        await prisma.intelligenceScan.deleteMany({
          where: { id: { in: oldScans.map(s => s.id) } },
        });
      }
    } catch (err) {
      console.error('[intelligence] Failed to persist insights:', err.message);
    }
  }

  /**
   * Get the latest intelligence data for a shop (from DB).
   * Queries IntelligenceScan + IntelligenceSignal tables.
   * Used by the Intelligence Dashboard API.
   */
  async getLatest(shop) {
    // Get shop config for niche/keywords settings
    const settings = await prisma.setting.findUnique({ where: { shop } });
    const config = safeParseJson(settings?.engineConfig);

    // Latest scan with its signals
    const latestScan = await prisma.intelligenceScan.findFirst({
      where: { shop },
      orderBy: { createdAt: 'desc' },
      include: {
        signals: {
          orderBy: { hypeScore: 'desc' },
          take: 20,
        },
      },
    });

    // Scan history (last 24 scans)
    const history = await prisma.intelligenceScan.findMany({
      where: { shop },
      orderBy: { createdAt: 'desc' },
      take: 24,
      select: {
        id: true,
        createdAt: true,
        signalCount: true,
        alertCount: true,
        opportunityCount: true,
        durationMs: true,
        niche: true,
        trigger: true,
        status: true,
      },
    });

    // Format the latest scan into the shape the UI expects
    let latest = null;
    if (latestScan) {
      latest = {
        ts: latestScan.createdAt.toISOString(),
        signalCount: latestScan.signalCount,
        alertCount: latestScan.alertCount,
        opportunityCount: latestScan.opportunityCount,
        topSignals: latestScan.signals.map(s => ({
          id: s.id,
          source: s.source,
          keyword: s.keyword,
          title: s.title,
          body: s.body,
          hypeScore: s.hypeScore,
          sentiment: s.sentiment,
          engagement: s.engagement,
          intentScore: s.intentScore,
          url: s.url,
          ts: s.signalTs.getTime(),
          aiAnalyzed: s.aiAnalyzed,
        })),
        alerts: safeParseJson(latestScan.alerts) || [],
        opportunities: safeParseJson(latestScan.opportunities) || [],
        crossPlatform: safeParseJson(latestScan.crossPlatform) || [],
        gaps: safeParseJson(latestScan.gaps) || [],
      };
    }

    return {
      latest,
      history: history.map(h => ({
        ts: h.createdAt.toISOString(),
        signals: h.signalCount,
        alerts: h.alertCount,
        opportunities: h.opportunityCount,
        duration: h.durationMs,
        niche: h.niche,
        trigger: h.trigger,
        status: h.status,
      })),
      monitorKeywords: config.monitorKeywords || [],
      monitorSubreddits: config.monitorSubreddits || [],
      niche: config.niche || config.lastNiche || 'gym',
    };
  }
}

// ─── Singleton accessor ─────────────────────────────────────────────────────

let _monitor = null;

/** Get or create the market monitor singleton. */
export function getMonitor() {
  if (!_monitor) _monitor = new MarketMonitor();
  return _monitor;
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
