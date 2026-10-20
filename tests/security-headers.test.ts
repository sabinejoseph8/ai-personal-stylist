import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, isPhase0TestPage, permissionsPolicy } from "@/lib/security-headers";

describe("browser protections", () => {
  it("only allows our site and the services we use", () => {
    const csp = contentSecurityPolicy("abc", false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic' https://challenges.cloudflare.com;");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(contentSecurityPolicy("abc", true)).toContain("unsafe-eval");
    expect(contentSecurityPolicy("abc", false)).toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy("abc", false, true)).not.toContain("upgrade-insecure-requests");
  });

  it.each(["/", "/setup", "/wardrobe", "/about"])("blocks camera and microphone on %s", (path) => {
    expect(permissionsPolicy(path)).toContain("camera=()");
    expect(permissionsPolicy(path)).toContain("microphone=()");
  });

  it.each(["/session", "/session/abc", "/test/demo"])("allows camera and microphone on %s", (path) => {
    expect(permissionsPolicy(path)).toContain("camera=(self)");
    expect(permissionsPolicy(path)).toContain("microphone=(self)");
  });

  it("only the Phase 0 test pages skip the strict policy", () => {
    expect(isPhase0TestPage("/test/demo")).toBe(true);
    expect(isPhase0TestPage("/")).toBe(false);
    expect(isPhase0TestPage("/testimonials")).toBe(false);
  });
});
