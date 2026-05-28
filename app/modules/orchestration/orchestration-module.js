/**
 * app/modules/orchestration/orchestration-module.js
 * 
 * Orchestration Module - Coordinates workflows between Research and Shopify modules.
 * This module contains no business logic, only coordination and data transformation.
 */

import { ModuleInterface, ModuleCapabilities, ModuleEvents } from '../core/base-interface.js';

export class OrchestrationModule extends ModuleInterface {
  constructor(config = {}) {
    super(config);
    this.name = 'OrchestrationModule';
    this.version = '1.0.0';
    this.dependencies = ['ResearchModule', 'ShopifyModule'];
    this.capabilities = [
      ModuleCapabilities.PIPELINE_ORCHESTRATION,
      ModuleCapabilities.WORKFLOW_MANAGEMENT,
      ModuleCapabilities.DATA_TRANSFORMATION,
    ];
    this.researchModule = null;
    this.shopifyModule = null;
  }

  async onInitialize() {
    console.log('[OrchestrationModule] Initializing with config:', this.config);
    
    // Get references to dependent modules
    if (typeof window !== 'undefined' && window.moduleRegistry) {
      this.researchModule = window.moduleRegistry.get('ResearchModule');
      this.shopifyModule = window.moduleRegistry.get('ShopifyModule');
    }
  }

  /**
   * Set module references manually (for server-side usage)
   * @param {ResearchModule} researchModule 
   * @param {ShopifyModule} shopifyModule 
   */
  setModuleReferences(researchModule, shopifyModule) {
    this.researchModule = researchModule;
    this.shopifyModule = shopifyModule;
  }

  /**
   * Execute the complete profit pipeline: Research → Transform → Import
   * @param {Object} params - Pipeline parameters
   * @param {string} params.product - Product to research
   * @param {Object} params.shopifyContext - Shopify admin context
   * @param {Object} params.config - Pipeline configuration
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Pipeline results
   */
  async executeProfitPipeline(params, onProgress) {
    const { product, shopifyContext, config = {} } = params;

    onProgress?.({ 
      phase: 'init', 
      message: 'Starting profit pipeline...',
      workflow: 'profit-pipeline' 
    });

    this.emit(ModuleEvents.PIPELINE_STARTED, { product, config });

    try {
      // Phase 1: Research
      onProgress?.({ phase: 'research', message: 'Phase 1: Researching product...' });
      
      const researchResults = await this.researchModule.researchProduct({
        product,
        mode: config.researchMode || 'full',
        onProgress: (progress) => {
          onProgress?.({ phase: 'research', detail: progress });
        },
      });

      onProgress?.({ 
        phase: 'research', 
        message: 'Research complete',
        results: researchResults 
      });

      // Phase 2: Transform research data to product format
      onProgress?.({ phase: 'transform', message: 'Phase 2: Transforming data...' });

      const productData = this.transformResearchToProduct(researchResults, config);

      onProgress?.({ 
        phase: 'transform', 
        message: 'Data transformation complete',
        productData 
      });

      // Phase 3: Import to Shopify (if context provided)
      if (shopifyContext && config.importEnabled) {
        onProgress?.({ phase: 'import', message: 'Phase 3: Importing to Shopify...' });

        this.shopifyModule.setContext(shopifyContext.admin, shopifyContext.shop);

        const importResult = await this.shopifyModule.importProduct(productData, (progress) => {
          onProgress?.({ phase: 'import', detail: progress });
        });

        onProgress?.({ 
          phase: 'import', 
          message: 'Import complete',
          importResult 
        });

        this.emit(ModuleEvents.PIPELINE_COMPLETED, { 
          product, 
          researchResults, 
          importResult 
        });

        return {
          success: true,
          research: researchResults,
          product: productData,
          import: importResult,
        };
      } else {
        onProgress?.({ 
          phase: 'complete', 
          message: 'Pipeline complete (import skipped)' 
        });

        this.emit(ModuleEvents.PIPELINE_COMPLETED, { 
          product, 
          researchResults 
        });

        return {
          success: true,
          research: researchResults,
          product: productData,
          import: null,
        };
      }
    } catch (err) {
      this.emit(ModuleEvents.PIPELINE_FAILED, { product, error: err.message });
      throw err;
    }
  }

  /**
   * Execute market intelligence → product discovery workflow
   * @param {Object} params - Workflow parameters
   * @param {string} params.niche - Market niche to analyze
   * @param {Array<string>} params.sources - Data sources
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Workflow results
   */
  async executeIntelligenceWorkflow(params, onProgress) {
    const { niche, sources = ['reddit', 'hackernews', 'google-trends'] } = params;

    onProgress?.({ 
      phase: 'init', 
      message: 'Starting intelligence workflow...',
      workflow: 'intelligence' 
    });

    try {
      // Phase 1: Market scan
      onProgress?.({ phase: 'scan', message: 'Scanning market for signals...' });

      const scanResults = await this.researchModule.scanMarket({
        niche,
        sources,
        onProgress: (progress) => {
          onProgress?.({ phase: 'scan', detail: progress });
        },
      });

      onProgress?.({ 
        phase: 'scan', 
        message: 'Market scan complete',
        scanResults 
      });

      // Phase 2: Analyze opportunities
      onProgress?.({ phase: 'analyze', message: 'Analyzing opportunities...' });

      const opportunities = this.analyzeOpportunities(scanResults);

      onProgress?.({ 
        phase: 'analyze', 
        message: 'Opportunity analysis complete',
        opportunities 
      });

      return {
        success: true,
        scan: scanResults,
        opportunities,
      };
    } catch (err) {
      onProgress?.({ phase: 'error', message: `Workflow failed: ${err.message}` });
      throw err;
    }
  }

  /**
   * Execute product research → pricing strategy workflow
   * @param {Object} params - Workflow parameters
   * @param {string} params.product - Product to analyze
   * @param {Object} params.shopifyContext - Shopify admin context
   * @param {string} params.pricingMode - Pricing mode to use
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Workflow results
   */
  async executePricingWorkflow(params, onProgress) {
    const { product, shopifyContext, pricingMode = 'standard' } = params;

    onProgress?.({ 
      phase: 'init', 
      message: 'Starting pricing workflow...',
      workflow: 'pricing' 
    });

    try {
      // Phase 1: Research product
      onProgress?.({ phase: 'research', message: 'Researching product...' });

      const researchResults = await this.researchModule.researchProduct({
        product,
        mode: 'compare',
        onProgress: (progress) => {
          onProgress?.({ phase: 'research', detail: progress });
        },
      });

      onProgress?.({ 
        phase: 'research', 
        message: 'Research complete',
        researchResults 
      });

      // Phase 2: Calculate optimal pricing
      onProgress?.({ phase: 'pricing', message: 'Calculating optimal pricing...' });

      const pricingStrategy = this.calculatePricingStrategy(researchResults, pricingMode);

      onProgress?.({ 
        phase: 'pricing', 
        message: 'Pricing strategy calculated',
        pricingStrategy 
      });

      // Phase 3: Apply pricing if Shopify context provided
      if (shopifyContext && pricingStrategy.productId) {
        onProgress?.({ phase: 'apply', message: 'Applying pricing to product...' });

        this.shopifyModule.setContext(shopifyContext.admin, shopifyContext.shop);

        const applyResult = await this.shopifyModule.updatePricing({
          productId: pricingStrategy.productId,
          price: pricingStrategy.price,
          mode: pricingMode,
        }, (progress) => {
          onProgress?.({ phase: 'apply', detail: progress });
        });

        onProgress?.({ 
          phase: 'apply', 
          message: 'Pricing applied successfully',
          applyResult 
        });

        return {
          success: true,
          research: researchResults,
          pricing: pricingStrategy,
          applied: applyResult,
        };
      } else {
        return {
          success: true,
          research: researchResults,
          pricing: pricingStrategy,
          applied: null,
        };
      }
    } catch (err) {
      onProgress?.({ phase: 'error', message: `Workflow failed: ${err.message}` });
      throw err;
    }
  }

  /**
   * Transform research results into Shopify product format
   * @private
   */
  transformResearchToProduct(researchResults, config) {
    const { sentiment, themes, discovery } = researchResults;

    return {
      title: config.productTitle || 'Research-Based Product',
      description: this.generateDescription(researchResults),
      tags: themes || [],
      // Pricing based on sentiment analysis
      price: this.calculateBasePrice(sentiment),
      // SEO data from research
      seoTitle: this.generateSeoTitle(researchResults),
      metaDescription: this.generateMetaDescription(researchResults),
      // Research metadata
      researchMetadata: {
        sentiment: sentiment,
        themes: themes,
        competitors: discovery?.competitors || [],
      },
    };
  }

  /**
   * Generate product description from research
   * @private
   */
  generateDescription(researchResults) {
    const { themes, sentiment } = researchResults;
    
    let description = 'Based on market research, this product ';
    
    if (sentiment?.positive > 60) {
      description += 'has strong positive customer sentiment and high demand. ';
    } else if (sentiment?.negative > 40) {
      description += 'addresses common pain points mentioned in customer feedback. ';
    } else {
      description += 'meets identified market needs. ';
    }

    if (themes && themes.length > 0) {
      description += `Key features include: ${themes.slice(0, 3).join(', ')}.`;
    }

    return description;
  }

  /**
   * Calculate base price from sentiment data
   * @private
   */
  calculateBasePrice(sentiment) {
    // Base pricing logic - can be enhanced
    const basePrice = 29.99;
    
    if (!sentiment) return basePrice;

    // Higher positive sentiment = higher price potential
    const multiplier = 1 + (sentiment.positive / 100) * 0.5;
    
    return Math.round(basePrice * multiplier * 100) / 100;
  }

  /**
   * Generate SEO title from research
   * @private
   */
  generateSeoTitle(researchResults) {
    const { themes } = researchResults;
    
    if (themes && themes.length > 0) {
      return themes.slice(0, 2).join(' | ') + ' | Premium Quality';
    }
    
    return 'Premium Product | Quality Guaranteed';
  }

  /**
   * Generate meta description from research
   * @private
   */
  generateMetaDescription(researchResults) {
    const { sentiment, themes } = researchResults;
    
    let description = 'Discover ';
    
    if (themes && themes.length > 0) {
      description += themes.slice(0, 2).join(' and ');
    } else {
      description += 'our premium product';
    }
    
    description += '. ';
    
    if (sentiment?.positive > 70) {
      description += 'Highly rated by customers with excellent reviews.';
    } else {
      description += 'Quality guaranteed with customer satisfaction focus.';
    }
    
    return description;
  }

  /**
   * Analyze opportunities from scan results
   * @private
   */
  analyzeOpportunities(scanResults) {
    // Analyze scan results to identify opportunities
    // This is a simplified version - real implementation would be more sophisticated
    const opportunities = [];

    if (scanResults.signals && scanResults.signals.length > 0) {
      // Group signals by theme/sentiment to find opportunities
      const highHypeSignals = scanResults.signals
        .filter(s => s.hypeScore > 70)
        .slice(0, 5);

      for (const signal of highHypeSignals) {
        opportunities.push({
          type: 'trending',
          title: signal.title,
          source: signal.source,
          hypeScore: signal.hypeScore,
          sentiment: signal.sentiment,
          recommendation: 'Consider product development in this area',
        });
      }
    }

    return opportunities;
  }

  /**
   * Calculate pricing strategy from research
   * @private
   */
  calculatePricingStrategy(researchResults, mode) {
    const { sentiment, discovery } = researchResults;
    
    let price = 29.99;
    
    // Adjust base price based on sentiment
    if (sentiment) {
      const sentimentMultiplier = 1 + (sentiment.positive / 100) * 0.3;
      price = price * sentimentMultiplier;
    }

    // Apply pricing mode
    switch (mode) {
      case 'surge':
        price = price * 1.5; // 50% markup
        break;
      case 'undercut':
        price = price * 0.8; // 20% discount
        break;
      case 'psych':
        price = Math.ceil(price * 0.99 * 100) / 100; // Psychological pricing
        break;
      case 'standard':
      default:
        // Keep calculated price
        break;
    }

    return {
      mode,
      price: Math.round(price * 100) / 100,
      competitors: discovery?.competitors || [],
      sentiment: sentiment,
      productId: null, // Would be set if product exists
    };
  }

  /**
   * Emit events through the module registry
   * @private
   */
  emit(event, data) {
    if (typeof window !== 'undefined' && window.moduleRegistry) {
      window.moduleRegistry.emit(event, data);
    }
  }

  async onCleanup() {
    console.log('[OrchestrationModule] Cleaning up');
    this.researchModule = null;
    this.shopifyModule = null;
  }

  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    return {
      ...baseHealth,
      details: {
        ...baseHealth.details,
        capabilities: this.capabilities,
        hasResearchModule: !!this.researchModule,
        hasShopifyModule: !!this.shopifyModule,
      },
    };
  }
}