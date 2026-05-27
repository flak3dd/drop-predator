/**
 * app/services/intelligence/scanners/tiktok.js
 * ─────────────────────────────────────────────────────────────────────────────
 * TikTok social signal scanner.
 *
 * Uses EnsembleData TikTok API via RapidAPI for keyword/hashtag search.
 * Falls back to TikTok Research API if TIKTOK_CLIENT_KEY is configured.
 *
 * Env vars:
 *   ENSEMBLEDATA_API_KEY  — RapidAPI key (covers TikTok + Instagram)
 *   TIKTOK_CLIENT_KEY     — TikTok Research API (alternative)
 *   TIKTOK_CLIENT_SECRET  — TikTok Research API (alternative)
 *
 * Scanner interface: { name, isAvailable(), search(keywords, deps) }
 */

export const name = 'tiktok';

const RATE_LIMIT_MS = 400;

/**
 * Check if any TikTok API credentials are configured.
 */
export function isAvailable() {
  return !!(
    process.env.ENSEMBLEDATA_API_KEY ||
    (process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET)
  );
}

/**
 * Search TikTok for keywords and return Signal objects.
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
      const videos = await fetchTikTokVideos(kw);

      for (const video of videos) {
        const engagement = (video.likes || 0) + (video.comments || 0) * 3 + (video.shares || 0) * 5;

        // Filter: only keep videos with meaningful engagement
        if (engagement < 500 && (video.playCount || 0) < 10000) continue;

        const text = `${video.title || video.desc || ''} ${video.hashtags || ''}`;

        signals.push(createSignal('tiktok', {
          keyword:   kw,
          title:     (video.title || video.desc || '').slice(0, 200),
          body:      (video.hashtags || '').slice(0, 300),
          score:     Math.round((video.playCount || 0) / 1000), // normalize to Reddit-scale
          comments:  video.comments || 0,
          sentiment: quickSentiment(text),
          url:       video.url || '',
          ts:        video.createTime ? video.createTime * 1000 : Date.now(),
          raw: {
            playCount:  video.playCount || 0,
            likes:      video.likes || 0,
            shares:     video.shares || 0,
            engagement,
            author:     video.author || '',
            musicTitle: video.musicTitle || '',
          },
        }));
      }

      await sleep(RATE_LIMIT_MS);
    } catch { /* non-fatal — skip this keyword */ }
  }

  return signals;
}

// ─── API implementations ───────────────────────────────────────────────────

async function fetchTikTokVideos(keyword) {
  // Prefer EnsembleData (RapidAPI) if available
  if (process.env.ENSEMBLEDATA_API_KEY) {
    return fetchViaEnsembleData(keyword);
  }
  // Fallback to TikTok Research API
  return fetchViaTikTokResearchAPI(keyword);
}

/**
 * EnsembleData TikTok API via RapidAPI.
 * Endpoint: keyword search → video metadata.
 */
async function fetchViaEnsembleData(keyword) {
  const url = new URL('https://ensembledata.p.rapidapi.com/tt/keyword/full-search');
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('period', '7');   // last 7 days
  url.searchParams.set('sorting', '0');  // relevance
  url.searchParams.set('country', 'us');

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
      title:      item.desc || item.title || '',
      desc:       item.desc || '',
      hashtags:   (item.textExtra || [])
        .filter(t => t.hashtagName)
        .map(t => `#${t.hashtagName}`)
        .join(' '),
      playCount:  item.stats?.playCount || item.playCount || 0,
      likes:      item.stats?.diggCount || item.diggCount || 0,
      comments:   item.stats?.commentCount || item.commentCount || 0,
      shares:     item.stats?.shareCount || item.shareCount || 0,
      createTime: item.createTime || 0,
      url:        item.id ? `https://www.tiktok.com/@${item.author?.uniqueId || 'user'}/video/${item.id}` : '',
      author:     item.author?.uniqueId || '',
      musicTitle: item.music?.title || '',
    }));
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/**
 * TikTok Research API (official, requires approved developer access).
 * Uses client credentials grant for auth.
 */
async function fetchViaTikTokResearchAPI(keyword) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) return [];

  try {
    // Step 1: Get access token
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    });
    if (!tokenRes.ok) return [];
    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) return [];

    // Step 2: Search videos
    const now = Math.floor(Date.now() / 1000);
    const weekAgo = now - 7 * 24 * 60 * 60;

    const searchRes = await fetch('https://open.tiktokapis.com/v2/research/video/query/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: { and: [{ field_name: 'keyword', field_values: [keyword], operation: 'IN' }] },
        start_date: new Date(weekAgo * 1000).toISOString().split('T')[0],
        end_date: new Date(now * 1000).toISOString().split('T')[0],
        max_count: 20,
        fields: 'id,video_description,create_time,like_count,comment_count,share_count,view_count,username,hashtag_names',
      }),
    });
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();

    return (searchData.data?.videos || []).map(v => ({
      title:      v.video_description || '',
      desc:       v.video_description || '',
      hashtags:   (v.hashtag_names || []).map(h => `#${h}`).join(' '),
      playCount:  v.view_count || 0,
      likes:      v.like_count || 0,
      comments:   v.comment_count || 0,
      shares:     v.share_count || 0,
      createTime: v.create_time || 0,
      url:        v.id ? `https://www.tiktok.com/@${v.username || 'user'}/video/${v.id}` : '',
      author:     v.username || '',
      musicTitle: '',
    }));
  } catch {
    return [];
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
