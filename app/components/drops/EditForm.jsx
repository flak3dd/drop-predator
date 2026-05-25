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

export function EditForm({ drop, fetcher, onCancel }) {
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
