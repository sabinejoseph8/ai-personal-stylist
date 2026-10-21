import { active, type Note } from "../notes/types";

// The budget a look must fit (4a; R42, R49). A confirmed budget note in the session beats the default
// budget in the profile; a budget note still To confirm isn't used (R40). "Around" allows up to 10%
// over (Sabine's answer to Q2 in 4a). Pure rules, tested in tests/looks-budget.test.ts.

export type BudgetLimit = { meaning: "up_to" | "around" | "between"; amount: number; max?: number; from: "notes" | "profile" };
type ProfileBudget = { meaning: "up_to" | "around" | "between"; amount: number; max?: number } | null;

/** How far over an "around" budget still fits. */
export const AROUND_ALLOWANCE = 0.1;

const whole = (s: string | undefined) => (s && /^\d{1,6}$/.test(s) ? Number(s) : null);

/** The budget for this session's looks, or null when there's none. */
export function budgetFrom(notes: Note[], profile: ProfileBudget): BudgetLimit | null {
  const note = active(notes).find((n) => n.kind === "budget" && n.status === "confirmed");
  if (note) {
    const d = Object.fromEntries(note.details.map((x) => [x.name, x.value]));
    const [min, max, around] = [whole(d.min), whole(d.max), whole(d.around)];
    if (min && max && max > min) return { meaning: "between", amount: min, max, from: "notes" };
    if (max) return { meaning: "up_to", amount: max, from: "notes" };
    if (around) return { meaning: "around", amount: around, from: "notes" };
  }
  if (!profile) return null;
  return profile.meaning === "between" ? { meaning: "between", amount: profile.amount, max: profile.max, from: "profile" } : { meaning: profile.meaning, amount: profile.amount, from: "profile" };
}

/** The most a look may cost, in cents. */
export function limitCents(b: BudgetLimit): number {
  if (b.meaning === "between") return (b.max ?? b.amount) * 100;
  if (b.meaning === "around") return Math.round(b.amount * 100 * (1 + AROUND_ALLOWANCE));
  return b.amount * 100;
}

/** "$312", or "$312.50" when there are cents. */
export const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

/** How a total compares with the budget, in the design's words (design 4.3): "$38 under your $350 limit". */
export function compareWithBudget(totalCents: number, b: BudgetLimit | null): { fits: boolean; words: string | null } {
  if (!b) return { fits: true, words: null };
  const fits = totalCents <= limitCents(b);
  if (b.meaning === "between") {
    const range = `$${b.amount} to $${b.max}`;
    if (totalCents > (b.max ?? 0) * 100) return { fits, words: `${dollars(totalCents - (b.max ?? 0) * 100)} over your ${range} budget` };
    if (totalCents < b.amount * 100) return { fits, words: `${dollars(b.amount * 100 - totalCents)} under your ${range} budget` };
    return { fits, words: `Within your ${range} budget` };
  }
  const name = b.meaning === "around" ? `budget of around $${b.amount}` : `$${b.amount} limit`;
  const gap = totalCents - b.amount * 100;
  if (gap === 0) return { fits, words: `Right at your ${name}` };
  return { fits, words: `${dollars(Math.abs(gap))} ${gap > 0 ? "over" : "under"} your ${name}` };
}
