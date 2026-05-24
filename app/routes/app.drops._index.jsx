import { useLoaderData, useNavigate } from "react-router";
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

const FILTERS = ["ALL", "DRAFT", "SCHEDULED", "ACTIVE", "COMPLETED", "CANCELLED"];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const where = { shop: session.shop };
  if (status && status !== "ALL") {
    where.status = status;
  }

  const drops = await prisma.drop.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { products: true } } },
  });

  return { drops, currentStatus: status || "ALL" };
};

export default function DropsIndex() {
  const { drops, currentStatus } = useLoaderData();
  const navigate = useNavigate();

  return (
    <s-page heading="Drops">
      <s-button
        slot="primary-action"
        onClick={() => navigate("/app/drops/new")}
      >
        Create Drop
      </s-button>

      <s-section>
        <s-stack direction="inline" gap="tight">
          {FILTERS.map((s) => (
            <s-button
              key={s}
              variant={currentStatus === s ? "primary" : "tertiary"}
              onClick={() =>
                navigate(s === "ALL" ? "/app/drops" : `/app/drops?status=${s}`)
              }
            >
              {s === "ALL" ? "All" : STATUS_LABELS[s]}
            </s-button>
          ))}
        </s-stack>
      </s-section>

      <s-section>
        {drops.length === 0 ? (
          <s-box
            padding="loose"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-text type="strong">
                {currentStatus === "ALL"
                  ? "No drops yet"
                  : `No ${STATUS_LABELS[currentStatus]?.toLowerCase()} drops`}
              </s-text>
              <s-paragraph>
                {currentStatus === "ALL"
                  ? "Create your first product drop to get started."
                  : "Try a different filter or create a new drop."}
              </s-paragraph>
              {currentStatus === "ALL" && (
                <s-button onClick={() => navigate("/app/drops/new")}>
                  Create your first drop
                </s-button>
              )}
            </s-stack>
          </s-box>
        ) : (
          <s-stack direction="block" gap="base">
            {drops.map((drop) => (
              <s-box
                key={drop.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="tight">
                  <s-stack direction="inline" gap="base">
                    <s-link href={`/app/drops/${drop.id}`} style={{ flex: 1 }}>
                      <s-text type="strong">{drop.title}</s-text>
                    </s-link>
                    <s-text>
                      {STATUS_LABELS[drop.status] || drop.status}
                    </s-text>
                  </s-stack>
                  <s-text>
                    {drop._count.products} product
                    {drop._count.products !== 1 ? "s" : ""}
                    {drop.scheduledAt &&
                      ` · Scheduled: ${new Date(drop.scheduledAt).toLocaleDateString()}`}
                    {drop.startedAt &&
                      ` · Started: ${new Date(drop.startedAt).toLocaleDateString()}`}
                  </s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
