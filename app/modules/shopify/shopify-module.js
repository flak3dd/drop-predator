/**
 * app/modules/shopify/shopify-module.js
 * 
 * Shopify Module - Shopify store automation and integration.
 * This module is completely independent of AI/research logic.
 */

import { ModuleInterface, ModuleCapabilities, ModuleEvents } from '../core/base-interface.js';

export class ShopifyModule extends ModuleInterface {
  constructor(config = {}) {
    super(config);
    this.name = 'ShopifyModule';
    this.version = '1.0.0';
    this.dependencies = []; // No dependencies on other modules
    this.capabilities = [
      ModuleCapabilities.PRODUCT_IMPORT,
      ModuleCapabilities.INVENTORY_MANAGEMENT,
      ModuleCapabilities.ORDER_PROCESSING,
      ModuleCapabilities.PRICING_AUTOMATION,
      ModuleCapabilities.STORE_CONFIGURATION,
    ];
    this.shopifyAdmin = null;
    this.shop = null;
  }

  async onInitialize() {
    console.log('[ShopifyModule] Initializing with config:', this.config);
    
    // Initialize Shopify admin client if credentials are provided
    if (this.config.admin) {
      this.shopifyAdmin = this.config.admin;
      this.shop = this.config.shop;
    }
  }

  /**
   * Set the Shopify admin context (typically from authenticate.admin)
   * @param {Object} admin - Shopify GraphQL admin client
   * @param {string} shop - Shop domain
   */
  setContext(admin, shop) {
    this.shopifyAdmin = admin;
    this.shop = shop;
  }

  /**
   * Import a product to Shopify
   * @param {Object} productData - Product data to import
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Import result
   */
  async importProduct(productData, onProgress) {
    if (!this.shopifyAdmin) {
      throw new Error('Shopify admin context not set. Call setContext() first.');
    }

    onProgress?.({ phase: 'validate', message: 'Validating product data...' });

    // Import the importer service
    const { importProduct } = await import('../../services/shopify/importer.js');

    onProgress?.({ phase: 'import', message: 'Creating product in Shopify...' });

    const result = await importProduct(this.shopifyAdmin, productData);

    // Emit event for other modules
    this.emit(ModuleEvents.PRODUCT_IMPORTED, { 
      shop: this.shop, 
      productData, 
      result 
    });

    return result;
  }

  /**
   * Bulk import products to Shopify
   * @param {Array<Object>} products - Array of product data to import
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Array<Object>>} Import results
   */
  async importProducts(products, onProgress) {
    if (!this.shopifyAdmin) {
      throw new Error('Shopify admin context not set. Call setContext() first.');
    }

    const results = [];
    const total = products.length;

    for (let i = 0; i < total; i++) {
      onProgress?.({ 
        phase: 'bulk', 
        message: `Importing product ${i + 1} of ${total}...`,
        progress: ((i + 1) / total) * 100 
      });

      try {
        const result = await this.importProduct(products[i], () => {});
        results.push({ success: true, product: products[i], result });
      } catch (err) {
        results.push({ success: false, product: products[i], error: err.message });
      }
    }

    return results;
  }

  /**
   * Update product pricing
   * @param {Object} params - Pricing parameters
   * @param {string} params.productId - Shopify product ID
   * @param {number} params.price - New price
   * @param {string} params.mode - Pricing mode: 'surge'|'undercut'|'psych'|'standard'
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Update result
   */
  async updatePricing(params, onProgress) {
    if (!this.shopifyAdmin) {
      throw new Error('Shopify admin context not set. Call setContext() first.');
    }

    const { productId, price, mode = 'standard' } = params;

    onProgress?.({ phase: 'calculate', message: `Calculating ${mode} pricing...` });

    // Import pricing service
    const { calculatePrice, updateShopifyPrice } = await import('../../services/shopify/pricing.js');

    const calculatedPrice = calculatePrice(price, mode);

    onProgress?.({ phase: 'update', message: 'Updating Shopify product price...' });

    const result = await updateShopifyPrice(this.shopifyAdmin, productId, calculatedPrice);

    // Emit event for other modules
    this.emit(ModuleEvents.PRICING_UPDATED, { 
      shop: this.shop, 
      productId, 
      mode, 
      oldPrice: price, 
      newPrice: calculatedPrice 
    });

    return result;
  }

  /**
   * Process an order (fulfillment logic)
   * @param {Object} orderData - Order data to process
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Processing result
   */
  async processOrder(orderData, onProgress) {
    if (!this.shopifyAdmin) {
      throw new Error('Shopify admin context not set. Call setContext() first.');
    }

    onProgress?.({ phase: 'validate', message: 'Validating order data...' });

    // Import AliExpress DS service for fulfillment
    const { placeOrder, getOrderStatus } = await import('../../services/shopify/aliexpress-ds.js');

    onProgress?.({ phase: 'fulfill', message: 'Placing order with supplier...' });

    const result = await placeOrder(orderData);

    onProgress?.({ phase: 'track', message: 'Setting up tracking...' });

    // Emit event for other modules
    this.emit(ModuleEvents.ORDER_PROCESSED, { 
      shop: this.shop, 
      orderData, 
      result 
    });

    return result;
  }

  /**
   * Update inventory levels
   * @param {Object} params - Inventory parameters
   * @param {string} params.productId - Shopify product ID
   * @param {number} params.quantity - New quantity
   * @param {string} params.locationId - Location ID (optional)
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Update result
   */
  async updateInventory(params, onProgress) {
    if (!this.shopifyAdmin) {
      throw new Error('Shopify admin context not set. Call setContext() first.');
    }

    const { productId, quantity, locationId } = params;

    onProgress?.({ phase: 'update', message: 'Updating inventory levels...' });

    const mutation = `
      mutation inventorySetOnHand($input: InventorySetOnHandInput!) {
        inventorySetOnHand(input: $input) {
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        inventoryItemId: productId,
        quantity: quantity,
        ...(locationId && { locationId: locationId }),
      },
    };

    const response = await this.shopifyAdmin.graphql(mutation, { variables });
    const result = await response.json();

    if (result.data?.inventorySetOnHand?.userErrors?.length > 0) {
      throw new Error(result.data.inventorySetOnHand.userErrors[0].message);
    }

    // Emit event for other modules
    this.emit(ModuleEvents.INVENTORY_UPDATED, { 
      shop: this.shop, 
      productId, 
      quantity, 
      locationId 
    });

    return result;
  }

  /**
   * Get store configuration
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Store configuration
   */
  async getStoreConfig(onProgress) {
    if (!this.shopifyAdmin) {
      throw new Error('Shopify admin context not set. Call setContext() first.');
    }

    onProgress?.({ phase: 'fetch', message: 'Fetching store configuration...' });

    const query = `
      query {
        shop {
          name
          email
          currency
          primaryDomain {
            url
          }
        }
      }
    `;

    const response = await this.shopifyAdmin.graphql(query);
    const result = await response.json();

    return result.data.shop;
  }

  /**
   * Generate a product listing using AI
   * @param {Object} productData - Product data to generate listing for
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Generated listing
   */
  async generateListing(productData, onProgress) {
    if (!this.shopifyAdmin) {
      throw new Error('Shopify admin context not set. Call setContext() first.');
    }

    onProgress?.({ phase: 'generate', message: 'Generating AI-powered listing...' });

    // Import listing generator service
    const { generateProductListing } = await import('../../services/shopify/listing-generator.js');

    const listing = await generateProductListing(productData);

    return listing;
  }

  /**
   * Get competitor pricing data
   * @param {Object} params - Competitor analysis parameters
   * @param {string} params.productHandle - Product handle to analyze
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Competitor pricing data
   */
  async getCompetitorPricing(params, onProgress) {
    if (!this.shopifyAdmin) {
      throw new Error('Shopify admin context not set. Call setContext() first.');
    }

    const { productHandle } = params;

    onProgress?.({ phase: 'analyze', message: 'Analyzing competitor pricing...' });

    // Import competitor price service
    const { analyzeCompetitorPricing } = await import('../../services/shopify/competitor-price.js');

    const result = await analyzeCompetitorPricing(this.shopifyAdmin, productHandle);

    return result;
  }

  /**
   * Manage AliExpress credentials
   * @param {Object} params - Credential parameters
   * @param {string} params.action - Action: 'get'|'set'|'delete'
   * @param {Object} params.credentials - Credentials (for set action)
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<Object>} Credential management result
   */
  async manageCredentials(params, onProgress) {
    const { action, credentials } = params;

    onProgress?.({ phase: action, message: `${action} AliExpress credentials...` });

    // Import credentials service
    const { getCredentials, setCredentials, deleteCredentials } = await import('../../services/shopify/ali-credentials.js');

    let result;
    switch (action) {
      case 'get':
        result = await getCredentials(this.shop);
        break;
      case 'set':
        result = await setCredentials(this.shop, credentials);
        break;
      case 'delete':
        result = await deleteCredentials(this.shop);
        break;
      default:
        throw new Error(`Invalid action: ${action}`);
    }

    return result;
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
    console.log('[ShopifyModule] Cleaning up');
    this.shopifyAdmin = null;
    this.shop = null;
  }

  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    return {
      ...baseHealth,
      details: {
        ...baseHealth.details,
        capabilities: this.capabilities,
        hasContext: !!(this.shopifyAdmin && this.shop),
        shop: this.shop,
      },
    };
  }
}