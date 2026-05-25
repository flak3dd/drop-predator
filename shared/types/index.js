/**
 * Shared type definitions for Drop Predator
 * Note: This is a JavaScript file with JSDoc type definitions for IDE support
 * For full TypeScript support, convert this to .d.ts or .ts files
 */

/**
 * @typedef {Object} Product
 * @property {string} id - Product ID
 * @property {string} productId - Shopify product ID
 * @property {string} productTitle - Product title
 * @property {string} productImage - Product image URL
 * @property {number} allocatedQuantity - Allocated quantity
 * @property {string} dropPrice - Drop price
 * @property {string} originalPrice - Original price
 */

/**
 * @typedef {Object} Drop
 * @property {string} id - Drop ID
 * @property {string} shop - Shop domain
 * @property {string} title - Drop title
 * @property {string} description - Drop description
 * @property {string} status - Drop status (DRAFT, SCHEDULED, ACTIVE, COMPLETED, CANCELLED)
 * @property {Date|null} scheduledAt - Scheduled date
 * @property {Date|null} startedAt - Start date
 * @property {Date|null} endedAt - End date
 * @property {Product[]} products - Products in the drop
 */

/**
 * @typedef {Object} EngineRun
 * @property {string} id - Engine run ID
 * @property {string} shop - Shop domain
 * @property {string} status - Run status (RUNNING, COMPLETED, FAILED)
 * @property {string} phase - Current phase
 * @property {Object} configuration - Engine configuration
 * @property {Date} startedAt - Start timestamp
 * @property {Date|null} completedAt - Completion timestamp
 */

/**
 * @typedef {Object} EngineProduct
 * @property {string} id - Product ID
 * @property {string} sourceId - Source product ID
 * @property {string} title - Product title
 * @property {string} description - Product description
 * @property {string} imageUrl - Product image URL
 * @property {number} price - Product price
 * @property {number} score - Product score
 * @property {number} margin - Margin percentage
 * @property {string} lifecycle - Product lifecycle stage
 * @property {Object} supplier - Supplier information
 * @property {boolean} imported - Whether imported to Shopify
 * @property {Date} discoveredAt - Discovery timestamp
 */

/**
 * @typedef {Object} Setting
 * @property {string} id - Setting ID
 * @property {string} shop - Shop domain
 * @property {boolean} autoActivate - Auto-activate overdue drops
 * @property {boolean} autoRevertPrice - Auto-revert prices on completion
 * @property {boolean} autoPublish - Auto-publish products
 * @property {string} engineConfig - Engine configuration JSON
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success - Whether the request was successful
 * @property {string} [message] - Response message
 * @property {*} [data] - Response data
 * @property {string} [error] - Error message if failed
 */

/**
 * @typedef {Object} EngineConfig
 * @property {number} scoreThreshold - Minimum score threshold
 * @property {number} marginFloor - Minimum margin percentage
 * @property {number} moqMax - Maximum MOQ
 * @property {number} autonomyLevel - Autonomy level (1-5)
 * @property {boolean} negotiationEnabled - Enable negotiation
 * @property {boolean} pricingEnabled - Enable dynamic pricing
 * @property {boolean} importEnabled - Enable auto-import
 * @property {boolean} deathPredictor - Enable death predictor
 * @property {boolean} surgeEnabled - Enable surge pricing
 */

/**
 * @typedef {'DRAFT'|'SCHEDULED'|'ACTIVE'|'COMPLETED'|'CANCELLED'} DropStatus
 */

/**
 * @typedef {'idle'|'Scout'|'Score'|'Negotiate'|'Price'|'Import'|'Monitor'} EnginePhase
 */

/**
 * @typedef {'RUNNING'|'COMPLETED'|'FAILED'} EngineRunStatus
 */

/**
 * @typedef {'viral'|'growing'|'peak'|'mature'|'dying'} ProductLifecycle
 */

/**
 * @typedef {'standard'|'surge'|'undercut'|'psych'} PricingMode
 */
