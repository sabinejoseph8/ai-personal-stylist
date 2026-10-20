import type { ItemChange } from "../photos/item";
import type { NotesReader } from "./reader";
import { active, type NewNote, type NextQuestion } from "./types";

// A fake notes reader for browser tests: simple word rules instead of Claude, so tests are free and
// the same every time. Only used when NOTES_READER=fake, never on the live site.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ORDER = ["first", "second", "third", "fourth"];

/** What the shopper said about the photo (3b): "it's mine", "an inspiration", "the second one", "actually it's black". */
function photoChange(text: string): ItemChange | undefined {
  const change: ItemChange = {};
  if (/\b(it's mine|it is mine|i own it)\b/.test(text)) change.ownership = "owned";
  if (/\binspiration\b/.test(text)) change.ownership = "inspiration";
  const which = text.match(/\bthe (first|second|third|fourth) one\b/);
  if (which) change.choose = ORDER.indexOf(which[1]);
  const color = text.match(/\bactually it's ([a-z]+)\b/);
  if (color) change.set = [{ name: "colors", value: color[1] }];
  const described = text.match(/\bit's a ([a-z]+) (blazer|dress|jacket|coat|skirt|shirt)\b/);
  if (described) change.set = [{ name: "type", value: described[2] }, { name: "colors", value: described[1] }];
  return Object.keys(change).length ? change : undefined;
}

const MONTH = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i;

export function createFakeNotesReader(): NotesReader {
  return {
    async read({ words, notes, item }) {
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
        ...(item ? { photo: photoChange(text) } : {}),
      };
    },
  };
}
