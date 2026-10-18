import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/test/session/route";

// Phase 0 automated test: the session start endpoint never sends a secret key to the browser.
const KEY = "tvs-test-secret-key-0123456789";

function request(body: unknown) {
  return new Request("http://localhost/api/test/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/test/session", () => {
  beforeEach(() => {
    process.env.TAVUS_API_KEY = KEY;
    process.env.TEST_PAGE_PASSCODE = "right-passcode";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("returns the call link without the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          conversation_id: "c123abc",
          conversation_url: "https://tavus.daily.co/c123abc",
          status: "active",
          echo_of_key: KEY,
        }),
      ),
    );
    const res = await POST(request({ passcode: "right-passcode" }));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(KEY);
    expect(JSON.parse(text)).toEqual({ conversationId: "c123abc", conversationUrl: "https://tavus.daily.co/c123abc" });
  });

  it("hides the key even when Tavus repeats it in an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(`bad key ${KEY}`, { status: 401 })));
    const res = await POST(request({ passcode: "right-passcode" }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(KEY);
  });

  it("refuses a wrong passcode without calling Tavus", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(request({ passcode: "wrong" }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
