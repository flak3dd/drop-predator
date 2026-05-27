/* eslint-disable no-undef */
/**
 * Pathway D: Trend-to-Product Pipeline
 *
 * Mines social signals (Reddit, Google Trends) for product mentions,
 * then validates each mention via Google Shopping to produce real
 * product leads with pricing data.
 *
 * Flow: Reddit/Trends → extract product mentions → Google Shopping lookup → products
 *
 * Requires: At least one of SERPAPI_KEY (for Google Shopping validation)
 * Uses:     Reddit public API (no key needed), Google Trends via SERPAPI
 * Returns:  Raw products in the standard _source schema
 */

import cache from '../catalog-cache.js';

const CACHE_TTL = 2 * 60 * 60 * 1000;
const REDDIT_UA = 'Predator-Engine/2.0 (trend-sourcing)';

// ── Product mention patterns (tuned for purchase-intent signals) ────────────

const MENTION_PATTERNS = [
  /\bjust\s+(?:got|bought|ordered|received)\s+(?:a|an|the|my|this)\s+([\w][\w\s]{3,35}?)(?:\s+and|\s+from|\s*[.!,?])/gi,
  /\bbest\s+([\w][\w\s]{3,35}?)\s+(?:ever|I've|i've|for the|on the|in \d)/gi,
  /\b([\w][\w\s]{3,35}?)\s+(?:went|going|is going|has gone)\s+viral\b/gi,
  /\btiktok\s+(?:made|convinced)\s+me\s+(?:buy|get|try)\s+(?:a|an|the|this)?\s*([\w][\w\s]{3,35}?)\s*[.!,]/gi,
  /\bcan['']t\s+(?:stop\s+using|live\s+without|believe)\s+(?:this|my)\s+([\w][\w\s]{3,35}?)\b/gi,
  /\bgame\s*changer[:!]?\s*([\w][\w\s]{3,35}?)\b/gi,
  /\b(?:highly|strongly)\s+recommend\s+(?:this|the|a)\s+([\w][\w\s]{3,35}?)\b/gi,
];

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'my', 'your', 'our', 'their',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
  'some', 'any', 'all', 'most', 'other', 'new', 'old', 'one', 'thing',
  'stuff', 'something', 'anything', 'people', 'way', 'time', 'lot', 'kind',
  'great', 'good', 'just', 'really', 'very', 'much', 'ever', 'best',
  'company', 'brand', 'product', 'store', 'shop', 'link', 'post', 'comment',
]);

export const name = 'Trend Sourcing';

export function isAvailable() {
  // Reddit is public API — always available. SERPAPI makes it much better.
  return true;
}

export async function search(keywords, opts = {}) {
  const { log = () => {}, niche = 'general', subreddits = [] } = opts;

  const cacheKey = `trend-src:${niche}:${keywords.slice(0, 2).join(',')}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    log(`[Trend Sourcing] Cache hit (${cached.length} products)`);
    return cached;
  }

  log('[Trend Sourcing] Mining Reddit for product mentions…');

  // ── 1. Scrape Reddit for purchase-intent posts ──────────────────────
  const allMentions = new Map();
  const subs = subreddits.length > 0
    ? subreddits.slice(0, 4)
    : guessSubreddits(niche, keywords);

  for (const sub of subs) {
    try {
      const posts = await fetchRedditPosts(sub, log);
      extractMentions(posts, allMentions, keywords);
    } catch (err) {
      log(`[Trend Sourcing] r/${sub} failed: ${err.message}`);
    }
  }

  // Also search Reddit for each keyword directly
  for (const kw of keywords.slice(0, 2)) {
    try {
      const posts = await searchReddit(kw, log);
      extractMentions(posts, allMentions, keywords);
    } catch (err) {
      log(`[Trend Sourcing] Reddit search "${kw}" failed: ${err.message}`);
    }
  }

  log(`[Trend Sourcing] Found ${allMentions.size} unique product mentions`);

  if (allMentions.size === 0) {
    log('[Trend Sourcing] No product mentions found in social signals');
    return [];
  }

  // ── 2. Rank mentions by signal strength ────────────────────────────
  const ranked = [...allMentions.entries()]
    .map(([term, data]) => ({ term, ...data }))
    .filter(m => m.count >= 2 || m.upvotes > 200)
    .sort((a, b) => (b.count * 10 + b.upvotes / 50) - (a.count * 10 + a.upvotes / 50))
    .slice(0, 10);

  if (ranked.length === 0) {
    log('[Trend Sourcing] No strong product signals — mentions too weak');
    return [];
  }

  log(`[Trend Sourcing] Top mentions: ${ranked.map(m => `"${m.term}" (${m.count}x)`).join(', ')}`);

  // ── 3. Validate via Google Shopping ─────────────────────────────────
  const products = await validateViaGoogleShopping(ranked, log);

  cache.set(cacheKey, products, CACHE_TTL);
  log(`[Trend Sourcing] ${products.length} validated products`);
  return products;
}

// ── Reddit helpers ────────────────────────────────────────────────────────

function guessSubreddits(niche, keywords) {
  const map = {
    gym:     ['homegym', 'GymMotivation', 'bodyweightfitness', 'fitness'],
    fitness: ['homegym', 'fitness', 'bodyweightfitness', 'running'],
    anxiety: ['Anxiety', 'mentalhealth', 'selfcare', 'wellness'],
    home:    ['BuyItForLife', 'homeimprovement', 'Cooking', 'mildlyinteresting'],
    pet:     ['dogs', 'cats', 'Pets', 'aww'],
    tech:    ['gadgets', 'tech', 'BuyItForLife', 'shutupandtakemymoney'],
    beauty:  ['SkincareAddiction', 'MakeupAddiction', 'beauty'],
  };
  return map[niche] || ['BuyItForLife', 'shutupandtakemymoney', 'gadgets', keywords[0] || 'trending'];
}

async function fetchRedditPosts(subreddit, log) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://www.reddit.com/r/${subreddit}/hot.json?limit=25&raw_json=1`,
      { headers: { 'User-Agent': REDDIT_UA }, signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) { log(`[Trend Sourcing] r/${subreddit} returned ${res.status}`); return []; }
    const data = await res.json();
    const posts = (data.data?.children || []).map(c => ({
      title: c.data.title || '',
      body: c.data.selftext || '',
      upvotes: c.data.score || 0,
      ratio: c.data.upvote_ratio || 0,
      sub: subreddit,
    }));
    log(`[Trend Sourcing] r/${subreddit}: ${posts.length} posts`);
    await new Promise(r => setTimeout(r, 400));
    return posts;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function searchReddit(query, log) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(query + ' bought recommend')}&sort=relevance&t=month&limit=15&raw_json=1`,
      { headers: { 'User-Agent': REDDIT_UA }, signal: controller.signal },
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const posts = (data.data?.children || []).map(c => ({
      title: c.data.title || '',
      body: c.data.selftext || '',
      upvotes: c.data.score || 0,
      ratio: c.data.upvote_ratio || 0,
      sub: c.data.subreddit || 'search',
    }));
    log(`[Trend Sourcing] Reddit search "${query}": ${posts.length} results`);
    await new Promise(r => setTimeout(r, 400));
    return posts;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function extractMentions(posts, mentions, nicheKeywords) {
  for (const post of posts) {
    const text = `${post.title} ${post.body}`;

    for (const pattern of MENTION_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const raw = (match[1] || '').trim().toLowerCase();
        const words = raw.split(/\s+/).filter(w => !STOP_WORDS.has(w) && w.length > 2);
        if (words.length === 0 || words.length > 6) continue;
        const normalized = words.join(' ');
        if (normalized.length < 5) continue;

        // Boost relevance if mention contains a niche keyword
        const nicheRelevant = nicheKeywords.some(kw =>
          normalized.includes(kw.toLowerCase().split(' ')[0])
        );

        if (!mentions.has(normalized)) {
          mentions.set(normalized, { count: 0, upvotes: 0, subs: new Set(), nicheRelevant });
        }
        const entry = mentions.get(normalized);
        entry.count++;
        entry.upvotes += post.upvotes;
        entry.subs.add(post.sub);
        if (nicheRelevant) entry.nicheRelevant = true;
      }
    }
  }
}

// ── Google Shopping validation ─────────────────────────────────────────────

async function validateViaGoogleShopping(mentions, log) {
  if (!process.env.SERPAPI_KEY) {
    // No SERPAPI — return mentions as unvalidated research leads
    log('[Trend Sourcing] No SERPAPI_KEY — returning unvalidated leads');
    return mentions.map(m => ({
      _source:       'trend-research',
      name:          m.term.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
      cat:           'Trending',
      price:         29.99,
      cost:          10.00,
      supplier:      'Trend Research — to be sourced',
      supScore:      55,
      moq:           1,
      images:        '',
      orders:        0,
      _totalResults: 0,
      _mentions:     m.count,
      _upvotes:      m.upvotes,
      _subreddits:   [...m.subs],
    }));
  }

  log('[Trend Sourcing] Validating mentions via Google Shopping…');
  const products = [];

  for (const mention of mentions.slice(0, 8)) {
    try {
      const url = new URL('https://serpapi.com/search');
      url.searchParams.set('engine', 'google_shopping');
      url.searchParams.set('q', mention.term);
      url.searchParams.set('num', '8');
      url.searchParams.set('gl', 'us');
      url.searchParams.set('api_key', process.env.SERPAPI_KEY);

      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) continue;
      const data = await res.json();

      const results = (data.shopping_results || []).slice(0, 5);
      if (results.length === 0) continue;

      // Pick the best-rated or most relevant result
      const best = results.reduce((a, b) => {
        const aScore = (a.rating || 0) * 20 + (a.reviews || 0) / 10;
        const bScore = (b.rating || 0) * 20 + (b.reviews || 0) / 10;
        return bScore > aScore ? b : a;
      }, results[0]);

      const retail = parseFloat(String(best.extracted_price || '').replace(/[^0-9.]/g, '')) || 0;
      if (!retail || retail < 5 || retail > 200) continue;

      products.push({
        _source:       'trend-validated',
        name:          (best.title || mention.term).slice(0, 80),
        cat:           'Trending',
        price:         retail,
        cost:          parseFloat((retail * 0.35).toFixed(2)),
        supplier:      best.source || 'Google Shopping',
        supScore:      65 + Math.min(20, mention.count * 3),
        moq:           1,
        images:        best.thumbnail || '',
        orders:        0,
        _totalResults: data.shopping_results?.length || 0,
        _mentions:     mention.count,
        _upvotes:      mention.upvotes,
        _subreddits:   [...mention.subs],
        _rating:       best.rating || 0,
        _reviews:      best.reviews || 0,
      });

      log(`[Trend Sourcing] ✓ "${mention.term}" → $${retail} (${mention.count} mentions, ${mention.upvotes} upvotes)`);
      await new Promise(r => setTimeout(r, 400));
    } catch { /* non-fatal */ }
  }

  return products;
}
