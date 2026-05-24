import { describe, it, expect, beforeEach } from "vitest";
import {
  mockPrisma,
  mockAuthenticate,
  resetMocks,
} from "./setup.js";

describe("Webhook: products/update", () => {
  beforeEach(resetMocks);

  it("syncs product title and image to drop products", async () => {
    mockAuthenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_UPDATE",
      payload: {
        id: 12345,
        title: "Updated Blue T-Shirt",
        images: [{ src: "https://cdn.shopify.com/new-image.jpg" }],
      },
    });

    mockPrisma.dropProduct.updateMany.mockResolvedValue({ count: 2 });

    const { action } = await import(
      "../app/routes/webhooks.products.update.jsx"
    );

    const request = new Request("http://localhost/webhooks/products/update", {
      method: "POST",
    });

    const response = await action({ request });

    expect(mockAuthenticate.webhook).toHaveBeenCalledWith(request);
    expect(mockPrisma.dropProduct.updateMany).toHaveBeenCalledWith({
      where: { productId: "gid://shopify/Product/12345" },
      data: {
        productTitle: "Updated Blue T-Shirt",
        productImage: "https://cdn.shopify.com/new-image.jpg",
      },
    });
    expect(response).toBeInstanceOf(Response);
  });

  it("handles product with no images", async () => {
    mockAuthenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_UPDATE",
      payload: {
        id: 99999,
        title: "No Image Product",
        images: [],
      },
    });

    mockPrisma.dropProduct.updateMany.mockResolvedValue({ count: 0 });

    const { action } = await import(
      "../app/routes/webhooks.products.update.jsx"
    );

    const request = new Request("http://localhost/webhooks/products/update", {
      method: "POST",
    });

    await action({ request });

    expect(mockPrisma.dropProduct.updateMany).toHaveBeenCalledWith({
      where: { productId: "gid://shopify/Product/99999" },
      data: {
        productTitle: "No Image Product",
        productImage: "",
      },
    });
  });
});

describe("Webhook: products/delete", () => {
  beforeEach(resetMocks);

  it("removes deleted product from all drops", async () => {
    mockAuthenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_DELETE",
      payload: { id: 12345 },
    });

    mockPrisma.dropProduct.deleteMany.mockResolvedValue({ count: 3 });

    const { action } = await import(
      "../app/routes/webhooks.products.delete.jsx"
    );

    const request = new Request("http://localhost/webhooks/products/delete", {
      method: "POST",
    });

    const response = await action({ request });

    expect(mockPrisma.dropProduct.deleteMany).toHaveBeenCalledWith({
      where: { productId: "gid://shopify/Product/12345" },
    });
    expect(response).toBeInstanceOf(Response);
  });

  it("handles delete for product not in any drop", async () => {
    mockAuthenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      topic: "PRODUCTS_DELETE",
      payload: { id: 99999 },
    });

    mockPrisma.dropProduct.deleteMany.mockResolvedValue({ count: 0 });

    const { action } = await import(
      "../app/routes/webhooks.products.delete.jsx"
    );

    const request = new Request("http://localhost/webhooks/products/delete", {
      method: "POST",
    });

    await action({ request });

    expect(mockPrisma.dropProduct.deleteMany).toHaveBeenCalledOnce();
  });
});

describe("Webhook: app/uninstalled", () => {
  beforeEach(resetMocks);

  it("cleans up all shop data on uninstall", async () => {
    mockAuthenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      session: { shop: "test-shop.myshopify.com" },
      topic: "APP_UNINSTALLED",
    });

    mockPrisma.dropProduct.deleteMany.mockResolvedValue({ count: 5 });
    mockPrisma.drop.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.setting.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.session.deleteMany.mockResolvedValue({ count: 1 });

    const { action } = await import(
      "../app/routes/webhooks.app.uninstalled.jsx"
    );

    const request = new Request(
      "http://localhost/webhooks/app/uninstalled",
      { method: "POST" },
    );

    const response = await action({ request });

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(response).toBeInstanceOf(Response);
  });

  it("skips cleanup if session is null (already uninstalled)", async () => {
    mockAuthenticate.webhook.mockResolvedValue({
      shop: "test-shop.myshopify.com",
      session: null,
      topic: "APP_UNINSTALLED",
    });

    const { action } = await import(
      "../app/routes/webhooks.app.uninstalled.jsx"
    );

    const request = new Request(
      "http://localhost/webhooks/app/uninstalled",
      { method: "POST" },
    );

    await action({ request });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
