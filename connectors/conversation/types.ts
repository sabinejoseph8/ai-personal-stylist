// The conversation connector (tech spec 4.2). Every stylist engine follows this shape, so the rest of
// the app never knows which one is running. The server side starts and ends calls with the provider
// (it holds the keys); the browser side joins the call, sends commands and hears events.
// Engines in v1: Tavus video, a fake engine for tests, and GPT-Live voice only (Phase 6, 6c).

export type Engine = "video" | "voice";

// ---------- Server side ----------

export type CallStart =
  | { ok: true; callId: string; joinUrl: string }
  /**
   * busy: the stylist is with another visitor (one call at a time). out_of_minutes: the provider's own
   * plan has no minutes left this month (Tavus answers 402, found on 21 Oct 2026; 6c).
   */
  | { ok: false; reason: "busy" | "unavailable" | "out_of_minutes" };

export interface CallProvider {
  readonly engine: Engine;
  /** Starts a call that ends by itself after maxSeconds. The answer never contains a key. */
  start(options: { sessionId: string; maxSeconds: number }): Promise<CallStart>;
  /** Ends the call and deletes it from the provider (Tavus: a hard delete, decided 18 Oct 2026). */
  end(callId: string): Promise<void>;
}

// ---------- Browser side ----------

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "ended";

export type StylistRequest = "capture_item" | "open_saved_looks" | "end_session";

export type ConversationEvent =
  /** Live words, never shown on screen (R10): they only feed the notes reader. */
  | { type: "words"; speaker: "shopper" | "stylist"; text: string; final: boolean; turnId: string }
  | { type: "stylist-speaking"; speaking: boolean }
  | { type: "shopper-speaking"; speaking: boolean }
  | { type: "stylist-request"; request: StylistRequest }
  | { type: "connection"; state: ConnectionState }
  /** The shopper's microphone is blocked, missing or stopped working (R6): she can't hear them. */
  | { type: "microphone"; problem: "blocked" | "missing" | "failed" }
  | { type: "error"; message: string };

export type ConversationListener = (event: ConversationEvent) => void;

export interface ConversationEngine {
  /**
   * Joins the call the server started. Resolves once connected. A voice call is only made when the
   * browser joins (6c), so it resolves with the call's own id, which replaces the pending one.
   */
  join(call: { callId: string; joinUrl: string }): Promise<void | { callId: string }>;
  /** Leaves the call. Safe to call more than once. */
  leave(): Promise<void>;
  setMuted(muted: boolean): void;
  /** Stops the stylist mid-sentence (R7). */
  interrupt(): void;
  /** A tap-to-try phrase, as if the shopper had said it (R70). */
  sendPhrase(text: string): void;
  /** Gives the stylist the current notes, looks and next question, so she knows what to say. */
  updateContext(context: string): void;
  /** Makes the stylist say an exact short line, such as the voice-only switch line (R9). */
  say(line: string): void;
  /** Shows the stylist's video and plays her voice in these elements. */
  attach(media: { video: HTMLVideoElement | null; audio: HTMLAudioElement | null }): void;
  /** Listens to events. Returns a function that stops listening. */
  on(listener: ConversationListener): () => void;
}
