import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { engineConfig } = body;

  if (engineConfig === undefined) {
    return Response.json({ error: "engineConfig is required" }, { status: 400 });
  }

  const configStr =
    typeof engineConfig === "string" ? engineConfig : JSON.stringify(engineConfig);

  await prisma.setting.upsert({
    where: { shop: session.shop },
    update: { engineConfig: configStr },
    create: { shop: session.shop, engineConfig: configStr },
  });

  return Response.json({ ok: true });
}
