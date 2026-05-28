/**
 * app/modules/config.js
 * 
 * Module system configuration.
 * Centralized configuration for all modules.
 */

export const moduleConfig = {
  research: {
    // AI service configuration
    aiEnabled: !!process.env.ANTHROPIC_API_KEY,
    aiModel: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
    
    // Data source configuration
    sources: {
      reddit: {
        enabled: true,
        rateLimit: 30, // requests per minute
      },
      hackernews: {
        enabled: true,
        rateLimit: 30,
      },
      googleTrends: {
        enabled: !!process.env.SERPAPI_KEY,
        apiKey: process.env.SERPAPI_KEY,
      },
      tiktok: {
        enabled: false, // Requires additional setup
      },
      instagram: {
        enabled: false, // Requires additional setup
      },
    },
    
    // Research defaults
    defaultMode: 'full',
    maxSignals: 100,
    sentimentThreshold: 0.1,
  },

  shopify: {
    // Shopify API configuration
    apiVersion: '2024-01',
    timeout: 30000, // 30 seconds
    
    // Import configuration
    import: {
      autoPublish: false,
      generateListings: true,
      validateImages: true,
    },
    
    // Pricing configuration
    pricing: {
      defaultMode: 'standard',
      modes: {
        surge: { multiplier: 1.5, label: 'Surge Pricing' },
        undercut: { multiplier: 0.8, label: 'Competitive' },
        psych: { multiplier: 0.99, label: 'Psychological' },
        standard: { multiplier: 1.0, label: 'Standard' },
      },
    },
    
    // Inventory configuration
    inventory: {
      lowStockThreshold: 10,
      enableAutoReorder: false,
    },
  },

  orchestration: {
    // Pipeline configuration
    pipeline: {
      defaultResearchMode: 'full',
      importEnabled: false, // Default to false for safety
      timeout: 300000, // 5 minutes
    },
    
    // Workflow configuration
    workflows: {
      intelligence: {
        defaultSources: ['reddit', 'hackernews', 'google-trends'],
        maxSignals: 50,
      },
      pricing: {
        defaultMode: 'standard',
        requireShopifyContext: false,
      },
    },
    
    // Retry configuration
    retry: {
      maxAttempts: 3,
      backoffMs: 1000,
    },
  },

  // Event configuration
  events: {
    enableLogging: true,
    logLevel: 'info', // 'debug', 'info', 'warn', 'error'
  },
};

/**
 * Get configuration for a specific module
 * @param {string} moduleName - Name of the module
 * @returns {Object} Module configuration
 */
export function getModuleConfig(moduleName) {
  return moduleConfig[moduleName] || {};
}

/**
 * Update configuration for a specific module
 * @param {string} moduleName - Name of the module
 * @param {Object} updates - Configuration updates
 */
export function updateModuleConfig(moduleName, updates) {
  if (moduleConfig[moduleName]) {
    moduleConfig[moduleName] = { ...moduleConfig[moduleName], ...updates };
  }
}

/**
 * Get all module configuration
 * @returns {Object} All module configurations
 */
export function getAllConfig() {
  return { ...moduleConfig };
}