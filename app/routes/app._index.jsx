import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { StatusBadge } from "../components/StatusBadge";
import logoUrl from "../assets/ccreids_logo_modern.svg";

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await prisma.setting.findUnique({ where: { shop } });
  const now = new Date();
  const autoActivate = !!settings?.autoActivate;

  // ── Auto-activate overdue scheduled drops ─────────────────────────────────
  const autoActivated = [];

  if (autoActivate) {
    const overdueDrops = await prisma.drop.findMany({
      where: { shop, status: "SCHEDULED", scheduledAt: { lte: now } },
      include: { products: true },
    });

    for (const drop of overdueDrops) {
      // Apply drop prices to Shopify variants when products exist
      if (drop.products.length > 0) {
        for (const dp of drop.products) {
          if (!dp.dropPrice || !dp.productId) continue;
          try {
            // Capture current variant prices so they can be restored later
            const priceRes = await admin.graphql(
              `#graphql
              query getProductVariants($id: ID!) {
                product(id: $id) {
                  variants(first: 100) { edges { node { id price } } }
                }
              }`,
              { variables: { id: dp.productId } }
            );
            const priceData = await priceRes.json();
            const variants =
              priceData.data?.product?.variants?.edges?.map((e) => e.node) ?? [];

            if (variants.length > 0) {
              await prisma.dropProduct.update({
                where: { id: dp.id },
                data: {
                  originalPrice: JSON.stringify(
                    variants.map((v) => ({ id: v.id, price: v.price }))
                  ),
                },
              });

              // Set drop price on all variants
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
                    variants: variants.map((v) => ({ id: v.id, price: dp.dropPrice })),
                  },
                }
              );
            }
          } catch (err) {
            console.error(
              `[auto-activate] Failed to set price for ${dp.productId}:`,
              err.message
            );
          }
        }
      }

      await prisma.drop.update({
        where: { id: drop.id },
        data: { status: "ACTIVE", startedAt: now },
      });

      autoActivated.push(drop.title);
    }
  }

  // ── Stats + recent drops ──────────────────────────────────────────────────
  const [totalDrops, activeDrops, scheduledDrops, completedDrops, recentDrops, overdueCount, endingSoonCount] =
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
      prisma.drop.count({
        where: { shop, status: "SCHEDULED", scheduledAt: { lte: now } },
      }),
      prisma.drop.count({
        where: {
          shop,
          status: "ACTIVE",
          scheduledEndAt: {
            not: null,
            lte: new Date(now.getTime() + 60 * 60 * 1000),
            gte: now,
          },
        },
      }),
    ]);

  return {
    stats: { totalDrops, activeDrops, scheduledDrops, completedDrops },
    recentDrops,
    overdueCount: autoActivate ? 0 : overdueCount,
    endingSoonCount,
    hasAutoActivate: autoActivate,
    autoActivated,
  };
};

export default function Dashboard() {
  const { stats, recentDrops, overdueCount, endingSoonCount } = useLoaderData();
  const navigate = useNavigate();

  return (
    <s-page heading="">
      <s-button slot="primary-action" onClick={() => navigate("/app/drops/new")}>
        Create Drop
      </s-button>

      {/* ── Branded hero ── */}
      <s-section>
        <div className="dp-hero">
          <div className="dp-hero__logo-wrap">
            <img src={logoUrl} alt="CCREIDS" className="dp-hero__logo" />
          </div>
          <div className="dp-hero__body">
            <div className="dp-hero__title">Drop Predator</div>
            <div className="dp-hero__sub">
              AI-powered product drops · Curated Consumer Retail Exchange
            </div>
          </div>
          <span className="dp-hero__badge">CCREIDS</span>
        </div>
      </s-section>

      {/* ── Alert banners ── */}
      {overdueCount > 0 && (
        <s-section>
          <div className="dp-alert dp-alert--warning">
            <span className="dp-alert__icon">⏰</span>
            <div className="dp-alert__body">
              <div className="dp-alert__title">
                {overdueCount} scheduled drop{overdueCount !== 1 ? "s" : ""} past due
              </div>
              <div className="dp-alert__desc">
                Enable auto-activate in Settings, or activate them manually from the Drops page.
              </div>
            </div>
            <s-button variant="tertiary" onClick={() => navigate("/app/drops?status=SCHEDULED")}>
              View Overdue
            </s-button>
          </div>
        </s-section>
      )}

      {endingSoonCount > 0 && (
        <s-section>
          <div className="dp-alert dp-alert--info">
            <span className="dp-alert__icon">⚡</span>
            <div className="dp-alert__body">
              <div className="dp-alert__title">
                {endingSoonCount} active drop{endingSoonCount !== 1 ? "s" : ""} ending within the hour
              </div>
              <div className="dp-alert__desc">
                Prices will be automatically reverted when the scheduled end time passes.
              </div>
            </div>
            <s-button variant="tertiary" onClick={() => navigate("/app/drops?status=ACTIVE")}>
              View Active
            </s-button>
          </div>
        </s-section>
      )}

      {/* ── Stats overview ── */}
      <s-section heading="Overview">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatCard label="Total Drops"  value={stats.totalDrops}     variant="total"  icon="📦" brand />
          <StatCard label="Active"        value={stats.activeDrops}    variant="active" icon="🟢" />
          <StatCard label="Scheduled"     value={stats.scheduledDrops} variant="sched"  icon="⏰" />
          <StatCard label="Completed"     value={stats.completedDrops} variant="done"   icon="✅" />
        </div>
      </s-section>

      {/* ── Recent drops ── */}
      <s-section heading="Recent Drops">
        {recentDrops.length === 0 ? (
          <div className="dp-empty">
            <div className="dp-empty__icon">📭</div>
            <div className="dp-empty__title">No drops yet</div>
            <div className="dp-empty__desc">
              Create your first product drop to start managing limited releases, flash sales, and scheduled launches.
            </div>
            <s-button onClick={() => navigate("/app/drops/new")}>
              Create your first drop
            </s-button>
          </div>
        ) : (
          <s-stack direction="block" gap="base">
            {recentDrops.map((drop) => (
              <div key={drop.id} className="dp-drop-card">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <s-link
                    href={`/app/drops/${drop.id}`}
                    style={{ flex: 1, fontWeight: 600, fontSize: 14, textDecoration: "none" }}
                  >
                    {drop.title}
                  </s-link>
                  <StatusBadge status={drop.status} />
                </div>
                <div className="dp-drop-meta">
                  <span>{drop._count.products} product{drop._count.products !== 1 ? "s" : ""}</span>
                  {drop.scheduledAt && (
                    <>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span>Scheduled {new Date(drop.scheduledAt).toLocaleDateString()}</span>
                    </>
                  )}
                  {drop.startedAt && (
                    <>
                      <span style={{ opacity: 0.4 }}>·</span>
                      <span>Started {new Date(drop.startedAt).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
            <s-button variant="tertiary" onClick={() => navigate("/app/drops")}>
              View all drops →
            </s-button>
          </s-stack>
        )}
      </s-section>

      {/* ── Aside: Quick actions ── */}
      <s-section slot="aside" heading="Quick Actions">
        <s-stack direction="block" gap="base">
          <s-button onClick={() => navigate("/app/drops/new")}>New Drop</s-button>
          <s-button variant="tertiary" onClick={() => navigate("/app/engine")}>
            Run AI Engine
          </s-button>
          <s-button variant="tertiary" onClick={() => navigate("/app/drops?status=ACTIVE")}>
            View Active Drops
          </s-button>
          <s-button variant="tertiary" onClick={() => navigate("/app/drops?status=SCHEDULED")}>
            View Scheduled Drops
          </s-button>
        </s-stack>
      </s-section>

      {/* ── Aside: How it works ── */}
      <s-section slot="aside" heading="How It Works">
        <s-unordered-list>
          <s-list-item>Create a drop and add products</s-list-item>
          <s-list-item>Set quantities and optional drop prices</s-list-item>
          <s-list-item>Schedule or activate immediately</s-list-item>
          <s-list-item>Track performance and complete when done</s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

/* ── Sub-components ── */

function StatCard({ label, value, variant, icon, brand }) {
  return (
    <div className={`dp-stat-card dp-stat-card--${variant}`}>
      <div className={`dp-stat-label${brand ? " dp-stat-label--brand" : ""}`}>
        {icon && <span style={{ marginRight: 4 }}>{icon}</span>}
        {label}
      </div>
      <div className={`dp-stat-value${brand ? " dp-stat-value--brand" : ""}`}>
        {value}
      </div>
    </div>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
