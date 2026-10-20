import type { NoteStatus } from "../notes/types";

// The item to style around (3b; R28 to R30): what the photo reader found in the shopper's photo, what
// they confirmed or corrected, and whether it's theirs. Pure rules, tested in tests/photo-item.test.ts.

export const DETAIL_NAMES = ["type", "colors", "pattern", "style"] as const;
export type DetailName = (typeof DETAIL_NAMES)[number];
/** A detail in ink (confirmed) or pencil (to confirm), like a note. */
export type ItemDetail = { value: string; status: NoteStatus };
export type PhotoItem = { name: string; details: Record<DetailName, ItemDetail> };

/**
 * What the photo reader made of the photo: still reading it, read, or couldn't read it. With several
 * items, `chosen` stays null until the shopper picks one (R29).
 */
export type PhotoReading = { state: "analyzing" | "read" | "failed"; items: PhotoItem[]; chosen: number | null; since?: string };
export type Ownership = "owned" | "inspiration" | null;
export type StyleItem = { reading: PhotoReading; ownership: Ownership };

/** A change by touch or voice: confirm details, correct them, pick one of several items, or say whose it is. */
export type ItemChange = { confirm?: DetailName[]; set?: { name: DetailName; value: string }[]; choose?: number; ownership?: "owned" | "inspiration" };

/** A reading that has waited this long was cut off (the server stopped), so it counts as failed. */
const ANALYZING_MS = 120_000;

export const ANALYZING: PhotoReading = { state: "analyzing", items: [], chosen: null };

/** The saved reading, or analyzing for a new photo. A reading cut off long ago counts as failed. */
export function savedReading(raw: unknown, now = Date.now()): PhotoReading {
  const r = raw as Partial<PhotoReading> | null;
  if (!r?.state) return ANALYZING;
  if (r.state === "analyzing" && r.since && now - Date.parse(r.since) > ANALYZING_MS) return { ...r, state: "failed", items: [], chosen: null } as PhotoReading;
  return { state: r.state, items: r.items ?? [], chosen: r.chosen ?? null, ...(r.since ? { since: r.since } : {}) };
}

/** The item being styled around: the only item, or the one the shopper chose. */
export const chosenItem = (r: PhotoReading): PhotoItem | null => (r.chosen !== null ? (r.items[r.chosen] ?? null) : null);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A corrected type or color also changes the item's name: "Navy wool blazer" with colors=black is "Black wool blazer". */
function renamed(name: string, old: string, value: string) {
  if (!old) return name;
  const at = name.toLowerCase().indexOf(old.toLowerCase());
  if (at < 0) return name;
  const next = `${name.slice(0, at)}${value}${name.slice(at + old.length)}`;
  return cap(next);
}

/** An item made from what the shopper said, when the photo couldn't be read (R32). */
function describedItem(set: { name: DetailName; value: string }[]): PhotoItem | null {
  const said = new Map(set.map((s) => [s.name, s.value]));
  if (!said.has("type")) return null;
  const details = Object.fromEntries(
    DETAIL_NAMES.map((n) => [n, said.has(n) ? { value: said.get(n)!, status: "confirmed" as const } : { value: "", status: "to_confirm" as const }]),
  ) as PhotoItem["details"];
  return { name: cap([said.get("colors"), said.get("type")].filter(Boolean).join(" ")), details };
}

/**
 * Applies a change by touch or voice. Corrections and confirmations go to the chosen item; what the
 * shopper says about a photo that couldn't be read becomes its item once they've said what it is.
 */
export function changeItem(item: StyleItem, change: ItemChange): StyleItem {
  let { reading, ownership } = item;
  if (change.ownership) ownership = change.ownership;
  if (change.choose !== undefined && reading.items[change.choose]) reading = { ...reading, chosen: change.choose };

  const set = (change.set ?? []).filter((s) => s.value.trim());
  if (reading.state === "failed" && set.length) {
    const described = describedItem(set);
    if (described) return { reading: { state: "read", items: [described], chosen: 0 }, ownership };
  }
  const chosen = chosenItem(reading);
  if (!chosen || (!set.length && !change.confirm?.length)) return { reading, ownership };

  const next: PhotoItem = { name: chosen.name, details: { ...chosen.details } };
  for (const name of change.confirm ?? []) if (next.details[name]?.value) next.details[name] = { ...next.details[name], status: "confirmed" };
  for (const { name, value } of set) {
    const old = next.details[name]?.value ?? "";
    // The shopper said it, so it's in ink.
    next.details[name] = { value: value.trim(), status: "confirmed" };
    if (name === "type" || name === "colors") next.name = renamed(next.name, old, value.trim());
  }
  const items = reading.items.map((it, i) => (i === reading.chosen ? next : it));
  return { reading: { ...reading, items }, ownership };
}

const detailWords = (item: PhotoItem) =>
  DETAIL_NAMES.filter((n) => item.details[n]?.value)
    .map((n) => `${n}=${item.details[n].value}${item.details[n].status === "to_confirm" ? " (to confirm)" : ""}`)
    .join(", ");
const ownershipWords = (o: Ownership) => (o === "owned" ? "theirs" : o === "inspiration" ? "an inspiration, not theirs" : "not confirmed yet");

/** The item in words, for the notes reader, with numbered items so "the first one" makes sense. */
export function itemForReader(item: StyleItem): string {
  const { reading } = item;
  if (reading.state === "analyzing") return "The shopper's photo is still being looked at.";
  if (reading.state === "failed" || !reading.items.length) return "The shopper's photo couldn't be read. They may describe the item instead.";
  const lines = reading.items.map((it, i) => `${i + 1}. ${it.name}: ${detailWords(it)}${i === reading.chosen ? " (chosen)" : ""}`);
  return [`Items in the shopper's photo${reading.chosen === null ? ", none chosen yet" : ""}:`, ...lines, `Ownership: ${ownershipWords(item.ownership)}`].join("\n");
}

/** The item in words for the stylist (R28 to R30), so what she says matches the photo's label. */
export function itemForStylist(item: StyleItem): string {
  const { reading } = item;
  if (reading.state === "analyzing") return "The shopper just added a photo of an item to style around. You're still looking at it.";
  if (reading.state === "failed" || !reading.items.length)
    return "The shopper added a photo of an item to style around, but you couldn't make it out. Ask them to describe it.";
  const chosen = chosenItem(reading);
  if (!chosen)
    return `The shopper's photo shows several items: ${reading.items.map((it, i) => `${i + 1}. ${it.name}`).join("; ")}. Ask which one to style around.`;
  const ask = item.ownership ? "" : " Ask whether it's theirs or an inspiration.";
  return `Style around this item, from the shopper's photo: ${chosen.name} (${detailWords(chosen)}). Ownership: ${ownershipWords(item.ownership)}.${ask}`;
}
