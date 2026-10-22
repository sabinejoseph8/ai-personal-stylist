import "server-only";
import { type FirmPreference, type ShownException, wantedNote } from "@/core/looks/exceptions";
import { allowException, firmPreferences } from "@/lib/exceptions-service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stylistContext } from "@/core/notes/context";
import { feedbackOf, isFeedback, touchFeedback } from "@/core/notes/feedback";
import { type Merged, mergeNotes, type TouchAction, touchNote } from "@/core/notes/merge";
import { plainChanges } from "@/core/notes/plain";
import { createSampleCatalog } from "@/connectors/catalog/sample";
import type { CatalogConnector } from "@/connectors/catalog/types";
import type { LookForReader, NotesReader, SwapRequest } from "@/core/notes/reader";
import { currentLooks } from "@/lib/looks-service";
import type { StyleItem } from "@/core/photos/item";
import { active, type NextQuestion, type Note, type ShownNote } from "@/core/notes/types";
import type { BudgetGuard } from "@/lib/budget-guard";
import { loadNotes, loadQuestion, nextWordsSeq, SessionEndedError, saveNotes, saveQuestion } from "@/lib/notes-store";
import { activePhoto, changePhoto } from "@/lib/photos-service";
import { stylingPicks } from "@/lib/wardrobe-service";

// My Styling Notes on the server (2c): words in, notes out, with latest word wins (R22).

/** `catalog` names the looks' items for the notes reader (5a); the sample catalog when not given. */
export type NotesDeps = { db: SupabaseClient; guard: BudgetGuard; reader: NotesReader; catalog?: CatalogConnector };

export type { ShownNote };
/** What the browser gets: the notes it shows, never their hidden details. */
export type NotesUpdate = {
  version: number;
  notes: ShownNote[];
  /** Present when the server has a view on the next question; null means none to ask now. */
  question?: NextQuestion;
  /** The words sequence the question comes from: a slower reading of older words never replaces it. */
  seq?: number;
  /** For the stylist, after every change. */
  context?: string;
  /** The reading failed or the AI allowance is used up: notes pause (R25). */
  paused?: boolean;
  /** The photo's item, when the shopper's words changed it (3b). */
  photo?: { id: string; item: StyleItem };
  /** A spoken request to swap a piece (4c), from the reading at the end of a turn only. */
  swap?: SwapRequest;
  /** A request that breaks a saved Must have or Never (5c, R57): the page shows the card, and the stylist asks. */
  exception?: FirmPreference;
  /** A spoken answer to the stylist's question (5c): allowed, with the exceptions now, or kept. */
  answered?: { preferenceId: string; allow: boolean; exceptions?: ShownException[] };
};

export type HeardWords = {
  words: string;
  stylistSaid: string;
  final: boolean;
  /** The number of the look most on the shopper's screen (5a), for feedback that doesn't name one. */
  look?: number | null;
  /** The page shows looks (5a): readings while the shopper talks leave reactions to them for the end. */
  looks?: boolean;
  /** The saved preference the stylist just asked about (5c): the words may answer it. */
  asking?: string | null;
  /** The shopper asked for it, so allowing it jots it too (fix plan 3, Q1). */
  wanted?: boolean;
  /**
   * The browser's label for the shopper's current turn. Claude sometimes leaves the question out of one
   * reading, so the session's question stays until a reading of a later turn replaces it (2c). It's
   * kept on the server, never taken from the browser (Phase 2 review).
   */
  turn?: string;
};

const shown = (notes: Note[]): ShownNote[] =>
  active(notes).map((n) => {
    const feedback = feedbackOf(n);
    return { id: n.id, kind: n.kind, text: n.text, status: n.status, ...(feedback ? { feedback } : {}) };
  });

/** The looks on screen with their items (4c, 5a), so the reader hears swaps and feedback. */
async function looksForReader(deps: NotesDeps, guestId: string, sessionId: string): Promise<LookForReader[]> {
  const looks = await currentLooks({ db: deps.db, catalog: deps.catalog ?? createSampleCatalog(deps.db) }, guestId, sessionId);
  return looks.map((l, i) => ({ number: i + 1, slot: l.slot, name: l.name, items: l.items.map((it) => ({ id: it.id, name: it.name, group: it.group, owned: it.owned })) }));
}

/** The guest's open session, or null. */
async function ownSession(db: SupabaseClient, guestId: string, sessionId: string) {
  const { data } = await db
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", guestId)
    .in("status", ["active", "paused"])
    .maybeSingle()
    .throwOnError();
  return data;
}

export async function preferencesOf(db: SupabaseClient, guestId: string) {
  const { data } = await db.from("saved_preferences").select("kind, words").eq("user_id", guestId).order("created_at").throwOnError();
  return data ?? [];
}

/** Merges and saves, trying again if another reading saved first. */
async function apply(db: SupabaseClient, sessionId: string, change: (notes: Note[]) => Merged) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { notes, version } = await loadNotes(db, sessionId);
    const merged = change(notes);
    if (!merged.changed.length) return { notes, version };
    const saved = await saveNotes(db, sessionId, version, merged.changed);
    if (saved !== null) return { notes: merged.notes, version: saved };
  }
  throw new Error("saving notes kept clashing");
}

/**
 * New words heard (POST /api/sessions/:id/words). Money and dates are applied straight away by plain
 * code, then Claude's reading follows: each result is sent to `emit` as soon as it's ready.
 * Returns false when the session isn't the guest's open session.
 */
export async function hearWords(deps: NotesDeps, guestId: string, sessionId: string, heard: HeardWords, emit: (u: NotesUpdate) => void) {
  if (!(await ownSession(deps.db, guestId, sessionId))) return false;
  try {
    await readWords(deps, guestId, sessionId, heard, emit);
  } catch (e) {
    // The shopper ended the session while the words were being read: nothing is saved or sent (2e).
    if (!(e instanceof SessionEndedError)) throw e;
  }
  return true;
}

async function readWords(deps: NotesDeps, guestId: string, sessionId: string, heard: HeardWords, emit: (u: NotesUpdate) => void) {
  const seq = await nextWordsSeq(deps.db, sessionId);

  const quick = await apply(deps.db, sessionId, (notes) => mergeNotes(notes, plainChanges(notes, heard.words), seq));
  emit({ version: quick.version, notes: shown(quick.notes) });

  const money = await deps.guard.checkAi(guestId, "claude");
  if (!money.ok) {
    emit({ version: quick.version, notes: shown(quick.notes), paused: true });
    return;
  }

  // The photo to style around, so what the shopper says about it reaches it (3b), and at the end of a
  // turn the looks on screen, so a request to swap a piece is heard (4c). Only then: readings while the
  // shopper talks stay as short and quick as before (Phase 4 code review, R17).
  // And every reading hears the saved Must have and Never preferences not allowed for this session, so a
  // request breaking one is flagged rather than jotted (5c, Sabine's answer to Q1).
  const [photo, looks, firm] = await Promise.all([
    activePhoto(deps.db, sessionId),
    heard.final ? looksForReader(deps, guestId, sessionId) : [],
    firmPreferences(deps.db, guestId, sessionId),
  ]);
  const saved = firm.filter((p) => !p.allowed).map((p): FirmPreference => ({ id: p.id, kind: p.kind, words: p.words }));
  const asking = heard.asking ? saved.find((p) => p.id === heard.asking) : undefined;
  const reading = await deps.reader.read({
    stylistSaid: heard.stylistSaid,
    words: heard.words,
    notes: quick.notes,
    item: photo?.item,
    looks,
    inView: heard.look,
    looksOnScreen: Boolean(heard.looks),
    saved,
    asking,
  });
  if (!reading) {
    emit({ version: quick.version, notes: shown(quick.notes), paused: true });
    return;
  }
  if (reading.costUsd > 0) await deps.guard.recordAi(guestId, "claude", reading.costUsd);

  // Readings overlap (each send while the shopper talks starts one), so the merge is told which notes
  // this one saw.
  const seen = new Set(active(quick.notes).map((n) => n.id));
  let done = await apply(deps.db, sessionId, (notes) => {
    // Claude's changes first; then plain code once more, so a month lands on a note Claude just jotted.
    const merged = mergeNotes(notes, reading.changes, seq, undefined, undefined, seen);
    const after = mergeNotes(merged.notes, plainChanges(merged.notes, heard.words), seq);
    return { notes: after.notes, changed: [...new Map([...merged.changed, ...after.changed].map((n) => [n.id, n])).values()] };
  });
  // A change for a photo replaced meanwhile is dropped (its version no longer matches).
  const changed = photo && reading.photo ? await changePhoto(deps.db, guestId, sessionId, photo.id, reading.photo, photo.version) : null;
  const [preferences, latest, wardrobe] = await Promise.all([
    preferencesOf(deps.db, guestId),
    photo ? activePhoto(deps.db, sessionId) : null,
    stylingPicks(deps.db, guestId),
  ]);
  // A spoken answer to the stylist's question does what the buttons do, at the end of the turn (5c).
  let answered: NotesUpdate["answered"];
  if (asking && reading.answer && heard.final) {
    const allow = reading.answer === "allow";
    const exceptions = allow ? await allowException(deps.db, guestId, sessionId, asking.id) : null;
    answered = { preferenceId: asking.id, allow, ...(exceptions ? { exceptions } : {}) };
    // What they asked for is jotted, so the looks change to include it (fix plan 3, Q1).
    if (allow && heard.wanted) {
      const jotted = await jotWanted(deps, guestId, sessionId, asking);
      if (jotted) done = { notes: (await loadNotes(deps.db, sessionId)).notes, version: jotted.version };
    }
  }
  let question = reading.question;
  if (question) await saveQuestion(deps.db, sessionId, seq, heard.turn ?? "", question);
  else if (heard.turn) {
    const kept = await loadQuestion(deps.db, sessionId);
    if (kept.turn === heard.turn) question = kept.question;
  }
  emit({
    version: done.version,
    notes: shown(done.notes),
    question,
    seq,
    context: stylistContext(done.notes, preferences, question, latest?.item ?? null, wardrobe),
    ...(changed && photo ? { photo: { id: photo.id, item: changed } } : {}),
    ...(reading.swap ? { swap: reading.swap } : {}),
    // Only once the shopper finishes speaking, like a swap: half a sentence can sound like a request (5c).
    ...(reading.exception && heard.final && !answered ? { exception: saved.find((p) => p.id === reading.exception) } : {}),
    ...(answered ? { answered } : {}),
  });
}

/** Confirm, Remove or Undo by touch (PATCH /api/sessions/:id/notes/:noteId, R20). Null if not the guest's. */
export async function touchSessionNote(deps: Pick<NotesDeps, "db">, guestId: string, sessionId: string, noteId: string, action: TouchAction) {
  if (!(await ownSession(deps.db, guestId, sessionId))) return null;
  let done: Awaited<ReturnType<typeof apply>>;
  try {
    const { notes, wordsSeq } = await loadNotes(deps.db, sessionId);
    if (!notes.some((n) => n.id === noteId)) return null;
    done = await apply(deps.db, sessionId, (current) => touchNote(current, noteId, action, wordsSeq));
  } catch (e) {
    if (e instanceof SessionEndedError) return null; // ended meanwhile
    throw e;
  }
  const [preferences, photo, wardrobe] = await Promise.all([preferencesOf(deps.db, guestId), activePhoto(deps.db, sessionId), stylingPicks(deps.db, guestId)]);
  return {
    version: done.version,
    notes: shown(done.notes),
    context: stylistContext(done.notes, preferences, null, photo?.item ?? null, wardrobe),
  } satisfies NotesUpdate;
}

/**
 * Once the shopper allows what they asked for (5c, Sabine's answer to Q1 of fix plan 3), it's jotted in
 * ink ("High heels"), so the looks are checked again and change to include it. `on: false` (Remove on
 * the exception) takes it back, since the preference applies again. Stamped like a touch, so a late
 * reading can't undo it. Null when the session isn't the guest's.
 */
export async function jotWanted(deps: Pick<NotesDeps, "db">, guestId: string, sessionId: string, preference: FirmPreference, on = true) {
  if (!(await ownSession(deps.db, guestId, sessionId))) return null;
  const text = wantedNote(preference);
  let done: Awaited<ReturnType<typeof apply>>;
  try {
    const { wordsSeq } = await loadNotes(deps.db, sessionId);
    done = await apply(deps.db, sessionId, (current) => {
      const same = active(current).find((n) => n.text.toLowerCase() === text.toLowerCase());
      if (!on) return same ? touchNote(current, same.id, "remove", wordsSeq) : { notes: current, changed: [] };
      if (same?.status === "confirmed") return { notes: current, changed: [] };
      const note: Note = { id: crypto.randomUUID(), kind: "style", text, status: "confirmed", details: [], source: "touch", changedSeq: wordsSeq, version: 1, removed: false };
      return { notes: [...current, note], changed: [note] };
    });
  } catch (e) {
    if (e instanceof SessionEndedError) return null; // ended meanwhile
    throw e;
  }
  const [preferences, photo, wardrobe] = await Promise.all([preferencesOf(deps.db, guestId), activePhoto(deps.db, sessionId), stylingPicks(deps.db, guestId)]);
  return {
    version: done.version,
    notes: shown(done.notes),
    context: stylistContext(done.notes, preferences, null, photo?.item ?? null, wardrobe),
  } satisfies NotesUpdate;
}

/**
 * Undo feedback (5c, R51): the feedback lines the undone revision answered are taken back, as if removed
 * by touch, so they don't revise the look again. Null when the session isn't the guest's.
 */
export async function takeBackFeedback(deps: Pick<NotesDeps, "db">, guestId: string, sessionId: string, noteIds: string[]) {
  if (!(await ownSession(deps.db, guestId, sessionId))) return null;
  let done: Awaited<ReturnType<typeof apply>>;
  try {
    const { wordsSeq } = await loadNotes(deps.db, sessionId);
    done = await apply(deps.db, sessionId, (current) => {
      let notes = current;
      const changed = new Map<string, Note>();
      for (const id of noteIds) {
        if (!notes.some((n) => n.id === id && !n.removed && isFeedback(n))) continue;
        const merged = touchNote(notes, id, "remove", wordsSeq);
        notes = merged.notes;
        for (const n of merged.changed) changed.set(n.id, n);
      }
      return { notes, changed: [...changed.values()] };
    });
  } catch (e) {
    if (e instanceof SessionEndedError) return null; // ended meanwhile
    throw e;
  }
  const [preferences, photo, wardrobe] = await Promise.all([preferencesOf(deps.db, guestId), activePhoto(deps.db, sessionId), stylingPicks(deps.db, guestId)]);
  return {
    version: done.version,
    notes: shown(done.notes),
    context: stylistContext(done.notes, preferences, null, photo?.item ?? null, wardrobe),
  } satisfies NotesUpdate;
}

/**
 * Keep or Change on an item of a look (POST /api/sessions/:id/feedback; R46, 5a): jotted under its look
 * in ink, as if said, or taken back. Only sample products have them: the shopper's own pieces are always
 * in the look. Null when the session, look or item isn't the guest's.
 */
export async function feedbackByTouch(
  deps: Pick<NotesDeps, "db" | "catalog">,
  guestId: string,
  sessionId: string,
  touch: { lookId: string; index: number; act: "keep" | "change"; on: boolean },
) {
  if (!(await ownSession(deps.db, guestId, sessionId))) return null;
  const looks = await currentLooks({ db: deps.db, catalog: deps.catalog ?? createSampleCatalog(deps.db) }, guestId, sessionId);
  const look = looks.find((l) => l.id === touch.lookId);
  const item = look?.items[touch.index];
  if (!look || !item || item.owned) return null;
  let done: Awaited<ReturnType<typeof apply>>;
  try {
    const { wordsSeq } = await loadNotes(deps.db, sessionId);
    const names = Object.fromEntries(look.items.map((i) => [i.id, i.name]));
    done = await apply(deps.db, sessionId, (current) => touchFeedback(current, { look: look.slot, item: item.id, act: touch.act, on: touch.on, names }, wordsSeq));
  } catch (e) {
    if (e instanceof SessionEndedError) return null;
    throw e;
  }
  const [preferences, photo, wardrobe] = await Promise.all([preferencesOf(deps.db, guestId), activePhoto(deps.db, sessionId), stylingPicks(deps.db, guestId)]);
  return {
    version: done.version,
    notes: shown(done.notes),
    context: stylistContext(done.notes, preferences, null, photo?.item ?? null, wardrobe),
  } satisfies NotesUpdate;
}
