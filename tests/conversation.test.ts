import { describe, expect, it } from "vitest";
import { createFakeEngine, createFakeProvider } from "@/connectors/conversation/fake";
import { fakeEngineAllowed } from "@/connectors/conversation/server";
import { createTavusProvider } from "@/connectors/conversation/tavus/server";
import { callProviderContract, conversationEngineContract } from "./support/conversation-contract";

// 2a: the conversation connector. The fake engine and the Tavus engine's server side pass the shared
// contract; Tavus itself is replaced by a stand-in, so these tests cost nothing.
const KEY = "tvs-test-secret-key-0123456789";

/** A stand-in for Tavus's API that records each request. */
function tavusStandIn(reply: (method: string, url: string) => { status: number; body: unknown }) {
  const requests: { method: string; url: string; body: unknown; headers: Record<string, string> }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    requests.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined, headers: init.headers as Record<string, string> });
    const r = reply(method, url);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, requests };
}

const tavusOk = () =>
  tavusStandIn((method) =>
    method === "POST" ? { status: 200, body: { conversation_id: "c123", conversation_url: "https://tavus.daily.co/c123" } } : { status: 200, body: {} },
  );

callProviderContract("fake", createFakeProvider);
callProviderContract("tavus (stand-in)", () => createTavusProvider({ apiKey: KEY, palId: "p1", fetch: tavusOk().fetch }));
conversationEngineContract("fake", () => createFakeEngine());

describe("Tavus provider", () => {
  it("creates the call with recording off, the time granted as its longest length, and the stylist's setup", async () => {
    const tavus = tavusOk();
    await createTavusProvider({ apiKey: KEY, palId: "p1", fetch: tavus.fetch }).start({ sessionId: "s1", maxSeconds: 423.7 });
    expect(tavus.requests[0]).toMatchObject({
      method: "POST",
      url: "https://tavusapi.com/v2/conversations",
      body: { pal_id: "p1", properties: { max_call_duration: 423, enable_recording: false, participant_left_timeout: 30 } },
    });
    expect(tavus.requests[0].headers["x-api-key"]).toBe(KEY);
  });

  it("says busy when Tavus refuses a second call at the same time", async () => {
    const tavus = tavusStandIn(() => ({ status: 400, body: { message: "User has reached maximum concurrent conversations" } }));
    const call = await createTavusProvider({ apiKey: KEY, fetch: tavus.fetch }).start({ sessionId: "s1", maxSeconds: 60 });
    expect(call).toEqual({ ok: false, reason: "busy" });
  });

  it("says unavailable for any other failure, without passing on Tavus's answer", async () => {
    const tavus = tavusStandIn(() => ({ status: 500, body: { message: `boom ${KEY}` } }));
    const call = await createTavusProvider({ apiKey: KEY, fetch: tavus.fetch }).start({ sessionId: "s1", maxSeconds: 60 });
    expect(call).toEqual({ ok: false, reason: "unavailable" });
  });

  it("ends a call, then hard-deletes it (decided 18 Oct 2026)", async () => {
    const tavus = tavusOk();
    await createTavusProvider({ apiKey: KEY, fetch: tavus.fetch }).end("c123");
    expect(tavus.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      "POST https://tavusapi.com/v2/conversations/c123/end",
      "DELETE https://tavusapi.com/v2/conversations/c123?hard=true",
    ]);
  });
});

describe("choosing the call provider", () => {
  it("uses the fake engine only when tests ask for it, and never on the live site", () => {
    expect(fakeEngineAllowed({})).toBe(false);
    expect(fakeEngineAllowed({ CONVERSATION_ENGINE: "fake" })).toBe(true);
    expect(fakeEngineAllowed({ CONVERSATION_ENGINE: "fake", VERCEL_ENV: "preview" })).toBe(true);
    expect(fakeEngineAllowed({ CONVERSATION_ENGINE: "fake", VERCEL_ENV: "production" })).toBe(false);
  });
});

describe("fake engine", () => {
  it("plays the stylist's greeting after joining, and records commands for tests", async () => {
    const engine = createFakeEngine();
    const heard: string[] = [];
    engine.on((e) => e.type === "words" && heard.push(e.text));
    await engine.join({ callId: "c1", joinUrl: "fake://call/s1" });
    await new Promise((r) => setTimeout(r, 250));
    expect(heard).toEqual(["Hi, I'm your stylist. What are you dressing for?"]);
    engine.interrupt();
    engine.say("Hello");
    expect(engine.commands).toEqual([{ name: "interrupt" }, { name: "say", value: "Hello" }]);
    await engine.leave();
  });
});
