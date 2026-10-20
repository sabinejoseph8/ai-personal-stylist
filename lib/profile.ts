import { z } from "zod";

// The guest's profile (R4) and the sample profile (R5). Shared by the server actions and the screens.

export const DEPARTMENTS = ["womenswear", "menswear"] as const;
export const STYLE_WORDS = ["Classic", "Elegant", "Relaxed", "Minimal", "Bold", "Romantic", "Sporty", "Edgy", "Bohemian", "Preppy"] as const;
export const SIZE_FIELDS = [
  { key: "dress", label: "Dress", department: "womenswear" },
  { key: "top", label: "Top", department: null },
  { key: "bottoms", label: "Bottoms", department: null },
  { key: "suit", label: "Suit jacket", department: "menswear" },
  { key: "shoes", label: "Shoes", department: null },
] as const;
export const PREFERENCE_KINDS = [
  { kind: "must_have", label: "Must have", hint: "For example: sleeves", firm: true },
  { kind: "never", label: "Never", hint: "For example: high heels", firm: true },
  { kind: "likes", label: "Likes", hint: "For example: earth tones", firm: false },
] as const;
export type PreferenceKind = (typeof PREFERENCE_KINDS)[number]["kind"];

const sizeValue = z.string().trim().max(12);

export const ShoppingSchema = z.object({
  departments: z.array(z.enum(DEPARTMENTS)).max(2),
  styleWords: z.array(z.enum(STYLE_WORDS)).max(STYLE_WORDS.length),
  sizes: z.object({
    dress: sizeValue.optional(),
    top: sizeValue.optional(),
    bottoms: sizeValue.optional(),
    suit: sizeValue.optional(),
    shoes: sizeValue.optional(),
  }),
});
export type Shopping = z.infer<typeof ShoppingSchema>;

const dollars = z.number().int().min(1).max(100000);
export const BudgetSchema = z
  .discriminatedUnion("meaning", [
    z.object({ meaning: z.literal("up_to"), amount: dollars }),
    z.object({ meaning: z.literal("around"), amount: dollars }),
    z.object({ meaning: z.literal("between"), amount: dollars, max: dollars }),
  ])
  .refine((b) => b.meaning !== "between" || b.max > b.amount, { message: "The second amount must be higher." })
  .nullable();
export type Budget = z.infer<typeof BudgetSchema>;

export const PreferencesSchema = z.array(
  z.object({ kind: z.enum(["must_have", "never", "likes"]), words: z.string().trim().min(1).max(80) }),
).max(30);
export type Preferences = z.infer<typeof PreferencesSchema>;

export type Profile = Shopping & { budget: Budget; preferences: Preferences };

export const EMPTY_PROFILE: Profile = { departments: [], styleWords: [], sizes: {}, budget: null, preferences: [] };

/** The sample profile (R5): includes "Never: high heels" so the preference check shows straight away. */
export const SAMPLE_PROFILE: Profile = {
  departments: ["womenswear"],
  styleWords: ["Classic", "Elegant"],
  sizes: { dress: "8", top: "M", bottoms: "30", shoes: "7" },
  budget: { meaning: "up_to", amount: 400 },
  preferences: [
    { kind: "never", words: "high heels" },
    { kind: "must_have", words: "sleeves" },
    { kind: "likes", words: "earth tones" },
  ],
};

/** "Up to $400", "Around $300" or "$200 to $300". */
export function describeBudget(budget: Budget): string | null {
  if (!budget) return null;
  if (budget.meaning === "up_to") return `Up to $${budget.amount}`;
  if (budget.meaning === "around") return `Around $${budget.amount}`;
  return `$${budget.amount} to $${budget.max}`;
}

export function describePreference(p: { kind: PreferenceKind; words: string }): string {
  return `${PREFERENCE_KINDS.find((k) => k.kind === p.kind)!.label}: ${p.words}`;
}

export function isEmpty(profile: Profile): boolean {
  return (
    !profile.departments.length &&
    !profile.styleWords.length &&
    !Object.values(profile.sizes).some(Boolean) &&
    !profile.budget &&
    !profile.preferences.length
  );
}
