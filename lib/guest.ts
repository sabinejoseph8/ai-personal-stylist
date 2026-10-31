import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { guestDb } from "@/lib/supabase/server";

/**
 * The signed-in guest for this request, or null. Server only. Remembered for the request (React's cache),
 * since a page and its app bar both ask (Phase 7 review).
 */
export const currentGuest = cache(async function currentGuest() {
  // Guest data is per request: never prerendered (Supabase reads the clock to check the sign-in).
  await connection();
  const db = await guestDb();
  const { data } = await db.auth.getClaims();
  const id = data?.claims?.sub;
  return id ? { db, id } : null;
});
