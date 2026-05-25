import { useLoaderData, useFetcher } from "react-router";
import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const settings = await prisma.setting.upsert({
    where: { shop: session.shop },
    update: {},
    create: { shop: session.shop },
  });

  const engineConfig = settings.engineConfig ? JSON.parse(settings.engineConfig) : {};

  return { settings, engineConfig };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const autoActivate = formData.get("autoActivate") === "on";
  const autoRevertPrice = formData.get("autoRevertPrice") === "on";
  const autoPublish = formData.get("autoPublish") === "on";

  // Engine configuration
  const engineConfig = {
    scoreThreshold: parseInt(formData.get("scoreThreshold") || "65"),
    marginFloor: parseInt(formData.get("marginFloor") || "35"),
    moqMax: parseInt(formData.get("moqMax") || "100"),
    autonomyLevel: parseInt(formData.get("autonomyLevel") || "3"),
    negotiationEnabled: formData.get("negotiationEnabled") === "on",
    pricingEnabled: formData.get("pricingEnabled") === "on",
    importEnabled: formData.get("importEnabled") === "on",
    deathPredictor: formData.get("deathPredictor") === "on",
    surgeEnabled: formData.get("surgeEnabled") === "on",
  };

  await prisma.setting.upsert({
    where: { shop: session.shop },
    update: { autoActivate, autoRevertPrice, autoPublish, engineConfig: JSON.stringify(engineConfig) },
    create: {
      shop: session.shop,
      autoActivate,
      autoRevertPrice,
      autoPublish,
      engineConfig: JSON.stringify(engineConfig),
    },
  });

  return { success: "Settings saved" };
};

export default function Settings() {
  const { settings, engineConfig } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isSubmitting = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.success);
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Settings">
      <s-section heading="Drop Behavior">
        <fetcher.Form method="POST">
          <s-stack direction="block" gap="base">
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="inline" gap="base">
                <input
                  type="checkbox"
                  id="autoActivate"
                  name="autoActivate"
                  defaultChecked={settings.autoActivate}
                  style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }}
                />
                <s-stack direction="block" gap="tight">
                  <label htmlFor="autoActivate" style={{ fontWeight: 600 }}>
                    Auto-activate scheduled drops
                  </label>
                  <s-text>
                    Automatically activate drops when their scheduled
                    time passes. Checked every 5 minutes via scheduled
                    task. Prices will be synced to Shopify on activation.
                  </s-text>
                </s-stack>
              </s-stack>
            </s-box>

            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="inline" gap="base">
                <input
                  type="checkbox"
                  id="autoRevertPrice"
                  name="autoRevertPrice"
                  defaultChecked={settings.autoRevertPrice}
                  style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }}
                />
                <s-stack direction="block" gap="tight">
                  <label
                    htmlFor="autoRevertPrice"
                    style={{ fontWeight: 600 }}
                  >
                    Revert prices on drop end
                  </label>
                  <s-text>
                    When a drop is completed or cancelled, restore
                    product variant prices to their original values
                    (captured at activation time).
                  </s-text>
                </s-stack>
              </s-stack>
            </s-box>

            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="inline" gap="base">
                <input
                  type="checkbox"
                  id="autoPublish"
                  name="autoPublish"
                  defaultChecked={settings.autoPublish}
                  style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }}
                />
                <s-stack direction="block" gap="tight">
                  <label htmlFor="autoPublish" style={{ fontWeight: 600 }}>
                    Publish products on activation
                  </label>
                  <s-text>
                    When a drop is activated, set all drop products to
                    ACTIVE status in Shopify. Useful for drops with
                    pre-loaded draft products.
                  </s-text>
                </s-stack>
              </s-stack>
            </s-box>

            <s-button
              type="submit"
              variant="primary"
              {...(isSubmitting ? { loading: true } : {})}
            >
              Save Settings
            </s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>

      <s-section heading="Engine Configuration">
        <fetcher.Form method="POST">
          <s-stack direction="block" gap="base">
            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-text type="strong">Product Sourcing Filters</s-text>
                <s-stack direction="inline" gap="base">
                  <s-stack direction="block" gap="tight">
                    <label htmlFor="scoreThreshold" style={{ fontWeight: 600 }}>
                      Score Threshold
                    </label>
                    <input
                      type="number"
                      id="scoreThreshold"
                      name="scoreThreshold"
                      defaultValue={engineConfig.scoreThreshold || 65}
                      min="0"
                      max="100"
                      style={{ padding: "8px", width: "80px" }}
                    />
                  </s-stack>
                  <s-stack direction="block" gap="tight">
                    <label htmlFor="marginFloor" style={{ fontWeight: 600 }}>
                      Margin Floor (%)
                    </label>
                    <input
                      type="number"
                      id="marginFloor"
                      name="marginFloor"
                      defaultValue={engineConfig.marginFloor || 35}
                      min="0"
                      max="100"
                      style={{ padding: "8px", width: "80px" }}
                    />
                  </s-stack>
                  <s-stack direction="block" gap="tight">
                    <label htmlFor="moqMax" style={{ fontWeight: 600 }}>
                      Max MOQ
                    </label>
                    <input
                      type="number"
                      id="moqMax"
                      name="moqMax"
                      defaultValue={engineConfig.moqMax || 100}
                      min="0"
                      style={{ padding: "8px", width: "80px" }}
                    />
                  </s-stack>
                </s-stack>
              </s-stack>
            </s-box>

            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-text type="strong">Pipeline Automation</s-text>
                <s-stack direction="inline" gap="base">
                  <input
                    type="checkbox"
                    id="negotiationEnabled"
                    name="negotiationEnabled"
                    defaultChecked={engineConfig.negotiationEnabled !== false}
                    style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }}
                  />
                  <s-stack direction="block" gap="tight">
                    <label htmlFor="negotiationEnabled" style={{ fontWeight: 600 }}>
                      Auto-negotiate with suppliers
                    </label>
                    <s-text>
                      Automatically negotiate better terms with suppliers using AI when possible.
                    </s-text>
                  </s-stack>
                </s-stack>
                <s-stack direction="inline" gap="base">
                  <input
                    type="checkbox"
                    id="pricingEnabled"
                    name="pricingEnabled"
                    defaultChecked={engineConfig.pricingEnabled !== false}
                    style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }}
                  />
                  <s-stack direction="block" gap="tight">
                    <label htmlFor="pricingEnabled" style={{ fontWeight: 600 }}>
                      Dynamic pricing engine
                    </label>
                    <s-text>
                      Automatically compute optimal pricing based on lifecycle, competition, and trends.
                    </s-text>
                  </s-stack>
                </s-stack>
                <s-stack direction="inline" gap="base">
                  <input
                    type="checkbox"
                    id="importEnabled"
                    name="importEnabled"
                    defaultChecked={engineConfig.importEnabled || false}
                    style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }}
                  />
                  <s-stack direction="block" gap="tight">
                    <label htmlFor="importEnabled" style={{ fontWeight: 600 }}>
                      Auto-import to Shopify
                    </label>
                    <s-text>
                      Automatically create Shopify listings for approved products.
                    </s-text>
                  </s-stack>
                </s-stack>
              </s-stack>
            </s-box>

            <s-box padding="base" borderWidth="base" borderRadius="base">
              <s-stack direction="block" gap="tight">
                <s-text type="strong">Advanced Options</s-text>
                <s-stack direction="inline" gap="base">
                  <input
                    type="checkbox"
                    id="deathPredictor"
                    name="deathPredictor"
                    defaultChecked={engineConfig.deathPredictor !== false}
                    style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }}
                  />
                  <s-stack direction="block" gap="tight">
                    <label htmlFor="deathPredictor" style={{ fontWeight: 600 }}>
                      Death predictor
                    </label>
                    <s-text>
                      Monitor product trends and alert when products are declining.
                    </s-text>
                  </s-stack>
                </s-stack>
                <s-stack direction="inline" gap="base">
                  <input
                    type="checkbox"
                    id="surgeEnabled"
                    name="surgeEnabled"
                    defaultChecked={engineConfig.surgeEnabled !== false}
                    style={{ width: 18, height: 18, flexShrink: 0, marginTop: 2 }}
                  />
                  <s-stack direction="block" gap="tight">
                    <label htmlFor="surgeEnabled" style={{ fontWeight: 600 }}>
                      Surge pricing
                    </label>
                    <s-text>
                      Enable surge pricing for viral products with strong upward trends.
                    </s-text>
                  </s-stack>
                </s-stack>
                <s-stack direction="inline" gap="base">
                  <s-stack direction="block" gap="tight">
                    <label htmlFor="autonomyLevel" style={{ fontWeight: 600 }}>
                      Autonomy Level (1-5)
                    </label>
                    <input
                      type="number"
                      id="autonomyLevel"
                      name="autonomyLevel"
                      defaultValue={engineConfig.autonomyLevel || 3}
                      min="1"
                      max="5"
                      style={{ padding: "8px", width: "80px" }}
                    />
                  </s-stack>
                  <s-text>
                    Higher levels = faster execution with less human intervention.
                  </s-text>
                </s-stack>
              </s-stack>
            </s-box>

            <s-button
              type="submit"
              variant="primary"
              {...(isSubmitting ? { loading: true } : {})}
            >
              Save Settings
            </s-button>
          </s-stack>
        </fetcher.Form>
      </s-section>

      <s-section heading="Drop Lifecycle">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text type="strong">Draft</s-text>
              <s-text>
                Initial state. Add products, set quantities and prices.
                No schedule set.
              </s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text type="strong">Scheduled</s-text>
              <s-text>
                A date and time have been set. If auto-activate is on,
                the drop goes live automatically.
              </s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text type="strong">Active</s-text>
              <s-text>
                The drop is live. Drop prices are synced to Shopify.
                Original prices are captured for reversion.
              </s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text type="strong">Completed / Cancelled</s-text>
              <s-text>
                The drop has ended. If revert-on-end is enabled,
                prices are restored. Summary stats are available.
              </s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Webhook Status">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text type="strong">products/update</s-text>
              <s-text>
                Syncs product title and image changes to drop products
              </s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text type="strong">products/delete</s-text>
              <s-text>
                Removes deleted products from all drops
              </s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text type="strong">app/uninstalled</s-text>
              <s-text>Cleans up all drop data on app uninstall</s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="API Endpoints">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text type="strong">GET /api/drops</s-text>
              <s-text>List drops. Supports ?status= and ?productId= filters</s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="tight">
              <s-text type="strong">POST /api/drops</s-text>
              <s-text>
                Intents: addProduct, removeProduct, createDrop
              </s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="Version">
        <s-text>Drop Predator v1.0.0</s-text>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
