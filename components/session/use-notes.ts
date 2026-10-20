"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ConversationEvent } from "@/connectors/conversation/types";
import type { NextQuestion } from "@/core/notes/types";

// The browser's side of My Styling Notes (2c): it sends the shopper's words about twice a second while
// they talk (R17, Sabine's option 3 in 2c), and right away when they finish, and shows the notes the server sends back. Each send
// starts its own reading, so readings overlap and the server merges them. A late answer never replaces
// a newer one (R22): each update carries the notebook's version.

export type ShownNote = { id: string; kind: string; text: string; status: "to_confirm" | "confirmed" };
type Update = { version?: number; notes?: ShownNote[]; question?: NextQuestion; seq?: number; context?: string; paused?: boolean; error?: string };

const SEND_EVERY_MS = 500;

/** Reads a streamed answer: one JSON update per line. */
async function readLines(res: Response, onLine: (u: Update) => void) {
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
      if (line) onLine(JSON.parse(line) as Update);
      newline = buffer.indexOf("\n");
    }
    if (done) return;
  }
}

export function useNotes(sessionId: string | null, live: boolean, initial: ShownNote[], onContext: (context: string) => void) {
  const [notes, setNotes] = useState<ShownNote[]>(initial);
  const [question, setQuestion] = useState<NextQuestion>(null);
  const [paused, setPaused] = useState(false);
  const version = useRef(0);
  const turn = useRef({ id: "", text: "", sent: "" });
  const stylistSaid = useRef("");
  const context = useRef(onContext);
  const session = useRef(sessionId);
  useLayoutEffect(() => {
    context.current = onContext;
    session.current = sessionId;
  });

  // The question on screen, and the turn whose reading asked it: it's sent back with that turn's words,
  // so a reading that leaves the question out doesn't clear it. Readings overlap, so only a reading of
  // newer words (a higher sequence) replaces it.
  const asked = useRef<{ key: string; question: NextQuestion; seq: number }>({ key: "", question: null, seq: 0 });

  function apply(u: Update, key: string) {
    if (u.error || u.version === undefined) {
      if (u.paused) setPaused(true);
      return;
    }
    if (u.version < version.current) return;
    version.current = u.version;
    if (u.notes) setNotes(u.notes);
    if (u.question !== undefined && (u.seq ?? 0) >= asked.current.seq) {
      asked.current = { key, question: u.question, seq: u.seq ?? 0 };
      setQuestion(u.question);
    }
    setPaused(Boolean(u.paused));
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
        body: JSON.stringify({ words, stylistSaid: stylistSaid.current, final, asked: asked.current.key === key ? asked.current.question : null }),
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
      await readLines(res, (u) => apply(u, key));
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
      void post(`turn-${t.id}`, words, final).then((sent) => {
        // Turned away mid-turn: the next tick sends the words again.
        if (!sent && t.sent === words) t.sent = "";
      });
    }
    if (final) turn.current = { id: "", text: "", sent: "" };
  }

  /** Feed every conversation event here: the shopper's words are sent, the stylist's last words kept as context. */
  function onEvent(e: ConversationEvent) {
    if (e.type !== "words") return;
    if (e.speaker === "stylist") {
      if (e.final) stylistSaid.current = e.text;
      return;
    }
    if (turn.current.id && e.turnId !== turn.current.id) flush(true);
    turn.current.id = e.turnId;
    turn.current.text = e.text;
    if (e.final) flush(true);
  }

  const phrases = useRef(0);
  // About twice a second while the shopper talks (tech spec 1.2).
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => flush(false), SEND_EVERY_MS);
    return () => clearInterval(timer);
    // flush only reads refs, so the timer needn't restart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  return {
    notes,
    question,
    paused,
    onEvent,
    /** A tapped phrase or quick reply, sent as if spoken. */
    say: (text: string) => void post(`phrase-${++phrases.current}`, text, true),
    clearQuestion: () => {
      asked.current = { ...asked.current, key: "", question: null };
      setQuestion(null);
    },
    reset: () => {
      version.current = 0;
      asked.current = { key: "", question: null, seq: 0 };
      setNotes([]);
      setQuestion(null);
      setPaused(false);
    },
  };
}
