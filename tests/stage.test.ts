import { describe, expect, it } from "vitest";
import { nextStage, READY, showSamplePhrases, type Stage, type StageAction, stageLabel } from "@/lib/stage";

// 2b: the stylist's state in words (R8), interrupting (R7) and when the sample phrases show (R70).
const run = (...actions: StageAction[]): Stage => actions.reduce(nextStage, READY);
const label = (...actions: StageAction[]) => stageLabel(run(...actions));
const connected: StageAction[] = [{ type: "starting" }, { type: "connection", state: "connected" }];

describe("the stylist's state in words", () => {
  it("is Ready before the conversation, then Connecting, then Listening", () => {
    expect(label()).toBe("Ready");
    expect(label({ type: "starting" })).toBe("Connecting");
    expect(label(...connected)).toBe("Listening");
  });

  it("is Speaking while she talks, and Listening when she stops", () => {
    expect(label(...connected, { type: "stylist-speaking", speaking: true })).toBe("Speaking");
    expect(label(...connected, { type: "stylist-speaking", speaking: true }, { type: "stylist-speaking", speaking: false })).toBe("Listening");
  });

  it("is Thinking between the shopper finishing and her answer", () => {
    const finished: StageAction[] = [...connected, { type: "shopper-speaking", speaking: true }, { type: "shopper-speaking", speaking: false }];
    expect(label(...finished)).toBe("Thinking");
    expect(label(...finished, { type: "stylist-speaking", speaking: true })).toBe("Speaking");
  });

  it("goes straight to Listening when the shopper talks over her (R7)", () => {
    expect(label(...connected, { type: "stylist-speaking", speaking: true }, { type: "shopper-speaking", speaking: true })).toBe("Listening");
  });

  it("is Muted while muted, unless she's speaking", () => {
    expect(label(...connected, { type: "muted", muted: true })).toBe("Muted");
    expect(label(...connected, { type: "muted", muted: true }, { type: "stylist-speaking", speaking: true })).toBe("Speaking");
    expect(label(...connected, { type: "muted", muted: true }, { type: "muted", muted: false })).toBe("Listening");
  });

  it("is Reconnecting when the connection drops, and Listening once it's back", () => {
    expect(label(...connected, { type: "connection", state: "reconnecting" })).toBe("Reconnecting");
    expect(label(...connected, { type: "connection", state: "reconnecting" }, { type: "connection", state: "connected" })).toBe("Listening");
  });

  it("is Microphone needed when the microphone is blocked, missing or stops working (R6), until the next start", () => {
    for (const problem of ["blocked", "missing", "failed"] as const) {
      expect(label(...connected, { type: "microphone", problem })).toBe("Microphone needed");
    }
    expect(label({ type: "microphone", problem: "blocked" }, { type: "starting" })).toBe("Connecting");
  });

  it("is Ended after the call", () => {
    expect(label(...connected, { type: "stopped" })).toBe("Ended");
    expect(label(...connected, { type: "connection", state: "ended" })).toBe("Ended");
  });
});

describe("tap to try (R70)", () => {
  it("shows the phrases once she's connected, until the shopper speaks or taps one", () => {
    expect(showSamplePhrases(run({ type: "starting" }))).toBe(false);
    expect(showSamplePhrases(run(...connected))).toBe(true);
    expect(showSamplePhrases(run(...connected, { type: "stylist-speaking", speaking: true }))).toBe(true);
    expect(showSamplePhrases(run(...connected, { type: "phrase-sent" }))).toBe(false);
    expect(showSamplePhrases(run(...connected, { type: "shopper-speaking", speaking: true }))).toBe(false);
    expect(showSamplePhrases(run(...connected, { type: "words", speaker: "shopper", text: "Hi", final: false, turnId: "1" }))).toBe(false);
  });

  it("a tapped phrase is answered: Thinking until she speaks", () => {
    expect(label(...connected, { type: "phrase-sent" })).toBe("Thinking");
  });
});
