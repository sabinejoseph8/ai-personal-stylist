import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogConnector, Product } from "@/connectors/catalog/types";
import { type BuiltLook, type LooksBuilder } from "@/core/looks/builder";
import { filterCandidates, type Requirements, ruleLabel } from "@/core/looks/candidates";
import { type Anchor, type CheckReason, codeCheck } from "@/core/looks/checker";
import type { Judge, Verdict } from "@/core/looks/judge";
import { canMakeAnother, groupOf, type LookItem, mainPieces, nameOf, type OwnedPiece, ownedGroup, REPEATS_SHOWN, type ResolvedItem } from "@/core/looks/look";
import { explainNoMatch, type NoMatch } from "@/core/looks/no-match";
import { noOtherPiece, swapCandidates } from "@/core/looks/swap";
import { looksReadiness } from "@/core/looks/readiness";
import type { ShownItem, ShownLook } from "@/core/looks/shown";
import { lookTotal } from "@/core/looks/totals";
import { active, type Note } from "@/core/notes/types";
import { chosenItem } from "@/core/photos/item";
import type { BudgetGuard } from "@/lib/budget-guard";
import { lookRequirements } from "@/lib/looks-inputs";
import { loadNotes, SessionEndedError } from "@/lib/notes-store";
import { activePhoto } from "@/lib/photos-service";
import { loadProfile } from "@/lib/profile-store";
import { categoryOf } from "@/lib/wardrobe";

// Building looks (4b; R39, R40, R54, R55, R59, tech spec 1.3): the candidate filter, the looks builder,
// the preference checker (rules in code, then the judgment step) and the one publishing gate. Up to 3
// rounds, until 3 looks pass; if fewer do, the ones that passed are shown with an explanation (Sabine's
// answer to Q2 in 4b). Looks and checks are the app's own record (decision A), written with the server
// key, and every decision is kept for Behind the scenes (4d).

export type LooksDeps = { db: SupabaseClient; catalog: CatalogConnector; guard: BudgetGuard; builder: LooksBuilder; judge: Judge };

export type { ShownItem, ShownLook };

export type BuildResult =
  | { needs: string }
  | { looks: ShownLook[]; noMatch: NoMatch | null }
  /** The requirements changed while the looks were being built (newest wins, R52): build again. */
  | { stale: true }
  /** Too many builds this hour. */
  | { limited: true };

const LOOKS_WANTED = 3;
const ROUNDS = 3;

/** JSON with its keys in order, so the same requirements always give the same fingerprint. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

/** Everything a session's looks must meet, read fresh, with its fingerprint. */
async function gather(db: SupabaseClient, guestId: string, sessionId: string) {
  const [requirements, profile, { notes }, photo, picks] = await Promise.all([
    lookRequirements(db, guestId, sessionId),
    loadProfile(db, guestId),
    loadNotes(db, sessionId),
    activePhoto(db, sessionId),
    db.from("wardrobe_items").select("id, name, category, details").eq("user_id", guestId).eq("styling", true).eq("draft", false).order("created_at").throwOnError(),
  ]);
  // Feedback on a look (5a) is for revising it (5b), not a requirement every look must meet.
  const confirmed = active(notes).filter((n) => n.status === "confirmed" && n.kind !== "budget" && n.kind !== "feedback");
  const owned: OwnedPiece[] = [];
  let anchor: Anchor | null = null;
  let inspiration: string | null = null;
  const item = photo ? chosenItem(photo.item.reading) : null;
  // A photo whose owner isn't confirmed yet is an open question, not part of the looks (R30, R40).
  if (photo && item && photo.item.ownership) {
    const d = item.details;
    const words = [d.type.value, d.colors.value, d.pattern.value, d.style.value].filter(Boolean).join(", ");
    anchor = { photoId: photo.id, version: photo.version, name: item.name, owned: photo.item.ownership === "owned" };
    if (anchor.owned) owned.push({ ref: { kind: "photo", photoId: photo.id, version: photo.version }, name: item.name, group: ownedGroup(categoryOf(d.type.value)), words });
    else inspiration = `${item.name} (${words})`;
  }
  for (const w of picks.data ?? []) {
    const d = (w.details ?? {}) as Record<string, string>;
    owned.push({ ref: { kind: "wardrobe", itemId: w.id }, name: w.name, group: ownedGroup(w.category ?? "other"), words: [d.type, d.colors, d.pattern, d.style].filter(Boolean).join(", ") });
  }
  const likes = profile.preferences.filter((p) => p.kind === "likes").map((p) => p.words);
  const preferredColors = confirmed.flatMap((n) => n.details.filter((d) => d.name === "prefer" && d.value.trim()).map((d) => d.value.trim()));
  const judged = requirements.rules.filter((r) => r.rule.type === "judged").map(ruleLabel);
  const noteWords = confirmed.map((n) => n.text);
  const key = createHash("sha256")
    .update(
      stable({
        requirements,
        notes: confirmed.map((n: Note) => ({ kind: n.kind, text: n.text, details: n.details })),
        anchor,
        item: anchor ? item : null,
        owned: owned.map((o) => ({ ref: o.ref, name: o.name, words: o.words })),
        likes,
      }),
    )
    .digest("hex");
  return { requirements, notes, noteWords, owned, anchor, inspiration, likes, preferredColors, judged, key };
}

type Gathered = Awaited<ReturnType<typeof gather>>;

const budgetText = (r: Requirements) => {
  const b = r.budget;
  if (!b) return null;
  return b.meaning === "between" ? `$${b.amount} to $${b.max}` : b.meaning === "around" ? `around $${b.amount} (up to 10% over is fine)` : `up to $${b.amount}`;
};

/** A look's items with their products and owned pieces, or null when one can't be found. */
function resolve(items: LookItem[], products: Map<string, Product>, owned: OwnedPiece[]): ResolvedItem[] | null {
  const out: ResolvedItem[] = [];
  for (const ref of items) {
    if (ref.kind === "product") {
      const product = products.get(ref.productId);
      if (!product) return null;
      out.push({ ref, product });
    } else {
      const piece = owned.find((o) => JSON.stringify(o.ref) === JSON.stringify(ref));
      if (!piece) return null;
      out.push({ ref, owned: piece });
    }
  }
  return out;
}

const totalOf = (items: ResolvedItem[], r: Requirements) =>
  lookTotal(
    items.map((i) => ("product" in i ? { owned: false, priceCents: i.product.price.amountCents } : { owned: true })),
    r.budget,
  );

const refId = (ref: LookItem) => (ref.kind === "product" ? ref.productId : ref.kind === "photo" ? ref.photoId : ref.itemId);

function shown(id: string, slot: number, look: { name: string; reason: string }, items: ResolvedItem[], r: Requirements, current: boolean): ShownLook {
  return {
    id,
    slot,
    name: look.name,
    reason: look.reason,
    // The shopper's own pieces get their photos in the browser, which has their links (4c).
    items: items.map((i) =>
      "product" in i
        ? {
            kind: "product",
            id: i.product.id,
            group: groupOf(i),
            name: i.product.name,
            category: i.product.category,
            owned: false,
            priceCents: i.product.price.amountCents,
            imageUrl: i.product.image.url,
            imageAlt: i.product.image.alt,
          }
        : { kind: i.ref.kind, id: refId(i.ref), group: i.owned.group, name: i.owned.name, category: i.owned.group, owned: true, priceCents: null, imageUrl: null, imageAlt: i.owned.name },
    ),
    total: totalOf(items, r),
    current,
  };
}

type Checked = { verdict: Verdict; reasons: CheckReason[]; failedProducts: string[]; reason?: string };

/** Checks one candidate look: rules in code, then, only if they all hold, the judgment step. */
async function check(deps: LooksDeps, guestId: string, g: Gathered, items: ResolvedItem[], withReason = false): Promise<Checked> {
  const code = codeCheck({ items, requirements: g.requirements, anchor: g.anchor, wardrobePicks: g.owned.filter((o) => o.ref.kind === "wardrobe").map((o) => (o.ref as { itemId: string }).itemId) });
  if (!code.ok) return { verdict: "conflict", reasons: code.reasons, failedProducts: code.failedProducts };
  const money = await deps.guard.checkAi(guestId, "claude");
  if (!money.ok) return { verdict: "needs_clarification", reasons: [...code.reasons, { about: "Judgment", ok: false, why: "Today's AI allowance is used up" }], failedProducts: [] };
  const judged = await deps.judge.judge({ items, notes: g.noteWords, judged: g.judged, likes: g.likes, inspiration: g.inspiration, withReason });
  if (judged.costUsd > 0) await deps.guard.recordAi(guestId, "claude", judged.costUsd);
  return { verdict: judged.verdict, reasons: [...code.reasons, ...judged.reasons], failedProducts: [], reason: judged.reason };
}

const failedWhy = (c: Checked) =>
  c.reasons
    .filter((r) => !r.ok)
    .map((r) => r.why)
    .join("; ");

type Versions = {
  build?: string;
  round?: number;
  position?: number;
  slot?: number;
  tried?: string[];
  swap?: { from: string; to: string };
  /**
   * Replacements that failed the check on these requirements, by the piece's place in the look: not
   * checked again (found on Sabine's iPhone in 4d; each piece kept apart since the 4e review).
   */
  failed?: { key: string; pieces: Record<string, string[]> };
};
type LookRow = { id: string; name: string | null; reason: string | null; items: LookItem[]; requirements_key: string | null; input_versions: Versions; status: string; created_at: string };
type OnScreen = LookRow & { slot: number };

/** The looks on screen, one per place (published, or being checked again), in place order. */
async function onScreen(db: SupabaseClient, guestId: string, sessionId: string): Promise<OnScreen[]> {
  const { data } = await db
    .from("looks")
    .select("id, name, reason, items, requirements_key, input_versions, status, created_at")
    .eq("session_id", sessionId)
    .eq("user_id", guestId)
    .in("status", ["published", "needs_check"])
    .order("created_at", { ascending: false })
    .throwOnError();
  const bySlot = new Map<number, OnScreen>();
  for (const row of (data ?? []) as LookRow[]) {
    const slot = row.input_versions.slot ?? 0;
    if (slot >= 1 && slot <= LOOKS_WANTED && !bySlot.has(slot)) bySlot.set(slot, { ...row, slot });
  }
  return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
}

async function productsOf(catalog: CatalogConnector, refs: LookItem[]) {
  const ids = [...new Set(refs.flatMap((i) => (i.kind === "product" ? [i.productId] : [])))];
  return new Map((await Promise.all(ids.map((id) => catalog.getProduct(id)))).flatMap((p) => (p ? [[p.id, p] as const] : [])));
}

/** A row as its panel shows it: current only when it passed a check on these exact requirements. */
const shownRow = (row: OnScreen, items: ResolvedItem[], g: Gathered) =>
  shown(row.id, row.slot, { name: row.name ?? "Look", reason: row.reason ?? "" }, items, g.requirements, row.status === "published" && row.requirements_key === g.key);

async function sessionOpen(db: SupabaseClient, guestId: string, sessionId: string) {
  const { data } = await db.from("sessions").select("id").eq("id", sessionId).eq("user_id", guestId).in("status", ["active", "paused"]).maybeSingle().throwOnError();
  return Boolean(data);
}

export type BuildStage = "building" | "checking" | "updating";
export type BuildOptions = {
  /** Asked once before any AI work (the 20 builds an hour limit). False turns the build away. */
  allowAi?: () => Promise<boolean>;
  /** Try again: fill empty places even though nothing changed. */
  force?: boolean;
};

/**
 * Brings a session's looks up to date (POST /api/sessions/:id/looks; R39, R40, R44, R54, R55, R58, R59).
 * - Not ready yet: says what's needed.
 * - Looks on screen that are still current stay as they are, at no cost.
 * - Looks built on old requirements are checked again (Sabine's answer to Q3 in 4c): those that still
 *   meet everything stay in their place, and those that don't are held.
 * - Empty places are filled by the looks builder, up to 3 rounds; if fewer than 3 pass, the ones that
 *   did are shown with an explanation (Q2 in 4b).
 * `emit` hears the stages, for "Putting looks together", "Checking your preferences" and "Updating".
 * Null when the session isn't the guest's open one.
 */
export async function buildLooks(deps: LooksDeps, guestId: string, sessionId: string, emit: (state: BuildStage) => void = () => {}, options: BuildOptions = {}): Promise<BuildResult | null> {
  if (!(await sessionOpen(deps.db, guestId, sessionId))) return null;
  return inTurn(deps.db, sessionId, () => emit("building"), () => buildNow(deps, guestId, sessionId, emit, options));
}

/** How long a request waits for a build already running: as long as a build may take. */
const BUILD_WAIT_SECONDS = 300;

/**
 * One build or swap at a time per session (migration one_build_at_a_time): a request that finds one
 * running waits for it, then starts again from what it made. Swaps too (Phase 4 code review), so a swap
 * and a build can't both fill the same place.
 */
async function inTurn<T>(db: SupabaseClient, sessionId: string, onWait: () => void, work: () => Promise<T>): Promise<T | { stale: true }> {
  for (let waited = 0; ; waited++) {
    const { data: claimed } = await db.rpc("claim_looks_build", { session: sessionId }).throwOnError();
    if (claimed) break;
    if (waited === 0) onWait();
    if (waited >= BUILD_WAIT_SECONDS) return { stale: true };
    await new Promise((r) => setTimeout(r, 1000));
  }
  try {
    return await work();
  } finally {
    await db.rpc("release_looks_build", { session: sessionId });
  }
}

async function buildNow(deps: LooksDeps, guestId: string, sessionId: string, emit: (state: BuildStage) => void, options: BuildOptions): Promise<BuildResult> {
  const { db } = deps;
  const g = await gather(db, guestId, sessionId);
  const ready = looksReadiness(g.notes);
  if (!ready.ready) return { needs: ready.needs };

  const [rows, { data: session }] = await Promise.all([
    onScreen(db, guestId, sessionId),
    db.from("sessions").select("looks_built_for").eq("id", sessionId).maybeSingle().throwOnError(),
  ]);
  // Deleted meanwhile (the shopper ended it): nothing to build (found in GitHub's log in 5a).
  if (!session) throw new SessionEndedError();
  const isCurrent = (r: OnScreen) => r.status === "published" && r.requirements_key === g.key;
  const stale = rows.filter((r) => !isCurrent(r));
  const shownFrom = (list: OnScreen[], products: Map<string, Product>) =>
    list.flatMap((r) => {
      const items = resolve(r.items, products, g.owned);
      return items ? [shownRow(r, items, g)] : [];
    });

  // Nothing has changed since the last build on these requirements: no AI needed, whether it found three
  // looks, fewer, or none (Phase 4 code review: with none, every note made it build again). Try again
  // fills the empty places anyway.
  const unchanged = !stale.length && (rows.length >= LOOKS_WANTED || (!options.force && (rows.length > 0 || session.looks_built_for === g.key)));
  if (unchanged && rows.length >= LOOKS_WANTED) {
    // Three looks: only their own products are needed, not the whole catalog.
    return { looks: shownFrom(rows, await productsOf(deps.catalog, rows.flatMap((r) => r.items))), noMatch: null };
  }

  const department = g.requirements.departments.length === 1 ? g.requirements.departments[0] : undefined;
  const catalog = await deps.catalog.search({ department, limit: 1000 });
  const products = new Map(catalog.map((p) => [p.id, p]));
  let filtered = filterCandidates(catalog, g.requirements);
  const explain = (count: number) => (count < LOOKS_WANTED ? explainNoMatch(g.requirements, filtered.kept, filtered.leftOut, count) : null);
  const looksNow = async () => shownFrom(await onScreen(db, guestId, sessionId), products);

  if (unchanged) {
    const looks = shownFrom(rows, products);
    return { looks, noMatch: explain(looks.length) };
  }
  if (options.allowAi && !(await options.allowAi())) return { limited: true };

  const kept: { slot: number; items: ResolvedItem[] }[] = rows.flatMap((r) => {
    const items = isCurrent(r) ? resolve(r.items, products, g.owned) : null;
    return items ? [{ slot: r.slot, items }] : [];
  });
  const excluded = new Set<string>();
  const avoid: string[] = [];

  // 1. Check the looks on screen again. Meanwhile they're marked Needs a new check, and stay on screen.
  if (stale.length) {
    emit("updating");
    const ids = stale.map((r) => r.id);
    await db.from("looks").update({ status: "needs_check" }).in("id", ids).in("status", ["published", "needs_check"]).throwOnError();
    const rechecked = await Promise.all(
      stale.map(async (row) => {
        const items = resolve(row.items, products, g.owned);
        const result: Checked = items
          ? await check(deps, guestId, g, items)
          : { verdict: "conflict", reasons: [{ about: "Items", ok: false, why: "One of its items is no longer in the look's inputs" }], failedProducts: [] };
        // The record of this check, on these requirements: the gate needs both to match.
        await db
          .from("looks")
          .update({ requirements_key: g.key, total_cents: items ? totalOf(items, g.requirements).totalCents : null })
          .eq("id", row.id)
          .eq("status", "needs_check")
          .throwOnError();
        await db.rpc("record_check", { look: row.id, verdict: result.verdict, reasons: result.reasons, requirements_key: g.key }).throwOnError();
        return { row, items, ...result };
      }),
    );
    // Newest wins (R52): changed again meanwhile, so the next request checks them on the newest.
    if ((await gather(db, guestId, sessionId)).key !== g.key) return { stale: true };
    for (const c of rechecked) {
      if (c.verdict === "pass" && c.items) {
        const { data: ok } = await db.rpc("publish_look", { look: c.row.id, current_requirements: g.key }).throwOnError();
        if (ok) {
          kept.push({ slot: c.row.slot, items: c.items });
          continue;
        }
      }
      // A look that fails is never shown (R55): its place is filled by a new one.
      await db.from("looks").update({ status: "held" }).eq("id", c.row.id).eq("status", "needs_check").eq("requirements_key", g.key).throwOnError();
      for (const id of c.failedProducts) excluded.add(id);
      if (c.items) avoid.push(`${c.items.map(nameOf).join(" + ")}: ${failedWhy(c)}`);
    }
  }

  // 2. Fill the empty places.
  const taken = new Set(kept.map((k) => k.slot));
  const empty = Array.from({ length: LOOKS_WANTED }, (_, i) => i + 1).filter((slot) => !taken.has(slot));
  // No two looks share their main pieces (Sabine's review of the sample looks in 4b).
  const shownMains = new Set(kept.map((k) => mainPieces(k.items)));
  for (const k of kept) avoid.push(`${k.items.map(nameOf).join(" + ")}: already shown, so make different looks`);
  const build = randomUUID();
  let placed = 0;

  const mustUse = g.owned.filter((o) => o.ref.kind === "photo").map((o) => o.ref);

  for (let round = 1; round <= ROUNDS && placed < empty.length; round++) {
    filtered = filterCandidates(
      catalog.filter((p) => !excluded.has(p.id)),
      g.requirements,
    );
    // Nothing new can be made from what still fits (only two dresses fit, and both are shown): stop
    // here, with the explanation, rather than build looks that can't be shown (looks speed plan).
    if (!filtered.kept.length || !canMakeAnother(filtered.kept, g.owned, mustUse, shownMains, g.requirements.budget)) break;
    emit("building");
    const money = await deps.guard.checkAi(guestId, "claude");
    if (!money.ok) break;
    const built = await deps.builder.build({
      products: filtered.kept,
      owned: g.owned,
      mustUse,
      inspiration: g.inspiration,
      notes: g.noteWords,
      budget: budgetText(g.requirements),
      preferredColors: g.preferredColors,
      likes: g.likes,
      judged: g.judged,
      avoid,
    });
    if (built.costUsd > 0) await deps.guard.recordAi(guestId, "claude", built.costUsd);

    emit("checking");
    const checked = await Promise.all(
      built.looks.map(async (look: BuiltLook, position) => {
        const items = resolve(look.items, products, g.owned);
        // A look already shown with other shoes can't be shown again, so it isn't worth judging (looks speed plan).
        const result: Checked = !items
          ? { verdict: "conflict", reasons: [{ about: "Items", ok: false, why: "Uses an item that isn't on the list" }], failedProducts: [] }
          : shownMains.has(mainPieces(items))
            ? { verdict: "conflict", reasons: [{ about: "Outfit", ok: false, why: REPEATS_SHOWN }], failedProducts: [] }
            : await check(deps, guestId, g, items);
        const { data: row } = await db
          .from("looks")
          .insert({
            user_id: guestId,
            session_id: sessionId,
            items: look.items,
            total_cents: items ? totalOf(items, g.requirements).totalCents : null,
            reason: look.reason,
            name: look.name,
            requirements_key: g.key,
            input_versions: { requirements: g.key, build, round, position },
            status: "checking",
          })
          .select("id")
          .single()
          .throwOnError();
        await db.rpc("record_check", { look: row!.id, verdict: result.verdict, reasons: result.reasons, requirements_key: g.key }).throwOnError();
        return { id: row!.id as string, look, position, items, ...result };
      }),
    );

    // Newest wins (R52): if anything the looks must meet changed meanwhile, none of these is published.
    if ((await gather(db, guestId, sessionId)).key !== g.key) {
      await db.from("looks").update({ status: "held" }).eq("session_id", sessionId).filter("input_versions->>build", "eq", build).eq("status", "checking").throwOnError();
      return { stale: true };
    }
    for (const c of checked) {
      const main = c.items ? mainPieces(c.items) : "";
      if (c.verdict === "pass" && c.items && placed < empty.length && !shownMains.has(main)) {
        // The one publishing gate: the database checks the pass was for these exact items and requirements.
        const slot = empty[placed];
        await db.from("looks").update({ input_versions: { requirements: g.key, build, round, position: c.position, slot } }).eq("id", c.id).throwOnError();
        const { data: ok } = await db.rpc("publish_look", { look: c.id, current_requirements: g.key }).throwOnError();
        if (ok) {
          placed++;
          shownMains.add(main);
          // The next round is told, so it doesn't offer this look again (looks speed plan).
          avoid.push(`${c.items.map(nameOf).join(" + ")}: already shown, so make different looks`);
          continue;
        }
      }
      if (c.verdict === "pass" && c.items && shownMains.has(main)) avoid.push(`${c.items.map(nameOf).join(" + ")}: the same main pieces as a look already chosen`);
      await db.from("looks").update({ status: "held" }).eq("id", c.id).throwOnError();
      for (const id of c.failedProducts) excluded.add(id);
      if (c.verdict !== "pass" && c.items) avoid.push(`${c.items.map(nameOf).join(" + ")}: ${failedWhy(c)}`);
    }
  }
  // Built for these requirements: until they change, asking again doesn't build again.
  await db.from("sessions").update({ looks_built_for: g.key }).eq("id", sessionId).throwOnError();
  const looks = await looksNow();
  return { looks, noMatch: explain(looks.length) };
}

/** The looks on screen for a session (GET /api/sessions/:id/looks), each marked whether it's still current. */
export async function currentLooks(deps: Pick<LooksDeps, "db" | "catalog">, guestId: string, sessionId: string): Promise<ShownLook[]> {
  const rows = await onScreen(deps.db, guestId, sessionId);
  if (!rows.length) return [];
  const [g, products] = await Promise.all([gather(deps.db, guestId, sessionId), productsOf(deps.catalog, rows.flatMap((r) => r.items))]);
  return rows.flatMap((r) => {
    const items = resolve(r.items, products, g.owned);
    return items ? [shownRow(r, items, g)] : [];
  });
}

export type SwapResult =
  /** The look with its new piece at `index`, in the same place. */
  | { look: ShownLook; index: number }
  /** Nothing else passed: the look stays as it was. */
  | { none: string }
  /** The look isn't current any more (a change, or it was replaced): bring the looks up to date first. */
  | { stale: true }
  | { limited: true };

const SWAP_BATCH = 3;

/**
 * Swap a piece (POST /api/sessions/:id/looks/:lookId/swap; R43, Sabine's answer to Q1 in 4c). Code picks
 * up to 3 replacements (core/looks/swap.ts), all checked at once by the whole preference checker; the
 * best-ranked one that passes goes in, through the publishing gate, which retires the old look in the
 * same step. Up to 3 batches. Its reason is written afresh by the judgment step, since the old one may
 * name the piece swapped out. Null when the session or look isn't the guest's, or the piece can't be swapped.
 */
export async function swapPiece(deps: LooksDeps, guestId: string, sessionId: string, lookId: string, index: number, options: Pick<BuildOptions, "allowAi"> = {}): Promise<SwapResult | null> {
  if (!(await sessionOpen(deps.db, guestId, sessionId))) return null;
  return inTurn(deps.db, sessionId, () => {}, () => swapNow(deps, guestId, sessionId, lookId, index, options));
}

async function swapNow(deps: LooksDeps, guestId: string, sessionId: string, lookId: string, index: number, options: Pick<BuildOptions, "allowAi">): Promise<SwapResult | null> {
  const { db } = deps;
  const g = await gather(db, guestId, sessionId);
  const rows = await onScreen(db, guestId, sessionId);
  const row = rows.find((r) => r.id === lookId);
  if (!row) {
    const { data: known } = await db.from("looks").select("id").eq("id", lookId).eq("session_id", sessionId).eq("user_id", guestId).maybeSingle().throwOnError();
    return known ? { stale: true } : null;
  }
  if (row.status !== "published" || row.requirements_key !== g.key) return { stale: true };
  const ref = row.items[index];
  if (!ref || ref.kind !== "product") return null;

  const department = g.requirements.departments.length === 1 ? g.requirements.departments[0] : undefined;
  const catalog = await deps.catalog.search({ department, limit: 1000 });
  const products = new Map(catalog.map((p) => [p.id, p]));
  const items = resolve(row.items, products, g.owned);
  if (!items) return { stale: true };
  const filtered = filterCandidates(catalog, g.requirements);
  // The other looks' main pieces: a swap mustn't make two looks the same.
  const others = rows.filter((r) => r.id !== row.id).flatMap((r) => {
    const its = resolve(r.items, products, g.owned);
    return its ? [{ slot: r.slot, main: mainPieces(its) }] : [];
  });

  // Replacements that already failed here, on these requirements, aren't checked again: a second Swap
  // would only pay for the same answer. A change to the requirements starts afresh.
  const before = row.input_versions.failed;
  const known = before?.key === g.key && before.pieces ? before.pieces : {};
  const failed = new Set(known[String(index)] ?? []);
  // When a piece changes, what failed for the other pieces was checked against the old one: forgotten.
  const remember = (look: string, versions: Versions, othersStill: boolean) =>
    db
      .from("looks")
      .update({ input_versions: { ...versions, failed: { key: g.key, pieces: { ...(othersStill ? known : {}), [index]: [...failed] } } } })
      .eq("id", look)
      .throwOnError();
  let tried = new Set([...(row.input_versions.tried ?? []), ref.productId]);
  let pool = swapCandidates(filtered.kept, items, index, new Set([...tried, ...failed]), g.requirements.budget);
  // Every one that passes has been shown here already: start again, leaving out the piece in the look now.
  if (!pool.length && tried.size > 1) {
    tried = new Set([ref.productId]);
    pool = swapCandidates(filtered.kept, items, index, new Set([...tried, ...failed]), g.requirements.budget);
  }
  if (!pool.length) return { none: noOtherPiece(items[index]) };
  if (options.allowAi && !(await options.allowAi())) return { limited: true };

  for (let batch = 0; batch < 3 && pool.length; batch++) {
    const picks = pool.splice(0, SWAP_BATCH);
    for (const p of picks) tried.add(p.id);
    const checked = await Promise.all(
      picks.map(async (product) => {
        const refs = row.items.map((r, i): LookItem => (i === index ? { kind: "product", productId: product.id } : r));
        const swapped = items.map((it, i): ResolvedItem => (i === index ? { ref: refs[i], product } : it));
        const same = others.find((o) => o.main === mainPieces(swapped));
        const result: Checked = same
          ? { verdict: "conflict", reasons: [{ about: "Outfit", ok: false, why: `The same main pieces as Look ${same.slot}` }], failedProducts: [] }
          : await check(deps, guestId, g, swapped, true);
        const { data: inserted } = await db
          .from("looks")
          .insert({
            user_id: guestId,
            session_id: sessionId,
            items: refs,
            total_cents: totalOf(swapped, g.requirements).totalCents,
            reason: result.reason ?? row.reason,
            name: row.name,
            revision_of: row.id,
            requirements_key: g.key,
            input_versions: { ...row.input_versions, swap: { from: ref.productId, to: product.id }, tried: [...tried] },
            status: "checking",
          })
          .select("id")
          .single()
          .throwOnError();
        await db.rpc("record_check", { look: inserted!.id, verdict: result.verdict, reasons: result.reasons, requirements_key: g.key }).throwOnError();
        return { id: inserted!.id as string, product: product.id, swapped, ...result };
      }),
    );
    for (const c of checked) if (c.verdict !== "pass") failed.add(c.product);
    const winner = checked.find((c) => c.verdict === "pass");
    const losers = checked.filter((c) => c !== winner).map((c) => c.id);
    if (losers.length) await db.from("looks").update({ status: "held" }).in("id", losers).throwOnError();
    // Newest wins (R52): a change meanwhile means this swap was checked on old requirements.
    if ((await gather(db, guestId, sessionId)).key !== g.key) {
      if (winner) await db.from("looks").update({ status: "held" }).eq("id", winner.id).throwOnError();
      return { stale: true };
    }
    if (winner) {
      // The other pieces are the same, so what failed here still fails with the new piece in.
      await remember(winner.id, { ...row.input_versions, swap: { from: ref.productId, to: winner.product }, tried: [...tried] }, false);
      const { data: ok } = await db.rpc("publish_look", { look: winner.id, current_requirements: g.key, replaces: row.id }).throwOnError();
      if (!ok) {
        await db.from("looks").update({ status: "held" }).eq("id", winner.id).throwOnError();
        return { stale: true };
      }
      const look = shown(winner.id, row.slot, { name: row.name ?? "Look", reason: winner.reason ?? row.reason ?? "" }, winner.swapped, g.requirements, true);
      return { look, index };
    }
  }
  await remember(row.id, row.input_versions, true);
  return { none: noOtherPiece(items[index]) };
}
