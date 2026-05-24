import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const productGid = `gid://shopify/Product/${payload.id}`;

  const deleted = await prisma.dropProduct.deleteMany({
    where: { productId: productGid },
  });

  if (deleted.count > 0) {
    console.log(
      `Removed ${deleted.count} drop product(s) for deleted product ${productGid}`,
    );
  }

  return new Response();
};
