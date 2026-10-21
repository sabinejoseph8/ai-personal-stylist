import { describe, expect, it } from "vitest";
import type { Ask } from "@/core/ask";
import { createFakeRuleMaker, createRuleMaker, RULE_SCHEMA, ruleFrom } from "@/core/looks/rule-maker";
import { CATEGORIES, checkRule, describeRule, type Rule, WORD_VALUES } from "@/core/looks/rules";
import { RuleSchema, SAMPLE_PROFILE } from "@/lib/profile";
import { catalogProducts } from "./support/catalog-products";

// 4a: firm preference rules (R4, R54 to R56). How a rule judges a product, the plain-words read-back
// (Sabine's Q1), the rule maker's answer checked in shape, and judged rules (her Q3).

const highHeels: Rule = { type: "detail", categories: ["shoes"], test: { detail: "heelCm", op: "over", value: 5 } };
const sleeves: Rule = { type: "detail", categories: [], test: { detail: "sleeve", op: "one_of", values: ["cap", "short", "elbow", "three_quarter", "long"] } };
const black: Rule = { type: "detail", categories: [], test: { detail: "color", op: "one_of", values: ["black"] } };
const shoe = (heelCm?: number) => ({ category: "shoes", colors: ["nude"], styleTags: ["classic"], details: { formality: 4, material: "leather", pattern: "solid", heelCm, toe: "closed" } });
const dress = (sleeve?: string, colors = ["emerald green"]) => ({ category: "dress", colors, styleTags: ["elegant"], details: { formality: 4, material: "crepe", pattern: "solid", sleeve, neckline: "v", coverage: "midi" } });

describe("firm rules", () => {
  it("Never: high heels leaves out heels over 5 cm, and a missing heel height is never a pass (R56)", () => {
    expect(checkRule("never", highHeels, shoe(9))).toEqual({ ok: false, why: "breaks" });
    expect(checkRule("never", highHeels, shoe(5))).toEqual({ ok: true });
    expect(checkRule("never", highHeels, shoe(2))).toEqual({ ok: true });
    expect(checkRule("never", highHeels, shoe(undefined))).toEqual({ ok: false, why: "unknown" });
    // A rule about shoes leaves other categories alone.
    expect(checkRule("never", highHeels, dress("long"))).toEqual({ ok: true });
  });

  it("Must have: sleeves applies to clothes only, and needs a sleeve that isn't sleeveless", () => {
    expect(checkRule("must_have", sleeves, dress("long"))).toEqual({ ok: true });
    expect(checkRule("must_have", sleeves, dress("sleeveless"))).toEqual({ ok: false, why: "breaks" });
    expect(checkRule("must_have", sleeves, dress(undefined))).toEqual({ ok: false, why: "unknown" });
    expect(checkRule("must_have", sleeves, shoe(2))).toEqual({ ok: true });
  });

  it("colors, materials and patterns match words inside a value", () => {
    expect(checkRule("never", black, dress("long", ["black"]))).toEqual({ ok: false, why: "breaks" });
    expect(checkRule("never", black, dress("long", ["navy"]))).toEqual({ ok: true });
    const green: Rule = { type: "detail", categories: [], test: { detail: "color", op: "one_of", values: ["green"] } };
    expect(checkRule("never", green, dress("long", ["emerald green"]))).toEqual({ ok: false, why: "breaks" });
    const leather: Rule = { type: "detail", categories: [], test: { detail: "material", op: "one_of", values: ["leather"] } };
    expect(checkRule("never", leather, { ...shoe(2), details: { ...shoe(2).details, material: "patent leather" } })).toEqual({ ok: false, why: "breaks" });
  });

  it("a judged rule is left to the preference checker (Sabine's Q3)", () => {
    expect(checkRule("never", { type: "judged" }, shoe(12))).toEqual({ ok: true });
  });

  it("on the real catalog, the sample profile's rules leave out every heel over 5 cm and every sleeveless dress or top", () => {
    const [never, must] = SAMPLE_PROFILE.preferences;
    const allowed = catalogProducts.filter((p) => checkRule("never", never.rule!, p).ok && checkRule("must_have", must.rule!, p).ok);
    expect(allowed.some((p) => p.category === "shoes" && (p.details.heelCm ?? 99) > 5)).toBe(false);
    expect(allowed.some((p) => p.details.sleeve === "sleeveless")).toBe(false);
    expect(allowed.filter((p) => p.category === "shoes").length).toBeGreaterThan(10);
  });
});

describe("the read-back (Sabine's Q1)", () => {
  it("says what's checked, in plain words", () => {
    expect(describeRule("never", highHeels)).toBe("No shoes with heels over 5 cm");
    expect(describeRule("must_have", sleeves)).toBe("Only tops, dresses and jackets with sleeves (not sleeveless)");
    expect(describeRule("never", black)).toBe("Nothing in black");
    expect(describeRule("never", { type: "detail", categories: [], test: { detail: "sleeve", op: "one_of", values: ["sleeveless"] } })).toBe(
      "No tops, dresses or jackets that are sleeveless",
    );
    expect(describeRule("never", { type: "detail", categories: [], test: { detail: "category", op: "one_of", values: ["skirt"] } })).toBe("No skirts");
    expect(describeRule("never", { type: "detail", categories: [], test: { detail: "pattern", op: "one_of", values: ["animal print"] } })).toBe("Nothing with an animal print pattern");
    expect(describeRule("never", { type: "detail", categories: ["dress", "skirt", "shorts"], test: { detail: "coverage", op: "one_of", values: ["mini", "mid_thigh", "above_knee"] } })).toBe(
      "No dresses, skirts or shorts that are mini, mid-thigh or above-the-knee length",
    );
    expect(describeRule("never", { type: "judged" })).toBe("Checked by your stylist's judgment");
  });
});

describe("the rule maker", () => {
  const raw = { j: false, c: [] as string[], d: "", o: "", n: 0, v: [] as string[] };

  it("keeps an answer code can check, and judges anything else (Sabine's Q3)", () => {
    expect(ruleFrom({ ...raw, c: ["shoes"], d: "heelCm", o: "over", n: 5 }, "never")).toEqual(highHeels);
    expect(ruleFrom({ ...raw, d: "color", o: "one_of", v: [" Black "] }, "never")).toEqual(black);
    // Claude said it needs judging, an unknown value, a number for a word detail, a must-have category.
    expect(ruleFrom({ ...raw, j: true }, "never")).toEqual({ type: "judged" });
    expect(ruleFrom({ ...raw, d: "sleeve", o: "one_of", v: ["puffy"] }, "never")).toEqual({ type: "judged" });
    expect(ruleFrom({ ...raw, d: "sleeve", o: "over", n: 3 }, "never")).toEqual({ type: "judged" });
    expect(ruleFrom({ ...raw, d: "category", o: "one_of", v: ["jacket"] }, "must_have")).toEqual({ type: "judged" });
    expect(ruleFrom({ ...raw, d: "heelCm", o: "over", n: 500 }, "never")).toEqual({ type: "judged" });
  });

  it("asks Claude with the catalog's details, and a failed answer is judged but still charged", async () => {
    const asked: Parameters<Ask>[0][] = [];
    const ask: Ask = async (request) => (asked.push(request), { data: null, costUsd: 0.004 });
    expect(await createRuleMaker(ask).make("never", "high heels")).toEqual({ rule: { type: "judged" }, costUsd: 0.004 });
    expect(asked[0].user).toBe("never: high heels");
    expect(asked[0].system).toContain("sleeveless");
    expect(asked[0].schema).toBe(RULE_SCHEMA);
  });

  it("the fake rule maker for browser tests knows the sample profile's preferences", async () => {
    const fake = createFakeRuleMaker();
    expect((await fake.make("never", "high heels")).rule).toEqual(highHeels);
    expect((await fake.make("must_have", "sleeves")).rule).toEqual(sleeves);
    expect((await fake.make("never", "anything too flashy")).rule).toEqual({ type: "judged" });
  });

  it("every rule it can make passes the shape check used before saving", () => {
    for (const rule of [highHeels, sleeves, black, { type: "judged" } as Rule]) expect(RuleSchema.safeParse(rule).success).toBe(true);
    expect(RuleSchema.safeParse({ type: "detail", categories: ["hats"], test: { detail: "color", op: "one_of", values: ["red"] } }).success).toBe(false);
  });
});

describe("the catalog's vocabulary", () => {
  it("lists every value the catalog uses, so a rule can name any of them", () => {
    for (const p of catalogProducts) {
      expect(CATEGORIES).toContain(p.category);
      for (const detail of ["sleeve", "neckline", "coverage", "toe"] as const) {
        const value = p.details[detail];
        if (value !== undefined) expect(WORD_VALUES[detail] as readonly string[]).toContain(value);
      }
    }
  });
});
