import { SUPABASE_URL } from "@/lib/public-config";

// Browser protections (tech spec section 6).
const supabase = new URL(SUPABASE_URL).host;

/** The content security policy: the browser may only talk to our site and the services we use. */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: https://${supabase} https://cdn.replica.tavus.io`,
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' https://${supabase} wss://${supabase} https://*.daily.co wss://*.daily.co https://api.openai.com https://challenges.cloudflare.com`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Camera and microphone are only allowed on the session screen (and the Phase 0 test pages until Phase 2). */
export function permissionsPolicy(pathname: string): string {
  const mediaAllowed = pathname === "/session" || pathname.startsWith("/session/") || pathname.startsWith("/test/");
  const allow = mediaAllowed ? "(self)" : "()";
  return `camera=${allow}, microphone=${allow}, geolocation=(), payment=()`;
}

/** The Phase 0 test pages load Tavus's video library, so they keep a looser policy until Phase 2 deletes them. */
export const isPhase0TestPage = (pathname: string) => pathname.startsWith("/test/");
