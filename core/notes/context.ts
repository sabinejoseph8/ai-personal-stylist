import { type FirmPreference, spokenQuestion } from "../looks/exceptions";
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
  // Feedback on the looks (5a) is told with the looks, by the page, which knows their numbers.
  const live = active(notes).filter((n) => n.kind !== "feedback");
  const confirmed = live.filter((n) => n.status === "confirmed").map((n) => n.text);
  const toConfirm = live.filter((n) => n.status === "to_confirm").map((n) => n.text);
  const label = { must_have: "Must have", never: "Never", likes: "Likes" } as Record<string, string>;
  const lines = [
    "My Styling Notes, the notebook the shopper sees:",
    `- Confirmed: ${confirmed.length ? confirmed.join("; ") : "nothing yet"}`,
    `- To confirm: ${toConfirm.length ? toConfirm.join("; ") : "nothing"}`,
  ];
  if (preferences.length) lines.push(`- Saved preferences (firm, except Likes): ${preferences.map((p) => `${label[p.kind] ?? p.kind}: ${p.words}`).join("; ")}`);
  // Told from the start, with the exact question, so her own first answer asks it, once (5c, R57; found on
  // Sabine's iPhone in 5c, A.3: left to her own words she allowed it herself, and a question from the app
  // on top of her reply asked twice).
  const firm = preferences.flatMap((p) => (p.kind === "never" || p.kind === "must_have" ? [{ id: "", kind: p.kind, words: p.words } as FirmPreference] : []));
  if (firm.length)
    lines.push(
      [
        "If the shopper asks for something a saved Must have or Never rules out, don't say yes or no, and don't suggest anything with it: reply only with the question, word for word:",
        ...firm.map((p) => `- For ${p.kind === "never" ? p.words : `going without ${p.words}`}: "${spokenQuestion(p)}"`),
        "Then wait for their answer. One already allowed for this session (below) needs no asking.",
      ].join("\n"),
    );
  if (item) lines.push(itemForStylist(item));
  if (wardrobe.length)
    lines.push(
      `The shopper chose these items they own, from their wardrobe, to style with: ${wardrobe.map((w) => `${w.name} (${[w.category, w.details.colors, w.details.pattern, w.details.style].filter(Boolean).join(", ")})`).join("; ")}.`,
    );
  if (question) lines.push(`Ask next, when it fits: ${question.text}${question.options.length ? ` (${question.options.join(", ")})` : ""}`);
  lines.push("When a note changes because the shopper corrected it, acknowledge the change in a few words. Never read the notes out in full.");
  return lines.join("\n");
}
