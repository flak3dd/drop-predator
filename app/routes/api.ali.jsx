/**
 * app/routes/api.ali.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * AliExpress Dropshipping API endpoints.
 *
 * GET  /api/ali?intent=status        — connection status + stored credential info
 * GET  /api/ali?intent=freight       — estimate shipping (productId, qty, country)
 * GET  /api/ali?intent=product       — DS product details (productId)
 * GET  /api/ali?intent=orders        — list AliOrders for this shop
 * GET  /api/ali?intent=tracking      — tracking for an AliOrder (orderId)
 *
 * POST /api/ali  intent=connect      — initiate OAuth flow → redirect to AliExpress
 * POST /api/ali  intent=disconnect   — remove stored credential
 * POST /api/ali  intent=order        — manually place an AliExpress DS order
 * POST /api/ali  intent=cancelOrder  — mark an order CANCELLED (local only)
 *
 * GET  /api/ali/callback             — OAuth2 redirect_uri handler (no auth)
 */

import { authenticate } from '../shopify.server';
import prisma from '../db.server.js';
import {
  getDsProductDetails,
  getDsFreight,
  createDsOrder,
  getDsOrder,
  getDsTracking,
  getOAuthUrl,
  exchangeOAuthCode,
} from '../services/engine/aliexpress-ds.js';
import { getShopCredential } from '../services/engine/ali-credentials.js';
import { checkOrderCaps } from '../services/engine/risk-guard.js';

// ─── Loader (GET) ────────────────────────────────────────────────────────────

export async function loader({ request }) {
  const url = new URL(request.url);

  // OAuth callback — no Shopify auth, AliExpress redirects here
  if (url.pathname.endsWith('/callback')) {
    return handleOAuthCallback(request);
  }

  const { session } = await authenticate.admin(request);
  const shop   = session.shop;
  const intent = url.searchParams.get('intent') || 'status';

  if (intent === 'status') {
    const cred = await prisma.aliCredential.findUnique({ where: { shop } });
    return Response.json({
      connected:    !!cred,
      aliUserId:    cred?.aliUserId  || null,
      aliUserNick:  cred?.aliUserNick || null,
      tokenExpiry:  cred?.accessTokenExpiry || null,
      configured:   !!(process.env.ALI_APP_KEY && process.env.ALI_APP_SECRET),
    });
  }

  if (intent === 'orders') {
    const status = url.searchParams.get('status');
    const where  = { shop };
    if (status) where.status = status;
    const orders = await prisma.aliOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return Response.json({ orders });
  }

  if (intent === 'freight') {
    const productId = url.searchParams.get('productId');
    const qty       = parseInt(url.searchParams.get('qty') || '1');
    const country   = url.searchParams.get('country') || 'US';
    const skuId     = url.searchParams.get('skuId') || null;
    if (!productId) return Response.json({ error: 'productId required' }, { status: 400 });

    try {
      const options = await getDsFreight(productId, qty, { country, skuId });
      return Response.json({ options });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 502 });
    }
  }

  if (intent === 'product') {
    const productId = url.searchParams.get('productId');
    const country   = url.searchParams.get('country') || 'US';
    if (!productId) return Response.json({ error: 'productId required' }, { status: 400 });

    try {
      const product = await getDsProductDetails(productId, { country });
      return Response.json({ product });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 502 });
    }
  }

  if (intent === 'tracking') {
    const orderId = url.searchParams.get('orderId');
    if (!orderId) return Response.json({ error: 'orderId required' }, { status: 400 });

    const aliOrder = await prisma.aliOrder.findFirst({
      where: { id: orderId, shop },
    });
    if (!aliOrder) return Response.json({ error: 'Order not found' }, { status: 404 });
    if (!aliOrder.aliOrderId) return Response.json({ error: 'AliExpress order not yet placed' }, { status: 400 });

    try {
      const cred = await getShopCredential(shop);
      if (!cred) return Response.json({ error: 'AliExpress account not connected' }, { status: 401 });

      // Fetch latest tracking from AliExpress.
      // New API (aliexpress.logistics.ds.trackinginfo.query) requires logistics_no + out_ref.
      // If we don't have a tracking number yet, use aliOrderId as the out_ref to check status.
      const buyerAddr = (() => { try { return JSON.parse(aliOrder.buyerAddress || '{}'); } catch { return {}; } })();
      if (!aliOrder.trackingNumber) {
        return Response.json({ tracking: null, message: 'Tracking not yet available', order: aliOrder });
      }

      const tracking = await getDsTracking({
        logisticsNo: aliOrder.trackingNumber,
        outRef:      aliOrder.aliOrderId,
        serviceName: aliOrder.carrierCode || aliOrder.shippingService || 'CAINIAO_STANDARD',
        toArea:      buyerAddr.countryCode || 'US',
      }, cred.accessToken);

      // Persist tracking number if newly discovered
      if (tracking.trackingNumber && tracking.trackingNumber !== aliOrder.aliOrderId && !aliOrder.trackingNumber) {
        await prisma.aliOrder.update({
          where: { id: orderId },
          data: {
            trackingNumber: tracking.trackingNumber,
            carrierCode:    tracking.carrierCode || aliOrder.carrierCode,
            status:         tracking.status === 'SHIPPED' ? 'SHIPPED' : aliOrder.status,
            shippedAt:      aliOrder.shippedAt || new Date(),
          },
        });
      }

      return Response.json({ tracking, order: aliOrder });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 502 });
    }
  }

  return Response.json({ error: 'Unknown intent' }, { status: 400 });
}

// ─── Action (POST) ───────────────────────────────────────────────────────────

export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const body = await request.json();
  const { intent } = body;

  // ── Connect — start OAuth flow ──────────────────────────────────────────────
  if (intent === 'connect') {
    if (!process.env.ALI_APP_KEY || !process.env.ALI_APP_SECRET) {
      return Response.json(
        { error: 'ALI_APP_KEY and ALI_APP_SECRET must be set before connecting' },
        { status: 400 },
      );
    }

    const baseUrl     = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/ali/callback`;

    // Store shop in state so callback can find it
    const state    = Buffer.from(JSON.stringify({ shop })).toString('base64');
    const oauthUrl = getOAuthUrl(redirectUri, state);

    return Response.json({ oauthUrl });
  }

  // ── Disconnect ──────────────────────────────────────────────────────────────
  if (intent === 'disconnect') {
    await prisma.aliCredential.deleteMany({ where: { shop } });
    return Response.json({ ok: true });
  }

  // ── Place an order ──────────────────────────────────────────────────────────
  if (intent === 'order') {
    const { shopifyOrderId, shopifyOrderNum, productItems, address } = body;
    if (!shopifyOrderId || !productItems?.length || !address) {
      return Response.json({ error: 'shopifyOrderId, productItems and address required' }, { status: 400 });
    }

    const cred = await getShopCredential(shop);
    if (!cred) {
      return Response.json(
        { error: 'AliExpress account not connected. Connect via Settings → AliExpress Account.' },
        { status: 401 },
      );
    }

    // ── Risk guard: order value caps ──────────────────────────────────────
    const totalCost = productItems.reduce((s, item) => s + ((item.cost || 0) + (item.shippingCost || 0)) * (item.quantity || 1), 0);
    const capCheck = await checkOrderCaps({ shop, totalCost, supplier: 'AliExpress' });
    if (!capCheck.ok) {
      return Response.json(
        { error: `Order blocked by risk guard: ${capCheck.violations.join('; ')}` },
        { status: 422 },
      );
    }

    // Create local AliOrder records before attempting placement
    const createdOrders = [];
    for (const item of productItems) {
      const ao = await prisma.aliOrder.create({
        data: {
          shop,
          shopifyOrderId: String(shopifyOrderId),
          shopifyOrderNum: shopifyOrderNum || '',
          aliProductId:   String(item.productId || ''),
          productName:    item.name || 'Product',
          quantity:       item.quantity || 1,
          skuAttr:        item.skuAttr || '',
          shippingService: item.shippingService || 'CAINIAO_STANDARD',
          productCost:    item.cost || 0,
          shippingCost:   item.shippingCost || 0,
          totalCost:      (item.cost || 0) + (item.shippingCost || 0),
          currency:       item.currency || 'USD',
          buyerAddress:   JSON.stringify(address),
          status:         'PLACING',
        },
      });
      createdOrders.push(ao);
    }

    // Attempt to place the order on AliExpress
    try {
      const result = await createDsOrder({ productItems, address }, cred.accessToken);

      if (result.success && result.orderId) {
        // Update all local records with the AliExpress order ID
        for (const ao of createdOrders) {
          await prisma.aliOrder.update({
            where: { id: ao.id },
            data: { aliOrderId: result.orderId, status: 'PLACED' },
          });
        }
        return Response.json({ ok: true, orderId: result.orderId, orders: createdOrders.map(o => o.id) });
      } else {
        const errMsg = result.errorMsg || 'Order placement failed';
        for (const ao of createdOrders) {
          await prisma.aliOrder.update({
            where: { id: ao.id },
            data: { status: 'FAILED', errorCode: result.errorCode, errorMsg: errMsg },
          });
        }
        return Response.json({ error: errMsg, errorCode: result.errorCode }, { status: 502 });
      }
    } catch (err) {
      for (const ao of createdOrders) {
        await prisma.aliOrder.update({
          where: { id: ao.id },
          data: { status: 'FAILED', errorMsg: err.message },
        });
      }
      return Response.json({ error: err.message }, { status: 502 });
    }
  }

  // ── Cancel order (local flag only) ──────────────────────────────────────────
  if (intent === 'cancelOrder') {
    const { orderId } = body;
    const ao = await prisma.aliOrder.findFirst({ where: { id: orderId, shop } });
    if (!ao) return Response.json({ error: 'Order not found' }, { status: 404 });

    await prisma.aliOrder.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });
    return Response.json({ ok: true });
  }

  return Response.json({ error: 'Unknown intent' }, { status: 400 });
}

// ─── OAuth callback handler ───────────────────────────────────────────────────

async function handleOAuthCallback(request) {
  const url   = new URL(request.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code) {
    return new Response('Missing OAuth code', { status: 400 });
  }

  let shop = null;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    shop = decoded.shop;
  } catch {
    return new Response('Invalid OAuth state', { status: 400 });
  }

  try {
    const baseUrl    = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/ali/callback`;

    const token = await exchangeOAuthCode(code, redirectUri);

    // Upsert the credential for this shop
    await prisma.aliCredential.upsert({
      where: { shop },
      update: {
        accessToken:        token.access_token,
        refreshToken:       token.refresh_token,
        accessTokenExpiry:  new Date(Date.now() + token.expires_in * 1000),
        refreshTokenExpiry: new Date(Date.now() + (token.r_expires_in || 30 * 24 * 3600) * 1000),
        aliUserId:          String(token.user_id || token.member_id || ''),
        aliUserNick:        token.user_nick || '',
      },
      create: {
        shop,
        accessToken:        token.access_token,
        refreshToken:       token.refresh_token,
        accessTokenExpiry:  new Date(Date.now() + token.expires_in * 1000),
        refreshTokenExpiry: new Date(Date.now() + (token.r_expires_in || 30 * 24 * 3600) * 1000),
        aliUserId:          String(token.user_id || token.member_id || ''),
        aliUserNick:        token.user_nick || '',
      },
    });

    // Redirect back into the Shopify embedded app
    const appUrl = `https://${shop}/admin/apps`;
    return new Response(null, {
      status: 302,
      headers: { Location: appUrl },
    });
  } catch (err) {
    console.error('[ali-ds] OAuth callback error:', err.message);
    return new Response(`AliExpress connection failed: ${err.message}`, { status: 500 });
  }
}
