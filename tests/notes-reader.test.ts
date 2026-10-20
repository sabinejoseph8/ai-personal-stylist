import { describe, expect, it } from "vitest";
import { parseBudget, readNotes } from "@/lib/notes-reader.mjs";

// The notes reader must never crash on a bad answer, and money is read by plain code.
function fakeClient(response: object) {
  return { messages: { create: async () => response } } as unknown as Parameters<typeof readNotes>[0];
}
const usage = { input_tokens: 100, output_tokens: 10 };

describe("readNotes", () => {
  it("pauses instead of crashing when the answer is cut off", async () => {
    const client = fakeClient({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"notes": [' }], usage });
    const result = await readNotes(client, "claude-haiku-5-5", "my budget is $500");
    expect(result.notes).toBeNull();
  });

  it("pauses on a refusal", async () => {
    const client = fakeClient({ stop_reason: "refusal", content: [], usage });
    expect((await readNotes(client, "claude-haiku-5-5", "hello")).notes).toBeNull();
  });

  it("replaces the model's budget with the exact one from plain code, keeping its id", async () => {
    const notes = [{ id: "n3", kind: "budget", text: "Budget: about $500", status: "to_confirm", details: [] }];
    const client = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ notes }) }], usage });
    const result = await readNotes(client, "claude-haiku-5-5", "around $400. Actually, make my budget $350");
    expect(result.notes).toEqual([
      { id: "n3", kind: "budget", text: "Budget: up to $350", status: "to_confirm", details: [{ name: "max", value: "350" }] },
    ]);
  });
});

describe("parseBudget", () => {
  it.each([
    ["my budget is $500", "Budget: up to $500"],
    ["between 200 and 300 dollars", "Budget: $200 to $300"],
    ["I was thinking around 400 but actually keep it under 200", "Budget: up to $200"],
    ["budget was 300 but let's say 450 now", "Budget: up to $450"],
  ])("%s", (words, expected) => {
    expect(parseBudget(words)?.text).toBe(expected);
  });

  it("finds nothing in a vague budget", () => {
    expect(parseBudget("not too expensive")).toBeNull();
  });
});
