import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, permissionsPolicy } from "@/lib/security-headers";

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

  it.each(["/", "/setup", "/wardrobe", "/about", "/test/demo"])("blocks camera and microphone on %s", (path) => {
    expect(permissionsPolicy(path)).toContain("camera=()");
    expect(permissionsPolicy(path)).toContain("microphone=()");
  });

  it.each(["/session", "/session/abc"])("allows camera and microphone on %s", (path) => {
    expect(permissionsPolicy(path)).toContain("camera=(self)");
    expect(permissionsPolicy(path)).toContain("microphone=(self)");
  });

});
