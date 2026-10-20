import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/public-config";

/**
 * Supabase with the server key, which bypasses the access rules. Only for the budget guard's
 * usage records, the daily job and account deletion (tech spec 6). Never reaches the browser.
 */
export function serverKeyDb() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
