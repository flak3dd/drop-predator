/**
 * app/services/pipeline/profit-pipeline.js
 * ─────────────────────────────────────────────────────────────────────────────
 * PROFIT MAXIMIZATION PIPELINE
 *
 * Unified end-to-end pipeline that chains every subsystem into a single
 * autonomous profit engine:
 *
 *   Phase 1 — DISCOVER    Market intelligence scan → trending niches & demand signals
 *                          Sources: Reddit, HN, Google Trends, TikTok, Instagram, YouTube, Pinterest, Twitter
 *   Phase 2 — SOURCE      Multi-pathway product sourcing → supplier APIs + Google + Trends + AI + Amazon
 *   Phase 3 — VALIDATE    Sentiment analysis + competitor pricing → filter for profit potential
 *   Phase 4 — OPTIMIZE    AI listing generation + dynamic pricing → conversion + margin maximization
 *   Phase 5 — LAUNCH      Auto-import to Shopify → live in store
 *   Phase 6 — ENHANCE     Media agent → source + attach images
 *   Phase 7 — REPORT      Revenue projections + action items
 *
 * Emits NDJSON events for real-time UI streaming.
 */

import { fullSentimentScan, computeHypeScore, crossNicheCorrelation, extractProductMentions } from '../intelligence/index.js';
import { runDiscovery } from '../intelligence/discovery.js';
import { scorePurchaseIntent, computeProductIntent } from '../intelligence/intent-scorer.js';
import { analyzeAdCompetition, adCompetitionMultiplier } from '../intelligence/ad-competition.js';
import { fetchLiveProducts } from '../engine/live-catalog.js';
import { computePricingWithCompetitors, getActivePrice } from '../shopify/pricing.js';
import { generateListing } from '../shopify/listing-generator.js';
import { importListings } from '../shopify/importer.js';
import { getNicheConfig } from '../../data/products.js';

// ─── Main pipeline ────────────────────────────────────────────────────────

/**
 * Run the full profit-maximization pipeline.
 *
 * @param {object} params
 * @param {string} params.niche - Target niche (e.g., 'gym', 'tech', 'beauty')
 * @param {object} params.admin - Shopify admin GraphQL client
 * @param {string} params.shop - Shop domain
 * @param {object} [params.config] - Optional overrides
 * @param {function} params.emit - NDJSON event emitter
 * @returns {object} Pipeline results summary
 */
export async function runProfitPipeline({ niche, admin, shop, config = {}, emit }) {
  const startTime = Date.now();
  const nicheConf = getNicheConfig(niche);
  const keywords = nicheConf.keywords || [niche];

  const {
    scoreThreshold = 55,
    marginFloor = 30,
    moqMax = 100,
    surgeEnabled = true,
    autoImport = true,
    autoMedia = true,
    maxProducts = 15,
    listingTierOverride = null,   // 'smart' | 'fast' | 'template' | null (auto)
  } = config;

  const stats = {
    signalsFound: 0,
    productsSourced: 0,
    productsFiltered: 0,
    productsImported: 0,
    imagesAttached: 0,
    avgMargin: 0,
    projectedMonthlyRevenue: 0,
    projectedMonthlyProfit: 0,
    bestProduct: null,
    pricingModes: {},
    aiSpendEstimate: 0,
    phases: {},
  };

  try {
    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 1 — DISCOVER: Market Intelligence                       ║
    // ╚══════════════════════════════════════════════════════════════════╝
    const phase1Start = Date.now();
    emit('phase', 'phase-start', 'Phase 1/7 — DISCOVER: Market Intelligence', { phase: 1 });
    emit('tool', 'tag-tool', `intelligence_scan → scanning Reddit, HN, Google Trends for "${niche}"`);

    let signals = [];
    try {
      signals = await fullSentimentScan({
        subreddits: nicheConf.redditSubs || [],
        keywords,
        enableReddit:    config.enableReddit !== false,
        enableHN:        config.enableHN !== false,
        enableTrends:    config.enableTrends !== false,
        enableTikTok:    config.enableTikTok || false,
        enableInstagram: config.enableInstagram || false,
        enableYouTube:   config.enableYouTube || false,
        enablePinterest: config.enablePinterest || false,
        enableTwitter:   config.enableTwitter || false,
        instagramHashtags: nicheConf.instagramHashtags || [],
        enableAiAnalysis: !!process.env.ANTHROPIC_API_KEY,
      }, (progress) => {
        if (progress?.source) {
          emit('agent', 'tag-agent', `Scanning ${progress.source}... ${progress.count || 0} signals`);
        }
      });

      for (const s of signals) s.hypeScore = computeHypeScore(s);
      signals.sort((a, b) => b.hypeScore - a.hypeScore);
      stats.signalsFound = signals.length;

      emit('agent', 'tag-agent', `Found ${signals.length} market signals across platforms`);

      // Extract cross-platform trends
      const crossPlatform = crossNicheCorrelation(signals);
      if (crossPlatform.length > 0) {
        emit('agent', 'tag-agent', `${crossPlatform.length} cross-platform trends detected`);
        for (const cp of crossPlatform.slice(0, 3)) {
          emit('info', 'tag-tool', `Trending: "${cp.keyword}" — ${cp.sourceCount} platforms, hype: ${cp.avgHype}`);
        }
      }

      // Sentiment summary
      const posCount = signals.filter(s => s.sentiment > 0.1).length;
      const negCount = signals.filter(s => s.sentiment < -0.1).length;
      const posPercent = signals.length > 0 ? Math.round((posCount / signals.length) * 100) : 0;
      emit('agent', 'tag-agent', `Market sentiment: ${posPercent}% positive, ${signals.length - posCount - negCount} neutral, ${negCount} negative`);

    } catch (err) {
      emit('warn', 'tag-warn', `Intelligence scan partial failure: ${err.message}`);
    }

    stats.phases.discover = Date.now() - phase1Start;
    emit('sys', 'tag-sys', `Phase 1 complete — ${signals.length} signals in ${((Date.now() - phase1Start) / 1000).toFixed(1)}s`);

    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 2 — SOURCE: Multi-Pathway Product Sourcing              ║
    // ╚══════════════════════════════════════════════════════════════════╝
    const phase2Start = Date.now();
    emit('phase', 'phase-start', 'Phase 2/7 — SOURCE: Product Sourcing', { phase: 2 });
    emit('tool', 'tag-tool', `product_source → supplier APIs + Google Shopping + Trend Sourcing + AI Research`);

    let products = [];
    try {
      products = await fetchLiveProducts(niche, { enableDiscovery: true }, (msg) => {
        emit('agent', 'tag-agent', msg);
      });
      stats.productsSourced = products.length;
      emit('agent', 'tag-agent', `Sourced ${products.length} products across all pathways`);

      // Log source breakdown
      const sourceCount = {};
      for (const p of products) {
        for (const s of (p.sources || [])) {
          sourceCount[s] = (sourceCount[s] || 0) + 1;
        }
      }
      const breakdown = Object.entries(sourceCount).map(([k, v]) => `${k}: ${v}`).join(', ');
      if (breakdown) {
        emit('info', 'tag-tool', `Source breakdown: ${breakdown}`);
      }

    } catch (err) {
      emit('err', 'tag-err', `Product sourcing failed: ${err.message}`);
      throw new Error(`Cannot proceed — no products sourced: ${err.message}`);
    }

    stats.phases.source = Date.now() - phase2Start;
    emit('sys', 'tag-sys', `Phase 2 complete — ${products.length} products in ${((Date.now() - phase2Start) / 1000).toFixed(1)}s`);

    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 3 — VALIDATE: Filter for Profit Potential               ║
    // ╚══════════════════════════════════════════════════════════════════╝
    const phase3Start = Date.now();
    emit('phase', 'phase-start', 'Phase 3/7 — VALIDATE: Profit Filtering', { phase: 3 });
    emit('tool', 'tag-tool', `profit_filter → score ≥ ${scoreThreshold}, margin ≥ ${marginFloor}%, MOQ ≤ ${moqMax}`);

    // Score-based filtering
    const validated = products
      .filter(p => p.score >= scoreThreshold && p.margin >= marginFloor && p.moq <= moqMax)
      .sort((a, b) => {
        // Profit-first sorting: margin * velocity = projected profit contribution
        const profitA = (a.margin / 100) * a.price * (a.velocity || 1);
        const profitB = (b.margin / 100) * b.price * (b.velocity || 1);
        return profitB - profitA;
      })
      .slice(0, maxProducts);

    const rejected = products.length - validated.length;
    stats.productsFiltered = validated.length;

    emit('agent', 'tag-agent', `${validated.length} products passed profit validation (${rejected} rejected)`);

    if (validated.length === 0) {
      emit('warn', 'tag-warn', 'No products passed filters — try lowering scoreThreshold or marginFloor');
      emit('results', 'tag-sys', 'Pipeline aborted — no profitable products', { stats });
      return { stats, products: [], validated: [] };
    }

    // Log top picks
    for (const p of validated.slice(0, 5)) {
      const profitPerUnit = (p.margin / 100 * p.price).toFixed(2);
      emit('info', 'tag-tool',
        `✓ "${p.name}" — score: ${p.score}, margin: ${p.margin}%, profit/unit: $${profitPerUnit}, velocity: ${p.velocity}/mo`);
    }

    // ── Phase 3B: Purchase Intent Scoring ──────────────────────────────────
    if (signals.length > 0) {
      emit('tool', 'tag-tool', 'intent_scorer → computing purchase intent from social signals');

      for (const p of validated) {
        const intent = computeProductIntent(p, signals);
        p.intentScore = intent.intentScore;
        p.intentSignals = intent.intentSignals;
        p.intentBreakdown = intent.intentBreakdown;
      }

      const highIntent = validated.filter(p => p.intentScore > 65).length;
      if (highIntent > 0) {
        emit('agent', 'tag-agent', `${highIntent} products have high purchase intent (>65)`);
      }

      // Blend intent into sort order if threshold is configured
      const intentThreshold = config.intentThreshold || 0;
      if (intentThreshold > 0) {
        const preFilter = validated.length;
        const removed = [];
        for (let i = validated.length - 1; i >= 0; i--) {
          if (validated[i].intentScore < intentThreshold && validated[i].intentScore > 0) {
            removed.push(validated.splice(i, 1)[0]);
          }
        }
        if (removed.length > 0) {
          emit('info', 'tag-tool', `Intent filter: removed ${removed.length} products below threshold ${intentThreshold}`);
        }
      }

      // Re-sort blending profit + intent
      validated.sort((a, b) => {
        const profitA = (a.margin / 100) * a.price * (a.velocity || 1);
        const profitB = (b.margin / 100) * b.price * (b.velocity || 1);
        const intentBoostA = (a.intentScore || 0) / 100;
        const intentBoostB = (b.intentScore || 0) / 100;
        const scoreA = profitA * 0.7 + intentBoostA * profitA * 0.3;
        const scoreB = profitB * 0.7 + intentBoostB * profitB * 0.3;
        return scoreB - scoreA;
      });
    }

    // ── Phase 3C: Ad Competition Analysis ────────────────────────────────
    if (process.env.SERPAPI_KEY && validated.length > 0) {
      emit('tool', 'tag-tool', `ad_competition → checking ad density for top ${Math.min(8, validated.length)} products`);

      for (const p of validated.slice(0, 8)) {
        try {
          const adResult = await analyzeAdCompetition(p.name, p.cat);
          const multiplier = adCompetitionMultiplier(adResult);
          p.adCompetition = adResult;
          p.score = Math.round(p.score * multiplier);

          if (adResult.risk === 'high' || adResult.risk === 'extreme') {
            p.warnings = [...(p.warnings || p.warns || []), `ad competition: ${adResult.adDensity}`];
            emit('warn', 'tag-warn', `"${p.name}" — ${adResult.adDensity} ad market (${adResult.bigBrandCount} big brands)`);
          } else if (adResult.risk === 'low') {
            emit('agent', 'tag-agent', `"${p.name}" — low ad competition (opportunity)`);
          }
        } catch { /* non-fatal */ }
      }
    }

    stats.phases.validate = Date.now() - phase3Start;
    emit('sys', 'tag-sys', `Phase 3 complete — ${validated.length} profitable products in ${((Date.now() - phase3Start) / 1000).toFixed(1)}s`);

    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 4 — OPTIMIZE: AI Listings + Dynamic Pricing             ║
    // ╚══════════════════════════════════════════════════════════════════╝
    const phase4Start = Date.now();
    emit('phase', 'phase-start', 'Phase 4/7 — OPTIMIZE: Listings + Pricing', { phase: 4 });

    // 4A: Dynamic pricing
    emit('tool', 'tag-tool', `dynamic_price → computing optimal prices for ${validated.length} products`);

    let competitorIntelAvailable = false;
    try {
      if (process.env.SERPAPI_KEY) {
        competitorIntelAvailable = true;
        const { getCompetitorIntel } = await import('../shopify/competitor-price.js');

        for (const p of validated) {
          try {
            const intel = await getCompetitorIntel(p.name, p.cat, p.cost);
            const pricing = computePricingWithCompetitors(p, intel, { surgeEnabled });
            p.activePrice = pricing.mode;
            p.price = pricing.price;
            p.competitorPrice = pricing.price;

            stats.pricingModes[pricing.mode] = (stats.pricingModes[pricing.mode] || 0) + 1;

            emit('agent', 'tag-agent',
              `"${p.name}" → ${pricing.mode} @ $${pricing.price.toFixed(2)}` +
              (pricing.competitorAvg ? ` (competitors avg: $${pricing.competitorAvg.toFixed(2)})` : ''));
          } catch {
            // Non-fatal — use fallback pricing
            const pricing = computePricingWithCompetitors(p, null, { surgeEnabled });
            p.activePrice = pricing.mode;
            stats.pricingModes[pricing.mode] = (stats.pricingModes[pricing.mode] || 0) + 1;
          }
        }
      } else {
        emit('info', 'tag-tool', 'SERPAPI_KEY not set — using heuristic pricing (add key for competitive benchmarking)');
        for (const p of validated) {
          const pricing = computePricingWithCompetitors(p, null, { surgeEnabled });
          p.activePrice = pricing.mode;
          stats.pricingModes[pricing.mode] = (stats.pricingModes[pricing.mode] || 0) + 1;
        }
      }
    } catch (err) {
      emit('warn', 'tag-warn', `Competitor pricing failed: ${err.message}`);
    }

    // 4B: AI listing generation
    emit('tool', 'tag-tool', `listing_gen → generating AI-optimized listings (${validated.length} products)`);

    const n = validated.length;
    const smartCount = Math.max(1, Math.round(n * 0.25));
    const fastCount = Math.round(n * 0.35);

    for (let idx = 0; idx < validated.length; idx++) {
      const p = validated[idx];
      const tier = listingTierOverride || (idx < smartCount ? 'smart' : idx < smartCount + fastCount ? 'fast' : 'template');

      try {
        const listing = await generateListing(p, { tier });
        p._listing = listing;
        stats.aiSpendEstimate += tier === 'smart' ? 0.008 : tier === 'fast' ? 0.002 : 0;

        emit('agent', 'tag-agent',
          `[${tier}] "${listing.title || p.name}" — ${listing.seoTags?.length || 0} tags, ` +
          `${listing.bulletPoints?.length || 0} bullets`);
      } catch (err) {
        emit('warn', 'tag-warn', `Listing gen failed for "${p.name}": ${err.message}`);
      }
    }

    stats.phases.optimize = Date.now() - phase4Start;
    emit('sys', 'tag-sys', `Phase 4 complete — ${validated.length} priced + listed in ${((Date.now() - phase4Start) / 1000).toFixed(1)}s`);

    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 5 — LAUNCH: Import to Shopify                          ║
    // ╚══════════════════════════════════════════════════════════════════╝
    const phase5Start = Date.now();
    emit('phase', 'phase-start', 'Phase 5/7 — LAUNCH: Import to Shopify', { phase: 5 });

    let importResults = { results: [] };

    if (autoImport && admin) {
      emit('tool', 'tag-tool', `shopify_import → creating ${validated.length} draft listings in store`);

      try {
        importResults = await importListings(validated, admin);
        let imported = 0;
        let failed = 0;

        for (const r of importResults.results) {
          if (r.ok) {
            imported++;
            const p = validated.find(x => x.id === r.id);
            if (p) p._shopifyId = r.shopifyId;
            emit('agent', 'tag-agent', `✓ Imported: "${r.listing?.title || r.id}" → ${r.handle}`);
          } else {
            failed++;
            emit('warn', 'tag-warn', `✗ Import failed: ${r.id} — ${r.error}`);
          }
        }

        stats.productsImported = imported;
        emit('agent', 'tag-agent', `${imported}/${validated.length} products live in Shopify (${failed} failed)`);

      } catch (err) {
        emit('err', 'tag-err', `Shopify import error: ${err.message}`);
      }
    } else if (!admin) {
      emit('info', 'tag-tool', 'No Shopify admin context — products ready for manual import via Engine UI');
    } else {
      emit('info', 'tag-tool', 'Auto-import disabled — use Import button in Engine UI');
    }

    stats.phases.launch = Date.now() - phase5Start;
    emit('sys', 'tag-sys', `Phase 5 complete — ${stats.productsImported} imported in ${((Date.now() - phase5Start) / 1000).toFixed(1)}s`);

    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 6 — ENHANCE: Media Sourcing (optional)                  ║
    // ╚══════════════════════════════════════════════════════════════════╝
    const phase6Start = Date.now();
    emit('phase', 'phase-start', 'Phase 6/7 — ENHANCE: Image Sourcing', { phase: 6 });

    if (autoMedia && admin && stats.productsImported > 0) {
      emit('tool', 'tag-tool', `media_source → sourcing images for ${stats.productsImported} imported products`);

      try {
        const { runMediaAgent } = await import('../ai/agents.js');
        const importedProducts = validated.filter(p => p._shopifyId);

        // Run media agent for top 5 imported products (to stay within time budget)
        const mediaTargets = importedProducts.slice(0, 5);
        let imagesAttached = 0;

        for (const p of mediaTargets) {
          try {
            const mediaResult = await runMediaAgent(
              `Find and attach 4-6 high-quality product images for "${p.name}" (${p.cat}). ` +
              `Shopify product ID: ${p._shopifyId}. ` +
              `Look for white-background hero shots and lifestyle images.`,
              admin,
            );

            const imageCount = mediaResult.toolCalls.filter(
              tc => tc.tool === 'attachImagesToShopifyProduct' && tc.result?.success,
            ).length;

            imagesAttached += imageCount;
            emit('agent', 'tag-agent', `Media: "${p.name}" — ${mediaResult.steps} steps, images sourced`);
          } catch (err) {
            emit('warn', 'tag-warn', `Media failed for "${p.name}": ${err.message}`);
          }
        }

        stats.imagesAttached = imagesAttached;
        emit('agent', 'tag-agent', `Image sourcing complete — ${imagesAttached} images attached to ${mediaTargets.length} products`);

      } catch (err) {
        emit('warn', 'tag-warn', `Media agent unavailable: ${err.message}`);
      }
    } else {
      const reason = !autoMedia ? 'disabled' : !admin ? 'no admin context' : 'no imported products';
      emit('info', 'tag-tool', `Image sourcing skipped (${reason})`);
    }

    stats.phases.enhance = Date.now() - phase6Start;
    emit('sys', 'tag-sys', `Phase 6 complete in ${((Date.now() - phase6Start) / 1000).toFixed(1)}s`);

    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  PHASE 7 — REPORT: Revenue Projections                         ║
    // ╚══════════════════════════════════════════════════════════════════╝
    const phase7Start = Date.now();
    emit('phase', 'phase-start', 'Phase 7/7 — REPORT: Revenue Analysis', { phase: 7 });

    // Compute projections
    let totalMonthlyRevenue = 0;
    let totalMonthlyProfit = 0;
    let bestProduct = null;
    let bestProfit = 0;

    for (const p of validated) {
      const sellPrice = getActivePrice(p);
      const monthlyUnits = p.velocity || 0;
      const monthlyRev = sellPrice * monthlyUnits;
      const monthlyProfit = (p.margin / 100) * monthlyRev;

      totalMonthlyRevenue += monthlyRev;
      totalMonthlyProfit += monthlyProfit;

      if (monthlyProfit > bestProfit) {
        bestProfit = monthlyProfit;
        bestProduct = {
          name: p.name,
          sellPrice,
          monthlyUnits,
          monthlyRevenue: Math.round(monthlyRev),
          monthlyProfit: Math.round(monthlyProfit),
          margin: p.margin,
          lifecycle: p.lifecycle,
          score: p.score,
        };
      }
    }

    stats.avgMargin = validated.length > 0
      ? Math.round(validated.reduce((a, p) => a + p.margin, 0) / validated.length)
      : 0;
    stats.projectedMonthlyRevenue = Math.round(totalMonthlyRevenue);
    stats.projectedMonthlyProfit = Math.round(totalMonthlyProfit);
    stats.bestProduct = bestProduct;

    // Emit report
    emit('report', 'tag-agent', 'Revenue projections computed', {
      projectedMonthlyRevenue: stats.projectedMonthlyRevenue,
      projectedMonthlyProfit: stats.projectedMonthlyProfit,
      avgMargin: stats.avgMargin,
      bestProduct: stats.bestProduct,
    });

    emit('info', 'tag-tool', `Projected monthly revenue: $${stats.projectedMonthlyRevenue.toLocaleString()}`);
    emit('info', 'tag-tool', `Projected monthly profit: $${stats.projectedMonthlyProfit.toLocaleString()} (avg margin: ${stats.avgMargin}%)`);

    if (bestProduct) {
      emit('info', 'tag-tool',
        `Best product: "${bestProduct.name}" — $${bestProduct.monthlyProfit}/mo profit, ` +
        `${bestProduct.margin}% margin, ${bestProduct.monthlyUnits} units/mo`);
    }

    // Pricing mode breakdown
    const modeBreakdown = Object.entries(stats.pricingModes)
      .map(([mode, count]) => `${mode}: ${count}`)
      .join(', ');
    if (modeBreakdown) {
      emit('info', 'tag-tool', `Pricing strategies: ${modeBreakdown}`);
    }

    // Action items
    const actions = [];
    if (!competitorIntelAvailable) {
      actions.push('Add SERPAPI_KEY for live competitor price benchmarking (+5-15% margin improvement)');
    }
    if (!process.env.ANTHROPIC_API_KEY && !process.env.AI_GATEWAY_API_KEY) {
      actions.push('Add AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY for AI-powered listing copy');
    }
    if (stats.productsImported === 0 && validated.length > 0) {
      actions.push('Import products to Shopify via Engine UI to go live');
    }

    const thinMarginProducts = validated.filter(p => p.margin < 40);
    if (thinMarginProducts.length > 0) {
      actions.push(`${thinMarginProducts.length} products have margins below 40% — negotiate suppliers or raise prices`);
    }

    const dyingProducts = validated.filter(p => p.lifecycle === 'dying');
    if (dyingProducts.length > 0) {
      actions.push(`${dyingProducts.length} products are in decline — consider clearing inventory with undercut pricing`);
    }

    if (actions.length > 0) {
      emit('info', 'tag-tool', `Action items: ${actions.length}`);
      for (const a of actions) {
        emit('action', 'tag-warn', `→ ${a}`);
      }
    }

    stats.phases.report = Date.now() - phase7Start;

    // ─── Final summary ──────────────────────────────────────────────
    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    emit('sys', 'tag-sys', `Pipeline complete ✓ — ${totalElapsed}s elapsed`);

    // Build product summary for results
    const productSummary = validated.map(p => ({
      name: p.name,
      score: p.score,
      margin: p.margin,
      price: getActivePrice(p),
      pricingMode: p.activePrice,
      velocity: p.velocity,
      lifecycle: p.lifecycle,
      competition: p.competition,
      sources: p.sources,
      imported: !!p._shopifyId,
      shopifyId: p._shopifyId || null,
      listingTitle: p._listing?.title || p.name,
    }));

    emit('results', 'tag-sys', 'Profit pipeline complete', {
      stats,
      products: productSummary,
      actions,
      elapsed: totalElapsed,
      niche,
    });

    return {
      stats,
      products: productSummary,
      validated,
      actions,
      elapsed: totalElapsed,
    };

  } catch (err) {
    const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    emit('err', 'tag-err', `Pipeline fatal error: ${err.message}`);
    stats.phases.error = err.message;

    return {
      stats,
      products: [],
      validated: [],
      actions: [`Fix pipeline error: ${err.message}`],
      elapsed: totalElapsed,
      error: err.message,
    };
  }
}
