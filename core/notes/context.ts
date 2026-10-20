import { active, type NextQuestion, type Note } from "./types";

/**
 * What the stylist is told after every change (2c), so what she says matches the notebook: the
 * confirmed notes, the notes still to confirm, saved preferences and the next question.
 */
export function stylistContext(notes: Note[], preferences: { kind: string; words: string }[], question: NextQuestion): string {
  const live = active(notes);
  const confirmed = live.filter((n) => n.status === "confirmed").map((n) => n.text);
  const toConfirm = live.filter((n) => n.status === "to_confirm").map((n) => n.text);
  const label = { must_have: "Must have", never: "Never", likes: "Likes" } as Record<string, string>;
  const lines = [
    "My Styling Notes, the notebook the shopper sees:",
    `- Confirmed: ${confirmed.length ? confirmed.join("; ") : "nothing yet"}`,
    `- To confirm: ${toConfirm.length ? toConfirm.join("; ") : "nothing"}`,
  ];
  if (preferences.length) lines.push(`- Saved preferences (firm, except Likes): ${preferences.map((p) => `${label[p.kind] ?? p.kind}: ${p.words}`).join("; ")}`);
  if (question) lines.push(`Ask next, when it fits: ${question.text}${question.options.length ? ` (${question.options.join(", ")})` : ""}`);
  lines.push("When a note changes because the shopper corrected it, acknowledge the change in a few words. Never read the notes out in full.");
  return lines.join("\n");
}
