const smallInputStyle = {
  width: 65,
  padding: "4px 8px",
  border: "1px solid var(--p-color-border, #8c9196)",
  borderRadius: 4,
  fontSize: 13,
};

/** Returns a colour token and label based on stock vs allocated quantity. */
function stockLevel(totalInventory, allocatedQuantity) {
  if (totalInventory === null || totalInventory === undefined) {
    return { color: "#888780", label: "—" };
  }
  const ratio = allocatedQuantity > 0 ? totalInventory / allocatedQuantity : 1;
  if (totalInventory === 0) return { color: "#d72c0d", label: "Out of stock" };
  if (ratio <= 0.25) return { color: "#d72c0d", label: "Critical" };
  if (ratio <= 0.5) return { color: "#ffc453", label: "Low" };
  return { color: "#008060", label: "In stock" };
}

export function ProductCard({ product, liveData, fetcher, readonly }) {
  const priceDisplay = liveData
    ? liveData.minPrice === liveData.maxPrice
      ? `${liveData.minPrice} ${liveData.currency}`
      : `${liveData.minPrice}–${liveData.maxPrice} ${liveData.currency}`
    : null;

  const inv = liveData?.totalInventory ?? null;
  const { color: stockColor, label: stockLabel } = stockLevel(inv, product.allocatedQuantity);

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="inline" gap="base">
        {(liveData?.image || product.productImage) && (
          <img
            src={liveData?.image || product.productImage}
            alt=""
            style={{
              width: 52,
              height: 52,
              objectFit: "cover",
              borderRadius: 4,
              flexShrink: 0,
            }}
          />
        )}

        <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
          <s-text type="strong">{product.productTitle}</s-text>

          {/* Inventory row */}
          <s-stack direction="inline" gap="base" style={{ flexWrap: "wrap" }}>
            {/* Live inventory badge */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 600,
                color: stockColor,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: stockColor,
                  flexShrink: 0,
                }}
              />
              {inv !== null ? `${inv} in stock` : "Inventory unavailable"}
              {inv !== null && ` · ${stockLabel}`}
            </span>

            {/* Allocated */}
            <span style={{ fontSize: 12, color: "#888780" }}>
              {product.allocatedQuantity} allocated
            </span>

            {/* Sold estimate (only when active: allocated > inventory) */}
            {inv !== null && product.allocatedQuantity > 0 && inv < product.allocatedQuantity && (
              <span style={{ fontSize: 12, color: "#888780" }}>
                ~{product.allocatedQuantity - inv} sold
              </span>
            )}
          </s-stack>

          {/* Price row */}
          <s-stack direction="inline" gap="base" style={{ flexWrap: "wrap" }}>
            {product.dropPrice && (
              <span style={{ fontSize: 12 }}>
                Drop price: <strong>${product.dropPrice}</strong>
              </span>
            )}
            {priceDisplay && (
              <span style={{ fontSize: 12, color: "#888780" }}>
                Shopify: {priceDisplay}
              </span>
            )}
            {liveData && (
              <span style={{ fontSize: 12, color: "#888780" }}>
                {liveData.status}
                {product.originalPrice && " · prices captured"}
              </span>
            )}
          </s-stack>
        </s-stack>

        {!readonly && (
          <s-stack direction="inline" gap="tight" style={{ flexShrink: 0 }}>
            <div>
              <label htmlFor={`qty-${product.id}`} style={{ fontSize: 11, display: "block" }}>
                Qty
              </label>
              <input
                id={`qty-${product.id}`}
                type="number"
                min="0"
                defaultValue={product.allocatedQuantity}
                style={smallInputStyle}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (val !== product.allocatedQuantity) {
                    fetcher.submit(
                      {
                        intent: "updateQuantity",
                        productDbId: product.id,
                        quantity: e.target.value,
                      },
                      { method: "POST" },
                    );
                  }
                }}
              />
            </div>
            <div>
              <label htmlFor={`price-${product.id}`} style={{ fontSize: 11, display: "block" }}>
                Drop $
              </label>
              <input
                id={`price-${product.id}`}
                type="text"
                placeholder="—"
                defaultValue={product.dropPrice}
                style={{ ...smallInputStyle, width: 80 }}
                onBlur={(e) => {
                  if (e.target.value !== product.dropPrice) {
                    fetcher.submit(
                      {
                        intent: "updatePrice",
                        productDbId: product.id,
                        price: e.target.value,
                      },
                      { method: "POST" },
                    );
                  }
                }}
              />
            </div>
            <s-button
              variant="tertiary"
              tone="critical"
              onClick={() =>
                fetcher.submit(
                  { intent: "removeProduct", productDbId: product.id },
                  { method: "POST" },
                )
              }
            >
              Remove
            </s-button>
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}
