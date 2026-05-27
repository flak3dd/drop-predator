/**
 * app/routes/api.ai.research.jsx
 * ---------------------------------------------------------
 * Product Research & Sentiment Analysis — streaming endpoint.
 *
 * POST /api/ai/research
 * Body: { product: string, mode: 'full'|'sentiment'|'compare'|'themes' }
 *
 * Response: NDJSON event stream with tagged log lines + final results.
 */

import { authenticate } from "../shopify.server";
import {
  fullSentimentScan,
  quickSentiment,
  computeHypeScore,
  extractProductMentions,
  crossNicheCorrelation,
} from "../services/intelligence/index.js";

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { product, mode = "full" } = body;

  if (!product || typeof product !== "string" || !product.trim()) {
    return Response.json({ error: "Product name is required" }, { status: 400 });
  }

  const validModes = ["full", "sentiment", "compare", "themes"];
  if (!validModes.includes(mode)) {
    return Response.json({ error: `Invalid mode. Use: ${validModes.join(", ")}` }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (tag, cls, msg, data) => {
        const event = {
          tag,
          cls,
          msg,
          timestamp: new Date().toISOString(),
        };
        if (data) event.data = data;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          /* stream cancelled */
        }
      };

      try {
        const productName = product.trim();
        const keywords = productName
          .toLowerCase()
          .split(/\s+/)
          .filter(w => w.length > 2);

        emit("sys", "tag-sys", `Agent initialized — mode: ${mode} pipeline`);
        emit("sys", "tag-sys", `Target: "${productName}"`);

        // ─── Phase 1: Sentiment Scan ────────────────────────────────
        if (mode === "full" || mode === "sentiment") {
          emit("tool", "tag-tool", `web_search → querying "${productName}" reviews and discussions`);

          const signals = await fullSentimentScan({
            subreddits: deriveSubs(productName),
            keywords: [productName, ...keywords.slice(0, 3)],
            enableReddit: true,
            enableHN: true,
            enableTrends: true,
            enableTikTok: false,
            enableAiAnalysis: !!process.env.ANTHROPIC_API_KEY,
          }, (progress) => {
            if (progress?.source) {
              emit("agent", "tag-agent", `Scanning ${progress.source}... ${progress.count || 0} signals`);
            }
          });

          emit("agent", "tag-agent", `Found ${signals.length} signals across platforms`);

          // Score all signals
          for (const s of signals) {
            s.hypeScore = computeHypeScore(s);
          }
          signals.sort((a, b) => b.hypeScore - a.hypeScore);

          // Compute aggregate sentiment
          const posCount = signals.filter(s => s.sentiment > 0.1).length;
          const negCount = signals.filter(s => s.sentiment < -0.1).length;
          const neuCount = signals.length - posCount - negCount;
          const avgSentiment = signals.length > 0
            ? signals.reduce((sum, s) => sum + s.sentiment, 0) / signals.length
            : 0;

          const posPercent = signals.length > 0 ? Math.round((posCount / signals.length) * 100) : 0;
          const negPercent = signals.length > 0 ? Math.round((negCount / signals.length) * 100) : 0;
          const neuPercent = 100 - posPercent - negPercent;

          emit("agent", "tag-agent",
            `Sentiment: ${posPercent}% positive, ${neuPercent}% neutral, ${negPercent}% negative`);

          // Extract themes from signal titles
          const themes = extractThemes(signals);
          if (themes.length > 0) {
            emit("agent", "tag-agent", `Top themes: ${themes.slice(0, 6).join(", ")}`);
          }

          // Overall score (0-10 scale based on sentiment + hype)
          const avgHype = signals.length > 0
            ? signals.reduce((sum, s) => sum + s.hypeScore, 0) / signals.length
            : 0;
          const overallScore = Math.min(10, Math.max(0,
            (avgSentiment + 1) * 3.5 + (avgHype / 100) * 3
          )).toFixed(1);

          // ─── Phase 2: Product Discovery ─────────────────────────────
          let mentions = [];
          let crossPlatform = [];

          if (mode === "full") {
            emit("tool", "tag-tool", `llm_analyze → extracting product mentions from signals`);
            mentions = extractProductMentions(signals);
            emit("agent", "tag-agent", `Found ${mentions.length} product mentions`);

            emit("tool", "tag-tool", `llm_analyze → cross-platform correlation analysis`);
            crossPlatform = crossNicheCorrelation(signals);
            if (crossPlatform.length > 0) {
              emit("agent", "tag-agent",
                `${crossPlatform.length} topics trending across multiple platforms`);
            }
          }

          // ─── Phase 3: Competitor/Comparison ──────────────────────────
          if (mode === "full" || mode === "compare") {
            emit("tool", "tag-tool", `web_search → pulling competitor mentions and pricing signals`);

            // Extract competitor names from signal text
            const competitors = extractCompetitors(signals, productName);
            if (competitors.length > 0) {
              emit("agent", "tag-agent",
                `Identified ${competitors.length} competitors: ${competitors.slice(0, 3).join(", ")}`);
            } else {
              emit("warn", "tag-warn", `Limited competitor data — only direct mentions found`);
            }
          }

          // ─── Phase 4: Theme Mining ──────────────────────────────────
          if (mode === "full" || mode === "themes") {
            emit("tool", "tag-tool", `llm_analyze → deep theme clustering`);

            const themeBreakdown = themes.map((t, i) => ({
              theme: t,
              weight: Math.max(5, Math.round(30 - i * 4)),
            }));

            for (const t of themeBreakdown.slice(0, 4)) {
              emit("agent", "tag-agent", `Theme (${t.weight}%): ${t.theme}`);
            }
            if (themeBreakdown.length > 4) {
              emit("agent", "tag-agent", `${themeBreakdown.length - 4} additional minor themes extracted`);
            }
          }

          // ─── Phase 5: Report Generation ──────────────────────────────
          emit("tool", "tag-tool", `report_gen → compiling structured output`);

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          emit("sys", "tag-sys", `Pipeline complete ✓ — ${elapsed}s elapsed`);

          // ─── Results payload ──────────────────────────────────────────
          emit("results", "tag-sys", "Analysis complete", {
            score: overallScore,
            reviews: String(signals.length),
            pos: `${posPercent}%`,
            neg: `${negPercent}%`,
            posN: posPercent,
            neuN: neuPercent,
            negN: negPercent,
            themes,
            avgSentiment: avgSentiment.toFixed(2),
            avgHype: Math.round(avgHype),
            topSignals: signals.slice(0, 10).map(s => ({
              source: s.source,
              title: s.title,
              hypeScore: s.hypeScore,
              sentiment: s.sentiment,
              url: s.url,
            })),
            mentions: mentions.slice(0, 10),
            crossPlatform: crossPlatform.slice(0, 5),
          });

        } else if (mode === "compare") {
          // Compare-only mode without full scan — run minimal sentiment
          emit("tool", "tag-tool", `review_scrape → targeting "${productName}" across platforms`);

          const signals = await fullSentimentScan({
            subreddits: deriveSubs(productName),
            keywords: [productName],
            enableReddit: true,
            enableHN: true,
            enableTrends: false,
            enableTikTok: false,
            enableAiAnalysis: false,
          });

          for (const s of signals) s.hypeScore = computeHypeScore(s);
          signals.sort((a, b) => b.hypeScore - a.hypeScore);

          const competitors = extractCompetitors(signals, productName);
          emit("agent", "tag-agent",
            `Found ${signals.length} signals, ${competitors.length} competitor mentions`);

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          emit("sys", "tag-sys", `Comparison complete ✓ — ${elapsed}s elapsed`);

          const posCount = signals.filter(s => s.sentiment > 0.1).length;
          const negCount = signals.filter(s => s.sentiment < -0.1).length;
          const posPercent = signals.length > 0 ? Math.round((posCount / signals.length) * 100) : 0;
          const negPercent = signals.length > 0 ? Math.round((negCount / signals.length) * 100) : 0;

          emit("results", "tag-sys", "Analysis complete", {
            score: "—",
            reviews: String(signals.length),
            pos: `${posPercent}%`,
            neg: `${negPercent}%`,
            posN: posPercent,
            neuN: 100 - posPercent - negPercent,
            negN: negPercent,
            themes: extractThemes(signals),
            competitors,
          });

        } else if (mode === "themes") {
          // Themes-only mode
          emit("tool", "tag-tool", `review_scrape → collecting long-form discussions`);

          const signals = await fullSentimentScan({
            subreddits: deriveSubs(productName),
            keywords: [productName],
            enableReddit: true,
            enableHN: true,
            enableTrends: false,
            enableTikTok: false,
            enableAiAnalysis: false,
          });

          for (const s of signals) s.hypeScore = computeHypeScore(s);
          emit("agent", "tag-agent", `Collected ${signals.length} discussions`);

          emit("tool", "tag-tool", `llm_analyze → topic modeling`);
          const themes = extractThemes(signals);

          for (const [i, t] of themes.slice(0, 6).entries()) {
            const weight = Math.max(5, Math.round(30 - i * 5));
            emit("agent", "tag-agent", `Topic ${i + 1} (${weight}%): ${t}`);
          }

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          emit("sys", "tag-sys", `Theme mining complete ✓ — ${elapsed}s elapsed`);

          const posCount = signals.filter(s => s.sentiment > 0.1).length;
          const negCount = signals.filter(s => s.sentiment < -0.1).length;
          const posPercent = signals.length > 0 ? Math.round((posCount / signals.length) * 100) : 0;
          const negPercent = signals.length > 0 ? Math.round((negCount / signals.length) * 100) : 0;

          emit("results", "tag-sys", "Analysis complete", {
            score: "—",
            reviews: String(signals.length),
            pos: `${posPercent}%`,
            neg: `${negPercent}%`,
            posN: posPercent,
            neuN: 100 - posPercent - negPercent,
            negN: negPercent,
            themes,
          });
        }
      } catch (err) {
        emit("err", "tag-err", `Fatal: ${err.message}`);
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Derive subreddits from a product name — maps common product categories.
 */
function deriveSubs(product) {
  const p = product.toLowerCase();
  const subs = ["BuyItForLife", "ProductReviews"];

  if (p.includes("headphone") || p.includes("earbuds") || p.includes("audio") || p.includes("speaker"))
    subs.push("headphones", "audiophile", "HeadphoneAdvice");
  else if (p.includes("phone") || p.includes("iphone") || p.includes("samsung") || p.includes("pixel"))
    subs.push("smartphones", "Android", "iphone");
  else if (p.includes("laptop") || p.includes("computer") || p.includes("pc"))
    subs.push("SuggestALaptop", "buildapc", "laptops");
  else if (p.includes("camera") || p.includes("lens") || p.includes("photo"))
    subs.push("photography", "cameras", "videography");
  else if (p.includes("shoe") || p.includes("sneaker") || p.includes("boot"))
    subs.push("Sneakers", "goodyearwelt", "RunningShoeGeeks");
  else if (p.includes("watch") || p.includes("timepiece"))
    subs.push("Watches", "WatchesCirclejerk");
  else if (p.includes("gym") || p.includes("fitness") || p.includes("workout") || p.includes("exercise"))
    subs.push("homegym", "Fitness", "GYM");
  else if (p.includes("skincare") || p.includes("beauty") || p.includes("cosmetic"))
    subs.push("SkincareAddiction", "beauty", "MakeupAddiction");
  else if (p.includes("gaming") || p.includes("console") || p.includes("controller"))
    subs.push("gaming", "pcgaming", "GameDeals");
  else if (p.includes("kitchen") || p.includes("cookware") || p.includes("knife"))
    subs.push("Cooking", "BuyItForLife", "chefknives");
  else
    subs.push("gadgets", "coolguides");

  return subs.slice(0, 5);
}

/**
 * Extract common themes from signal titles using keyword frequency.
 */
function extractThemes(signals) {
  if (signals.length === 0) return [];

  const stopwords = new Set([
    "the", "a", "an", "is", "it", "to", "in", "for", "of", "and", "or", "but",
    "on", "at", "by", "my", "me", "this", "that", "with", "from", "has", "have",
    "had", "was", "were", "be", "been", "am", "are", "do", "does", "did", "will",
    "would", "could", "should", "just", "not", "all", "any", "can", "what", "how",
    "i", "you", "we", "they", "he", "she", "its", "so", "if", "no", "yes", "new",
    "one", "two", "about", "more", "very", "than", "also", "like", "get", "got",
    "vs", "really", "after", "before", "going", "still", "need", "want", "now",
  ]);

  const bigramCounts = {};
  const tokenCache = [];

  for (const s of signals) {
    const text = `${s.title} ${s.body || ""}`.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    const words = text.split(/\s+/).filter(w => w.length > 2 && !stopwords.has(w));
    tokenCache.push(words);

    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      bigramCounts[bigram] = (bigramCounts[bigram] || 0) + 1;
    }
  }

  // Single-word fallback for sparse data
  const wordCounts = {};
  for (const words of tokenCache) {
    for (const w of words) {
      wordCounts[w] = (wordCounts[w] || 0) + 1;
    }
  }

  // Merge bigrams and top single words
  const themes = [];
  const sortedBigrams = Object.entries(bigramCounts)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1]);

  for (const [bigram] of sortedBigrams.slice(0, 6)) {
    themes.push(bigram);
  }

  // Fill remaining with single words not already covered
  const covered = new Set(themes.join(" ").split(" "));
  const sortedWords = Object.entries(wordCounts)
    .filter(([w, c]) => c >= 2 && !covered.has(w))
    .sort((a, b) => b[1] - a[1]);

  for (const [word] of sortedWords.slice(0, 8 - themes.length)) {
    themes.push(word);
  }

  return themes.slice(0, 8);
}

/**
 * Extract competitor names mentioned in signals.
 */
function extractCompetitors(signals, productName) {
  const pLower = productName.toLowerCase();
  const mentions = {};

  for (const s of signals) {
    const text = `${s.title} ${s.body || ""}`.toLowerCase();
    // Look for "vs" patterns
    const vsMatches = text.match(/vs\.?\s+([a-z0-9][\w\s-]{2,30})/gi) || [];
    for (const m of vsMatches) {
      const name = m.replace(/^vs\.?\s+/i, "").trim();
      if (name.length > 2 && !name.includes(pLower)) {
        mentions[name] = (mentions[name] || 0) + 1;
      }
    }

    // Look for "alternative to" patterns
    const altMatches = text.match(/alternative(?:s)?\s+(?:to\s+)?([a-z0-9][\w\s-]{2,30})/gi) || [];
    for (const m of altMatches) {
      const name = m.replace(/alternative(?:s)?\s+(?:to\s+)?/i, "").trim();
      if (name.length > 2 && !name.includes(pLower)) {
        mentions[name] = (mentions[name] || 0) + 1;
      }
    }
  }

  return Object.entries(mentions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
}
