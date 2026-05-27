/**
 * app/services/intelligence/scanners/instagram.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Instagram social signal scanner.
 *
 * Uses EnsembleData Instagram API via RapidAPI (same key as TikTok),
 * or falls back to Instagram Graph API if INSTAGRAM_ACCESS_TOKEN is set.
 *
 * Env vars:
 *   ENSEMBLEDATA_API_KEY    — RapidAPI key (shared with TikTok scanner)
 *   INSTAGRAM_ACCESS_TOKEN  — Instagram Graph API (alternative)
 *   INSTAGRAM_USER_ID       — Instagram Business Account ID (alternative)
 *
 * Scanner interface: { name, isAvailable(), search(hashtags, deps) }
 */

export const name = 'instagram';

const RATE_LIMIT_MS = 400;

/**
 * Check if any Instagram API credentials are configured.
 */
export function isAvailable() {
  return !!(
    process.env.ENSEMBLEDATA_API_KEY ||
    process.env.INSTAGRAM_ACCESS_TOKEN
  );
}

/**
 * Search Instagram by hashtags and return Signal objects.
 *
 * @param {string[]} hashtags — hashtag strings (with or without #)
 * @param {{ createSignal: Function, quickSentiment: Function }} deps
 * @returns {Promise<object[]>} array of Signal objects
 */
export async function search(hashtags, deps) {
  if (!isAvailable()) return [];

  const { createSignal, quickSentiment } = deps;
  const signals = [];

  for (const rawTag of hashtags.slice(0, 5)) {
    // Strip # and spaces for hashtag search
    const tag = rawTag.replace(/^#/, '').replace(/\s+/g, '').toLowerCase();
    if (!tag) continue;

    try {
      const posts = await fetchInstagramPosts(tag);

      for (const post of posts) {
        const likes = post.likes || 0;
        const comments = post.comments || 0;

        // Filter: only keep posts with meaningful engagement
        if (likes < 100 && comments < 10) continue;

        const text = post.caption || '';

        signals.push(createSignal('instagram', {
          keyword:   tag,
          title:     text.slice(0, 200) || `Instagram #${tag}`,
          body:      text.length > 200 ? text.slice(200, 500) : '',
          score:     likes + comments * 2,
          comments,
          sentiment: quickSentiment(text),
          url:       post.url || '',
          ts:        post.timestamp ? new Date(post.timestamp).getTime() : Date.now(),
          raw: {
            likes,
            mediaType: post.mediaType || 'IMAGE',
            hashtags:  post.hashtags || [],
          },
        }));
      }

      await sleep(RATE_LIMIT_MS);
    } catch { /* non-fatal — skip this hashtag */ }
  }

  return signals;
}

// ─── API implementations ───────────────────────────────────────────────────

async function fetchInstagramPosts(hashtag) {
  if (process.env.ENSEMBLEDATA_API_KEY) {
    return fetchViaEnsembleData(hashtag);
  }
  return fetchViaGraphAPI(hashtag);
}

/**
 * EnsembleData Instagram API via RapidAPI.
 */
async function fetchViaEnsembleData(hashtag) {
  const url = new URL('https://ensembledata.p.rapidapi.com/ig/hashtag/posts');
  url.searchParams.set('name', hashtag);
  url.searchParams.set('max_posts', '20');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'x-rapidapi-key': process.env.ENSEMBLEDATA_API_KEY,
        'x-rapidapi-host': 'ensembledata.p.rapidapi.com',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    const data = await res.json();
    const items = data?.data || [];

    return items.slice(0, 20).map(item => ({
      caption:   item.caption?.text || item.edge_media_to_caption?.edges?.[0]?.node?.text || '',
      likes:     item.like_count || item.edge_liked_by?.count || 0,
      comments:  item.comment_count || item.edge_media_to_comment?.count || 0,
      timestamp: item.taken_at ? new Date(item.taken_at * 1000).toISOString() : null,
      url:       item.code ? `https://www.instagram.com/p/${item.code}/` : '',
      mediaType: item.media_type === 2 ? 'VIDEO' : item.media_type === 8 ? 'CAROUSEL' : 'IMAGE',
      hashtags:  (item.caption?.text || '').match(/#\w+/g) || [],
    }));
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/**
 * Instagram Graph API (requires Business/Creator account + access token).
 * Searches via hashtag ID lookup → recent media.
 */
async function fetchViaGraphAPI(hashtag) {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const userId = process.env.INSTAGRAM_USER_ID;
  if (!token || !userId) return [];

  try {
    // Step 1: Get hashtag ID
    const idRes = await fetch(
      `https://graph.facebook.com/v19.0/ig_hashtag_search?q=${encodeURIComponent(hashtag)}&user_id=${userId}&access_token=${token}`
    );
    if (!idRes.ok) return [];
    const idData = await idRes.json();
    const hashtagId = idData.data?.[0]?.id;
    if (!hashtagId) return [];

    // Step 2: Get recent media for this hashtag
    const mediaRes = await fetch(
      `https://graph.facebook.com/v19.0/${hashtagId}/recent_media?user_id=${userId}&fields=id,caption,like_count,comments_count,timestamp,permalink,media_type&limit=20&access_token=${token}`
    );
    if (!mediaRes.ok) return [];
    const mediaData = await mediaRes.json();

    return (mediaData.data || []).map(m => ({
      caption:   m.caption || '',
      likes:     m.like_count || 0,
      comments:  m.comments_count || 0,
      timestamp: m.timestamp || null,
      url:       m.permalink || '',
      mediaType: m.media_type || 'IMAGE',
      hashtags:  (m.caption || '').match(/#\w+/g) || [],
    }));
  } catch {
    return [];
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
