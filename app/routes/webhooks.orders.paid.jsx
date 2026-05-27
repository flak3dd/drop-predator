/**
 * app/routes/webhooks.orders.paid.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles Shopify orders/paid webhook.
 *
 * When a Shopify order is paid and:
 *   1. The shop has a connected AliExpress account (AliCredential)
 *   2. The setting autonomyLevel >= 4
 *
 * …we automatically place a DS order on AliExpress for each line item that
 * has an aliProductId stored against the EngineProduct.
 *
 * Line items without a known aliProductId are skipped (manual fulfillment
 * required for non-engine products).
 */

import { authenticate } from '../shopify.server';
import prisma from '../db.server.js';
import { createDsOrder } from '../services/shopify/aliexpress-ds.js';
import { getShopCredential } from '../services/shopify/ali-credentials.js';

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

  const orderId  = String(payload.id);
  const orderNum = `#${payload.order_number}`;

  console.log(`[ali-ds] orders/paid webhook: ${orderNum} (${orderId}) for ${shop}`);

  // ── Gate 1: settings check ─────────────────────────────────────────────────
  const settings = await prisma.setting.findUnique({ where: { shop } });
  const config   = settings?.engineConfig ? JSON.parse(settings.engineConfig) : {};
  const autonomy = config.autonomyLevel || 1;

  if (autonomy < 4) {
    console.log(`[ali-ds] ${orderNum}: autonomy level ${autonomy} < 4, skipping auto-fulfillment`);
    return new Response();
  }

  // ── Gate 2: connected AliExpress account ───────────────────────────────────
  const cred = await getShopCredential(shop);
  if (!cred) {
    console.log(`[ali-ds] ${orderNum}: no AliExpress credential for ${shop}, skipping`);
    return new Response();
  }

  // ── Build address from Shopify payload ────────────────────────────────────
  const sa = payload.shipping_address || payload.billing_address || {};
  const address = {
    name:        sa.name || `${sa.first_name || ''} ${sa.last_name || ''}`.trim() || 'Customer',
    phone:       sa.phone || '+10000000000',
    address1:    sa.address1 || '',
    address2:    sa.address2 || '',
    city:        sa.city    || '',
    province:    sa.province_code || '',
    countryCode: sa.country_code  || 'US',
    zip:         sa.zip           || '',
  };

  // ── Process each line item ─────────────────────────────────────────────────
  for (const item of payload.line_items || []) {
    const shopifyProductGid = `gid://shopify/Product/${item.product_id}`;

    // Look up EngineProduct by shopifyProductId to get aliProductId
    const engineProduct = await prisma.engineProduct.findFirst({
      where: { shop, shopifyProductId: shopifyProductGid },
      orderBy: { createdAt: 'desc' },
    });

    if (!engineProduct?.aliProductId) {
      console.log(`[ali-ds] ${orderNum}: no aliProductId for "${item.title}", skipping`);
      continue;
    }

    // Check if we already placed an AliExpress order for this Shopify order + product
    const existing = await prisma.aliOrder.findFirst({
      where: { shop, shopifyOrderId: orderId, aliProductId: engineProduct.aliProductId },
    });
    if (existing) {
      console.log(`[ali-ds] ${orderNum}: already ordered ${engineProduct.aliProductId}, skipping`);
      continue;
    }

    const productItems = [{
      productId:       engineProduct.aliProductId,
      name:            item.title,
      quantity:        item.quantity,
      skuAttr:         item.variant_title || '',
      shippingService: 'CAINIAO_STANDARD',
      cost:            engineProduct.cost || 0,
    }];

    // Create local record first
    const ao = await prisma.aliOrder.create({
      data: {
        shop,
        shopifyOrderId:  orderId,
        shopifyOrderNum: orderNum,
        aliProductId:    engineProduct.aliProductId,
        productName:     item.title,
        quantity:        item.quantity,
        skuAttr:         item.variant_title || '',
        shippingService: 'CAINIAO_STANDARD',
        productCost:     engineProduct.cost || 0,
        buyerAddress:    JSON.stringify(address),
        status:          'PLACING',
      },
    });

    try {
      const result = await createDsOrder({ productItems, address }, cred.accessToken);

      if (result.success && result.orderId) {
        await prisma.aliOrder.update({
          where: { id: ao.id },
          data: { aliOrderId: result.orderId, status: 'PLACED' },
        });
        console.log(`[ali-ds] ${orderNum}: placed AliExpress order ${result.orderId} for "${item.title}"`);
      } else {
        await prisma.aliOrder.update({
          where: { id: ao.id },
          data: { status: 'FAILED', errorCode: result.errorCode, errorMsg: result.errorMsg || 'Placement failed' },
        });
        console.warn(`[ali-ds] ${orderNum}: order failed for "${item.title}": ${result.errorMsg}`);
      }
    } catch (err) {
      await prisma.aliOrder.update({
        where: { id: ao.id },
        data: { status: 'FAILED', errorMsg: err.message },
      });
      console.error(`[ali-ds] ${orderNum}: exception for "${item.title}":`, err.message);
    }
  }

  return new Response();
};
