import { describe, it, expect, beforeEach } from "vitest";
import {
  mockPrisma,
  mockSession,
  resetMocks,
  createGetRequest,
} from "./setup.js";

describe("Drops list loader", () => {
  beforeEach(resetMocks);

  it("returns all drops when no status filter", async () => {
    mockPrisma.drop.findMany.mockResolvedValue([
      {
        id: "drop-1",
        title: "Drop A",
        status: "ACTIVE",
        _count: { products: 2 },
      },
      {
        id: "drop-2",
        title: "Drop B",
        status: "DRAFT",
        _count: { products: 0 },
      },
    ]);

    const { loader } = await import(
      "../app/routes/app.drops._index.jsx"
    );

    const request = createGetRequest("http://localhost/app/drops");
    const result = await loader({ request });

    expect(result.drops).toHaveLength(2);
    expect(result.currentStatus).toBe("ALL");
    expect(mockPrisma.drop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shop: mockSession.shop },
      }),
    );
  });

  it("filters by status query param", async () => {
    mockPrisma.drop.findMany.mockResolvedValue([]);

    const { loader } = await import(
      "../app/routes/app.drops._index.jsx"
    );

    const request = createGetRequest(
      "http://localhost/app/drops?status=ACTIVE",
    );
    const result = await loader({ request });

    expect(result.currentStatus).toBe("ACTIVE");
    expect(mockPrisma.drop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shop: mockSession.shop, status: "ACTIVE" },
      }),
    );
  });

  it("treats ALL filter as no filter", async () => {
    mockPrisma.drop.findMany.mockResolvedValue([]);

    const { loader } = await import(
      "../app/routes/app.drops._index.jsx"
    );

    const request = createGetRequest(
      "http://localhost/app/drops?status=ALL",
    );
    const result = await loader({ request });

    expect(result.currentStatus).toBe("ALL");
    expect(mockPrisma.drop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { shop: mockSession.shop },
      }),
    );
  });

  it("orders drops by newest first", async () => {
    mockPrisma.drop.findMany.mockResolvedValue([]);

    const { loader } = await import(
      "../app/routes/app.drops._index.jsx"
    );

    const request = createGetRequest("http://localhost/app/drops");
    await loader({ request });

    expect(mockPrisma.drop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("includes product count", async () => {
    mockPrisma.drop.findMany.mockResolvedValue([
      {
        id: "drop-1",
        title: "Big Drop",
        _count: { products: 15 },
      },
    ]);

    const { loader } = await import(
      "../app/routes/app.drops._index.jsx"
    );

    const request = createGetRequest("http://localhost/app/drops");
    const result = await loader({ request });

    expect(result.drops[0]._count.products).toBe(15);
    expect(mockPrisma.drop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { _count: { select: { products: true } } },
      }),
    );
  });
});
