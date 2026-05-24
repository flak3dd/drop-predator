import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    await prisma.$transaction([
      prisma.dropProduct.deleteMany({
        where: { drop: { shop } },
      }),
      prisma.drop.deleteMany({ where: { shop } }),
      prisma.setting.deleteMany({ where: { shop } }),
      prisma.session.deleteMany({ where: { shop } }),
    ]);
  }

  return new Response();
};
