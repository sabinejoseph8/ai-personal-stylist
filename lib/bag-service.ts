import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogConnector, Product } from "@/connectors/catalog/types";
import { type BagItem, MAX_BAG_ITEMS, sizesOf } from "@/core/looks/saved";
import { checkedLook, type LooksDeps } from "@/lib/looks-service";

// The demo bag (6a; R61, R62, design 4: Demo bag). Sample products from a look, each in a size. A piece
// goes in only from a look on screen whose check passed on the current requirements, and that check is
// recorded with it (R54, Sabine's answer to Q3): no new check and no AI. The shopper's own pieces can't
// go in. One row per product: adding it again changes its size. Nothing can be bought: checkout is
// refused by the server too (app/api/bag/checkout). Written only with the server key (review batch 5, E2).

type Row = { id: string; product_id: string; size: string; added_at: string };


const bagItem = (r: Row, p: Product): BagItem => ({
  id: r.id,
  productId: p.id,
  name: p.name,
  category: p.category,
  imageUrl: p.image.url,
  imageAlt: p.image.alt,
  priceCents: p.price.amountCents,
  size: r.size,
  sizes: sizesOf(p),
});

/** The guest's bag, newest first. A product no longer in the catalog drops out. */
export async function listBag(deps: { db: SupabaseClient; catalog: CatalogConnector }, guestId: string): Promise<BagItem[]> {
  const { data } = await deps.db.from("bag_items").select("id, product_id, size, added_at").eq("user_id", guestId).order("added_at", { ascending: false }).returns<Row[]>().throwOnError();
  const rows = data ?? [];
  const products = await Promise.all(rows.map((r) => deps.catalog.getProduct(r.product_id)));
  return rows.flatMap((r, i) => (products[i] ? [bagItem(r, products[i]!)] : []));
}

/** How many pieces are in the guest's bag, for the Demo bag link. */
export async function bagCount(db: SupabaseClient, guestId: string): Promise<number> {
  const { count } = await db.from("bag_items").select("id", { count: "exact", head: true }).eq("user_id", guestId).throwOnError();
  return count ?? 0;
}

export type AddRefusal = "owned" | "not_in_look" | "size" | "full";
export type AddResult = { items: BagItem[] } | { stale: true } | { refused: AddRefusal };

/**
 * Add to bag: the picked pieces of a look on the guest's screen, each in a size it comes in. Refused
 * whole when any piece is the shopper's own, isn't in the look, or isn't in that size, or when the bag
 * would hold more than 30. Null when the look isn't on the guest's screen.
 */
export async function addToBag(
  deps: Pick<LooksDeps, "db" | "catalog">,
  guestId: string,
  sessionId: string,
  lookId: string,
  picks: { productId: string; size: string }[],
): Promise<AddResult | null> {
  const { db } = deps;
  const found = await checkedLook(deps, guestId, sessionId, lookId);
  if (!found || "stale" in found) return found;
  const items = found.look.items;
  const rows: { user_id: string; product_id: string; size: string; check_result_id: string; added_at: string }[] = [];
  // The same product twice in one request: the last size wins, as adding it again would (6d review).
  for (const pick of new Map(picks.map((p) => [p.productId, p])).values()) {
    const item = items.find((i) => i.id === pick.productId);
    if (item?.owned) return { refused: "owned" };
    if (!item || item.kind !== "product") return { refused: "not_in_look" };
    const product = await deps.catalog.getProduct(item.id);
    if (!product) return { refused: "not_in_look" };
    if (!sizesOf(product).includes(pick.size)) return { refused: "size" };
    rows.push({ user_id: guestId, product_id: product.id, size: pick.size, check_result_id: found.checkId, added_at: new Date().toISOString() });
  }
  const { data: there } = await db.from("bag_items").select("product_id").eq("user_id", guestId).throwOnError();
  const ids = new Set((there ?? []).map((r) => r.product_id as string));
  for (const r of rows) ids.add(r.product_id);
  if (ids.size > MAX_BAG_ITEMS) return { refused: "full" };
  if (rows.length) await db.from("bag_items").upsert(rows, { onConflict: "user_id,product_id" }).throwOnError();
  return { items: await listBag(deps, guestId) };
}

/** A new size for a piece in the bag: one the product comes in. Null when it isn't the guest's; false when the size isn't offered. */
export async function changeSize(deps: { db: SupabaseClient; catalog: CatalogConnector }, guestId: string, id: string, size: string): Promise<BagItem[] | false | null> {
  const { data } = await deps.db.from("bag_items").select("id, product_id, size, added_at").eq("id", id).eq("user_id", guestId).returns<Row[]>().maybeSingle().throwOnError();
  if (!data) return null;
  const product = await deps.catalog.getProduct(data.product_id);
  if (!product || !sizesOf(product).includes(size)) return false;
  await deps.db.from("bag_items").update({ size }).eq("id", id).eq("user_id", guestId).throwOnError();
  return listBag(deps, guestId);
}

/** Remove: true when the guest's piece is gone from the bag. */
export async function removeFromBag(db: SupabaseClient, guestId: string, id: string): Promise<boolean> {
  const { data } = await db.from("bag_items").delete().eq("id", id).eq("user_id", guestId).select("id").throwOnError();
  return (data ?? []).length > 0;
}
