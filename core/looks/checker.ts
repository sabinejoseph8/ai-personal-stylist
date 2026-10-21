import type { BudgetLimit } from "./budget";
import { type Requirements, ruleLabel, whyNot } from "./candidates";
import { duplicated, incomplete, type ResolvedItem } from "./look";
import { describeRule } from "./rules";
import { lookTotal } from "./totals";

// The preference checker's first step (4b; R54 to R56, tech spec 5 pattern 6): rules in plain code on
// every look, even though the candidate filter already applied most of them, because the check trusts
// nothing that came before it. A missing detail is a fail. Only a look that passes here goes on to the
// judgment step (core/looks/judge.ts). Pure rules, tested in tests/checker.test.ts.

/** One line of a check's decision record: what it's about, whether it holds, and why. Shown in Behind the scenes (4d). */
export type CheckReason = { about: string; ok: boolean; why: string };

/** The item to style around: in every look if it's the shopper's own; never in one if it's an inspiration. */
export type Anchor = { photoId: string; version: number; name: string; owned: boolean };

export type CodeCheckInput = {
  items: ResolvedItem[];
  requirements: Requirements;
  anchor: Anchor | null;
  /** Wardrobe items chosen with Style with these: a look may only use these. */
  wardrobePicks: string[];
};

/** "your $350 limit", as the budget comparison says it. */
export const budgetWords = (b: BudgetLimit) => (b.meaning === "between" ? `your $${b.amount} to $${b.max} budget` : b.meaning === "around" ? `your budget of around $${b.amount}` : `your $${b.amount} limit`);

/** Every code rule on a look, each with its reason. The look passes this step only when all hold. */
export function codeCheck({ items, requirements, anchor, wardrobePicks }: CodeCheckInput): { ok: boolean; reasons: CheckReason[]; failedProducts: string[] } {
  const reasons: CheckReason[] = [];
  const failedProducts: string[] = [];

  // Each sample product, against the same rules as the candidate filter.
  for (const item of items) {
    if (!("product" in item)) continue;
    const why = whyNot(item.product, requirements);
    if (why) {
      reasons.push({ about: why.rule ? ruleLabel(why.rule) : item.product.name, ok: false, why: `${item.product.name}: ${why.reason}` });
      failedProducts.push(item.product.id);
    }
  }
  // Each firm rule, said once, so the record shows what was checked (design 4.4, Behind the scenes).
  for (const rule of requirements.rules) {
    if (rule.rule.type === "judged") continue;
    if (!reasons.some((r) => r.about === ruleLabel(rule) && !r.ok)) reasons.push({ about: ruleLabel(rule), ok: true, why: describeRule(rule.kind, rule.rule) });
  }

  const total = lookTotal(
    items.map((i) => ("product" in i ? { owned: false, priceCents: i.product.price.amountCents } : { owned: true })),
    requirements.budget,
  );
  if (requirements.budget) reasons.push({ about: "Budget", ok: total.fits, why: total.comparison ?? "" });

  if (anchor?.owned) {
    const has = items.some((i) => i.ref.kind === "photo" && i.ref.photoId === anchor.photoId && i.ref.version === anchor.version);
    reasons.push({ about: "Your item to style around", ok: has, why: has ? `Includes your ${anchor.name}` : `Leaves out your ${anchor.name}` });
  }
  if (items.some((i) => i.ref.kind === "photo" && !(anchor?.owned && i.ref.photoId === anchor.photoId)))
    reasons.push({ about: "Your item to style around", ok: false, why: "Uses a photo item that isn't yours to style around" });
  const strangers = items.filter((i) => i.ref.kind === "wardrobe" && !wardrobePicks.includes(i.ref.itemId));
  if (strangers.length) reasons.push({ about: "Wardrobe", ok: false, why: "Uses a wardrobe item you didn't choose to style with" });

  const notWhole = duplicated(items.map((i) => i.ref)) ? "The same item twice" : incomplete(items);
  reasons.push({ about: "Outfit", ok: !notWhole, why: notWhole ?? "A complete outfit" });

  return { ok: reasons.every((r) => r.ok), reasons, failedProducts };
}

