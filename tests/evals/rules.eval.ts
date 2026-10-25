import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { claudeAsk, RULE_MODEL } from "@/connectors/ai/claude";
import { createRuleMaker } from "@/core/looks/rule-maker";
import { describeRule, type FirmKind, type Rule } from "@/core/looks/rules";
import { setting } from "../support/test-guests";
import { countedAsk } from "../support/eval-spend";

// The rule maker eval (4a, a default in the plan Sabine approved): 16 ways a shopper might word a Must
// have or Never, each with the rule it should become, read back the way setup shows it. Pass mark: at
// least 90% right. It runs the real rule maker (Opus 5.5, low effort), about 15 cents. Run: npm run eval:rules.

const maker = createRuleMaker(countedAsk(claudeAsk(RULE_MODEL, "low", setting("ANTHROPIC_API_KEY"))));
const OUT = "tests/evals/results/rules-latest.json";

type Detail = Extract<Rule, { type: "detail" }>;
const detail = (r: Rule): Detail | null => (r.type === "detail" ? r : null);
const values = (r: Rule) => (detail(r)?.test.op === "one_of" ? (detail(r)!.test as { values: string[] }).values : []);
const number = (r: Rule) => (detail(r)?.test.op !== "one_of" ? (detail(r)?.test as { op: string; value: number } | undefined) : undefined);
const about = (r: Rule, d: string) => detail(r)?.test.detail === d;
const notForOthers = (r: Rule, ...allowed: string[]) => detail(r)!.categories.every((c) => allowed.includes(c));

const CASES: { kind: FirmKind; words: string; ok: (r: Rule) => boolean }[] = [
  { kind: "never", words: "high heels", ok: (r) => about(r, "heelCm") && ["over", "at_least"].includes(number(r)!.op) && number(r)!.value >= 4 && number(r)!.value <= 7 && notForOthers(r, "shoes") },
  { kind: "never", words: "heels over 2 inches", ok: (r) => about(r, "heelCm") && number(r)!.op === "over" && number(r)!.value === 5 },
  { kind: "never", words: "stilettos", ok: (r) => about(r, "heelCm") && ["over", "at_least"].includes(number(r)!.op) && number(r)!.value >= 5 && number(r)!.value <= 10 },
  { kind: "must_have", words: "flats", ok: (r) => about(r, "heelCm") && ["at_most", "under"].includes(number(r)!.op) && number(r)!.value <= 2 && notForOthers(r, "shoes") },
  { kind: "must_have", words: "sleeves", ok: (r) => about(r, "sleeve") && !values(r).includes("sleeveless") && values(r).includes("long") && values(r).includes("short") },
  { kind: "never", words: "sleeveless", ok: (r) => about(r, "sleeve") && values(r).join() === "sleeveless" },
  { kind: "never", words: "black", ok: (r) => about(r, "color") && values(r).includes("black") },
  { kind: "never", words: "anything in red or orange", ok: (r) => about(r, "color") && values(r).includes("red") && values(r).includes("orange") },
  { kind: "never", words: "leather", ok: (r) => about(r, "material") && values(r).some((v) => v.includes("leather")) },
  { kind: "never", words: "animal print", ok: (r) => about(r, "pattern") && values(r).some((v) => v.includes("animal")) },
  { kind: "never", words: "open-toe shoes", ok: (r) => about(r, "toe") && values(r).join() === "open" },
  { kind: "never", words: "skirts", ok: (r) => about(r, "category") && values(r).join() === "skirt" },
  // Lengths are about dresses, skirts and shorts: a top's coverage (waist, hip) isn't its length.
  {
    kind: "never",
    words: "anything above the knee",
    ok: (r) => about(r, "coverage") && values(r).includes("mini") && !["knee", "midi", "waist", "hip"].some((v) => values(r).includes(v)) && notForOthers(r, "dress", "skirt", "shorts"),
  },
  { kind: "never", words: "anything too flashy", ok: (r) => r.type === "judged" },
  { kind: "must_have", words: "a jacket in every look", ok: (r) => r.type === "judged" },
  { kind: "must_have", words: "comfortable shoes", ok: (r) => r.type === "judged" },
];

it("rule maker check: how often a preference becomes the rule it should", async () => {
  const results = await Promise.all(
    CASES.map(async (c) => {
      const started = performance.now();
      const { rule, costUsd } = await maker.make(c.kind, c.words);
      let right = false;
      try {
        right = c.ok(rule);
      } catch {
        right = false;
      }
      return { preference: `${c.kind}: ${c.words}`, readBack: describeRule(c.kind, rule), rule, right, seconds: (performance.now() - started) / 1000, costUsd };
    }),
  );
  const right = results.filter((r) => r.right).length;
  const times = results.map((r) => r.seconds).sort((a, b) => a - b);
  const summary = {
    model: RULE_MODEL,
    effort: "low",
    date: new Date().toISOString(),
    preferences: results.length,
    right,
    rightPercent: Math.round((right / results.length) * 100),
    wrong: results.filter((r) => !r.right).map((r) => `${r.preference} → ${r.readBack}`),
    seconds: { median: Number(times[Math.floor(times.length / 2)].toFixed(2)), p95: Number(times[Math.floor(times.length * 0.95)].toFixed(2)) },
    costUSD: Number(results.reduce((s, r) => s + r.costUsd, 0).toFixed(4)),
  };
  console.log(JSON.stringify(summary, null, 2));
  mkdirSync("tests/evals/results", { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ summary, results }, null, 1)}\n`);
  expect(summary.rightPercent).toBeGreaterThanOrEqual(90);
});
