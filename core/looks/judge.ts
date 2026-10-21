import type { Ask } from "../ask";
import { dollars } from "./budget";
import type { CheckReason } from "./checker";
import { type ResolvedItem } from "./look";

// The preference checker's judgment step (4b; R54, R55, tech spec 5 pattern 6): only for a look that
// passed every code rule. Claude Opus 5.5 at medium effort judges what code can't: firm preferences
// that aren't about one product detail ("Never: anything too flashy"), whether the look suits the
// occasion and the confirmed notes, and whether similar samples resemble an inspiration photo. One look
// at a time (Sabine's answer to Q3 in 4b). Anything uncertain doesn't pass. For a swapped look (4c) it
// also writes the look's new one-line reason, since the old one may name the piece that was swapped out.

export type Verdict = "pass" | "conflict" | "needs_clarification";
export type JudgeInput = {
  items: ResolvedItem[];
  notes: string[];
  judged: string[];
  likes: string[];
  inspiration: string | null;
  /** Also write the look's one-line reason (a swapped look, 4c). */
  withReason?: boolean;
};

/** Added to the instructions when the judge also writes a swapped look's reason. */
export const REASON_RULE = `

Also give s: one sentence on why this outfit works for the shopper, in a stylist's voice, naming the pieces that make it work, such as "Tan loafers pick up the camel skirt and keep the look easy for dinner." Write it even when the outfit fails.`;

export const JUDGE_SYSTEM = `You check one outfit for a personal stylist, before the shopper sees it. Code has already checked the budget, sizes, colors to avoid and every measurable preference. You check what code can't.

Check each of these, one point each:
- every firm preference listed: it must clearly hold for every item
- the occasion, season and setting in the shopper's notes: every item in the outfit must be suitable
- any other note that applies, such as a style
- colors, when the notes name a preferred color or their Likes name colors: the main piece (the dress or suit), or at least one of the top and bottom, must be in one of those colors. The color only in the shoes, bag or jewelry doesn't count, and neither does a navy, black or white main piece. Earth tones include burgundy; navy isn't one
- the colors in the outfit go well together, shoes and bag included, as a stylist would see them. Black goes with many outfits, but not every one: black flats with a navy blazer, a burgundy top and a camel skirt don't go together, and tan or a neutral would suit those colors better
- an inspiration item, if there is one: the look must include a sample item clearly similar to it

Judge what's in the outfit. A piece the shopper didn't ask for, such as a coat, wrap or bag, is never missing: fail a look for something missing only when they explicitly asked for it, such as "a jacket in every look".

For each point, give a: what it's about (the preference or note, in its own words), ok: true or false, w: why, in a few plain words.

Then the verdict, v:
- "pass" only when you're sure every point holds
- "conflict" when a point clearly fails
- "clarify" when you can't tell, for example a detail you'd need isn't given

Be strict: the shopper was promised no look breaks their preferences. Likes that aren't colors don't need checking.`;

export const JUDGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    v: { type: "string", enum: ["pass", "conflict", "clarify"] },
    r: {
      type: "array",
      items: { type: "object", additionalProperties: false, properties: { a: { type: "string" }, ok: { type: "boolean" }, w: { type: "string" } }, required: ["a", "ok", "w"] },
    },
  },
  required: ["v", "r"],
};
const SCHEMA_WITH_REASON = { ...JUDGE_SCHEMA, properties: { ...JUDGE_SCHEMA.properties, s: { type: "string" } }, required: [...JUDGE_SCHEMA.required, "s"] };

/** One item as the judge reads it, with every detail the catalog has. */
function itemLine(item: ResolvedItem) {
  if (!("product" in item)) return `- ${item.owned.name} (the shopper's own: ${item.owned.words})`;
  const p = item.product;
  const d = p.details;
  const details = [
    p.category,
    p.colors.join(", "),
    d.material,
    d.pattern,
    `formality ${d.formality} of 5`,
    d.heelCm !== undefined ? `heel ${d.heelCm} cm` : "",
    d.toe ? `${d.toe} toe` : "",
    d.sleeve ? `${d.sleeve.replace(/_/g, " ")} sleeves` : "",
    d.neckline ? `${d.neckline.replace(/_/g, " ")} neckline` : "",
    d.coverage ? `${d.coverage.replace(/_/g, " ")} length` : "",
    `style ${p.styleTags.join("/")}`,
    dollars(p.price.amountCents),
  ].filter(Boolean);
  return `- ${p.name} (${details.join("; ")})`;
}

export function judgePrompt(input: JudgeInput) {
  return [
    `The outfit:\n${input.items.map(itemLine).join("\n")}`,
    `The shopper's confirmed notes: ${input.notes.length ? input.notes.join("; ") : "none"}.`,
    `Firm preferences: ${input.judged.length ? input.judged.join("; ") : "none to judge"}.`,
    input.likes.length ? `They like: ${input.likes.join("; ")}.` : "",
    input.inspiration ? `Their inspiration item: ${input.inspiration}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

type Raw = { v: "pass" | "conflict" | "clarify"; r: { a: string; ok: boolean; w: string }[]; s?: string };

/** The verdict, made consistent with its own reasons: a failed point can't pass. */
export function verdictFrom(raw: Raw): { verdict: Verdict; reasons: CheckReason[] } {
  const reasons = raw.r.slice(0, 12).map((r) => ({ about: r.a.trim().slice(0, 80), ok: r.ok, why: r.w.trim().slice(0, 200) }));
  let verdict: Verdict = raw.v === "pass" ? "pass" : raw.v === "conflict" ? "conflict" : "needs_clarification";
  if (verdict === "pass" && reasons.some((r) => !r.ok)) verdict = "conflict";
  return { verdict, reasons };
}

export interface Judge {
  /** A look's verdict. A failed reading never passes: it's held as needing clarification, with its cost. */
  judge(input: JudgeInput): Promise<{ verdict: Verdict; reasons: CheckReason[]; costUsd: number; reason?: string }>;
}

export function createJudge(ask: Ask): Judge {
  return {
    async judge(input) {
      const { data, costUsd } = await ask(
        input.withReason
          ? { system: JUDGE_SYSTEM + REASON_RULE, user: judgePrompt(input), schema: SCHEMA_WITH_REASON, maxTokens: 6000 }
          : { system: JUDGE_SYSTEM, user: judgePrompt(input), schema: JUDGE_SCHEMA, maxTokens: 6000 },
      );
      if (!data) return { verdict: "needs_clarification", reasons: [{ about: "Judgment", ok: false, why: "The check couldn't be completed" }], costUsd };
      const reason = (data as Raw).s?.trim().slice(0, 300);
      return { ...verdictFrom(data as Raw), costUsd, ...(input.withReason && reason ? { reason } : {}) };
    },
  };
}

/**
 * A fake judge for browser tests and the service's tests: passes, unless a firm preference mentions
 * "flashy" and an item is sequinned or metallic. Only used when LOOKS_BUILDER=fake, never on the live site.
 */
export function createFakeJudge(): Judge {
  return {
    async judge({ items, judged, withReason }) {
      const flashy = judged.some((j) => /flashy/i.test(j)) && items.some((i) => "product" in i && /sequin|metallic/i.test(`${i.product.details.material} ${i.product.details.pattern}`));
      return flashy
        ? { verdict: "conflict", reasons: [{ about: judged.find((j) => /flashy/i.test(j))!, ok: false, why: "Sequins are flashy" }], costUsd: 0 }
        : { verdict: "pass", reasons: [{ about: "The occasion", ok: true, why: "Suits it" }], costUsd: 0, ...(withReason ? { reason: "A fake reason for a swapped look." } : {}) };
    },
  };
}
