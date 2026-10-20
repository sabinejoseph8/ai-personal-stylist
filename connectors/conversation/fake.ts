import type { CallProvider, ConversationEngine, ConversationEvent, ConversationListener } from "./types";

// The fake engine (tech spec 8): plays a scripted conversation, so tests can run a "call" for free,
// as often as they like. The server only picks it in tests (connectors/conversation/server.ts).

export const FAKE_JOIN_PREFIX = "fake://call/";

export type FakeStep = { afterMs: number; event: ConversationEvent };

/** The stylist's greeting, as the real one sounds. */
export const GREETING: FakeStep[] = [
  { afterMs: 50, event: { type: "stylist-speaking", speaking: true } },
  { afterMs: 100, event: { type: "words", speaker: "stylist", text: "Hi, I'm your stylist. What are you dressing for?", final: true, turnId: "0" } },
  { afterMs: 150, event: { type: "stylist-speaking", speaking: false } },
];

export function createFakeProvider(): CallProvider {
  return {
    engine: "video",
    async start({ sessionId }) {
      return { ok: true, callId: `fake-${crypto.randomUUID()}`, joinUrl: `${FAKE_JOIN_PREFIX}${sessionId}` };
    },
    async end() {},
  };
}

export type FakeEngine = ConversationEngine & {
  /** Every command the app sent, in order, for tests to check. */
  readonly commands: { name: string; value?: unknown }[];
  /** Plays one more event, as if it came from the call. */
  play(event: ConversationEvent): void;
};

export function createFakeEngine(script: FakeStep[] = GREETING): FakeEngine {
  const listeners = new Set<ConversationListener>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const commands: { name: string; value?: unknown }[] = [];
  let state: "idle" | "connected" | "ended" = "idle";

  const emit = (event: ConversationEvent) => listeners.forEach((l) => l(event));
  const record = (name: string, value?: unknown) => {
    if (state === "connected") commands.push({ name, value });
  };

  return {
    commands,

    async join() {
      if (state === "connected") return;
      emit({ type: "connection", state: "connecting" });
      await Promise.resolve();
      state = "connected";
      emit({ type: "connection", state: "connected" });
      for (const step of script) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (state === "connected") emit(step.event);
        }, step.afterMs);
        timers.add(timer);
      }
    },

    async leave() {
      if (state !== "connected") return;
      state = "ended";
      timers.forEach(clearTimeout);
      timers.clear();
      emit({ type: "connection", state: "ended" });
    },

    setMuted: (muted) => record("setMuted", muted),
    interrupt: () => record("interrupt"),
    sendPhrase: (text) => record("sendPhrase", text),
    updateContext: (context) => record("updateContext", context),
    say: (line) => record("say", line),
    attach() {},

    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    play(event) {
      if (state === "connected") emit(event);
    },
  };
}
