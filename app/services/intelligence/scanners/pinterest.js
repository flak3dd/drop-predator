/* eslint-disable no-undef */
/**
 * app/services/intelligence/scanners/pinterest.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pinterest social signal scanner.
 *
 * Searches Pinterest for trending pins related to product keywords. Pinterest
 * is highly visual and product-discovery oriented — high pin engagement
 * correlates strongly with impulse-buy potential and product virality.
 *
 * Uses RapidAPI Pinterest endpoint, or falls back to Pinterest API v5 if
 * PINTEREST_ACCESS_TOKEN is configured.
 *
 * Env vars:
 *   RAPIDAPI_PINTEREST_KEY  — RapidAPI key for Pinterest endpoint
 *   PINTEREST_ACCESS_TOKEN  — Pinterest API v5 token (alternative)
 *
 * Scanner interface: { name, isAvailable(), search(keywords, deps) }
 */

export const name = 'pinterest';

const RATE_LIMIT_MS = 400;

/**
 * Check if any Pinterest API credentials are configured.
 */
export function isAvailable() {
  return !!(
    process.env.RAPIDAPI_PINTEREST_KEY ||
    process.env.PINTEREST_ACCESS_TOKEN
  );
}

/**
 * Search Pinterest for keywords and return Signal objects.
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
      const pins = await fetchPinterestPins(kw);

      for (const pin of pins) {
        const saves = pin.saveCount || pin.repinCount || 0;
        const comments = pin.commentCount || 0;
        const reactions = pin.reactionCount || 0;

        // Filter: only keep pins with meaningful engagement
        if (saves < 10 && reactions < 5 && comments < 3) continue;

        const text = `${pin.title || ''} ${pin.description || ''}`;

        signals.push(createSignal('pinterest', {
          keyword:   kw,
          title:     (pin.title || text.slice(0, 100) || `Pinterest: ${kw}`).slice(0, 200),
          body:      (pin.description || '').slice(0, 300),
          score:     saves + reactions + comments * 2,
          comments:  comments,
          sentiment: quickSentiment(text),
          url:       pin.url || '',
          ts:        pin.createdAt ? new Date(pin.createdAt).getTime() : Date.now(),
          raw: {
            saveCount:     saves,
            reactionCount: reactions,
            boardName:     pin.boardName || '',
            imageUrl:      pin.imageUrl || '',
            dominantColor: pin.dominantColor || '',
          },
        }));
      }

      await sleep(RATE_LIMIT_MS);
    } catch { /* non-fatal — skip this keyword */ }
  }

  return signals;
}

// ─── API implementations ───────────────────────────────────────────────────

async function fetchPinterestPins(query) {
  if (process.env.RAPIDAPI_PINTEREST_KEY) {
    return fetchViaRapidAPI(query);
  }
  return fetchViaPinterestAPI(query);
}

/**
 * Pinterest search via RapidAPI.
 */
async function fetchViaRapidAPI(query) {
  const url = new URL('https://pinterest-scraper.p.rapidapi.com/api/pin/search');
  url.searchParams.set('keyword', query);
  url.searchParams.set('num', '20');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_PINTEREST_KEY,
        'x-rapidapi-host': 'pinterest-scraper.p.rapidapi.com',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    const data = await res.json();
    const items = data?.data || data?.results || data?.pins || [];

    return items.slice(0, 20).map(item => ({
      title:         item.title || item.grid_title || '',
      description:   item.description || item.grid_description || '',
      saveCount:     item.repin_count || item.save_count || item.aggregated_pin_data?.aggregated_stats?.saves || 0,
      commentCount:  item.comment_count || 0,
      reactionCount: item.reaction_counts?.total || item.total_reaction_count || 0,
      url:           item.id ? `https://www.pinterest.com/pin/${item.id}/` : item.link || '',
      createdAt:     item.created_at || null,
      boardName:     item.board?.name || '',
      imageUrl:      item.images?.['236x']?.url || item.image_medium_url || '',
      dominantColor: item.dominant_color || '',
    }));
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/**
 * Pinterest API v5 (official, requires access token from developer portal).
 * Uses search pins endpoint.
 */
async function fetchViaPinterestAPI(query) {
  const token = process.env.PINTEREST_ACCESS_TOKEN;
  if (!token) return [];

  try {
    const url = new URL('https://api.pinterest.com/v5/search/pins');
    url.searchParams.set('query', query);
    url.searchParams.set('page_size', '20');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];

    const data = await res.json();
    const items = data?.items || [];

    return items.map(item => ({
      title:         item.title || '',
      description:   item.description || item.note || '',
      saveCount:     item.save_count || 0,
      commentCount:  item.comment_count || 0,
      reactionCount: item.reaction_count || 0,
      url:           item.id ? `https://www.pinterest.com/pin/${item.id}/` : item.link || '',
      createdAt:     item.created_at || null,
      boardName:     item.board_id || '',
      imageUrl:      item.media?.images?.['150x150']?.url || '',
      dominantColor: item.dominant_color || '',
    }));
  } catch {
    return [];
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
