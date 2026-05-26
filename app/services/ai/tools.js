/**
 * app/services/ai/tools.js
 * ---------------------------------------------------------
 * Shopify automation tools available to AI agents.
 * Each tool has: description, parameters (jsonSchema), and execute.
 *
 * Tools that need a Shopify admin client are created via
 * `createShopifyTools(admin)` — call this in your route action
 * after authenticating the request.
 *
 * Tools that don't need Shopify (classification, SEO generation)
 * are exported directly.
 *
 * NOTE: We use jsonSchema() from 'ai' instead of Zod for tool parameters.
 * The @ai-sdk/gateway v1 strips the $schema draft meta-field that zodToJsonSchema
 * adds, which can lose the top-level `type` field in transit.
 * jsonSchema() produces the minimal { type, properties, required } format the
 * gateway expects and passes cleanly to both OpenAI and Anthropic.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _aiHelpers = null;
async function loadAI() {
  if (_aiHelpers) return _aiHelpers;
  const { tool, jsonSchema } = await import('ai');
  _aiHelpers = { tool, js: jsonSchema };
  return _aiHelpers;
}

// ─── Standalone tools (no admin client needed) ──────────────────────────────

let _standaloneTools = null;

export async function getStandaloneTools() {
  if (_standaloneTools) return _standaloneTools;
  const { tool, js } = await loadAI();

  _standaloneTools = {
    generateSEOFields: tool({
      description: 'Generate SEO-optimized meta title and meta description for a product.',
      inputSchema: js({
        type: 'object',
        properties: {
          productTitle: { type: 'string', description: 'Product title' },
          productDescription: { type: 'string', description: 'Product description' },
          targetKeywords: { type: 'array', items: { type: 'string' }, description: 'Optional target keywords' },
        },
        required: ['productTitle', 'productDescription'],
      }),
      execute: async ({ productTitle, productDescription, targetKeywords }) => {
        const keywords = targetKeywords?.join(', ') || productTitle;
        return {
          seoTitle: `${productTitle} | Free Shipping`,
          metaDescription: `Shop ${productTitle}. ${productDescription.slice(0, 100).replace(/<[^>]+>/g, '')}... Order now with fast delivery.`,
          focusKeyword: keywords.split(',')[0]?.trim(),
        };
      },
    }),

    classifyEmailUrgency: tool({
      description: 'Classify the urgency level of a customer email based on its content.',
      inputSchema: js({
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Email body text' },
        },
        required: ['subject', 'body'],
      }),
      execute: async ({ subject, body }) => {
        const text = (subject + ' ' + body).toLowerCase();
        const isHigh = ['missing', 'lost', 'wrong', 'refund', 'damaged', 'broken', 'urgent', 'cancel'].some(w => text.includes(w));
        return {
          urgency: isHigh ? 'high' : 'normal',
          category: text.includes('refund') ? 'refund'
            : (text.includes('missing') || text.includes('where')) ? 'tracking'
            : text.includes('wrong') ? 'wrong-item'
            : 'general',
        };
      },
    }),
  };

  return _standaloneTools;
}

// ─── Shopify-connected tools (require authenticated admin client) ───────────

export async function createShopifyTools(admin) {
  const { tool, js } = await loadAI();
  const standalone = await getStandaloneTools();

  const shopifyTools = {
    createProduct: tool({
      description: 'Create a new product in the Shopify store with full details.',
      inputSchema: js({
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Product title' },
          description: { type: 'string', description: 'HTML product description' },
          price: { type: 'number', description: 'Price in dollars' },
          compareAtPrice: { type: 'number', description: 'Original price for sale display' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Product tags' },
          vendor: { type: 'string', description: 'Brand or vendor name' },
          sku: { type: 'string', description: 'Stock keeping unit' },
          category: { type: 'string', description: 'Product category' },
        },
        required: ['title', 'description', 'price', 'tags'],
      }),
      execute: async (params) => {
        try {
          const response = await admin.graphql(`
            mutation productCreate($input: ProductInput!) {
              productCreate(input: $input) {
                product { id title handle status }
                userErrors { field message }
              }
            }
          `, {
            variables: {
              input: {
                title: params.title,
                descriptionHtml: params.description,
                vendor: params.vendor || '',
                tags: params.tags || [],
                productType: params.category || '',
              },
            },
          });
          const data = await response.json();
          const result = data.data?.productCreate;
          if (result?.userErrors?.length) {
            return { success: false, error: result.userErrors[0].message };
          }
          return {
            success: true,
            productId: result.product.id,
            handle: result.product.handle,
            status: result.product.status,
            message: `Product "${params.title}" created`,
          };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },
    }),

    publishProduct: tool({
      description: 'Publish a draft product to make it live on the storefront.',
      inputSchema: js({
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'The Shopify product GID to publish' },
        },
        required: ['productId'],
      }),
      execute: async ({ productId }) => {
        try {
          const response = await admin.graphql(`
            mutation productUpdate($input: ProductInput!) {
              productUpdate(input: $input) {
                product { id status }
                userErrors { field message }
              }
            }
          `, { variables: { input: { id: productId, status: 'ACTIVE' } } });
          const data = await response.json();
          const result = data.data?.productUpdate;
          if (result?.userErrors?.length) {
            return { success: false, error: result.userErrors[0].message };
          }
          return { success: true, productId, message: 'Product published and live' };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },
    }),

    updateProduct: tool({
      description: 'Update an existing product fields like title, description, or tags.',
      inputSchema: js({
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'Shopify product GID' },
          fields: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        required: ['productId', 'fields'],
      }),
      execute: async ({ productId, fields }) => {
        try {
          const input = { id: productId };
          if (fields.title) input.title = fields.title;
          if (fields.description) input.descriptionHtml = fields.description;
          if (fields.tags) input.tags = fields.tags;

          const response = await admin.graphql(`
            mutation productUpdate($input: ProductInput!) {
              productUpdate(input: $input) {
                product { id title }
                userErrors { field message }
              }
            }
          `, { variables: { input } });
          const data = await response.json();
          const result = data.data?.productUpdate;
          if (result?.userErrors?.length) {
            return { success: false, error: result.userErrors[0].message };
          }
          return { success: true, productId, updated: Object.keys(fields) };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },
    }),

    getProducts: tool({
      description: 'Retrieve a list of products from the Shopify store.',
      inputSchema: js({
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['all', 'active', 'draft', 'archived'], default: 'all', description: 'Filter by product status' },
          limit: { type: 'number', default: 10, description: 'Number of products to return' },
        },
      }),
      execute: async ({ status = 'all', limit = 10 }) => {
        try {
          const query = status === 'all' ? '' : `status:${status}`;
          const response = await admin.graphql(`
            query getProducts($first: Int!, $query: String) {
              products(first: $first, query: $query) {
                nodes { id title handle status priceRangeV2 { minVariantPrice { amount } } totalInventory }
              }
            }
          `, { variables: { first: Math.min(limit, 50), query: query || undefined } });
          const data = await response.json();
          const products = data.data?.products?.nodes || [];
          return { products, total: products.length };
        } catch (err) {
          return { products: [], total: 0, error: err.message };
        }
      },
    }),

    bulkUpdateTags: tool({
      description: 'Add or remove tags across multiple products at once.',
      inputSchema: js({
        type: 'object',
        properties: {
          productIds: { type: 'array', items: { type: 'string' }, description: 'List of Shopify product GIDs' },
          addTags: { type: 'array', items: { type: 'string' }, description: 'Tags to add' },
          removeTags: { type: 'array', items: { type: 'string' }, description: 'Tags to remove' },
        },
        required: ['productIds'],
      }),
      execute: async ({ productIds, addTags = [], removeTags = [] }) => {
        let updated = 0;
        for (const id of productIds) {
          try {
            if (addTags.length > 0) {
              await admin.graphql(`
                mutation tagsAdd($id: ID!, $tags: [String!]!) {
                  tagsAdd(id: $id, tags: $tags) { userErrors { message } }
                }
              `, { variables: { id, tags: addTags } });
            }
            if (removeTags.length > 0) {
              await admin.graphql(`
                mutation tagsRemove($id: ID!, $tags: [String!]!) {
                  tagsRemove(id: $id, tags: $tags) { userErrors { message } }
                }
              `, { variables: { id, tags: removeTags } });
            }
            updated++;
          } catch { /* continue */ }
        }
        return { updated, total: productIds.length, message: `Updated tags on ${updated} products` };
      },
    }),

    checkInventory: tool({
      description: 'Check current inventory levels for store products.',
      inputSchema: js({
        type: 'object',
        properties: {
          limit: { type: 'number', default: 20, description: 'Number of products to check' },
        },
      }),
      execute: async ({ limit = 20 }) => {
        try {
          const response = await admin.graphql(`
            query inventoryCheck($first: Int!) {
              products(first: $first, sortKey: INVENTORY_TOTAL, reverse: false) {
                nodes { id title totalInventory status }
              }
            }
          `, { variables: { first: Math.min(limit, 50) } });
          const data = await response.json();
          const products = data.data?.products?.nodes || [];
          const low = products.filter(p => p.totalInventory < 20);
          return { lowStockItems: low, total: products.length };
        } catch (err) {
          return { lowStockItems: [], total: 0, error: err.message };
        }
      },
    }),

    getStoreMetrics: tool({
      description: 'Get high-level store performance metrics.',
      inputSchema: js({
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['today', '7d', '30d', '90d'], default: '30d', description: 'Time period for metrics' },
        },
      }),
      execute: async ({ period = '30d' }) => {
        try {
          const response = await admin.graphql(`
            query storeMetrics {
              productsCount { count }
              orders(first: 1, sortKey: CREATED_AT, reverse: true) {
                nodes { id name }
              }
            }
          `);
          const data = await response.json();
          return {
            period,
            totalProducts: data.data?.productsCount?.count || 0,
            latestOrder: data.data?.orders?.nodes?.[0]?.name || 'N/A',
          };
        } catch (err) {
          return { period, error: err.message };
        }
      },
    }),
  };

  return { ...shopifyTools, ...standalone };
}

/**
 * Create email tools — simulated for now.
 * In production, connect to Shopify inbox, Gorgias, or a helpdesk API.
 */
export async function createEmailTools() {
  const { tool, js } = await loadAI();
  const standalone = await getStandaloneTools();

  return {
    ...standalone,

    getUnrepliedEmails: tool({
      description: 'Fetch customer emails that have not been replied to yet.',
      inputSchema: js({
        type: 'object',
        properties: {
          limit: { type: 'number', default: 10, description: 'Max emails to fetch' },
        },
      }),
      execute: async ({ limit = 10 }) => {
        const emails = [
          { id: 'em_001', from: 'customer@example.com', name: 'Customer A', subject: 'Where is my order #4821?', body: "I placed order #4821 last week and it still hasn't arrived.", urgency: 'high', orderId: '4821' },
          { id: 'em_002', from: 'customer2@example.com', name: 'Customer B', subject: 'Wrong size received', body: 'I ordered a Large but received a Medium.', urgency: 'high', orderId: '4819' },
          { id: 'em_003', from: 'customer3@example.com', name: 'Customer C', subject: 'Refund request', body: "The quality wasn't as described.", urgency: 'normal', orderId: '4802' },
        ];
        return { emails: emails.slice(0, limit), total: emails.length };
      },
    }),

    sendEmailReply: tool({
      description: 'Send a reply email to a customer.',
      inputSchema: js({
        type: 'object',
        properties: {
          emailId: { type: 'string', description: 'ID of the email to reply to' },
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Reply subject line' },
          body: { type: 'string', description: 'Plain text email body' },
        },
        required: ['emailId', 'to', 'subject', 'body'],
      }),
      execute: async ({ emailId, to, subject }) => {
        return { success: true, emailId, message: `Reply drafted for ${to}: "${subject}"` };
      },
    }),
  };
}

/**
 * Create media/image sourcing tools bound to a Shopify admin client.
 */
export async function createMediaTools(admin) {
  const { tool, js } = await loadAI();

  return {
    searchProductImages: tool({
      description: 'Search for product images across multiple sources. Returns scored and deduplicated image candidates.',
      inputSchema: js({
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Product name to search for images' },
          category: { type: 'string', description: 'Product category for better results' },
          maxImages: { type: 'number', default: 8, description: 'Maximum number of images to return' },
          strategies: {
            type: 'array',
            items: { type: 'string', enum: ['google', 'bing', 'aliexpress', 'cj', 'unsplash', 'duckduckgo'] },
            description: 'Which search strategies to use',
          },
        },
        required: ['productName'],
      }),
      execute: async ({ productName, category, maxImages, strategies }) => {
        const { sourceProductImages } = await import('./media.js');
        return sourceProductImages(productName, { category, maxImages, strategies, log: () => {} });
      },
    }),

    buildImageDorkQueries: tool({
      description: 'Generate advanced image search dork queries for a product.',
      inputSchema: js({
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Product name' },
          category: { type: 'string', description: 'Product category' },
        },
        required: ['productName'],
      }),
      execute: async ({ productName, category }) => {
        const { buildImageDorks } = await import('./media.js');
        return buildImageDorks(productName, category);
      },
    }),

    validateImageUrls: tool({
      description: 'Validate that image URLs are reachable and serve image content.',
      inputSchema: js({
        type: 'object',
        properties: {
          urls: { type: 'array', items: { type: 'string' }, description: 'Image URLs to validate' },
        },
        required: ['urls'],
      }),
      execute: async ({ urls }) => {
        const results = await Promise.allSettled(
          urls.map(async url => {
            try {
              const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
              const ct = res.headers.get('content-type') || '';
              const cl = parseInt(res.headers.get('content-length') || '0');
              return { url, valid: res.ok && ct.startsWith('image/'), contentType: ct, sizeBytes: cl };
            } catch (err) {
              return { url, valid: false, error: err.message };
            }
          }),
        );
        const validated = results.map(r => r.status === 'fulfilled' ? r.value : { url: '?', valid: false, error: 'check failed' });
        return { results: validated, valid: validated.filter(v => v.valid).length, invalid: validated.filter(v => !v.valid).length };
      },
    }),

    generateImageAltText: tool({
      description: 'Generate SEO-friendly alt text for a product image.',
      inputSchema: js({
        type: 'object',
        properties: {
          productName: { type: 'string', description: 'Product name' },
          category: { type: 'string', description: 'Product category' },
          imageContext: { type: 'string', description: 'Additional context about the image' },
        },
        required: ['productName'],
      }),
      execute: async ({ productName, category, imageContext }) => {
        const { generateAltText } = await import('./media.js');
        const alt = await generateAltText(productName, category);
        return { alt, product: productName, context: imageContext || 'product photo' };
      },
    }),

    attachImagesToShopifyProduct: tool({
      description: 'Attach image URLs to an existing Shopify product as product media.',
      inputSchema: js({
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'Shopify product GID' },
          images: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'Image URL to attach' },
                alt: { type: 'string', description: 'Alt text for the image' },
              },
              required: ['url'],
            },
            description: 'Images to attach to the product',
          },
        },
        required: ['productId', 'images'],
      }),
      execute: async ({ productId, images }) => {
        if (!admin) return { success: false, error: 'No Shopify admin client available.' };
        const { attachImagesToProduct } = await import('./media.js');
        return attachImagesToProduct(productId, images, admin);
      },
    }),

    getProductImages: tool({
      description: 'Get the current images attached to a Shopify product.',
      inputSchema: js({
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'Shopify product GID' },
        },
        required: ['productId'],
      }),
      execute: async ({ productId }) => {
        if (!admin) return { images: [], error: 'No admin client' };
        try {
          const response = await admin.graphql(`
            query productMedia($id: ID!) {
              product(id: $id) {
                id title
                media(first: 20) {
                  nodes {
                    ... on MediaImage {
                      id alt
                      image { url width height }
                      status
                    }
                  }
                }
              }
            }
          `, { variables: { id: productId } });
          const data = await response.json();
          const media = data.data?.product?.media?.nodes || [];
          return { productId, title: data.data?.product?.title, images: media, total: media.length };
        } catch (err) {
          return { productId, images: [], error: err.message };
        }
      },
    }),

    removeProductImage: tool({
      description: 'Remove an image from a Shopify product.',
      inputSchema: js({
        type: 'object',
        properties: {
          productId: { type: 'string', description: 'Shopify product GID' },
          mediaId: { type: 'string', description: 'Media GID to remove' },
        },
        required: ['productId', 'mediaId'],
      }),
      execute: async ({ productId, mediaId }) => {
        if (!admin) return { success: false, error: 'No admin client' };
        try {
          const response = await admin.graphql(`
            mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
              productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
                deletedMediaIds
                mediaUserErrors { field message }
              }
            }
          `, { variables: { productId, mediaIds: [mediaId] } });
          const data = await response.json();
          const result = data.data?.productDeleteMedia;
          if (result?.mediaUserErrors?.length) {
            return { success: false, error: result.mediaUserErrors[0].message };
          }
          return { success: true, deletedMediaId: mediaId };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },
    }),
  };
}

/**
 * Create shipping tools — simulated for now.
 */
export async function createShippingTools() {
  const { tool, js } = await loadAI();

  return {
    createShippingRule: tool({
      description: 'Create a shipping rate rule for a specific zone.',
      inputSchema: js({
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Shipping zone name' },
          method: { type: 'string', description: 'Shipping method name' },
          rate: { type: 'number', description: 'Shipping rate in dollars (0 for free)' },
          minOrderValue: { type: 'number', description: 'Minimum order value for this rate' },
          estimatedDays: { type: 'string', description: 'Estimated delivery time' },
        },
        required: ['zone', 'method', 'rate', 'estimatedDays'],
      }),
      execute: async (params) => {
        return { success: true, ruleId: `rule_${Date.now()}`, message: `Rule created: ${params.method} for ${params.zone}` };
      },
    }),

    getShippingRules: tool({
      description: 'Get all current shipping rules and zones.',
      inputSchema: js({
        type: 'object',
        properties: {
          zone: { type: 'string', description: 'Optional zone filter' },
        },
      }),
      execute: async () => {
        return { rules: [], total: 0, message: 'Connect Shopify delivery profiles for live data' };
      },
    }),
  };
}
