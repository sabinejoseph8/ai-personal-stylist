import { describe, expect, it } from "vitest";
import { announcement, type NotebookNote, noteChanges, notesSummary } from "@/lib/notebook";
import { nextStage, READY, someoneSpeaking } from "@/lib/stage";

// 2d: the notebook in words: the one-line summary (R23, the pinned bar) and what screen readers hear (R68).
const pencil = (id: string, text: string): NotebookNote => ({ id, text, status: "to_confirm" });
const ink = (id: string, text: string): NotebookNote => ({ id, text, status: "confirmed" });

describe("the notebook's summary line", () => {
  it.each([
    [[], "No notes yet"],
    [[pencil("a", "Elegant")], "1 note, 1 to confirm"],
    [[ink("a", "Elegant")], "1 note, confirmed"],
    [[ink("a", "Elegant"), ink("b", "Gala")], "2 notes, all confirmed"],
    [[pencil("a", "Elegant"), ink("b", "Gala"), pencil("c", "Navy"), pencil("d", "Budget: up to $500"), ink("e", "Silk"), ink("f", "Flats")], "6 notes, 3 to confirm"],
  ])("%j reads %s", (notes, summary) => {
    expect(notesSummary(notes)).toBe(summary);
  });
});

describe("what screen readers hear (R68)", () => {
  it("names one change in full, budgets without the colon", () => {
    expect(announcement(noteChanges([], [pencil("b", "Budget: up to $350")]))).toBe("Noted: Budget up to $350, to confirm.");
    expect(announcement(noteChanges([pencil("b", "Budget: up to $500")], [ink("b", "Budget: up to $350")]))).toBe(
      "Changed: Budget up to $350, confirmed.",
    );
    expect(announcement(noteChanges([pencil("a", "Elegant")], [ink("a", "Elegant")]))).toBe("Confirmed: Elegant.");
    expect(announcement(noteChanges([pencil("a", "Elegant")], []))).toBe("Removed: Elegant.");
  });

  it("groups several changes, as when they arrive while someone is talking", () => {
    const before = [pencil("a", "Elegant"), pencil("b", "Budget: up to $500"), pencil("c", "Navy")];
    const after = [ink("a", "Elegant"), pencil("b", "Budget: up to $350"), pencil("d", "Gala"), pencil("e", "Outdoor"), pencil("f", "Silk")];
    expect(announcement(noteChanges(before, after))).toBe("3 notes added, 1 changed, 1 confirmed, 1 removed");
    expect(announcement(noteChanges(before, [ink("a", "Elegant"), ink("b", "Budget: up to $500")]))).toBe("2 notes confirmed, 1 removed");
  });

  it("says nothing when nothing changed, or only went back to pencil", () => {
    expect(announcement(noteChanges([ink("a", "Elegant")], [ink("a", "Elegant")]))).toBe("");
    expect(announcement(noteChanges([ink("a", "Elegant")], [pencil("a", "Elegant")]))).toBe("");
  });

  it("holds updates while the shopper or the stylist is talking", () => {
    const talking = nextStage({ ...READY, connection: "connected" }, { type: "shopper-speaking", speaking: true });
    expect(someoneSpeaking(talking)).toBe(true);
    expect(someoneSpeaking(nextStage(talking, { type: "shopper-speaking", speaking: false }))).toBe(false);
    expect(someoneSpeaking(nextStage(talking, { type: "stylist-speaking", speaking: true }))).toBe(true);
    expect(someoneSpeaking(nextStage(talking, { type: "connection", state: "ended" }))).toBe(false);
  });
});
