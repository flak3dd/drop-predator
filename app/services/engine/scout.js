/* eslint-disable no-undef */
import { getNicheConfig } from '../../data/products.js';
import { fetchLiveProducts } from './live-catalog.js';

export async function scoutProducts(niche, config, log) {
  const nicheConf = getNicheConfig(niche);

  let products;
  try {
    products = await fetchLiveProducts(niche, config, log);
    log(`Loaded ${products.length} products from live catalog`);
  } catch (err) {
    log(`Live catalog unavailable: ${err.message}`);
    log('Configure CJ_EMAIL + CJ_PASSWORD or ALI_APP_KEY + ALI_APP_SECRET to enable live dropshipping sourcing.');
    products = [];
  }

  if (products._sentimentEnriched) {
    log('Sentiment enrichment already applied by live catalog');
    return products;
  }

  try {
    const signals = await scoutReddit(nicheConf.redditSubs, log);
    let boosts = 0;
    signals.forEach(sig => {
      products.forEach(p => {
        const words = p.name.toLowerCase().split(/\s+/);
        const hit = words.some(w => w.length > 3 && sig.title.toLowerCase().includes(w));
        if (hit) {
          p.score = Math.min(100, p.score + 3);
          p.trend = Math.min(99, p.trend + 2);
          if (!p.sources.includes('Reddit')) p.sources.push('Reddit');
          boosts++;
        }
      });
    });
    log(`Reddit enrichment: ${signals.length} signals → ${boosts} product boosts`);
  } catch (err) { log(`Reddit scan skipped (${err.message})`); }

  if (process.env.SERPAPI_KEY) {
    try {
      await enrichGoogleTrends(products, nicheConf.keywords, log);
    } catch (err) { log(`Google Trends enrichment skipped (${err.message})`); }
  }

  return products;
}

const REDDIT_UA = 'Predator-Engine/1.0 (product-research)';

async function scoutReddit(subreddits, log) {
  const signals = [];
  for (const sub of subreddits.slice(0, 3)) {
    try {
      log(`Scanning r/${sub}…`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/hot.json?limit=15&raw_json=1`,
        { headers: { 'User-Agent': REDDIT_UA }, signal: controller.signal }
      );
      clearTimeout(timer);
      if (!res.ok) { log(`r/${sub} returned ${res.status}, skipping`); continue; }
      const data = await res.json();
      const posts = data.data.children
        .map(c => ({ title: c.data.title, score: c.data.score, ratio: c.data.upvote_ratio }))
        .filter(p => p.ratio > 0.7 && p.score > 50);
      signals.push(...posts);
      log(`r/${sub}: ${posts.length} high-signal posts`);
      await sleep(350);
    } catch (err) { log(`r/${sub} failed: ${err.message}`); }
  }
  return signals;
}

async function enrichGoogleTrends(products, keywords, log) {
  for (const keyword of keywords.slice(0, 2)) {
    try {
      const url = new URL('https://serpapi.com/search');
      url.searchParams.set('engine', 'google_trends');
      url.searchParams.set('q', keyword);
      url.searchParams.set('api_key', process.env.SERPAPI_KEY);
      const res = await fetch(url.toString());
      if (!res.ok) continue;
      const data = await res.json();
      const interest = data.interest_over_time?.timeline_data?.slice(-1)[0]?.values?.[0]?.extracted_value || 0;
      log(`Google Trends "${keyword}": interest ${interest}/100`);
      products.forEach(p => {
        if (p.name.toLowerCase().includes(keyword.split(' ')[0])) {
          p.searches = Math.round(p.searches * (0.8 + (interest / 100) * 0.4));
        }
      });
    } catch { /* non-fatal */ }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
