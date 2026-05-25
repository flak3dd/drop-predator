/* eslint-disable no-undef */
const REDDIT_UA = 'Predator-SentimentEngine/2.0 (product-research)';

function createSignal(source, data) {
  return {
    id:        `${source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    keyword:   data.keyword || '',
    title:     data.title || '',
    body:      data.body || '',
    score:     data.score || 0,
    comments:  data.comments || 0,
    sentiment: data.sentiment ?? 0,
    url:       data.url || '',
    hypeScore: 0,
    ts:        data.ts || Date.now(),
    raw:       data.raw || null,
  };
}

async function scanReddit(subreddits, keywords, opts = {}) {
  const signals = [];
  const limit = opts.postsPerSub || 25;
  const timeout = opts.timeout || 8000;

  for (const sub of subreddits.slice(0, 5)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const res = await fetch(
        `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}&raw_json=1`,
        { headers: { 'User-Agent': REDDIT_UA }, signal: controller.signal }
      );
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();

      for (const child of (data.data?.children || [])) {
        const post = child.data;
        if (!post || post.stickied) continue;

        const text = `${post.title} ${post.selftext || ''}`.toLowerCase();
        const matchedKw = keywords.find(kw =>
          kw.split(/\s+/).every(word => text.includes(word.toLowerCase()))
        );

        if (matchedKw || !keywords.length) {
          signals.push(createSignal('reddit', {
            keyword:   matchedKw || sub,
            title:     post.title,
            body:      (post.selftext || '').slice(0, 300),
            score:     post.score,
            comments:  post.num_comments,
            sentiment: quickSentiment(post.title + ' ' + (post.selftext || '')),
            url:       `https://reddit.com${post.permalink}`,
            ts:        post.created_utc * 1000,
            raw:       { ratio: post.upvote_ratio, flair: post.link_flair_text },
          }));
        }
      }
      await sleep(400);
    } catch { /* non-fatal */ }
  }
  return signals;
}

async function scanHackerNews(keywords, opts = {}) {
  const signals = [];
  const limit = opts.limit || 30;

  try {
    for (const kw of keywords.slice(0, 5)) {
      const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(kw)}&tags=story&hitsPerPage=${limit}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();

      for (const hit of (data.hits || [])) {
        signals.push(createSignal('hackernews', {
          keyword:   kw,
          title:     hit.title || '',
          body:      '',
          score:     hit.points || 0,
          comments:  hit.num_comments || 0,
          sentiment: quickSentiment(hit.title || ''),
          url:       hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          ts:        new Date(hit.created_at).getTime(),
        }));
      }
      await sleep(300);
    }
  } catch { /* non-fatal */ }
  return signals;
}

async function scanGoogleTrends(keywords) {
  if (!process.env.SERPAPI_KEY) return [];
  const signals = [];

  for (const kw of keywords.slice(0, 5)) {
    try {
      const url = new URL('https://serpapi.com/search');
      url.searchParams.set('engine', 'google_trends');
      url.searchParams.set('q', kw);
      url.searchParams.set('data_type', 'TIMESERIES');
      url.searchParams.set('api_key', process.env.SERPAPI_KEY);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();

      const timeline = data.interest_over_time?.timeline_data || [];
      const recent = timeline.slice(-4);
      const values = recent.map(t => t.values?.[0]?.extracted_value || 0);
      const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

      let velocity = 0;
      if (values.length >= 2) {
        velocity = values[values.length - 1] - values[0];
      }

      const risingQueries = (data.related_queries?.rising || []).map(q => q.query);

      signals.push(createSignal('google-trends', {
        keyword:   kw,
        title:     `Google Trends: "${kw}" — interest ${Math.round(avg)}/100`,
        body:      risingQueries.length ? `Rising queries: ${risingQueries.slice(0, 5).join(', ')}` : '',
        score:     Math.round(avg),
        sentiment: velocity > 10 ? 0.6 : velocity > 0 ? 0.3 : velocity < -10 ? -0.4 : 0,
        url:       `https://trends.google.com/trends/explore?q=${encodeURIComponent(kw)}`,
        raw:       { values, velocity, risingQueries },
      }));
    } catch { /* non-fatal */ }
  }
  return signals;
}

async function scanTikTokHashtags(keywords) {
  const signals = [];
  for (const kw of keywords.slice(0, 5)) {
    const hashtag = kw.replace(/\s+/g, '').toLowerCase();
    signals.push(createSignal('tiktok', {
      keyword:   kw,
      title:     `TikTok hashtag: #${hashtag}`,
      body:      `Monitoring #${hashtag} for viral signals`,
      score:     0,
      sentiment: 0.2,
      url:       `https://www.tiktok.com/tag/${hashtag}`,
      raw:       { hashtag },
    }));
  }
  return signals;
}

async function aiAnalyzeSentiment(signals) {
  if (!process.env.ANTHROPIC_API_KEY || !signals.length) return signals;

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const batch = signals.slice(0, 15);
    const titles = batch.map((s, i) => `${i}: "${s.title}"`).join('\n');

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: 'You are a market sentiment analyst. Return ONLY valid JSON array, no markdown.',
      messages: [{
        role: 'user',
        content: `Analyze the sentiment and market hype potential of these signals.\nFor each, return sentiment (-1.0 to 1.0) and hype_potential (0-100).\n\n${titles}\n\nReturn JSON array: [{"i": 0, "sentiment": 0.5, "hype": 75, "reason": "short reason"}, ...]`,
      }],
    });

    const raw = msg.content[0].text.trim();
    const results = JSON.parse(raw.match(/\[.*\]/s)[0]);

    for (const r of results) {
      if (typeof r.i === 'number' && batch[r.i]) {
        batch[r.i].sentiment = Math.max(-1, Math.min(1, r.sentiment || 0));
        batch[r.i].hypeScore = Math.max(0, Math.min(100, r.hype || 0));
        batch[r.i]._aiAnalyzed = true;
      }
    }
  } catch { /* non-fatal */ }

  return signals;
}

const POSITIVE_WORDS = new Set([
  'amazing', 'awesome', 'best', 'brilliant', 'excellent', 'fantastic', 'great',
  'incredible', 'love', 'outstanding', 'perfect', 'recommend', 'superb', 'trending',
  'viral', 'wonderful', 'must-have', 'game-changer', 'innovative', 'revolutionary',
  'obsessed', 'impressed', 'beautiful', 'essential', 'favorite',
]);

const NEGATIVE_WORDS = new Set([
  'awful', 'bad', 'broke', 'cheap', 'complaint', 'disappointing', 'fail', 'fraud',
  'garbage', 'horrible', 'junk', 'overpriced', 'poor', 'problem', 'refund', 'regret',
  'ripoff', 'scam', 'terrible', 'useless', 'waste', 'worst', 'defective', 'flimsy',
]);

const HYPE_AMPLIFIERS = new Set([
  'sold out', 'waitlist', 'back in stock', 'restocked', 'limited edition',
  'everyone talking', 'blowing up', 'going crazy', 'tiktok made me', 'went viral',
]);

function quickSentiment(text) {
  if (!text) return 0;
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/);
  let pos = 0, neg = 0;

  for (const w of words) {
    if (POSITIVE_WORDS.has(w)) pos++;
    if (NEGATIVE_WORDS.has(w)) neg++;
  }
  for (const phrase of POSITIVE_WORDS) {
    if (phrase.includes(' ') && lower.includes(phrase)) pos += 2;
  }
  for (const phrase of NEGATIVE_WORDS) {
    if (phrase.includes(' ') && lower.includes(phrase)) neg += 2;
  }

  const total = pos + neg;
  if (total === 0) return 0;
  return parseFloat(((pos - neg) / total).toFixed(2));
}

function computeHypeScore(signal) {
  let hype = 0;

  const engagement = signal.score + (signal.comments * 2);
  if (engagement > 1000) hype += 35;
  else if (engagement > 500)  hype += 28;
  else if (engagement > 200)  hype += 20;
  else if (engagement > 100)  hype += 14;
  else if (engagement > 50)   hype += 8;
  else if (engagement > 10)   hype += 3;

  hype += Math.round((signal.sentiment + 1) / 2 * 25);

  const sourceWeights = { 'reddit': 12, 'hackernews': 10, 'google-trends': 15, 'tiktok': 14, 'producthunt': 8 };
  hype += sourceWeights[signal.source] || 5;

  const ageHours = (Date.now() - signal.ts) / 3600000;
  if (ageHours < 1)       hype += 15;
  else if (ageHours < 6)  hype += 12;
  else if (ageHours < 24) hype += 8;
  else if (ageHours < 72) hype += 4;

  const lower = `${signal.title} ${signal.body}`.toLowerCase();
  let ampHits = 0;
  for (const amp of HYPE_AMPLIFIERS) {
    if (lower.includes(amp)) ampHits++;
  }
  hype += Math.min(10, ampHits * 4);

  return Math.min(100, Math.max(0, hype));
}

export async function fullSentimentScan(config, onProgress) {
  const {
    subreddits = [], keywords = [],
    enableReddit = true, enableHN = true, enableTrends = true,
    enableTikTok = true, enableAiAnalysis = true,
  } = config;

  const allSignals = [];
  const progress = (src, count) => { if (onProgress) onProgress(src, count); };

  const scanners = [];
  if (enableReddit && subreddits.length) {
    scanners.push(scanReddit(subreddits, keywords).then(s => { progress('reddit', s.length); return s; }).catch(() => []));
  }
  if (enableHN && keywords.length) {
    scanners.push(scanHackerNews(keywords).then(s => { progress('hackernews', s.length); return s; }).catch(() => []));
  }
  if (enableTrends && keywords.length) {
    scanners.push(scanGoogleTrends(keywords).then(s => { progress('google-trends', s.length); return s; }).catch(() => []));
  }
  if (enableTikTok && keywords.length) {
    scanners.push(scanTikTokHashtags(keywords).then(s => { progress('tiktok', s.length); return s; }).catch(() => []));
  }

  const results = await Promise.all(scanners);
  for (const batch of results) allSignals.push(...batch);

  for (const signal of allSignals) signal.hypeScore = computeHypeScore(signal);

  if (enableAiAnalysis) {
    const highEngagement = allSignals
      .filter(s => s.score > 20 || s.hypeScore > 40)
      .sort((a, b) => b.hypeScore - a.hypeScore)
      .slice(0, 15);

    if (highEngagement.length) {
      await aiAnalyzeSentiment(highEngagement);
      for (const s of highEngagement) s.hypeScore = computeHypeScore(s);
      progress('ai-analysis', highEngagement.length);
    }
  }

  allSignals.sort((a, b) => b.hypeScore - a.hypeScore);
  return allSignals;
}

export { createSignal, quickSentiment, computeHypeScore, scanReddit, scanHackerNews, scanGoogleTrends, scanTikTokHashtags };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
