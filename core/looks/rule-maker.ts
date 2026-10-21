import type { Ask } from "../ask";
import { CATEGORIES, type Category, FREE_DETAILS, type FirmKind, NUMBER_DETAILS, type Rule, WORD_VALUES } from "./rules";

// The preference rule maker (4a, tech spec 4.4): Claude Opus 5.5 at low effort turns a Must have or
// Never preference into a rule on the catalog's product details, which the shopper sees read back in
// plain words before it's saved (Sabine's answer to Q1 in 4a). Plain code shape-checks the answer: a
// rule it can't use is judged by the preference checker instead (her Q3). Claude is passed in as `ask`.

const vocabulary = Object.entries(WORD_VALUES)
  .filter(([detail]) => detail !== "category")
  .map(([detail, values]) => `- ${detail}: ${values.join(", ")}`)
  .join("\n");

export const RULE_SYSTEM = `You turn a shopper's saved clothing preference into a rule that code can check on sample products.

The preference is a "must_have" (every product it's about must have it) or a "never" (no product may have it).

Products have these details:
- category: ${CATEGORIES.join(", ")}
- heelCm: heel height in centimeters (shoes only). 1 inch is 2.5 cm. "High heels" means heels over 5 cm; "flats" means heels of at most 1 cm.
- formality: 1 (casual) to 5 (black tie).
${vocabulary}
- color: color words, such as black, navy, emerald green.
- material: words such as leather, wool, silk, linen, cotton, sequin.
- pattern: words such as solid, floral, striped, check, animal print, polka dot.
- style: words such as classic, elegant, relaxed, minimal, bold, romantic, sporty, edgy, bohemian, preppy.

Answer with:
- j: true when the preference isn't about one product detail, for example "anything too flashy", "a jacket in every look" or "comfortable", so a stylist must judge it. Then leave the rest empty.
- c: the categories the rule is about, or an empty list when it's about every category the detail applies to (sleeves, necklines and coverage apply to clothes; heelCm and toe to shoes; colors, materials, patterns and style to everything).
  Coverage is where a garment ends: tops and jackets end at the waist or hip, and that's never about their length. So a preference about length ("above the knee", "minis", "nothing too short") is about dresses, skirts and shorts only: list those categories, and don't use waist or hip.
- d: the detail.
- o: for heelCm or formality, one of over, under, at_least, at_most; otherwise one_of.
- n: the number, for heelCm or formality; otherwise 0.
- v: for one_of, the values, using the listed values exactly where there's a list.

Write the rule as the preference says it, for its kind: "never: high heels" is heelCm over 5 for shoes; "must_have: sleeves" is sleeve one_of every value except sleeveless; "never: sleeveless" is sleeve one_of sleeveless; "never: black" is color one_of black; "never: skirts" is category one_of skirt.`;

export const RULE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    j: { type: "boolean" },
    c: { type: "array", items: { type: "string", enum: [...CATEGORIES] } },
    d: { type: "string", enum: ["", ...NUMBER_DETAILS, ...Object.keys(WORD_VALUES), ...FREE_DETAILS] },
    o: { type: "string", enum: ["", "over", "under", "at_least", "at_most", "one_of"] },
    n: { type: "number" },
    v: { type: "array", items: { type: "string" } },
  },
  required: ["j", "c", "d", "o", "n", "v"],
};

type Raw = { j: boolean; c: string[]; d: string; o: string; n: number; v: string[] };

const JUDGED: Rule = { type: "judged" };
const isNumberDetail = (d: string): d is (typeof NUMBER_DETAILS)[number] => (NUMBER_DETAILS as readonly string[]).includes(d);
const isWordDetail = (d: string): d is keyof typeof WORD_VALUES => d in WORD_VALUES;
const isFreeDetail = (d: string): d is (typeof FREE_DETAILS)[number] => (FREE_DETAILS as readonly string[]).includes(d);

/** Claude's answer as a rule, if it's one code can check; otherwise judged. */
export function ruleFrom(raw: Raw, kind: FirmKind): Rule {
  if (raw.j) return JUDGED;
  const categories = raw.c.filter((c): c is Category => (CATEGORIES as readonly string[]).includes(c));
  if (categories.length !== raw.c.length) return JUDGED;
  if (isNumberDetail(raw.d)) {
    if (!["over", "under", "at_least", "at_most"].includes(raw.o) || !Number.isFinite(raw.n) || raw.n < 0 || raw.n > 30) return JUDGED;
    return { type: "detail", categories, test: { detail: raw.d, op: raw.o as "over", value: raw.n } };
  }
  const values = [...new Set(raw.v.map((v) => v.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  if (raw.o !== "one_of" || !values.length) return JUDGED;
  if (isWordDetail(raw.d)) {
    const known = WORD_VALUES[raw.d] as readonly string[];
    if (!values.every((v) => known.includes(v))) return JUDGED;
    // "Must have: a jacket" is about the whole look, not each product: the checker judges it.
    if (raw.d === "category" && kind === "must_have") return JUDGED;
    return { type: "detail", categories: raw.d === "category" ? [] : categories, test: { detail: raw.d, op: "one_of", values } };
  }
  if (isFreeDetail(raw.d)) {
    if (values.some((v) => v.length > 30)) return JUDGED;
    return { type: "detail", categories, test: { detail: raw.d, op: "one_of", values } };
  }
  return JUDGED;
}

export type RuleMade = { rule: Rule; costUsd: number };

export interface RuleMaker {
  /** The rule for a firm preference. A failed reading gives a judged rule, still with its cost. */
  make(kind: FirmKind, words: string): Promise<RuleMade>;
}

export function createRuleMaker(ask: Ask): RuleMaker {
  return {
    async make(kind, words) {
      const { data, costUsd } = await ask({
        system: RULE_SYSTEM,
        user: `${kind}: ${words}`,
        schema: RULE_SCHEMA,
        maxTokens: 600,
      });
      return { rule: data ? ruleFrom(data as Raw, kind) : JUDGED, costUsd };
    },
  };
}

/**
 * A fake rule maker for browser tests: a few known preferences, everything else judged. Only used when
 * RULE_MAKER=fake, never on the live site.
 */
export function createFakeRuleMaker(): RuleMaker {
  return {
    async make(kind, words) {
      await new Promise((r) => setTimeout(r, 300));
      const w = words.toLowerCase();
      const raw: Raw = { j: true, c: [], d: "", o: "", n: 0, v: [] };
      if (/high heels?/.test(w)) Object.assign(raw, { j: false, c: ["shoes"], d: "heelCm", o: "over", n: 5 });
      else if (/^sleeves?$/.test(w)) Object.assign(raw, { j: false, d: "sleeve", o: "one_of", v: ["cap", "short", "elbow", "three_quarter", "long"] });
      else if (/^black$/.test(w)) Object.assign(raw, { j: false, d: "color", o: "one_of", v: ["black"] });
      return { rule: ruleFrom(raw, kind), costUsd: 0 };
    },
  };
}
