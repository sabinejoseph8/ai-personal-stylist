import { describe, expect, it, vi } from "vitest";
import { undoAnswer } from "@/lib/undo-answer";

// Full code review, batch 4, C12: Undo's answer says the look is back even when taking back its feedback fails.
describe("Undo's answer", () => {
  it("carries the notes when the feedback is taken back, and the look alone when that fails twice", async () => {
    expect(await undoAnswer("look", async () => "notes")).toEqual({ look: "look", notes: "notes" });
    expect(await undoAnswer("look", null)).toEqual({ look: "look" });
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    let tries = 0;
    const flaky = async () => {
      tries++;
      if (tries === 1) throw new Error("clash");
      return "notes";
    };
    expect(await undoAnswer("look", flaky)).toEqual({ look: "look", notes: "notes" });
    const failing = async () => {
      throw new Error("down");
    };
    expect(await undoAnswer("look", failing)).toEqual({ look: "look" });
    expect(quiet).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
  });
});
