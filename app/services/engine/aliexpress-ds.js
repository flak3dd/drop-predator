/**
 * app/services/engine/aliexpress-ds.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AliExpress Dropshipping (DS) API client for Drop Predator.
 *
 * Method names and parameter shapes verified against the official SDK:
 *   https://github.com/moh3a/ae_sdk/blob/main/src/utils/ds_client.ts
 *
 * Two endpoints:
 *   • TOP API  https://api-sg.aliexpress.com/sync  — product details, freight, orders, tracking
 *   • OAuth2   https://oauth.aliexpress.com        — token exchange & refresh
 *
 * Signing: HMAC-SHA256 over alphabetically sorted key+value pairs, uppercase hex.
 *
 * Authentication levels:
 *   • App-level  (ALI_APP_KEY + ALI_APP_SECRET)  — product details, freight query
 *   • User-level (+ OAuth2 access token per shop) — order create/get, tracking
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
 * @param {string} method        - AliExpress API method name
 * @param {object} methodParams  - Method-specific parameters (flat or JSON strings)
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

  // Surface API-level errors
  const rootKey  = Object.keys(data)[0];
  const envelope = data[rootKey];
  if (envelope?.error_code || envelope?.rsp_code === 'FAIL') {
    const msg  = envelope.error_message || envelope.rsp_msg || envelope.sub_msg || 'Unknown DS API error';
    const code = envelope.error_code || envelope.rsp_code;
    throw new Error(`AliExpress DS API [${code}] ${msg}`);
  }

  return data;
}

// ─── 1. PRODUCT DISCOVERY ───────────────────────────────────────────────────

/**
 * Get products from an AliExpress DS featured feed (NOT keyword search).
 *
 * The DS recommend feed API delivers curated promotional products by feed name,
 * NOT by search keyword. For keyword-based search use the Affiliate API
 * (aliexpress.affiliate.product.query) in live-catalog.js.
 *
 * Fetch available feed names first with getDsFeedNames().
 *
 * @param {string} feedName - Feed name from getDsFeedNames()
 * @param {{ pageSize?, currency?, country?, language? }} opts
 */
export async function getDsFeedProducts(feedName, opts = {}) {
  const {
    pageSize = 20,
    currency = 'USD',
    country  = 'US',
    language = 'EN',
  } = opts;

  const data = await dsRequest('aliexpress.ds.recommend.feed.get', {
    feed_name:       feedName,
    country:         country,
    target_currency: currency,
    target_language: language,
    page_size:       String(pageSize),
    page_no:         '1',
  });

  const result = data.aliexpress_ds_recommend_feed_get_response?.resp_result?.result;
  if (!result) return [];

  // Normalise to the Drop Predator raw-product format
  const items = result.products?.product || result.mods?.itemList?.content || [];
  return items.map(p => normalizeDsListItem(p, feedName));
}

/**
 * Get available DS feed names (promotional campaigns).
 * Use these with getDsFeedProducts().
 */
export async function getDsFeedNames() {
  const data = await dsRequest('aliexpress.ds.feedname.get', {});
  const promos = data.aliexpress_ds_feedname_get_response?.result?.promos?.promo || [];
  return promos.map(p => p.feed_name || p.name || String(p));
}

// ─── 2. PRODUCT DETAILS ────────────────────────────────────────────────────

/**
 * Get full dropshipping product details — DS pricing, variants, shipping.
 *
 * Param names match official SDK DS_Product_Params:
 *   product_id, ship_to_country, target_currency, target_language
 *
 * @param {string|number} productId
 * @param {{ currency?, country?, language? }} opts
 */
export async function getDsProductDetails(productId, opts = {}) {
  const { currency = 'USD', country = 'US', language = 'EN' } = opts;

  const data = await dsRequest('aliexpress.ds.product.get', {
    product_id:       String(productId),
    ship_to_country:  country,
    target_currency:  currency,
    target_language:  language,
  });

  return data.aliexpress_ds_product_get_response?.result || null;
}

// ─── 3. FREIGHT / SHIPPING ─────────────────────────────────────────────────

/**
 * Query shipping freight costs for a product before ordering.
 *
 * Correct method: aliexpress.logistics.buyer.freight.calculate
 * Correct param:  param_aeop_freight_calculate_for_buyer_d_t_o (note _d_t_o suffix)
 *
 * @param {string|number} productId
 * @param {number}        quantity
 * @param {{ country?, currency?, skuId?, provinceCode?, cityCode? }} opts
 */
export async function getDsFreight(productId, quantity = 1, opts = {}) {
  const {
    country      = 'US',
    currency     = 'USD',
    skuId        = null,
    provinceCode = null,
    cityCode     = null,
  } = opts;

  const numericId = Number(productId);
  if (!productId || !Number.isFinite(numericId)) {
    throw new Error(`Valid productId required for freight calculation, got: ${productId}`);
  }

  const queryParams = {
    product_id:              numericId,
    product_num:             quantity,
    country_code:            country,
    send_goods_country_code: 'CN',
    price_currency:          currency,
  };
  if (skuId)        queryParams.sku_id        = String(skuId);
  if (provinceCode) queryParams.province_code = String(provinceCode);
  if (cityCode)     queryParams.city_code     = String(cityCode);

  const data = await dsRequest('aliexpress.logistics.buyer.freight.calculate', {
    // Correct param name ends in _d_t_o (not _dto)
    param_aeop_freight_calculate_for_buyer_d_t_o: JSON.stringify(queryParams),
  });

  const raw = data.aliexpress_logistics_buyer_freight_calculate_response?.result || {};
  if (!raw.success) return [];

  const freightList =
    raw.aeop_freight_calculate_result_for_buyer_d_t_o_list
       ?.aeop_freight_calculate_result_for_buyer_dto || [];

  return freightList.map(f => ({
    serviceName:   f.service_name,
    company:       f.service_name,
    estimatedDays: f.estimated_delivery_time,
    freightAmount: parseFloat(f.freight?.amount || f.freight?.cent / 100 || 0),
    currency:      f.freight?.currency_code || currency,
    tracking:      f.tracking_available === 'true',
    recommended:   false,
  }));
}

// ─── 4. ORDER MANAGEMENT ───────────────────────────────────────────────────

/**
 * Create a dropshipping order on AliExpress.
 *
 * Correct method: aliexpress.ds.order.create  (not aliexpress.trade.ds.order.create)
 * Response key:   aliexpress_trade_buy_placeorder_response
 *
 * @param {object} orderInfo
 * @param {Array}  orderInfo.productItems  - Products to order
 * @param {object} orderInfo.address       - Buyer shipping address
 * @param {string} accessToken             - User OAuth token
 */
export async function createDsOrder(orderInfo, accessToken) {
  if (!accessToken) throw new Error('User AliExpress OAuth token required to place orders');

  const payload = {
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
    product_items: orderInfo.productItems.map(item => {
      const id = Number(item.productId);
      if (!Number.isFinite(id)) throw new Error(`Invalid productId: ${item.productId}`);
      return {
        product_id:             id,
        product_count:          item.quantity,
        sku_attr:               item.skuAttr || '',
        logistics_service_name: item.shippingService || 'CAINIAO_STANDARD',
        order_memo:             item.memo || '',
      };
    }),
  };

  if (orderInfo.cpfCode) payload.logistics_address.cpf = orderInfo.cpfCode;

  const data = await dsRequest('aliexpress.ds.order.create', {
    param_place_order_request4_open_api_d_t_o: JSON.stringify(payload),
  }, accessToken);

  // Response key is aliexpress_trade_buy_placeorder_response (not aliexpress_trade_ds_order_create_response)
  const result = data.aliexpress_trade_buy_placeorder_response?.result || {};
  const orderList = Array.isArray(result.order_list)
    ? result.order_list
    : (result.order_list?.number || []);

  return {
    success:   result.is_success === true,
    orderId:   orderList.length > 0 ? String(orderList[0]) : null,
    orderList,
    errorCode: result.error_code  || null,
    errorMsg:  result.error_msg   || null,
  };
}

/**
 * Get AliExpress DS order details.
 *
 * Correct method: aliexpress.trade.ds.order.get  (not aliexpress.ds.order.get)
 *
 * @param {string} orderId
 * @param {string} accessToken
 */
export async function getDsOrder(orderId, accessToken) {
  if (!accessToken) throw new Error('User AliExpress OAuth token required');

  const data = await dsRequest('aliexpress.trade.ds.order.get', {
    order_id: String(orderId),
  }, accessToken);

  return data.aliexpress_trade_ds_order_get_response?.result || null;
}

// ─── 5. LOGISTICS / TRACKING ───────────────────────────────────────────────

/**
 * Get tracking information for an AliExpress DS order.
 *
 * Correct method: aliexpress.logistics.ds.trackinginfo.query
 * (old aliexpress.ds.tracking.info.query was removed from the API)
 *
 * Requires the logistics tracking number (not just the order ID).
 * Call getDsOrder first to get logistics_no and service_name from the order details.
 *
 * @param {object} trackingParams
 * @param {string} trackingParams.logisticsNo   - Carrier tracking number
 * @param {string} trackingParams.outRef        - AliExpress order ID
 * @param {string} trackingParams.serviceName   - Logistics service key (e.g. CAINIAO_STANDARD)
 * @param {string} trackingParams.toArea        - Destination country code (e.g. US)
 * @param {string} accessToken
 */
export async function getDsTracking({ logisticsNo, outRef, serviceName, toArea = 'US' }, accessToken) {
  if (!accessToken) throw new Error('User AliExpress OAuth token required');

  const data = await dsRequest('aliexpress.logistics.ds.trackinginfo.query', {
    logistics_no: String(logisticsNo),
    origin:       'ESCROW',
    out_ref:      String(outRef),
    service_name: serviceName || 'CAINIAO_STANDARD',
    to_area:      toArea,
  }, accessToken);

  const result = data.aliexpress_logistics_ds_trackinginfo_query_response || {};

  if (!result.result_success) {
    return {
      trackingNumber: logisticsNo,
      carrierCode:    null,
      status:         'UNKNOWN',
      lastUpdate:     null,
      details:        [],
      error:          result.error_desc || 'Tracking unavailable',
    };
  }

  const events = Array.isArray(result.details)
    ? result.details
    : (result.details?.details || []);

  return {
    trackingNumber: logisticsNo,
    carrierCode:    serviceName || null,
    status:         result.details?.length ? 'SHIPPED' : 'UNKNOWN',
    lastUpdate:     events[0]?.event_date || null,
    details:        events,
  };
}

// ─── 6. OAUTH2 ─────────────────────────────────────────────────────────────

/**
 * Build the AliExpress OAuth2 authorization URL.
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
  return token;
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
 * Map a DS feed/search item to the Drop Predator raw-product format.
 */
function normalizeDsListItem(p, feedName) {
  const rawSale = parseFloat(String(p.sale_price || p.salePrice || p.sku_bulk_order || 0).replace(/[^0-9.]/g, ''));
  const rawOrig = parseFloat(String(p.orig_price || p.originalPrice || 0).replace(/[^0-9.]/g, ''));
  const dsPrice = rawSale || rawOrig || 0;

  const retailPrice = parseFloat((dsPrice * 2.5).toFixed(2));
  const cost        = parseFloat((dsPrice * 0.95).toFixed(2));
  const supRating   = parseFloat(p.evaluate_rate || p.positiveRating || p.star || '80');

  return {
    _source:      'aliexpress-ds',
    _productId:   String(p.product_id || p.productId || p.item_id || ''),
    aliProductId: String(p.product_id || p.productId || p.item_id || ''),
    name:         p.product_title || p.productTitle || p.title || feedName,
    cat:          feedName,
    price:        retailPrice,
    cost,
    landed:       parseFloat((cost * 1.15).toFixed(2)),
    supplier:     p.store_name || p.storeName || 'AliExpress Supplier',
    supScore:     Math.min(100, Math.round(supRating > 1 ? supRating : supRating * 100)),
    moq:          parseInt(p.min_order || p.minQuantity || 1),
    images:       p.image_url || p.imageUrl || '',
    orders:       parseInt(p.lastest_volume || p.tradeCount || p.sold || 0),
    _totalResults: 0,
  };
}
