import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type FirmPreference, type ShownException, shownException } from "@/core/looks/exceptions";
import { describePreference, type PreferenceKind } from "@/lib/profile";

// "This session only" exceptions (5c; R57, tech spec 4.1): Allow for this session, Remove and Save to
// my profile. Exceptions are the app's own record (migration server_owned_exceptions), written here with
// the server key once the session and the preference are checked to be the guest's. The looks pick the
// change up from the requirements (lib/looks-inputs.ts), which leave an allowed preference out.

async function ownSession(db: SupabaseClient, guestId: string, sessionId: string) {
  const { data } = await db.from("sessions").select("id").eq("id", sessionId).eq("user_id", guestId).in("status", ["active", "paused"]).maybeSingle().throwOnError();
  return Boolean(data);
}

/** The guest's saved Must have and Never preferences, with whether each is allowed in this session. */
export async function firmPreferences(db: SupabaseClient, guestId: string, sessionId: string): Promise<(FirmPreference & { allowed: boolean })[]> {
  const [prefs, allowed] = await Promise.all([
    db.from("saved_preferences").select("id, kind, words").eq("user_id", guestId).neq("kind", "likes").order("created_at").throwOnError(),
    db.from("session_exceptions").select("saved_preference_id").eq("session_id", sessionId).eq("user_id", guestId).throwOnError(),
  ]);
  const ids = new Set((allowed.data ?? []).map((r) => r.saved_preference_id as string));
  return (prefs.data ?? []).map((p) => ({ id: p.id as string, kind: p.kind as FirmPreference["kind"], words: p.words as string, allowed: ids.has(p.id as string) }));
}

const listed = async (db: SupabaseClient, guestId: string, sessionId: string): Promise<ShownException[]> =>
  (await firmPreferences(db, guestId, sessionId)).filter((p) => p.allowed).map((p) => shownException({ id: p.id, kind: p.kind, words: p.words }));

/** The session's exceptions, or null when the session isn't the guest's open one. */
export async function listExceptions(db: SupabaseClient, guestId: string, sessionId: string): Promise<ShownException[] | null> {
  if (!(await ownSession(db, guestId, sessionId))) return null;
  return listed(db, guestId, sessionId);
}

/** Allow for this session: null when the session or the preference isn't the guest's, or it's a Like. */
export async function allowException(db: SupabaseClient, guestId: string, sessionId: string, preferenceId: string): Promise<ShownException[] | null> {
  if (!(await ownSession(db, guestId, sessionId))) return null;
  const { data: pref } = await db.from("saved_preferences").select("id, kind").eq("id", preferenceId).eq("user_id", guestId).maybeSingle().throwOnError();
  if (!pref || pref.kind === "likes") return null;
  await db
    .from("session_exceptions")
    .upsert({ user_id: guestId, session_id: sessionId, saved_preference_id: preferenceId }, { onConflict: "session_id,saved_preference_id", ignoreDuplicates: true })
    .throwOnError();
  return listed(db, guestId, sessionId);
}

/** Remove: the preference limits this session's looks again. */
export async function removeException(db: SupabaseClient, guestId: string, sessionId: string, preferenceId: string): Promise<ShownException[] | null> {
  if (!(await ownSession(db, guestId, sessionId))) return null;
  await db.from("session_exceptions").delete().eq("session_id", sessionId).eq("user_id", guestId).eq("saved_preference_id", preferenceId).throwOnError();
  return listed(db, guestId, sessionId);
}

/**
 * Save to my profile (Sabine's answer to Q2 in 5c): takes the preference off the profile, so later
 * sessions allow it too, and with it the exception. Only for a preference allowed in this session.
 * Answers with the exceptions and the saved preferences left, as the notebook shows them.
 */
export async function saveExceptionToProfile(db: SupabaseClient, guestId: string, sessionId: string, preferenceId: string): Promise<{ exceptions: ShownException[]; preferences: string[] } | null> {
  if (!(await ownSession(db, guestId, sessionId))) return null;
  const { data: allowed } = await db.from("session_exceptions").select("id").eq("session_id", sessionId).eq("user_id", guestId).eq("saved_preference_id", preferenceId).maybeSingle().throwOnError();
  if (!allowed) return null;
  // The exception goes with it (its foreign key cascades).
  await db.from("saved_preferences").delete().eq("id", preferenceId).eq("user_id", guestId).throwOnError();
  const { data: left } = await db.from("saved_preferences").select("kind, words").eq("user_id", guestId).order("created_at").throwOnError();
  return { exceptions: await listed(db, guestId, sessionId), preferences: (left ?? []).map((p) => describePreference({ kind: p.kind as PreferenceKind, words: p.words as string })) };
}
