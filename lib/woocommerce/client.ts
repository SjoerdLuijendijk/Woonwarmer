// Server-only: reads the WooCommerce REST API keys. Import only from server code.

const API_PATH = "/wp-json/wc/v3";
// Creating a product makes WordPress download its photos, which can take a while.
const TIMEOUT_MS = 60_000;

/** A failed WooCommerce request; `message` is safe to show and store (no response bodies). */
export class WooCommerceError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

type Config = { baseUrl: string; authorization: string };

// Null when the shop connection is not configured for this environment.
export function getWooCommerceConfig(): Config | null {
  const url = process.env.WOOCOMMERCE_URL?.trim();
  const key = process.env.WOOCOMMERCE_CONSUMER_KEY?.trim();
  const secret = process.env.WOOCOMMERCE_CONSUMER_SECRET?.trim();
  if (!url || !key || !secret) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Basic authentication is only safe over HTTPS.
  if (parsed.protocol !== "https:") return null;

  const root = `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  return {
    baseUrl: `${root}${API_PATH}`,
    authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
  };
}

function describeStatus(status: number, code: string | undefined) {
  if (status === 401 || status === 403) return "De webshop weigert de API-sleutel. Controleer de sleutel en of die lees- en schrijfrechten heeft.";
  if (status === 404) return "De webshop-API is niet gevonden. Controleer het webshopadres.";
  if (status === 429) return "De webshop krijgt te veel verzoeken. Probeer het later opnieuw.";
  if (status >= 500) return "De webshop had een storing. Probeer het later opnieuw.";
  return `De webshop weigerde de wijziging${code ? ` (${code})` : ""}.`;
}

export function wooRequest<T>(config: Config, method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T> {
  return request<T>(`${config.baseUrl}${path}`, method, { Authorization: config.authorization }, body);
}

async function request<T>(url: string, method: "GET" | "POST" | "PUT" | "DELETE", auth: Record<string, string>, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: { ...auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    throw new WooCommerceError(timedOut ? "De webshop reageerde niet op tijd." : "De webshop is niet bereikbaar.");
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof data === "object" && data !== null && "code" in data && typeof data.code === "string" ? data.code : undefined;
    throw new WooCommerceError(describeStatus(response.status, code), response.status, code);
  }
  return data as T;
}
