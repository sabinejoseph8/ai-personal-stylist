import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stylistContext } from "@/core/notes/context";
import { loadNotes, loadQuestion } from "@/lib/notes-store";
import { preferencesOf } from "@/lib/notes-service";
import { activePhoto } from "@/lib/photos-service";
import { stylingPicks } from "@/lib/wardrobe-service";

/**
 * What the stylist is told after a photo change (3b), and as a call starts (3d): the same context the
 * notes send, with the item to style around as it now is and the wardrobe items chosen to style with.
 */
export async function sessionContext(db: SupabaseClient, guestId: string, sessionId: string) {
  const [{ notes }, preferences, { question }, photo, wardrobe] = await Promise.all([
    loadNotes(db, sessionId),
    preferencesOf(db, guestId),
    loadQuestion(db, sessionId),
    activePhoto(db, sessionId),
    stylingPicks(db, guestId),
  ]);
  return stylistContext(notes, preferences, question, photo?.item ?? null, wardrobe);
}
