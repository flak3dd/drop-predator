/**
 * app/modules/__tests__/module-system.test.js
 * 
 * Basic tests for the module system.
 * Run with: npm test -- app/modules/__tests__/module-system.test.js
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  ModuleInterface, 
  ModuleCapabilities,
  initializeModuleSystem,
  getModule,
  checkModuleHealth,
  cleanupModuleSystem,
} from '../app/modules/index.js';
import { getModuleConfig, updateModuleConfig } from '../app/modules/config.js';

// Test module implementation
class TestModule extends ModuleInterface {
  constructor(config = {}) {
    super(config);
    this.name = 'TestModule';
    this.version = '1.0.0';
    this.dependencies = [];
    this.capabilities = [ModuleCapabilities.PRODUCT_DISCOVERY];
    this.initializedData = null;
  }

  async onInitialize() {
    this.initializedData = this.config.testData || 'default';
  }

  async onCleanup() {
    this.initializedData = null;
  }

  async healthCheck() {
    const baseHealth = await super.healthCheck();
    return {
      ...baseHealth,
      details: {
        ...baseHealth.details,
        testData: this.initializedData,
      },
    };
  }
}

describe('Module System', () => {
  beforeEach(() => {
    // Reset config before each test
    updateModuleConfig('research', { aiEnabled: true });
  });

  afterEach(async () => {
    // Cleanup after each test
    try {
      await cleanupModuleSystem();
    } catch {
      // Ignore cleanup errors in tests
    }
  });

  describe('ModuleInterface', () => {
    it('should create a module with correct metadata', () => {
      const module = new TestModule({ testData: 'custom' });
      
      expect(module.name).toBe('TestModule');
      expect(module.version).toBe('1.0.0');
      expect(module.dependencies).toEqual([]);
      expect(module.capabilities).toContain(ModuleCapabilities.PRODUCT_DISCOVERY);
    });

    it('should initialize module with config', async () => {
      const module = new TestModule({ testData: 'custom' });
      expect(module.initialized).toBe(false);
      
      await module.initialize();
      expect(module.initialized).toBe(true);
      expect(module.initializedData).toBe('custom');
    });

    it('should not allow double initialization', async () => {
      const module = new TestModule();
      await module.initialize();
      
      await expect(module.initialize()).rejects.toThrow('already initialized');
    });

    it('should cleanup properly', async () => {
      const module = new TestModule({ testData: 'custom' });
      await module.initialize();
      expect(module.initializedData).toBe('custom');
      
      await module.cleanup();
      expect(module.initialized).toBe(false);
      expect(module.initializedData).toBeNull();
    });

    it('should check dependencies correctly', () => {
      const module = new TestModule();
      module.dependencies = ['NonExistentModule'];
      
      expect(module.checkDependencies(['TestModule'])).toBe(false);
      expect(module.checkDependencies(['TestModule', 'NonExistentModule'])).toBe(true);
    });

    it('should return correct metadata', () => {
      const module = new TestModule({ testData: 'custom' });
      const metadata = module.getMetadata();
      
      expect(metadata.name).toBe('TestModule');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.initialized).toBe(false);
      expect(metadata.config.testData).toBe('custom');
    });
  });

  describe('Module Configuration', () => {
    it('should get module config', () => {
      const config = getModuleConfig('research');
      expect(config).toHaveProperty('aiEnabled');
      expect(config).toHaveProperty('sources');
    });

    it('should update module config', () => {
      updateModuleConfig('research', { aiEnabled: false });
      const config = getModuleConfig('research');
      expect(config.aiEnabled).toBe(false);
    });

    it('should get all config', () => {
      const { getAllConfig } = require('../app/modules/config.js');
      const allConfig = getAllConfig();
      expect(allConfig).toHaveProperty('research');
      expect(allConfig).toHaveProperty('shopify');
      expect(allConfig).toHaveProperty('orchestration');
    });
  });

  describe('Module Health Check', () => {
    it('should return healthy status for initialized module', async () => {
      const module = new TestModule({ testData: 'custom' });
      await module.initialize();
      
      const health = await module.healthCheck();
      expect(health.status).toBe('healthy');
      expect(health.details.testData).toBe('custom');
    });

    it('should return unhealthy status for uninitialized module', async () => {
      const module = new TestModule();
      
      const health = await module.healthCheck();
      expect(health.status).toBe('unhealthy');
    });
  });

  describe('Module Registry', () => {
    it('should register and retrieve modules', async () => {
      const { default: registry } = await import('../app/modules/core/registry.js');
      const module = new TestModule();
      
      registry.register(module);
      expect(registry.has('TestModule')).toBe(true);
      expect(registry.get('TestModule')).toBe(module);
      
      registry.unregister('TestModule');
    });

    it('should not allow duplicate registration', async () => {
      const { default: registry } = await import('../app/modules/core/registry.js');
      const module1 = new TestModule();
      const module2 = new TestModule();
      
      registry.register(module1);
      expect(() => registry.register(module2)).toThrow('already registered');
      
      registry.unregister('TestModule');
    });

    it('should emit and receive events', async () => {
      const { default: registry } = await import('../app/modules/core/registry.js');
      let receivedEvent = null;
      
      registry.on('test-event', (data) => {
        receivedEvent = data;
      });
      
      registry.emit('test-event', { message: 'test' });
      expect(receivedEvent).toEqual({ message: 'test' });
    });
  });

  describe('Module System Integration', () => {
    it('should initialize complete module system', async () => {
      const modules = await initializeModuleSystem({
        research: { aiEnabled: true },
        shopify: { admin: null, shop: 'test-shop' },
        orchestration: {},
      });
      
      expect(modules.researchModule).toBeDefined();
      expect(modules.shopifyModule).toBeDefined();
      expect(modules.orchestrationModule).toBeDefined();
      expect(modules.registry).toBeDefined();
    });

    it('should get modules from registry', async () => {
      await initializeModuleSystem({
        research: { aiEnabled: true },
        shopify: { admin: null, shop: 'test-shop' },
        orchestration: {},
      });
      
      const research = getModule('ResearchModule');
      const shopify = getModule('ShopifyModule');
      
      expect(research).toBeDefined();
      expect(shopify).toBeDefined();
    });

    it('should check health of all modules', async () => {
      await initializeModuleSystem({
        research: { aiEnabled: true },
        shopify: { admin: null, shop: 'test-shop' },
        orchestration: {},
      });
      
      const health = await checkModuleHealth();
      
      expect(health).toHaveProperty('ResearchModule');
      expect(health).toHaveProperty('ShopifyModule');
      expect(health).toHaveProperty('OrchestrationModule');
    });

    it('should cleanup module system', async () => {
      await initializeModuleSystem({
        research: { aiEnabled: true },
        shopify: { admin: null, shop: 'test-shop' },
        orchestration: {},
      });
      
      await cleanupModuleSystem();
      
      const research = getModule('ResearchModule');
      expect(research).toBeNull();
    });
  });
});