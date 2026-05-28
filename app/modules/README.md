# Module System Documentation

## Overview

The Drop-Predator application now features a split app type module system with clear differentiation between AI-driven research and Shopify automation. This architecture provides:

- **Separation of Concerns**: Research logic is completely independent of Shopify operations
- **Modularity**: Each module can be developed, tested, and deployed independently
- **Extensibility**: New modules can be added without modifying existing code
- **Testability**: Modules can be unit tested in isolation
- **Event-Driven Communication**: Modules communicate through events, reducing coupling

## Architecture

### Core Components

1. **Core Module System** (`app/modules/core/`)
   - `base-interface.js`: Base class that all modules must extend
   - `registry.js`: Central registry for module lifecycle management
   - Standard interfaces and event definitions

2. **Research Module** (`app/modules/research/`)
   - **Purpose**: AI-driven product research, sentiment analysis, market intelligence
   - **Capabilities**: Product discovery, sentiment analysis, competitive analysis
   - **Dependencies**: None (completely independent)
   - **Key Services**: 
     - Product research with multiple modes
     - Market intelligence scanning
     - Sentiment analysis and intent scoring

3. **Shopify Module** (`app/modules/shopify/`)
   - **Purpose**: Shopify store automation and integration
   - **Capabilities**: Product import, inventory management, order processing, pricing automation
   - **Dependencies**: None (completely independent)
   - **Key Services**:
     - Product import/export
     - Inventory updates
     - Order fulfillment
     - Pricing strategy application
     - Store configuration

4. **Orchestration Module** (`app/modules/orchestration/`)
   - **Purpose**: Coordinates workflows between Research and Shopify modules
   - **Capabilities**: Pipeline orchestration, workflow management, data transformation
   - **Dependencies**: ResearchModule, ShopifyModule
   - **Key Workflows**:
     - Profit Pipeline (Research → Transform → Import)
     - Intelligence Workflow (Market scan → Opportunity analysis)
     - Pricing Workflow (Research → Pricing strategy → Application)

## Module Interface

All modules extend the `ModuleInterface` base class:

```javascript
import { ModuleInterface, ModuleCapabilities } from './core/base-interface.js';

class CustomModule extends ModuleInterface {
  constructor(config = {}) {
    super(config);
    this.name = 'CustomModule';
    this.version = '1.0.0';
    this.dependencies = []; // No dependencies
    this.capabilities = [
      ModuleCapabilities.CUSTOM_CAPABILITY,
    ];
  }

  async onInitialize() {
    // Module initialization logic
  }

  async onCleanup() {
    // Module cleanup logic
  }

  async healthCheck() {
    // Return module health status
  }
}
```

## Usage Examples

### Basic Module Usage

```javascript
import { ResearchModule } from './modules/research/research-module.js';
import { getModuleConfig } from './modules/config.js';

// Initialize module
const config = getModuleConfig('research');
const researchModule = new ResearchModule(config);
await researchModule.initialize();

// Use module functionality
const results = await researchModule.researchProduct({
  product: 'wireless headphones',
  mode: 'full',
  onProgress: (progress) => {
    console.log(`${progress.phase}: ${progress.message}`);
  },
});

// Cleanup when done
await researchModule.cleanup();
```

### Using the Module Registry

```javascript
import { initializeModuleSystem, getModule, checkModuleHealth } from './modules/index.js';

// Initialize entire module system
const { researchModule, shopifyModule, orchestrationModule, registry } = 
  await initializeModuleSystem({
    research: { /* config */ },
    shopify: { /* config */ },
    orchestration: { /* config */ },
  });

// Get specific module
const research = getModule('ResearchModule');

// Check health of all modules
const health = await checkModuleHealth();
console.log(health);

// Cleanup when done
const { cleanupModuleSystem } = await import('./modules/index.js');
await cleanupModuleSystem();
```

### Orchestration Workflow

```javascript
import { OrchestrationModule } from './modules/orchestration/orchestration-module.js';

const orchestration = new OrchestrationModule();
orchestration.setModuleReferences(researchModule, shopifyModule);
await orchestration.initialize();

// Execute profit pipeline
const results = await orchestration.executeProfitPipeline({
  product: 'wireless headphones',
  shopifyContext: { admin, shop: 'my-shop.myshopify.com' },
  config: {
    researchMode: 'full',
    importEnabled: true,
  },
  onProgress: (progress) => {
    console.log(`${progress.phase}: ${progress.message}`);
  },
});
```

## API Endpoints

### Modular Research Endpoint

**POST** `/api/modules/research`

```json
{
  "product": "wireless headphones",
  "mode": "full"
}
```

Response: NDJSON stream with research progress and results.

### Modular Pipeline Endpoint

**POST** `/api/modules/pipeline`

```json
{
  "product": "wireless headphones",
  "importEnabled": true,
  "researchMode": "full",
  "config": {}
}
```

Response: NDJSON stream with pipeline progress and final results.

### Module Health Check

**GET** `/api/modules/health`

Response: JSON with health status of all modules.

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "modules": {
    "ResearchModule": {
      "status": "healthy",
      "details": { /* ... */ }
    },
    "ShopifyModule": {
      "status": "healthy",
      "details": { /* ... */ }
    },
    "OrchestrationModule": {
      "status": "healthy",
      "details": { /* ... */ }
    }
  },
  "metadata": [ /* ... */ ]
}
```

## Configuration

Module configuration is centralized in `app/modules/config.js`:

```javascript
export const moduleConfig = {
  research: {
    aiEnabled: true,
    sources: {
      reddit: { enabled: true, rateLimit: 30 },
      hackernews: { enabled: true, rateLimit: 30 },
      // ...
    },
  },
  shopify: {
    apiVersion: '2024-01',
    import: { autoPublish: false },
    pricing: { defaultMode: 'standard' },
  },
  orchestration: {
    pipeline: { importEnabled: false },
    workflows: { /* ... */ },
  },
};
```

## Event System

Modules communicate through events defined in `ModuleEvents`:

```javascript
import { ModuleEvents } from './core/base-interface.js';

// Subscribe to events
registry.on(ModuleEvents.PRODUCT_DISCOVERED, (data) => {
  console.log('Product discovered:', data);
});

// Emit events
registry.emit(ModuleEvents.PRODUCT_DISCOVERED, { 
  product: 'wireless headphones', 
  results: researchResults 
});
```

## Migration Guide

### Migrating from Old Routes

Old route (direct service imports):
```javascript
import { fullSentimentScan } from "../services/intelligence/index.js";

const signals = await fullSentimentScan({ /* ... */ });
```

New route (modular approach):
```javascript
import { ResearchModule } from "../modules/research/research-module.js";

const researchModule = new ResearchModule(config);
await researchModule.initialize();

const results = await researchModule.researchProduct({
  product: 'wireless headphones',
  mode: 'full',
  onProgress: (progress) => { /* ... */ },
});

await researchModule.cleanup();
```

## Benefits

1. **Clear Separation**: Research logic never directly calls Shopify functions
2. **Independent Testing**: Each module can be tested in isolation
3. **Flexible Deployment**: Modules can be deployed independently if needed
4. **Easy Debugging**: Issues can be isolated to specific modules
5. **Event-Driven**: Loose coupling through event communication
6. **Extensible**: New modules can be added without modifying existing code

## Future Enhancements

- Add monitoring and analytics for module performance
- Implement module versioning and compatibility checks
- Add hot-reloading capabilities for development
- Create module marketplace for third-party extensions
- Implement distributed module execution across services

## Troubleshooting

### Module Initialization Fails

Check if:
- All dependencies are registered before initialization
- Configuration is valid for the module
- Required environment variables are set

### Events Not Firing

Ensure:
- Module registry is properly initialized
- Event handlers are registered before events are emitted
- Global `window.moduleRegistry` is available in browser contexts

### Health Check Fails

Verify:
- All modules are properly initialized
- External services (AI APIs, Shopify) are accessible
- Network connectivity is available

## Support

For issues or questions about the module system:
1. Check this documentation
2. Review module-specific documentation in respective directories
3. Check health endpoint: `/api/modules/health`
4. Review logs for specific error messages