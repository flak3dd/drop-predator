import PropTypes from "prop-types";

export function InfoRow({ label, value }) {
  return (
    <s-stack direction="inline" gap="base">
      <s-text type="strong">{label}:</s-text>
      <s-text>{value}</s-text>
    </s-stack>
  );
}

InfoRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
};
