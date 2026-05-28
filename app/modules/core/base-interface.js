/**
 * app/modules/core/base-interface.js
 * 
 * Base interface that all modules must implement.
 * Provides standard lifecycle methods and module metadata.
 */

export class ModuleInterface {
  constructor(config = {}) {
    this.config = config;
    this.name = this.constructor.name;
    this.version = '1.0.0';
    this.dependencies = [];
    this.initialized = false;
  }

  /**
   * Initialize the module with configuration
   * @param {Object} config - Module configuration
   * @returns {Promise<void>}
   */
  async initialize(config = {}) {
    if (this.initialized) {
      throw new Error(`Module ${this.name} is already initialized`);
    }
    
    this.config = { ...this.config, ...config };
    await this.onInitialize();
    this.initialized = true;
  }

  /**
   * Hook for subclasses to perform initialization
   * @protected
   */
  async onInitialize() {
    // Override in subclasses
  }

  /**
   * Check if module dependencies are satisfied
   * @param {Array<string>} availableModules - List of available module names
   * @returns {boolean}
   */
  checkDependencies(availableModules) {
    return this.dependencies.every(dep => availableModules.includes(dep));
  }

  /**
   * Get module metadata
   * @returns {Object}
   */
  getMetadata() {
    return {
      name: this.name,
      version: this.version,
      dependencies: this.dependencies,
      initialized: this.initialized,
      config: this.config,
    };
  }

  /**
   * Health check for the module
   * @returns {Promise<{status: 'healthy'|'unhealthy', details: Object}>}
   */
  async healthCheck() {
    return {
      status: this.initialized ? 'healthy' : 'unhealthy',
      details: {
        initialized: this.initialized,
        name: this.name,
      },
    };
  }

  /**
   * Cleanup module resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    await this.onCleanup();
    this.initialized = false;
  }

  /**
   * Hook for subclasses to perform cleanup
   * @protected
   */
  async onCleanup() {
    // Override in subclasses
  }
}

/**
 * Standard module capability interfaces
 */
export const ModuleCapabilities = {
  // Research capabilities
  PRODUCT_DISCOVERY: 'product-discovery',
  SENTIMENT_ANALYSIS: 'sentiment-analysis',
  MARKET_INTELLIGENCE: 'market-intelligence',
  COMPETITIVE_ANALYSIS: 'competitive-analysis',
  
  // Shopify capabilities
  PRODUCT_IMPORT: 'product-import',
  INVENTORY_MANAGEMENT: 'inventory-management',
  ORDER_PROCESSING: 'order-processing',
  PRICING_AUTOMATION: 'pricing-automation',
  STORE_CONFIGURATION: 'store-configuration',
  
  // Orchestration capabilities
  PIPELINE_ORCHESTRATION: 'pipeline-orchestration',
  WORKFLOW_MANAGEMENT: 'workflow-management',
  DATA_TRANSFORMATION: 'data-transformation',
};

/**
 * Standard event types for module communication
 */
export const ModuleEvents = {
  // Research events
  PRODUCT_DISCOVERED: 'research:product-discovered',
  SENTIMENT_ANALYZED: 'research:sentiment-analyzed',
  MARKET_SIGNAL_DETECTED: 'research:market-signal-detected',
  
  // Shopify events
  PRODUCT_IMPORTED: 'shopify:product-imported',
  INVENTORY_UPDATED: 'shopify:inventory-updated',
  ORDER_PROCESSED: 'shopify:order-processed',
  PRICING_UPDATED: 'shopify:pricing-updated',
  
  // Orchestration events
  PIPELINE_STARTED: 'orchestration:pipeline-started',
  PIPELINE_COMPLETED: 'orchestration:pipeline-completed',
  PIPELINE_FAILED: 'orchestration:pipeline-failed',
  WORKFLOW_TRANSITION: 'orchestration:workflow-transition',
};