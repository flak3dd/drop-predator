/* eslint-disable no-undef */
import { getNicheConfig } from '../../../engine/data/products.js';

const PRODUCT_PATTERNS = [
  /\bthis\s+([\w][\w\s]{2,30}?)\s+(?:is|was|has been)\s+(?:amazing|incredible|great|awesome|perfect|viral|trending)/gi,
  /\bjust\s+(?:got|bought|ordered|received)\s+(?:a|an|the|my|this)\s+([\w][\w\s]{2,30}?)(?:\s+and|\s+from|\s*[.!,])/gi,
  /\bbest\s+([\w][\w\s]{2,30}?)\s+(?:ever|I've|i've|I have|for the|on the|in)\b/gi,
  /\b([\w][\w\s]{2,30}?)\s+(?:went|going|is going|has gone)\s+viral\b/gi,
  /\btiktok\s+(?:made|convinced)\s+me\s+(?:buy|get|try)\s+(?:a|an|the|this)?\s*([\w][\w\s]{2,30}?)\s*[.!,]/gi,
];

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her',
  'its', 'our', 'their', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what',
  'which', 'who', 'some', 'any', 'all', 'most', 'other', 'new', 'old',
  'one', 'two', 'three', 'first', 'last', 'next', 'same', 'thing', 'stuff',
  'something', 'anything', 'people', 'person', 'way', 'time', 'year', 'day',
  'lot', 'kind', 'type', 'part', 'place', 'point', 'great', 'good', 'just',
]);

function extractProductMentions(signals) {
  const mentions = new Map();

  for (const signal of signals) {
    const text = `${signal.title} ${signal.body}`;

    for (const pattern of PRODUCT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const raw = (match[1] || '').trim().toLowerCase();
        const words = raw.split(/\s+/).filter(w => !STOP_WORDS.has(w) && w.length > 2);
        if (words.length === 0 || words.length > 5) continue;
        const normalized = words.join(' ');
        if (normalized.length < 4) continue;

        if (!mentions.has(normalized)) {
          mentions.set(normalized, { term: normalized, count: 0, signals: [], sentiments: [], totalHype: 0 });
        }
        const entry = mentions.get(normalized);
        entry.count++;
        entry.signals.push(signal.id);
        entry.sentiments.push(signal.sentiment);
        entry.totalHype += signal.hypeScore;
      }
    }
  }

  return mentions;
}

function crossNicheCorrelation(signals) {
  const kwMap = new Map();
  for (const s of signals) {
    const kw = s.keyword.toLowerCase();
    if (!kwMap.has(kw)) kwMap.set(kw, { sources: new Set(), signals: [], totalHype: 0 });
    const entry = kwMap.get(kw);
    entry.sources.add(s.source);
    entry.signals.push(s);
    entry.totalHype += s.hypeScore;
  }

  const correlations = [];
  for (const [kw, data] of kwMap) {
    if (data.sources.size >= 2) {
      const avgSentiment = data.signals.reduce((a, s) => a + s.sentiment, 0) / data.signals.length;
      correlations.push({
        keyword: kw,
        sourceCount: data.sources.size,
        sources: [...data.sources],
        signalCount: data.signals.length,
        avgHype: Math.round(data.totalHype / data.signals.length),
        avgSentiment: parseFloat(avgSentiment.toFixed(2)),
        crossScore: data.sources.size * 15 + data.signals.length * 3 + Math.round(data.totalHype / data.signals.length),
      });
    }
  }

  return correlations.sort((a, b) => b.crossScore - a.crossScore);
}

function findCatalogGaps(signals, existingProducts) {
  const productTerms = new Set();
  for (const p of existingProducts) {
    const words = p.name.toLowerCase().split(/\s+/);
    words.forEach(w => { if (w.length > 3) productTerms.add(w); });
    productTerms.add(p.name.toLowerCase());
  }

  const mentions = extractProductMentions(signals);
  const gaps = [];

  for (const [term, data] of mentions) {
    const termWords = term.split(/\s+/);
    const hasMatch = termWords.some(w => productTerms.has(w));

    if (!hasMatch && data.count >= 2) {
      const avgSentiment = data.sentiments.reduce((a, b) => a + b, 0) / data.sentiments.length;
      gaps.push({
        term,
        mentions: data.count,
        avgHype: Math.round(data.totalHype / data.count),
        avgSentiment: parseFloat(avgSentiment.toFixed(2)),
        gapScore: data.count * 10 + Math.round(data.totalHype / data.count) + (avgSentiment > 0 ? 15 : 0),
      });
    }
  }

  return gaps.sort((a, b) => b.gapScore - a.gapScore);
}

async function aiDiscoverProducts(signals, niche, existingNames) {
  if (!process.env.ANTHROPIC_API_KEY || !signals.length) return [];

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const topSignals = signals.filter(s => s.hypeScore > 30).sort((a, b) => b.hypeScore - a.hypeScore).slice(0, 12);
    const signalSummary = topSignals.map((s, i) => `${i + 1}. [${s.source}] "${s.title}" (hype: ${s.hypeScore}, sentiment: ${s.sentiment})`).join('\n');
    const existing = existingNames.slice(0, 10).join(', ');

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: 'You are a product research analyst for a dropshipping business. Return ONLY valid JSON, no markdown.',
      messages: [{
        role: 'user',
        content: `Based on these trending signals in the "${niche}" niche, identify 3-5 NEW product opportunities.\n\nTrending signals:\n${signalSummary}\n\nExisting products (avoid duplicates): ${existing}\n\nReturn JSON: {"products": [{"name": "<name>", "category": "<cat>", "whyNow": "<reason>", "estimatedMargin": <int 30-70>, "estimatedDemand": "<low|medium|high|viral>", "estimatedPrice": <float>, "riskLevel": "<low|medium|high>", "signalStrength": <int 0-100>}]}`,
      }],
    });

    const raw = msg.content[0].text.trim();
    const result = JSON.parse(raw.match(/\{.*\}/s)[0]);

    return (result.products || []).map((p, i) => ({
      ...p, id: `DISC-${Date.now()}-${i}`, discoveredAt: Date.now(), aiGenerated: true, niche, status: 'discovered',
    }));
  } catch { return []; }
}

function templateDiscoverProducts(signals, niche, existingNames) {
  const mentions = extractProductMentions(signals);
  const existingLower = new Set(existingNames.map(n => n.toLowerCase()));
  const discoveries = [];

  const sorted = [...mentions.entries()].sort((a, b) => b[1].totalHype - a[1].totalHype).slice(0, 8);

  for (const [term, data] of sorted) {
    if (existingLower.has(term)) continue;
    const avgSentiment = data.sentiments.reduce((a, b) => a + b, 0) / data.sentiments.length;
    if (avgSentiment < 0) continue;

    const nicheConf = getNicheConfig(niche);
    discoveries.push({
      id: `DISC-${Date.now()}-${discoveries.length}`,
      name: term.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
      category: nicheConf.label || niche,
      estimatedMargin: 40,
      estimatedDemand: data.count >= 5 ? 'high' : data.count >= 3 ? 'medium' : 'low',
      estimatedPrice: 0,
      riskLevel: avgSentiment > 0.3 ? 'low' : 'medium',
      signalStrength: Math.min(100, Math.round(data.totalHype / data.count) + data.count * 5),
      discoveredAt: Date.now(),
      aiGenerated: false,
      niche,
      status: 'discovered',
    });
  }

  return discoveries.slice(0, 5);
}

export async function runDiscovery(signals, niche, existingProducts, opts = {}) {
  const existingNames = existingProducts.map(p => p.name);
  const result = { discoveries: [], crossNiche: [], gaps: [], ts: Date.now() };

  result.crossNiche = crossNicheCorrelation(signals).slice(0, 10);
  result.gaps = findCatalogGaps(signals, existingProducts).slice(0, 10);

  if (opts.enableAi !== false) {
    result.discoveries = await aiDiscoverProducts(signals, niche, existingNames);
  }
  if (!result.discoveries.length) {
    result.discoveries = templateDiscoverProducts(signals, niche, existingNames);
  }

  return result;
}

export { extractProductMentions, crossNicheCorrelation, findCatalogGaps };
