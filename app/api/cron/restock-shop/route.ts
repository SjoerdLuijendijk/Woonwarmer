import { timingSafeEqual } from "node:crypto";
import { WooCommerceError } from "../../../../lib/woocommerce/client";
import { restockMadeToOrderProducts } from "../../../../lib/woocommerce/stock";

// Vercel Cron calls this every night (vercel.json) with "Authorization: Bearer <CRON_SECRET>".
// It puts sold made-to-order stoves back in stock in the web shop; see lib/woocommerce/stock.ts.

export const maxDuration = 300;
// Stop before maxDuration; whatever is left is picked up the next night.
const TIME_BUDGET_MS = 240_000;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  // Without a secret nobody may call it.
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return new Response("Unauthorized", { status: 401 });

  try {
    const result = await restockMadeToOrderProducts(Date.now() + TIME_BUDGET_MS);
    if (result.failed.length > 0) console.error("Restocking made-to-order products partly failed", { failed: result.failed });
    return Response.json({ updated: result.updated, failed: result.failed.length, finished: result.finished });
  } catch (error) {
    console.error("Restocking made-to-order products failed", {
      status: error instanceof WooCommerceError ? error.status : undefined,
      code: error instanceof WooCommerceError ? error.code : undefined,
    });
    return Response.json({ error: "Restock failed" }, { status: 502 });
  }
}
