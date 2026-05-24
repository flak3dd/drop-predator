import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const productGid = `gid://shopify/Product/${payload.id}`;
  const newTitle = payload.title || "";
  const newImage =
    payload.images?.[0]?.src || payload.image?.src || "";

  const updated = await prisma.dropProduct.updateMany({
    where: { productId: productGid },
    data: {
      productTitle: newTitle,
      productImage: newImage,
    },
  });

  if (updated.count > 0) {
    console.log(
      `Updated ${updated.count} drop product(s) for ${productGid}`,
    );
  }

  return new Response();
};
