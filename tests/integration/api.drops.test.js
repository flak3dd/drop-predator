import { describe, it, expect, beforeEach } from "vitest";
import {
  mockPrisma,
  mockSession,
  resetMocks,
  createJsonRequest,
  createGetRequest,
} from "./setup.js";

describe("API: GET /api/drops", () => {
  beforeEach(resetMocks);

  it("returns active drops by default", async () => {
    mockPrisma.drop.findMany.mockResolvedValue([
      {
        id: "drop-1",
        title: "Summer Drop",
        status: "ACTIVE",
        scheduledAt: null,
        products: [],
        _count: { products: 3 },
      },
    ]);

    const { loader } = await import("../../app/routes/api.drops.jsx");

    const request = createGetRequest("http://localhost/api/drops");
    const response = await loader({ request });
    const data = await response.json();

    expect(data.drops).toHaveLength(1);
    expect(data.drops[0].title).toBe("Summer Drop");
    expect(data.drops[0].productCount).toBe(3);
  });

  it("filters drops by status query param", async () => {
    mockPrisma.drop.findMany.mockResolvedValue([]);

    const { loader } = await import("../../app/routes/api.drops.jsx");

    const request = createGetRequest(
      "http://localhost/api/drops?status=COMPLETED",
    );
    await loader({ request });

    expect(mockPrisma.drop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shop: mockSession.shop, status: "COMPLETED" },
      }),
    );
  });

  it("checks product membership when productId provided", async () => {
    mockPrisma.drop.findMany.mockResolvedValue([
      {
        id: "drop-1",
        title: "Summer Drop",
        status: "ACTIVE",
        scheduledAt: null,
        products: [
          { id: "dp-1", productId: "gid://shopify/Product/123", productTitle: "A", allocatedQuantity: 10, dropPrice: "" },
        ],
        _count: { products: 1 },
      },
      {
        id: "drop-2",
        title: "Winter Drop",
        status: "DRAFT",
        scheduledAt: null,
        products: [],
        _count: { products: 0 },
      },
    ]);

    const { loader } = await import("../../app/routes/api.drops.jsx");

    const request = createGetRequest(
      "http://localhost/api/drops?productId=gid://shopify/Product/123",
    );
    const response = await loader({ request });
    const data = await response.json();

    expect(data.drops[0].containsProduct).toBe(true);
    expect(data.drops[1].containsProduct).toBe(false);
  });
});

describe("API: POST /api/drops — addProduct", () => {
  beforeEach(resetMocks);

  it("adds a product to a drop", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue({
      id: "drop-1",
      shop: mockSession.shop,
      status: "DRAFT",
    });
    mockPrisma.dropProduct.findUnique.mockResolvedValue(null);
    mockPrisma.dropProduct.create.mockResolvedValue({ id: "dp-new" });

    const { action } = await import("../../app/routes/api.drops.jsx");

    const request = createJsonRequest({
      intent: "addProduct",
      dropId: "drop-1",
      productId: "gid://shopify/Product/123",
      productTitle: "Blue T-Shirt",
      productImage: "https://cdn.shopify.com/img.jpg",
    });

    const response = await action({ request });
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.message).toBe("Product added to drop");
    expect(mockPrisma.dropProduct.create).toHaveBeenCalledOnce();
  });

  it("handles duplicate product gracefully", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue({
      id: "drop-1",
      shop: mockSession.shop,
      status: "DRAFT",
    });
    mockPrisma.dropProduct.findUnique.mockResolvedValue({
      id: "dp-existing",
    });

    const { action } = await import("../../app/routes/api.drops.jsx");

    const request = createJsonRequest({
      intent: "addProduct",
      dropId: "drop-1",
      productId: "gid://shopify/Product/123",
      productTitle: "Blue T-Shirt",
    });

    const response = await action({ request });
    const data = await response.json();

    expect(data.alreadyExists).toBe(true);
    expect(mockPrisma.dropProduct.create).not.toHaveBeenCalled();
  });

  it("rejects adding to finished drops", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue({
      id: "drop-1",
      shop: mockSession.shop,
      status: "COMPLETED",
    });

    const { action } = await import("../../app/routes/api.drops.jsx");

    const request = createJsonRequest({
      intent: "addProduct",
      dropId: "drop-1",
      productId: "gid://shopify/Product/123",
      productTitle: "Blue T-Shirt",
    });

    const response = await action({ request });
    expect(response.status).toBe(400);
  });

  it("returns 404 for non-existent drop", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue(null);

    const { action } = await import("../../app/routes/api.drops.jsx");

    const request = createJsonRequest({
      intent: "addProduct",
      dropId: "nonexistent",
      productId: "gid://shopify/Product/123",
      productTitle: "Blue T-Shirt",
    });

    const response = await action({ request });
    expect(response.status).toBe(404);
  });

  it("validates required fields", async () => {
    const { action } = await import("../../app/routes/api.drops.jsx");

    const request = createJsonRequest({
      intent: "addProduct",
      dropId: "drop-1",
    });

    const response = await action({ request });
    expect(response.status).toBe(400);
  });
});

describe("API: POST /api/drops — removeProduct", () => {
  beforeEach(resetMocks);

  it("removes a product from a drop", async () => {
    mockPrisma.drop.findFirst.mockResolvedValue({
      id: "drop-1",
      shop: mockSession.shop,
    });
    mockPrisma.dropProduct.deleteMany.mockResolvedValue({ count: 1 });

    const { action } = await import("../../app/routes/api.drops.jsx");

    const request = createJsonRequest({
      intent: "removeProduct",
      dropId: "drop-1",
      productId: "gid://shopify/Product/123",
    });

    const response = await action({ request });
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(mockPrisma.dropProduct.deleteMany).toHaveBeenCalledWith({
      where: {
        dropId: "drop-1",
        productId: "gid://shopify/Product/123",
      },
    });
  });
});

describe("API: POST /api/drops — createDrop", () => {
  beforeEach(resetMocks);

  it("creates a draft drop", async () => {
    mockPrisma.drop.create.mockResolvedValue({
      id: "new-drop",
      title: "New Drop",
    });

    const { action } = await import("../../app/routes/api.drops.jsx");

    const request = createJsonRequest({
      intent: "createDrop",
      title: "New Drop",
      description: "A test drop",
    });

    const response = await action({ request });
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.drop.title).toBe("New Drop");
  });

  it("creates a scheduled drop when date provided", async () => {
    mockPrisma.drop.create.mockResolvedValue({
      id: "new-drop",
      title: "Scheduled Drop",
    });

    const { action } = await import("../../app/routes/api.drops.jsx");

    const request = createJsonRequest({
      intent: "createDrop",
      title: "Scheduled Drop",
      scheduledAt: "2026-06-01T10:00:00Z",
    });

    await action({ request });

    expect(mockPrisma.drop.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SCHEDULED" }),
      }),
    );
  });

  it("rejects drop without title", async () => {
    const { action } = await import("../../app/routes/api.drops.jsx");

    const request = createJsonRequest({
      intent: "createDrop",
      description: "No title",
    });

    const response = await action({ request });
    expect(response.status).toBe(400);
  });

  it("rejects unknown intent", async () => {
    const { action } = await import("../../app/routes/api.drops.jsx");

    const request = createJsonRequest({ intent: "unknown" });

    const response = await action({ request });
    expect(response.status).toBe(400);
  });
});
