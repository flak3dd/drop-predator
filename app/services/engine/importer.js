/* eslint-disable no-undef */
import { getActivePrice } from './price.js';
import { generateListing } from './listing-generator.js';
import prisma from '../../db.server.js';

export async function importListings(products, admin) {
  if (admin) {
    return importToShopifyAdmin(products, admin);
  }
  return {
    ok: true,
    platform: 'none',
    message: 'No store connection. Use the Shopify admin integration to import.',
    results: products.map(p => ({ id: p.id, ok: true, simulated: true })),
  };
}

async function importToShopifyAdmin(products, admin) {
  const results = [];

  for (const p of products) {
    try {
      const listing = await generateListing(p);
      const price = getActivePrice(p).toFixed(2);

      const response = await admin.graphql(`
        mutation productCreate($input: ProductInput!) {
          productCreate(input: $input) {
            product { id handle title }
            userErrors { field message }
          }
        }
      `, {
        variables: {
          input: {
            title: listing.title || p.name,
            descriptionHtml: listing.descriptionHtml || `<p>${p.name}</p>`,
            vendor: p.supplier || 'Unbranded',
            productType: listing.productType || p.cat,
            tags: (listing.seoTags || []).concat(p.cat, p.lifecycle, 'engine-import'),
            variants: [{
              price,
              sku: `PRED-${p.id}`,
              inventoryManagement: 'SHOPIFY',
            }],
          },
        },
      });

      const data = await response.json();
      const result = data.data?.productCreate;

      if (result?.userErrors?.length) {
        results.push({ id: p.id, ok: false, error: result.userErrors[0].message });
      } else if (result?.product) {
        // Save listing to database
        await saveListingToDatabase(p, listing);

        // Mark product as imported
        await markProductAsImported(p.id, result.product.id);

        results.push({ id: p.id, ok: true, platform: 'shopify', shopifyId: result.product.id, handle: result.product.handle, listing });
      } else {
        results.push({ id: p.id, ok: false, error: 'No product in response' });
      }
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
