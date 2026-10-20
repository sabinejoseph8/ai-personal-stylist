import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationEvent } from "@/connectors/conversation/types";

// Phase 2 review: the Tavus browser engine with a stand-in for Daily, which (like the real one) allows
// one call object per page until it's destroyed.
type Handler = (e?: unknown) => void;
const daily = vi.hoisted(() => ({ live: 0, joinFails: false, calls: [] as { handlers: Map<string, Handler>; destroyed: boolean }[] }));

vi.mock("@daily-co/daily-js", () => ({
  default: {
    createCallObject: () => {
      if (daily.live > 0) throw new Error("Duplicate DailyIframe instances are not allowed");
      daily.live++;
      const call = { handlers: new Map<string, Handler>(), destroyed: false };
      daily.calls.push(call);
      return {
        on: (name: string, handler: Handler) => call.handlers.set(name, handler),
        join: async () => {
          if (daily.joinFails) throw new Error("join failed");
        },
        leave: async () => undefined,
        destroy: async () => {
          if (!call.destroyed) daily.live--;
          call.destroyed = true;
        },
        sendAppMessage: () => undefined,
        setLocalAudio: () => undefined,
      };
    },
  },
}));

const { createTavusEngine } = await import("@/connectors/conversation/tavus/client");
const target = { callId: "c1", joinUrl: "https://tavus.daily.co/c1" };

describe("Tavus engine", () => {
  beforeEach(() => {
    daily.live = 0;
    daily.joinFails = false;
    daily.calls.length = 0;
  });

  it("destroys a call that couldn't join, so the next try can make a new one", async () => {
    daily.joinFails = true;
    await expect(createTavusEngine().join(target)).rejects.toThrow("join failed");
    expect(daily.live).toBe(0);
    daily.joinFails = false;
    await expect(createTavusEngine().join(target)).resolves.toBeUndefined();
  });

  it("treats a fatal call error as a dropped call, once (R14)", async () => {
    const engine = createTavusEngine();
    const events: ConversationEvent[] = [];
    engine.on((e) => events.push(e));
    await engine.join(target);
    const handlers = daily.calls[0].handlers;
    handlers.get("error")?.({ errorMsg: "ejected" });
    handlers.get("left-meeting")?.();
    expect(events.filter((e) => e.type === "connection" && e.state === "ended")).toHaveLength(1);
    expect(events).toContainEqual({ type: "error", message: "ejected" });
  });
});
