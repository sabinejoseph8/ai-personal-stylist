// Firm preference rules (4a; R4, R54 to R56, tech spec 5 pattern 6). A Must have or Never preference is
// words ("Never: high heels"); the rule maker turns it into a rule on the products' details ("shoes with
// heels over 5 cm") that plain code checks, so the core promise never rests on an AI's judgment. A
// preference that isn't about a product detail ("Never: anything too flashy") is judged by the
// preference checker instead (Sabine's answer to Q3 in 4a). Pure rules, tested in tests/rules.test.ts.

import { DETAILS_BY_CATEGORY } from "../../connectors/catalog/required-details";

/** The catalog's categories (connectors/catalog/required-details.ts). */
export const CATEGORIES = [
  "dress",
  "top",
  "shirt",
  "t-shirt",
  "knitwear",
  "cardigan",
  "blazer",
  "suit",
  "jacket",
  "coat",
  "trousers",
  "jeans",
  "skirt",
  "shorts",
  "shoes",
  "bag",
  "accessory",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Details measured in numbers: heel height in cm, and formality from 1 (casual) to 5 (black tie). */
export const NUMBER_DETAILS = ["heelCm", "formality"] as const;
/** Details with a fixed set of values in the catalog. Every catalog value is listed (checked by tests). */
export const WORD_VALUES = {
  sleeve: ["sleeveless", "cap", "short", "elbow", "three_quarter", "long"],
  neckline: ["round", "v", "square", "sweetheart", "boat", "high", "turtleneck", "cowl", "one_shoulder", "collared", "lapel", "camp", "henley", "ribbed", "ruffle", "hood", "zip"],
  coverage: ["waist", "hip", "mini", "mid_thigh", "above_knee", "knee", "midi", "maxi", "full_length"],
  toe: ["open", "closed"],
  category: CATEGORIES,
} as const;
/** Details matched by words, such as "black" in "black" or "leather" in "patent leather". */
export const FREE_DETAILS = ["color", "material", "pattern", "style"] as const;

type NumberDetail = (typeof NUMBER_DETAILS)[number];
type WordDetail = keyof typeof WORD_VALUES;
type FreeDetail = (typeof FREE_DETAILS)[number];

export type RuleTest =
  | { detail: NumberDetail; op: "over" | "under" | "at_least" | "at_most"; value: number }
  | { detail: WordDetail | FreeDetail; op: "one_of"; values: string[] };

/**
 * A firm rule. "detail": a test on the products in these categories; none listed means every category
 * the detail applies to (sleeves to tops, dresses and jackets; heels to shoes). "judged": checked by the
 * preference checker's judgment step (4b).
 */
export type Rule = { type: "detail"; categories: Category[]; test: RuleTest } | { type: "judged" };
export type FirmKind = "must_have" | "never";

/** What a rule reads from a product: the catalog's details, colors, style tags and category. */
export type Checkable = {
  category: string;
  colors: string[];
  styleTags: string[];
  details: { formality?: number; material?: string; pattern?: string; heelCm?: number; toe?: string; sleeve?: string; neckline?: string; coverage?: string };
};

const words = (s: string) => s.toLowerCase().replace(/[_-]+/g, " ").trim();

/** The product's value for a detail, or undefined when it's missing. */
function valueOf(p: Checkable, detail: RuleTest["detail"]): number | string | string[] | undefined {
  if (detail === "color") return p.colors.length ? p.colors : undefined;
  if (detail === "style") return p.styleTags.length ? p.styleTags : undefined;
  if (detail === "category") return p.category;
  return p.details[detail];
}

/** Whether the product passes the test, or "unknown" when the detail is missing. */
function passes(p: Checkable, test: RuleTest): boolean | "unknown" {
  const value = valueOf(p, test.detail);
  if (value === undefined || value === null || value === "") return "unknown";
  if (test.op !== "one_of") {
    if (typeof value !== "number") return "unknown";
    if (test.op === "over") return value > test.value;
    if (test.op === "under") return value < test.value;
    if (test.op === "at_least") return value >= test.value;
    return value <= test.value;
  }
  const have = (Array.isArray(value) ? value : [String(value)]).map(words);
  const wanted = test.values.map(words);
  // Fixed values match exactly; free words match inside a value ("green" in "emerald green").
  const exact = test.detail in WORD_VALUES;
  return have.some((h) => wanted.some((w) => (exact ? h === w : ` ${h} `.includes(` ${w} `))));
}

export type RuleVerdict = { ok: true } | { ok: false; why: "breaks" | "unknown" };

/** The categories a detail applies to, from the catalog's required details; colors and the like apply to all. */
function appliesTo(detail: RuleTest["detail"]): readonly Category[] {
  const scoped = CATEGORIES.filter((c) => (DETAILS_BY_CATEGORY[c] as string[] | undefined)?.includes(detail));
  return scoped.length ? scoped : CATEGORIES;
}

/** The categories a rule checks. */
const scopeOf = (rule: Extract<Rule, { type: "detail" }>) => (rule.categories.length ? rule.categories : appliesTo(rule.test.detail));

/**
 * Whether a product is allowed by a firm rule. Never: products the test describes are out. Must have:
 * products in the rule's categories must pass the test. A missing detail is never a pass (R56). Judged
 * rules are left to the preference checker, so they allow everything here.
 */
export function checkRule(kind: FirmKind, rule: Rule, p: Checkable): RuleVerdict {
  if (rule.type === "judged") return { ok: true };
  if (!scopeOf(rule).includes(p.category as Category)) return { ok: true };
  const result = passes(p, rule.test);
  if (result === "unknown") return { ok: false, why: "unknown" };
  const allowed = kind === "never" ? !result : result;
  return allowed ? { ok: true } : { ok: false, why: "breaks" };
}

// The read-back (Sabine's answer to Q1 in 4a): made by code from the rule itself, so what the shopper
// confirms is exactly what's checked.

const PLURAL: Record<Category, string> = {
  dress: "dresses",
  top: "tops",
  shirt: "shirts",
  "t-shirt": "T-shirts",
  knitwear: "knitwear",
  cardigan: "cardigans",
  blazer: "blazers",
  suit: "suits",
  jacket: "jackets",
  coat: "coats",
  trousers: "trousers",
  jeans: "jeans",
  skirt: "skirts",
  shorts: "shorts",
  shoes: "shoes",
  bag: "bags",
  accessory: "accessories",
};

const list = (items: string[], joiner = "or") =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${joiner} ${items.at(-1)}`;

const NUMBER_WORDS: Record<NumberDetail, (op: string, n: number) => string> = {
  heelCm: (op, n) => `heels ${{ over: "over", under: "under", at_least: "of at least", at_most: "of at most" }[op]} ${n} cm`,
  formality: (op, n) => `formality ${{ over: "over", under: "under", at_least: "of at least", at_most: "of at most" }[op]} ${n} out of 5`,
};

/** How a catalog value reads in a sentence. */
const SHOWN: Record<string, string> = {
  three_quarter: "three-quarter",
  mid_thigh: "mid-thigh",
  above_knee: "above-the-knee",
  full_length: "full",
  one_shoulder: "one-shoulder",
};
/** "a" or "an", by the word that follows. */
const article = (next: string) => (/^[aeiou]/i.test(next) ? "an" : "a");

/** "sleeveless", or "aren't sleeveless" when the values cover most of a fixed set. */
function describeValues(detail: WordDetail | FreeDetail, values: string[]): string {
  const shown = (vs: readonly string[]) => vs.map((v) => SHOWN[v] ?? words(v));
  const all = WORD_VALUES[detail as WordDetail] as readonly string[] | undefined;
  const pick = shown(values);
  if (detail === "sleeve") {
    const others = all!.filter((v) => !values.includes(v));
    if (values.length > all!.length / 2) return `with sleeves${others.length ? ` (not ${list(shown(others))})` : ""}`;
    return pick.includes("sleeveless") && pick.length === 1 ? "that are sleeveless" : `with ${list(pick)} sleeves`;
  }
  if (detail === "neckline") return `with ${article(pick[0])} ${list(pick)} neckline`;
  if (detail === "coverage") return `that are ${list(pick)} length`;
  if (detail === "toe") return `with ${list(pick)} toes`;
  if (detail === "color") return `in ${list(pick)}`;
  if (detail === "material") return `made of ${list(pick)}`;
  if (detail === "pattern") return `with ${article(pick[0])} ${list(pick)} pattern`;
  return `in ${article(pick[0])} ${list(pick)} style`;
}

/** What a detail's own categories are called, for a rule that lists none. */
const GROUPS: Partial<Record<RuleTest["detail"], string[]>> = {
  sleeve: ["tops", "dresses", "jackets"],
  neckline: ["tops", "dresses", "jackets"],
  coverage: ["clothes"],
  heelCm: ["shoes"],
  toe: ["shoes"],
};

/** How the app reads a firm preference, in plain words: "No shoes with heels over 5 cm". */
export function describeRule(kind: FirmKind, rule: Rule): string {
  if (rule.type === "judged") return "Checked by your stylist's judgment";
  const { test } = rule;
  if (test.detail === "category") return `No ${list(test.values.map((c) => PLURAL[c as Category] ?? c))}`;
  const what = test.op === "one_of" ? describeValues(test.detail, test.values) : `with ${NUMBER_WORDS[test.detail](test.op, test.value)}`;
  const things = rule.categories.length ? rule.categories.map((c) => PLURAL[c]) : GROUPS[test.detail];
  if (kind === "never") return things ? `No ${list(things)} ${what}` : `Nothing ${what}`;
  return things ? `Only ${list(things, "and")} ${what}` : `Everything ${what}`;
}
