import { useFetcher, useNavigate } from "react-router";
import { redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const title = formData.get("title")?.toString().trim();
  const description = formData.get("description")?.toString().trim() || "";
  const scheduledAt = formData.get("scheduledAt")?.toString() || "";

  if (!title) {
    return { error: "Title is required" };
  }

  const hasSchedule = scheduledAt.length > 0;

  const drop = await prisma.drop.create({
    data: {
      shop: session.shop,
      title,
      description,
      status: hasSchedule ? "SCHEDULED" : "DRAFT",
      scheduledAt: hasSchedule ? new Date(scheduledAt) : null,
    },
  });

  return redirect(`/app/drops/${drop.id}`);
};

export default function NewDrop() {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const isSubmitting = fetcher.state === "submitting";

  return (
    <s-page heading="Create Drop">
      <fetcher.Form method="POST">
        <s-section>
          <s-stack direction="block" gap="base">
            {fetcher.data?.error && (
              <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                <s-text type="strong" style={{ color: "#d72c0d" }}>
                  {fetcher.data.error}
                </s-text>
              </s-box>
            )}

            <div>
              <label
                htmlFor="title"
                style={{
                  display: "block",
                  fontWeight: 600,
                  marginBottom: 4,
                  fontSize: 13,
                }}
              >
                Title *
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                placeholder="e.g., Summer Collection Drop"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid var(--p-color-border, #8c9196)",
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="description"
                style={{
                  display: "block",
                  fontWeight: 600,
                  marginBottom: 4,
                  fontSize: 13,
                }}
              >
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Describe this drop — what products, why now, target audience..."
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid var(--p-color-border, #8c9196)",
                  borderRadius: 8,
                  fontSize: 14,
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="scheduledAt"
                style={{
                  display: "block",
                  fontWeight: 600,
                  marginBottom: 4,
                  fontSize: 13,
                }}
              >
                Scheduled Date & Time{" "}
                <span style={{ fontWeight: 400, color: "#6d7175" }}>
                  (leave blank to save as draft)
                </span>
              </label>
              <input
                id="scheduledAt"
                name="scheduledAt"
                type="datetime-local"
                style={{
                  padding: "8px 12px",
                  border: "1px solid var(--p-color-border, #8c9196)",
                  borderRadius: 8,
                  fontSize: 14,
                }}
              />
            </div>
          </s-stack>
        </s-section>

        <s-section>
          <s-stack direction="inline" gap="base">
            <s-button
              type="submit"
              variant="primary"
              {...(isSubmitting ? { loading: true } : {})}
            >
              Create Drop
            </s-button>
            <s-button
              variant="tertiary"
              onClick={() => navigate("/app/drops")}
            >
              Cancel
            </s-button>
          </s-stack>
        </s-section>
      </fetcher.Form>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
