
export function InfoRow({ label, value }) {
  return (
    <s-stack direction="inline" gap="base">
      <s-text type="strong">{label}:</s-text>
      <s-text>{value}</s-text>
    </s-stack>
  );
}

