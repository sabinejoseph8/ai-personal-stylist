import { createServerClient } from "@supabase/ssr";
import type { BrowserContext } from "@playwright/test";
import { GUEST_COOKIE } from "../../lib/supabase/cookies";
import { createTestGuest, PUBLISHABLE_KEY, SUPABASE_URL, type TestGuest } from "../../tests/support/test-guests";

// Browser tests can't pass the real bot check, so they sign in a test guest directly
// (server key, Sabine's decision in 1b) and give the browser that guest's sign-in cookie.
export async function signInTestGuest(context: BrowserContext): Promise<TestGuest> {
  const guest = await createTestGuest();
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
  await context.addCookies(
    written.map(({ name, value }) => ({ name, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const })),
  );
  return guest;
}
