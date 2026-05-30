/**
 * Pathway Registry
 *
 * Exports all product sourcing pathways in priority order.
 * The engine cascades through these — if higher-priority pathways
 * return products, lower ones are skipped (unless merging is enabled).
 *
 * Each pathway exports: { name, isAvailable(), search(keywords, opts) }
 *
 * Priority order:
 *   A. Supplier APIs     — real supplier data (CJ, AliExpress, 1688)
 *   B. Google Shopping   — broad retail pricing via SERPAPI
 *   C. Trend Sourcing    — Reddit mining → Google Shopping validation
 *   D. AI Research       — Claude-generated product ideas + price validation
 *   E. Amazon Bestsellers — Amazon product data + demand signals via SERPAPI
 */

import * as googleShopping      from './google-shopping.js';
import * as trendSourcing        from './trend-sourcing.js';
import * as aiProductResearch    from './ai-product-research.js';
import * as amazonBestsellers    from './amazon-bestsellers.js';

/**
 * Pathways in cascade order (supplier APIs are handled separately
 * via supplierRouter — these are the alternative pathways).
 */
export const pathways = [
  googleShopping,
  trendSourcing,
  aiProductResearch,
  amazonBestsellers,
];

/**
 * Run all available pathways in parallel and merge results.
 *
 * @param {string[]} keywords
 * @param {object}   opts - { log, niche, subreddits, signals }
 * @returns {Promise<object[]>} raw products in _source schema
 */
export async function runAllPathways(keywords, opts = {}) {
  const { log = () => {} } = opts;
  const available = pathways.filter(p => p.isAvailable());

  if (available.length === 0) {
    log('[Pathways] No alternative pathways available');
    return [];
  }

  log(`[Pathways] Running ${available.length} alternative pathways: ${available.map(p => p.name).join(', ')}`);

  const settled = await Promise.allSettled(
    available.map(p =>
      p.search(keywords, opts)
        .then(items => {
          if (items.length) log(`[Pathways] ${p.name}: ${items.length} products`);
          return items;
        })
        .catch(err => {
          log(`[Pathways] ${p.name} failed: ${err.message}`);
          throw err;
        }),
    ),
  );

  const allProducts = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled' && r.value?.length) {
      allProducts.push(...r.value);
    }
  }

  log(`[Pathways] Total from alternatives: ${allProducts.length} products`);
  return allProducts;
}
