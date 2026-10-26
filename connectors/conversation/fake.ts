import type { CallProvider, ConversationEngine, ConversationEvent, ConversationListener, Engine } from "./types";

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

/**
 * A fake provider for either engine: a voice call's id carries the voice prefix, as GPT-Live's does (6c).
 * `refuse` makes it turn calls away, for the browser tests of voice only standing in for video.
 */
export function createFakeProvider(engine: Engine = "video", refuse?: "busy" | "unavailable" | "out_of_minutes"): CallProvider {
  return {
    engine,
    async start({ sessionId }) {
      if (refuse) return { ok: false, reason: refuse };
      const id = `fake-${crypto.randomUUID()}`;
      return { ok: true, callId: engine === "voice" ? `voice:${id}` : id, joinUrl: `${FAKE_JOIN_PREFIX}${sessionId}${engine === "voice" ? "?voice" : ""}` };
    },
    async end() {},
  };
}

export type FakeEngine = ConversationEngine & {
  /** Every command the app sent, in order, for tests to check. */
  readonly commands: { name: string; value?: unknown }[];
  /** Plays one more event, as if it came from the call. */
  play(event: ConversationEvent): void;
  /** True once the call is up and every scripted event has played, so tests don't race the greeting. */
  readonly scriptDone: boolean;
};

export function createFakeEngine(script: FakeStep[] = GREETING): FakeEngine {
  const engine = makeFakeEngine(script);
  // Browser tests reach the running fake call here, to play events and read the commands sent.
  if (typeof window !== "undefined") (window as unknown as { fakeConversation?: FakeEngine }).fakeConversation = engine;
  return engine;
}

function makeFakeEngine(script: FakeStep[]): FakeEngine {
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
    get scriptDone() {
      return state === "connected" && timers.size === 0;
    },

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
