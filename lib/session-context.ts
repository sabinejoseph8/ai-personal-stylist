import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stylistContext } from "@/core/notes/context";
import { loadNotes, loadQuestion } from "@/lib/notes-store";
import { preferencesOf } from "@/lib/notes-service";
import { activePhoto } from "@/lib/photos-service";

/**
 * What the stylist is told after a photo change (3b): the same context the notes send, with the item
 * to style around as it now is, so she can name it and ask about it.
 */
export async function sessionContext(db: SupabaseClient, guestId: string, sessionId: string) {
  const [{ notes }, preferences, { question }, photo] = await Promise.all([
    loadNotes(db, sessionId),
    preferencesOf(db, guestId),
    loadQuestion(db, sessionId),
    activePhoto(db, sessionId),
  ]);
  return stylistContext(notes, preferences, question, photo?.item ?? null);
}
