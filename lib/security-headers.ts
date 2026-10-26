import { SUPABASE_URL } from "@/lib/public-config";

// Browser protections (tech spec section 6).
const supabase = new URL(SUPABASE_URL).host;

/**
 * The content security policy: the browser may only talk to our site and the services we use.
 * `local` is true on this computer's test server, which has no https, so requests aren't upgraded there.
 */
// No OpenAI entry, even with voice only (6c): the browser's WebRTC offer goes to our own server, which
// talks to OpenAI, and the call's audio isn't a connect-src request (full code review, E8).
export function contentSecurityPolicy(nonce: string, dev: boolean, local = dev): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: https://${supabase} https://cdn.replica.tavus.io`,
    "media-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' https://${supabase} wss://${supabase} https://*.daily.co wss://*.daily.co https://challenges.cloudflare.com`,
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(local ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Camera and microphone are only allowed on the session screen. */
export function permissionsPolicy(pathname: string): string {
  const mediaAllowed = pathname === "/session" || pathname.startsWith("/session/");
  const allow = mediaAllowed ? "(self)" : "()";
  return `camera=${allow}, microphone=${allow}, geolocation=(), payment=()`;
}

