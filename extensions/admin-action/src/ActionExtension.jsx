import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { i18n, close, data } = shopify;
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async function getProductInfo() {
      const res = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify({
          query: `query Product($id: ID!) {
            product(id: $id) {
              title
              status
              totalInventory
              variants(first: 10) {
                edges {
                  node {
                    id
                    price
                    inventoryQuantity
                  }
                }
              }
              priceRangeV2 {
                minVariantPrice { amount currencyCode }
                maxVariantPrice { amount currencyCode }
              }
            }
          }`,
          variables: { id: data.selected[0].id },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setProduct(json.data.product);
      }
      setLoading(false);
    })();
  }, [data.selected]);

  const priceRange = product?.priceRangeV2;
  const minPrice = priceRange?.minVariantPrice;
  const maxPrice = priceRange?.maxVariantPrice;
  const priceDisplay =
    minPrice && maxPrice
      ? minPrice.amount === maxPrice.amount
        ? `${minPrice.amount} ${minPrice.currencyCode}`
        : `${minPrice.amount} – ${maxPrice.amount} ${minPrice.currencyCode}`
      : null;

  const variantCount = product?.variants?.edges?.length || 0;

  return (
    <s-admin-action>
      <s-stack direction="block" gap="base">
        <s-text type="strong">Drop Predator</s-text>

        {loading ? (
          <s-text>Loading product info...</s-text>
        ) : product ? (
          <s-stack direction="block" gap="tight">
            <s-text>Product: {product.title}</s-text>
            <s-text>Status: {product.status}</s-text>
            <s-text>Inventory: {product.totalInventory} units</s-text>
            {priceDisplay && <s-text>Price: {priceDisplay}</s-text>}
            <s-text>Variants: {variantCount}</s-text>

            {variantCount > 0 && (
              <s-stack direction="block" gap="tight">
                <s-text type="strong" style={{ marginTop: 8 }}>
                  Variant Breakdown
                </s-text>
                {product.variants.edges.map(({ node }) => (
                  <s-text key={node.id}>
                    ${node.price} — {node.inventoryQuantity} in stock
                  </s-text>
                ))}
              </s-stack>
            )}

            <s-text style={{ marginTop: 8 }}>
              To add this product to a drop, open the Drop Predator app
              and use the product picker on any drop detail page.
            </s-text>
          </s-stack>
        ) : (
          <s-text>Could not load product information.</s-text>
        )}
      </s-stack>
      <s-button slot="primary-action" onClick={() => close()}>
        Done
      </s-button>
    </s-admin-action>
  );
}
