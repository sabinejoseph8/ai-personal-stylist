import { createServerClient } from "@supabase/ssr";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/public-config";
import { GUEST_COOKIE } from "@/lib/supabase/cookies";
import { contentSecurityPolicy, isPhase0TestPage, permissionsPolicy } from "@/lib/security-headers";

// Runs before every page: keeps the guest's sign-in fresh, marks the guest's visit, and adds the browser protections.
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const local = ["localhost", "127.0.0.1"].includes(request.nextUrl.hostname);
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development", local);
  const path = request.nextUrl.pathname;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  if (!isPhase0TestPage(path)) requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // Refresh the guest's sign-in cookie when it's close to expiring.
  const db = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: GUEST_COOKIE,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of list) response.cookies.set(name, value, { ...options, ...GUEST_COOKIE });
      },
    },
  });
  const { data } = await db.auth.getClaims();

  // A visit keeps the guest from being deleted after 7 days without use (R3). The database writes
  // at most once an hour, and the page doesn't wait for it.
  if (data?.claims?.sub && request.method === "GET" && request.headers.get("accept")?.includes("text/html")) {
    event.waitUntil(Promise.resolve(db.rpc("touch_last_active")).then(() => undefined, () => undefined));
  }

  if (!isPhase0TestPage(path)) response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Permissions-Policy", permissionsPolicy(path));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  matcher: [
    {
      // Images skip it: the sign-in check and the security policy aren't needed for a photo.
      source: "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|webp|svg|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
