import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { claudeAsk, type Effort, LIVE_MODEL } from "@/connectors/ai/claude";
import { mergeNotes } from "@/core/notes/merge";
import { plainChanges } from "@/core/notes/plain";
import type { FirmPreference } from "@/core/looks/exceptions";
import { feedbackOf } from "@/core/notes/feedback";
import { createNotesReader, type LookForReader } from "@/core/notes/reader";
import { active, type NextQuestion, type Note, NOTE_CAP } from "@/core/notes/types";
import { changeItem, chosenItem, type DetailName, itemForReader, type StyleItem } from "@/core/photos/item";
import { setting } from "../support/test-guests";

// The notes evaluation (tech spec 8, Phase 2): about 30 sentences against the real Claude, replayed the
// way Phase 0 measured them: words arrive at 2.5 a second and are sent twice a second, money and dates
// are read by plain code at once, and overlapping readings merge in the order they finish (latest word wins).
// Pass marks: at least 90% of checks right, and 95% of notes within 2 seconds of their phrase (R17).
// Run: npm run eval:notes. It costs about 10 cents. To compare setups (2c), set NOTES_EVAL_EFFORT (off or
// low), NOTES_EVAL_OVERLAP=0 (one reading at a time), NOTES_EVAL_SEND_MS and NOTES_EVAL_OUT (results file).
// Cases with a photo (3b, Sabine's answer to Q3) give the reader the item to style around, and check
// what the shopper's words changed about it, while the notes are timed as usual. Cases with looks on
// screen (4c, 5a) check the request to swap a piece and the feedback heard at the end of the turn (only
// that reading is told about the looks, as in the app), or that there was none.

type Expect = { after: string; has: string[]; lacks?: string[]; status?: "confirmed" };
type Case = {
  id: string;
  turns: { stylist?: string; shopper: string }[];
  expect: Expect[];
  forbid?: string[];
  maxNotes?: number;
  question?: { has: string[] };
  /** The photo to style around, and what the words should change about it (3b). */
  item?: StyleItem;
  photo?: { ownership?: "owned" | "inspiration"; chosen?: number; detail?: { name: DetailName; has: string; status?: "confirmed" } };
  /** Looks on screen, and the swap the last turn asks for (null: none) (4c). */
  looks?: number;
  swap?: { look: number; piece: string } | null;
  /** The look on the shopper's screen, and the feedback jotted (5a); noFeedback: none at all. */
  inView?: number;
  feedback?: { look: number; has: string[]; act?: string; items?: string[]; scope?: string; status?: "confirmed" | "to_confirm" }[];
  noFeedback?: boolean;
  /** The sample profile's Never: high heels and Must have: sleeves are saved, and the one the words ask to break (null: none) (5c). */
  saved?: boolean;
  exception?: string | null;
  /** The stylist has just asked about this saved preference, and the answer the words give (null: none) (A.3 fix). */
  asking?: string;
  answer?: "allow" | "keep" | null;
  /** Of those, the ones allowed for this session, and the one the words ask for again (null: none) (fix plan 5). */
  allowed?: string[];
  wanted?: string | null;
};

// The saved preferences in cases with them (5c): the sample profile's Never and Must have.
const SAVED: FirmPreference[] = [
  { id: "pref-heels", kind: "never", words: "high heels" },
  { id: "pref-sleeves", kind: "must_have", words: "sleeves" },
];

// The looks on screen in cases with looks (5a): sample products, by their catalog slugs.
const piece = (id: string, name: string, group: string) => ({ id, name, group, owned: false });
const LOOKS: LookForReader[] = [
  {
    number: 1,
    slot: 1,
    name: "Garden ceremony",
    items: [piece("w-emerald-satin-midi-dress", "Emerald satin midi dress", "dress"), piece("w-nude-slingback-flats", "Nude slingback flats", "shoes"), piece("w-emerald-satin-clutch", "Emerald satin clutch", "bag"), piece("w-pearl-drop-earrings", "Pearl drop earrings", "accessory")],
  },
  {
    number: 2,
    slot: 2,
    name: "Velvet evening",
    items: [piece("w-burgundy-velvet-dress", "Burgundy velvet dress", "dress"), piece("w-tan-leather-loafers", "Tan leather loafers", "shoes"), piece("w-camel-leather-tote", "Camel leather tote", "bag")],
  },
  {
    number: 3,
    slot: 3,
    name: "Camel classic",
    items: [piece("w-white-silk-blouse", "White silk blouse", "top"), piece("w-camel-pleated-midi-skirt", "Camel pleated midi skirt", "bottom"), piece("w-black-ballet-flats", "Black ballet flats", "shoes"), piece("w-woven-straw-basket-bag", "Woven straw basket bag", "bag")],
  },
];

const cases: Case[] = JSON.parse(readFileSync("tests/evals/notes-cases.json", "utf8"));
// Settings to compare setups (all default to what the app does).
const EFFORT = (process.env.NOTES_EVAL_EFFORT ?? "off") as Effort;
const OVERLAP = process.env.NOTES_EVAL_OVERLAP !== "0";
const SEND_EVERY_MS = Number(process.env.NOTES_EVAL_SEND_MS ?? 500);
const OUT = process.env.NOTES_EVAL_OUT ?? "tests/evals/results/notes-latest.json";
const reader = createNotesReader(claudeAsk(LIVE_MODEL, EFFORT, setting("ANTHROPIC_API_KEY")));
const WORDS_PER_SECOND = 2.5;
const AT_ONCE = 3;
const lower = (s: string) => s.toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const hit = (notes: Note[], e: Expect) =>
  e.has.every((h) => active(notes).some((n) => lower(n.text).includes(h) && !(e.lacks ?? []).some((x) => lower(n.text).includes(x))));
// A note that repeats another: all its describing words are in another note ("November" next to
// "Outdoor wedding, November").
const COMMON = new Set("a an the and or but not no nothing too very for with of in on at to my her his their this that some something maybe like likes want wants prefer preferred owns owned own avoid wear wears worn usually".split(" "));
const keyWords = (s: string) => lower(s).replace(/[^a-z0-9$ ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !COMMON.has(w));
function repeats(notes: Note[]) {
  const sets = active(notes).map((n) => keyWords(n.text));
  return sets.some((x, i) => x.length > 0 && sets.some((y, j) => i !== j && x.every((w) => y.includes(w)) && (x.length < y.length || i < j)));
}
const gone = (notes: Note[], e: Expect) => !(e.lacks ?? []).some((x) => active(notes).some((n) => lower(n.text).includes(x)));

async function replay(c: Case) {
  const t0 = performance.now();
  const now = () => performance.now() - t0;
  let notes: Note[] = [];
  let item = c.item ?? null;
  let seq = 0;
  let question = null as NextQuestion;
  let questionSeq = 0;
  let cost = 0;
  let paused = 0;
  const durations: number[] = [];
  const snapshots: { at: number; notes: Note[] }[] = [];
  const timeline: { word: string; at: number }[] = [];
  const snap = () => snapshots.push({ at: now(), notes });
  // The swap each reading heard, by the words it read: the app acts on the end-of-turn reading's only.
  const swaps = new Map<string, { look: number; piece: string } | null>();
  // The saved preferences the end-of-turn reading flagged as asked to break (5c).
  const flagged = new Set<string>();
  let answered: "allow" | "keep" | null = null;
  // The allowed ones the end-of-turn reading heard asked for again (fix plan 5).
  const wantedHeard = new Set<string>();

  // As in the browser (components/session/use-notes.ts): with each send, plain code reads money and
  // dates at once and a Claude reading of the latest words starts. Readings overlap and merge in the
  // order they finish (latest word wins). Without OVERLAP, one reading runs at a time.
  const running = new Set<Promise<void>>();
  let lastRead = "";
  let turnAt = 0;
  let questionTurn = -1;
  // The turn's full words: only that reading is told about the looks (4e review).
  let fullTurn = "";
  function startReading(words: string, stylistSaid: string, mine: number) {
    lastRead = words;
    const turnNo = turnAt;
    const started = now();
    const seen = new Set(active(notes).map((n) => n.id));
    const looks = c.looks && words === fullTurn ? LOOKS.slice(0, c.looks) : undefined;
    const reading: Promise<void> = reader.read({ stylistSaid, words, notes, item: item ?? undefined, looks, inView: c.inView ?? null, looksOnScreen: Boolean(c.looks), saved: c.saved ? SAVED.filter((p) => !c.allowed?.includes(p.words)) : undefined, allowed: c.saved ? SAVED.filter((p) => c.allowed?.includes(p.words)) : undefined, asking: SAVED.find((p) => p.words === c.asking) }).then((r) => {
      durations.push(now() - started);
      running.delete(reading);
      if (!r) return void paused++;
      swaps.set(words, r.swap ?? null);
      // The app acts only on the end-of-turn reading's flag, as for a swap.
      if (r.exception && words === fullTurn) flagged.add(r.exception);
      if (r.answer && words === fullTurn) answered = r.answer;
      if (r.wanted && words === fullTurn) wantedHeard.add(r.wanted);
      cost += r.costUsd;
      if (item && r.photo) item = changeItem(item, r.photo);
      const merged = mergeNotes(notes, r.changes, mine, NOTE_CAP, undefined, seen);
      notes = mergeNotes(merged.notes, plainChanges(merged.notes, words), mine).notes;
      // A question stays until a reading of a later turn replaces it (or finds nothing to ask).
      if (mine >= questionSeq) {
        if (r.question || questionTurn !== turnNo) question = r.question;
        questionTurn = turnNo;
        questionSeq = mine;
      }
      snap();
    });
    running.add(reading);
  }

  for (const turn of c.turns) {
    turnAt++;
    const words = turn.shopper.split(/\s+/);
    const full = words.join(" ");
    fullTurn = full;
    const stylist = turn.stylist ?? "";
    const start = now();
    const at = (i: number) => start + ((i + 1) / WORDS_PER_SECOND) * 1000;
    words.forEach((word, i) => timeline.push({ word: lower(word), at: at(i) }));
    const total = at(words.length - 1);
    const heardAt = (t: number) => words.filter((_, i) => at(i) <= t + 1).join(" ");
    let lastQuick = "";
    for (let tick = start + SEND_EVERY_MS; ; tick += SEND_EVERY_MS) {
      const t = Math.min(tick, total);
      while (now() < t) {
        const wait = sleep(Math.max(0, t - now()));
        await (running.size && !OVERLAP ? Promise.race([...running, wait]) : wait);
        // One at a time: the next reading starts as soon as the last one ends.
        if (!OVERLAP && !running.size && lastRead && heardAt(now()) !== lastRead) startReading(heardAt(now()), stylist, ++seq);
      }
      const heard = heardAt(t);
      if (heard && heard !== lastQuick) {
        lastQuick = heard;
        const mine = ++seq;
        notes = mergeNotes(notes, plainChanges(notes, heard), mine).notes;
        snap();
        if ((OVERLAP || !running.size) && heard !== lastRead) startReading(heard, stylist, mine);
      }
      if (t >= total) break;
    }
    while (running.size || lastRead !== full) {
      if (running.size) await Promise.race(running);
      else startReading(full, stylist, ++seq);
    }
    lastRead = "";
  }

  const checks: { what: string; ok: boolean; seconds?: number | null }[] = [];
  for (const e of c.expect) {
    const end = timeline.find((w) => w.word.includes(lower(e.after)))?.at ?? 0;
    const first = snapshots.find((s) => s.at >= end && hit(s.notes, e));
    const statusOk = !e.status || active(notes).find((n) => lower(n.text).includes(e.has[0]))?.status === e.status;
    checks.push({ what: `${e.has.join("+")}${e.status ? ` ${e.status}` : ""}`, ok: hit(notes, e) && gone(notes, e) && statusOk, seconds: first ? (first.at - end) / 1000 : null });
  }
  for (const f of c.forbid ?? []) checks.push({ what: `no "${f}"`, ok: !active(notes).some((n) => lower(n.text).includes(f)) });
  checks.push({ what: "no repeated notes", ok: !repeats(notes) });
  // Clear feedback is jotted in ink (R47), so only notes count here.
  if (!c.turns.some((t) => t.stylist)) checks.push({ what: "no ink without a question", ok: !active(notes).some((n) => n.status === "confirmed" && n.kind !== "feedback") });
  if (c.maxNotes !== undefined) checks.push({ what: `at most ${c.maxNotes} notes`, ok: active(notes).length <= c.maxNotes });
  if (c.photo && item) {
    const { ownership, chosen, detail } = c.photo;
    if (ownership) checks.push({ what: `photo ${ownership}`, ok: item.ownership === ownership });
    if (chosen !== undefined) checks.push({ what: `photo item ${chosen + 1} chosen`, ok: item.reading.chosen === chosen });
    if (detail) {
      const d = chosenItem(item.reading)?.details[detail.name];
      checks.push({ what: `photo ${detail.name} ${detail.has}`, ok: !!d && lower(d.value).includes(detail.has) && (!detail.status || d.status === detail.status) });
    }
  }
  if (c.swap !== undefined) {
    const last = c.turns[c.turns.length - 1].shopper.split(/\s+/).join(" ");
    const heard = swaps.get(last) ?? null;
    const want = c.swap;
    checks.push({ what: want ? `swap look ${want.look} ${want.piece}` : "no swap", ok: want ? heard?.look === want.look && heard?.piece === want.piece : heard === null });
  }
  const feedbackNotes = active(notes).flatMap((n) => {
    const f = feedbackOf(n);
    return f ? [{ n, f }] : [];
  });
  if (c.noFeedback) checks.push({ what: "no feedback", ok: !feedbackNotes.length });
  if (c.answer !== undefined) checks.push({ what: c.answer ? `answers ${c.answer}` : "no answer heard", ok: answered === c.answer });
  if (c.exception !== undefined) {
    const want = SAVED.find((p) => p.words === c.exception);
    checks.push({ what: want ? `asks to break ${want.words}` : "no saved preference flagged", ok: want ? flagged.has(want.id) && flagged.size === 1 : flagged.size === 0 });
  }
  if (c.wanted !== undefined) {
    const want = SAVED.find((p) => p.words === c.wanted);
    checks.push({ what: want ? `asks again for ${want.words}` : "nothing allowed asked for", ok: want ? wantedHeard.has(want.id) && wantedHeard.size === 1 : wantedHeard.size === 0 });
  }
  for (const want of c.feedback ?? []) {
    const ok = feedbackNotes.some(
      ({ n, f }) =>
        f.look === want.look &&
        want.has.every((h) => lower(n.text).includes(h)) &&
        (!want.act || f.act === want.act) &&
        (!want.scope || f.scope === want.scope) &&
        (!want.status || n.status === want.status) &&
        (!want.items || want.items.every((i) => f.items.includes(i))),
    );
    checks.push({ what: `feedback on look ${want.look}: ${want.has.join("+")}${want.act ? ` ${want.act}` : ""}${want.scope ? ` ${want.scope}` : ""}`, ok });
  }
  if (c.question) {
    const q = question;
    const asked = q ? lower(`${q.text} ${q.options.join(" ")}`) : "";
    checks.push({ what: `asks ${c.question.has.join("/")}`, ok: c.question.has.every((h) => asked.includes(h)) });
  }
  return {
    id: c.id,
    checks,
    notes: active(notes).map((n) => `${n.kind === "feedback" ? `(look ${feedbackOf(n)?.look}, ${feedbackOf(n)?.act}, ${feedbackOf(n)?.scope}) ` : ""}${n.text} [${n.status === "confirmed" ? "ink" : "pencil"}]`),
    photo: item ? itemForReader(item).replace(/\n/g, " | ") : undefined,
    question,
    cost,
    paused,
    readings: durations.length,
    durations,
  };
}

it("notes evaluation: at least 90% right, 95% within 2 seconds", async () => {
  const results: Awaited<ReturnType<typeof replay>>[] = [];
  for (let i = 0; i < cases.length; i += AT_ONCE) results.push(...(await Promise.all(cases.slice(i, i + AT_ONCE).map(replay))));

  for (const r of results) {
    const wrong = r.checks.filter((c) => !c.ok).map((c) => c.what);
    const times = r.checks.filter((c) => c.seconds !== undefined).map((c) => `${c.what}=${c.seconds === null ? "MISSED" : `${c.seconds!.toFixed(1)}s`}`);
    console.log(`${r.id.padEnd(30)} ${wrong.length ? `WRONG: ${wrong.join(", ")}  ` : ""}${times.join("  ")}`);
    console.log(`${"".padEnd(30)} ${r.notes.join(" | ") || "(no notes)"}${r.question ? `  -> ${r.question.text} [${r.question.options.join(", ")}]` : ""}`);
    if (r.photo) console.log(`${"".padEnd(30)} photo: ${r.photo}`);
  }
  const all = results.flatMap((r) => r.checks);
  const timed = all.filter((c) => c.seconds !== undefined);
  const within = timed.filter((c) => c.seconds !== null && c.seconds! <= 2).length;
  const sorted = timed.map((c) => c.seconds ?? 99).sort((a, b) => a - b);
  const summary = {
    model: LIVE_MODEL,
    setup: { effort: EFFORT, overlap: OVERLAP, sendEveryMs: SEND_EVERY_MS },
    date: new Date().toISOString(),
    cases: results.length,
    checks: all.length,
    right: all.filter((c) => c.ok).length,
    rightPercent: Math.round((all.filter((c) => c.ok).length / all.length) * 100),
    timedNotes: timed.length,
    within2sPercent: Math.round((within / timed.length) * 100),
    p95Seconds: Number(sorted[Math.floor(sorted.length * 0.95)]?.toFixed(2)),
    pausedReadings: results.reduce((n, r) => n + r.paused, 0),
    readingSeconds: (() => {
      const d = results.flatMap((r) => r.durations).sort((a, b) => a - b);
      return { median: Number((d[Math.floor(d.length / 2)] / 1000).toFixed(2)), p95: Number((d[Math.floor(d.length * 0.95)] / 1000).toFixed(2)) };
    })(),
    readings: results.reduce((n, r) => n + r.readings, 0),
    costUSD: Number(results.reduce((c, r) => c + r.cost, 0).toFixed(4)),
  };
  console.log(JSON.stringify(summary, null, 2));
  mkdirSync("tests/evals/results", { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ summary, results }, null, 1)}\n`);

  expect(summary.rightPercent).toBeGreaterThanOrEqual(90);
  expect(summary.within2sPercent).toBeGreaterThanOrEqual(95);
});
