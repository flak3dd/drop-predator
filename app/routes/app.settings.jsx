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

  return { settings };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const autoActivate = formData.get("autoActivate") === "on";
  const autoRevertPrice = formData.get("autoRevertPrice") === "on";
  const autoPublish = formData.get("autoPublish") === "on";

  await prisma.setting.upsert({
    where: { shop: session.shop },
    update: { autoActivate, autoRevertPrice, autoPublish },
    create: {
      shop: session.shop,
      autoActivate,
      autoRevertPrice,
      autoPublish,
    },
  });

  return { success: "Settings saved" };
};

export default function Settings() {
  const { settings } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const isSubmitting = fetcher.state === "submitting";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.success);
    }
  }, [fetcher.data]);

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
                    time passes. Checked each time you visit the
                    dashboard. Prices will be synced to Shopify on
                    activation.
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
