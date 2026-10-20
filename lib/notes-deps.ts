import "server-only";
import { claudeAsk, LIVE_MODEL } from "@/connectors/ai/claude";
import { createFakeNotesReader } from "@/core/notes/fake-reader";
import { createNotesReader, type NotesReader } from "@/core/notes/reader";
import { createBudgetGuard } from "@/lib/budget-guard";
import type { NotesDeps } from "@/lib/notes-service";
import { serverKeyDb } from "@/lib/supabase/admin";

/** The fake notes reader is only for automated tests: refused on Vercel's live site, whatever the setting says. */
export function fakeNotesAllowed(env: Record<string, string | undefined> = process.env) {
  return env.NOTES_READER === "fake" && env.VERCEL_ENV !== "production";
}

export function notesReader(): NotesReader {
  return fakeNotesAllowed() ? createFakeNotesReader() : createNotesReader(claudeAsk(LIVE_MODEL, "off"));
}

/** What the notes endpoints run with: the server key, the budget guard and the notes reader. */
export function notesDeps(): NotesDeps {
  const db = serverKeyDb();
  return { db, guard: createBudgetGuard(db), reader: notesReader() };
}
