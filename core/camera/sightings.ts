import type { Sighting } from "./reader";

// What the camera has seen (R34): rules for the page, tested in tests/camera.test.ts. A single frame
// sometimes sees things that aren't there (Phase 0 found a quilted tote called a "quilted jacket"), so
// an item is named only when two frames in a row agree (tech spec 4.4).

/** An item two frames agreed on, or several items in view. */
export type Seen = { kind: "item"; name: string; type: string; color: string; sure: boolean } | { kind: "several" };

const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2);
const shareWord = (a: string, b: string) => !a || !b || words(a).some((w) => words(b).includes(w));

/** Two sightings of the same item: the same type, and colors with a word in common. */
export function sameItem(a: Sighting | Seen, b: Sighting | Seen) {
  return a.kind === "item" && b.kind === "item" && a.type === b.type && shareWord(a.color, b.color);
}

/**
 * What to show after a new frame, given the frame before it: an item when both frames saw it (sure only
 * if both were sure), several items when both saw several, otherwise nothing new.
 */
export function agreed(before: Sighting | null, now: Sighting): Seen | null {
  if (!before) return null;
  if (now.kind === "several" && before.kind === "several") return { kind: "several" };
  if (now.kind === "item" && before.kind === "item" && sameItem(before, now)) return { ...now, sure: before.sure && now.sure };
  return null;
}

/**
 * What the camera view shows after a frame: `shown` is the item (or several items) on screen, and `news`
 * says the stylist should hear about it: a new item, several items, or the item gone. The same item seen
 * again only loses its question mark once both frames are sure.
 */
export function nextSeen(shown: Seen | null, before: Sighting | null, now: Sighting): { shown: Seen | null; news: boolean } {
  const next = agreed(before, now);
  if (next) {
    const same = shown && shown.kind === next.kind && (next.kind === "several" || sameItem(shown, next));
    if (!same) return { shown: next, news: true };
    if (shown.kind === "item" && next.kind === "item" && next.sure && !shown.sure) return { shown: { ...shown, sure: true }, news: false };
    return { shown, news: false };
  }
  if (now.kind === "none" && before?.kind === "none" && shown) return { shown: null, news: true };
  return { shown, news: false };
}

/** The name shown on the camera view: "Navy wool blazer?" when the reader isn't sure (design 4.1). */
export const seenLabel = (seen: Seen) => (seen.kind === "several" ? "Several items" : `${seen.name}${seen.sure ? "" : "?"}`);

// "Use this one" takes the still (R34), heard by plain code while the camera is on (Sabine's answer to
// Q1 in 3c). Only clear requests count (her decision A in 3e), so everyday sentences such as "I'd use
// that for work" or "I'm not sure about this one" don't take a still. But speech recognition writes a
// short phrase in many ways ("Use, this one", "Juice this one", "Yes, this one"): on Sabine's iPhone the
// exact words of decision A did nothing, so punctuation and capitals don't matter, and a short phrase
// with "this one" or "that one" counts too (her decision D in 3e).
const CAPTURE = /\b(use (this|that) (one|1)|use this|capture|take (a|the) (picture|photo))\b/;
const THIS_ONE = /\b(this|that) (one|1)\b/;
/** "Yes, this one" or "OK, that one please", but not "I'm not sure about this one". */
const SHORT_PHRASE_WORDS = 4;

/** The words as plain lowercase words, without punctuation. */
const plainWords = (words: string) => words.toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();

/**
 * Whether the shopper's words ask to capture what's on camera. A short phrase counts only once the words
 * are final, since it may be the start of a longer sentence ("this one is too long").
 */
export function asksToCapture(words: string, final = true) {
  const said = plainWords(words);
  if (CAPTURE.test(said)) return true;
  return final && THIS_ONE.test(said) && said.split(" ").length <= SHORT_PHRASE_WORDS;
}

/**
 * How long "use this one" still counts after an item was last on screen, and how long it waits for a
 * name. On Sabine's iPhone (3c) it did nothing: holding an item up while talking, two unclear frames can
 * clear the name just as the shopper speaks, and the words can come just before the name appears.
 */
export const CAPTURE_GRACE_MS = 8000;

/** Whether "use this one" takes the still now, waits for an item to be named, or does nothing because the camera is off. */
export function whenToCapture(now: number, camera: { on: boolean; itemShown: boolean; lastItemAt: number }): "now" | "wait" | "no" {
  if (!camera.on) return "no";
  if (camera.itemShown || now - camera.lastItemAt <= CAPTURE_GRACE_MS) return "now";
  return "wait";
}

export type CameraNote = { seen: Seen | null; blocked: boolean } | null;

/** What the stylist is told about the camera (R34, R35), or nothing while it's off. */
export function cameraForStylist(camera: CameraNote): string {
  if (!camera) return "";
  if (camera.blocked)
    return "The shopper's camera is blocked or there isn't one. Suggest uploading a photo instead, with Upload photo or Add a photo in My Styling Notes.";
  const seen = camera.seen;
  if (!seen) return "The shopper's camera is on. They're about to hold up an item to show you.";
  if (seen.kind === "several") return "The shopper's camera shows several items. Ask which one they mean.";
  return `On the shopper's camera now: ${seen.name}${seen.sure ? "" : " (you're not sure)"}. Name it out loud in a few words, ask about anything you're unsure of, and tell them to tap Capture or say "use this one" to add it to their notes.`;
}
