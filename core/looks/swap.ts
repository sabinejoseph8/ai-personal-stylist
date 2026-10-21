import type { Product } from "../../connectors/catalog/types";
import type { BudgetLimit } from "./budget";
import { type Group, groupOf, productGroup, type ResolvedItem } from "./look";
import { lookTotal } from "./totals";

// Swap a piece (4c, R43, Sabine's answer to Q1 in 4c): plain code picks the replacements, and every one
// still goes through the whole preference check before it's shown. Candidates are the candidate
// filter's products of the same kind, not in the look and not tried in it before, that keep the look
// within budget. They're ranked so the likeliest to pass are checked first: colors already in the look,
// then neutrals, then the old piece's formality.

/** Colors that go with most outfits, for ranking only: the judgment step still decides. */
const NEUTRALS = ["black", "white", "ivory", "cream", "beige", "nude", "tan", "camel", "brown", "cognac", "grey", "gray", "navy", "gold", "silver"];

const words = (s: string) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean);

/** The colors in the rest of the look, as single words ("emerald green" gives emerald and green). */
function lookColors(items: ResolvedItem[], index: number): Set<string> {
  const out = new Set<string>();
  items.forEach((item, i) => {
    if (i === index) return;
    const text = "product" in item ? item.product.colors.join(" ") : item.owned.words;
    for (const w of words(text)) out.add(w);
  });
  return out;
}

/**
 * The replacements for the piece at `index`, best first. `tried` holds pieces already shown or checked
 * in this place, so repeated swaps keep bringing something new.
 */
export function swapCandidates(products: Product[], items: ResolvedItem[], index: number, tried: Set<string>, budget: BudgetLimit | null): Product[] {
  const old = items[index];
  if (!old || !("product" in old)) return [];
  const group = productGroup(old.product.category);
  const inLook = new Set(items.flatMap((i) => ("product" in i ? [i.product.id] : [])));
  const colors = lookColors(items, index);
  const formality = old.product.details.formality;
  const fitsBudget = (p: Product) =>
    lookTotal(
      items.map((i, n) => (n === index ? { owned: false as const, priceCents: p.price.amountCents } : "product" in i ? { owned: false as const, priceCents: i.product.price.amountCents } : { owned: true as const })),
      budget,
    ).fits;
  const score = (p: Product) => {
    const own = p.colors.flatMap(words);
    return (own.some((c) => colors.has(c)) ? 2 : 0) + (own.some((c) => NEUTRALS.includes(c)) ? 1 : 0) + (Math.abs(p.details.formality - formality) <= 1 ? 1 : 0);
  };
  return products
    .filter((p) => productGroup(p.category) === group && !inLook.has(p.id) && !tried.has(p.id) && fitsBudget(p))
    .map((p, order) => ({ p, order, score: score(p) }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((x) => x.p);
}

const PIECE_WORDS: Record<Group, string> = {
  dress: "dresses",
  suit: "suits",
  top: "tops",
  outer: "jackets",
  bottom: "trousers or skirts",
  shoes: "shoes",
  bag: "bags",
  accessory: "accessories",
  other: "pieces",
};

/** "No other shoes fit everything you've asked for." */
export const noOtherPiece = (item: ResolvedItem) => `No other ${PIECE_WORDS[groupOf(item)]} fit everything you've asked for.`;

/** The pieces a shopper can ask to swap by voice (the notes reader's answer, 4c). */
export const SWAPPABLE: Group[] = ["dress", "suit", "top", "outer", "bottom", "shoes", "bag", "accessory"];
