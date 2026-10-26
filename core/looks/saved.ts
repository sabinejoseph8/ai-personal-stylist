import type { Product } from "../../connectors/catalog/types";
import { type SizeField, sizeFieldOf } from "./candidates";
import type { LookItem, OwnedPiece } from "./look";
import type { ShownItem } from "./shown";
import type { LookTotal } from "./totals";

// Saved looks and the demo bag (6a; R60 to R62, design 4: Saved looks, Demo bag). Shared by the server
// (lib/saved-looks-service.ts, lib/bag-service.ts) and the pages.

/** At most this many saved looks, and this many pieces in the bag, per guest. */
export const MAX_SAVED_LOOKS = 30;
export const MAX_BAG_ITEMS = 30;

/** "product:a|wardrobe:b": a look's pieces in order, so the same look is saved once. The page builds it from what it shows. */
export const itemsKey = (items: { kind: string; id: string }[]) => items.map((i) => `${i.kind}:${i.id}`).join("|");

/**
 * What a saved look keeps: its pieces as the look had them, its name and reason, and the shopper's own
 * pieces by name (Sabine's answer to Q2 in 6a): a session photo goes when the session ends (R63), so the
 * saved look shows that piece by name, with no photo.
 */
export type SavedCopy = { name: string; reason: string; refs: LookItem[]; items: ShownItem[]; owned: OwnedPiece[]; totalCents: number };

/** A saved look in the list: a small collage of its pieces, its name and the date saved. */
export type SavedLook = { id: string; savedAt: string; name: string; items: ShownItem[]; totalCents: number; key: string };

/** A saved look opened after a passing check against the saved profile (Sabine's answer to Q1 in 6a). */
export type OpenedLook = { id: string; name: string; reason: string; items: ShownItem[]; total: LookTotal };

/** A piece in the demo bag (R61), with the sizes it comes in. Sample products only, never for sale (R62). */
export type BagItem = {
  id: string;
  productId: string;
  name: string;
  category: string;
  imageUrl: string;
  imageAlt: string;
  priceCents: number;
  size: string;
  sizes: string[];
};

/** The words the bag and its disabled Checkout use (R61, design 4). */
export const DEMO_ONLY = "Demo only: these sample products can't be bought.";

/** The sizes a product comes in, in the catalog's order. */
export const sizesOf = (p: Product) => [...new Set(p.variants.map((v) => v.size))];

/** The size the bag sheet starts on: the profile's size for that kind of piece when it comes in it, or its only size, or none (the shopper picks). */
export function defaultSize(p: Product, sizes: Partial<Record<SizeField, string>>): string | null {
  const offered = sizesOf(p);
  if (offered.length === 1) return offered[0];
  const field = sizeFieldOf(p.department, p.category);
  const want = field ? sizes[field]?.trim().toLowerCase() : undefined;
  return offered.find((s) => s.toLowerCase() === want) ?? null;
}
