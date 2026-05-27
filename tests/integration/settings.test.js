import { describe, it, expect, beforeEach } from "vitest";
import {
  mockPrisma,
  mockSession,
  resetMocks,
  createFormRequest,
  createGetRequest,
} from "./setup.js";

describe("Settings loader", () => {
  beforeEach(resetMocks);

  it("upserts settings on load (creates if missing)", async () => {
    mockPrisma.setting.upsert.mockResolvedValue({
      id: "setting-1",
      shop: mockSession.shop,
      autoActivate: false,
      autoRevertPrice: true,
      autoPublish: false,
    });
    mockPrisma.aliCredential.findUnique.mockResolvedValue(null);
    mockPrisma.dataSourceConfig.findMany.mockResolvedValue([]);

    const { loader } = await import("../../app/routes/app.settings.jsx");

    const request = createGetRequest("http://localhost/app/settings");
    const result = await loader({ request });

    expect(result.settings.autoActivate).toBe(false);
    expect(result.settings.autoRevertPrice).toBe(true);
    expect(result.settings.autoPublish).toBe(false);
    expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
      where: { shop: mockSession.shop },
      update: {},
      create: { shop: mockSession.shop },
    });
  });
});

describe("Settings action", () => {
  beforeEach(resetMocks);

  it("saves all settings when checkboxes are on", async () => {
    mockPrisma.setting.upsert.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.settings.jsx");

    const request = createFormRequest({
      autoActivate: "on",
      autoRevertPrice: "on",
      autoPublish: "on",
      scoreThreshold: "65",
      marginFloor: "35",
      moqMax: "100",
      autonomyLevel: "3",
      negotiationEnabled: "on",
      pricingEnabled: "on",
      importEnabled: "on",
      deathPredictor: "on",
      surgeEnabled: "on",
    });

    const result = await action({ request });

    expect(result.success).toBe("Settings saved");
    expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
      where: { shop: mockSession.shop },
      update: expect.objectContaining({
        autoActivate: true,
        autoRevertPrice: true,
        autoPublish: true,
        engineConfig: expect.any(String),
      }),
      create: expect.objectContaining({
        shop: mockSession.shop,
        autoActivate: true,
        autoRevertPrice: true,
        autoPublish: true,
        engineConfig: expect.any(String),
      }),
    });
  });

  it("saves all settings as false when checkboxes are unchecked", async () => {
    mockPrisma.setting.upsert.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.settings.jsx");

    // Unchecked checkboxes don't send any value
    const request = createFormRequest({});

    const result = await action({ request });

    expect(result.success).toBe("Settings saved");
    expect(mockPrisma.setting.upsert).toHaveBeenCalledWith({
      where: { shop: mockSession.shop },
      update: expect.objectContaining({
        autoActivate: false,
        autoRevertPrice: false,
        autoPublish: false,
        engineConfig: expect.any(String),
      }),
      create: expect.objectContaining({
        shop: mockSession.shop,
        autoActivate: false,
        autoRevertPrice: false,
        autoPublish: false,
        engineConfig: expect.any(String),
      }),
    });
  });

  it("handles partial checkbox state", async () => {
    mockPrisma.setting.upsert.mockResolvedValue({});

    const { action } = await import("../../app/routes/app.settings.jsx");

    const request = createFormRequest({
      autoRevertPrice: "on",
    });

    const result = await action({ request });

    expect(result.success).toBe("Settings saved");
    expect(mockPrisma.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          autoActivate: false,
          autoRevertPrice: true,
          autoPublish: false,
        }),
      }),
    );
  });
});
