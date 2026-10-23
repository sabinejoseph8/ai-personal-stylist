import type { NoMatch } from "./no-match";
import { list } from "./rules";
import type { ShownLook } from "./shown";

// What the stylist is told about the looks on screen (4c, tech spec 1.3 step 6), added to her context
// by the page after the notes, since only the page knows which look the shopper is looking at. She
// presents new looks in her own words, kept short (Sabine's answer to Q4 in 4c), and says what changed
// after a change (R44). A look revised from feedback (5b) comes with its change summary, which she says
// in a few words (R50); one that couldn't be revised comes with why, so she can ask what to change (R49).

export type LooksNow = {
  looks: ShownLook[];
  /** Being built or checked, with none to show yet. */
  building: boolean;
  /** What's needed before looks can be built ("Tell the stylist the occasion to see looks"). */
  needs: string | null;
  noMatch: NoMatch | null;
  /** The number of the look most on the shopper's screen, or null. */
  inView: number | null;
  /** What just changed, in words, after a change or a swap. */
  changed?: string | null;
  /** Feedback jotted on the looks (5a), by look number (null for a look no longer on screen). */
  feedback?: { look: number | null; text: string; confirmed: boolean }[];
  /** The numbers of the looks being revised from feedback right now (5b). */
  revising?: number[];
};

const itemWords = (look: ShownLook) => look.items.map((i) => (i.owned ? `${i.name} (the shopper's own)` : i.name)).join(", ");

export function looksForStylist(now: LooksNow): string {
  if (!now.looks.length) {
    if (now.building) return "Looks: you're putting them together now. They appear on the shopper's screen in a moment, once they're checked against their preferences.";
    if (now.needs) return `Looks: none yet. The shopper's screen says "${now.needs}".`;
    return "";
  }
  const lines = ["Looks on the shopper's screen, each checked against their preferences:"];
  now.looks.forEach((look, i) => {
    const money = [look.total.toBuy, look.total.comparison].filter(Boolean).join(", ");
    lines.push(`- Look ${i + 1}, "${look.name}": ${itemWords(look)}. ${money}. Why it works: ${look.reason}${look.current ? "" : " (being checked again after a change)"}`);
    if (look.change) lines.push(`  Revised from their feedback. ${look.change}`);
    if (look.note) lines.push(`  Their last feedback couldn't be applied: ${look.note}`);
  });
  if (now.noMatch) lines.push(`Only ${now.looks.length} ${now.looks.length === 1 ? "look meets" : "looks meet"} everything. ${now.noMatch.message} Explain this briefly and offer the choices: ${now.noMatch.choices.join(", ")}.`);
  if (now.needs) lines.push(`They need a new check first: the shopper's screen says "${now.needs}".`);
  if (now.changed) lines.push(now.changed);
  if (now.revising?.length) lines.push(`${now.revising.length === 1 ? "Look" : "Looks"} ${list(now.revising.map(String), "and")} ${now.revising.length === 1 ? "is" : "are"} being revised from their feedback right now.`);
  if (now.feedback?.length) {
    lines.push("Feedback the shopper has given, jotted under its look:");
    for (const f of now.feedback) lines.push(`- ${f.look ? `Look ${f.look}` : "An earlier look"}: ${f.text}${f.confirmed ? "" : " (not confirmed yet: check what they meant)"}`);
    lines.push(
      "Feedback asking for a change revises that look by itself: say in a few words what you'll change. The look shows Revising, then the revised look appears with what changed above it. Feedback in pencil waits until it's confirmed, so check what they meant first.",
    );
  }
  lines.push(now.inView ? `The shopper is looking at Look ${now.inView}.` : "No look is on the shopper's screen right now.");
  lines.push(
    "When you present new or updated looks, keep it short: each look's name and one line about it, then ask them to have a look on screen. Don't read out every item or price unless they ask.",
    'The shopper can swap a piece by asking, for example "show me different shoes", or with Swap. The new piece appears on screen once it has been checked, so say you\'re finding one. If they don\'t say which look and no look is on their screen, ask which one.',
  );
  return lines.join("\n");
}

/**
 * What changed after the looks were brought up to date, by look number, for the stylist to say (R44): a
 * revision's summary (5b, R50), why a revision couldn't be made (R49), or which looks were replaced after
 * a change.
 */
export function looksChanged(before: ShownLook[], after: ShownLook[]): string | null {
  const revised: string[] = [];
  after.forEach((look, i) => {
    const was = before.find((b) => b.slot === look.slot);
    if (look.change && was && was.id !== look.id) revised.push(`Look ${i + 1} is revised from the shopper's feedback. ${look.change} Say what changed in a few words.`);
    // Every time a change couldn't be made, even in the same words as before: told nothing, she heard
    // "every look still meets everything" and said the shoes were updated (found on Sabine's iPhone in 5c, B.1).
    else if (look.note && was?.id === look.id && (was.note !== look.note || was.noteFor !== look.noteFor))
      revised.push(`Look ${i + 1} couldn't be revised as they asked: ${look.note} Explain briefly, and if their budget or another requirement is what blocks it, ask which they'd rather change.`);
  });
  if (revised.length) return revised.join(" ");
  const kept: number[] = [];
  const replaced: number[] = [];
  after.forEach((look, i) => (before.some((b) => b.id === look.id) ? kept : replaced).push(i + 1));
  const gone = before.length - kept.length - replaced.length;
  if (!replaced.length && gone <= 0) return "After the shopper's change, every look still meets everything they've asked for.";
  const looks = (n: number[]) => `${n.length === 1 ? "Look" : "Looks"} ${list(n.map(String), "and")}`;
  const parts = [];
  if (replaced.length) parts.push(`${looks(replaced)} ${replaced.length === 1 ? "is" : "are"} new, because the ${replaced.length === 1 ? "look there" : "looks there"} no longer met everything`);
  if (kept.length) parts.push(`${looks(kept)} still ${kept.length === 1 ? "meets" : "meet"} everything`);
  if (gone > 0 && after.length < before.length) parts.push(`there ${after.length === 1 ? "is" : "are"} now ${after.length} instead of ${before.length}`);
  return `After the shopper's change: ${parts.join("; ")}.`;
}
