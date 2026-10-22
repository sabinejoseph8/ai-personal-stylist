import type { Department, Product } from "../../connectors/catalog/types";
import type { FirmPreference } from "./exceptions";
import { active, type Note } from "../notes/types";
import { type BudgetLimit, dollars, limitCents } from "./budget";
import { CATEGORIES, type Category, checkRule, describeRule, type FirmKind, type Rule } from "./rules";

// The candidate filter (4a; R40, R54 to R56, tech spec 1.3 step 2): before Claude composes any look,
// plain code narrows the catalog to the products that could appear. Department, the outfit's
// categories, sizes, the budget, and every firm rule: Must have and Never preferences, and confirmed
// notes such as "Not black". Notes still To confirm aren't filters (R40). Every product left out is
// recorded with the reason, for Behind the scenes (4d). Pure rules, tested in tests/candidates.test.ts.

/** A firm rule to apply, from a saved preference or a confirmed note, with the words the shopper sees. */
/** `id` is the saved preference's, for one from the profile: a "This session only" exception names it (5c). */
export type FirmRule = { kind: FirmKind; words: string; rule: Rule; from: "profile" | "notes"; id?: string };

export type SizeField = "dress" | "top" | "bottoms" | "suit" | "shoes";

export type Requirements = {
  /** The profile's departments; none means both. */
  departments: Department[];
  /** The categories the outfit type needs, or null for any. */
  categories: Category[] | null;
  sizes: Partial<Record<SizeField, string>>;
  budget: BudgetLimit | null;
  rules: FirmRule[];
};

/** What kind of requirement left a product out, so a no-match explanation can name it (4b). */
export type LeftOutKind = "department" | "outfit" | "category" | "size" | "budget" | "rule";
/** A product the filter left out, and why; `rule` names the firm rule when one did it. */
/** `preference` is the saved Must have or Never that left it out, which can be allowed for a session (5c). */
export type LeftOut = { productId: string; name: string; category: string; kind: LeftOutKind; reason: string; rule?: string; preference?: FirmPreference };

const ONE_SIZE = "one size";

/** Which profile size a product is bought in, or null when it isn't sized (bags and accessories). */
export function sizeFieldOf(department: Department, category: string): SizeField | null {
  if (category === "dress") return "dress";
  if (category === "suit") return department === "womenswear" ? "dress" : "suit";
  if (category === "blazer") return department === "womenswear" ? "top" : "suit";
  if (["top", "shirt", "t-shirt", "knitwear", "cardigan", "jacket", "coat"].includes(category)) return "top";
  if (["trousers", "jeans", "skirt", "shorts"].includes(category)) return "bottoms";
  if (category === "shoes") return "shoes";
  return null;
}

const OUTER: Category[] = ["blazer", "jacket", "coat", "cardigan"];
const FINISH: Category[] = ["shoes", "bag", "accessory"];
const TOPS: Category[] = ["top", "shirt", "t-shirt", "knitwear"];
/** The categories an outfit type needs, by the words of an "outfit" note detail. */
const OUTFITS: [RegExp, Category[]][] = [
  [/\bdress/, ["dress", ...OUTER, ...FINISH]],
  [/\b(pant\s?suit|suit)/, ["suit", "blazer", "trousers", ...TOPS, ...OUTER, ...FINISH]],
  [/\bskirt/, ["skirt", ...TOPS, ...OUTER, ...FINISH]],
  [/\bjeans/, ["jeans", ...TOPS, ...OUTER, ...FINISH]],
  [/\bshorts/, ["shorts", ...TOPS, ...OUTER, ...FINISH]],
  [/\b(trousers|pants|slacks)/, ["trousers", ...TOPS, ...OUTER, ...FINISH]],
];

/** The categories for a confirmed outfit note ("outfit=dress"), or null when there's none or it's unknown. */
export function outfitCategories(notes: Note[]): Category[] | null {
  const outfit = active(notes)
    .filter((n) => n.status === "confirmed")
    .flatMap((n) => n.details)
    .find((d) => d.name === "outfit")?.value.toLowerCase();
  if (!outfit) return null;
  const found = OUTFITS.find(([words]) => words.test(outfit));
  return found ? [...new Set(found[1])] : null;
}

/** Firm rules from confirmed notes: colors to avoid ("avoid=black"). */
export function noteRules(notes: Note[]): FirmRule[] {
  return active(notes)
    .filter((n) => n.status === "confirmed")
    .flatMap((n) =>
      n.details
        .filter((d) => d.name === "avoid" && d.value.trim())
        .map((d): FirmRule => ({
          kind: "never",
          words: n.text,
          rule: { type: "detail", categories: [], test: { detail: "color", op: "one_of", values: [d.value.trim().toLowerCase()] } },
          from: "notes",
        })),
    );
}

/** A firm rule as the shopper knows it: "Never: high heels", or a note's own words ("Not black"). */
export const ruleLabel = (r: FirmRule) => (r.from === "profile" ? `${r.kind === "never" ? "Never" : "Must have"}: ${r.words}` : r.words);

/**
 * Why a product can't be in a look, or null when it can. The candidate filter uses it, and so does
 * the preference checker on every look (4b), which trusts nothing that came before it.
 */
export function whyNot(p: Product, req: Requirements): { kind: LeftOutKind; reason: string; rule?: FirmRule } | null {
  if (req.departments.length && !req.departments.includes(p.department)) return { kind: "department", reason: `Not ${req.departments.join(" or ")}` };
  if (req.categories && !req.categories.includes(p.category as Category)) return { kind: "outfit", reason: "Not part of this outfit" };
  if (!(CATEGORIES as readonly string[]).includes(p.category)) return { kind: "category", reason: `Unknown category: ${p.category}` };
  const field = sizeFieldOf(p.department, p.category);
  const size = field ? req.sizes[field]?.trim().toLowerCase() : undefined;
  if (size && !p.variants.some((v) => v.size.toLowerCase() === size || v.size.toLowerCase() === ONE_SIZE)) return { kind: "size", reason: `Not in your size (${req.sizes[field!]})` };
  if (req.budget && p.price.amountCents > limitCents(req.budget)) return { kind: "budget", reason: `Costs ${dollars(p.price.amountCents)}, more than your whole budget` };
  for (const r of req.rules) {
    const verdict = checkRule(r.kind, r.rule, p);
    if (!verdict.ok)
      return {
        kind: "rule",
        rule: r,
        reason: verdict.why === "unknown" ? `Missing a detail that ${ruleLabel(r)} needs` : `Breaks ${ruleLabel(r)} (${describeRule(r.kind, r.rule)})`,
      };
  }
  return null;
}

/** The products that could appear in a look, and every one left out with the reason. */
export function filterCandidates(products: Product[], req: Requirements): { kept: Product[]; leftOut: LeftOut[] } {
  const kept: Product[] = [];
  const leftOut: LeftOut[] = [];
  for (const p of products) {
    const why = whyNot(p, req);
    if (why)
      leftOut.push({
        productId: p.id,
        name: p.name,
        category: p.category,
        kind: why.kind,
        reason: why.reason,
        ...(why.rule ? { rule: ruleLabel(why.rule) } : {}),
        ...(why.rule?.id && why.rule.from === "profile" ? { preference: { id: why.rule.id, kind: why.rule.kind, words: why.rule.words } } : {}),
      });
    else kept.push(p);
  }
  return { kept, leftOut };
}
