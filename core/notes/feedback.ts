import { type Detail, FEEDBACK_CAP, type FeedbackAct, type FeedbackInfo, type FeedbackScope, type Note } from "./types";

// Feedback on a look (5a; R46, R47, Sabine's answer to Q1 in 5a): kept as notes of the "feedback" kind,
// so Confirm, Remove, Undo, voice corrections and latest word wins work as they do for notes. Its hidden
// details say which look (its place on screen, 1 to 3), which items (product, photo or wardrobe ids),
// what to do with them, and the scope ("not these shoes" against "no high heels at all", R48). 5a only
// records it; revising the look from it is 5b. Pure rules, tested in tests/feedback.test.ts.

const ACTS: FeedbackAct[] = ["keep", "change", "like", "dislike"];
const SCOPES: FeedbackScope[] = ["item", "look", "session"];

const detail = (details: Detail[], name: string) => details.find((d) => d.name === name)?.value ?? "";

/** What a feedback note is about, or null for any other note (or a feedback note missing its look). */
export function feedbackOf(note: Pick<Note, "kind" | "details">): FeedbackInfo | null {
  if (note.kind !== "feedback") return null;
  const look = Number(detail(note.details, "look"));
  if (!Number.isInteger(look) || look < 1) return null;
  const act = detail(note.details, "act") as FeedbackAct;
  const scope = detail(note.details, "scope") as FeedbackScope;
  return {
    look,
    items: detail(note.details, "items").split(",").map((s) => s.trim()).filter(Boolean),
    act: ACTS.includes(act) ? act : "change",
    scope: SCOPES.includes(scope) ? scope : "item",
  };
}

/** The hidden details of a feedback note. */
export function feedbackDetails(f: FeedbackInfo, about?: string): Detail[] {
  const out: Detail[] = [
    { name: "look", value: String(f.look) },
    { name: "items", value: f.items.join(",") },
    { name: "act", value: f.act },
    { name: "scope", value: f.scope },
  ];
  if (about?.trim()) out.push({ name: "about", value: about.trim() });
  return out;
}

export const isFeedback = (n: Pick<Note, "kind">) => n.kind === "feedback";

/** "Keep the dress", "Change the shoes": the line a tap on Keep or Change jots (Sabine's answer to Q3 in 5a). */
export const touchLine = (act: "keep" | "change", name: string) => `${act === "keep" ? "Keep" : "Change"} the ${name.charAt(0).toLowerCase()}${name.slice(1)}`;

/** Keep or Change pressed (true) or released (false) on one item of a look (5a). */
export type FeedbackTouch = {
  look: number;
  item: string;
  act: "keep" | "change";
  on: boolean;
  /** Every item's name in the look, for rewording a line that loses one of its items. */
  names: Record<string, string>;
};

/**
 * Keep and Change by touch (R46, Sabine's answer to Q3 in 5a): pressing one jots its line in ink, as if
 * said, and takes the item out of any line saying the other; releasing it takes the item out of its line.
 * A line left with no items is removed. Stamped like a touch on a note, so readings of older words can't
 * undo it (R22).
 */
export function touchFeedback(notes: Note[], t: FeedbackTouch, seq: number, newId = () => crypto.randomUUID()): { notes: Note[]; changed: Note[] } {
  const byId = new Map(notes.map((n) => [n.id, { ...n, details: [...n.details] }]));
  const changed = new Map<string, Note>();
  const stamp = (n: Note) => {
    n.version += 1;
    n.changedSeq = Math.max(n.changedSeq, seq);
    n.source = "touch";
    changed.set(n.id, n);
  };
  const lines = [...byId.values()].filter((n) => {
    const f = feedbackOf(n);
    return !n.removed && f?.look === t.look && (f.act === "keep" || f.act === "change") && f.items.includes(t.item);
  });
  let already = false;
  for (const n of lines) {
    const f = feedbackOf(n)!;
    if (f.act === t.act && t.on) {
      already = true;
      continue;
    }
    if (f.act !== t.act && !t.on) continue;
    const rest = f.items.filter((i) => i !== t.item);
    if (!rest.length) n.removed = true;
    else {
      n.details = feedbackDetails({ ...f, items: rest }, n.details.find((d) => d.name === "about")?.value);
      n.text = touchLine(f.act as "keep" | "change", joinNames(rest.map((i) => t.names[i] ?? "piece")));
    }
    stamp(n);
  }
  const count = [...byId.values()].filter((n) => !n.removed && isFeedback(n)).length;
  if (t.on && !already && count < FEEDBACK_CAP) {
    const n: Note = {
      id: newId(),
      kind: "feedback",
      text: touchLine(t.act, t.names[t.item] ?? "piece"),
      status: "confirmed",
      details: feedbackDetails({ look: t.look, items: [t.item], act: t.act, scope: "item" }),
      source: "touch",
      changedSeq: seq,
      version: 1,
      removed: false,
    };
    byId.set(n.id, n);
    changed.set(n.id, n);
  }
  return { notes: [...byId.values()], changed: [...changed.values()] };
}

/** "dress", "dress and bag", "dress, shoes and bag". */
function joinNames(names: string[]) {
  const lower = names.map((n) => n.charAt(0).toLowerCase() + n.slice(1));
  return lower.length < 2 ? (lower[0] ?? "") : `${lower.slice(0, -1).join(", ")} and ${lower.at(-1)}`;
}
