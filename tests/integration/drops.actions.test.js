import { describe, it, expect, beforeEach } from "vitest";
import {
  mockPrisma,
  mockAdmin,
  resetMocks,
  createFormRequest,
} from "./setup.js";

const DROP_FIXTURE = {
  id: "drop-1",
  shop: "test-shop.myshopify.com",
  title: "Summer Drop",
  description: "Hot products",
  status: "DRAFT",
  scheduledAt: null,
  startedAt: null,
  endedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Drop detail action: update", () => {
  beforeEach(resetMocks);

  it("updates drop title and description", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue(DROP_FIXTURE);
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.drop.update.mockResolvedValue({
      ...DROP_FIXTURE,
      title: "Updated Title",
    });

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({
      intent: "update",
      title: "Updated Title",
      description: "New description",
      scheduledAt: "",
    });

    const result = await action({
      request,
      params: { id: "drop-1" },
    });

    expect(result.success).toBe("Drop updated");
    expect(mockPrisma.drop.update).toHaveBeenCalledWith({
      where: { id: "drop-1" },
      data: expect.objectContaining({ title: "Updated Title" }),
    });
  });

  it("transitions DRAFT to SCHEDULED when date added", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue(DROP_FIXTURE);
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.drop.update.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({
      intent: "update",
      title: "Summer Drop",
      description: "",
      scheduledAt: "2026-06-01T10:00",
    });

    await action({ request, params: { id: "drop-1" } });

    expect(mockPrisma.drop.update).toHaveBeenCalledWith({
      where: { id: "drop-1" },
      data: expect.objectContaining({ status: "SCHEDULED" }),
    });
  });

  it("transitions SCHEDULED to DRAFT when date removed", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue({
      ...DROP_FIXTURE,
      status: "SCHEDULED",
    });
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.drop.update.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({
      intent: "update",
      title: "Summer Drop",
      description: "",
      scheduledAt: "",
    });

    await action({ request, params: { id: "drop-1" } });

    expect(mockPrisma.drop.update).toHaveBeenCalledWith({
      where: { id: "drop-1" },
      data: expect.objectContaining({ status: "DRAFT" }),
    });
  });

  it("rejects empty title", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue(DROP_FIXTURE);
    mockPrisma.setting.findUnique.mockResolvedValue(null);

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({
      intent: "update",
      title: "   ",
      description: "",
      scheduledAt: "",
    });

    const result = await action({ request, params: { id: "drop-1" } });

    expect(result.error).toBe("Title is required");
    expect(mockPrisma.drop.update).not.toHaveBeenCalled();
  });
});

describe("Drop detail action: addProducts", () => {
  beforeEach(resetMocks);

  it("adds new products and deduplicates existing", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue(DROP_FIXTURE);
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.dropProduct.findMany.mockResolvedValue([
      { productId: "gid://shopify/Product/1" },
    ]);
    mockPrisma.dropProduct.createMany.mockResolvedValue({ count: 2 });

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const products = [
      { productId: "gid://shopify/Product/1", productTitle: "Existing" },
      { productId: "gid://shopify/Product/2", productTitle: "New A" },
      { productId: "gid://shopify/Product/3", productTitle: "New B" },
    ];

    const request = createFormRequest({
      intent: "addProducts",
      products: JSON.stringify(products),
    });

    const result = await action({ request, params: { id: "drop-1" } });

    expect(result.success).toContain("2 products added");
    expect(result.success).toContain("1 already in drop");
    expect(mockPrisma.dropProduct.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          productId: "gid://shopify/Product/2",
        }),
        expect.objectContaining({
          productId: "gid://shopify/Product/3",
        }),
      ]),
    });
  });
});

describe("Drop detail action: removeProduct", () => {
  beforeEach(resetMocks);

  it("removes a product from the drop", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue(DROP_FIXTURE);
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.dropProduct.delete.mockResolvedValue({ id: "dp-1" });

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({
      intent: "removeProduct",
      productDbId: "dp-1",
    });

    const result = await action({ request, params: { id: "drop-1" } });

    expect(result.success).toBe("Product removed");
    expect(mockPrisma.dropProduct.delete).toHaveBeenCalledWith({
      where: { id: "dp-1" },
    });
  });
});

describe("Drop detail action: updateQuantity", () => {
  beforeEach(resetMocks);

  it("updates allocated quantity", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue(DROP_FIXTURE);
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.dropProduct.update.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({
      intent: "updateQuantity",
      productDbId: "dp-1",
      quantity: "75",
    });

    const result = await action({ request, params: { id: "drop-1" } });

    expect(result.success).toBe("Quantity updated");
    expect(mockPrisma.dropProduct.update).toHaveBeenCalledWith({
      where: { id: "dp-1" },
      data: { allocatedQuantity: 75 },
    });
  });

  it("handles NaN quantity by defaulting to 0", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue(DROP_FIXTURE);
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.dropProduct.update.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({
      intent: "updateQuantity",
      productDbId: "dp-1",
      quantity: "abc",
    });

    await action({ request, params: { id: "drop-1" } });

    expect(mockPrisma.dropProduct.update).toHaveBeenCalledWith({
      where: { id: "dp-1" },
      data: { allocatedQuantity: 0 },
    });
  });
});

describe("Drop detail action: updatePrice", () => {
  beforeEach(resetMocks);

  it("updates drop price", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue(DROP_FIXTURE);
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.dropProduct.update.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({
      intent: "updatePrice",
      productDbId: "dp-1",
      price: "19.99",
    });

    const result = await action({ request, params: { id: "drop-1" } });

    expect(result.success).toBe("Price updated");
    expect(mockPrisma.dropProduct.update).toHaveBeenCalledWith({
      where: { id: "dp-1" },
      data: { dropPrice: "19.99" },
    });
  });
});

describe("Drop detail action: activate", () => {
  beforeEach(resetMocks);

  it("activates drop, captures original prices, syncs drop prices", async () => {
    const dropWithProducts = {
      ...DROP_FIXTURE,
      products: [
        {
          id: "dp-1",
          productId: "gid://shopify/Product/100",
          dropPrice: "9.99",
          productTitle: "Sale Item",
        },
      ],
    };

    mockPrisma.drop.findFirst.mockResolvedValue(DROP_FIXTURE);
    mockPrisma.setting.findUnique.mockResolvedValue({ autoPublish: false });
    mockPrisma.drop.findUnique.mockResolvedValue(dropWithProducts);
    mockPrisma.dropProduct.update.mockResolvedValue({});
    mockPrisma.drop.update.mockResolvedValue({});

    mockAdmin.graphql
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            data: {
              product: {
                variants: {
                  edges: [
                    { node: { id: "gid://shopify/ProductVariant/200", price: "29.99" } },
                  ],
                },
              },
            },
          }),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            data: {
              productVariantsBulkUpdate: {
                productVariants: [{ id: "gid://shopify/ProductVariant/200", price: "9.99" }],
              },
            },
          }),
      });

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({ intent: "activate" });
    const result = await action({ request, params: { id: "drop-1" } });

    expect(result.success).toContain("activated");

    // Verify original price was captured
    expect(mockPrisma.dropProduct.update).toHaveBeenCalledWith({
      where: { id: "dp-1" },
      data: {
        originalPrice: JSON.stringify([
          { variantId: "gid://shopify/ProductVariant/200", price: "29.99" },
        ]),
      },
    });

    // Verify drop status updated
    expect(mockPrisma.drop.update).toHaveBeenCalledWith({
      where: { id: "drop-1" },
      data: expect.objectContaining({ status: "ACTIVE" }),
    });

    // Verify GraphQL was called (fetch + update)
    expect(mockAdmin.graphql).toHaveBeenCalledTimes(2);
  });

  it("publishes products when autoPublish is enabled", async () => {
    const dropWithProducts = {
      ...DROP_FIXTURE,
      products: [
        {
          id: "dp-1",
          productId: "gid://shopify/Product/100",
          dropPrice: "",
          productTitle: "Draft Item",
        },
      ],
    };

    mockPrisma.drop.findFirst.mockResolvedValue(DROP_FIXTURE);
    mockPrisma.setting.findUnique.mockResolvedValue({ autoPublish: true });
    mockPrisma.drop.findUnique.mockResolvedValue(dropWithProducts);
    mockPrisma.dropProduct.update.mockResolvedValue({});
    mockPrisma.drop.update.mockResolvedValue({});

    // Fetch variants (no drop price to set)
    mockAdmin.graphql
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            data: {
              product: {
                variants: {
                  edges: [{ node: { id: "v1", price: "29.99" } }],
                },
              },
            },
          }),
      })
      // Publish mutation
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            data: { productUpdate: { product: { id: "gid://shopify/Product/100", status: "ACTIVE" } } },
          }),
      });

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({ intent: "activate" });
    await action({ request, params: { id: "drop-1" } });

    // Should have called graphql for fetch + publish (no price update since no dropPrice)
    expect(mockAdmin.graphql).toHaveBeenCalledTimes(2);
  });
});

describe("Drop detail action: complete", () => {
  beforeEach(resetMocks);

  it("completes drop and reverts prices when autoRevertPrice is on", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue({
      ...DROP_FIXTURE,
      status: "ACTIVE",
    });
    mockPrisma.setting.findUnique.mockResolvedValue({
      autoRevertPrice: true,
    });
    mockPrisma.dropProduct.findMany.mockResolvedValue([
      {
        id: "dp-1",
        productId: "gid://shopify/Product/100",
        originalPrice: JSON.stringify([
          { variantId: "gid://shopify/ProductVariant/200", price: "29.99" },
        ]),
      },
    ]);
    mockPrisma.drop.update.mockResolvedValue({});

    mockAdmin.graphql.mockResolvedValue({
      json: () =>
        Promise.resolve({
          data: {
            productVariantsBulkUpdate: {
              productVariants: [{ id: "v200", price: "29.99" }],
            },
          },
        }),
    });

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({ intent: "complete" });
    const result = await action({ request, params: { id: "drop-1" } });

    expect(result.success).toContain("prices reverted");
    expect(mockAdmin.graphql).toHaveBeenCalledOnce();
    expect(mockPrisma.drop.update).toHaveBeenCalledWith({
      where: { id: "drop-1" },
      data: expect.objectContaining({ status: "COMPLETED" }),
    });
  });

  it("completes without reverting when autoRevertPrice is off", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue({
      ...DROP_FIXTURE,
      status: "ACTIVE",
    });
    mockPrisma.setting.findUnique.mockResolvedValue({
      autoRevertPrice: false,
    });
    mockPrisma.drop.update.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({ intent: "complete" });
    const result = await action({ request, params: { id: "drop-1" } });

    expect(result.success).toBe("Drop completed");
    expect(mockAdmin.graphql).not.toHaveBeenCalled();
  });
});

describe("Drop detail action: cancel", () => {
  beforeEach(resetMocks);

  it("cancels drop and reverts prices", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue({
      ...DROP_FIXTURE,
      status: "ACTIVE",
    });
    mockPrisma.setting.findUnique.mockResolvedValue({
      autoRevertPrice: true,
    });
    mockPrisma.dropProduct.findMany.mockResolvedValue([]);
    mockPrisma.drop.update.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({ intent: "cancel" });
    const result = await action({ request, params: { id: "drop-1" } });

    expect(result.success).toContain("cancelled");
    expect(mockPrisma.drop.update).toHaveBeenCalledWith({
      where: { id: "drop-1" },
      data: expect.objectContaining({ status: "CANCELLED" }),
    });
  });
});

describe("Drop detail action: duplicate", () => {
  beforeEach(resetMocks);

  it("clones drop and all products as new DRAFT", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue(DROP_FIXTURE);
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.dropProduct.findMany.mockResolvedValue([
      {
        id: "dp-1",
        dropId: "drop-1",
        productId: "gid://shopify/Product/100",
        productTitle: "Blue T-Shirt",
        productImage: "img.jpg",
        allocatedQuantity: 50,
        dropPrice: "19.99",
      },
    ]);
    mockPrisma.drop.create.mockResolvedValue({
      id: "drop-copy",
      title: "Summer Drop (Copy)",
    });
    mockPrisma.dropProduct.createMany.mockResolvedValue({ count: 1 });

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({ intent: "duplicate" });
    const result = await action({ request, params: { id: "drop-1" } });

    // Should redirect to new drop
    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toContain("/app/drops/drop-copy");

    // Verify drop was created as draft
    expect(mockPrisma.drop.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Summer Drop (Copy)",
        status: "DRAFT",
      }),
    });

    // Verify products were copied
    expect(mockPrisma.dropProduct.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          dropId: "drop-copy",
          productId: "gid://shopify/Product/100",
          allocatedQuantity: 50,
          dropPrice: "19.99",
        }),
      ],
    });
  });
});

describe("Drop detail action: reactivate", () => {
  beforeEach(resetMocks);

  it("reopens a completed drop as draft", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue({
      ...DROP_FIXTURE,
      status: "COMPLETED",
    });
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.drop.update.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({ intent: "reactivate" });
    const result = await action({ request, params: { id: "drop-1" } });

    expect(result.success).toBe("Drop reopened as draft");
    expect(mockPrisma.drop.update).toHaveBeenCalledWith({
      where: { id: "drop-1" },
      data: { status: "DRAFT", startedAt: null, endedAt: null },
    });
  });
});

describe("Drop detail action: delete", () => {
  beforeEach(resetMocks);

  it("deletes drop and redirects", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue(DROP_FIXTURE);
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.drop.delete.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({ intent: "delete" });
    const result = await action({ request, params: { id: "drop-1" } });

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toBe("/app/drops");
    expect(mockPrisma.drop.delete).toHaveBeenCalledWith({
      where: { id: "drop-1" },
    });
  });
});

describe("Drop detail action: not found", () => {
  beforeEach(resetMocks);

  it("throws 404 for non-existent drop", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue(null);

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({ intent: "update", title: "x" });

    await expect(
      action({ request, params: { id: "nonexistent" } }),
    ).rejects.toThrow();
  });
});

describe("Drop detail action: unknown intent", () => {
  beforeEach(resetMocks);

  it("returns error for unknown intent", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue(DROP_FIXTURE);
    mockPrisma.setting.findUnique.mockResolvedValue(null);

    const { action } = await import("../../app/routes/app.drops.$id.jsx");

    const request = createFormRequest({ intent: "bogus" });
    const result = await action({ request, params: { id: "drop-1" } });

    expect(result.error).toBe("Unknown action");
  });
});
