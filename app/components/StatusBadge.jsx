/**
 * Coloured pill badge for drop status.
 * Uses CSS classes defined in app/styles/enhancements.css.
 */

const VARIANT_MAP = {
  DRAFT:     "draft",
  SCHEDULED: "scheduled",
  ACTIVE:    "active",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
};

const LABEL_MAP = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function StatusBadge({ status }) {
  const v = VARIANT_MAP[status] || "draft";
  return (
    <span className={`dp-badge dp-badge--${v}`}>
      {LABEL_MAP[status] || status}
    </span>
  );
}
