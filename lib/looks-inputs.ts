import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogConnector } from "@/connectors/catalog/types";
import { budgetFrom } from "@/core/looks/budget";
import { type FirmRule, filterCandidates, noteRules, outfitCategories, type Requirements } from "@/core/looks/candidates";
import type { Rule } from "@/core/looks/rules";
import { loadNotes } from "@/lib/notes-store";
import { loadProfile } from "@/lib/profile-store";

// What a session's looks must meet (4a; tech spec 1.3 steps 1 and 2): the profile's departments, sizes,
// budget and firm preferences, and the session's confirmed notes. Then the candidate filter narrows the
// catalog to the products that could appear. 4b's looks builder composes looks from what's kept.

const JUDGED: Rule = { type: "judged" };

/** The session's requirements, with the server key (the profile's rows and the session's notes). */
export async function lookRequirements(db: SupabaseClient, guestId: string, sessionId: string): Promise<Requirements> {
  const [profile, { notes }] = await Promise.all([loadProfile(db, guestId), loadNotes(db, sessionId)]);
  const fromProfile = profile.preferences.flatMap((p): FirmRule[] =>
    // A firm preference without a rule yet is judged by the checker, which counts uncertainty as a fail.
    p.kind === "likes" ? [] : [{ kind: p.kind, words: p.words, rule: p.rule ?? JUDGED, from: "profile" }],
  );
  return {
    departments: profile.departments,
    categories: outfitCategories(notes),
    sizes: profile.sizes,
    budget: budgetFrom(notes, profile.budget),
    rules: [...fromProfile, ...noteRules(notes)],
  };
}

/** The products that could appear in this session's looks, and those left out with the reason. */
export async function candidateProducts(deps: { db: SupabaseClient; catalog: CatalogConnector }, guestId: string, sessionId: string) {
  const requirements = await lookRequirements(deps.db, guestId, sessionId);
  const department = requirements.departments.length === 1 ? requirements.departments[0] : undefined;
  const products = await deps.catalog.search({ department, limit: 1000 });
  return { requirements, ...filterCandidates(products, requirements) };
}
