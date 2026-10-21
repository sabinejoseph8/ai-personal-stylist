import type { NoMatch } from "./no-match";
import { list } from "./rules";
import type { ShownLook } from "./shown";

// What the stylist is told about the looks on screen (4c, tech spec 1.3 step 6), added to her context
// by the page after the notes, since only the page knows which look the shopper is looking at. She
// presents new looks in her own words, kept short (Sabine's answer to Q4 in 4c), and says what changed
// after a change (R44).

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
  });
  if (now.noMatch) lines.push(`Only ${now.looks.length} ${now.looks.length === 1 ? "look meets" : "looks meet"} everything. ${now.noMatch.message} Explain this briefly and offer the choices: ${now.noMatch.choices.join(", ")}.`);
  if (now.needs) lines.push(`They need a new check first: the shopper's screen says "${now.needs}".`);
  if (now.changed) lines.push(now.changed);
  lines.push(now.inView ? `The shopper is looking at Look ${now.inView}.` : "No look is on the shopper's screen right now.");
  lines.push(
    "When you present new or updated looks, keep it short: each look's name and one line about it, then ask them to have a look on screen. Don't read out every item or price unless they ask.",
    'The shopper can swap a piece by asking, for example "show me different shoes", or with Swap. The new piece appears on screen once it has been checked, so say you\'re finding one. If they don\'t say which look and no look is on their screen, ask which one.',
  );
  return lines.join("\n");
}

/** What changed after the looks were brought up to date, by look number, for the stylist to say (R44). */
export function looksChanged(before: ShownLook[], after: ShownLook[]): string | null {
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
