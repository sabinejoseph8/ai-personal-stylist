"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ConversationEvent } from "@/connectors/conversation/types";
import type { NextQuestion, ShownNote } from "@/core/notes/types";
import type { SwapRequest } from "@/core/notes/reader";
import type { FirmPreference, ShownException } from "@/core/looks/exceptions";
import type { StyleItem } from "@/core/photos/item";

// The browser's side of My Styling Notes (2c, 2d): it sends the shopper's words about twice a second
// while they talk (R17, Sabine's option 3 in 2c), and right away when they finish, and shows the notes
// the server sends back. Each send starts its own reading, so readings overlap and the server merges
// them. A late answer never replaces a newer one (R22): each update carries the notebook's version.
// Confirm, Remove and Undo by touch (R20) go to the server too. A spoken request to swap a piece (4c)
// is passed on once per turn.

export type { ShownNote };
export type TouchAction = "confirm" | "remove" | "restore";
type Touch = { action: TouchAction; note: ShownNote; index: number };

/** The notes with touches still on their way to the server laid on top, so a tap shows at once. */
function withTouches(notes: ShownNote[], touches: Map<string, Touch>) {
  let shown = notes;
  for (const [id, { action, note, index }] of touches) {
    if (action === "confirm") shown = shown.map((n) => (n.id === id ? { ...n, status: "confirmed" } : n));
    if (action === "remove") shown = shown.filter((n) => n.id !== id);
    if (action === "restore" && !shown.some((n) => n.id === id)) shown = [...shown.slice(0, index), note, ...shown.slice(index)];
  }
  return shown;
}
type Update = {
  version?: number;
  notes?: ShownNote[];
  question?: NextQuestion;
  seq?: number;
  context?: string;
  paused?: boolean;
  error?: string;
  /** The photo's item, when the shopper's words changed it (3b). */
  photo?: { id: string; item: StyleItem };
  /** A spoken request to swap a piece (4c). */
  swap?: SwapRequest;
  /** A request that breaks a saved Must have or Never (5c): the stylist asks first. */
  exception?: FirmPreference;
  /** A spoken answer to her question (5c): allowed, with the exceptions now, or kept. */
  answered?: Answered;
};

export type Answered = { preferenceId: string; allow: boolean; exceptions?: ShownException[] };

const SEND_EVERY_MS = 500;

/** Reads a streamed answer: one JSON update per line. */
export async function readLines<T = Update>(res: Response, onLine: (u: T) => void) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) onLine(JSON.parse(line) as T);
      newline = buffer.indexOf("\n");
    }
    if (done) return;
  }
}

export function useNotes(
  sessionId: string | null,
  live: boolean,
  initial: ShownNote[],
  onContext: (context: string) => void,
  onPhoto?: (id: string, item: StyleItem) => void,
  onSwap?: (swap: SwapRequest) => void,
  /** The looks on screen (5a): whether there are any, and the number of the one most in view, sent with the words. */
  lookInView?: () => { any: boolean; inView: number | null },
  /** A request that breaks a saved preference (5c, R57). */
  onException?: (preference: FirmPreference) => void,
  /** The saved preference the stylist is asking about, sent with the words so an answer is heard, and that answer (5c). */
  asking?: { now: () => string | null; wanted: () => boolean; answered: (answer: Answered) => void },
) {
  const [notes, setNotes] = useState<ShownNote[]>(initial);
  const [question, setQuestion] = useState<NextQuestion>(null);
  const [paused, setPaused] = useState(false);
  const version = useRef(0);
  // The shopper's turn so far, with a fresh label per turn for the server's kept question.
  const turn = useRef({ id: "", key: "", text: "", sent: "" });
  const stylistSaid = useRef("");
  const context = useRef(onContext);
  const photo = useRef(onPhoto);
  const swapHook = useRef(onSwap);
  const exceptionHook = useRef(onException);
  const askingHook = useRef(asking);
  const inView = useRef(lookInView);
  const session = useRef(sessionId);
  useLayoutEffect(() => {
    context.current = onContext;
    photo.current = onPhoto;
    swapHook.current = onSwap;
    exceptionHook.current = onException;
    askingHook.current = asking;
    inView.current = lookInView;
    session.current = sessionId;
  });
  // The turns whose swap was already passed on: a turn's words can be read more than once.
  const swapped = useRef(new Set<string>());

  // Readings overlap, so only a reading of newer words (a higher sequence) replaces the question.
  const questionSeq = useRef(0);

  /** An answer from the server. One for a session that has since ended is ignored (Phase 2 review). */
  function apply(u: Update, from: string, turnKey?: string) {
    if (from !== session.current) return;
    if (u.swap && turnKey && !swapped.current.has(turnKey)) {
      swapped.current.add(turnKey);
      swapHook.current?.(u.swap);
    }
    if (u.exception) exceptionHook.current?.(u.exception);
    if (u.answered) askingHook.current?.answered(u.answered);
    if (u.error || u.version === undefined) {
      if (u.paused) setPaused(true);
      return;
    }
    if (u.version < version.current) return;
    version.current = u.version;
    if (u.notes) setNotes(u.notes);
    if (u.question !== undefined && (u.seq ?? 0) >= questionSeq.current) {
      questionSeq.current = u.seq ?? 0;
      setQuestion(u.question);
    }
    // Only when the server says: the quick update before a reading says nothing about it, so with the
    // allowance used up "Notes paused" flickered twice a second (review batch 3, B13).
    if (u.paused !== undefined) setPaused(u.paused);
    if (u.photo) photo.current?.(u.photo.id, u.photo.item);
    if (u.context) context.current(u.context);
  }

  /**
   * `key` names the turn (or tapped phrase) the words belong to. Resolves false when the rate limit
   * (2 sends a second, tech spec 6) turned the words away.
   */
  async function post(key: string, words: string, final: boolean, tries = 3): Promise<boolean> {
    const id = session.current;
    if (!id || !words.trim()) return true;
    try {
      const res = await fetch(`/api/sessions/${id}/words`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words, stylistSaid: stylistSaid.current, final, turn: key, look: inView.current?.().inView ?? null, looks: inView.current?.().any ?? false, asking: askingHook.current?.now() ?? null, wanted: askingHook.current?.wanted() ?? false }),
      });
      if (res.status === 429) {
        // The end of a turn has no later send to carry its words, so it tries again shortly.
        if (!final || tries <= 1) return false;
        await new Promise((r) => setTimeout(r, 400));
        return post(key, words, final, tries - 1);
      }
      if (!res.ok || !res.body) {
        setPaused(true);
        return true;
      }
      await readLines(res, (u) => apply(u, id, key));
    } catch {
      setPaused(true);
    }
    return true;
  }

  function flush(final: boolean) {
    const t = turn.current;
    if (t.text && t.text !== t.sent) {
      t.sent = t.text;
      const words = t.text;
      void post(t.key, words, final).then((sent) => {
        // Turned away mid-turn: the next tick sends the words again.
        if (!sent && t.sent === words) t.sent = "";
      });
    }
    if (final) turn.current = { id: "", key: "", text: "", sent: "" };
  }

  /** Feed every conversation event here: the shopper's words are sent, the stylist's last words kept as context. */
  function onEvent(e: ConversationEvent) {
    if (e.type !== "words") return;
    if (e.speaker === "stylist") {
      if (e.final) stylistSaid.current = e.text;
      return;
    }
    if (turn.current.id && e.turnId !== turn.current.id) flush(true);
    if (turn.current.id !== e.turnId) turn.current.key = crypto.randomUUID();
    turn.current.id = e.turnId;
    turn.current.text = e.text;
    if (e.final) flush(true);
  }

  const [touches, setTouches] = useState(new Map<string, Touch>());
  const shown = useMemo(() => withTouches(notes, touches), [notes, touches]);
  // Touches on one note go to the server one after another: Undo then Remove in quick succession must
  // arrive in that order, or the note would come back.
  const inOrder = useRef(new Map<string, Promise<unknown>>());

  /**
   * Confirm, Remove or Undo (restore) by touch (R20). It shows at once; the server's answer then takes
   * over. `index` is where an undone note goes back. Resolves false if it couldn't be saved.
   */
  function touch(note: ShownNote, action: TouchAction, index = 0): Promise<boolean> {
    const mine: Touch = { action, note, index };
    setTouches((t) => new Map(t).set(note.id, mine));
    const done = (inOrder.current.get(note.id) ?? Promise.resolve()).then(() => send(note, action, mine));
    inOrder.current.set(note.id, done);
    return done;
  }

  async function send(note: ShownNote, action: TouchAction, mine: Touch): Promise<boolean> {
    const id = session.current;
    let saved = false;
    try {
      if (!id) throw new Error("no session");
      const res = await fetch(`/api/sessions/${id}/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const u = (await res.json()) as Update;
        // Readings may still be paused: a touch's answer only updates the notes and her context.
        if (id === session.current && u.version !== undefined && u.version >= version.current) {
          version.current = u.version;
          if (u.notes) setNotes(u.notes);
          if (u.context) context.current(u.context);
        }
        saved = true;
      }
    } catch {
      // Not saved: the note goes back to how it was.
    }
    setTouches((t) => {
      if (t.get(note.id) !== mine) return t; // a newer touch on this note is on its way
      const next = new Map(t);
      next.delete(note.id);
      return next;
    });
    return saved;
  }

  // About twice a second while the shopper talks (tech spec 1.2).
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => flush(false), SEND_EVERY_MS);
    return () => clearInterval(timer);
    // flush only reads refs, so the timer needn't restart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  return {
    notes: shown,
    question,
    paused,
    onEvent,
    /** A tapped phrase or quick reply, sent as if spoken. */
    say: (text: string) => void post(crypto.randomUUID(), text, true),
    touch,
    clearQuestion: () => setQuestion(null),
    /** Notes changed elsewhere, such as Keep or Change on a look's item (5a). */
    receive: (u: Update) => {
      if (u.version === undefined || u.version < version.current) return;
      version.current = u.version;
      if (u.notes) setNotes(u.notes);
      if (u.context) context.current(u.context);
    },
    reset: () => {
      version.current = 0;
      setTouches(new Map());
      questionSeq.current = 0;
      setNotes([]);
      setQuestion(null);
      setPaused(false);
    },
  };
}
