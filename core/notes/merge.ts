import { active, type Detail, type Note, NOTE_CAP, type NoteChanges, type NoteKind } from "./types";

// Latest word wins (R22, tech spec 5, pattern 5). Readings can finish out of order, so each one
// carries the sequence number its words arrived with, and only changes notes nothing newer has
// touched: a later spoken correction, or a confirm or remove by touch, always beats it. Removed
// notes never come back, and a confirmed note is never dropped by a reading (Sabine, 19 Oct 2026).

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9$ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Words that don't tell two notes apart ("Navy, preferred" and "Emerald green, preferred").
const COMMON = new Set(
  "a an the and or but not no nothing never too very for with of in on at to my her his their this that some something maybe like likes want wants prefer preferred owns owned own avoid wear wears worn usually".split(
    " ",
  ),
);
const keyWords = (s: string) => norm(s).split(" ").filter((w) => (w.length > 2 || /[0-9]/.test(w)) && !COMMON.has(w));
const shareWord = (a: string, b: string) => keyWords(a).some((w) => keyWords(b).includes(w));
const negative = (s: string) => /\b(not|no|nothing|never|avoid)\b/.test(norm(s));
/** Every describing word of `small` is in `big`, and both say yes or both say no ("Navy" isn't in "Not navy"). */
function within(small: string, big: string) {
  const words = keyWords(small);
  return words.length > 0 && negative(small) === negative(big) && words.every((w) => keyWords(big).includes(w));
}

const sameDetails = (a: Detail[], b: Detail[]) =>
  a.length === b.length && a.every((d) => b.some((e) => e.name === d.name && e.value === d.value));

export type Merged = { notes: Note[]; changed: Note[] };

/**
 * `seen` lists the notes the reading was shown. Readings overlap, so another reading may have jotted
 * the same idea in other words meanwhile: an add matching a note of the same kind it never saw, by a
 * describing word, changes that note instead, and only if this reading's words are newer.
 */
export function mergeNotes(
  notes: Note[],
  changes: NoteChanges,
  seq: number,
  cap = NOTE_CAP,
  newId = () => crypto.randomUUID(),
  seen?: ReadonlySet<string>,
): Merged {
  const byId = new Map(notes.map((n) => [n.id, { ...n, details: [...n.details] }]));
  const changed = new Map<string, Note>();
  // Nothing newer than this reading has changed the note. The reading may keep changing a note it
  // changed itself (same sequence, by voice); a touch stamped with the same sequence still wins.
  const fresh = (n: Note) => n.changedSeq < seq || (n.changedSeq === seq && n.source === "voice");
  const mark = (n: Note) => {
    n.version += 1;
    n.changedSeq = seq;
    n.source = "voice";
    changed.set(n.id, n);
  };

  function update(n: Note, text: string, status: Note["status"], details: Detail[]) {
    if (n.removed || !fresh(n)) return;
    const next = text.trim() || n.text;
    if (next === n.text && status === n.status && sameDetails(details, n.details)) return;
    n.text = next;
    n.status = status;
    n.details = details;
    mark(n);
  }

  for (const u of changes.update) {
    const n = byId.get(u.id);
    if (n) update(n, u.text, u.status, u.details);
  }

  for (const id of changes.remove) {
    const n = byId.get(id);
    if (!n || n.removed || !fresh(n) || n.status === "confirmed") continue;
    n.removed = true;
    mark(n);
  }

  const added = new Set<string>();
  for (const a of changes.add) {
    const text = a.text.trim();
    if (!text) continue;
    const all = [...byId.values()];
    // Never bring back a note the shopper removed by touch, and never let a reading of older words
    // bring back one removed by voice (a newer reading may, after a merge).
    if (all.some((n) => n.removed && norm(n.text) === norm(text) && (n.source === "touch" || seq <= n.changedSeq))) continue;
    // The same idea again keeps the note's wording; a second budget is a correction of the first.
    if (active(all).some((n) => norm(n.text) === norm(text))) continue;
    const twin = seen && active(all).find((n) => !seen.has(n.id) && !added.has(n.id) && n.kind === a.kind && shareWord(n.text, text));
    if (twin) {
      update(twin, text, twin.status, a.details);
      continue;
    }
    // An idea already noted, in more words: "November" next to "Outdoor wedding, November", or
    // "Relaxed" next to "Relaxed but put together". A date or season folds into a note of any kind.
    // Budgets are left to the budget rule below.
    if (a.kind !== "budget") {
      const fits = (n: Note, kind: NoteKind) => n.kind !== "budget" && (kind === "timing" || n.kind === a.kind);
      if (active(all).some((n) => fits(n, a.kind) && within(text, n.text))) continue;
      // The same idea in fewer words: the fuller note takes its place, keeping its status.
      const shorter = active(all).find((n) => !added.has(n.id) && fits(n, n.kind) && within(n.text, text));
      if (shorter) {
        if (fresh(shorter)) {
          shorter.kind = a.kind;
          shorter.text = text;
          if (a.details.length) shorter.details = a.details;
          mark(shorter);
        }
        continue;
      }
    }
    const budget = a.kind === "budget" ? active(all).find((n) => n.kind === "budget") : undefined;
    if (budget) {
      // A clear correction keeps the note's status (Sabine's answer to Q1 in 2c).
      update(budget, text, budget.status, a.details.length ? a.details : budget.details);
      continue;
    }
    // The cap keeps one place for the budget, which plain code adds whenever it's said.
    const others = active(all).filter((n) => n.kind !== "budget").length;
    if (a.kind !== "budget" && others >= cap - 1) continue;
    const n: Note = { id: newId(), kind: a.kind, text, status: a.status, details: a.details, source: "voice", changedSeq: seq, version: 1, removed: false };
    byId.set(n.id, n);
    added.add(n.id);
    changed.set(n.id, n);
  }

  return { notes: [...byId.values()], changed: [...changed.values()] };
}

export type TouchAction = "confirm" | "remove" | "restore";

/**
 * Confirm, Remove or Undo by touch (R20). It's stamped with the session's current sequence, so any
 * reading of words heard before the tap can no longer change the note.
 */
export function touchNote(notes: Note[], id: string, action: TouchAction, seq: number): Merged {
  const byId = new Map(notes.map((n) => [n.id, { ...n }]));
  const n = byId.get(id);
  if (!n) return { notes, changed: [] };
  if (action === "confirm" && (n.removed || n.status === "confirmed")) return { notes, changed: [] };
  if (action === "remove" && n.removed) return { notes, changed: [] };
  if (action === "restore" && !n.removed) return { notes, changed: [] };
  if (action === "confirm") n.status = "confirmed";
  if (action === "remove") n.removed = true;
  if (action === "restore") n.removed = false;
  n.version += 1;
  n.changedSeq = Math.max(n.changedSeq, seq);
  n.source = "touch";
  return { notes: [...byId.values()], changed: [n] };
}
