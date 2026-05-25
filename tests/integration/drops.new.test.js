import { describe, it, expect, beforeEach } from "vitest";
import {
  mockPrisma,
  mockSession,
  resetMocks,
  createFormRequest,
} from "./setup.js";

describe("Create Drop action", () => {
  beforeEach(resetMocks);

  it("creates a draft drop without schedule", async () => {
    mockPrisma.drop.create.mockResolvedValue({
      id: "new-drop-1",
      title: "Flash Sale",
      status: "DRAFT",
    });

    const { action } = await import("../../app/routes/app.drops.new.jsx");

    const request = createFormRequest({
      title: "Flash Sale",
      description: "Quick sale event",
      scheduledAt: "",
    });

    const result = await action({ request });

    expect(result.status).toBe(302);
    expect(result.headers.get("Location")).toContain(
      "/app/drops/new-drop-1",
    );
    expect(mockPrisma.drop.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shop: mockSession.shop,
        title: "Flash Sale",
        description: "Quick sale event",
        status: "DRAFT",
        scheduledAt: null,
      }),
    });
  });

  it("creates a scheduled drop with date", async () => {
    mockPrisma.drop.create.mockResolvedValue({
      id: "new-drop-2",
      title: "Scheduled Drop",
      status: "SCHEDULED",
    });

    const { action } = await import("../../app/routes/app.drops.new.jsx");

    const request = createFormRequest({
      title: "Scheduled Drop",
      description: "",
      scheduledAt: "2026-06-01T10:00",
    });

    const result = await action({ request });

    expect(result.status).toBe(302);
    expect(mockPrisma.drop.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "SCHEDULED",
        scheduledAt: expect.any(Date),
      }),
    });
  });

  it("rejects drop with empty title", async () => {
    const { action } = await import("../../app/routes/app.drops.new.jsx");

    const request = createFormRequest({
      title: "   ",
      description: "",
      scheduledAt: "",
    });

    const result = await action({ request });

    expect(result.error).toBe("Title is required");
    expect(mockPrisma.drop.create).not.toHaveBeenCalled();
  });

  it("trims whitespace from title and description", async () => {
    mockPrisma.drop.create.mockResolvedValue({
      id: "new-drop-3",
      title: "Trimmed Title",
    });

    const { action } = await import("../../app/routes/app.drops.new.jsx");

    const request = createFormRequest({
      title: "  Trimmed Title  ",
      description: "  Trimmed Desc  ",
      scheduledAt: "",
    });

    await action({ request });

    expect(mockPrisma.drop.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: "Trimmed Title",
        description: "Trimmed Desc",
      }),
    });
  });
});
