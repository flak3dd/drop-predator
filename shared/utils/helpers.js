/**
 * Shared utility functions for Drop Predator
 */

/**
 * Validate if a string is a valid Shopify domain
 * @param {string} domain - The domain to validate
 * @returns {boolean} True if valid Shopify domain
 */
export function isValidShopifyDomain(domain) {
  const shopifyDomainRegex = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;
  return shopifyDomainRegex.test(domain);
}

/**
 * Extract shop domain from Shopify admin URL
 * @param {string} url - The Shopify admin URL
 * @returns {string|null} The shop domain or null
 */
export function extractShopDomain(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    if (hostname.endsWith('.myshopify.com')) {
      return hostname;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Convert Shopify product GID to numeric ID
 * @param {string} gid - The Shopify GID
 * @returns {number|null} The numeric ID or null
 */
export function gidToId(gid) {
  if (!gid) return null;
  const parts = gid.split('/');
  const id = parts[parts.length - 1];
  const numericId = parseInt(id, 10);
  return isNaN(numericId) ? null : numericId;
}

/**
 * Convert numeric ID to Shopify GID
 * @param {number|string} id - The numeric ID
 * @param {string} type - The resource type (e.g., 'Product', 'ProductVariant')
 * @returns {string} The Shopify GID
 */
export function idToGid(id, type = 'Product') {
  return `gid://shopify/${type}/${id}`;
}

/**
 * Format a number as a percentage
 * @param {number} value - The value to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage
 */
export function formatPercentage(value, decimals = 1) {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Calculate the midpoint between two numbers
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Midpoint value
 */
export function midpoint(min, max) {
  return (min + max) / 2;
}

/**
 * Clamp a value between min and max
 * @param {number} value - The value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate a random color
 * @returns {string} Random hex color
 */
export function randomColor() {
  return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array, empty object)
 * @param {*} value - The value to check
 * @returns {boolean} True if empty
 */
export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Remove undefined values from an object
 * @param {Object} obj - The object to clean
 * @returns {Object} Cleaned object
 */
export function removeUndefined(obj) {
  const cleaned = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      cleaned[key] = obj[key];
    }
  }
  return cleaned;
}

/**
 * Merge two objects deeply
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
export function deepMerge(target, source) {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise} Promise that resolves after duration
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delay - Initial delay in ms
 * @returns {Promise} Promise that resolves when function succeeds
 */
export async function retry(fn, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(delay * Math.pow(2, i));
    }
  }
}
