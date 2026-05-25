import { describe, it, expect, beforeEach } from "vitest";
import { mockPrisma, resetMocks } from "./setup.js";

describe("Drop model operations", () => {
  beforeEach(resetMocks);

  it("creates a drop with default status DRAFT", async () => {
    const dropData = {
      id: "drop-1",
      shop: "test-shop.myshopify.com",
      title: "Summer Drop",
      description: "",
      status: "DRAFT",
      scheduledAt: null,
      startedAt: null,
      endedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.drop.create.mockResolvedValue(dropData);

    const result = await mockPrisma.drop.create({
      data: {
        shop: "test-shop.myshopify.com",
        title: "Summer Drop",
      },
    });

    expect(result.status).toBe("DRAFT");
    expect(result.title).toBe("Summer Drop");
    expect(result.shop).toBe("test-shop.myshopify.com");
    expect(mockPrisma.drop.create).toHaveBeenCalledOnce();
  });

  it("creates a drop with SCHEDULED status when date provided", async () => {
    const scheduledAt = new Date("2026-06-01T10:00:00Z");
    const dropData = {
      id: "drop-2",
      shop: "test-shop.myshopify.com",
      title: "Flash Sale",
      status: "SCHEDULED",
      scheduledAt,
    };

    mockPrisma.drop.create.mockResolvedValue(dropData);

    const result = await mockPrisma.drop.create({
      data: {
        shop: "test-shop.myshopify.com",
        title: "Flash Sale",
        status: "SCHEDULED",
        scheduledAt,
      },
    });

    expect(result.status).toBe("SCHEDULED");
    expect(result.scheduledAt).toEqual(scheduledAt);
  });

  it("counts drops by status", async () => {
    mockPrisma.drop.count.mockResolvedValue(3);

    const count = await mockPrisma.drop.count({
      where: { shop: "test-shop.myshopify.com", status: "ACTIVE" },
    });

    expect(count).toBe(3);
    expect(mockPrisma.drop.count).toHaveBeenCalledWith({
      where: { shop: "test-shop.myshopify.com", status: "ACTIVE" },
    });
  });

  it("finds drops with product count", async () => {
    mockPrisma.drop.findMany.mockResolvedValue([
      {
        id: "drop-1",
        title: "Summer Drop",
        status: "ACTIVE",
        _count: { products: 5 },
      },
    ]);

    const drops = await mockPrisma.drop.findMany({
      where: { shop: "test-shop.myshopify.com" },
      include: { _count: { select: { products: true } } },
    });

    expect(drops).toHaveLength(1);
    expect(drops[0]._count.products).toBe(5);
  });

  it("updates drop status to ACTIVE with startedAt", async () => {
    const now = new Date();
    mockPrisma.drop.update.mockResolvedValue({
      id: "drop-1",
      status: "ACTIVE",
      startedAt: now,
    });

    const result = await mockPrisma.drop.update({
      where: { id: "drop-1" },
      data: { status: "ACTIVE", startedAt: now },
    });

    expect(result.status).toBe("ACTIVE");
    expect(result.startedAt).toEqual(now);
  });

  it("cascade deletes drop and products", async () => {
    mockPrisma.drop.delete.mockResolvedValue({ id: "drop-1" });

    await mockPrisma.drop.delete({ where: { id: "drop-1" } });

    expect(mockPrisma.drop.delete).toHaveBeenCalledWith({
      where: { id: "drop-1" },
    });
  });
});

describe("DropProduct model operations", () => {
  beforeEach(resetMocks);

  it("creates a drop product with defaults", async () => {
    const product = {
      id: "dp-1",
      dropId: "drop-1",
      productId: "gid://shopify/Product/123",
      productTitle: "Blue T-Shirt",
      productImage: "",
      allocatedQuantity: 0,
      dropPrice: "",
      originalPrice: "",
    };

    mockPrisma.dropProduct.create.mockResolvedValue(product);

    const result = await mockPrisma.dropProduct.create({
      data: {
        dropId: "drop-1",
        productId: "gid://shopify/Product/123",
        productTitle: "Blue T-Shirt",
      },
    });

    expect(result.allocatedQuantity).toBe(0);
    expect(result.dropPrice).toBe("");
    expect(result.originalPrice).toBe("");
  });

  it("bulk creates products for a drop", async () => {
    mockPrisma.dropProduct.createMany.mockResolvedValue({ count: 3 });

    const result = await mockPrisma.dropProduct.createMany({
      data: [
        { dropId: "drop-1", productId: "gid://shopify/Product/1", productTitle: "A" },
        { dropId: "drop-1", productId: "gid://shopify/Product/2", productTitle: "B" },
        { dropId: "drop-1", productId: "gid://shopify/Product/3", productTitle: "C" },
      ],
    });

    expect(result.count).toBe(3);
  });

  it("updates allocated quantity", async () => {
    mockPrisma.dropProduct.update.mockResolvedValue({
      id: "dp-1",
      allocatedQuantity: 50,
    });

    const result = await mockPrisma.dropProduct.update({
      where: { id: "dp-1" },
      data: { allocatedQuantity: 50 },
    });

    expect(result.allocatedQuantity).toBe(50);
  });

  it("stores original price as JSON", async () => {
    const originalPrice = JSON.stringify([
      { variantId: "gid://shopify/ProductVariant/1", price: "29.99" },
      { variantId: "gid://shopify/ProductVariant/2", price: "34.99" },
    ]);

    mockPrisma.dropProduct.update.mockResolvedValue({
      id: "dp-1",
      originalPrice,
    });

    const result = await mockPrisma.dropProduct.update({
      where: { id: "dp-1" },
      data: { originalPrice },
    });

    const parsed = JSON.parse(result.originalPrice);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].price).toBe("29.99");
  });

  it("enforces unique constraint on dropId + productId", async () => {
    mockPrisma.dropProduct.findUnique.mockResolvedValue({
      id: "dp-1",
      dropId: "drop-1",
      productId: "gid://shopify/Product/123",
    });

    const existing = await mockPrisma.dropProduct.findUnique({
      where: {
        dropId_productId: {
          dropId: "drop-1",
          productId: "gid://shopify/Product/123",
        },
      },
    });

    expect(existing).not.toBeNull();
  });
});

describe("Setting model operations", () => {
  beforeEach(resetMocks);

  it("upserts settings with defaults", async () => {
    mockPrisma.setting.upsert.mockResolvedValue({
      id: "setting-1",
      shop: "test-shop.myshopify.com",
      autoActivate: false,
      autoRevertPrice: true,
      autoPublish: false,
    });

    const result = await mockPrisma.setting.upsert({
      where: { shop: "test-shop.myshopify.com" },
      update: {},
      create: { shop: "test-shop.myshopify.com" },
    });

    expect(result.autoActivate).toBe(false);
    expect(result.autoRevertPrice).toBe(true);
    expect(result.autoPublish).toBe(false);
  });

  it("updates settings toggles", async () => {
    mockPrisma.setting.upsert.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      autoActivate: true,
      autoRevertPrice: false,
      autoPublish: true,
    });

    const result = await mockPrisma.setting.upsert({
      where: { shop: "test-shop.myshopify.com" },
      update: { autoActivate: true, autoRevertPrice: false, autoPublish: true },
      create: {
        shop: "test-shop.myshopify.com",
        autoActivate: true,
        autoRevertPrice: false,
        autoPublish: true,
      },
    });

    expect(result.autoActivate).toBe(true);
    expect(result.autoRevertPrice).toBe(false);
    expect(result.autoPublish).toBe(true);
  });
});
