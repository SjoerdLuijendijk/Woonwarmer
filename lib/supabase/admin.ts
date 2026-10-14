import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only. A client with the Supabase secret key, which bypasses RLS. Only for requests without
// a signed-in user that have verified their caller themselves (the WooCommerce webhook); everything
// else uses the request-scoped client in ./server.ts. Null when the key is not configured.
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
