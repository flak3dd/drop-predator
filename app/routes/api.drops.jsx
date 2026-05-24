import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const productId = url.searchParams.get("productId");

  const where = { shop: session.shop };
  if (status) {
    where.status = status;
  } else {
    where.status = { in: ["DRAFT", "SCHEDULED", "ACTIVE"] };
  }

  const drops = await prisma.drop.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      products: {
        select: {
          id: true,
          productId: true,
          productTitle: true,
          allocatedQuantity: true,
          dropPrice: true,
        },
      },
      _count: { select: { products: true } },
    },
  });

  const result = drops.map((drop) => ({
    id: drop.id,
    title: drop.title,
    status: drop.status,
    scheduledAt: drop.scheduledAt,
    productCount: drop._count.products,
    containsProduct: productId
      ? drop.products.some((p) => p.productId === productId)
      : undefined,
  }));

  return Response.json({ drops: result });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const { intent } = body;

  switch (intent) {
    case "addProduct": {
      const { dropId, productId, productTitle, productImage } = body;

      if (!dropId || !productId || !productTitle) {
        return Response.json(
          { error: "dropId, productId, and productTitle are required" },
          { status: 400 },
        );
      }

      const drop = await prisma.drop.findFirst({
        where: { id: dropId, shop: session.shop },
      });

      if (!drop) {
        return Response.json({ error: "Drop not found" }, { status: 404 });
      }

      if (drop.status === "COMPLETED" || drop.status === "CANCELLED") {
        return Response.json(
          { error: "Cannot add products to a finished drop" },
          { status: 400 },
        );
      }

      const existing = await prisma.dropProduct.findUnique({
        where: { dropId_productId: { dropId, productId } },
      });

      if (existing) {
        return Response.json({
          success: true,
          message: "Product already in this drop",
          alreadyExists: true,
        });
      }

      await prisma.dropProduct.create({
        data: {
          dropId,
          productId,
          productTitle,
          productImage: productImage || "",
        },
      });

      return Response.json({ success: true, message: "Product added to drop" });
    }

    case "removeProduct": {
      const { dropId, productId } = body;

      if (!dropId || !productId) {
        return Response.json(
          { error: "dropId and productId are required" },
          { status: 400 },
        );
      }

      const drop = await prisma.drop.findFirst({
        where: { id: dropId, shop: session.shop },
      });

      if (!drop) {
        return Response.json({ error: "Drop not found" }, { status: 404 });
      }

      await prisma.dropProduct.deleteMany({
        where: { dropId, productId },
      });

      return Response.json({ success: true, message: "Product removed from drop" });
    }

    case "createDrop": {
      const { title, description, scheduledAt } = body;

      if (!title) {
        return Response.json(
          { error: "Title is required" },
          { status: 400 },
        );
      }

      const hasSchedule = scheduledAt && scheduledAt.length > 0;

      const drop = await prisma.drop.create({
        data: {
          shop: session.shop,
          title,
          description: description || "",
          status: hasSchedule ? "SCHEDULED" : "DRAFT",
          scheduledAt: hasSchedule ? new Date(scheduledAt) : null,
        },
      });

      return Response.json({ success: true, drop: { id: drop.id, title: drop.title } });
    }

    default:
      return Response.json({ error: "Unknown intent" }, { status: 400 });
  }
};
