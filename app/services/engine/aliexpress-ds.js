/**
 * app/services/engine/aliexpress-ds.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AliExpress Dropshipping (DS) API client for Drop Predator.
 *
 * Covers the three pillars of the DS API:
 *   1. Product sourcing  — searchDsProducts, getDsProductDetails
 *   2. Order management  — createDsOrder, getDsOrder, getDsFreight
 *   3. Logistics         — getDsTracking
 *
 * Authentication:
 *   • App-level (product search / freight): APP_KEY + APP_SECRET only
 *   • User-level (order placement / tracking): OAuth2 access token per shop
 *
 * Signing: HMAC-SHA256 over sorted key+value pairs (same as Affiliate API).
 *
 * Docs: https://developers.aliexpress.com/en/doc.htm?docId=DROPSHIPPER
 */

/* eslint-disable no-undef */
import crypto from 'crypto';

const DS_API_URL = 'https://api-sg.aliexpress.com/sync';
const OAUTH_BASE  = 'https://oauth.aliexpress.com';

// ─── Signing ─────────────────────────────────────────────────────────────────

function dsSign(params, secret) {
  const sorted = Object.keys(params).sort();
  const str    = sorted.map(k => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', secret).update(str).digest('hex').toUpperCase();
}

// ─── Generic request ─────────────────────────────────────────────────────────

/**
 * Make a signed DS API request.
 * @param {string} method       - AliExpress API method name
 * @param {object} methodParams - Method-specific parameters (flat or JSON strings)
 * @param {string} [accessToken] - User OAuth access token (required for orders)
 */
async function dsRequest(method, methodParams = {}, accessToken = null) {
  const appKey    = process.env.ALI_APP_KEY;
  const appSecret = process.env.ALI_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error('ALI_APP_KEY and ALI_APP_SECRET are not configured');
  }

  const params = {
    app_key:     appKey,
    method,
    sign_method: 'hmac-sha256',
    timestamp:   new Date().toISOString().replace('T', ' ').slice(0, 19),
    format:      'json',
    v:           '2.0',
    ...methodParams,
  };
  if (accessToken) params.session = accessToken;

  params.sign = dsSign(params, appSecret);

  const url = new URL(DS_API_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'DropPredator/1.0' },
  });

  if (!res.ok) throw new Error(`AliExpress DS API HTTP ${res.status} for ${method}`);

  const data = await res.json();

  // Surface API-level errors from any response envelope
  const rootKey = Object.keys(data)[0];
  const envelope = data[rootKey];
  if (envelope?.error_code || envelope?.result_code === 'FAIL') {
    const msg = envelope.error_message || envelope.sub_msg || envelope.result_msg || 'Unknown DS API error';
    const code = envelope.error_code || envelope.result_code;
    throw new Error(`AliExpress DS API [${code}] ${msg}`);
  }

  return data;
}

// ─── 1. PRODUCT SOURCING ────────────────────────────────────────────────────

/**
 * Search products via the DS Recommend Feed API.
 * Returns an array in Drop Predator raw-product format.
 *
 * @param {string|string[]} keywords
 * @param {{ pageSize?, currency?, country?, language?, sort? }} opts
 */
export async function searchDsProducts(keywords, opts = {}) {
  const {
    pageSize  = 20,
    currency  = 'USD',
    country   = 'US',
    language  = 'en_US',
    sort      = 'highest_rated_products',
  } = opts;

  const kwList = (Array.isArray(keywords) ? keywords : [keywords]).slice(0, 4);
  const results = [];

  for (const kw of kwList) {
    try {
      const data = await dsRequest('aliexpress.ds.recommend.feed.get', {
        param_recommend_query_request: JSON.stringify({
          queryType:  'text',
          searchKey:  kw,
          pageSize,
          currency,
          country,
          language,
          sort,
          // Filter out adult / restricted content
          filterIds: '2,3,4,40000003,200000897,200000910',
        }),
      });

      const content =
        data.aliexpress_ds_recommend_feed_get_response?.result?.mods?.itemList?.content || [];

      results.push(...content.map(p => normalizeDsListItem(p, kw)));
    } catch (err) {
      console.warn(`[ali-ds] searchDsProducts "${kw}": ${err.message}`);
    }
  }

  return results;
}

/**
 * Get full dropshipping product details — DS pricing, variants, shipping.
 *
 * @param {string|number} productId
 * @param {{ currency?, country?, language? }} opts
 */
export async function getDsProductDetails(productId, opts = {}) {
  const { currency = 'USD', country = 'US', language = 'en_US' } = opts;

  const data = await dsRequest('aliexpress.ds.product.get', {
    param_ds_product_base_info_request: JSON.stringify({
      productId: String(productId),
      currency,
      country,
      language,
    }),
  });

  return data.aliexpress_ds_product_get_response?.result || null;
}

// ─── 2. ORDER MANAGEMENT ────────────────────────────────────────────────────

/**
 * Query shipping freight costs for a product before ordering.
 *
 * @param {string|number} productId
 * @param {number}        quantity
 * @param {{ country?, currency?, skuId? }} opts
 */
export async function getDsFreight(productId, quantity = 1, opts = {}) {
  const { country = 'US', currency = 'USD', skuId = null } = opts;

  const queryParams = {
    productId:        String(productId),
    productNum:       String(quantity),
    countryCode:      country,
    currencyCode:     currency,
    sendGoodsCountry: 'CN',    // Most AliExpress sellers ship from China
  };
  if (skuId) queryParams.skuId = String(skuId);

  const data = await dsRequest('aliexpress.ds.freight.query', {
    param_aeop_freight_calculate_for_buyer_dto: JSON.stringify(queryParams),
  });

  const raw = data.aliexpress_ds_freight_query_response?.result || {};
  // Normalise into a flat array of shipping options
  const freightList =
    raw.aeop_freight_calculate_result_for_buyer_d_t_o_list
       ?.aeop_freight_calculate_result_for_buyer_d_t_o || [];

  return freightList.map(f => ({
    serviceName:       f.service_name,
    company:           f.company || f.service_name,
    estimatedDays:     f.estimated_delivery_time,
    freightAmount:     parseFloat(f.freight?.amount || 0),
    currency:          f.freight?.currency || currency,
    tracking:          f.tracking_available === 'true',
    recommended:       f.recommend === 'true',
  }));
}

/**
 * Create a dropshipping order on AliExpress.
 * Requires a user OAuth access token (obtained via connectAliExpress OAuth flow).
 *
 * @param {object} orderInfo
 * @param {Array}  orderInfo.productItems  - Products to order
 * @param {object} orderInfo.address       - Buyer shipping address
 * @param {string} accessToken             - User OAuth token
 */
export async function createDsOrder(orderInfo, accessToken) {
  if (!accessToken) throw new Error('User AliExpress OAuth token required to place orders');

  const payload = {
    product_items:     orderInfo.productItems.map(item => ({
      product_id:            item.productId,
      product_count:         item.quantity,
      sku_attr:              item.skuAttr || '',
      logistics_service_name: item.shippingService || 'CAINIAO_STANDARD',
      order_memo:            item.memo || '',
    })),
    logistics_address: {
      contact_person: orderInfo.address.name,
      full_name:      orderInfo.address.name,
      mobile_no:      orderInfo.address.phone,
      address:        orderInfo.address.address1,
      address2:       orderInfo.address.address2 || '',
      city:           orderInfo.address.city,
      province:       orderInfo.address.province || '',
      country:        orderInfo.address.countryCode,
      zip:            orderInfo.address.zip,
    },
  };
  // Brazil requires CPF tax number
  if (orderInfo.cpfCode) payload.cpf_code = orderInfo.cpfCode;

  const data = await dsRequest('aliexpress.trade.ds.order.create', {
    param_place_order_request4_open_api_d_t_o: JSON.stringify(payload),
  }, accessToken);

  const result = data.aliexpress_trade_ds_order_create_response?.result || {};
  return {
    success:     result.is_success === true,
    orderId:     result.order_id ? String(result.order_id) : null,
    orderList:   result.order_list?.number || [],
    errorCode:   result.error_code || null,
    errorMsg:    result.error_msg || null,
  };
}

/**
 * Get AliExpress DS order details.
 * @param {string} orderId
 * @param {string} accessToken
 */
export async function getDsOrder(orderId, accessToken) {
  if (!accessToken) throw new Error('User AliExpress OAuth token required');

  const data = await dsRequest('aliexpress.ds.order.get', {
    order_id: String(orderId),
  }, accessToken);

  return data.aliexpress_ds_order_get_response?.result || null;
}

// ─── 3. LOGISTICS / TRACKING ────────────────────────────────────────────────

/**
 * Get tracking information for an AliExpress DS order.
 * @param {string} orderId
 * @param {string} accessToken
 */
export async function getDsTracking(orderId, accessToken) {
  if (!accessToken) throw new Error('User AliExpress OAuth token required');

  const data = await dsRequest('aliexpress.ds.tracking.info.query', {
    orderId:  String(orderId),
    language: 'en_US',
  }, accessToken);

  const result = data.aliexpress_ds_tracking_info_query_response?.result || {};
  return {
    trackingNumber: result.official_tracking_number || result.out_ref || null,
    carrierCode:    result.logistics_code || null,
    status:         result.logistics_status || 'UNKNOWN',
    lastUpdate:     result.logistics_update_time || null,
    details:        result.details?.tracking_detail_list || [],
  };
}

// ─── 4. OAUTH2 ──────────────────────────────────────────────────────────────

/**
 * Build the AliExpress OAuth2 authorization URL.
 * Redirect the merchant here to connect their AliExpress seller account.
 */
export function getOAuthUrl(redirectUri, state = '') {
  const params = new URLSearchParams({
    response_type: 'code',
    force_auth:    'true',
    redirect_uri:  redirectUri,
    client_id:     process.env.ALI_APP_KEY || '',
    state,
  });
  return `${OAUTH_BASE}/authorize?${params}`;
}

/**
 * Exchange an authorization code for an access + refresh token pair.
 * Call this in your OAuth callback route.
 */
export async function exchangeOAuthCode(code, redirectUri) {
  const params = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    client_id:     process.env.ALI_APP_KEY,
    client_secret: process.env.ALI_APP_SECRET,
    redirect_uri:  redirectUri,
  });

  const res = await fetch(`${OAUTH_BASE}/token?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error(`AliExpress token exchange failed: HTTP ${res.status}`);

  const token = await res.json();
  if (token.error) throw new Error(`AliExpress token exchange error: ${token.error} — ${token.error_description}`);
  return token; // { access_token, refresh_token, expires_in, r_expires_in, user_id, ... }
}

/**
 * Refresh an expired access token.
 */
export async function refreshOAuthToken(refreshToken) {
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     process.env.ALI_APP_KEY,
    client_secret: process.env.ALI_APP_SECRET,
  });

  const res = await fetch(`${OAUTH_BASE}/token?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error(`AliExpress token refresh failed: HTTP ${res.status}`);

  const token = await res.json();
  if (token.error) throw new Error(`AliExpress token refresh error: ${token.error}`);
  return token;
}

// ─── Normaliser ──────────────────────────────────────────────────────────────

/**
 * Map a DS Recommend Feed item to the Drop Predator raw-product format
 * expected by live-catalog.js → mapToSchema().
 */
function normalizeDsListItem(p, keyword) {
  // DS list prices come as strings like "US $3.50" or just "3.50"
  const rawSale  = parseFloat(String(p.sale_price  || p.salePrice  || 0).replace(/[^0-9.]/g, ''));
  const rawOrig  = parseFloat(String(p.orig_price  || p.originalPrice || 0).replace(/[^0-9.]/g, ''));
  const dsPrice  = rawSale || rawOrig || 0;  // actual cost to dropshipper

  const retailPrice = parseFloat((dsPrice * 2.5).toFixed(2));
  const cost        = parseFloat((dsPrice * 0.95).toFixed(2)); // DS price ≈ cost
  const supRating   = parseFloat(p.evaluate_rate || p.positiveRating || p.star || '80');

  return {
    _source:     'aliexpress-ds',
    _productId:  String(p.product_id || p.productId || p.item_id || ''),
    aliProductId: String(p.product_id || p.productId || p.item_id || ''),
    name:        p.product_title || p.productTitle || p.title || keyword,
    cat:         keyword,
    price:       retailPrice,
    cost,
    landed:      parseFloat((cost * 1.15).toFixed(2)), // cost + ~15% shipping estimate
    supplier:    p.store_name  || p.storeName  || 'AliExpress Supplier',
    supScore:    Math.min(100, Math.round(
      supRating > 1 ? supRating : supRating * 100  // handle both "97.8" and "0.978"
    )),
    moq:         parseInt(p.min_order || p.minQuantity || 1),
    images:      p.image_url   || p.imageUrl   || '',
    orders:      parseInt(p.lastest_volume || p.tradeCount || p.sold || 0),
    _totalResults: 0,
  };
}
