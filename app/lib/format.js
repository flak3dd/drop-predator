/**
 * app/lib/format.js
 * ---------------------------------------------------------
 * Consolidated formatting utilities used across the app.
 */

/**
 * Format a number as a compact dollar string.
 * @param {number} n - Amount in dollars
 * @returns {string} e.g. "$1.2M", "$45k", "$129"
 */
export function fmt$(n) {
  if (n >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return "$" + (n / 1000).toFixed(0) + "k";
  return "$" + Math.round(n).toLocaleString();
}

/**
 * Format a duration between two dates as a human-readable string.
 * @param {Date} start
 * @param {Date} end
 * @returns {string} e.g. "2 days, 5h", "3h 22m", "45m"
 */
export function formatDuration(start, end) {
  const ms = end - start;
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0)
    return `${days} day${days !== 1 ? "s" : ""}, ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/**
 * Format a number as full currency using Intl.
 * @param {number} amount
 * @param {string} currency - ISO currency code (default: USD)
 * @returns {string} e.g. "$1,234.56"
 */
export function formatCurrency(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Format a date as a relative time string.
 * @param {Date|string} date
 * @returns {string} e.g. "2 hours ago", "3 days ago"
 */
export function formatRelativeTime(date) {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;

  return past.toLocaleDateString();
}
