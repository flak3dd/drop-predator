/**
 * GET /api/cron/drops-tick
 *
 * Processes all shops every ~5 minutes (via Vercel cron):
 *   1. SCHEDULED drops whose scheduledAt has passed → activate (apply drop prices)
 *   2. ACTIVE drops whose scheduledEndAt has passed → complete (revert prices if enabled)
 *
 * Protected by CRON_SECRET env var. Vercel automatically sends
 * Authorization: Bearer <CRON_SECRET> on cron invocations.
 */
import prisma from "../db.server";

const SHOPIFY_API_VERSION = "2025-10";

// ── Shopify GraphQL helper using stored offline token ─────────────────────────

async function shopifyGraphQL(shop, accessToken, query, variables = {}) {
  const res = await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  if (!res.ok) throw new Error(`Shopify API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Price helpers ─────────────────────────────────────────────────────────────

async function captureAndApplyDropPrices(shop, accessToken, dropProduct) {
  if (!dropProduct.productId) return;

  // 1. Capture current prices as originals
  const productData = await shopifyGraphQL(
    shop,
    accessToken,
    `query getVariants($id: ID!) {
      product(id: $id) {
        variants(first: 100) { edges { node { id price } } }
      }
    }`,
    { id: dropProduct.productId },
  );

  const variants = productData.data?.product?.variants?.edges || [];
  if (variants.length === 0) return;

  await prisma.dropProduct.update({
    where: { id: dropProduct.id },
    data: {
      originalPrice: JSON.stringify(
        variants.map((v) => ({ variantId: v.node.id, price: v.node.price })),
      ),
    },
  });

  // 2. Apply drop price if set
  if (!dropProduct.dropPrice) return;

  await shopifyGraphQL(
    shop,
    accessToken,
    `mutation updateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id price }
        userErrors { field message }
      }
    }`,
    {
      productId: dropProduct.productId,
      variants: variants.map((v) => ({
        id: v.node.id,
        price: dropProduct.dropPrice,
      })),
    },
  );
}

async function revertDropPrices(shop, accessToken, dropId) {
  const products = await prisma.dropProduct.findMany({ where: { dropId } });

  for (const dp of products) {
    if (!dp.originalPrice || !dp.productId) continue;
    try {
      const originals = JSON.parse(dp.originalPrice);
      if (!Array.isArray(originals) || originals.length === 0) continue;

      await shopifyGraphQL(
        shop,
        accessToken,
        `mutation revertVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id price }
          }
        }`,
        {
          productId: dp.productId,
          variants: originals.map((o) => ({ id: o.variantId, price: o.price })),
        },
      );
    } catch (e) {
      console.error(`[cron] Failed to revert prices for ${dp.productId}:`, e.message);
    }
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  // Vercel sends: Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization") || "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
    if (provided !== cronSecret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const results = { activated: [], completed: [], errors: [] };

  // ── 1. Find SCHEDULED drops past their start time ─────────────────────────
  const overdueDrops = await prisma.drop.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    include: { products: true },
  });

  for (const drop of overdueDrops) {
    try {
      // Check if this shop has autoActivate enabled
      const settings = await prisma.setting.findUnique({
        where: { shop: drop.shop },
      });
      if (!settings?.autoActivate) continue;

      const session = await prisma.session.findFirst({
        where: { shop: drop.shop, isOnline: false },
      });
      if (!session) {
        results.errors.push(`${drop.shop}: no offline session`);
        continue;
      }

      for (const dp of drop.products) {
        await captureAndApplyDropPrices(drop.shop, session.accessToken, dp);
      }

      await prisma.drop.update({
        where: { id: drop.id },
        data: { status: "ACTIVE", startedAt: now },
      });

      results.activated.push(`${drop.shop}:${drop.title}`);
    } catch (e) {
      console.error(`[cron] activate failed for drop ${drop.id}:`, e.message);
      results.errors.push(`activate:${drop.id}: ${e.message}`);
    }
  }

  // ── 2. Find ACTIVE drops past their scheduled end time ────────────────────
  const endingDrops = await prisma.drop.findMany({
    where: {
      status: "ACTIVE",
      scheduledEndAt: { not: null, lte: now },
    },
    include: { products: true },
  });

  for (const drop of endingDrops) {
    try {
      const settings = await prisma.setting.findUnique({
        where: { shop: drop.shop },
      });

      if (settings?.autoRevertPrice !== false) {
        const session = await prisma.session.findFirst({
          where: { shop: drop.shop, isOnline: false },
        });
        if (session) {
          await revertDropPrices(drop.shop, session.accessToken, drop.id);
        }
      }

      await prisma.drop.update({
        where: { id: drop.id },
        data: { status: "COMPLETED", endedAt: now },
      });

      results.completed.push(`${drop.shop}:${drop.title}`);
    } catch (e) {
      console.error(`[cron] complete failed for drop ${drop.id}:`, e.message);
      results.errors.push(`complete:${drop.id}: ${e.message}`);
    }
  }

  console.log("[cron/drops-tick]", JSON.stringify(results));
  return Response.json({ ok: true, ...results });
};
