/* eslint-disable no-undef */
/**
 * app/services/intelligence/scanners/youtube.js
 * ─────────────────────────────────────────────────────────────────────────────
 * YouTube social signal scanner.
 *
 * Searches YouTube for product review/unboxing/trending videos to extract
 * market intelligence signals. High view-count product reviews are strong
 * indicators of consumer interest and purchase intent.
 *
 * Uses EnsembleData YouTube API via RapidAPI, or falls back to YouTube
 * Data API v3 if YOUTUBE_API_KEY is configured.
 *
 * Env vars:
 *   ENSEMBLEDATA_API_KEY  — RapidAPI key (shared with TikTok/Instagram)
 *   YOUTUBE_API_KEY       — YouTube Data API v3 key (alternative)
 *
 * Scanner interface: { name, isAvailable(), search(keywords, deps) }
 */

export const name = 'youtube';

const RATE_LIMIT_MS = 400;

/**
 * Check if any YouTube API credentials are configured.
 */
export function isAvailable() {
  return !!(
    process.env.ENSEMBLEDATA_API_KEY ||
    process.env.YOUTUBE_API_KEY
  );
}

/**
 * Search YouTube for keywords and return Signal objects.
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
      // Append product-intent qualifiers to the keyword
      const searchQuery = `${kw} review`;
      const videos = await fetchYouTubeVideos(searchQuery);

      for (const video of videos) {
        const views = video.viewCount || 0;
        const likes = video.likeCount || 0;
        const comments = video.commentCount || 0;

        // Filter: only keep videos with meaningful engagement
        if (views < 1000 && likes < 50) continue;

        const text = `${video.title || ''} ${video.description || ''}`;

        signals.push(createSignal('youtube', {
          keyword:   kw,
          title:     (video.title || '').slice(0, 200),
          body:      (video.description || '').slice(0, 300),
          score:     Math.round(views / 1000), // normalize to Reddit-scale
          comments:  comments,
          sentiment: quickSentiment(text),
          url:       video.url || '',
          ts:        video.publishedAt ? new Date(video.publishedAt).getTime() : Date.now(),
          raw: {
            viewCount:    views,
            likeCount:    likes,
            channelTitle: video.channelTitle || '',
            duration:     video.duration || '',
          },
        }));
      }

      await sleep(RATE_LIMIT_MS);
    } catch { /* non-fatal — skip this keyword */ }
  }

  return signals;
}

// ─── API implementations ───────────────────────────────────────────────────

async function fetchYouTubeVideos(query) {
  // Prefer EnsembleData (RapidAPI) if available
  if (process.env.ENSEMBLEDATA_API_KEY) {
    return fetchViaEnsembleData(query);
  }
  // Fallback to YouTube Data API v3
  return fetchViaYouTubeDataAPI(query);
}

/**
 * EnsembleData YouTube API via RapidAPI.
 * Endpoint: keyword search → video metadata.
 */
async function fetchViaEnsembleData(query) {
  const url = new URL('https://ensembledata.p.rapidapi.com/youtube/search');
  url.searchParams.set('keyword', query);
  url.searchParams.set('period', 'month');  // last month
  url.searchParams.set('sorting', 'relevance');

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
    const items = data?.data || data?.results || [];

    return items.slice(0, 20).map(item => ({
      title:        item.title || item.snippet?.title || '',
      description:  item.description || item.snippet?.description || '',
      viewCount:    item.viewCount || item.statistics?.viewCount || item.view_count || 0,
      likeCount:    item.likeCount || item.statistics?.likeCount || item.like_count || 0,
      commentCount: item.commentCount || item.statistics?.commentCount || item.comment_count || 0,
      publishedAt:  item.publishedAt || item.snippet?.publishedAt || item.published_at || null,
      url:          item.videoId
        ? `https://www.youtube.com/watch?v=${item.videoId}`
        : item.id?.videoId
          ? `https://www.youtube.com/watch?v=${item.id.videoId}`
          : item.url || '',
      channelTitle: item.channelTitle || item.snippet?.channelTitle || item.channel_title || '',
      duration:     item.duration || item.contentDetails?.duration || '',
    }));
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/**
 * YouTube Data API v3 (official, requires API key from Google Cloud Console).
 * Uses search.list for keyword search + videos.list for stats.
 */
async function fetchViaYouTubeDataAPI(query) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  try {
    // Step 1: Search for videos
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('maxResults', '15');
    searchUrl.searchParams.set('order', 'relevance');
    searchUrl.searchParams.set('publishedAfter', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    searchUrl.searchParams.set('key', apiKey);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const searchRes = await fetch(searchUrl.toString(), { signal: controller.signal });
    clearTimeout(timer);
    if (!searchRes.ok) return [];

    const searchData = await searchRes.json();
    const videoIds = (searchData.items || [])
      .map(item => item.id?.videoId)
      .filter(Boolean);

    if (!videoIds.length) return [];

    // Step 2: Get video statistics
    const statsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    statsUrl.searchParams.set('part', 'statistics,contentDetails');
    statsUrl.searchParams.set('id', videoIds.join(','));
    statsUrl.searchParams.set('key', apiKey);

    const statsController = new AbortController();
    const statsTimer = setTimeout(() => statsController.abort(), 10000);

    const statsRes = await fetch(statsUrl.toString(), { signal: statsController.signal });
    clearTimeout(statsTimer);
    if (!statsRes.ok) return [];

    const statsData = await statsRes.json();
    const statsMap = new Map();
    for (const item of (statsData.items || [])) {
      statsMap.set(item.id, {
        viewCount:    parseInt(item.statistics?.viewCount || '0', 10),
        likeCount:    parseInt(item.statistics?.likeCount || '0', 10),
        commentCount: parseInt(item.statistics?.commentCount || '0', 10),
        duration:     item.contentDetails?.duration || '',
      });
    }

    return (searchData.items || []).map(item => {
      const videoId = item.id?.videoId;
      const stats = statsMap.get(videoId) || {};
      return {
        title:        item.snippet?.title || '',
        description:  item.snippet?.description || '',
        viewCount:    stats.viewCount || 0,
        likeCount:    stats.likeCount || 0,
        commentCount: stats.commentCount || 0,
        publishedAt:  item.snippet?.publishedAt || null,
        url:          `https://www.youtube.com/watch?v=${videoId}`,
        channelTitle: item.snippet?.channelTitle || '',
        duration:     stats.duration || '',
      };
    });
  } catch {
    return [];
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
