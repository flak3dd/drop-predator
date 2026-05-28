/**
 * app/routes/api.modules.health.jsx
 * 
 * Module system health check endpoint.
 * Provides status information for all modules.
 * 
 * GET /api/modules/health
 * 
 * Response: JSON with health status of all modules
 */

import { authenticate } from "../shopify.server";
import { initializeModuleSystem, checkModuleHealth, cleanupModuleSystem } from "../modules/index.js";
import { getModuleConfig } from "../modules/config.js";

export async function loader({ request }) {
  const { session, admin } = await authenticate.admin(request);

  try {
    // Initialize module system for health check
    const moduleConfig = {
      research: getModuleConfig('research'),
      shopify: {
        ...getModuleConfig('shopify'),
        admin: admin,
        shop: session.shop,
      },
      orchestration: getModuleConfig('orchestration'),
    };

    await initializeModuleSystem(moduleConfig);

    // Check health of all modules
    const healthResults = await checkModuleHealth();

    // Get metadata for all modules
    const { registry } = await import("../modules/index.js");
    const metadata = registry.getAllMetadata();

    // Cleanup after health check
    await cleanupModuleSystem();

    return Response.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      modules: healthResults,
      metadata: metadata,
    });

  } catch (err) {
    return Response.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: err.message,
    }, { status: 500 });
  }
}