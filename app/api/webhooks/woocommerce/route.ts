import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { WooCommerceError } from "../../../../lib/woocommerce/client";
import { copyShopStockToApp, orderProductIds } from "../../../../lib/woocommerce/order-stock";

// WooCommerce webhook for the topics "Order created" and "Order updated" (docs/woocommerce-sync.md).
// WooCommerce signs the raw body with the webhook secret: base64 HMAC-SHA256 in X-WC-Webhook-Signature.

export const maxDuration = 60;

const ORDER_TOPICS = new Set(["order.created", "order.updated"]);

function hasValidSignature(body: string, signature: string | null) {
  const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET?.trim();
  // Without a secret nobody may call it.
  if (!secret || !signature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(body).digest("base64"));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  const body = await request.text();

  // Saving a webhook in WordPress first sends "webhook_id=<id>" and needs a 2xx answer.
  if (/^webhook_id=\d+$/.test(body)) return new Response(null, { status: 204 });

  if (!hasValidSignature(body, request.headers.get("x-wc-webhook-signature"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!ORDER_TOPICS.has(request.headers.get("x-wc-webhook-topic") ?? "")) return new Response(null, { status: 204 });

  let order: unknown;
  try {
    order = JSON.parse(body);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    console.error("WooCommerce order webhook skipped: SUPABASE_SECRET_KEY is not set");
    return new Response(null, { status: 204 });
  }

  // Errors are logged and answered with 2xx: WooCommerce does not retry a delivery, and it disables
  // a webhook after several failed deliveries in a row.
  try {
    const changed = await copyShopStockToApp(supabase, orderProductIds(order));
    if (changed.length > 0) console.info("Stock copied from a shop order", { stoves: changed });
  } catch (error) {
    console.error("Copying stock from a shop order failed", {
      status: error instanceof WooCommerceError ? error.status : undefined,
      code: error instanceof WooCommerceError ? error.code : (error as { code?: unknown })?.code,
    });
  }
  return new Response(null, { status: 204 });
}
