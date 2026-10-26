import { createServerClient } from "@supabase/ssr";
import type { BrowserContext } from "@playwright/test";
import { GUEST_COOKIE } from "../../lib/supabase/cookies";
import { createTestGuest, PUBLISHABLE_KEY, serverDb, SUPABASE_URL, type TestGuest } from "../../tests/support/test-guests";

// Browser tests can't pass the real bot check, so they sign in a test guest directly
// (server key, Sabine's decision in 1b) and give the browser that guest's sign-in cookie.
// Supabase allows only about 30 sign-ins per 5 minutes from one computer, so test files share
// one guest per worker where they can, and reset it between tests.

export type BrowserGuest = { guest: TestGuest; cookies: { name: string; value: string; domain: string; path: string; httpOnly: boolean; sameSite: "Lax" }[] };

/** A new test guest, with the sign-in cookies a browser needs. `fresh` for one a test deletes (6b). */
export async function createBrowserGuest(options: { fresh?: boolean } = {}): Promise<BrowserGuest> {
  const guest = await createTestGuest(options);
  const { data } = await guest.db.auth.getSession();
  const session = data.session!;
  let written: { name: string; value: string }[] = [];
  const cookieClient = createServerClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    cookieOptions: GUEST_COOKIE,
    cookies: {
      getAll: () => [],
      setAll: (list) => {
        written = list.map(({ name, value }) => ({ name, value }));
      },
    },
  });
  await cookieClient.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  const cookies = written.map(({ name, value }) => ({ name, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const }));
  return { guest, cookies };
}

/** Signs this browser in as a new test guest. */
export async function signInTestGuest(context: BrowserContext): Promise<TestGuest> {
  const { guest, cookies } = await createBrowserGuest();
  await context.addCookies(cookies);
  return guest;
}

/** Puts a shared test guest back to a fresh profile with no saved preferences. */
export async function resetGuest(guestId: string) {
  const db = serverDb();
  await db.from("saved_preferences").delete().eq("user_id", guestId).throwOnError();
  await db
    .from("profiles")
    .update({ departments: [], style_words: [], sizes: {}, budget_amount_cents: null, budget_meaning: null, budget_max_cents: null })
    .eq("user_id", guestId)
    .throwOnError();
}
