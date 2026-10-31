"use client";

import { type AnchorHTMLAttributes, useEffect } from "react";

// Camera and microphone are allowed only on the session page (lib/security-headers.ts). Chrome keeps the
// permissions policy of the page a visit was loaded on, so moving to /session inside the app (router.push
// or <Link>) left the microphone off there: "Microphone needed" on a laptop after setup (found while
// recording the demo video, 30 Oct 2026). iPhone Safari doesn't apply the policy, so phone checks passed.
// Every way into the session is a full page load, so the session page's own policy applies.

/** Opens the session page with a full page load (from code: setup, the wardrobe). */
export function goToSession(href = "/session") {
  window.location.assign(href);
}

/** A link into the session page that loads it in full, so its camera and microphone policy applies. */
export function SessionLink({ href = "/session", ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href?: string }) {
  // A plain <a>, not next/link: a full load is the point (see above).
  return <a href={href} {...props} />;
}

const RELOADED = "session-policy-reload";

/**
 * The safety net on the session page: if the browser still says the microphone isn't allowed here (a way
 * in that isn't a full load, such as Back), reload once. Never twice in a row, so a real block can't loop.
 */
export function useSessionMediaPolicy() {
  useEffect(() => {
    const policy = (document as Document & { featurePolicy?: { allowsFeature(name: string): boolean } }).featurePolicy;
    if (!policy?.allowsFeature) return; // Safari and Firefox: no policy to read, and nothing to fix.
    if (policy.allowsFeature("microphone")) {
      safely(() => sessionStorage.removeItem(RELOADED));
      return;
    }
    const last = Number(safely(() => sessionStorage.getItem(RELOADED)) ?? 0);
    if (Date.now() - last < 10_000) return;
    // Only reload when the marker can be kept: without it, a real block would reload for ever.
    if (safely(() => (sessionStorage.setItem(RELOADED, String(Date.now())), true)) !== true) return;
    window.location.reload();
  }, []);
}

function safely<T>(f: () => T): T | null {
  try {
    return f();
  } catch {
    return null; // storage blocked
  }
}
