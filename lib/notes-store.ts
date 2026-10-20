import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextQuestion, Note, NoteKind } from "@/core/notes/types";

// Reads and saves a session's notes with the server key (notes are the app's own record, decision A).

type Row = {
  id: string;
  kind: string;
  note_text: string;
  status: Note["status"];
  hidden_details: Note["details"] | null;
  source: Note["source"];
  changed_seq: number;
  version: number;
  removed: boolean;
};

const toNote = (r: Row): Note => ({
  id: r.id,
  kind: r.kind as NoteKind,
  text: r.note_text,
  status: r.status,
  details: Array.isArray(r.hidden_details) ? r.hidden_details : [],
  source: r.source === "touch" ? "touch" : "voice",
  changedSeq: Number(r.changed_seq),
  version: r.version,
  removed: r.removed,
});

/** Every note in the session, removed ones included, in the order they were jotted, and the notebook's version. */
export async function loadNotes(db: SupabaseClient, sessionId: string): Promise<{ notes: Note[]; version: number; wordsSeq: number }> {
  const [session, rows] = await Promise.all([
    db.from("sessions").select("notes_version, words_seq").eq("id", sessionId).single().throwOnError(),
    db
      .from("session_notes")
      .select("id, kind, note_text, status, hidden_details, source, changed_seq, version, removed")
      .eq("session_id", sessionId)
      .order("created_at")
      .throwOnError(),
  ]);
  return { notes: (rows.data as Row[]).map(toNote), version: session.data.notes_version, wordsSeq: Number(session.data.words_seq) };
}

/** Saves the changed notes if nobody saved since `expected`. Returns the new version, or null to merge again. */
export async function saveNotes(db: SupabaseClient, sessionId: string, expected: number, changed: Note[]): Promise<number | null> {
  const rows = changed.map((n) => ({
    id: n.id,
    note_text: n.text.slice(0, 200),
    kind: n.kind,
    hidden_details: n.details,
    status: n.status,
    source: n.source,
    changed_seq: n.changedSeq,
    version: n.version,
    removed: n.removed,
  }));
  const { data, error } = await db.rpc("save_notes", { session: sessionId, expected_version: expected, rows });
  if (error?.message.includes("session ended")) throw new SessionEndedError();
  if (error) throw new Error(`saving notes failed: ${error.message}`);
  return data as number | null;
}

/** The session ended (End, or 30 minutes idle) while notes were being read: they're not saved (2e). */
export class SessionEndedError extends Error {
  constructor() {
    super("the session has ended");
  }
}

/**
 * Keeps the next question with the session (R19), unless a reading of newer words already set one. The
 * turn is the browser's label for the shopper's turn: the question stays while the turn does.
 */
export async function saveQuestion(db: SupabaseClient, sessionId: string, seq: number, turn: string, question: NonNullable<NextQuestion>) {
  await db.from("sessions").update({ question, question_turn: turn, question_seq: seq }).eq("id", sessionId).lt("question_seq", seq).throwOnError();
}

/** The session's kept question and the turn it belongs to. */
export async function loadQuestion(db: SupabaseClient, sessionId: string): Promise<{ question: NextQuestion; turn: string | null }> {
  const { data } = await db.from("sessions").select("question, question_turn").eq("id", sessionId).single().throwOnError();
  return { question: (data.question as NextQuestion) ?? null, turn: data.question_turn };
}

/** The sequence number for words that just arrived (R22). */
export async function nextWordsSeq(db: SupabaseClient, sessionId: string): Promise<number> {
  const { data, error } = await db.rpc("next_words_seq", { session: sessionId });
  if (error) throw new Error(`numbering words failed: ${error.message}`);
  return Number(data);
}
