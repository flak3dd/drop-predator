/**
 * app/routes/api.ai.email.jsx
 * ---------------------------------------------------------
 * Drafts an empathetic, on-brand customer service email reply
 * using context from the customer's original message.
 *
 * POST /api/ai/email
 * Body: { customerName, subject, body, orderInfo? }
 */

import { authenticate } from "../shopify.server";
import { getGatewayModel, MODELS } from "../services/ai/gateway.js";

export async function action({ request }) {
  await authenticate.admin(request);

  const {
    customerName,
    subject,
    body,
    orderInfo = null,
  } = await request.json();

  if (!body) {
    return Response.json({ error: "Email body is required" }, { status: 400 });
  }

  const { streamText } = await import('ai');
  const model = await getGatewayModel(MODELS.smart);

  const orderContext = orderInfo
    ? `\nOrder context: ${JSON.stringify(orderInfo)}`
    : '';

  const prompt = `
You are a friendly, empathetic customer service representative for an online Shopify store.
Draft a professional reply to this customer email.

Customer name: ${customerName || 'Customer'}
Subject: ${subject}
Their message:
---
${body}
---
${orderContext}

Guidelines:
- Open by acknowledging their concern warmly (don't start with "I")
- Be specific and actionable — no vague promises
- If it's a complaint: apologise sincerely, explain what you're doing, give a timeline
- If it's a question: answer it directly and completely
- Close warmly with your name as "Drop Predator Store Team"
- Keep it concise: 3-5 short paragraphs maximum
- Plain text, no markdown
`.trim();

  const result = streamText({
    model,
    prompt,
    maxTokens: 500,
    temperature: 0.6,
  });

  return result.toTextStreamResponse();
}
