/**
 * app/services/suppliers/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Singleton supplier router — import this everywhere instead of calling
 * fetchFromCJ / fetchFromAliExpress directly.
 *
 * Usage
 * ─────
 * import { supplierRouter } from '../suppliers/index.js';
 * const products = await supplierRouter.search(keywords, { log });
 * const order    = await supplierRouter.createOrder(items, addr, token);
 * const health   = supplierRouter.healthSnapshot();
 */

import { CJSupplier }           from './cj.js';
import { AliExpressSupplier }   from './aliexpress.js';
import { Alibaba1688Supplier }  from './alibaba1688.js';
import { SupplierRouter }       from './router.js';

// Priority order matters — AliExpress first for ordering capability
export const supplierRouter = new SupplierRouter([
  new AliExpressSupplier(),
  new CJSupplier(),
  new Alibaba1688Supplier(),
]);

// Re-export everything for convenience
export { SupplierBase }         from './interface.js';
export { CJSupplier }           from './cj.js';
export { AliExpressSupplier }   from './aliexpress.js';
export { Alibaba1688Supplier }  from './alibaba1688.js';
export { SupplierRouter }       from './router.js';
