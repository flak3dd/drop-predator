/* eslint-disable no-undef */
import { getActivePrice } from './pricing.js';
import { generateListing } from './listing-generator.js';
import prisma from '../../db.server.js';

/**
 * Import products into Shopify as draft listings.
 * Requires the `admin` GraphQL client from authenticate.admin().
 * Products are never silently simulated — if no admin is provided the call
 * returns an explicit error so the caller can surface it to the user.
 */
export async function importListings(products, admin) {
  if (!admin) {
    return {
      ok: false,
      platform: 'none',
      error: 'Shopify admin context required. Import products via the engine UI Import button.',
      results: products.map(p => ({ id: p.id, ok: false, error: 'no admin context' })),
    };
  }
  return importToShopifyAdmin(products, admin);
}

async function importToShopifyAdmin(products, admin) {
  const results = [];

  // ── Listing tier assignment ────────────────────────────────────────────
  // Sorted by score descending (pipeline guarantees this order).
  // Top 20% → smart (viral copy, full AI)
  // Next 30% → fast (GPT-4o-mini, shorter prompt)
  // Bottom 50% → template (no AI tokens)
  const n = products.length;
  const smartCount    = Math.max(1, Math.round(n * 0.20));
  const fastCount     = Math.round(n * 0.30);

  for (let idx = 0; idx < products.length; idx++) {
    const p = products[idx];
    const tier = idx < smartCount ? 'smart' : idx < smartCount + fastCount ? 'fast' : 'template';

    try {
      const listing = await generateListing(p, { tier });
      const price = getActivePrice(p).toFixed(2);

      // Step 1: Create product (ProductCreateInput — no inline variants)
      const createResponse = await admin.graphql(`
        mutation productCreate($product: ProductCreateInput!) {
          productCreate(product: $product) {
            product {
              id handle title
              variants(first: 1) { nodes { id } }
            }
            userErrors { field message }
          }
        }
      `, {
        variables: {
          product: {
            title: listing.title || p.name,
            descriptionHtml: listing.descriptionHtml || `<p>${p.name}</p>`,
            vendor: p.supplier || 'Unbranded',
            productType: listing.productType || p.cat,
            tags: (listing.seoTags || []).concat(p.cat, p.lifecycle, 'engine-import'),
          },
        },
      });

      const createData = await createResponse.json();
      const createResult = createData.data?.productCreate;

      if (createResult?.userErrors?.length) {
        results.push({ id: p.id, ok: false, error: createResult.userErrors[0].message });
        continue;
      }

      const product = createResult?.product;
      if (!product) {
        results.push({ id: p.id, ok: false, error: 'No product in response' });
        continue;
      }

      // Step 2: Update the default variant with price + SKU
      const defaultVariantId = product.variants?.nodes?.[0]?.id;
      if (defaultVariantId) {
        try {
          const variantResponse = await admin.graphql(`
            mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                productVariants { id price }
                userErrors { field message }
              }
            }
          `, {
            variables: {
              productId: product.id,
              variants: [{
                id: defaultVariantId,
                price,
                sku: `PRED-${p.id}`,
                inventoryPolicy: 'DENY',
              }],
            },
          });
          const variantData = await variantResponse.json();
          const variantErrors = variantData.data?.productVariantsBulkUpdate?.userErrors;
          if (variantErrors?.length) {
            console.warn(`Variant update warning for ${p.name}: ${variantErrors[0].message}`);
          }
        } catch (varErr) {
          console.warn(`Variant update failed for ${p.name}: ${varErr.message}`);
        }
      }

      // Save listing to database
      await saveListingToDatabase(p, listing);

      // Mark product as imported
      await markProductAsImported(p.id, product.id);

      results.push({ id: p.id, ok: true, platform: 'shopify', shopifyId: product.id, handle: product.handle, listing });
    } catch (err) {
      results.push({ id: p.id, ok: false, error: err.message });
    }
    await sleep(300);
  }

  return { ok: true, platform: 'shopify', results };
}

async function saveListingToDatabase(product, listing) {
  try {
    // product.id is the EngineProduct DB UUID — use it directly
    await prisma.productListing.upsert({
      where: { engineProductId: product.id },
      update: {
        title: listing.title,
        description: listing.description,
        descriptionHtml: listing.descriptionHtml,
        bulletPoints: JSON.stringify(listing.bulletPoints || []),
        seoTags: JSON.stringify(listing.seoTags || []),
        metaDescription: listing.metaDescription,
        collections: JSON.stringify(listing.collections || []),
        pricingCopy: listing.pricingCopy,
        productType: listing.productType,
        aiGenerated: listing.aiGenerated || false,
      },
      create: {
        engineProductId: product.id,
        title: listing.title,
        description: listing.description,
        descriptionHtml: listing.descriptionHtml,
        bulletPoints: JSON.stringify(listing.bulletPoints || []),
        seoTags: JSON.stringify(listing.seoTags || []),
        metaDescription: listing.metaDescription,
        collections: JSON.stringify(listing.collections || []),
        pricingCopy: listing.pricingCopy,
        productType: listing.productType,
        aiGenerated: listing.aiGenerated || false,
      },
    });
  } catch (err) {
    console.error('Failed to save listing to database:', err.message);
  }
}

async function markProductAsImported(productId, shopifyProductId) {
  // productId is the EngineProduct DB UUID
  try {
    await prisma.engineProduct.update({
      where: { id: productId },
      data: { imported: true, shopifyProductId },
    });
  } catch (err) {
    console.error('Failed to mark product as imported:', err.message);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
