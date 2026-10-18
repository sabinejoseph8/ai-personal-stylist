import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Phase 0 automated test: the voice session endpoint never sends the OpenAI key to the browser.
const KEY = "sk-proj-test-secret-0123456789abcdef";
const create = vi.fn();

vi.mock("openai", () => {
  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  class OpenAI {
    static APIError = APIError;
    live = { create };
  }
  return { default: OpenAI };
});

const { POST } = await import("@/app/api/test/voice/route");
const OpenAI = (await import("openai")).default as unknown as { APIError: new (s: number, m: string) => Error };

function request(body: unknown) {
  return new Request("http://localhost/api/test/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/test/voice", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = KEY;
    process.env.TEST_PAGE_PASSCODE = "right-passcode";
    create.mockReset();
  });
  afterEach(() => vi.clearAllMocks());

  it("returns only the session ID and SDP answer", async () => {
    create.mockResolvedValue({ session: { id: "live_123", secret: KEY }, transport: { type: "webrtc", sdp: "v=0 answer" } });
    const res = await POST(request({ passcode: "right-passcode", sdp: "v=0 offer", voice: "marin" }));
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).not.toContain(KEY);
    expect(JSON.parse(text)).toEqual({ sessionId: "live_123", sdp: "v=0 answer" });
  });

  it("hides the key even when OpenAI repeats it in an error", async () => {
    create.mockRejectedValue(new OpenAI.APIError(401, `Incorrect API key provided: ${KEY}`));
    const res = await POST(request({ passcode: "right-passcode", sdp: "v=0 offer" }));
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(KEY);
  });

  it("refuses a wrong passcode without calling OpenAI", async () => {
    const res = await POST(request({ passcode: "wrong", sdp: "v=0 offer" }));
    expect(res.status).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });
});
