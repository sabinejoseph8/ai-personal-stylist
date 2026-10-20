import { describe, expect, it } from "vitest";
import type { CallProvider, ConversationEngine, ConversationEvent } from "@/connectors/conversation/types";

// The tests every conversation engine must pass (tech spec 8): the server side that starts and ends
// calls, and the browser side that joins them. GPT-Live (6c) runs these too.

export function callProviderContract(name: string, make: () => CallProvider) {
  describe(`call provider contract: ${name}`, () => {
    it("starts a call with an id and a join link, and nothing secret", async () => {
      const call = await make().start({ sessionId: "00000000-0000-4000-8000-000000000001", maxSeconds: 600 });
      expect(call.ok).toBe(true);
      if (!call.ok) return;
      expect(call.callId).toBeTruthy();
      expect(call.joinUrl).toMatch(/^[a-z]+:\/\//);
      expect(JSON.stringify(call)).not.toMatch(/key/i);
    });

    it("ends a call without failing, even twice", async () => {
      const provider = make();
      const call = await provider.start({ sessionId: "00000000-0000-4000-8000-000000000002", maxSeconds: 60 });
      if (!call.ok) throw new Error("expected a call");
      await expect(provider.end(call.callId)).resolves.toBeUndefined();
      await expect(provider.end(call.callId)).resolves.toBeUndefined();
    });
  });
}

export function conversationEngineContract(name: string, make: () => ConversationEngine, call = { callId: "c1", joinUrl: "fake://call/s1" }) {
  describe(`conversation engine contract: ${name}`, () => {
    const collect = (engine: ConversationEngine) => {
      const events: ConversationEvent[] = [];
      const stop = engine.on((e) => events.push(e));
      return { events, stop };
    };

    it("says it's connecting, then connected, when it joins", async () => {
      const engine = make();
      const { events } = collect(engine);
      await engine.join(call);
      const states = events.filter((e) => e.type === "connection").map((e) => (e as { state: string }).state);
      expect(states.slice(0, 2)).toEqual(["connecting", "connected"]);
      await engine.leave();
    });

    it("says it ended exactly once, however many times it's left", async () => {
      const engine = make();
      const { events } = collect(engine);
      await engine.join(call);
      await engine.leave();
      await engine.leave();
      expect(events.filter((e) => e.type === "connection" && e.state === "ended")).toHaveLength(1);
    });

    it("stops telling a listener once it stops listening", async () => {
      const engine = make();
      const { events, stop } = collect(engine);
      stop();
      await engine.join(call);
      expect(events).toEqual([]);
      await engine.leave();
    });

    it("accepts every command while connected, and ignores them safely after leaving", async () => {
      const engine = make();
      await engine.join(call);
      engine.attach({ video: null, audio: null });
      expect(() => {
        engine.setMuted(true);
        engine.setMuted(false);
        engine.interrupt();
        engine.sendPhrase("I need an outfit for a wedding");
        engine.updateContext("Confirmed notes: Outdoor wedding, November");
        engine.say("I'm switching to voice only, so I'll sound a little different.");
      }).not.toThrow();
      await engine.leave();
      expect(() => {
        engine.interrupt();
        engine.say("Still there?");
      }).not.toThrow();
    });

    it("sends words with a speaker, the text so far, whether they're final, and a turn", async () => {
      const engine = make();
      const { events } = collect(engine);
      await engine.join(call);
      await new Promise((r) => setTimeout(r, 300));
      const words = events.filter((e) => e.type === "words");
      for (const w of words) {
        expect(["shopper", "stylist"]).toContain(w.speaker);
        expect(typeof w.text).toBe("string");
        expect(typeof w.final).toBe("boolean");
        expect(typeof w.turnId).toBe("string");
      }
      await engine.leave();
    });
  });
}
