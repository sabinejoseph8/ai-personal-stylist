import { shareWord } from "./merge";
import { active, KINDS, type Note, NOTE_CAP, type NextQuestion, type NoteChanges, type NoteKind } from "./types";

// The notes reader (R15 to R19, tech spec 4.4): Claude Haiku 5.5 at low effort reads the shopper's words
// and returns only what changed in the notebook, plus the one useful question to ask next. Money is
// left to plain code (plain.ts). Claude is passed in as `ask`, so the core imports no outside service.

export const SYSTEM = `You are a personal stylist jotting notes while a shopper talks. Their words may stop mid-sentence.

You keep a notebook of short notes in your own words, like a stylist's notebook. For "I'm going to an outdoor wedding in November. I'd like something elegant, preferably emerald green", the notebook holds:
- "Outdoor wedding, November" (kind occasion)
- "Elegant" (kind style)
- "Emerald green, preferred" (kind colors)

Return only the changes to the notebook since the notes you're given, with short keys:
- add: new ideas that aren't in the notebook yet, each {k: kind, t: text, d: details}. New notes are always to confirm.
- update: a note the shopper changed, added to or confirmed, each {i: its id, t: full new text, s: status, d: details}.
- remove: ids of notes the shopper took back ("forget the green").
- q: the next question, {t: text, o: options}.
- If nothing changed, return empty lists. Never add an idea that's already noted.

What to jot:
- Only what helps choose outfits: the occasion, the timing, the setting, colors to wear or avoid, style, outfit type, items they own, fit and comfort needs.
- One idea per note, a few words each. Never quote the shopper word for word. Keep the describing words that matter: "outdoor wedding", "black tie charity dinner".
- An event and its date together are one note: "Outdoor wedding, November". Related details merge into one note rather than two.
- Colors to avoid: "Not black". Items they own: "Owns a camel coat".
- Don't jot budgets: the app reads money itself.
- Don't jot the shopper's questions ("Is denim OK at a black tie party?"), chit-chat, or anything not about their outfit.
- Never guess. If the shopper hasn't said something, there is no note for it. Never jot an outfit type unless they said one.
- The notebook holds at most ${NOTE_CAP} notes. When it's nearly full, update or merge notes instead of adding.

Status (s): "p" for to confirm (pencil), "c" for confirmed (ink).
- A clear correction ("actually, make it navy") updates the note and keeps its current status. An unclear or conflicting correction sets "p".
- "c" only when the shopper clearly confirms that note, for example "yes, that's right" after you asked about it.
- Keep the wording of notes that haven't changed. Never reword a note just to tidy it.

Details (d): the facts behind each note for building and checking outfits, as short "name=value" strings, for example "event=wedding", "setting=outdoor", "month=november", "prefer=emerald green", "avoid=black", "outfit=pantsuit".

The question (q): the one most useful thing to ask next, only when a missing or unclear detail matters for the next look, for example "Dress or pantsuit?" when the outfit type isn't known for a wedding. Give 2 or 3 short options when the answer has clear choices, such as "Dress", "Pantsuit", "Not sure yet". Never ask about something already noted. Use an empty text when there's nothing to ask.`;

// Short keys keep Claude's answer small, which is most of a reading's time (measured in 2c).
const details = { type: "array", items: { type: "string" } };

export const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    add: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { k: { type: "string", enum: KINDS }, t: { type: "string" }, d: details },
        required: ["k", "t", "d"],
      },
    },
    update: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { i: { type: "string" }, t: { type: "string" }, s: { type: "string", enum: ["p", "c"] }, d: details },
        required: ["i", "t", "s", "d"],
      },
    },
    remove: { type: "array", items: { type: "string" } },
    q: {
      type: "object",
      additionalProperties: false,
      properties: { t: { type: "string" }, o: { type: "array", items: { type: "string" } } },
      required: ["t", "o"],
    },
  },
  required: ["add", "update", "remove", "q"],
};

export type AskResult = { data: unknown | null; costUsd: number };
/** One structured call to Claude. Null data means refused, cut off or unreadable: notes pause (R25). */
export type Ask = (request: { system: string; user: string; schema: object; maxTokens: number }) => Promise<AskResult>;

export type ReaderInput = {
  /** What the stylist last said, so short answers like "the pantsuit" make sense. */
  stylistSaid: string;
  /** The shopper's words in this turn so far. */
  words: string;
  notes: Note[];
};

export type Reading = { changes: NoteChanges; question: NextQuestion; costUsd: number };

export interface NotesReader {
  read(input: ReaderInput): Promise<Reading | null>;
}

type Raw = {
  add: { k: NoteKind; t: string; d: string[] }[];
  update: { i: string; t: string; s: "p" | "c"; d: string[] }[];
  remove: string[];
  q: { t: string; o: string[] };
};

/** "month=november" to { name: "month", value: "november" }. */
const toDetails = (d: string[]) =>
  d.flatMap((pair) => {
    const at = pair.indexOf("=");
    return at > 0 ? [{ name: pair.slice(0, at).trim(), value: pair.slice(at + 1).trim() }] : [];
  });

/** The question, tidied: one short question with at most 3 short options, or none. */
export function cleanQuestion(q: { text: string; options: string[] } | undefined): NextQuestion {
  const text = q?.text?.trim() ?? "";
  if (!text || text.length > 120) return null;
  const options = (q?.options ?? []).map((o) => o.trim()).filter((o) => o && o.length <= 30).slice(0, 3);
  return { text, options };
}

export function createNotesReader(ask: Ask): NotesReader {
  return {
    async read({ stylistSaid, words, notes }) {
      const live = active(notes);
      // Short ids keep the prompt small and stop Claude inventing ids.
      const shortIds = new Map(live.map((n, i) => [`n${i + 1}`, n.id]));
      const lines = live.map((n, i) => `- n${i + 1} [${n.kind}, ${n.status === "confirmed" ? "confirmed" : "to confirm"}]: ${n.text}`);
      const removed = notes.filter((n) => n.removed).map((n) => `- ${n.text}`);
      const user = [
        stylistSaid ? `You last said: "${stylistSaid}"` : "",
        `The shopper is saying: "${words}"`,
        `The notebook (${live.length} of at most ${NOTE_CAP} notes):\n${lines.length ? lines.join("\n") : "(empty)"}`,
        removed.length ? `Removed by the shopper, never jot again:\n${removed.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const { data, costUsd } = await ask({ system: SYSTEM, user, schema: SCHEMA, maxTokens: 1200 });
      if (!data) return null;
      const raw = data as Raw;
      const real = (id: string) => shortIds.get(id);
      const isBudget = (id: string) => live.find((n) => n.id === id)?.kind === "budget";
      // Ink by voice only answers the stylist's question about that note ("So a garden party in May,
      // is that right?" "Yes"), so a note isn't confirmed just because the shopper mentioned it (R16).
      // Her greeting is a question too, so the question has to name the note (Phase 2 review).
      const askedAbout = (note: Note) => stylistSaid.includes("?") && shareWord(note.text, stylistSaid);
      const status = (id: string, s: "p" | "c") => {
        const note = live.find((n) => n.id === id);
        return s === "c" && note && (note.status === "confirmed" || askedAbout(note)) ? ("confirmed" as const) : ("to_confirm" as const);
      };
      return {
        changes: {
          add: raw.add.filter((a) => a.k !== "budget").map((a) => ({ kind: a.k, text: a.t, status: "to_confirm" as const, details: toDetails(a.d) })),
          update: raw.update.flatMap((u) => {
            const id = real(u.i);
            return id && !isBudget(id) ? [{ id, text: u.t, status: status(id, u.s), details: toDetails(u.d) }] : [];
          }),
          remove: raw.remove.flatMap((id) => (real(id) && !isBudget(real(id)!) ? [real(id)!] : [])),
        },
        question: cleanQuestion({ text: raw.q.t, options: raw.q.o }),
        costUsd,
      };
    },
  };
}
