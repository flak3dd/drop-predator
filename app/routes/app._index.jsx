import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await prisma.setting.findUnique({ where: { shop } });
  const now = new Date();

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
      // Drops past their scheduled start but still SCHEDULED (needs manual or cron activation)
      prisma.drop.count({
        where: { shop, status: "SCHEDULED", scheduledAt: { lte: now } },
      }),
      // ACTIVE drops with a scheduled end within the next hour
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
    overdueCount: settings?.autoActivate ? 0 : overdueCount,
    endingSoonCount,
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
  const { stats, recentDrops, overdueCount, endingSoonCount } = useLoaderData();
  const navigate = useNavigate();

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

      {endingSoonCount > 0 && (
        <s-section>
          <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
            <s-stack direction="inline" gap="base">
              <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
                <s-text type="strong">
                  {endingSoonCount} active drop{endingSoonCount !== 1 ? "s" : ""} ending within the hour
                </s-text>
                <s-text>Prices will be automatically reverted when the scheduled end time passes.</s-text>
              </s-stack>
              <s-button variant="tertiary" onClick={() => navigate("/app/drops?status=ACTIVE")}>
                View Active
              </s-button>
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
