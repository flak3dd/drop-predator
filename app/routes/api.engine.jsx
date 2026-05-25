import { authenticate } from "../shopify.server";
import {
  startEngine,
  stopEngine,
  getEngineStatus,
  getEngineProducts,
  negotiateProduct,
  setPriceMode,
} from "../services/engine/pipeline.js";
import { importListings } from "../services/engine/importer.js";
import prisma from "../db.server.js";

export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const intent = url.searchParams.get("intent");

  if (intent === "products") {
    const niche = url.searchParams.get("niche") || "gym";
    return Response.json({ products: await getEngineProducts(niche) });
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

  const status = await getEngineStatus(session.shop);
  return Response.json(status);
}

export async function action({ request }) {
  const { session, admin } = await authenticate.admin(request);
  const body = await request.json();
  const { intent } = body;

  switch (intent) {
    case "start": {
      const { niche = "gym", config = {} } = body;
      const result = await startEngine(session.shop, niche, config);
      return Response.json({ ok: true, ...result });
    }

    case "stop": {
      await stopEngine(session.shop);
      return Response.json({ ok: true });
    }

    case "negotiate": {
      const { productId } = body;
      // negotiateProduct reads from DB, calls negotiateSupplier, writes result back to DB
      const result = await negotiateProduct(session.shop, productId);
      if (!result) return Response.json({ error: "Product not found" }, { status: 404 });
      return Response.json({ ok: true, product: result });
    }

    case "setPrice": {
      const { productId, mode } = body;
      const product = await setPriceMode(session.shop, productId, mode);
      if (!product) return Response.json({ error: "Product not found or invalid mode" }, { status: 400 });
      return Response.json({ ok: true, product });
    }

    case "import": {
      const { productIds } = body;
      const status = await getEngineStatus(session.shop);
      let toImport = status.products;
      if (productIds?.length) {
        toImport = status.products.filter(p => productIds.includes(p.id));
      }
      if (!toImport.length) return Response.json({ error: "No products to import" }, { status: 400 });

      // importListings handles DB updates (imported flag + shopifyProductId) internally
      const result = await importListings(toImport, admin);
      return Response.json({ ok: true, result });
    }

    case "createDrop": {
      const { title, productIds, scheduledAt } = body;
      if (!title || !productIds?.length) {
        return Response.json({ error: "title and productIds are required" }, { status: 400 });
      }

      const drop = await prisma.drop.create({
        data: {
          shop: session.shop,
          title,
          status: scheduledAt ? "SCHEDULED" : "DRAFT",
          scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        },
      });

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
              dropPrice: "",
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

      // Resolve products from current engine run
      const status = await getEngineStatus(session.shop);
      const toImport = status.products.filter(p => productIds.includes(p.id));

      if (toImport.length > 0) {
        const result = await importListings(toImport, admin);

        for (const r of result.results) {
          if (r.ok && r.shopifyId) {
            const p = toImport.find(x => x.id === r.id);
            await prisma.dropProduct.create({
              data: {
                dropId,
                productId: r.shopifyId,
                productTitle: p?.name || "Product",
                productImage: "",
                allocatedQuantity: 50,
                dropPrice: "",
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
