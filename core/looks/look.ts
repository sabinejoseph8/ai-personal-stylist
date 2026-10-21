import type { Product } from "../../connectors/catalog/types";

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

/** The same item twice. */
export const duplicated = (refs: LookItem[]) => new Set(refs.map((r) => JSON.stringify(r))).size !== refs.length;
