import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { budgetFrom } from "@/core/looks/budget";
import { type FirmRule, noteRules, outfitCategories, type Requirements } from "@/core/looks/candidates";
import type { Rule } from "@/core/looks/rules";
import { type Profile, RuleSchema } from "@/lib/profile";
import { loadNotes } from "@/lib/notes-store";
import { loadProfile } from "@/lib/profile-store";

// What a session's looks must meet (4a; tech spec 1.3 steps 1 and 2): the profile's departments, sizes,
// budget and firm preferences, and the session's confirmed notes. Then the candidate filter narrows the
// catalog to the products that could appear. 4b's looks builder composes looks from what's kept. A saved
// preference allowed for this session only (5c, R57) doesn't limit this session's looks.

const JUDGED: Rule = { type: "judged" };

/** The saved preferences allowed for this session only (5c, R57), by id. */
export async function sessionExceptions(db: SupabaseClient, sessionId: string): Promise<Set<string>> {
  const { data } = await db.from("session_exceptions").select("saved_preference_id").eq("session_id", sessionId).throwOnError();
  return new Set((data ?? []).map((r) => r.saved_preference_id as string));
}

/** The profile's firm preferences as rules, leaving out the ones allowed for this session. */
const firmRules = (profile: Profile, allowed: Set<string>) =>
  profile.preferences.flatMap((p): FirmRule[] =>
    // A firm preference without a rule yet is judged by the checker, which counts uncertainty as a fail.
    // So is one whose stored rule isn't the right shape: a guest can write their own rows (4e review).
    p.kind === "likes" || (p.id && allowed.has(p.id)) ? [] : [{ kind: p.kind, words: p.words, rule: RuleSchema.safeParse(p.rule).data ?? JUDGED, from: "profile", id: p.id }],
  );

/** The session's requirements, with the server key (the profile's rows and the session's notes). */
export async function lookRequirements(db: SupabaseClient, guestId: string, sessionId: string): Promise<Requirements> {
  const [profile, { notes }, allowed] = await Promise.all([loadProfile(db, guestId), loadNotes(db, sessionId), sessionExceptions(db, sessionId)]);
  return {
    departments: profile.departments,
    categories: outfitCategories(notes),
    sizes: profile.sizes,
    budget: budgetFrom(notes, profile.budget),
    rules: [...firmRules(profile, allowed), ...noteRules(notes)],
  };
}

/** What a saved look is checked against when it's opened outside a session (6a, Sabine's answer to Q1): the saved profile alone. */
export function profileRequirements(profile: Profile): Requirements {
  return { departments: profile.departments, categories: null, sizes: profile.sizes, budget: budgetFrom([], profile.budget), rules: firmRules(profile, new Set()) };
}
