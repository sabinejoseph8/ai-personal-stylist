"use server";

import { currentGuest } from "@/lib/guest";
import { BudgetSchema, PreferencesSchema, SAMPLE_PROFILE, ShoppingSchema } from "@/lib/profile";
import { rememberPreferencesAllowed } from "@/lib/privacy-service";
import { saveBudget, savePreferences, saveShopping } from "@/lib/profile-store";
import { serverKeyDb } from "@/lib/supabase/admin";

// Setup answers are saved to the guest's own profile as they go (R4). Every input is checked first.
type Result = { ok: true } | { ok: false; error: string };

async function asGuest(run: (guest: NonNullable<Awaited<ReturnType<typeof currentGuest>>>) => Promise<void>): Promise<Result> {
  const guest = await currentGuest();
  if (!guest) return { ok: false, error: "Your demo has ended. Start again from the welcome screen." };
  try {
    await run(guest);
    return { ok: true };
  } catch {
    return { ok: false, error: "That didn't save. Please try again." };
  }
}

export async function saveShoppingStep(input: unknown): Promise<Result> {
  const parsed = ShoppingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some of those answers aren't valid." };
  return asGuest((g) => saveShopping(g.db, g.id, parsed.data));
}

export async function saveBudgetAndPreferencesStep(input: unknown): Promise<Result> {
  const budget = BudgetSchema.safeParse((input as { budget?: unknown })?.budget ?? null);
  const preferences = PreferencesSchema.safeParse((input as { preferences?: unknown })?.preferences ?? []);
  if (!budget.success) return { ok: false, error: budget.error.issues[0]?.message ?? "That budget isn't valid." };
  if (!preferences.success) return { ok: false, error: "Some preferences are too long." };
  return asGuest(async (g) => {
    await saveBudget(g.db, g.id, budget.data);
    await savePreferences(g.db, preferences.data);
    // Saving preferences records the permission (R64, Sabine's answer to Q3 in 6b).
    if (preferences.data.length) await rememberPreferencesAllowed(serverKeyDb(), g.id);
  });
}

/** Use a sample profile (R5). */
export async function applySampleProfile(): Promise<Result> {
  return asGuest(async (g) => {
    const { budget, preferences, ...shopping } = SAMPLE_PROFILE;
    await saveShopping(g.db, g.id, shopping);
    await saveBudget(g.db, g.id, budget);
    await savePreferences(g.db, preferences);
    await rememberPreferencesAllowed(serverKeyDb(), g.id);
  });
}
