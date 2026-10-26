// What the stage says, and what the stylist says, when she's in voice only (6c; R9, design 4.1). Plain
// words, tested in tests/voice-lines.test.ts.

/** Why voice only: the shopper chose it, video was busy, unavailable or used up for the month, or it dropped mid-call. */
export type VoiceWhy = "chosen" | "busy" | "unavailable" | "resting" | "dropped";

/** The line under the stage (design 4.1). */
export function voiceLine(why: VoiceWhy): string {
  if (why === "busy") return "The video stylist is with another visitor. Continuing with voice.";
  if (why === "resting") return "The video stylist is resting for the rest of the month. Continuing with voice.";
  if (why === "unavailable" || why === "dropped") return "Video unavailable. Continuing with voice.";
  return "Voice only";
}

/** What she says first when voice only stands in for video from the start (tech spec 4.2): why, then the conversation. */
export function spokenWhy(why: "busy" | "unavailable" | "resting", resumed: boolean): string {
  const reason =
    why === "busy"
      ? "The video stylist is with another visitor right now, so I'm with you by voice."
      : why === "resting"
        ? "Video is resting for the rest of the month, so I'm with you by voice."
        : "Video isn't available right now, so I'm with you by voice.";
  return `${reason} ${resumed ? "Let's carry on." : "What are you dressing for?"}`;
}
