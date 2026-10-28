import { describe, expect, it } from "vitest";
import { spokenWhy, voiceLine } from "@/lib/voice-lines";

// 6c: the line under the stage in voice only (design 4.1), and what she says first when voice stands in for video.

describe("voice-only lines", () => {
  it("says why under the stage", () => {
    expect(voiceLine("busy")).toBe("The video stylist is with another visitor. Continuing with voice.");
    expect(voiceLine("unavailable")).toBe("Video unavailable. Continuing with voice.");
    expect(voiceLine("dropped")).toBe("Video unavailable. Continuing with voice.");
    expect(voiceLine("resting", "21 November")).toBe("The video stylist is resting until 21 November. Continuing with voice.");
    expect(voiceLine("resting")).toBe("The video stylist is resting for now. Continuing with voice.");
    expect(voiceLine("chosen")).toBe("Voice only");
  });

  it("has her say why, then start or carry on", () => {
    expect(spokenWhy("busy", false)).toBe("The video stylist is with another visitor right now, so I'm with you by voice. What are you dressing for?");
    expect(spokenWhy("unavailable", true)).toBe("Video isn't available right now, so I'm with you by voice. Let's carry on.");
    expect(spokenWhy("resting", false, "21 November")).toMatch(/^Video is resting until 21 November, so I'm with you by voice/);
  });
});
