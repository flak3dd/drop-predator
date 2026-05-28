/**
 * app/modules/index.js
 * 
 * Main module system entry point.
 * Exports all modules and provides initialization utilities.
 */

import registry from './core/registry.js';
import { ModuleInterface, ModuleCapabilities, ModuleEvents } from './core/base-interface.js';
import { ResearchModule } from './research/research-module.js';
import { ShopifyModule } from './shopify/shopify-module.js';
import { OrchestrationModule } from './orchestration/orchestration-module.js';

// Export core classes and constants
export {
  ModuleInterface,
  ModuleCapabilities,
  ModuleEvents,
  registry,
};

// Export module classes
export {
  ResearchModule,
  ShopifyModule,
  OrchestrationModule,
};

/**
 * Initialize the complete module system with default configuration
 * @param {Object} config - Configuration object
 * @param {Object} config.research - Research module config
 * @param {Object} config.shopify - Shopify module config
 * @param {Object} config.orchestration - Orchestration module config
 * @returns {Promise<Object>} Initialized module instances
 */
export async function initializeModuleSystem(config = {}) {
  console.log('[ModuleSystem] Initializing module system...');

  // Create module instances
  const researchModule = new ResearchModule(config.research || {});
  const shopifyModule = new ShopifyModule(config.shopify || {});
  const orchestrationModule = new OrchestrationModule(config.orchestration || {});

  // Register modules
  registry.register(researchModule);
  registry.register(shopifyModule);
  registry.register(orchestrationModule);

  // Initialize all modules (dependency order)
  await registry.initializeAll();

  // Set module references for orchestration
  orchestrationModule.setModuleReferences(researchModule, shopifyModule);

  console.log('[ModuleSystem] Module system initialized successfully');

  // Make registry available globally for event handling
  if (typeof window !== 'undefined') {
    window.moduleRegistry = registry;
  }

  return {
    researchModule,
    shopifyModule,
    orchestrationModule,
    registry,
  };
}

/**
 * Get a specific module instance
 * @param {string} moduleName - Name of the module to get
 * @returns {ModuleInterface|null}
 */
export function getModule(moduleName) {
  return registry.get(moduleName);
}

/**
 * Check module system health
 * @returns {Promise<Object>} Health status of all modules
 */
export async function checkModuleHealth() {
  return await registry.healthCheckAll();
}

/**
 * Cleanup module system
 * @returns {Promise<void>}
 */
export async function cleanupModuleSystem() {
  console.log('[ModuleSystem] Cleaning up module system...');
  await registry.cleanupAll();
  console.log('[ModuleSystem] Module system cleaned up');
}