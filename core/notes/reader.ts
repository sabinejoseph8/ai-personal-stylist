import type { Ask } from "../ask";
import type { FirmPreference } from "../looks/exceptions";
import type { Group } from "../looks/look";
import { SWAPPABLE } from "../looks/swap";
import { chosenItem, DETAIL_NAMES, type DetailName, type ItemChange, itemForReader, type StyleItem } from "../photos/item";
import { shareWord } from "./merge";
import { feedbackDetails, feedbackOf, isFeedback } from "./feedback";
import { active, type Detail, type FeedbackInfo, KINDS, type NewNote, type Note, NOTE_CAP, type NextQuestion, type NoteChanges, type NoteKind } from "./types";

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
        // Feedback (5a) is only offered to the reading at the end of a turn, which sees the looks.
        properties: { k: { type: "string", enum: KINDS.filter((k) => k !== "feedback") }, t: { type: "string" }, d: details },
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

/** One structured call to Claude (core/ask.ts). For notes, null data pauses them (R25). */
export type { Ask, AskResult } from "../ask";

// The photo to style around (3b, Sabine's answer to Q3): when there is one, the same reading also
// catches what the shopper says about it. Without a photo the prompt and answer are unchanged, so notes
// stay as quick as the 2c eval measured.
export const PHOTO_RULES = `

The shopper has added a photo of something to style around, described after the notebook. Changes to it go in p, never in notes:
- c: the number of the item the shopper picked to style around ("the first one", "the jacket"), otherwise 0.
- o: "m" only when they plainly say it's theirs ("it's mine", "I own it"), "i" when they say it isn't ("just an inspiration", "I saw it online"), otherwise "". Wanting to wear it doesn't say whose it is.
- d: details of it they stated or corrected, as name=value with the names type, colors, pattern and style: "it's black, not navy" gives "colors=black". If the photo couldn't be read and they describe the item, give its type and colors.
- k: names of details they confirmed when you asked about them ("yes, it's navy" gives "colors").
- Never jot a note about the photo's item itself, such as "Owns a navy blazer": the photo already shows it.`;

export const PHOTO_SCHEMA_PART = {
  type: "object",
  additionalProperties: false,
  properties: {
    c: { type: "integer" },
    o: { type: "string", enum: ["", "m", "i"] },
    d: { type: "array", items: { type: "string" } },
    k: { type: "array", items: { type: "string", enum: DETAIL_NAMES } },
  },
  required: ["c", "o", "d", "k"],
};

// Looks on screen (4c, 5a): at the end of a turn, the same reading also hears a request to swap a piece
// ("show me different shoes") and feedback on a look ("keep the dress and bag, lower heels"), so it's
// as forgiving of how speech is written as the notes are. It's told what's in each look, by short item
// codes. Without looks, the prompt and answer are unchanged.

/** A look as the notes reader sees it (5a): its number on screen, its place (1 to 3), and its items. */
export type LookForReader = { number: number; slot: number; name: string; items: { id: string; name: string; group: string; owned: boolean }[] };

export const LOOKS_RULES = `

The looks on the shopper's screen ({inView}):
{looks}

Feedback on a look: when the shopper reacts to a look, an item in it, or a detail (color, shape, length, formality, heel height), add a note with k "feedback": one short line in your words saying what to keep or change and its scope, such as "Keep the dress and bag", "Lower heels, this look only" or "No high heels in any look". Its details:
- look=N: the look it's about, the one they named, otherwise the one on their screen.
- items=i1,i3: the items it's about, by their codes above, or none for the whole look or a detail.
- act=keep, change, like or dislike.
- scope=item (these pieces in this look), look (this whole look) or session (every look from now on, such as "no high heels at all"; if the notebook already has that as a note, don't add it again).
- about=the detail, if any, such as "lower heel" or "closed toe".
- clear=yes when it's clear which look and items they mean; otherwise clear=no, and ask about it in q.
Keep and change are always separate lines: "keep the dress and bag, show me lower heels" is "Keep the dress and bag" (act=keep, items=the dress and bag) and "Lower heels" (act=change, items=the shoes, about=lower heel). When it's unclear what they mean, such as "I like that but not this", still add the line with clear=no, and ask which they mean in q. Feedback is never jotted as an ordinary note, and never changes an ordinary note.

A request to see a different piece right now, with nothing more said about what it should be ("show me different shoes", "another bag for look 2", "swap the jacket"), is a swap: give w:
- l: the look's number if they said which (1 to {n}), otherwise 0.
- p: the piece: dress, suit, top, outer (a jacket, blazer, cardigan or coat), bottom (trousers, jeans, a skirt or shorts), shoes, bag or accessory (jewelry, a belt or a scarf).
Otherwise give p as "". A request with a detail ("lower heels", "closed-toe shoes") is feedback, not a swap. Liking, disliking or asking about a piece is never a swap.`;

export const LOOKS_SCHEMA_PART = {
  type: "object",
  additionalProperties: false,
  properties: { l: { type: "integer" }, p: { type: "string", enum: ["", ...SWAPPABLE] } },
  required: ["l", "p"],
};

/** The looks for the instructions, with a code for each item ("i1"), and the codes back to the items. */
function looksForPrompt(looks: LookForReader[], inView: number | null | undefined) {
  const codes = new Map<string, { look: LookForReader; id: string }>();
  const lines = looks.map((look) => {
    const items = look.items.map((it) => {
      const code = `i${codes.size + 1}`;
      codes.set(code, { look, id: it.id });
      return `${code} ${it.name} (${it.group}${it.owned ? ", the shopper's own" : ""})`;
    });
    return `Look ${look.number}, "${look.name}": ${items.join("; ")}`;
  });
  const view = looks.some((l) => l.number === inView) ? `they're looking at Look ${inView}` : "no look is on their screen right now";
  const text = LOOKS_RULES.replace("{inView}", view).replace("{looks}", lines.join("\n")).replaceAll("{n}", String(looks.length));
  return { text, codes };
}

/**
 * While the shopper talks with looks on screen (5a), readings aren't told what's in them, to stay quick,
 * but they're told not to jot reactions to the looks: those are read when the turn ends.
 */
export const LOOKS_WHILE_TALKING = `

Looks are on the shopper's screen. Reactions to them (keeping, changing, liking or disliking a piece or a look, or asking for a different piece) are never notes: leave them out, they're read when the shopper finishes speaking.`;

/**
 * The shopper's saved Must have and Never preferences (5c, R57, Sabine's answer to Q1): a request one of
 * them rules out isn't jotted; it's flagged, so the stylist asks whether to allow it for this session.
 */
export const SAVED_RULES = `

Their saved preferences rule some things out for every look:
{saved}
When the shopper asks for something one of these rules out, such as high heels when it says Never: high heels, or something sleeveless when it says Must have: sleeves, don't jot it as a note or as feedback: give x as its code, such as "s1", so the stylist can ask whether to allow it for this session only. Otherwise give x as "". Asking for something that fits a preference isn't a conflict: long sleeves when it says Must have: sleeves, or flats when it says Never: high heels. Neither is talking about it without asking for it ("I usually avoid heels").`;

/** The saved preferences for the instructions, each with a code ("s1"), and the codes back to their ids. */
function savedForPrompt(saved: FirmPreference[]) {
  const codes = new Map(saved.map((p, i) => [`s${i + 1}`, p.id]));
  const lines = saved.map((p, i) => `- s${i + 1}: ${p.kind === "never" ? "Never" : "Must have"}: ${p.words}`);
  return { text: SAVED_RULES.replace("{saved}", lines.join("\n")), codes };
}

/** The instructions and answer shape for this reading: the photo, looks and saved parts only when there are some. */
function readingShape(item: boolean, looksText: string | null, looksWhileTalking = false, savedText: string | null = null) {
  const properties: Record<string, unknown> = { ...SCHEMA.properties };
  const required = [...SCHEMA.required];
  let system = SYSTEM;
  if (item) {
    system += PHOTO_RULES;
    properties.p = PHOTO_SCHEMA_PART;
    required.push("p");
  }
  if (!looksText && looksWhileTalking) system += LOOKS_WHILE_TALKING;
  if (looksText) {
    system += looksText;
    properties.w = LOOKS_SCHEMA_PART;
    required.push("w");
    // Feedback lines can be added only here.
    const add = SCHEMA.properties.add;
    properties.add = { ...add, items: { ...add.items, properties: { ...add.items.properties, k: { type: "string", enum: KINDS } } } };
  }
  if (savedText) {
    system += savedText;
    properties.x = { type: "string" };
    required.push("x");
  }
  return { system, schema: { ...SCHEMA, properties, required }, maxTokens: 1200 + (item ? 100 : 0) + (looksText ? 300 : 0) };
}

export type ReaderInput = {
  /** What the stylist last said, so short answers like "the pantsuit" make sense. */
  stylistSaid: string;
  /** The shopper's words in this turn so far. */
  words: string;
  notes: Note[];
  /** The photo to style around, when there is one (3b). */
  item?: StyleItem;
  /** The looks on screen, at the end of a turn (4c, 5a), so a swap or feedback is heard. */
  looks?: LookForReader[];
  /** The number of the look most on the shopper's screen, if any (5a). */
  inView?: number | null;
  /** Looks are on screen, though this reading isn't told what's in them (while the shopper talks, 5a). */
  looksOnScreen?: boolean;
  /** The saved Must have and Never preferences not allowed for this session (5c), so a request breaking one is flagged. */
  saved?: FirmPreference[];
};

/** A spoken request to swap a piece (4c): `look` is 1 to 3, or 0 when the shopper didn't say which. */
export type SwapRequest = { look: number; piece: Group };

/** `exception` is the id of a saved preference the shopper asked to break (5c): the stylist asks first. */
export type Reading = { changes: NoteChanges; question: NextQuestion; costUsd: number; photo?: ItemChange; swap?: SwapRequest; exception?: string };

export interface NotesReader {
  read(input: ReaderInput): Promise<Reading | null>;
}

type Raw = {
  add: { k: NoteKind; t: string; d: string[] }[];
  update: { i: string; t: string; s: "p" | "c"; d: string[] }[];
  remove: string[];
  q: { t: string; o: string[] };
  p?: { c: number; o: "" | "m" | "i"; d: string[]; k: string[] };
  w?: { l: number; p: "" | Group };
  x?: string;
};

/** The swap the shopper asked for, if any, with a look number that's on screen. */
export function swapRequest(w: Raw["w"], looks: number): SwapRequest | undefined {
  if (!w || !w.p || !SWAPPABLE.includes(w.p)) return undefined;
  return { look: Number.isInteger(w.l) && w.l >= 1 && w.l <= looks ? w.l : 0, piece: w.p };
}

const isDetail = (name: string): name is DetailName => (DETAIL_NAMES as readonly string[]).includes(name);

/** What the shopper said about the photo, as a change to its item. Nothing when they said nothing about it. */
export function photoChange(p: Raw["p"]): ItemChange | undefined {
  if (!p) return undefined;
  const change: ItemChange = {};
  if (p.c > 0) change.choose = p.c - 1;
  if (p.o === "m") change.ownership = "owned";
  if (p.o === "i") change.ownership = "inspiration";
  const set = toDetails(p.d).flatMap(({ name, value }) => (isDetail(name) && value ? [{ name, value }] : []));
  if (set.length) change.set = set;
  const confirm = p.k.filter(isDetail);
  if (confirm.length) change.confirm = confirm;
  return Object.keys(change).length ? change : undefined;
}

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
    async read({ stylistSaid, words, notes, item, looks = [], inView, looksOnScreen = false, saved = [] }) {
      const live = active(notes);
      // Short ids keep the prompt small and stop Claude inventing ids.
      const shortIds = new Map(live.map((n, i) => [`n${i + 1}`, n.id]));
      // Feedback (5a) is listed apart, under its look, and isn't counted in the notebook's limit.
      const numberOf = (slot: number) => looks.find((l) => l.slot === slot)?.number;
      const label = (n: Note) => {
        const f = feedbackOf(n);
        const look = f && numberOf(f.look);
        return look ? `feedback on Look ${look}` : "feedback on an earlier look";
      };
      const listed = live.map((n, i) => ({ n, line: `- n${i + 1} [${isFeedback(n) ? label(n) : n.kind}, ${n.status === "confirmed" ? "confirmed" : "to confirm"}]: ${n.text}` }));
      const lines = listed.filter((x) => !isFeedback(x.n)).map((x) => x.line);
      const feedbackLines = listed.filter((x) => isFeedback(x.n)).map((x) => x.line);
      const removed = notes.filter((n) => n.removed).map((n) => `- ${n.text}`);
      const user = [
        stylistSaid ? `You last said: "${stylistSaid}"` : "",
        `The shopper is saying: "${words}"`,
        `The notebook (${lines.length} of at most ${NOTE_CAP} notes):\n${lines.length ? lines.join("\n") : "(empty)"}`,
        feedbackLines.length ? `Feedback already jotted:\n${feedbackLines.join("\n")}` : "",
        removed.length ? `Removed by the shopper, never jot again:\n${removed.join("\n")}` : "",
        item ? itemForReader(item) : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const forLooks = looks.length ? looksForPrompt(looks, inView) : null;
      const forSaved = saved.length ? savedForPrompt(saved) : null;
      const { data, costUsd } = await ask({ user, ...readingShape(Boolean(item), forLooks?.text ?? null, looksOnScreen, forSaved?.text ?? null) });
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
      // Claude sometimes still jots the photo's own item ("Owns a navy wool blazer") when the shopper
      // says it's theirs, though the photo already shows it (found by the notes eval in 3b).
      const photoType = item ? chosenItem(item.reading)?.details.type.value.toLowerCase() : undefined;
      const aboutPhoto = (a: Raw["add"][number]) => !!photoType && a.k === "owned_item" && a.t.toLowerCase().includes(photoType);
      // Feedback (5a), only with looks on screen: its look and item codes become the look's place and the
      // items' ids. Clear feedback is jotted in ink; unclear feedback in pencil, and the stylist asks (R47).
      const feedback = (d: string[], before?: Note): { details: Detail[]; clear: boolean } | null => {
        if (!forLooks) return null;
        const given = Object.fromEntries(toDetails(d).map((x) => [x.name, x.value]));
        const was = before ? feedbackOf(before) : null;
        const named = given.look ? looks.find((l) => l.number === Number(given.look)) : looks.find((l) => l.slot === was?.look);
        // No look it could be about: under the one on screen, or the first, in pencil for her to ask (R47).
        const look = named ?? looks.find((l) => l.number === inView) ?? looks[0];
        const sure = Boolean(named);
        const codes = (given.items ?? "").split(",").map((c) => c.trim()).filter(Boolean);
        const items = given.items !== undefined ? codes.flatMap((c) => { const it = forLooks.codes.get(c); return it && it.look === look ? [it.id] : []; }) : (was?.items ?? []);
        const act = (given.act ?? was?.act ?? "change") as FeedbackInfo["act"];
        const scope = (given.scope ?? was?.scope ?? "item") as FeedbackInfo["scope"];
        const about = given.about ?? before?.details.find((x) => x.name === "about")?.value;
        const info = feedbackOf({ kind: "feedback", details: feedbackDetails({ look: look.slot, items, act, scope }) })!;
        return { details: feedbackDetails(info, about), clear: sure && given.clear === "yes" };
      };
      // A request flagged as breaking a saved preference (5c) isn't jotted, even if Claude jots it too
      // (found by the notes eval: "Sleeveless" beside the flag): a note sharing its words is left out.
      const flagged = forSaved && raw.x ? saved.find((p) => p.id === forSaved.codes.get(raw.x!.trim().toLowerCase())) : undefined;
      const stems = flagged ? flagged.words.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 5)) : [];
      const breaksSaved = (a: Raw["add"][number]) => stems.some((stem) => a.t.toLowerCase().includes(stem));
      const adds = raw.add
        .filter((a) => a.k !== "budget" && !aboutPhoto(a) && !breaksSaved(a))
        .flatMap((a): NewNote[] => {
          if (a.k !== "feedback") return [{ kind: a.k, text: a.t, status: "to_confirm", details: toDetails(a.d) }];
          const f = feedback(a.d);
          return f ? [{ kind: "feedback", text: a.t, status: f.clear ? "confirmed" : "to_confirm", details: f.details }] : [];
        });
      return {
        changes: {
          add: adds,
          update: raw.update.flatMap((u) => {
            const id = real(u.i);
            const note = live.find((n) => n.id === id);
            if (!id || !note || isBudget(id)) return [];
            if (!isFeedback(note)) return [{ id, text: u.t, status: status(id, u.s), details: toDetails(u.d) }];
            // A feedback line keeps what it's about unless the words change it.
            const f = feedback(u.d, note);
            return [{ id, text: u.t, status: u.s === "c" || note.status === "confirmed" ? "confirmed" : "to_confirm", details: f?.details ?? note.details }];
          }),
          remove: raw.remove.flatMap((id) => (real(id) && !isBudget(real(id)!) ? [real(id)!] : [])),
        },
        question: cleanQuestion({ text: raw.q.t, options: raw.q.o }),
        costUsd,
        ...(item ? { photo: photoChange(raw.p) } : {}),
        ...(forLooks ? { swap: swapRequest(raw.w, looks.length) } : {}),
        ...(flagged ? { exception: flagged.id } : {}),
      };
    },
  };
}
