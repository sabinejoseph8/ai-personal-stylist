import type { Product } from "../../connectors/catalog/types";
import { type BudgetLimit, compareWithBudget } from "./budget";

// What a look is made of (4b): sample products, the shopper's own item to style around (the photo item
// marked "You own this"), and wardrobe items they chose with Style with these. Stored as references in
// the looks table; the products and owned pieces are looked up again whenever a look is checked.

export type LookItem = { kind: "product"; productId: string } | { kind: "photo"; photoId: string; version: number } | { kind: "wardrobe"; itemId: string };

/** The kind of piece, for whether a look is a complete outfit. */
export type Group = "dress" | "suit" | "top" | "outer" | "bottom" | "shoes" | "bag" | "accessory" | "other";

const PRODUCT_GROUPS: Record<string, Group> = {
  dress: "dress",
  suit: "suit",
  top: "top",
  shirt: "top",
  "t-shirt": "top",
  knitwear: "top",
  cardigan: "outer",
  blazer: "outer",
  jacket: "outer",
  coat: "outer",
  trousers: "bottom",
  jeans: "bottom",
  skirt: "bottom",
  shorts: "bottom",
  shoes: "shoes",
  bag: "bag",
  accessory: "accessory",
};
/** Wardrobe categories (lib/wardrobe.ts), which owned pieces use. */
const OWNED_GROUPS: Record<string, Group> = {
  dresses: "dress",
  tops: "top",
  outerwear: "outer",
  bottoms: "bottom",
  shoes: "shoes",
  bags: "bag",
  accessories: "accessory",
};

export const productGroup = (category: string): Group => PRODUCT_GROUPS[category] ?? "other";
export const ownedGroup = (category: string): Group => OWNED_GROUPS[category] ?? "other";

/** A piece the shopper owns, as a look shows and checks it: never priced. */
export type OwnedPiece = { ref: LookItem; name: string; group: Group; words: string };

/** A look's items with what they are: a sample product, or something the shopper owns. */
export type ResolvedItem = { ref: LookItem; product: Product } | { ref: LookItem; owned: OwnedPiece };

export const groupOf = (item: ResolvedItem): Group => ("product" in item ? productGroup(item.product.category) : item.owned.group);
export const nameOf = (item: ResolvedItem) => ("product" in item ? item.product.name : item.owned.name);

/** One of these in a look at most. */
const ONLY_ONE: Group[] = ["dress", "suit", "bottom", "shoes", "bag"];

/** Why a look isn't a complete outfit, or null when it is: shoes, and a dress, a suit, or a top or jacket with a bottom. */
export function incomplete(items: ResolvedItem[]): string | null {
  const groups = items.map(groupOf);
  const count = (g: Group) => groups.filter((x) => x === g).length;
  const twice = ONLY_ONE.find((g) => count(g) > 1);
  if (twice) return `Two ${twice === "shoes" ? "pairs of shoes" : `${twice}s`} in one look`;
  if (!count("shoes")) return "No shoes";
  if (count("dress") || count("suit")) return null;
  if (count("bottom") && (count("top") || count("outer"))) return null;
  return "Not a complete outfit: it needs a dress, a suit, or a top with something on the bottom";
}

/**
 * What makes a look itself: its main pieces (the dress or suit, or the top and bottom), shopper's own
 * included. Two looks with the same main pieces are the same look with different shoes (Sabine's review
 * of the sample looks in 4b), so only one of them is shown.
 */
export function mainPieces(items: ResolvedItem[]): string {
  const main = items.filter((i) => ["dress", "suit", "top", "bottom"].includes(groupOf(i)));
  return main
    .map((i) => JSON.stringify(i.ref))
    .sort()
    .join("|");
}

/**
 * Whether a look whose main pieces aren't in `used` could still be made from these products and the
 * shopper's own pieces: a dress, a suit, a top with a bottom, or a bottom with a jacket or cardigan, with
 * every main piece the shopper is styling around, and with the cheapest shoes still inside the budget.
 * When none can (every dress that fits is shown, or none fits the budget with shoes), the looks builder
 * stops rather than paying for looks that can't be shown (Sabine's looks speed plan, 21 Oct 2026).
 */
export function canMakeAnother(products: Product[], owned: OwnedPiece[], mustUse: LookItem[], used: Set<string>, budget: BudgetLimit | null): boolean {
  const pieces: ResolvedItem[] = [
    ...products.map((product): ResolvedItem => ({ ref: { kind: "product", productId: product.id }, product })),
    ...owned.map((piece): ResolvedItem => ({ ref: piece.ref, owned: piece })),
  ];
  const of = (group: Group) => pieces.filter((i) => groupOf(i) === group);
  const cost = (i: ResolvedItem) => ("product" in i ? i.product.price.amountCents : 0);
  const shoes = Math.min(...of("shoes").map(cost));
  if (shoes === Infinity) return false;
  const must = new Set(mustUse.map((ref) => JSON.stringify(ref)));
  const musts = pieces.filter((i) => must.has(JSON.stringify(i.ref)) && mainPieces([i]));
  const bottoms = of("bottom");
  const options: ResolvedItem[][] = [
    ...of("dress").map((d) => [d]),
    ...of("suit").map((s) => [s]),
    ...of("top").flatMap((t) => bottoms.map((b) => [t, b])),
    ...(of("outer").length ? bottoms.map((b) => [b]) : []),
  ];
  const fits = (o: ResolvedItem[]) => compareWithBudget(o.reduce((sum, i) => sum + cost(i), shoes), budget).fits;
  return options.some((o) => musts.every((m) => o.includes(m)) && !used.has(mainPieces(o)) && fits(o));
}

/** A candidate that repeats a look already shown isn't judged: it couldn't be shown (looks speed plan). */
export const REPEATS_SHOWN = "The same main pieces as a look already shown";

/** The same item twice. */
export const duplicated = (refs: LookItem[]) => new Set(refs.map((r) => JSON.stringify(r))).size !== refs.length;
