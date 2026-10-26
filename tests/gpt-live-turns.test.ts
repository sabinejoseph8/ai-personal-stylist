import { describe, expect, it } from "vitest";
import { createTurns, TURN_PAUSE_MS } from "@/connectors/conversation/gpt-live/turns";
import type { ConversationEvent } from "@/connectors/conversation/types";

// 6c: GPT-Live's transcript pieces become turns, as the Tavus engine reports them, so the notes reader
// reads a shopper's turn at its end.

function setup() {
  const events: ConversationEvent[] = [];
  const pending: { fn: () => void; cancelled: boolean; ms: number }[] = [];
  const turns = createTurns(
    (e) => events.push(e),
    (fn, ms) => {
      const job = { fn, cancelled: false, ms };
      pending.push(job);
      return () => (job.cancelled = true);
    },
  );
  const pause = () => pending.filter((j) => !j.cancelled).forEach((j) => ((j.cancelled = true), j.fn()));
  return { events, turns, pause, pending };
}

describe("GPT-Live turns", () => {
  it("grows a shopper's words in one turn, and makes them final after a pause", () => {
    const { events, turns, pause, pending } = setup();
    turns.heard("shopper", "It's for ");
    turns.heard("shopper", "a wedding");
    expect(events).toEqual([
      { type: "shopper-speaking", speaking: true },
      { type: "words", speaker: "shopper", text: "It's for", final: false, turnId: "v1" },
      { type: "words", speaker: "shopper", text: "It's for a wedding", final: false, turnId: "v1" },
    ]);
    expect(pending.at(-1)?.ms).toBe(TURN_PAUSE_MS);
    pause();
    expect(events.slice(3)).toEqual([
      { type: "words", speaker: "shopper", text: "It's for a wedding", final: true, turnId: "v1" },
      { type: "shopper-speaking", speaking: false },
    ]);
  });

  it("ends the shopper's turn when she starts answering, with a new turn for her", () => {
    const { events, turns } = setup();
    turns.heard("shopper", "Something elegant");
    turns.heard("stylist", "Lovely.");
    expect(events.filter((e) => e.type === "words" && e.final)).toEqual([{ type: "words", speaker: "shopper", text: "Something elegant", final: true, turnId: "v1" }]);
    expect(events.at(-1)).toEqual({ type: "words", speaker: "stylist", text: "Lovely.", final: false, turnId: "v2" });
    expect(events).toContainEqual({ type: "stylist-speaking", speaking: true });
  });

  it("closes an open turn when the call ends, and ignores empty pieces", () => {
    const { events, turns } = setup();
    turns.heard("stylist", "");
    expect(events).toEqual([]);
    turns.heard("stylist", "Hi");
    turns.flush();
    expect(events.slice(-2)).toEqual([
      { type: "words", speaker: "stylist", text: "Hi", final: true, turnId: "v1" },
      { type: "stylist-speaking", speaking: false },
    ]);
    turns.flush();
    expect(events).toHaveLength(4);
  });
});
