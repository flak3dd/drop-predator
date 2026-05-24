import { describe, it, expect, beforeEach } from "vitest";
import {
  mockPrisma,
  mockAdmin,
  mockSession,
  resetMocks,
  createGetRequest,
} from "./setup.js";

describe("Dashboard loader", () => {
  beforeEach(resetMocks);

  it("returns drop statistics", async () => {
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.drop.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(2)  // active
      .mockResolvedValueOnce(3)  // scheduled
      .mockResolvedValueOnce(4); // completed
    mockPrisma.drop.findMany.mockResolvedValue([]);

    const { loader } = await import("../app/routes/app._index.jsx");

    const request = createGetRequest("http://localhost/app");
    const result = await loader({ request });

    expect(result.stats.totalDrops).toBe(10);
    expect(result.stats.activeDrops).toBe(2);
    expect(result.stats.scheduledDrops).toBe(3);
    expect(result.stats.completedDrops).toBe(4);
  });

  it("returns recent drops", async () => {
    mockPrisma.setting.findUnique.mockResolvedValue(null);
    mockPrisma.drop.count.mockResolvedValue(0);
    mockPrisma.drop.findMany.mockResolvedValue([
      {
        id: "drop-1",
        title: "Latest Drop",
        status: "ACTIVE",
        _count: { products: 3 },
      },
    ]);

    const { loader } = await import("../app/routes/app._index.jsx");

    const request = createGetRequest("http://localhost/app");
    const result = await loader({ request });

    expect(result.recentDrops).toHaveLength(1);
    expect(result.recentDrops[0].title).toBe("Latest Drop");
  });

  it("reports overdue drops when autoActivate is off", async () => {
    mockPrisma.setting.findUnique.mockResolvedValue({
      autoActivate: false,
    });
    mockPrisma.drop.count
      .mockResolvedValueOnce(5) // total
      .mockResolvedValueOnce(1) // active
      .mockResolvedValueOnce(2) // scheduled
      .mockResolvedValueOnce(1) // completed
      .mockResolvedValueOnce(2); // overdue count
    mockPrisma.drop.findMany.mockResolvedValue([]);

    const { loader } = await import("../app/routes/app._index.jsx");

    const request = createGetRequest("http://localhost/app");
    const result = await loader({ request });

    expect(result.overdueCount).toBe(2);
    expect(result.autoActivated).toEqual([]);
    expect(result.hasAutoActivate).toBe(false);
  });

  it("auto-activates overdue drops when autoActivate is on", async () => {
    const overdueDrop = {
      id: "drop-overdue",
      title: "Overdue Flash Sale",
      status: "SCHEDULED",
      scheduledAt: new Date("2025-01-01"),
      products: [
        {
          id: "dp-1",
          productId: "gid://shopify/Product/100",
          dropPrice: "9.99",
          productTitle: "Sale Item",
        },
      ],
    };

    mockPrisma.setting.findUnique.mockResolvedValue({
      autoActivate: true,
    });
    mockPrisma.drop.findMany
      .mockResolvedValueOnce([overdueDrop]) // overdue query
      .mockResolvedValueOnce([]); // recent drops query
    mockPrisma.drop.count.mockResolvedValue(0);
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
                    { node: { id: "v1", price: "29.99" } },
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
                productVariants: [{ id: "v1", price: "9.99" }],
              },
            },
          }),
      });

    const { loader } = await import("../app/routes/app._index.jsx");

    const request = createGetRequest("http://localhost/app");
    const result = await loader({ request });

    expect(result.autoActivated).toContain("Overdue Flash Sale");
    expect(result.hasAutoActivate).toBe(true);
    expect(mockPrisma.drop.update).toHaveBeenCalledWith({
      where: { id: "drop-overdue" },
      data: expect.objectContaining({ status: "ACTIVE" }),
    });
  });

  it("skips auto-activation for drops with no products", async () => {
    mockPrisma.setting.findUnique.mockResolvedValue({
      autoActivate: true,
    });
    mockPrisma.drop.findMany
      .mockResolvedValueOnce([
        {
          id: "drop-empty",
          title: "Empty Drop",
          status: "SCHEDULED",
          scheduledAt: new Date("2025-01-01"),
          products: [],
        },
      ])
      .mockResolvedValueOnce([]);
    mockPrisma.drop.count.mockResolvedValue(0);
    mockPrisma.drop.update.mockResolvedValue({});

    const { loader } = await import("../app/routes/app._index.jsx");

    const request = createGetRequest("http://localhost/app");
    const result = await loader({ request });

    expect(result.autoActivated).toContain("Empty Drop");
    expect(mockAdmin.graphql).not.toHaveBeenCalled();
  });
});
