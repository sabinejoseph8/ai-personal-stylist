import type { NotesReader } from "./reader";
import { active, type NewNote, type NextQuestion } from "./types";

// A fake notes reader for browser tests: simple word rules instead of Claude, so tests are free and
// the same every time. Only used when NOTES_READER=fake, never on the live site.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const MONTH = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

export function createFakeNotesReader(): NotesReader {
  return {
    async read({ words, notes }) {
      const text = words.toLowerCase();
      const found: NewNote[] = [];
      const add = (kind: NewNote["kind"], note: string) => found.push({ kind, text: note, status: "to_confirm", details: [] });

      const occasion = text.match(/\b(outdoor wedding|wedding|job interview|interview|birthday dinner|dinner|gala|party|brunch)\b/);
      if (occasion) {
        const month = words.match(MONTH)?.[1];
        add("occasion", month ? `${cap(occasion[1])}, ${cap(month.toLowerCase())}` : cap(occasion[1]));
      }
      for (const style of ["elegant", "relaxed", "smart", "classic", "polished"]) if (text.includes(style)) add("style", cap(style));
      const prefer = text.match(/preferably ([a-z]+(?: [a-z]+)?)/);
      if (prefer) add("colors", `${cap(prefer[1])}, preferred`);
      const avoid = text.match(/nothing (black|brown|bright)/);
      if (avoid) add("colors", `Not ${avoid[1]}`);
      const outfit = text.match(/\b(pantsuit|dress|suit|jumpsuit)\b/);
      if (outfit) add("outfit", cap(outfit[1]));

      const known = new Set(active(notes).map((n) => n.text.toLowerCase()));
      const hasOutfit = !!outfit || active(notes).some((n) => n.kind === "outfit");
      const hasOccasion = !!occasion || active(notes).some((n) => n.kind === "occasion");
      const question: NextQuestion = hasOccasion && !hasOutfit ? { text: "Dress or pantsuit?", options: ["Dress", "Pantsuit", "Not sure yet"] } : null;
      return {
        changes: { add: found.filter((n) => !known.has(n.text.toLowerCase())), update: [], remove: [] },
        question,
        costUsd: 0,
      };
    },
  };
}
