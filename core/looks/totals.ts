import { type BudgetLimit, compareWithBudget, dollars } from "./budget";

// A look's total (4a, R42): the sample products to buy, never the shopper's own items (the photo item
// marked "You own this", and wardrobe items), and how it compares with the budget. Plain code, never
// an AI (tech spec 5, pattern 7). Tested in tests/looks-budget.test.ts.

/** An item in a look: a sample product with its price, or something the shopper owns. */
export type TotalItem = { owned: false; priceCents: number } | { owned: true };

export type LookTotal = {
  totalCents: number;
  /** "$312 to buy, owned items not included" (design 4.3). */
  toBuy: string;
  /** "$38 under your $350 limit", or null without a budget. */
  comparison: string | null;
  fits: boolean;
};

export function lookTotal(items: TotalItem[], budget: BudgetLimit | null): LookTotal {
  const totalCents = items.reduce((sum, item) => sum + (item.owned ? 0 : item.priceCents), 0);
  const { fits, words } = compareWithBudget(totalCents, budget);
  return { totalCents, toBuy: `${dollars(totalCents)} to buy, owned items not included`, comparison: words, fits };
}
