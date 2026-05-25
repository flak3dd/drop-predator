/**
 * Shared constants for Drop Predator
 */

// Drop statuses
export const DROP_STATUSES = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

// Engine phases
export const ENGINE_PHASES = {
  IDLE: 'idle',
  SCOUT: 'Scout',
  SCORE: 'Score',
  NEGOTIATE: 'Negotiate',
  PRICE: 'Price',
  IMPORT: 'Import',
  MONITOR: 'Monitor',
};

// Engine run statuses
export const ENGINE_RUN_STATUSES = {
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

// Product lifecycle stages
export const PRODUCT_LIFECYCLE = {
  VIRAL: 'viral',
  GROWING: 'growing',
  PEAK: 'peak',
  MATURE: 'mature',
  DYING: 'dying',
};

// Pricing modes
export const PRICING_MODES = {
  STANDARD: 'standard',
  SURGE: 'surge',
  UNDERCUT: 'undercut',
  PSYCH: 'psych',
};

// Engine niches
export const ENGINE_NICHES = [
  { value: 'gym', label: 'Gym & tactical', icon: '🏋️' },
  { value: 'anxiety', label: 'Wellness', icon: '🧠' },
  { value: 'home', label: 'Home & kitchen', icon: '🏠' },
  { value: 'pet', label: 'Pet accessories', icon: '🐾' },
];

// Validation constants
export const VALIDATION = {
  MIN_TITLE_LENGTH: 3,
  MAX_TITLE_LENGTH: 100,
  MIN_DESCRIPTION_LENGTH: 10,
  MAX_DESCRIPTION_LENGTH: 500,
  MIN_DROP_PRICE: 0.01,
  MAX_DROP_PRICE: 10000,
  MIN_QUANTITY: 1,
  MAX_QUANTITY: 10000,
  MIN_SCORE_THRESHOLD: 50,
  MAX_SCORE_THRESHOLD: 95,
  MIN_MARGIN_FLOOR: 20,
  MAX_MARGIN_FLOOR: 60,
  MIN_AUTONOMY_LEVEL: 1,
  MAX_AUTONOMY_LEVEL: 5,
};

// Pagination constants
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 1,
};

// API constants
export const API = {
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
};

// Engine configuration defaults
export const DEFAULT_ENGINE_CONFIG = {
  scoreThreshold: 65,
  marginFloor: 35,
  moqMax: 50,
  autonomyLevel: 3,
  negotiationEnabled: true,
  pricingEnabled: true,
  importEnabled: false,
  deathPredictor: true,
  surgeEnabled: true,
};

// Color mapping for UI
export const STATUS_COLORS = {
  DRAFT: '#8888a0',
  SCHEDULED: '#448aff',
  ACTIVE: '#00e676',
  COMPLETED: '#ffc107',
  CANCELLED: '#ff4444',
};

export const SCORE_COLORS = {
  HIGH: '#00e676',
  MEDIUM: '#ffc107',
  LOW: '#ff4444',
};

// Shopify constants
export const SHOPIFY = {
  DEFAULT_API_VERSION: '2024-01',
  DEFAULT_SCOPES: 'read_products,write_products',
  PRODUCT_GID_PREFIX: 'gid://shopify/Product/',
  VARIANT_GID_PREFIX: 'gid://shopify/ProductVariant/',
};

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  SERVER_ERROR: 'Server error. Please try again later.',
  VALIDATION_ERROR: 'Please check your input and try again.',
  NOT_FOUND: 'The requested resource was not found.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  FORBIDDEN: 'You do not have permission to perform this action.',
};

// Date formats
export const DATE_FORMATS = {
  DISPLAY: 'MMM d, yyyy',
  DISPLAY_TIME: 'MMM d, yyyy h:mm a',
  ISO: 'yyyy-MM-ddTHH:mm:ss',
};
