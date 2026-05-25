import { useLoaderData, useNavigate } from "react-router";
import { useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await prisma.setting.findUnique({ where: { shop } });

  let autoActivated = [];
  if (settings?.autoActivate) {
    const overdue = await prisma.drop.findMany({
      where: {
        shop,
        status: "SCHEDULED",
        scheduledAt: { lte: new Date() },
      },
      include: { products: true },
    });

    for (const drop of overdue) {
      for (const dp of drop.products) {
        if (dp.dropPrice && dp.productId) {
          try {
            const res = await admin.graphql(
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
            const data = await res.json();
            const variants = data.data?.product?.variants?.edges || [];

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
          } catch (e) {
            console.error(
              `Auto-activate price sync failed for ${dp.productId}:`,
              e,
            );
          }
        }
      }

      await prisma.drop.update({
        where: { id: drop.id },
        data: { status: "ACTIVE", startedAt: new Date() },
      });
      autoActivated.push(drop.title);
    }
  }

  const [totalDrops, activeDrops, scheduledDrops, completedDrops, recentDrops] =
    await Promise.all([
      prisma.drop.count({ where: { shop } }),
      prisma.drop.count({ where: { shop, status: "ACTIVE" } }),
      prisma.drop.count({ where: { shop, status: "SCHEDULED" } }),
      prisma.drop.count({ where: { shop, status: "COMPLETED" } }),
      prisma.drop.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { _count: { select: { products: true } } },
      }),
    ]);

  const overdueCount = settings?.autoActivate
    ? 0
    : await prisma.drop.count({
        where: {
          shop,
          status: "SCHEDULED",
          scheduledAt: { lte: new Date() },
        },
      });

  return {
    stats: { totalDrops, activeDrops, scheduledDrops, completedDrops },
    recentDrops,
    autoActivated,
    overdueCount,
    hasAutoActivate: !!settings?.autoActivate,
  };
};

const STATUS_LABELS = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export default function Dashboard() {
  const {
    stats,
    recentDrops,
    autoActivated,
    overdueCount,
  } = useLoaderData();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  useEffect(() => {
    if (autoActivated.length > 0) {
      shopify.toast.show(
        `Auto-activated ${autoActivated.length} drop${autoActivated.length !== 1 ? "s" : ""}`,
      );
    }
  }, [autoActivated, shopify]);

  return (
    <s-page heading="Drop Predator">
      <s-button
        slot="primary-action"
        onClick={() => navigate("/app/drops/new")}
      >
        Create Drop
      </s-button>

      {overdueCount > 0 && (
        <s-section>
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="inline" gap="base">
              <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
                <s-text type="strong">
                  {overdueCount} scheduled drop
                  {overdueCount !== 1 ? "s" : ""} past due
                </s-text>
                <s-text>
                  Enable auto-activate in Settings, or activate them
                  manually from the Drops page.
                </s-text>
              </s-stack>
              <s-button
                variant="tertiary"
                onClick={() =>
                  navigate("/app/drops?status=SCHEDULED")
                }
              >
                View Overdue
              </s-button>
            </s-stack>
          </s-box>
        </s-section>
      )}

      {autoActivated.length > 0 && (
        <s-section>
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="tight">
              <s-text type="strong">
                Auto-activated {autoActivated.length} drop
                {autoActivated.length !== 1 ? "s" : ""}
              </s-text>
              <s-text>{autoActivated.join(", ")}</s-text>
            </s-stack>
          </s-box>
        </s-section>
      )}

      <s-section heading="Overview">
        <s-stack direction="inline" gap="base">
          <DashboardStatCard label="Total Drops" value={stats.totalDrops} />
          <DashboardStatCard label="Active" value={stats.activeDrops} />
          <DashboardStatCard label="Scheduled" value={stats.scheduledDrops} />
          <DashboardStatCard label="Completed" value={stats.completedDrops} />
        </s-stack>
      </s-section>

      <s-section heading="Recent Drops">
        {recentDrops.length === 0 ? (
          <s-box
            padding="loose"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-text type="strong">No drops yet</s-text>
              <s-paragraph>
                Create your first product drop to start managing limited
                releases, flash sales, and scheduled launches.
              </s-paragraph>
              <s-button onClick={() => navigate("/app/drops/new")}>
                Create your first drop
              </s-button>
            </s-stack>
          </s-box>
        ) : (
          <s-stack direction="block" gap="base">
            {recentDrops.map((drop) => (
              <s-box
                key={drop.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="tight">
                  <s-link href={`/app/drops/${drop.id}`}>
                    <s-text type="strong">{drop.title}</s-text>
                  </s-link>
                  <s-text>
                    {STATUS_LABELS[drop.status] || drop.status}
                    {" · "}
                    {drop._count.products} product
                    {drop._count.products !== 1 ? "s" : ""}
                    {drop.scheduledAt &&
                      ` · ${new Date(drop.scheduledAt).toLocaleDateString()}`}
                  </s-text>
                </s-stack>
              </s-box>
            ))}
            <s-button
              variant="tertiary"
              onClick={() => navigate("/app/drops")}
            >
              View all drops
            </s-button>
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="Quick Actions">
        <s-stack direction="block" gap="base">
          <s-button onClick={() => navigate("/app/drops/new")}>
            New Drop
          </s-button>
          <s-button
            variant="tertiary"
            onClick={() => navigate("/app/drops?status=ACTIVE")}
          >
            View Active Drops
          </s-button>
          <s-button
            variant="tertiary"
            onClick={() => navigate("/app/drops?status=SCHEDULED")}
          >
            View Scheduled Drops
          </s-button>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="How It Works">
        <s-unordered-list>
          <s-list-item>Create a drop and add products</s-list-item>
          <s-list-item>Set quantities and optional drop prices</s-list-item>
          <s-list-item>Schedule or activate immediately</s-list-item>
          <s-list-item>
            Track performance and complete when done
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

function DashboardStatCard({ label, value }) {
  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="subdued"
      style={{ minWidth: 120, textAlign: "center" }}
    >
      <s-stack direction="block" gap="tight">
        <s-text>{label}</s-text>
        <s-text type="strong" style={{ fontSize: "1.5rem" }}>
          {value}
        </s-text>
      </s-stack>
    </s-box>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
