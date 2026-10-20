// My Styling Notes in words (2d): the one-line summary for the collapsed notebook and the pinned bar
// (R23, design 4.1 and 4.2), and what screen readers hear when notes change (R68). Pure rules, tested
// in tests/notebook.test.ts.

export type NotebookNote = { id: string; text: string; status: "to_confirm" | "confirmed" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "6 notes, 1 to confirm", "2 notes, all confirmed" or "No notes yet". */
export function notesSummary(notes: NotebookNote[]) {
  if (!notes.length) return "No notes yet";
  const toConfirm = notes.filter((n) => n.status === "to_confirm").length;
  return `${plural(notes.length, "note")}, ${toConfirm ? `${toConfirm} to confirm` : notes.length === 1 ? "confirmed" : "all confirmed"}`;
}

export type NoteChange = { change: "added" | "changed" | "confirmed" | "removed"; note: NotebookNote };

/** What changed between two versions of the notebook, in the order the notes appear. */
export function noteChanges(before: NotebookNote[], after: NotebookNote[]): NoteChange[] {
  const old = new Map(before.map((n) => [n.id, n]));
  const now = new Set(after.map((n) => n.id));
  const changes: NoteChange[] = [];
  for (const note of after) {
    const was = old.get(note.id);
    if (!was) changes.push({ change: "added", note });
    else if (was.text !== note.text) changes.push({ change: "changed", note });
    else if (was.status !== note.status && note.status === "confirmed") changes.push({ change: "confirmed", note });
  }
  for (const note of before) if (!now.has(note.id)) changes.push({ change: "removed", note });
  return changes;
}

// "Budget: up to $350" reads as "Budget up to $350".
const spoken = (text: string) => text.replace(/:\s*/g, " ").trim();
const status = (note: NotebookNote) => (note.status === "confirmed" ? "confirmed" : "to confirm");

/**
 * One polite announcement for a set of changes: a single change in full ("Noted: Budget up to $350,
 * confirmed."), several grouped ("3 notes added, 1 changed"), so it never talks over the conversation.
 */
export function announcement(changes: NoteChange[]) {
  if (!changes.length) return "";
  if (changes.length === 1) {
    const { change, note } = changes[0];
    if (change === "added") return `Noted: ${spoken(note.text)}, ${status(note)}.`;
    if (change === "changed") return `Changed: ${spoken(note.text)}, ${status(note)}.`;
    if (change === "confirmed") return `Confirmed: ${spoken(note.text)}.`;
    return `Removed: ${spoken(note.text)}.`;
  }
  // "3 notes added, 1 changed": the first part says "notes", the rest just count.
  const order: NoteChange["change"][] = ["added", "changed", "confirmed", "removed"];
  const parts = order
    .map((c) => [changes.filter((x) => x.change === c).length, c] as const)
    .filter(([n]) => n > 0)
    .map(([n, c], i) => (i === 0 ? `${plural(n, "note")} ${c}` : `${n} ${c}`));
  return parts.join(", ");
}
