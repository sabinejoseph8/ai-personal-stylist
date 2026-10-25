import type { NoteStatus } from "../notes/types";
import { chosenItem, DETAIL_NAMES, type StyleItem } from "../photos/item";
import type { LeftOut } from "./candidates";
import type { CheckReason } from "./checker";
import { REPEATS_SHOWN } from "./look";
import { list } from "./rules";

// Behind the scenes (4d, R72, design 4.4): what the stylist captured and how each look was checked, in
// plain words, made from the records the app already keeps (Sabine's answer to Q1 in 4d). A blocked
// look is only ever its one-line reason, never the look itself. No audio, words, video or photos.
// Plain code, tested in tests/behind-the-scenes.test.ts.

export type EntryKind = "products" | "captured" | "removed" | "photo" | "passed" | "blocked" | "swap" | "recheck" | "revision";
export type Entry = { at: string; kind: EntryKind; text: string };

/** `look` is the place of the look a feedback line is about (5a). */
export type NoteRecord = { text: string; status: NoteStatus; source: string; removed: boolean; at: string; look?: number | null };
export type PhotoRecord = { source: string; item: StyleItem; at: string };
/** A check of a look, with what the look was: built, a swap (the pieces' names), a revision (its summary, 5b), or checked again after a change. */
export type CheckRecord = {
  at: string;
  verdict: "pass" | "conflict" | "needs_clarification";
  reasons: CheckReason[];
  /** `number`: the look's place on screen now (Look 2 of 2), as the page names it; the slot otherwise (review batch 2, C13). */
  look: { name: string; slot: number | null; number?: number | null; shown: boolean; swap: { from: string; to: string } | null; revision?: string | null };
  /** This look had been checked before: this one is a check again after a change. */
  again: boolean;
};

const SOURCES: Record<string, string> = {
  photo: "From your photo",
  camera: "From your camera",
  profile: "From your profile",
};

/**
 * A note's source is how it last changed: notes come from what the shopper says, and one confirmed with
 * a tap is "touch" (2d).
 */
export function noteEntry(n: NoteRecord): Entry {
  if (n.removed) return { at: n.at, kind: "removed", text: `Removed by you: ${n.text}.` };
  if (n.look) {
    const sure = n.status !== "confirmed" ? "Not confirmed yet." : n.source === "touch" ? "Confirmed with a tap." : "Confirmed.";
    return { at: n.at, kind: "captured", text: `Feedback on Look ${n.look}: ${n.text}. ${sure}` };
  }
  const sure = n.status !== "confirmed" ? "Not confirmed yet." : n.source === "touch" ? "Confirmed by you with a tap." : "Confirmed by you.";
  return { at: n.at, kind: "captured", text: `Captured: ${n.text}. ${SOURCES[n.source] ?? "From what you said"}. ${sure}` };
}


export function photoEntry(p: PhotoRecord): Entry {
  const from = p.source === "camera" ? "your camera" : "your photo";
  const { reading, ownership } = p.item;
  const whose = ownership === "owned" ? "Yours." : ownership === "inspiration" ? "An inspiration, not yours." : "Whose it is: not said yet.";
  if (reading.state === "analyzing") return { at: p.at, kind: "photo", text: `Reading ${from}.` };
  if (reading.state === "failed" || !reading.items.length) return { at: p.at, kind: "photo", text: `Couldn't read ${from}, so you were asked to describe it.` };
  const item = chosenItem(reading);
  if (!item) return { at: p.at, kind: "photo", text: `Found ${reading.items.length} items in ${from}: ${list(reading.items.map((i) => i.name), "and")}. You haven't picked one yet.` };
  const sure = DETAIL_NAMES.filter((d) => item.details[d].value && item.details[d].status === "confirmed");
  const unsure = DETAIL_NAMES.filter((d) => item.details[d].value && item.details[d].status !== "confirmed");
  const certainty = [sure.length ? `Sure: ${list(sure, "and")}.` : "", unsure.length ? `To confirm: ${list(unsure, "and")}.` : ""].filter(Boolean).join(" ");
  return { at: p.at, kind: "photo", text: `Read from ${from}: ${item.name}. ${certainty} ${whose}`.replace(/\s+/g, " ") };
}

/** What a passed check held to, in its own words: "Never: high heels; your budget; Outdoor wedding, November". */
function met(reasons: CheckReason[]) {
  const words = reasons
    .filter((r) => r.ok && r.about !== "Outfit")
    .map((r) => (r.about === "Budget" ? "your budget" : r.about === "Your item to style around" ? "includes your own item" : r.about));
  return [...new Set(words)].join("; ");
}

/** Why a check failed, in one line: never the look itself (R72). */
const failed = (reasons: CheckReason[]) =>
  reasons
    .filter((r) => !r.ok)
    .slice(0, 2)
    .map((r) => r.why.replace(/\.$/, ""))
    .join("; ") || "it couldn't be checked";

export function checkEntry(c: CheckRecord): Entry | null {
  const number = c.look.number ?? c.look.slot;
  const look = number ? `Look ${number}, ${c.look.name}` : c.look.name;
  const pass = c.verdict === "pass";
  if (c.again)
    return pass
      ? { at: c.at, kind: "recheck", text: `Checked again after your change: ${look} still meets everything.` }
      : { at: c.at, kind: "recheck", text: `Checked again after your change: ${look} no longer fits: ${failed(c.reasons)}. A new look takes its place.` };
  if (c.look.revision) {
    if (pass && c.look.shown) return { at: c.at, kind: "revision", text: `Revised Look ${number} from your feedback, and checked: ${c.look.revision}` };
    if (pass) return null;
  }
  if (c.look.swap) {
    const { from, to } = c.look.swap;
    return pass
      ? c.look.shown
        ? { at: c.at, kind: "swap", text: `Swap in Look ${number}: ${to} replaced ${from}, and passed the check.` }
        : null // checked at the same moment as the one that went in, and not needed
      : { at: c.at, kind: "swap", text: `Swap in Look ${number}: ${to} was checked and blocked: ${failed(c.reasons)}.` };
  }
  // A repeat of a look already shown was never judged, so it isn't news either.
  if (!pass && c.reasons.every((r) => r.ok || r.why === REPEATS_SHOWN)) return null;
  if (!pass) return { at: c.at, kind: "blocked", text: `Check blocked a candidate: ${failed(c.reasons)}.` };
  // A spare that passed but wasn't needed isn't news.
  if (!c.look.shown) return null;
  const meets = met(c.reasons);
  return { at: c.at, kind: "passed", text: `Check passed: ${look}.${meets ? ` It meets ${meets}.` : ""}` };
}

/** Which products could be used now (Sabine's answer to Q3 in 4d): "41 of 140 fit. Left out: 70 not womenswear; 12 over your budget". */
export function productsEntry(at: string, kept: number, total: number, leftOut: LeftOut[], department?: string): Entry {
  const counts = new Map<string, number>();
  for (const l of leftOut) {
    const why = l.kind === "budget" ? "over your budget" : l.kind === "size" ? "not in your size" : l.kind === "outfit" ? "not part of the outfit" : l.kind === "rule" && l.rule ? `for ${l.rule}` : l.reason.charAt(0).toLowerCase() + l.reason.slice(1);
    counts.set(why, (counts.get(why) ?? 0) + 1);
  }
  const left = [...counts].sort((a, b) => b[1] - a[1]).map(([why, n]) => `${n} ${why}`);
  return { at, kind: "products", text: `Right now ${kept} of ${total} ${department ? `${department} ` : ""}sample products fit everything you've asked for.${left.length ? ` Left out: ${left.join("; ")}.` : ""}` };
}

/** Every entry, newest first. */
export function behindTheScenes(input: {
  now: string;
  notes: NoteRecord[];
  photos: PhotoRecord[];
  checks: CheckRecord[];
  /** Which products fit now, out of the catalog for the shopper's department when there's one. */
  products: { kept: number; total: number; leftOut: LeftOut[]; department?: string } | null;
}): Entry[] {
  const entries = [
    ...input.notes.map(noteEntry),
    ...input.photos.map(photoEntry),
    ...input.checks.flatMap((c) => checkEntry(c) ?? []),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const p = input.products;
  return p ? [productsEntry(input.now, p.kept, p.total, p.leftOut, p.department), ...entries] : entries;
}
