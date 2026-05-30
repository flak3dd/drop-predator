/* eslint-disable no-undef */
/**
 * app/services/intelligence/scanners/twitter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Twitter/X social signal scanner.
 *
 * Searches Twitter/X for real-time product mentions, viral tweets, and
 * purchase-intent signals. Twitter is the fastest social platform for
 * detecting emerging product trends before they peak.
 *
 * Uses RapidAPI Twitter endpoint (e.g. TwitterAPI.io or similar),
 * or falls back to Twitter API v2 if TWITTER_BEARER_TOKEN is configured.
 *
 * Env vars:
 *   RAPIDAPI_TWITTER_KEY    — RapidAPI key for Twitter endpoint
 *   TWITTER_BEARER_TOKEN    — Twitter API v2 bearer token (alternative)
 *
 * Scanner interface: { name, isAvailable(), search(keywords, deps) }
 */

export const name = 'twitter';

const RATE_LIMIT_MS = 500;

/**
 * Check if any Twitter API credentials are configured.
 */
export function isAvailable() {
  return !!(
    process.env.RAPIDAPI_TWITTER_KEY ||
    process.env.TWITTER_BEARER_TOKEN
  );
}

/**
 * Search Twitter for keywords and return Signal objects.
 *
 * @param {string[]} keywords — search terms
 * @param {{ createSignal: Function, quickSentiment: Function }} deps — injected from sentiment.js
 * @returns {Promise<object[]>} array of Signal objects
 */
export async function search(keywords, deps) {
  if (!isAvailable()) return [];

  const { createSignal, quickSentiment } = deps;
  const signals = [];

  for (const kw of keywords.slice(0, 5)) {
    try {
      // Add purchase-intent qualifiers
      const searchQuery = `${kw} (bought OR review OR recommend OR "must have" OR "game changer") -is:retweet lang:en`;
      const tweets = await fetchTweets(searchQuery);

      for (const tweet of tweets) {
        const likes = tweet.likeCount || 0;
        const retweets = tweet.retweetCount || 0;
        const replies = tweet.replyCount || 0;
        const engagement = likes + retweets * 3 + replies * 2;

        // Filter: only keep tweets with meaningful engagement
        if (engagement < 20 && tweet.impressions < 5000) continue;

        const text = tweet.text || '';

        signals.push(createSignal('twitter', {
          keyword:   kw,
          title:     text.slice(0, 200),
          body:      text.length > 200 ? text.slice(200, 500) : '',
          score:     likes + retweets * 2,
          comments:  replies,
          sentiment: quickSentiment(text),
          url:       tweet.url || '',
          ts:        tweet.createdAt ? new Date(tweet.createdAt).getTime() : Date.now(),
          raw: {
            likeCount:    likes,
            retweetCount: retweets,
            replyCount:   replies,
            impressions:  tweet.impressions || 0,
            author:       tweet.author || '',
            verified:     tweet.verified || false,
          },
        }));
      }

      await sleep(RATE_LIMIT_MS);
    } catch { /* non-fatal — skip this keyword */ }
  }

  return signals;
}

// ─── API implementations ───────────────────────────────────────────────────

async function fetchTweets(query) {
  if (process.env.RAPIDAPI_TWITTER_KEY) {
    return fetchViaRapidAPI(query);
  }
  return fetchViaTwitterAPIv2(query);
}

/**
 * Twitter search via RapidAPI (e.g. TwitterAPI.io endpoint).
 */
async function fetchViaRapidAPI(query) {
  const url = new URL('https://twitterapi-io.p.rapidapi.com/api/search/tweet');
  url.searchParams.set('query', query);
  url.searchParams.set('count', '20');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_TWITTER_KEY,
        'x-rapidapi-host': 'twitterapi-io.p.rapidapi.com',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    const data = await res.json();
    const items = data?.tweets || data?.data || data?.results || [];

    return items.slice(0, 20).map(item => ({
      text:         item.text || item.full_text || '',
      likeCount:    item.favorite_count || item.like_count || item.public_metrics?.like_count || 0,
      retweetCount: item.retweet_count || item.public_metrics?.retweet_count || 0,
      replyCount:   item.reply_count || item.public_metrics?.reply_count || 0,
      impressions:  item.impression_count || item.public_metrics?.impression_count || 0,
      createdAt:    item.created_at || null,
      url:          item.id_str
        ? `https://x.com/i/status/${item.id_str}`
        : item.id
          ? `https://x.com/i/status/${item.id}`
          : '',
      author:       item.user?.screen_name || item.author?.username || '',
      verified:     item.user?.verified || item.author?.verified || false,
    }));
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/**
 * Twitter API v2 (official, requires bearer token from developer portal).
 * Uses recent search endpoint.
 */
async function fetchViaTwitterAPIv2(query) {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) return [];

  try {
    const url = new URL('https://api.twitter.com/2/tweets/search/recent');
    url.searchParams.set('query', query);
    url.searchParams.set('max_results', '20');
    url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id');
    url.searchParams.set('expansions', 'author_id');
    url.searchParams.set('user.fields', 'username,verified');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    const data = await res.json();
    const tweets = data?.data || [];
    const users = new Map();
    for (const u of (data?.includes?.users || [])) {
      users.set(u.id, u);
    }

    return tweets.map(tweet => {
      const user = users.get(tweet.author_id) || {};
      return {
        text:         tweet.text || '',
        likeCount:    tweet.public_metrics?.like_count || 0,
        retweetCount: tweet.public_metrics?.retweet_count || 0,
        replyCount:   tweet.public_metrics?.reply_count || 0,
        impressions:  tweet.public_metrics?.impression_count || 0,
        createdAt:    tweet.created_at || null,
        url:          `https://x.com/${user.username || 'i'}/status/${tweet.id}`,
        author:       user.username || '',
        verified:     user.verified || false,
      };
    });
  } catch {
    return [];
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
