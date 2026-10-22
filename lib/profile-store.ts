import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Budget, Preferences, Profile, Shopping } from "@/lib/profile";

// Reads and writes the signed-in guest's profile. Access rules keep every guest to their own rows.

type ProfileRow = {
  departments: string[];
  style_words: string[];
  sizes: Record<string, string>;
  budget_amount_cents: number | null;
  budget_meaning: "up_to" | "around" | "between" | null;
  budget_max_cents: number | null;
};

function budgetFromRow(row: ProfileRow): Budget {
  if (!row.budget_meaning || !row.budget_amount_cents) return null;
  const amount = Math.round(row.budget_amount_cents / 100);
  if (row.budget_meaning === "between") return { meaning: "between", amount, max: Math.round((row.budget_max_cents ?? 0) / 100) };
  return { meaning: row.budget_meaning, amount };
}

export async function loadProfile(db: SupabaseClient, userId: string): Promise<Profile> {
  const [profile, prefs] = await Promise.all([
    db.from("profiles").select("departments, style_words, sizes, budget_amount_cents, budget_meaning, budget_max_cents").eq("user_id", userId).maybeSingle<ProfileRow>(),
    db.from("saved_preferences").select("id, kind, words, rule").eq("user_id", userId).order("created_at"),
  ]);
  const row = profile.data;
  return {
    departments: (row?.departments ?? []) as Profile["departments"],
    styleWords: (row?.style_words ?? []) as Profile["styleWords"],
    sizes: row?.sizes ?? {},
    budget: row ? budgetFromRow(row) : null,
    // A rule is left out until it's been made (4a): setup makes the missing ones.
    preferences: (prefs.data ?? []).map((p) => ({ id: p.id, kind: p.kind, words: p.words, ...(p.rule ? { rule: p.rule } : {}) })) as Preferences,
  };
}

async function upsertProfile(db: SupabaseClient, userId: string, fields: Partial<ProfileRow>) {
  const { error } = await db
    .from("profiles")
    .upsert({ user_id: userId, ...fields, last_active_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(`saving the profile failed: ${error.message}`);
}

export async function saveShopping(db: SupabaseClient, userId: string, shopping: Shopping) {
  const sizes = Object.fromEntries(Object.entries(shopping.sizes).filter(([, v]) => v && v.trim()));
  await upsertProfile(db, userId, { departments: shopping.departments, style_words: shopping.styleWords, sizes });
}

export async function saveBudget(db: SupabaseClient, userId: string, budget: Budget) {
  await upsertProfile(db, userId, {
    budget_meaning: budget?.meaning ?? null,
    budget_amount_cents: budget ? budget.amount * 100 : null,
    budget_max_cents: budget?.meaning === "between" ? budget.max * 100 : null,
  });
}

/** Replaces the signed-in guest's saved preferences with this list, all or nothing, in one database step. */
export async function savePreferences(db: SupabaseClient, preferences: Preferences) {
  const items = preferences.map((p) => ({ kind: p.kind, words: p.words, rule: p.rule ?? null }));
  const { error } = await db.rpc("replace_saved_preferences", { items });
  if (error) throw new Error(`saving preferences failed: ${error.message}`);
}
