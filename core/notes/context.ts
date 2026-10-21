import { itemForStylist, type StyleItem } from "../photos/item";

/** A wardrobe item chosen with Style with these (3d), in the words the stylist needs. */
export type WardrobePick = { name: string; category: string; details: { colors: string; pattern: string; style: string } };
import { active, type NextQuestion, type Note } from "./types";

/**
 * What the stylist is told after every change (2c), so what she says matches the notebook: the
 * confirmed notes, the notes still to confirm, saved preferences, the item to style around (3b), the
 * wardrobe items chosen to style with (3d) and the next question.
 */
export function stylistContext(
  notes: Note[],
  preferences: { kind: string; words: string }[],
  question: NextQuestion,
  item: StyleItem | null = null,
  wardrobe: WardrobePick[] = [],
): string {
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
  if (item) lines.push(itemForStylist(item));
  if (wardrobe.length)
    lines.push(
      `The shopper chose these items they own, from their wardrobe, to style with: ${wardrobe.map((w) => `${w.name} (${[w.category, w.details.colors, w.details.pattern, w.details.style].filter(Boolean).join(", ")})`).join("; ")}.`,
    );
  if (question) lines.push(`Ask next, when it fits: ${question.text}${question.options.length ? ` (${question.options.join(", ")})` : ""}`);
  lines.push("When a note changes because the shopper corrected it, acknowledge the change in a few words. Never read the notes out in full.");
  return lines.join("\n");
}
