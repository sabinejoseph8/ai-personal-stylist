import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/public-config";
import { GUEST_COOKIE } from "@/lib/supabase/cookies";
import { contentSecurityPolicy, isPhase0TestPage, permissionsPolicy } from "@/lib/security-headers";

// Runs before every page: keeps the guest's sign-in fresh and adds the browser protections.
export async function proxy(request: NextRequest) {
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
  await db.auth.getClaims();

  if (!isPhase0TestPage(path)) response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Permissions-Policy", permissionsPolicy(path));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  matcher: [
    {
      // Static files skip it: the sign-in check isn't needed for a catalog photo.
      source: "/((?!_next/static|_next/image|favicon.ico|catalog/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
