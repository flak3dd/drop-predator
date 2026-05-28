/**
 * app/modules/core/registry.js
 * 
 * Central registry for module discovery, lifecycle management, and dependency resolution.
 */

import { ModuleInterface } from './base-interface.js';

class ModuleRegistry {
  constructor() {
    this.modules = new Map(); // name -> module instance
    this.moduleMetadata = new Map(); // name -> metadata
    this.eventHandlers = new Map(); // event -> handlers
  }

  /**
   * Register a module instance
   * @param {ModuleInterface} module - Module instance to register
   * @throws {Error} If module is invalid or already registered
   */
  register(module) {
    if (!(module instanceof ModuleInterface)) {
      throw new Error(`Module must extend ModuleInterface, got ${module.constructor.name}`);
    }

    if (this.modules.has(module.name)) {
      throw new Error(`Module ${module.name} is already registered`);
    }

    this.modules.set(module.name, module);
    this.moduleMetadata.set(module.name, module.getMetadata());
    
    console.log(`[ModuleRegistry] Registered module: ${module.name}`);
  }

  /**
   * Unregister a module
   * @param {string} moduleName - Name of module to unregister
   */
  unregister(moduleName) {
    const module = this.modules.get(moduleName);
    if (module) {
      module.cleanup().catch(err => {
        console.error(`[ModuleRegistry] Error cleaning up module ${moduleName}:`, err);
      });
      this.modules.delete(moduleName);
      this.moduleMetadata.delete(moduleName);
      console.log(`[ModuleRegistry] Unregistered module: ${moduleName}`);
    }
  }

  /**
   * Get a registered module by name
   * @param {string} moduleName - Name of module to get
   * @returns {ModuleInterface|null}
   */
  get(moduleName) {
    return this.modules.get(moduleName) || null;
  }

  /**
   * Check if a module is registered
   * @param {string} moduleName - Name of module to check
   * @returns {boolean}
   */
  has(moduleName) {
    return this.modules.has(moduleName);
  }

  /**
   * Get all registered module names
   * @returns {Array<string>}
   */
  getModuleNames() {
    return Array.from(this.modules.keys());
  }

  /**
   * Get metadata for all modules
   * @returns {Array<Object>}
   */
  getAllMetadata() {
    return Array.from(this.moduleMetadata.values());
  }

  /**
   * Initialize all modules in dependency order
   * @returns {Promise<void>}
   */
  async initializeAll() {
    const moduleNames = this.getModuleNames();
    const initialized = new Set();
    const failed = [];

    // Topological sort based on dependencies
    const remaining = new Set(moduleNames);
    
    while (remaining.size > 0) {
      let progress = false;
      
      for (const moduleName of Array.from(remaining)) {
        const module = this.modules.get(moduleName);
        const availableDeps = module.dependencies.filter(dep => initialized.has(dep));
        
        if (availableDeps.length === module.dependencies.length) {
          try {
            await module.initialize();
            initialized.add(moduleName);
            remaining.delete(moduleName);
            progress = true;
            console.log(`[ModuleRegistry] Initialized module: ${moduleName}`);
          } catch (err) {
            console.error(`[ModuleRegistry] Failed to initialize module ${moduleName}:`, err);
            failed.push(moduleName);
            remaining.delete(moduleName);
            progress = true;
          }
        }
      }
      
      if (!progress) {
        // Circular dependency or missing dependency
        const remainingList = Array.from(remaining);
        console.error(`[ModuleRegistry] Cannot resolve dependencies for: ${remainingList.join(', ')}`);
        failed.push(...remainingList);
        break;
      }
    }

    if (failed.length > 0) {
      throw new Error(`Failed to initialize modules: ${failed.join(', ')}`);
    }
  }

  /**
   * Initialize a specific module
   * @param {string} moduleName - Name of module to initialize
   * @returns {Promise<void>}
   */
  async initializeModule(moduleName) {
    const module = this.modules.get(moduleName);
    if (!module) {
      throw new Error(`Module ${moduleName} not found`);
    }

    // Check dependencies
    const availableModules = this.getModuleNames();
    if (!module.checkDependencies(availableModules)) {
      throw new Error(`Module ${moduleName} has unmet dependencies`);
    }

    await module.initialize();
  }

  /**
   * Health check for all modules
   * @returns {Promise<Object>}
   */
  async healthCheckAll() {
    const results = {};
    
    for (const [name, module] of this.modules) {
      try {
        results[name] = await module.healthCheck();
      } catch (err) {
        results[name] = {
          status: 'unhealthy',
          error: err.message,
        };
      }
    }
    
    return results;
  }

  /**
   * Subscribe to module events
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Unsubscribe from module events
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  off(event, handler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event to all subscribers
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[ModuleRegistry] Error in event handler for ${event}:`, err);
        }
      }
    }
  }

  /**
   * Cleanup all modules
   * @returns {Promise<void>}
   */
  async cleanupAll() {
    const moduleNames = this.getModuleNames();
    
    // Cleanup in reverse dependency order
    for (let i = moduleNames.length - 1; i >= 0; i--) {
      const moduleName = moduleNames[i];
      try {
        await this.unregister(moduleName);
      } catch (err) {
        console.error(`[ModuleRegistry] Error cleaning up module ${moduleName}:`, err);
      }
    }
  }
}

// Global singleton instance
const registry = new ModuleRegistry();

export default registry;
export { ModuleRegistry };