import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stylistContext } from "@/core/notes/context";
import { type Merged, mergeNotes, type TouchAction, touchNote } from "@/core/notes/merge";
import { plainChanges } from "@/core/notes/plain";
import type { NotesReader } from "@/core/notes/reader";
import { active, type NextQuestion, type Note } from "@/core/notes/types";
import type { BudgetGuard } from "@/lib/budget-guard";
import { loadNotes, nextWordsSeq, saveNotes } from "@/lib/notes-store";

// My Styling Notes on the server (2c): words in, notes out, with latest word wins (R22).

export type NotesDeps = { db: SupabaseClient; guard: BudgetGuard; reader: NotesReader };

/** What the browser gets: the notes it shows, never their hidden details. */
export type ShownNote = { id: string; kind: string; text: string; status: Note["status"] };
export type NotesUpdate = {
  version: number;
  notes: ShownNote[];
  /** Present when the server has a view on the next question; null means none to ask now. */
  question?: NextQuestion;
  /** For the stylist, after every change. */
  context?: string;
  /** The reading failed or the AI allowance is used up: notes pause (R25). */
  paused?: boolean;
};

export type HeardWords = {
  words: string;
  stylistSaid: string;
  final: boolean;
  /**
   * The question on screen from earlier readings in this turn. Claude sometimes leaves the question out
   * of one reading, so it stays until a reading of a later turn replaces it (measured in 2c).
   */
  asked?: NextQuestion;
};

const shown = (notes: Note[]): ShownNote[] => active(notes).map(({ id, kind, text, status }) => ({ id, kind, text, status }));

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

async function preferencesOf(db: SupabaseClient, guestId: string) {
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
  const seq = await nextWordsSeq(deps.db, sessionId);

  const quick = await apply(deps.db, sessionId, (notes) => mergeNotes(notes, plainChanges(notes, heard.words), seq));
  emit({ version: quick.version, notes: shown(quick.notes) });

  const money = await deps.guard.checkAi(guestId, "claude");
  if (!money.ok) {
    emit({ version: quick.version, notes: shown(quick.notes), paused: true });
    return true;
  }

  const reading = await deps.reader.read({ stylistSaid: heard.stylistSaid, words: heard.words, notes: quick.notes });
  if (!reading) {
    emit({ version: quick.version, notes: shown(quick.notes), paused: true });
    return true;
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
  const preferences = await preferencesOf(deps.db, guestId);
  const question = reading.question ?? heard.asked ?? null;
  emit({ version: done.version, notes: shown(done.notes), question, context: stylistContext(done.notes, preferences, question) });
  return true;
}

/** Confirm, Remove or Undo by touch (PATCH /api/sessions/:id/notes/:noteId, R20). Null if not the guest's. */
export async function touchSessionNote(deps: Pick<NotesDeps, "db">, guestId: string, sessionId: string, noteId: string, action: TouchAction) {
  if (!(await ownSession(deps.db, guestId, sessionId))) return null;
  const { notes, wordsSeq } = await loadNotes(deps.db, sessionId);
  if (!notes.some((n) => n.id === noteId)) return null;
  const done = await apply(deps.db, sessionId, (current) => touchNote(current, noteId, action, wordsSeq));
  const preferences = await preferencesOf(deps.db, guestId);
  return { version: done.version, notes: shown(done.notes), context: stylistContext(done.notes, preferences, null) } satisfies NotesUpdate;
}
