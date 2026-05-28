/**
 * app/modules/research/research-module.js
 * 
 * Research Module - AI-driven product research, analysis, and market intelligence.
 * This module is completely independent of Shopify or e-commerce logic.
 */

import { ModuleInterface, ModuleCapabilities, ModuleEvents } from '../core/base-interface.js';
import {
  fullSentimentScan,
  quickSentiment,
  computeHypeScore,
  extractProductMentions,
  crossNicheCorrelation,
} from '../../services/intelligence/index.js';

export class ResearchModule extends ModuleInterface {
  constructor(config = {}) {
    super(config);
    this.name = 'ResearchModule';
    this.version = '1.0.0';
    this.dependencies = []; // No dependencies on other modules
    this.capabilities = [
      ModuleCapabilities.PRODUCT_DISCOVERY,
      ModuleCapabilities.SENTIMENT_ANALYSIS,
      ModuleCapabilities.MARKET_INTELLIGENCE,
      ModuleCapabilities.COMPETITIVE_ANALYSIS,
    ];
  }

  async onInitialize() {
    console.log('[ResearchModule] Initializing with config:', this.config);
    // Initialize any research-specific resources
    // This module is stateless by design
  }

  /**
   * Perform comprehensive product research
   * @param {Object} params - Research parameters
   * @param {string} params.product - Product name to research
   * @param {string} params.mode - Research mode: 'full'|'sentiment'|'compare'|'themes'
   * @param {Function} params.onProgress - Progress callback function
   * @returns {Promise<Object>} Research results
   */
  async researchProduct(params) {
    const { product, mode = 'full', onProgress } = params;

    if (!product || typeof product !== 'string' || !product.trim()) {
      throw new Error('Product name is required');
    }

    const validModes = ['full', 'sentiment', 'compare', 'themes'];
    if (!validModes.includes(mode)) {
      throw new Error(`Invalid mode. Use: ${validModes.join(', ')}`);
    }

    const productName = product.trim();
    const keywords = productName
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2);

    onProgress?.({ phase: 'init', message: `Starting ${mode} research for "${productName}"` });

    let results = {};

    if (mode === 'full' || mode === 'sentiment') {
      onProgress?.({ phase: 'sentiment', message: 'Scanning social platforms for sentiment...' });
      
      const signals = await fullSentimentScan({
        subreddits: this.deriveSubs(productName),
        keywords: [productName, ...keywords.slice(0, 3)],
        enableReddit: true,
        enableHN: true,
        enableTrends: true,
        enableTikTok: false,
        enableAiAnalysis: !!process.env.ANTHROPIC_API_KEY,
      }, (progress) => {
        onProgress?.({ phase: 'sentiment', detail: progress });
      });

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

      // Extract themes
      const themes = this.extractThemes(signals);

      // Overall score
      const avgHype = signals.length > 0
        ? signals.reduce((sum, s) => sum + s.hypeScore, 0) / signals.length
        : 0;
      const overallScore = Math.min(10, Math.max(0,
        (avgSentiment + 1) * 3.5 + (avgHype / 100) * 3
      )).toFixed(1);

      results = {
        ...results,
        sentiment: {
          score: overallScore,
          signals: signals.length,
          positive: posPercent,
          neutral: neuPercent,
          negative: negPercent,
          avgSentiment: avgSentiment.toFixed(2),
          avgHype: Math.round(avgHype),
        },
        themes,
        topSignals: signals.slice(0, 10),
      };

      onProgress?.({ 
        phase: 'sentiment', 
        message: `Analyzed ${signals.length} signals`,
        detail: { posPercent, negPercent, neuPercent }
      });
    }

    if (mode === 'full') {
      onProgress?.({ phase: 'discovery', message: 'Extracting product mentions...' });
      const mentions = extractProductMentions(results.topSignals || []);
      
      onProgress?.({ phase: 'correlation', message: 'Analyzing cross-platform trends...' });
      const crossPlatform = crossNicheCorrelation(results.topSignals || []);

      onProgress?.({ phase: 'competition', message: 'Identifying competitors...' });
      const competitors = this.extractCompetitors(results.topSignals || [], productName);

      results = {
        ...results,
        discovery: {
          mentions: mentions.slice(0, 10),
          crossPlatform: crossPlatform.slice(0, 5),
          competitors,
        },
      };
    }

    if (mode === 'compare') {
      onProgress?.({ phase: 'compare', message: 'Running competitor analysis...' });
      
      const signals = await fullSentimentScan({
        subreddits: this.deriveSubs(productName),
        keywords: [productName],
        enableReddit: true,
        enableHN: true,
        enableTrends: false,
        enableTikTok: false,
        enableAiAnalysis: false,
      });

      for (const s of signals) s.hypeScore = computeHypeScore(s);
      signals.sort((a, b) => b.hypeScore - a.hypeScore);

      const competitors = this.extractCompetitors(signals, productName);

      const posCount = signals.filter(s => s.sentiment > 0.1).length;
      const negCount = signals.filter(s => s.sentiment < -0.1).length;
      const posPercent = signals.length > 0 ? Math.round((posCount / signals.length) * 100) : 0;
      const negPercent = signals.length > 0 ? Math.round((negCount / signals.length) * 100) : 0;

      results = {
        ...results,
        sentiment: {
          signals: signals.length,
          positive: posPercent,
          neutral: 100 - posPercent - negPercent,
          negative: negPercent,
        },
        themes: this.extractThemes(signals),
        competitors,
      };
    }

    if (mode === 'themes') {
      onProgress?.({ phase: 'themes', message: 'Extracting thematic topics...' });
      
      const signals = await fullSentimentScan({
        subreddits: this.deriveSubs(productName),
        keywords: [productName],
        enableReddit: true,
        enableHN: true,
        enableTrends: false,
        enableTikTok: false,
        enableAiAnalysis: false,
      });

      for (const s of signals) s.hypeScore = computeHypeScore(s);
      const themes = this.extractThemes(signals);

      const posCount = signals.filter(s => s.sentiment > 0.1).length;
      const negCount = signals.filter(s => s.sentiment < -0.1).length;
      const posPercent = signals.length > 0 ? Math.round((posCount / signals.length) * 100) : 0;
      const negPercent = signals.length > 0 ? Math.round((negCount / signals.length) * 100) : 0;

      results = {
        ...results,
        sentiment: {
          signals: signals.length,
          positive: posPercent,
          neutral: 100 - posPercent - negPercent,
          negative: negPercent,
        },
        themes,
      };
    }

    // Emit event for other modules
    this.emit(ModuleEvents.PRODUCT_DISCOVERED, { product, mode, results });

    return results;
  }

  /**
   * Perform market intelligence scan
   * @param {Object} params - Scan parameters
   * @param {string} params.niche - Market niche to scan
   * @param {Array<string>} params.sources - Data sources to scan
   * @param {Function} params.onProgress - Progress callback
   * @returns {Promise<Object>} Market intelligence results
   */
  async scanMarket(params) {
    const { niche, sources = ['reddit', 'hackernews', 'google-trends'], onProgress } = params;

    onProgress?.({ phase: 'init', message: `Starting market scan for niche: ${niche}` });

    // Import intelligence monitor
    const { getMonitor } = await import('../../services/intelligence/monitor.server.js');
    const monitor = getMonitor();

    onProgress?.({ phase: 'scanning', message: 'Scanning data sources...' });
    
    // This would trigger the actual scan
    const results = await monitor.scan(niche, sources, (progress) => {
      onProgress?.({ phase: 'scanning', detail: progress });
    });

    // Emit event for other modules
    this.emit(ModuleEvents.MARKET_SIGNAL_DETECTED, { niche, results });

    return results;
  }

  /**
   * Derive relevant subreddits from a product name
   * @private
   */
  deriveSubs(product) {
    const p = product.toLowerCase();
    const subs = ['BuyItForLife', 'ProductReviews'];

    if (p.includes('headphone') || p.includes('earbuds') || p.includes('audio') || p.includes('speaker'))
      subs.push('headphones', 'audiophile', 'HeadphoneAdvice');
    else if (p.includes('phone') || p.includes('iphone') || p.includes('samsung') || p.includes('pixel'))
      subs.push('smartphones', 'Android', 'iphone');
    else if (p.includes('laptop') || p.includes('computer') || p.includes('pc'))
      subs.push('SuggestALaptop', 'buildapc', 'laptops');
    else if (p.includes('camera') || p.includes('lens') || p.includes('photo'))
      subs.push('photography', 'cameras', 'videography');
    else if (p.includes('shoe') || p.includes('sneaker') || p.includes('boot'))
      subs.push('Sneakers', 'goodyearwelt', 'RunningShoeGeeks');
    else if (p.includes('watch') || p.includes('timepiece'))
      subs.push('Watches', 'WatchesCirclejerk');
    else if (p.includes('gym') || p.includes('fitness') || p.includes('workout') || p.includes('exercise'))
      subs.push('homegym', 'Fitness', 'GYM');
    else if (p.includes('skincare') || p.includes('beauty') || p.includes('cosmetic'))
      subs.push('SkincareAddiction', 'beauty', 'MakeupAddiction');
    else if (p.includes('gaming') || p.includes('console') || p.includes('controller'))
      subs.push('gaming', 'pcgaming', 'GameDeals');
    else if (p.includes('kitchen') || p.includes('cookware') || p.includes('knife'))
      subs.push('Cooking', 'BuyItForLife', 'chefknives');
    else
      subs.push('gadgets', 'coolguides');

    return subs.slice(0, 5);
  }

  /**
   * Extract common themes from signal titles
   * @private
   */
  extractThemes(signals) {
    if (signals.length === 0) return [];

    const stopwords = new Set([
      'the', 'a', 'an', 'is', 'it', 'to', 'in', 'for', 'of', 'and', 'or', 'but',
      'on', 'at', 'by', 'my', 'me', 'this', 'that', 'with', 'from', 'has', 'have',
      'had', 'was', 'were', 'be', 'been', 'am', 'are', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'just', 'not', 'all', 'any', 'can', 'what', 'how',
      'i', 'you', 'we', 'they', 'he', 'she', 'its', 'so', 'if', 'no', 'yes', 'new',
      'one', 'two', 'about', 'more', 'very', 'than', 'also', 'like', 'get', 'got',
      'vs', 'really', 'after', 'before', 'going', 'still', 'need', 'want', 'now',
    ]);

    const bigramCounts = {};
    const tokenCache = [];

    for (const s of signals) {
      const text = `${s.title} ${s.body || ''}`.toLowerCase().replace(/[^a-z0-9\s]/g, '');
      const words = text.split(/\s+/).filter(w => w.length > 2 && !stopwords.has(w));
      tokenCache.push(words);

      for (let i = 0; i < words.length - 1; i++) {
        const bigram = `${words[i]} ${words[i + 1]}`;
        bigramCounts[bigram] = (bigramCounts[bigram] || 0) + 1;
      }
    }

    const wordCounts = {};
    for (const words of tokenCache) {
      for (const w of words) {
        wordCounts[w] = (wordCounts[w] || 0) + 1;
      }
    }

    const themes = [];
    const sortedBigrams = Object.entries(bigramCounts)
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1]);

    for (const [bigram] of sortedBigrams.slice(0, 6)) {
      themes.push(bigram);
    }

    const covered = new Set(themes.join(' ').split(' '));
    const sortedWords = Object.entries(wordCounts)
      .filter(([w, c]) => c >= 2 && !covered.has(w))
      .sort((a, b) => b[1] - a[1]);

    for (const [word] of sortedWords.slice(0, 8 - themes.length)) {
      themes.push(word);
    }

    return themes.slice(0, 8);
  }

  /**
   * Extract competitor names mentioned in signals
   * @private
   */
  extractCompetitors(signals, productName) {
    const pLower = productName.toLowerCase();
    const mentions = {};

    for (const s of signals) {
      const text = `${s.title} ${s.body || ''}`.toLowerCase();
      const vsMatches = text.match(/vs\.?\s+([a-z0-9][\w\s-]{2,30})/gi) || [];
      for (const m of vsMatches) {
        const name = m.replace(/^vs\.?\s+/i, '').trim();
        if (name.length > 2 && !name.includes(pLower)) {
          mentions[name] = (mentions[name] || 0) + 1;
        }
      }

      const altMatches = text.match(/alternative(?:s)?\s+(?:to\s+)?([a-z0-9][\w\s-]{2,30})/gi) || [];
      for (const m of altMatches) {
        const name = m.replace(/alternative(?:s)?\s+(?:to\s+)?/i, '').trim();
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

  /**
   * Emit events through the module registry
   * @private
   */
  emit(event, data) {
    // This would use the registry to emit events
    // For now, we'll implement a simple version
    if (typeof window !== 'undefined' && window.moduleRegistry) {
      window.moduleRegistry.emit(event, data);
    }
  }

  async onCleanup() {
    console.log('[ResearchModule] Cleaning up');
    // No resources to clean up for this stateless module
  }

  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    // Check if AI services are available
    const aiAvailable = !!process.env.ANTHROPIC_API_KEY;
    
    return {
      ...baseHealth,
      details: {
        ...baseHealth.details,
        capabilities: this.capabilities,
        aiAvailable,
      },
    };
  }
}