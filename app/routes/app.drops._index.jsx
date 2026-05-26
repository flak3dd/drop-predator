import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { StatusBadge } from "../components/StatusBadge";

const FILTERS = [
  { key: "ALL",       label: "All" },
  { key: "ACTIVE",    label: "Active" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "DRAFT",     label: "Draft" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");

  const where = { shop: session.shop };
  if (status && status !== "ALL") where.status = status;

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
      <s-button slot="primary-action" onClick={() => navigate("/app/drops/new")}>
        Create Drop
      </s-button>

      {/* ── Filter bar ── */}
      <s-section>
        <div className="dp-filter-bar">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              className={`dp-filter-btn${currentStatus === key ? " dp-filter-btn--active" : ""}`}
              onClick={() => navigate(key === "ALL" ? "/app/drops" : `/app/drops?status=${key}`)}
            >
              {label}
            </button>
          ))}
        </div>
      </s-section>

      {/* ── Drop list ── */}
      <s-section>
        {drops.length === 0 ? (
          <div className="dp-empty">
            <div className="dp-empty__icon">
              {currentStatus === "ALL" ? "📭" : currentStatus === "ACTIVE" ? "🟢" : "📋"}
            </div>
            <div className="dp-empty__title">
              {currentStatus === "ALL"
                ? "No drops yet"
                : `No ${FILTERS.find(f => f.key === currentStatus)?.label?.toLowerCase() ?? currentStatus.toLowerCase()} drops`}
            </div>
            <div className="dp-empty__desc">
              {currentStatus === "ALL"
                ? "Create your first product drop to get started with limited releases and flash sales."
                : "Try a different filter or create a new drop."}
            </div>
            {currentStatus === "ALL" && (
              <s-button onClick={() => navigate("/app/drops/new")}>
                Create your first drop
              </s-button>
            )}
          </div>
        ) : (
          <s-stack direction="block" gap="base">
            {drops.map((drop) => (
              <DropCard key={drop.id} drop={drop} />
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

function DropCard({ drop }) {
  const productCount = drop._count.products;
  return (
    <div className="dp-drop-card">
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <s-link href={`/app/drops/${drop.id}`} style={{ flex: 1, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
          {drop.title}
        </s-link>
        <StatusBadge status={drop.status} />
      </div>

      {/* Meta row */}
      <div className="dp-drop-meta">
        <span>
          {productCount} product{productCount !== 1 ? "s" : ""}
        </span>
        {drop.scheduledAt && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Starts {new Date(drop.scheduledAt).toLocaleDateString()}</span>
          </>
        )}
        {drop.scheduledEndAt && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Ends {new Date(drop.scheduledEndAt).toLocaleDateString()}</span>
          </>
        )}
        {drop.startedAt && !drop.scheduledAt && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Started {new Date(drop.startedAt).toLocaleDateString()}</span>
          </>
        )}
        {drop.completedAt && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Completed {new Date(drop.completedAt).toLocaleDateString()}</span>
          </>
        )}
      </div>
    </div>
  );
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
