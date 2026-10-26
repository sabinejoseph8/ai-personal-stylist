import type { ConversationEvent } from "../types";

// GPT-Live's words arrive as transcript pieces with no turns or "final" marks (6c). This keeps turns the
// way the Tavus engine reports them: a turn ends when the other side starts talking, or after a pause.
// The notes reader reads a shopper's turn at its end (final), as with Tavus. Plain code, tested in
// tests/gpt-live-turns.test.ts.

/** A pause this long ends a turn. */
export const TURN_PAUSE_MS = 1200;

type Speaker = "shopper" | "stylist";

export function createTurns(emit: (e: ConversationEvent) => void, schedule: (fn: () => void, ms: number) => () => void = defaultSchedule) {
  let count = 0;
  let current: { speaker: Speaker; text: string; turnId: string; cancel: () => void } | null = null;

  function finish() {
    const turn = current;
    if (!turn) return;
    current = null;
    turn.cancel();
    emit({ type: "words", speaker: turn.speaker, text: turn.text.trim(), final: true, turnId: turn.turnId });
    emit(turn.speaker === "shopper" ? { type: "shopper-speaking", speaking: false } : { type: "stylist-speaking", speaking: false });
  }

  return {
    /** A piece of transcript from one side. */
    heard(speaker: Speaker, delta: string) {
      if (!delta) return;
      if (current && current.speaker !== speaker) finish();
      if (!current) {
        count++;
        current = { speaker, text: "", turnId: `v${count}`, cancel: () => {} };
        emit(speaker === "shopper" ? { type: "shopper-speaking", speaking: true } : { type: "stylist-speaking", speaking: true });
      }
      const turn = current;
      turn.text += delta;
      turn.cancel();
      turn.cancel = schedule(() => current === turn && finish(), TURN_PAUSE_MS);
      emit({ type: "words", speaker, text: turn.text.trim(), final: false, turnId: turn.turnId });
    },
    /** Ends whatever turn is open (the call ended). */
    flush: finish,
  };
}

function defaultSchedule(fn: () => void, ms: number) {
  const timer = setTimeout(fn, ms);
  return () => clearTimeout(timer);
}
