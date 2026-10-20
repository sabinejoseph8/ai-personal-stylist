import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/public-config";
import { GUEST_COOKIE } from "@/lib/supabase/cookies";

/** Supabase as the signed-in guest, for server components and route handlers. Access rules apply. */
export async function guestDb() {
  const jar = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: GUEST_COOKIE,
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, { ...options, ...GUEST_COOKIE });
        } catch {
          // Server components can't set cookies; proxy.ts refreshes them instead.
        }
      },
    },
  });
}
