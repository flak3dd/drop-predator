/**
 * app/services/ai/media.js
 * ---------------------------------------------------------
 * Product image sourcing engine.
 *
 * Strategies (executed as a waterfall — stops once enough images found):
 *   1. Google Image dork search  (site:aliexpress.com, site:amazon.com, etc.)
 *   2. Bing Image API            (if BING_IMAGE_API_KEY set)
 *   3. AliExpress product page scrape
 *   4. CJ Dropshipping API       (if CJ credentials set)
 *   5. Unsplash fallback          (if UNSPLASH_ACCESS_KEY set)
 *   6. DuckDuckGo image scrape    (no API key needed)
 *
 * Each strategy returns: { url, source, width?, height?, alt?, score }
 * Score is 0-100 representing quality/relevance.
 *
 * The AI model picks the best images from the candidates and
 * optionally generates alt text for accessibility + SEO.
 */

/* eslint-disable no-undef */

import cache from '../engine/catalog-cache.js';

const IMG_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours
const MAX_IMAGES_PER_PRODUCT = 8;
const FETCH_TIMEOUT = 8000;

// ─── User agent rotation ────────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function fetchWithTimeout(url, opts = {}, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// ─── Strategy 1: Google Image Dork Search ───────────────────────────────────

/**
 * Google Custom Search JSON API for image dorking.
 * Requires GOOGLE_CSE_ID + GOOGLE_CSE_KEY env vars.
 *
 * Dork patterns used:
 *   - "<product name>" product photo -stock -mockup
 *   - site:aliexpress.com "<product name>"
 *   - site:amazon.com "<product name>" product image
 *   - intitle:"<product name>" inurl:product
 */
async function searchGoogleImages(productName, category, log) {
  const cseId = process.env.GOOGLE_CSE_ID;
  const cseKey = process.env.GOOGLE_CSE_KEY;
  if (!cseId || !cseKey) return [];

  const cacheKey = `gimg:${productName}`;
  const cached = cache.get(cacheKey);
  if (cached) { log?.(`Google Images cache hit: "${productName}" (${cached.length})`); return cached; }

  const dorkQueries = [
    `"${productName}" product photo -stock -mockup -placeholder`,
    `"${productName}" ${category || ''} product white background`,
    `site:aliexpress.com "${productName}"`,
  ];

  const results = [];

  for (const q of dorkQueries) {
    try {
      log?.(`Google dork: ${q}`);
      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.searchParams.set('key', cseKey);
      url.searchParams.set('cx', cseId);
      url.searchParams.set('q', q);
      url.searchParams.set('searchType', 'image');
      url.searchParams.set('num', '6');
      url.searchParams.set('imgSize', 'large');
      url.searchParams.set('imgType', 'photo');
      url.searchParams.set('safe', 'active');

      const res = await fetchWithTimeout(url.toString());
      if (!res.ok) continue;

      const data = await res.json();
      const items = (data.items || []).map((item, i) => ({
        url: item.link,
        thumbnailUrl: item.image?.thumbnailLink,
        source: 'google',
        width: item.image?.width || 0,
        height: item.image?.height || 0,
        alt: item.title || productName,
        contextUrl: item.image?.contextLink,
        score: 85 - (i * 5), // higher rank = higher score
        dorkQuery: q,
      }));
      results.push(...items);

      await sleep(200); // rate limit courtesy
    } catch { /* continue to next dork */ }
  }

  const deduped = deduplicateImages(results);
  cache.set(cacheKey, deduped, IMG_CACHE_TTL);
  return deduped;
}

// ─── Strategy 2: Bing Image Search API ──────────────────────────────────────

async function searchBingImages(productName, category, log) {
  const apiKey = process.env.BING_IMAGE_API_KEY;
  if (!apiKey) return [];

  const cacheKey = `bing:${productName}`;
  const cached = cache.get(cacheKey);
  if (cached) { log?.(`Bing Images cache hit: "${productName}" (${cached.length})`); return cached; }

  try {
    log?.(`Bing image search: "${productName} ${category || ''}"`);
    const url = new URL('https://api.bing.microsoft.com/v7.0/images/search');
    url.searchParams.set('q', `${productName} ${category || ''} product`);
    url.searchParams.set('count', '10');
    url.searchParams.set('imageType', 'Photo');
    url.searchParams.set('size', 'Large');
    url.searchParams.set('safeSearch', 'Strict');

    const res = await fetchWithTimeout(url.toString(), {
      headers: { 'Ocp-Apim-Subscription-Key': apiKey },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const results = (data.value || []).map((img, i) => ({
      url: img.contentUrl,
      thumbnailUrl: img.thumbnailUrl,
      source: 'bing',
      width: img.width || 0,
      height: img.height || 0,
      alt: img.name || productName,
      contextUrl: img.hostPageUrl,
      score: 80 - (i * 4),
    }));

    cache.set(cacheKey, results, IMG_CACHE_TTL);
    return results;
  } catch {
    return [];
  }
}

// ─── Strategy 3: AliExpress Product Image Scrape ────────────────────────────

async function scrapeAliExpressImages(productName, log) {
  const cacheKey = `ali-img:${productName}`;
  const cached = cache.get(cacheKey);
  if (cached) { log?.(`AliExpress image cache hit: "${productName}" (${cached.length})`); return cached; }

  try {
    log?.(`AliExpress image scrape: "${productName}"`);
    const searchUrl = `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(productName)}`;
    const res = await fetchWithTimeout(searchUrl, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) return [];
    const html = await res.text();

    // Extract product image URLs from search results page
    const imgPatterns = [
      /(?:data-src|src)="(https:\/\/[^"]*(?:ae\d+|alicdn)[^"]*\.(?:jpg|jpeg|png|webp)[^"]*?)"/gi,
      /"imageUrl"\s*:\s*"(https:\/\/[^"]+)"/gi,
      /"imgUrl"\s*:\s*"(https:\/\/[^"]+)"/gi,
    ];

    const images = new Set();
    for (const pattern of imgPatterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const imgUrl = match[1];
        // Filter out tiny icons/avatars, keep product images
        if (imgUrl.includes('avatar') || imgUrl.includes('icon') || imgUrl.includes('20x20')) continue;
        if (imgUrl.includes('_640x640') || imgUrl.includes('_480x480') || imgUrl.includes('_350x350') || imgUrl.includes('220x220')) {
          // Upgrade to full size
          const fullUrl = imgUrl
            .replace(/_\d+x\d+/, '')
            .replace(/\.jpg_\d+x\d+/, '.jpg');
          images.add(fullUrl);
        } else {
          images.add(imgUrl);
        }
        if (images.size >= 12) break;
      }
    }

    const results = [...images].map((url, i) => ({
      url,
      source: 'aliexpress',
      alt: productName,
      score: 75 - (i * 3),
    }));

    cache.set(cacheKey, results, IMG_CACHE_TTL);
    return results;
  } catch {
    return [];
  }
}

// ─── Strategy 4: CJ Dropshipping API Images ────────────────────────────────

async function fetchCJImages(productName, log) {
  if (!process.env.CJ_EMAIL || !process.env.CJ_PASSWORD) return [];

  const cacheKey = `cj-img:${productName}`;
  const cached = cache.get(cacheKey);
  if (cached) { log?.(`CJ image cache hit: "${productName}" (${cached.length})`); return cached; }

  try {
    log?.(`CJ Dropshipping image search: "${productName}"`);

    // Get auth token
    const authRes = await fetchWithTimeout('https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: process.env.CJ_EMAIL, password: process.env.CJ_PASSWORD }),
    });

    if (!authRes.ok) return [];
    const authData = await authRes.json();
    const token = authData.data?.accessToken;
    if (!token) return [];

    // Search products
    const url = new URL('https://developers.cjdropshipping.com/api2.0/v1/product/list');
    url.searchParams.set('productNameEn', productName);
    url.searchParams.set('pageNum', '1');
    url.searchParams.set('pageSize', '10');

    const res = await fetchWithTimeout(url.toString(), {
      headers: { 'CJ-Access-Token': token },
    });

    if (!res.ok) return [];
    const data = await res.json();

    const results = (data.data?.list || [])
      .filter(p => p.productImage)
      .map((p, i) => ({
        url: p.productImage,
        source: 'cj',
        alt: p.productNameEn || productName,
        score: 70 - (i * 4),
      }));

    cache.set(cacheKey, results, IMG_CACHE_TTL);
    return results;
  } catch {
    return [];
  }
}

// ─── Strategy 5: Unsplash API ───────────────────────────────────────────────

async function searchUnsplash(productName, category, log) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return [];

  const cacheKey = `unsplash:${productName}`;
  const cached = cache.get(cacheKey);
  if (cached) { log?.(`Unsplash cache hit: "${productName}" (${cached.length})`); return cached; }

  try {
    log?.(`Unsplash search: "${productName}"`);
    const url = new URL('https://api.unsplash.com/search/photos');
    url.searchParams.set('query', `${productName} ${category || ''}`);
    url.searchParams.set('per_page', '6');
    url.searchParams.set('orientation', 'squarish');

    const res = await fetchWithTimeout(url.toString(), {
      headers: { Authorization: `Client-ID ${accessKey}` },
    });

    if (!res.ok) return [];
    const data = await res.json();

    const results = (data.results || []).map((photo, i) => ({
      url: photo.urls?.regular || photo.urls?.full,
      thumbnailUrl: photo.urls?.thumb,
      source: 'unsplash',
      width: photo.width,
      height: photo.height,
      alt: photo.alt_description || photo.description || productName,
      photographer: photo.user?.name,
      photographerUrl: photo.user?.links?.html,
      license: 'Unsplash License (free)',
      score: 60 - (i * 5), // lower base — generic stock photos
    }));

    cache.set(cacheKey, results, IMG_CACHE_TTL);
    return results;
  } catch {
    return [];
  }
}

// ─── Strategy 6: DuckDuckGo Image Scrape (no API key) ──────────────────────

async function scrapeDuckDuckGoImages(productName, category, log) {
  const cacheKey = `ddg:${productName}`;
  const cached = cache.get(cacheKey);
  if (cached) { log?.(`DDG image cache hit: "${productName}" (${cached.length})`); return cached; }

  try {
    log?.(`DuckDuckGo image scrape: "${productName}"`);

    // DDG requires a token from the initial request
    const tokenRes = await fetchWithTimeout(`https://duckduckgo.com/?q=${encodeURIComponent(productName + ' product')}&iax=images&ia=images`, {
      headers: { 'User-Agent': randomUA() },
    });
    if (!tokenRes.ok) return [];

    const tokenHtml = await tokenRes.text();
    const vqd = tokenHtml.match(/vqd=['"]([^'"]+)/)?.[1];
    if (!vqd) return [];

    const imgUrl = new URL('https://duckduckgo.com/i.js');
    imgUrl.searchParams.set('l', 'us-en');
    imgUrl.searchParams.set('o', 'json');
    imgUrl.searchParams.set('q', `${productName} ${category || ''} product photo`);
    imgUrl.searchParams.set('vqd', vqd);
    imgUrl.searchParams.set('f', ',size:Large,,');
    imgUrl.searchParams.set('p', '1'); // safe search

    const res = await fetchWithTimeout(imgUrl.toString(), {
      headers: {
        'User-Agent': randomUA(),
        'Referer': 'https://duckduckgo.com/',
      },
    });

    if (!res.ok) return [];
    const data = await res.json();

    const results = (data.results || []).slice(0, 10).map((img, i) => ({
      url: img.image,
      thumbnailUrl: img.thumbnail,
      source: 'duckduckgo',
      width: img.width || 0,
      height: img.height || 0,
      alt: img.title || productName,
      contextUrl: img.url,
      score: 65 - (i * 4),
    }));

    cache.set(cacheKey, results, IMG_CACHE_TTL);
    return results;
  } catch {
    return [];
  }
}

// ─── Image validation & scoring ─────────────────────────────────────────────

/**
 * HEAD-check a URL to verify it's a real, reachable image.
 */
async function validateImageUrl(url) {
  try {
    const res = await fetchWithTimeout(url, { method: 'HEAD' }, 5000);
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') || '';
    return ct.startsWith('image/');
  } catch {
    return false;
  }
}

/**
 * Score an image based on various quality signals.
 */
function scoreImage(img) {
  let score = img.score || 50;

  // Resolution bonus
  if (img.width && img.height) {
    const megapixels = (img.width * img.height) / 1_000_000;
    if (megapixels >= 2) score += 10;
    else if (megapixels >= 0.5) score += 5;
    else if (megapixels < 0.1) score -= 15; // tiny images penalised

    // Aspect ratio: prefer square or 4:3 (product photos)
    const ratio = img.width / img.height;
    if (ratio >= 0.8 && ratio <= 1.2) score += 5; // square-ish
    else if (ratio >= 0.6 && ratio <= 1.6) score += 2;
  }

  // Source reliability bonus
  const sourceBonus = { google: 10, bing: 8, aliexpress: 5, cj: 5, duckduckgo: 3, unsplash: 7 };
  score += sourceBonus[img.source] || 0;

  // Penalise stock photo indicators
  const stockIndicators = ['shutterstock', 'istockphoto', 'gettyimages', 'depositphotos', 'dreamstime', 'watermark'];
  if (stockIndicators.some(s => (img.url || '').toLowerCase().includes(s))) {
    score -= 30;
  }

  return Math.max(0, Math.min(100, score));
}

function deduplicateImages(images) {
  const seen = new Set();
  return images.filter(img => {
    // Normalise URL for dedup: strip query params & resize suffixes
    const key = img.url
      .split('?')[0]
      .replace(/_\d+x\d+/g, '')
      .replace(/\.(jpg|jpeg|png|webp)_.*/i, '.$1');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Main image sourcing pipeline ───────────────────────────────────────────

/**
 * Source product images from multiple search engines and catalogues.
 *
 * @param {string} productName - Product name to search for
 * @param {object} options - Configuration
 * @param {string} options.category - Product category for better search context
 * @param {number} options.maxImages - Maximum images to return (default: 8)
 * @param {boolean} options.validate - HEAD-check each URL (slower but reliable)
 * @param {string[]} options.strategies - Which strategies to use (default: all)
 * @param {Function} options.log - Logging callback
 * @returns {Promise<object>} { images: [...], sources: { google: N, bing: N, ... }, total: N }
 */
export async function sourceProductImages(productName, options = {}) {
  const {
    category = '',
    maxImages = MAX_IMAGES_PER_PRODUCT,
    validate = false,
    strategies = ['google', 'bing', 'aliexpress', 'cj', 'unsplash', 'duckduckgo'],
    log = () => {},
  } = options;

  log(`Sourcing images for "${productName}" (${category || 'no category'})...`);

  // Run strategies in parallel (grouped by speed)
  const strategyFns = {
    google: () => searchGoogleImages(productName, category, log),
    bing: () => searchBingImages(productName, category, log),
    aliexpress: () => scrapeAliExpressImages(productName, log),
    cj: () => fetchCJImages(productName, log),
    unsplash: () => searchUnsplash(productName, category, log),
    duckduckgo: () => scrapeDuckDuckGoImages(productName, category, log),
  };

  const activeStrategies = strategies.filter(s => strategyFns[s]);
  const allResults = await Promise.allSettled(
    activeStrategies.map(s => strategyFns[s]()),
  );

  // Merge and score all candidates
  let candidates = [];
  const sourceCounts = {};

  allResults.forEach((result, i) => {
    const strategyName = activeStrategies[i];
    if (result.status === 'fulfilled' && result.value?.length) {
      const images = result.value;
      sourceCounts[strategyName] = images.length;
      candidates.push(...images);
      log(`${strategyName}: found ${images.length} images`);
    } else {
      sourceCounts[strategyName] = 0;
      if (result.status === 'rejected') {
        log(`${strategyName}: failed — ${result.reason?.message || 'unknown error'}`);
      }
    }
  });

  // Deduplicate
  candidates = deduplicateImages(candidates);

  // Score and sort
  candidates = candidates
    .map(img => ({ ...img, score: scoreImage(img) }))
    .sort((a, b) => b.score - a.score);

  // Optional validation (HEAD check each URL)
  if (validate && candidates.length > 0) {
    log(`Validating top ${Math.min(candidates.length, maxImages * 2)} image URLs...`);
    const toValidate = candidates.slice(0, maxImages * 2);
    const validationResults = await Promise.allSettled(
      toValidate.map(async img => {
        const valid = await validateImageUrl(img.url);
        return { ...img, valid };
      }),
    );

    candidates = validationResults
      .filter(r => r.status === 'fulfilled' && r.value.valid)
      .map(r => r.value);
  }

  // Take top N
  const finalImages = candidates.slice(0, maxImages);

  log(`Image sourcing complete: ${finalImages.length} images from ${Object.keys(sourceCounts).filter(k => sourceCounts[k] > 0).join(', ')}`);

  return {
    images: finalImages,
    sources: sourceCounts,
    total: finalImages.length,
    candidatesScanned: candidates.length,
  };
}

/**
 * Build search dork queries for a product.
 * Returns an array of specialised search strings for different engines.
 */
export function buildImageDorks(productName, category = '') {
  const name = productName.trim();
  const cat = category.trim();

  return {
    google: [
      `"${name}" product photo -stock -mockup -placeholder`,
      `"${name}" ${cat} white background product image`,
      `site:aliexpress.com "${name}"`,
      `site:amazon.com "${name}" product`,
      `intitle:"${name}" inurl:product -pinterest -facebook`,
    ],
    bing: [
      `"${name}" product photo`,
      `"${name}" ${cat} ecommerce`,
    ],
    general: [
      `${name} ${cat} product photo`,
      `${name} high quality product image`,
    ],
  };
}

/**
 * Generate alt text for product images using AI.
 * Falls back to a template if AI is unavailable.
 */
export async function generateAltText(productName, category, imageUrl) {
  try {
    const { getGatewayModel, MODELS } = await import('./gateway.js');
    const { generateText } = await import('ai');
    const model = await getGatewayModel(MODELS.fast);

    const result = await generateText({
      model,
      prompt: `Write a concise, SEO-friendly alt text (max 125 characters) for a product image.
Product: "${productName}"
Category: "${category || 'General'}"
Return ONLY the alt text, nothing else.`,
      maxTokens: 50,
    });

    return result.text.trim().replace(/^["']|["']$/g, '');
  } catch {
    return `${productName} - ${category || 'Product'} image`;
  }
}

/**
 * Attach images to a Shopify product via the Admin GraphQL API.
 *
 * @param {string} productId - Shopify product GID
 * @param {object[]} images - Array of { url, alt } objects
 * @param {object} admin - Authenticated Shopify admin client
 */
export async function attachImagesToProduct(productId, images, admin) {
  const results = [];

  for (const img of images) {
    try {
      const response = await admin.graphql(`
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media { id alt status }
            mediaUserErrors { field message }
          }
        }
      `, {
        variables: {
          productId,
          media: [{
            originalSource: img.url,
            alt: img.alt || '',
            mediaContentType: 'IMAGE',
          }],
        },
      });

      const data = await response.json();
      const result = data.data?.productCreateMedia;

      if (result?.mediaUserErrors?.length) {
        results.push({ url: img.url, ok: false, error: result.mediaUserErrors[0].message });
      } else {
        results.push({ url: img.url, ok: true, mediaId: result?.media?.[0]?.id });
      }
    } catch (err) {
      results.push({ url: img.url, ok: false, error: err.message });
    }

    await sleep(200); // rate limit
  }

  return {
    attached: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    results,
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
