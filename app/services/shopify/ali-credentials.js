/**
 * app/services/engine/ali-credentials.js
 * ─────────────────────────────────────────────────────────────────────────────
 * DB-backed AliExpress OAuth credential management.
 * Separated from aliexpress-ds.js so that the pure API client (no DB imports)
 * stays safe for use in contexts where db.server.js must be server-only.
 */

import prisma from '../../db.server.js';
import { refreshOAuthToken } from './aliexpress-ds.js';

/**
 * Fetch stored AliExpress credentials for a shop, auto-refreshing if expired.
 * Returns null if the shop hasn't connected an AliExpress account.
 *
 * @param {string} shop - Shopify shop domain
 * @returns {Promise<AliCredential|null>}
 */
export async function getShopCredential(shop) {
  const cred = await prisma.aliCredential.findUnique({ where: { shop } });
  if (!cred) return null;

  // Refresh if access token expires within 5 minutes
  if (cred.accessTokenExpiry < new Date(Date.now() + 5 * 60 * 1000)) {
    try {
      const fresh = await refreshOAuthToken(cred.refreshToken);
      const updated = await prisma.aliCredential.update({
        where: { shop },
        data: {
          accessToken:        fresh.access_token,
          refreshToken:       fresh.refresh_token || cred.refreshToken,
          accessTokenExpiry:  new Date(Date.now() + fresh.expires_in * 1000),
          refreshTokenExpiry: fresh.r_expires_in
            ? new Date(Date.now() + fresh.r_expires_in * 1000)
            : cred.refreshTokenExpiry,
        },
      });
      return updated;
    } catch (err) {
      console.error('[ali-ds] Token refresh failed:', err.message);
      // Return the stale credential — caller will surface the auth error
      return cred;
    }
  }

  return cred;
}
