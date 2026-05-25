
const smallInputStyle = {
  width: 65,
  padding: "4px 8px",
  border: "1px solid var(--p-color-border, #8c9196)",
  borderRadius: 4,
  fontSize: 13,
};

export function ProductCard({ product, liveData, fetcher, readonly }) {
  const priceDisplay = liveData
    ? liveData.minPrice === liveData.maxPrice
      ? `${liveData.minPrice} ${liveData.currency}`
      : `${liveData.minPrice}–${liveData.maxPrice} ${liveData.currency}`
    : null;

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="inline" gap="base">
        {(liveData?.image || product.productImage) && (
          <img
            src={liveData?.image || product.productImage}
            alt=""
            style={{
              width: 48,
              height: 48,
              objectFit: "cover",
              borderRadius: 4,
              flexShrink: 0,
            }}
          />
        )}
        <s-stack direction="block" gap="tight" style={{ flex: 1 }}>
          <s-text type="strong">{product.productTitle}</s-text>
          <s-text>
            Qty: {product.allocatedQuantity}
            {product.dropPrice && ` · Drop: $${product.dropPrice}`}
            {liveData && ` · Inventory: ${liveData.totalInventory}`}
            {priceDisplay && ` · Shopify: ${priceDisplay}`}
          </s-text>
          {liveData && (
            <s-text style={{ fontSize: 12, color: "#6d7175" }}>
              Shopify status: {liveData.status}
              {product.originalPrice && " · Original prices captured"}
            </s-text>
          )}
        </s-stack>
        {!readonly && (
          <s-stack direction="inline" gap="tight">
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
                  {
                    intent: "removeProduct",
                    productDbId: product.id,
                  },
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

