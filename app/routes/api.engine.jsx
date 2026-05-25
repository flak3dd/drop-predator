import { authenticate } from "../shopify.server";
import { startEngine, stopEngine, getEngineStatus, getEngineProducts, setPriceMode } from "../services/engine/pipeline.js";
import { negotiateSupplier } from "../services/engine/negotiate.js";
import { importListings } from "../services/engine/importer.js";
import prisma from "../db.server.js";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const intent = url.searchParams.get("intent");

  if (intent === "products") {
    const niche = url.searchParams.get("niche") || "gym";
    return Response.json({ products: getEngineProducts(niche) });
  }

  if (intent === "history") {
    const history = await prisma.engineRun.findMany({
      where: { shop: session.shop },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: {
        _count: { select: { products: true } },
      },
    });
    return Response.json({ history });
  }

  if (intent === "engineProducts") {
    const engineRunId = url.searchParams.get("engineRunId");
    const where = { shop: session.shop };
    if (engineRunId) {
      where.engineRunId = engineRunId;
    }

    const products = await prisma.engineProduct.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { listing: true },
    });
    return Response.json({ products });
  }

  const status = getEngineStatus(session.shop);
  return Response.json(status);
}

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const body = await request.json();
  const { intent } = body;

  switch (intent) {
    case "start": {
      const { niche = "gym", config = {} } = body;
      startEngine(session.shop, niche, config);
      return Response.json({ ok: true });
    }

    case "stop": {
      stopEngine(session.shop);
      return Response.json({ ok: true });
    }

    case "negotiate": {
      const { productId } = body;
      const status = getEngineStatus(session.shop);
      const product = status.products.find(p => p.id === productId);
      if (!product) return Response.json({ error: "Product not found" }, { status: 404 });

      const deal = await negotiateSupplier(product);
      product.negState = 5;
      product.discount = deal.discount;
      product.landed = deal.landed;
      product.margin = deal.margin;
      if (deal.moq) product.moq = deal.moq;

      return Response.json({ ok: true, deal, product });
    }

    case "setPrice": {
      const { productId, mode } = body;
      const product = setPriceMode(session.shop, productId, mode);
      if (!product) return Response.json({ error: "Product not found or invalid mode" }, { status: 400 });
      return Response.json({ ok: true, product });
    }

    case "import": {
      const { productIds } = body;
      const status = getEngineStatus(session.shop);
      let toImport = status.products;
      if (productIds?.length) {
        toImport = status.products.filter(p => productIds.includes(p.id));
      }
      if (!toImport.length) return Response.json({ error: "No products to import" }, { status: 400 });

      const result = await importListings(toImport, admin);
      result.results.forEach(r => {
        if (r.ok) {
          const p = status.products.find(x => x.id === r.id);
          if (p) p.imported = true;
        }
      });

      return Response.json({ ok: true, result });
    }

    case "createDrop": {
      const { title, productIds, scheduledAt } = body;
      if (!title || !productIds?.length) {
        return Response.json({ error: "title and productIds are required" }, { status: 400 });
      }

      // Create drop
      const drop = await prisma.drop.create({
        data: {
          shop: session.shop,
          title,
          status: scheduledAt ? "SCHEDULED" : "DRAFT",
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        },
      });

      // Add products to drop
      for (const productId of productIds) {
        const engineProduct = await prisma.engineProduct.findUnique({
          where: { id: productId },
          include: { listing: true },
        });

        if (engineProduct) {
          await prisma.dropProduct.create({
            data: {
              dropId: drop.id,
              productId: engineProduct.shopifyProductId || engineProduct.sourceId,
              productTitle: engineProduct.name,
              productImage: "",
              allocatedQuantity: 50,
              dropPrice: engineProduct.listing?.title || "",
              originalPrice: JSON.stringify([]),
            },
          });
        }
      }

      return Response.json({ ok: true, drop });
    }

    case "importToDrop": {
      const { dropId, productIds } = body;
      if (!dropId || !productIds?.length) {
        return Response.json({ error: "dropId and productIds are required" }, { status: 400 });
      }

      const drop = await prisma.drop.findFirst({
        where: { id: dropId, shop: session.shop },
      });

      if (!drop) {
        return Response.json({ error: "Drop not found" }, { status: 404 });
      }

      // Import products to Shopify first
      const status = getEngineStatus(session.shop);
      let toImport = status.products.filter(p => productIds.includes(p.id));

      if (toImport.length > 0) {
        const result = await importListings(toImport, admin);

        // Add imported products to drop
        for (const r of result.results) {
          if (r.ok) {
            await prisma.dropProduct.create({
              data: {
                dropId,
                productId: r.shopifyId,
                productTitle: r.listing?.title || "Product",
                productImage: "",
                allocatedQuantity: 50,
                dropPrice: r.listing?.title || "",
                originalPrice: JSON.stringify([]),
              },
            });
          }
        }
      }

      return Response.json({ ok: true });
    }

    default:
      return Response.json({ error: "Unknown intent" }, { status: 400 });
  }
}
