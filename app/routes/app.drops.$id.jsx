import { useState, useEffect, useCallback } from "react";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const STATUS_LABELS = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const loader = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);

  const drop = await prisma.drop.findFirst({
    where: { id: params.id, shop: session.shop },
    include: { products: { orderBy: { createdAt: "desc" } } },
  });

  if (!drop) {
    throw new Response("Drop not found", { status: 404 });
  }

  const settings = await prisma.setting.findUnique({
    where: { shop: session.shop },
  });

  let liveProducts = {};
  if (drop.products.length > 0) {
    try {
      const ids = drop.products.map((p) => p.productId);
      const res = await admin.graphql(
        `#graphql
        query getProducts($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              status
              totalInventory
              priceRangeV2 {
                minVariantPrice { amount currencyCode }
                maxVariantPrice { amount currencyCode }
              }
              featuredMedia {
                preview { image { url } }
              }
            }
          }
        }`,
        { variables: { ids } },
      );
      const data = await res.json();
      for (const node of data.data?.nodes || []) {
        if (node?.id) {
          liveProducts[node.id] = {
            title: node.title,
            status: node.status,
            totalInventory: node.totalInventory,
            minPrice: node.priceRangeV2?.minVariantPrice?.amount,
            maxPrice: node.priceRangeV2?.maxVariantPrice?.amount,
            currency:
              node.priceRangeV2?.minVariantPrice?.currencyCode || "USD",
            image: node.featuredMedia?.preview?.image?.url || "",
          };
        }
      }
    } catch (e) {
      console.error("Failed to fetch live product data:", e);
    }
  }

  return { drop, liveProducts, settings };
};

async function revertPrices(admin, prisma, dropId) {
  const products = await prisma.dropProduct.findMany({
    where: { dropId },
  });

  for (const dp of products) {
    if (!dp.originalPrice) continue;
    try {
      const originals = JSON.parse(dp.originalPrice);
      if (!Array.isArray(originals) || originals.length === 0) continue;

      await admin.graphql(
        `#graphql
        mutation revertVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id price }
          }
        }`,
        {
          variables: {
            productId: dp.productId,
            variants: originals.map((o) => ({
              id: o.variantId,
              price: o.price,
            })),
          },
        },
      );
    } catch (e) {
      console.error(`Failed to revert prices for ${dp.productId}:`, e);
    }
  }
}

export const action = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const drop = await prisma.drop.findFirst({
    where: { id: params.id, shop: session.shop },
  });

  if (!drop) {
    throw new Response("Drop not found", { status: 404 });
  }

  const settings = await prisma.setting.findUnique({
    where: { shop: session.shop },
  });

  switch (intent) {
    case "update": {
      const title = formData.get("title")?.toString().trim();
      const description =
        formData.get("description")?.toString().trim() || "";
      const scheduledAt = formData.get("scheduledAt")?.toString() || "";

      if (!title) return { error: "Title is required" };

      const hasSchedule = scheduledAt.length > 0;

      await prisma.drop.update({
        where: { id: params.id },
        data: {
          title,
          description,
          scheduledAt: hasSchedule ? new Date(scheduledAt) : null,
          status:
            hasSchedule && drop.status === "DRAFT"
              ? "SCHEDULED"
              : !hasSchedule && drop.status === "SCHEDULED"
                ? "DRAFT"
                : drop.status,
        },
      });
      return { success: "Drop updated" };
    }

    case "addProducts": {
      const productsJson = formData.get("products");
      const products = JSON.parse(productsJson);

      const existing = await prisma.dropProduct.findMany({
        where: { dropId: params.id },
        select: { productId: true },
      });
      const existingIds = new Set(existing.map((p) => p.productId));
      const newProducts = products.filter(
        (p) => !existingIds.has(p.productId),
      );

      if (newProducts.length > 0) {
        await prisma.dropProduct.createMany({
          data: newProducts.map((p) => ({
            dropId: params.id,
            productId: p.productId,
            productTitle: p.productTitle,
            productImage: p.productImage || "",
          })),
        });
      }

      const added = newProducts.length;
      const skipped = products.length - added;
      let msg = `${added} product${added !== 1 ? "s" : ""} added`;
      if (skipped > 0) msg += ` (${skipped} already in drop)`;
      return { success: msg };
    }

    case "removeProduct": {
      const productDbId = formData.get("productDbId");
      await prisma.dropProduct.delete({ where: { id: productDbId } });
      return { success: "Product removed" };
    }

    case "updateQuantity": {
      const productDbId = formData.get("productDbId");
      const quantity = parseInt(formData.get("quantity"), 10);
      await prisma.dropProduct.update({
        where: { id: productDbId },
        data: { allocatedQuantity: isNaN(quantity) ? 0 : quantity },
      });
      return { success: "Quantity updated" };
    }

    case "updatePrice": {
      const productDbId = formData.get("productDbId");
      const price = formData.get("price")?.toString().trim() || "";
      await prisma.dropProduct.update({
        where: { id: productDbId },
        data: { dropPrice: price },
      });
      return { success: "Price updated" };
    }

    case "activate": {
      const fullDrop = await prisma.drop.findUnique({
        where: { id: params.id },
        include: { products: true },
      });

      for (const dp of fullDrop.products) {
        if (dp.productId) {
          try {
            const productRes = await admin.graphql(
              `#graphql
              query getProduct($id: ID!) {
                product(id: $id) {
                  variants(first: 100) {
                    edges { node { id price } }
                  }
                }
              }`,
              { variables: { id: dp.productId } },
            );
            const productData = await productRes.json();
            const variants =
              productData.data?.product?.variants?.edges || [];

            if (variants.length > 0) {
              await prisma.dropProduct.update({
                where: { id: dp.id },
                data: {
                  originalPrice: JSON.stringify(
                    variants.map((v) => ({
                      variantId: v.node.id,
                      price: v.node.price,
                    })),
                  ),
                },
              });

              if (dp.dropPrice) {
                await admin.graphql(
                  `#graphql
                  mutation updateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
                    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                      productVariants { id price }
                    }
                  }`,
                  {
                    variables: {
                      productId: dp.productId,
                      variants: variants.map((v) => ({
                        id: v.node.id,
                        price: dp.dropPrice,
                      })),
                    },
                  },
                );
              }
            }

            if (settings?.autoPublish) {
              await admin.graphql(
                `#graphql
                mutation publishProduct($id: ID!) {
                  productUpdate(product: { id: $id, status: ACTIVE }) {
                    product { id status }
                  }
                }`,
                { variables: { id: dp.productId } },
              );
            }
          } catch (e) {
            console.error(
              `Failed to process ${dp.productId} for activation:`,
              e,
            );
          }
        }
      }

      await prisma.drop.update({
        where: { id: params.id },
        data: { status: "ACTIVE", startedAt: new Date() },
      });

      return {
        success: `Drop activated — ${fullDrop.products.length} product(s) processed`,
      };
    }

    case "complete": {
      if (settings?.autoRevertPrice) {
        await revertPrices(admin, prisma, params.id);
      }

      await prisma.drop.update({
        where: { id: params.id },
        data: { status: "COMPLETED", endedAt: new Date() },
      });

      return {
        success: settings?.autoRevertPrice
          ? "Drop completed — prices reverted"
          : "Drop completed",
      };
    }

    case "cancel": {
      if (settings?.autoRevertPrice) {
        await revertPrices(admin, prisma, params.id);
      }

      await prisma.drop.update({
        where: { id: params.id },
        data: { status: "CANCELLED", endedAt: new Date() },
      });

      return {
        success: settings?.autoRevertPrice
          ? "Drop cancelled — prices reverted"
          : "Drop cancelled",
      };
    }

    case "duplicate": {
      const sourceProducts = await prisma.dropProduct.findMany({
        where: { dropId: params.id },
      });

      const newDrop = await prisma.drop.create({
        data: {
          shop: session.shop,
          title: `${drop.title} (Copy)`,
          description: drop.description,
          status: "DRAFT",
        },
      });

      if (sourceProducts.length > 0) {
        await prisma.dropProduct.createMany({
          data: sourceProducts.map((p) => ({
            dropId: newDrop.id,
            productId: p.productId,
            productTitle: p.productTitle,
            productImage: p.productImage,
            allocatedQuantity: p.allocatedQuantity,
            dropPrice: p.dropPrice,
          })),
        });
      }

      return redirect(`/app/drops/${newDrop.id}`);
    }

    case "reactivate": {
      await prisma.drop.update({
        where: { id: params.id },
        data: { status: "DRAFT", startedAt: null, endedAt: null },
      });
      return { success: "Drop reopened as draft" };
    }

    case "delete": {
      await prisma.drop.delete({ where: { id: params.id } });
      return redirect("/app/drops");
    }

    default:
      return { error: "Unknown action" };
  }
};

export default function DropDetail() {
  const { drop, liveProducts, settings } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.success);
      if (editing) setEditing(false);
    }
  }, [fetcher.data]);

  const addProducts = useCallback(async () => {
    try {
      const selected = await shopify.resourcePicker({
        type: "product",
        multiple: true,
      });
      if (selected && selected.length > 0) {
        const products = selected.map((p) => ({
          productId: p.id,
          productTitle: p.title,
          productImage: p.images?.[0]?.originalSrc || "",
        }));
        fetcher.submit(
          { intent: "addProducts", products: JSON.stringify(products) },
          { method: "POST" },
        );
      }
    } catch (e) {
      console.error("Resource picker error:", e);
    }
  }, [shopify, fetcher]);

  const isDraft = drop.status === "DRAFT";
  const isScheduled = drop.status === "SCHEDULED";
  const isActive = drop.status === "ACTIVE";
  const isFinished =
    drop.status === "COMPLETED" || drop.status === "CANCELLED";
  const isSubmitting = fetcher.state !== "idle";

  const totalAllocated = drop.products.reduce(
    (sum, p) => sum + p.allocatedQuantity,
    0,
  );
  const totalCurrentInventory = drop.products.reduce((sum, p) => {
    const live = liveProducts[p.productId];
    return sum + (live?.totalInventory || 0);
  }, 0);

  return (
    <s-page heading={drop.title}>
      <s-button
        slot="primary-action"
        variant="tertiary"
        onClick={() => navigate("/app/drops")}
      >
        Back to Drops
      </s-button>

      {/* Status & Info */}
      <s-section heading="Drop Details">
        {fetcher.data?.error && (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-text type="strong" style={{ color: "#d72c0d" }}>
              {fetcher.data.error}
            </s-text>
          </s-box>
        )}

        {editing ? (
          <EditForm
            drop={drop}
            fetcher={fetcher}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <s-stack direction="block" gap="base">
            <InfoRow
              label="Status"
              value={STATUS_LABELS[drop.status] || drop.status}
            />
            {drop.description && (
              <InfoRow label="Description" value={drop.description} />
            )}
            {drop.scheduledAt && (
              <InfoRow
                label="Scheduled"
                value={new Date(drop.scheduledAt).toLocaleString()}
              />
            )}
            {drop.startedAt && (
              <InfoRow
                label="Started"
                value={new Date(drop.startedAt).toLocaleString()}
              />
            )}
            {drop.endedAt && (
              <InfoRow
                label="Ended"
                value={new Date(drop.endedAt).toLocaleString()}
              />
            )}
            <s-text>
              Created {new Date(drop.createdAt).toLocaleString()}
            </s-text>
          </s-stack>
        )}
      </s-section>

      {/* Actions */}
      <s-section heading="Actions">
        <s-stack direction="inline" gap="base">
          {!editing && !isFinished && (
            <s-button onClick={() => setEditing(true)}>Edit</s-button>
          )}
          {(isDraft || isScheduled) && (
            <s-button
              variant="primary"
              {...(isSubmitting ? { loading: true } : {})}
              onClick={() =>
                fetcher.submit({ intent: "activate" }, { method: "POST" })
              }
            >
              Activate Drop
            </s-button>
          )}
          {isActive && (
            <s-button
              {...(isSubmitting ? { loading: true } : {})}
              onClick={() =>
                fetcher.submit({ intent: "complete" }, { method: "POST" })
              }
            >
              Complete Drop
            </s-button>
          )}
          {(isActive || isScheduled) && (
            <s-button
              variant="tertiary"
              onClick={() => {
                if (confirm("Cancel this drop?")) {
                  fetcher.submit({ intent: "cancel" }, { method: "POST" });
                }
              }}
            >
              Cancel Drop
            </s-button>
          )}
          <s-button
            variant="tertiary"
            onClick={() =>
              fetcher.submit({ intent: "duplicate" }, { method: "POST" })
            }
          >
            Duplicate
          </s-button>
          {isFinished && (
            <s-button
              variant="tertiary"
              onClick={() =>
                fetcher.submit(
                  { intent: "reactivate" },
                  { method: "POST" },
                )
              }
            >
              Reopen as Draft
            </s-button>
          )}
          <s-button
            variant="tertiary"
            tone="critical"
            onClick={() => {
              if (confirm("Delete this drop? This cannot be undone.")) {
                fetcher.submit({ intent: "delete" }, { method: "POST" });
              }
            }}
          >
            Delete
          </s-button>
        </s-stack>
      </s-section>

      {/* Products */}
      <s-section heading={`Products (${drop.products.length})`}>
        {!isFinished && (
          <s-box padding-block-end="base">
            <s-button onClick={addProducts}>Add Products</s-button>
          </s-box>
        )}
        {drop.products.length === 0 ? (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-paragraph>
              No products added yet.
              {!isFinished &&
                " Click 'Add Products' to select products from your store."}
            </s-paragraph>
          </s-box>
        ) : (
          <s-stack direction="block" gap="base">
            {drop.products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                liveData={liveProducts[product.productId]}
                fetcher={fetcher}
                readonly={isFinished}
              />
            ))}
          </s-stack>
        )}
      </s-section>

      {/* Live Analytics sidebar */}
      <s-section slot="aside" heading="Live Analytics">
        <s-stack direction="block" gap="base">
          <InfoRow
            label="Products"
            value={String(drop.products.length)}
          />
          <InfoRow
            label="Allocated"
            value={`${totalAllocated} units`}
          />
          <InfoRow
            label="Current Inventory"
            value={`${totalCurrentInventory} units`}
          />
          {isActive && totalAllocated > 0 && (
            <InfoRow
              label="Est. Sold"
              value={`${Math.max(0, totalAllocated - totalCurrentInventory)} units`}
            />
          )}
          {drop.startedAt && drop.endedAt && (
            <InfoRow
              label="Duration"
              value={formatDuration(
                new Date(drop.startedAt),
                new Date(drop.endedAt),
              )}
            />
          )}
          {drop.startedAt && !drop.endedAt && (
            <InfoRow
              label="Running for"
              value={formatDuration(new Date(drop.startedAt), new Date())}
            />
          )}
        </s-stack>
      </s-section>

      {/* Config sidebar */}
      <s-section slot="aside" heading="Active Settings">
        <s-stack direction="block" gap="tight">
          <s-text>
            Auto-revert prices:{" "}
            {settings?.autoRevertPrice !== false ? "On" : "Off"}
          </s-text>
          <s-text>
            Auto-publish: {settings?.autoPublish ? "On" : "Off"}
          </s-text>
          <s-text>
            Auto-activate: {settings?.autoActivate ? "On" : "Off"}
          </s-text>
          <s-link href="/app/settings">
            <s-text>Change settings</s-text>
          </s-link>
        </s-stack>
      </s-section>
    </s-page>
  );
}

function EditForm({ drop, fetcher, onCancel }) {
  const isSubmitting = fetcher.state === "submitting";

  return (
    <fetcher.Form method="POST">
      <input type="hidden" name="intent" value="update" />
      <s-stack direction="block" gap="base">
        <div>
          <label htmlFor="title" style={labelStyle}>
            Title *
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            defaultValue={drop.title}
            style={inputStyle}
          />
        </div>
        <div>
          <label htmlFor="description" style={labelStyle}>
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={drop.description}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>
        <div>
          <label htmlFor="scheduledAt" style={labelStyle}>
            Scheduled Date & Time
          </label>
          <input
            id="scheduledAt"
            name="scheduledAt"
            type="datetime-local"
            defaultValue={
              drop.scheduledAt
                ? new Date(drop.scheduledAt).toISOString().slice(0, 16)
                : ""
            }
            style={inputStyle}
          />
        </div>
        <s-stack direction="inline" gap="base">
          <s-button
            type="submit"
            variant="primary"
            {...(isSubmitting ? { loading: true } : {})}
          >
            Save
          </s-button>
          <s-button variant="tertiary" onClick={onCancel}>
            Cancel
          </s-button>
        </s-stack>
      </s-stack>
    </fetcher.Form>
  );
}

function ProductCard({ product, liveData, fetcher, readonly }) {
  const priceDisplay = liveData
    ? liveData.minPrice === liveData.maxPrice
      ? `${liveData.minPrice} ${liveData.currency}`
      : `${liveData.minPrice}–${liveData.maxPrice} ${liveData.currency}`
    : null;

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="inline" gap="base">
        {(liveData?.image || product.productImage) && (
          <img
            src={liveData?.image || product.productImage}
            alt=""
            style={{
              width: 48,
              height: 48,
              objectFit: "cover",
              borderRadius: 4,
              flexShrink: 0,
            }}
          />
        )}
        <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
          <s-text type="strong">{product.productTitle}</s-text>
          <s-text>
            Qty: {product.allocatedQuantity}
            {product.dropPrice && ` · Drop: $${product.dropPrice}`}
            {liveData && ` · Inventory: ${liveData.totalInventory}`}
            {priceDisplay && ` · Shopify: ${priceDisplay}`}
          </s-text>
          {liveData && (
            <s-text style={{ fontSize: 12, color: "#6d7175" }}>
              Shopify status: {liveData.status}
              {product.originalPrice && " · Original prices captured"}
            </s-text>
          )}
        </s-stack>
        {!readonly && (
          <s-stack direction="inline" gap="tight">
            <div>
              <label style={{ fontSize: 11, display: "block" }}>
                Qty
              </label>
              <input
                type="number"
                min="0"
                defaultValue={product.allocatedQuantity}
                style={smallInputStyle}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (val !== product.allocatedQuantity) {
                    fetcher.submit(
                      {
                        intent: "updateQuantity",
                        productDbId: product.id,
                        quantity: e.target.value,
                      },
                      { method: "POST" },
                    );
                  }
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, display: "block" }}>
                Drop $
              </label>
              <input
                type="text"
                placeholder="—"
                defaultValue={product.dropPrice}
                style={{ ...smallInputStyle, width: 80 }}
                onBlur={(e) => {
                  if (e.target.value !== product.dropPrice) {
                    fetcher.submit(
                      {
                        intent: "updatePrice",
                        productDbId: product.id,
                        price: e.target.value,
                      },
                      { method: "POST" },
                    );
                  }
                }}
              />
            </div>
            <s-button
              variant="tertiary"
              tone="critical"
              onClick={() =>
                fetcher.submit(
                  {
                    intent: "removeProduct",
                    productDbId: product.id,
                  },
                  { method: "POST" },
                )
              }
            >
              Remove
            </s-button>
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}

function InfoRow({ label, value }) {
  return (
    <s-stack direction="inline" gap="base">
      <s-text type="strong">{label}:</s-text>
      <s-text>{value}</s-text>
    </s-stack>
  );
}

function formatDuration(start, end) {
  const ms = end - start;
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0)
    return `${days} day${days !== 1 ? "s" : ""}, ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

const labelStyle = {
  display: "block",
  fontWeight: 600,
  marginBottom: 4,
  fontSize: 13,
};

const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid var(--p-color-border, #8c9196)",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
};

const smallInputStyle = {
  width: 65,
  padding: "4px 8px",
  border: "1px solid var(--p-color-border, #8c9196)",
  borderRadius: 4,
  fontSize: 13,
};

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
