import { budgetWords } from "./checker";
import type { LeftOut, LeftOutKind, Requirements } from "./candidates";
import type { FirmPreference } from "./exceptions";
import type { Product } from "../../connectors/catalog/types";
import { productGroup } from "./look";

// The no-match explanation (R45, R59; Sabine's answer to Q2 in 4b): when fewer than three looks pass
// after three tries, the stylist says which requirement is the limit and offers choices. Made by code
// from what the candidate filter left out, so it names a real requirement, not a guess. Its choices are
// only ones that work now (Sabine's decision A in 4e): a saved Must have or Never can be allowed for this
// session (5c, R57), and sizes are changed in the profile. Tested in tests/checker.test.ts.

/** `preference` is the saved one that limits the looks, for "Allow it for this session" (5c). */
export type NoMatch = { message: string; choices: string[]; preference?: FirmPreference };

export const ALLOW_CHOICE = "Allow it for this session";

const PIECES: Record<string, string> = { dress: "dresses", shoes: "shoes", top: "tops", bottom: "trousers or skirts", suit: "suits" };

/** The pieces a look can't do without: shoes, and a dress if the outfit is a dress; otherwise a top and a bottom. */
function neededGroups(req: Requirements, kept: Product[]): string[] {
  if (req.categories?.includes("dress")) return ["dress", "shoes"];
  if (req.categories?.includes("suit")) return ["suit", "shoes"];
  const hasDresses = kept.some((p) => productGroup(p.category) === "dress");
  return hasDresses ? ["shoes"] : ["top", "bottom", "shoes"];
}

/** Why few looks could be made, from the filter's results; `found` looks did pass. */
export function explainNoMatch(req: Requirements, kept: Product[], leftOut: LeftOut[], found: number): NoMatch {
  const counts = new Map<string, number>();
  for (const p of kept) counts.set(productGroup(p.category), (counts.get(productGroup(p.category)) ?? 0) + 1);
  const scarce = neededGroups(req, kept)
    .map((g) => ({ group: g, n: counts.get(g) ?? 0 }))
    .sort((a, b) => a.n - b.n)[0];
  if (scarce && scarce.n < 3) {
    const gone = leftOut.filter((l) => productGroup(l.category) === scarce.group);
    const tally = new Map<LeftOutKind, LeftOut[]>();
    for (const l of gone) tally.set(l.kind, [...(tally.get(l.kind) ?? []), l]);
    const [kind, examples] = [...tally.entries()].filter(([k]) => k !== "department" && k !== "outfit").sort((a, b) => b[1].length - a[1].length)[0] ?? [];
    const only = `Only ${scarce.n} ${PIECES[scarce.group] ?? scarce.group}`;
    if (kind === "budget" && req.budget) return { message: `${only} fit under ${budgetWords(req.budget)}.`, choices: ["Raise the budget", "Try another outfit"] };
    if (kind === "size") return { message: `${only} come in your size.`, choices: ["Try another outfit", "Try again"] };
    if (kind === "rule") {
      const preference = examples!.find((l) => l.preference)?.preference;
      return preference
        ? { message: `${only} meet ${examples![0].rule}.`, choices: [ALLOW_CHOICE, "Try another outfit"], preference }
        : { message: `${only} meet ${examples![0].rule}.`, choices: ["Try another outfit", "Try again"] };
    }
  }
  const looks = found === 1 ? "1 look that meets" : `${found} looks that meet`;
  return { message: `I found ${looks} everything you've asked for.`, choices: ["Change a requirement", "Try again"] };
}
