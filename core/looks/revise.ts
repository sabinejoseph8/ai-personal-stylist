import type { Product } from "../../connectors/catalog/types";
import { feedbackOf } from "../notes/feedback";
import { active, type Note } from "../notes/types";
import { dollars } from "./budget";
import { type Group, groupOf, type LookItem, nameOf, type ResolvedItem } from "./look";
import { list } from "./rules";
import type { LookTotal } from "./totals";

// Revising a look from feedback (5b; R48 to R50, Sabine's answers to Q1 and Q2 in 5b). The feedback lines
// jotted under a look (5a) say what to keep and what to change. A revision keeps the kept pieces, replaces
// the ones to change, never brings back a piece turned down in that look, and applies the detail asked
// for ("lower heel", "closed toe") in every later round of that look too. Feedback for every look
// ("no high heels in any look") is a requirement instead (lib/looks-service.ts). Pure rules, tested in
// tests/revise.test.ts.

/** One confirmed feedback line on a look, with what it asks. */
export type LookFeedback = {
  id: string;
  version: number;
  text: string;
  act: "keep" | "change" | "like" | "dislike";
  scope: "item" | "look";
  /** Product, photo or wardrobe ids. */
  items: string[];
  /** The detail asked for, such as "lower heel", or "". */
  about: string;
};

/** The confirmed feedback lines on the look in place `slot` (pencil lines wait until they're confirmed, Q1). */
export function lookFeedback(notes: Note[], slot: number): LookFeedback[] {
  return active(notes).flatMap((n) => {
    const f = feedbackOf(n);
    if (!f || f.look !== slot || n.status !== "confirmed" || f.scope === "session") return [];
    const about = n.details.find((d) => d.name === "about")?.value.trim() ?? "";
    return [{ id: n.id, version: n.version, text: n.text, act: f.act, scope: f.scope, items: f.items, about }];
  });
}

const asksForChange = (l: LookFeedback) => l.act === "change" || l.act === "dislike";

/** Every line a revision of this look must answer to, as "id:version": the next revision starts when this changes. */
export const seenOf = (lines: LookFeedback[]) => lines.filter(asksForChange).map((l) => `${l.id}:${l.version}`);

/** The change and dislike lines a look hasn't been revised for yet: Keep on its own changes nothing (Q1). */
export const pendingFeedback = (lines: LookFeedback[], seen: string[]) => lines.filter((l) => asksForChange(l) && !seen.includes(`${l.id}:${l.version}`));

/** All the lines on a look, keep included: if they change while it's revised, the revision starts again (R52). */
export const feedbackKey = (lines: LookFeedback[]) =>
  lines
    .map((l) => `${l.id}:${l.version}`)
    .sort()
    .join(",");

/** Products turned down in a look ("not these shoes"): never brought back to it this session, unless kept since (R48). */
export function turnedDownIn(lines: LookFeedback[]): Set<string> {
  const keep = new Set(lines.filter((l) => l.act === "keep").flatMap((l) => l.items));
  return new Set(
    lines
      .filter((l) => asksForChange(l) && l.scope === "item")
      .flatMap((l) => l.items)
      .filter((id) => !keep.has(id)),
  );
}

const refId = (ref: LookItem) => (ref.kind === "product" ? ref.productId : ref.kind === "photo" ? ref.photoId : ref.itemId);

/** A detail asked for, for the kind of piece it was said about: plain code tests it where the catalog records it. */
export type Wish = { group: Group; about: string; test: ((p: Product) => boolean) | null; words: string };

/**
 * A detail that can be measured on a product, such as a heel height compared with the piece it replaces,
 * or a closed toe. Null when the catalog doesn't record it: then only the judgment step checks it.
 */
export function detailTest(about: string, old: Product | null): ((p: Product) => boolean) | null {
  const a = about.toLowerCase();
  const tests: ((p: Product) => boolean)[] = [];
  const heel = old?.details.heelCm;
  if (/\b(lower|shorter|smaller|low|flat|flats)\b/.test(a) && /\b(heel|heels|flat|flats)\b/.test(a))
    tests.push((p) => p.details.heelCm !== undefined && (heel !== undefined && heel > 0 ? p.details.heelCm < heel : p.details.heelCm <= 3));
  else if (/\b(higher|taller|high)\b/.test(a) && /\bheels?\b/.test(a)) tests.push((p) => p.details.heelCm !== undefined && p.details.heelCm > (heel ?? 5));
  if (/\bclosed[- ]?toe/.test(a)) tests.push((p) => p.details.toe === "closed");
  else if (/\b(open|peep)[- ]?toe/.test(a)) tests.push((p) => p.details.toe === "open");
  if (/\b(sleeves|sleeved|long[- ]sleeve|longer sleeves)\b/.test(a) && !/sleeveless/.test(a)) tests.push((p) => Boolean(p.details.sleeve) && p.details.sleeve !== "sleeveless");
  return tests.length ? (p) => tests.every((t) => t(p)) : null;
}

/** What a revision of a look must do. */
export type RevisionPlan = {
  /** Ids of the pieces to keep. */
  keep: Set<string>;
  /** The places in the look of the pieces to replace. */
  change: number[];
  /** Products turned down in this look: never brought back to it this session ("not these shoes", R48). */
  turnedDown: Set<string>;
  /** Details asked for, by kind of piece, from every change line on the look, so later rounds keep them. */
  wishes: Wish[];
  /** A change to the whole look ("I don't like this look", "make it more formal"): the builder makes a new one. */
  whole: boolean;
  /** The details asked this time, for the change summary ("lower heel"). */
  asked: string[];
  /** For the judgment step: what the shopper asked of this look, in words. */
  notes: string[];
};

/**
 * What a revision of `items` must do, from the look's feedback lines (`lines`, all confirmed) and those
 * it hasn't been revised for yet (`pending`). `product` finds a product by id, for pieces no longer in
 * the look. Kept pieces always stay, even if a change names them too.
 */
export function revisionPlan(items: ResolvedItem[], lines: LookFeedback[], pending: LookFeedback[], product: (id: string) => Product | null): RevisionPlan {
  const keep = new Set(lines.filter((l) => l.act === "keep").flatMap((l) => l.items));
  const ids = items.map((i) => refId(i.ref));
  const turnedDown = turnedDownIn(lines);
  const change = new Set<number>();
  let whole = false;
  for (const l of pending) {
    const named = l.items.filter((id) => ids.includes(id) && !keep.has(id));
    if (l.scope === "look" || (!named.length && l.about && !l.items.some((id) => keep.has(id)))) whole = true;
    for (const id of named) change.add(ids.indexOf(id));
  }
  const wishes: Wish[] = [];
  const notes: string[] = [];
  for (const l of lines.filter(asksForChange)) {
    const old = l.items.map((id) => items.find((i) => refId(i.ref) === id) ?? null).find(Boolean) ?? null;
    const oldProduct = old && "product" in old ? old.product : (l.items.map(product).find(Boolean) ?? null);
    const name = old ? nameOf(old) : oldProduct?.name;
    if (l.about) {
      const group = old ? groupOf(old) : oldProduct ? groupOf({ ref: { kind: "product", productId: oldProduct.id }, product: oldProduct }) : "other";
      const heel = oldProduct?.details.heelCm;
      const than = name ? ` than the ${name}${heel !== undefined && /heel/i.test(l.about) ? ` (heel ${heel} cm)` : ""}` : "";
      const words = /\b(lower|higher|shorter|longer|smaller|bigger|more|less)\b/i.test(l.about) ? `${l.about}${than}` : l.about;
      wishes.push({ group, about: l.about, test: detailTest(l.about, oldProduct), words });
      notes.push(`For this look, the shopper asked: ${words}`);
    } else if (name && l.scope === "item") notes.push(`For this look, the shopper turned down the ${name}`);
    else notes.push(`For this look, the shopper said: ${l.text}`);
  }
  if (whole) change.clear();
  const asked = pending.flatMap((l) => (l.about ? [l.about.replace(/\.$/, "")] : []));
  return { keep, change: [...change].sort((a, b) => a - b), turnedDown, wishes, whole, asked, notes };
}

/** Whether a product meets the details asked for its kind of piece. */
export const meetsWishes = (p: Product, group: Group, wishes: Wish[]) => wishes.every((w) => w.group !== group || !w.test || w.test(p));

/**
 * The change summary above a revised look (R50, design 4.3): "Changed: Black stiletto pumps to Tan
 * block-heel sandals (you asked for lower heel). Kept: Emerald satin midi dress and Gold clutch. New
 * total: $298, $52 under your $350 limit."
 */
export function changeSummary(before: ResolvedItem[], after: ResolvedItem[], total: LookTotal, asked: string[]): string {
  const key = (i: ResolvedItem) => JSON.stringify(i.ref);
  const was = new Set(before.map(key));
  const now = new Set(after.map(key));
  const gone = before.filter((i) => !now.has(key(i)));
  const added = after.filter((i) => !was.has(key(i)));
  const kept = after.filter((i) => was.has(key(i)));
  const changes: string[] = [];
  for (const old of gone) {
    const next = added.find((i) => groupOf(i) === groupOf(old));
    if (next) {
      added.splice(added.indexOf(next), 1);
      changes.push(`${nameOf(old)} to ${nameOf(next)}`);
    } else changes.push(`left out the ${nameOf(old)}`);
  }
  for (const i of added) changes.push(`added the ${nameOf(i)}`);
  const why = asked.length ? ` (you asked for ${list(asked.map((a) => a.charAt(0).toLowerCase() + a.slice(1)), "and")})` : "";
  const parts = [`Changed: ${changes.length ? list(changes, "and") : "nothing"}${why}.`];
  if (kept.length) parts.push(`Kept: ${list(kept.map(nameOf), "and")}.`);
  parts.push(`New total: ${dollars(total.totalCents)}${total.comparison ? `, ${total.comparison}` : ""}.`);
  return parts.join(" ");
}

/** "No other shoes fit everything you've asked for (lower heel), so these stay." when no revision passes. */
export function nothingFits(items: ResolvedItem[], plan: RevisionPlan): string {
  if (plan.whole || !plan.change.length) return "No other look fits everything you've asked for, so this one stays.";
  const groups = [...new Set(plan.change.map((i) => groupOf(items[i])))];
  const WORDS: Partial<Record<Group, string>> = { outer: "jacket", bottom: "trousers or skirt", other: "piece" };
  const what = groups.length === 1 ? (WORDS[groups[0]] ?? groups[0]) : "pieces";
  const plural = what === "shoes" || what === "pieces" || what === "trousers or skirt";
  const asked = plan.asked.length ? ` (${list(plan.asked.map((a) => a.toLowerCase()), "and")})` : "";
  return `No other ${what} ${plural ? "fit" : "fits"} everything you've asked for${asked}, so ${plural ? "these stay" : "this one stays"}.`;
}
