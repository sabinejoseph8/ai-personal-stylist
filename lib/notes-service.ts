import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stylistContext } from "@/core/notes/context";
import { type Merged, mergeNotes, type TouchAction, touchNote } from "@/core/notes/merge";
import { plainChanges } from "@/core/notes/plain";
import type { NotesReader, SwapRequest } from "@/core/notes/reader";
import type { StyleItem } from "@/core/photos/item";
import { active, type NextQuestion, type Note, type ShownNote } from "@/core/notes/types";
import type { BudgetGuard } from "@/lib/budget-guard";
import { loadNotes, loadQuestion, nextWordsSeq, SessionEndedError, saveNotes, saveQuestion } from "@/lib/notes-store";
import { activePhoto, changePhoto } from "@/lib/photos-service";
import { stylingPicks } from "@/lib/wardrobe-service";

// My Styling Notes on the server (2c): words in, notes out, with latest word wins (R22).

export type NotesDeps = { db: SupabaseClient; guard: BudgetGuard; reader: NotesReader };

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
};

export type HeardWords = {
  words: string;
  stylistSaid: string;
  final: boolean;
  /**
   * The browser's label for the shopper's current turn. Claude sometimes leaves the question out of one
   * reading, so the session's question stays until a reading of a later turn replaces it (2c). It's
   * kept on the server, never taken from the browser (Phase 2 review).
   */
  turn?: string;
};

const shown = (notes: Note[]): ShownNote[] => active(notes).map(({ id, kind, text, status }) => ({ id, kind, text, status }));

/** How many places have a look on screen (4c), so the reader listens for swaps. */
async function looksOnScreen(db: SupabaseClient, sessionId: string) {
  const { data } = await db.from("looks").select("input_versions").eq("session_id", sessionId).in("status", ["published", "needs_check"]).throwOnError();
  return new Set((data ?? []).map((r) => (r.input_versions as { slot?: number }).slot).filter(Boolean)).size;
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

  // The photo to style around, so what the shopper says about it reaches it (3b), and the looks on
  // screen, so a request to swap a piece is heard (4c).
  const [photo, looks] = await Promise.all([activePhoto(deps.db, sessionId), looksOnScreen(deps.db, sessionId)]);
  const reading = await deps.reader.read({
    stylistSaid: heard.stylistSaid,
    words: heard.words,
    notes: quick.notes,
    item: photo?.item,
    looks,
  });
  if (!reading) {
    emit({ version: quick.version, notes: shown(quick.notes), paused: true });
    return;
  }
  if (reading.costUsd > 0) await deps.guard.recordAi(guestId, "claude", reading.costUsd);

  // Readings overlap (each send while the shopper talks starts one), so the merge is told which notes
  // this one saw.
  const seen = new Set(active(quick.notes).map((n) => n.id));
  const done = await apply(deps.db, sessionId, (notes) => {
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
    // Only once the turn is over: readings of a turn so far might not have heard which look yet.
    ...(heard.final && reading.swap ? { swap: reading.swap } : {}),
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
