import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { claudeAsk, LOOKS_MODEL } from "@/connectors/ai/claude";
import type { Product } from "@/connectors/catalog/types";
import type { FirmRule, Requirements } from "@/core/looks/candidates";
import { type Anchor, codeCheck } from "@/core/looks/checker";
import { createJudge } from "@/core/looks/judge";
import type { OwnedPiece, ResolvedItem } from "@/core/looks/look";
import { SAMPLE_PROFILE } from "@/lib/profile";
import { catalogProducts } from "../support/catalog-products";
import { setting } from "../support/test-guests";

// The checker eval (4b; Phase 4 automated test, tech spec 8): about 30 looks made from the real sample
// catalog, each with the outcome it should get. Rule breaks, such as high heels with "Never: high heels",
// a missing heel height, sleeveless with "Must have: sleeves", budget edges and "Not black", must ALL be
// caught (the core promise). Looks that only judgment can decide, such as sequins with "Never: anything
// too flashy" or shorts at a November wedding, must be right at least 90% of the time. It runs the real
// checker: rules in code, then the judgment step (Opus 5.5, medium) for looks that pass them, one look at
// a time (Sabine's answer to Q3 in 4b). About 40 cents. Run: npm run eval:checker.

const judge = createJudge(claudeAsk(LOOKS_MODEL, "medium", setting("ANTHROPIC_API_KEY")));
const OUT = "tests/evals/results/checker-latest.json";

const bySlug = (slug: string) => {
  const p = catalogProducts.find((x) => x.id === slug);
  if (!p) throw new Error(`no product ${slug}`);
  return p;
};
const item = (p: Product | string): ResolvedItem => {
  const product = typeof p === "string" ? bySlug(p) : p;
  return { ref: { kind: "product", productId: product.id }, product };
};
const profileRules: FirmRule[] = SAMPLE_PROFILE.preferences.flatMap((p) => (p.kind === "likes" ? [] : [{ kind: p.kind, words: p.words, rule: p.rule!, from: "profile" as const }]));
const highHeels = profileRules[0];
const judged = (words: string, kind: "never" | "must_have" = "never"): FirmRule => ({ kind, words, rule: { type: "judged" }, from: "profile" });
const notBlack: FirmRule = { kind: "never", words: "Not black", rule: { type: "detail", categories: [], test: { detail: "color", op: "one_of", values: ["black"] } }, from: "notes" };

type Scene = { requirements: Requirements; notes: string[]; anchor?: Anchor; owned?: OwnedPiece[]; inspiration?: string };
const base = { departments: ["womenswear" as const], categories: null, sizes: SAMPLE_PROFILE.sizes };
const WEDDING: Scene = {
  requirements: { ...base, budget: { meaning: "up_to", amount: 600, from: "notes" }, rules: profileRules },
  notes: ["Outdoor wedding, November", "Elegant", "Emerald green, preferred"],
};
const INTERVIEW: Scene = { requirements: { ...base, budget: { meaning: "up_to", amount: 500, from: "notes" }, rules: profileRules }, notes: ["Job interview, next week", "Smart but comfortable"] };
const FLASHY: Scene = { requirements: { ...base, budget: { meaning: "up_to", amount: 600, from: "notes" }, rules: [highHeels, judged("anything too flashy")] }, notes: ["Friend's birthday dinner, Saturday", "Relaxed"] };
const JACKET: Scene = { requirements: { ...base, budget: { meaning: "up_to", amount: 600, from: "notes" }, rules: [highHeels, judged("a jacket in every look", "must_have")] }, notes: ["Office party, December"] };
const blazerPiece: OwnedPiece = { ref: { kind: "photo", photoId: "photo-1", version: 1 }, name: "Navy wool blazer", group: "outer", words: "blazer, navy, solid, classic" };
const OWNED: Scene = { ...INTERVIEW, anchor: { photoId: "photo-1", version: 1, name: "Navy wool blazer", owned: true }, owned: [blazerPiece] };
const INSPIRED: Scene = { ...WEDDING, anchor: { photoId: "photo-2", version: 1, name: "Emerald satin midi dress", owned: false }, inspiration: "Emerald satin midi dress (dress, emerald green, solid, elegant)" };

const noHeel = { ...bySlug("w-tan-leather-loafers"), details: { ...bySlug("w-tan-leather-loafers").details, heelCm: undefined } };
const notInSize = { ...bySlug("w-navy-wrap-dress"), variants: [{ id: "x:2", size: "2" }, { id: "x:4", size: "4" }] };
const menswearShoes = catalogProducts.find((p) => p.department === "menswear" && p.category === "shoes")!;

type Case = { id: string; scene: Scene; items: ResolvedItem[]; expect: "caught" | "pass" | "not pass"; why: string };
const CASES: Case[] = [
  // Rule breaks: code must catch every one.
  { id: "stilettos", scene: WEDDING, items: [item("w-emerald-satin-midi-dress"), item("w-black-stiletto-pumps"), item("w-emerald-satin-clutch")], expect: "caught", why: "Never: high heels (10 cm)" },
  { id: "block heels 6 cm", scene: WEDDING, items: [item("w-emerald-satin-midi-dress"), item("w-nude-block-heel-pumps")], expect: "caught", why: "Never: high heels (6 cm)" },
  { id: "platforms", scene: INTERVIEW, items: [item("w-black-trouser-suit"), item("w-black-platform-heels")], expect: "caught", why: "Never: high heels (12 cm)" },
  { id: "wedge sandals", scene: WEDDING, items: [item("w-blush-pleated-maxi-dress"), item("w-blush-wedge-sandals")], expect: "caught", why: "Never: high heels (7 cm)" },
  { id: "unknown heel", scene: WEDDING, items: [item("w-navy-wrap-dress"), item(noHeel)], expect: "caught", why: "a missing heel height is never a pass" },
  { id: "sleeveless dress", scene: WEDDING, items: [item("w-cobalt-one-shoulder-dress"), item("w-nude-slingback-flats")], expect: "caught", why: "Must have: sleeves" },
  { id: "slip dress", scene: WEDDING, items: [item("w-sage-slip-dress"), item("w-silver-low-heel-sandals")], expect: "caught", why: "Must have: sleeves" },
  { id: "camisole", scene: INTERVIEW, items: [item("w-emerald-satin-camisole"), item("w-cream-wide-leg-trousers"), item("w-nude-slingback-flats")], expect: "caught", why: "Must have: sleeves" },
  { id: "over budget", scene: INTERVIEW, items: [item("w-black-column-gown"), item("w-nude-slingback-flats"), item("w-camel-leather-tote")], expect: "caught", why: "$587 over a $500 budget" },
  { id: "not black", scene: { ...WEDDING, requirements: { ...WEDDING.requirements, rules: [...profileRules, notBlack] } }, items: [item("w-navy-wrap-dress"), item("w-black-ballet-flats")], expect: "caught", why: "Not black" },
  { id: "menswear", scene: WEDDING, items: [item("w-navy-wrap-dress"), item(menswearShoes)], expect: "caught", why: "womenswear only" },
  { id: "no shoes", scene: WEDDING, items: [item("w-emerald-satin-midi-dress"), item("w-emerald-satin-clutch")], expect: "caught", why: "not a complete outfit" },
  { id: "two dresses", scene: WEDDING, items: [item("w-emerald-satin-midi-dress"), item("w-navy-wrap-dress"), item("w-nude-slingback-flats")], expect: "caught", why: "two dresses" },
  { id: "no bottom", scene: INTERVIEW, items: [item("w-white-silk-blouse"), item("w-nude-slingback-flats")], expect: "caught", why: "not a complete outfit" },
  { id: "not in size", scene: WEDDING, items: [item(notInSize), item("w-nude-slingback-flats")], expect: "caught", why: "not in size 8" },
  { id: "owned item left out", scene: OWNED, items: [item("w-white-silk-blouse"), item("w-black-tailored-trousers"), item("w-tan-leather-loafers")], expect: "caught", why: "leaves out the shopper's blazer" },

  // Judgment: right at least 90% of the time.
  { id: "wedding, emerald dress and coat", scene: WEDDING, items: [item("w-emerald-satin-midi-dress"), item("w-camel-wool-coat"), item("w-nude-slingback-flats")], expect: "pass", why: "elegant, emerald, warm" },
  { id: "wedding, velvet dress", scene: WEDDING, items: [item("w-burgundy-velvet-dress"), item("w-emerald-velvet-mules"), item("w-pearl-drop-earrings")], expect: "pass", why: "elegant November wedding look" },
  { id: "wedding, shorts", scene: WEDDING, items: [item("w-linen-shorts"), item("w-linen-button-up-shirt"), item("w-raffia-espadrilles")], expect: "not pass", why: "shorts at a November wedding" },
  { id: "wedding, knit and sneakers", scene: WEDDING, items: [item("w-striped-knit-dress"), item("w-white-leather-sneakers"), item("w-woven-straw-basket-bag")], expect: "not pass", why: "too casual for an elegant wedding" },
  { id: "interview, blazer and trousers", scene: INTERVIEW, items: [item("w-navy-wool-blazer"), item("w-white-silk-blouse"), item("w-black-tailored-trousers"), item("w-tan-leather-loafers")], expect: "pass", why: "smart and comfortable" },
  { id: "interview, pantsuit", scene: INTERVIEW, items: [item("w-emerald-pantsuit"), item("w-white-silk-blouse"), item("w-nude-slingback-flats")], expect: "pass", why: "smart" },
  { id: "interview, leopard and leather mini", scene: INTERVIEW, items: [item("w-leopard-print-blouse"), item("w-black-leather-mini-skirt"), item("w-black-ankle-boots")], expect: "not pass", why: "not smart enough for an interview" },
  { id: "interview, cargo and tee", scene: INTERVIEW, items: [item("w-olive-cargo-trousers"), item("w-black-fitted-tee"), item("w-white-leather-sneakers")], expect: "not pass", why: "too casual for an interview" },
  { id: "flashy, sequins", scene: FLASHY, items: [item("w-black-sequin-top"), item("w-black-tailored-trousers"), item("w-nude-slingback-flats")], expect: "not pass", why: "Never: anything too flashy" },
  { id: "flashy, quiet look", scene: FLASHY, items: [item("w-breton-striped-top"), item("w-mid-blue-straight-jeans"), item("w-tan-leather-loafers")], expect: "pass", why: "relaxed and quiet" },
  { id: "jacket, none", scene: JACKET, items: [item("w-navy-wrap-dress"), item("w-nude-slingback-flats")], expect: "not pass", why: "Must have: a jacket in every look" },
  { id: "jacket, blazer", scene: JACKET, items: [item("w-navy-wrap-dress"), item("w-ivory-tailored-blazer"), item("w-nude-slingback-flats")], expect: "pass", why: "has a jacket" },
  { id: "inspiration, similar", scene: INSPIRED, items: [item("w-emerald-satin-midi-dress"), item("w-camel-wool-coat"), item("w-nude-slingback-flats")], expect: "pass", why: "a similar emerald satin dress" },
  { id: "inspiration, different", scene: INSPIRED, items: [item("w-navy-wrap-dress"), item("w-camel-wool-coat"), item("w-nude-slingback-flats")], expect: "not pass", why: "nothing like the emerald dress" },
  { id: "owned blazer", scene: OWNED, items: [{ ref: blazerPiece.ref, owned: blazerPiece }, item("w-white-silk-blouse"), item("w-black-tailored-trousers"), item("w-tan-leather-loafers")], expect: "pass", why: "styles the shopper's blazer" },
];

it("checker eval: every rule break caught, and judgment right at least 90% of the time", async () => {
  const results = await Promise.all(
    CASES.map(async (c) => {
      const code = codeCheck({ items: c.items, requirements: c.scene.requirements, anchor: c.scene.anchor ?? null, wardrobePicks: [] });
      if (!code.ok) return { ...c, items: undefined, scene: undefined, got: "caught", reasons: code.reasons.filter((r) => !r.ok).map((r) => r.why), seconds: 0, costUsd: 0 };
      const started = performance.now();
      const j = await judge.judge({
        items: c.items,
        notes: c.scene.notes,
        judged: c.scene.requirements.rules.filter((r) => r.rule.type === "judged").map((r) => `${r.kind === "never" ? "Never" : "Must have"}: ${r.words}`),
        inspiration: c.scene.inspiration ?? null,
      });
      return { ...c, items: undefined, scene: undefined, got: j.verdict === "pass" ? "pass" : "not pass", verdict: j.verdict, reasons: j.reasons.map((r) => `${r.ok ? "ok" : "NO"}: ${r.about}: ${r.why}`), seconds: (performance.now() - started) / 1000, costUsd: j.costUsd };
    }),
  );
  const breaks = results.filter((r) => r.expect === "caught");
  const judgedCases = results.filter((r) => r.expect !== "caught");
  const caught = breaks.filter((r) => r.got === "caught").length;
  const right = judgedCases.filter((r) => r.got === r.expect).length;
  const times = judgedCases.map((r) => r.seconds).sort((a, b) => a - b);
  const summary = {
    model: LOOKS_MODEL,
    effort: "medium",
    date: new Date().toISOString(),
    looks: results.length,
    ruleBreaksCaught: `${caught} of ${breaks.length}`,
    judgedRight: `${right} of ${judgedCases.length}`,
    judgedRightPercent: Math.round((right / judgedCases.length) * 100),
    wrong: results.filter((r) => r.got !== r.expect).map((r) => `${r.id}: expected ${r.expect}, got ${r.got} (${r.reasons.join(" | ")})`),
    judgeSeconds: { median: Number(times[Math.floor(times.length / 2)].toFixed(1)), p95: Number(times[Math.floor(times.length * 0.95)].toFixed(1)) },
    costUSD: Number(results.reduce((s, r) => s + r.costUsd, 0).toFixed(4)),
  };
  console.log(JSON.stringify(summary, null, 2));
  mkdirSync("tests/evals/results", { recursive: true });
  writeFileSync(OUT, `${JSON.stringify({ summary, results }, null, 1)}\n`);
  expect(caught).toBe(breaks.length);
  expect(summary.judgedRightPercent).toBeGreaterThanOrEqual(90);
});
