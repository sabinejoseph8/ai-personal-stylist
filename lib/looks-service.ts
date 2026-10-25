import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogConnector, Product } from "@/connectors/catalog/types";
import { type BuiltLook, type LooksBuilder } from "@/core/looks/builder";
import { filterCandidates, type Requirements, ruleLabel } from "@/core/looks/candidates";
import { type Anchor, budgetWords, type CheckReason, codeCheck } from "@/core/looks/checker";
import type { Judge, Verdict } from "@/core/looks/judge";
import { canMakeAnother, groupOf, type LookItem, mainPieces, nameOf, type OwnedPiece, ownedGroup, productGroup, REPEATS_SHOWN, type ResolvedItem } from "@/core/looks/look";
import { differences } from "@/core/looks/compare";
import { explainNoMatch, type NoMatch } from "@/core/looks/no-match";
import { changeSummary, feedbackKey, type LookFeedback, lookFeedback, meetsWishes, nothingFits, pendingFeedback, type RevisionPlan, revisionPlan, seenOf, turnedDownIn } from "@/core/looks/revise";
import type { Rule } from "@/core/looks/rules";
import { noOtherPiece, swapCandidates } from "@/core/looks/swap";
import { looksReadiness } from "@/core/looks/readiness";
import { droppedWants, type RuledPreference, type Want, wantKey, wantsFrom, wantsPlan } from "@/core/looks/wants";
import type { ShownItem, ShownLook } from "@/core/looks/shown";
import { lookTotal } from "@/core/looks/totals";
import { feedbackOf } from "@/core/notes/feedback";
import { active, type Note } from "@/core/notes/types";
import { chosenItem } from "@/core/photos/item";
import type { BudgetGuard } from "@/lib/budget-guard";
import { lookRequirements, sessionExceptions } from "@/lib/looks-inputs";
import { loadNotes, SessionEndedError } from "@/lib/notes-store";
import { activePhoto } from "@/lib/photos-service";
import { RuleSchema } from "@/lib/profile";
import { loadProfile } from "@/lib/profile-store";
import { categoryOf } from "@/lib/wardrobe";

// Building looks (4b; R39, R40, R54, R55, R59, tech spec 1.3): the candidate filter, the looks builder,
// the preference checker (rules in code, then the judgment step) and the one publishing gate. Up to 3
// rounds, until 3 looks pass; if fewer do, the ones that passed are shown with an explanation (Sabine's
// answer to Q2 in 4b). Looks and checks are the app's own record (decision A), written with the server
// key, and every decision is kept for Behind the scenes (4d). Feedback revises a look (5b): see revise().

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
  const [requirements, profile, { notes }, photo, picks, excepted] = await Promise.all([
    lookRequirements(db, guestId, sessionId),
    loadProfile(db, guestId),
    loadNotes(db, sessionId),
    activePhoto(db, sessionId),
    db.from("wardrobe_items").select("id, name, category, details").eq("user_id", guestId).eq("styling", true).eq("draft", false).order("created_at").throwOnError(),
    sessionExceptions(db, sessionId),
  ]);
  // What the shopper asked for once allowed ("High heels", 5c fix 6) changes only the pieces it's about,
  // so it isn't a requirement every look is checked against again either.
  const allowed = profile.preferences.flatMap((p): RuledPreference[] =>
    p.id && p.kind !== "likes" && excepted.has(p.id) ? [{ id: p.id, kind: p.kind, words: p.words, rule: RuleSchema.safeParse(p.rule).data ?? JUDGED }] : [],
  );
  const wants = wantsFrom(notes, allowed);
  const wanted = new Set(wants.map((w) => w.noteId));
  // Feedback on a look (5a) revises that look (5b), so it isn't a requirement every look must meet, except
  // feedback for every look ("no high heels in any look", R48), which is.
  const confirmed = active(notes).filter(
    (n) => n.status === "confirmed" && n.kind !== "budget" && (n.kind !== "feedback" || feedbackOf(n)?.scope === "session") && !wanted.has(n.id),
  );
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
  // The looks builder is told what was asked, so new looks include it.
  const builderNotes = [...noteWords, ...wants.map((w) => w.words)];
  return { requirements, notes, noteWords, builderNotes, owned, anchor, inspiration, likes, preferredColors, judged, key, allowed, wants };
}

const JUDGED: Rule = { type: "judged" };

/** The wants, as "id:version", so a revision answering old ones is dropped (R52). */
const wantsKey = (wants: Want[]) => wants.map(wantKey).sort().join(",");

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

function shown(id: string, slot: number, look: { name: string; reason: string }, items: ResolvedItem[], r: Requirements, current: boolean, revision?: Revision): ShownLook {
  return {
    id,
    slot,
    name: look.name,
    reason: look.reason,
    change: revision?.summary ?? null,
    changed: revision?.changed ?? [],
    note: revision?.none ?? null,
    noteFor: revision?.none ? [...(revision.seen ?? []), ...(revision.wanted ?? [])].join(",") : null,
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
async function check(deps: LooksDeps, guestId: string, g: Gathered, items: ResolvedItem[], withReason = false, extraNotes: string[] = []): Promise<Checked> {
  const code = codeCheck({ items, requirements: g.requirements, anchor: g.anchor, wardrobePicks: g.owned.filter((o) => o.ref.kind === "wardrobe").map((o) => (o.ref as { itemId: string }).itemId) });
  if (!code.ok) return { verdict: "conflict", reasons: code.reasons, failedProducts: code.failedProducts };
  const money = await deps.guard.checkAi(guestId, "claude");
  if (!money.ok) return { verdict: "needs_clarification", reasons: [...code.reasons, { about: "Judgment", ok: false, why: "Today's AI allowance is used up" }], failedProducts: [] };
  const judged = await deps.judge.judge({ items, notes: [...g.noteWords, ...extraNotes], judged: g.judged, likes: g.likes, inspiration: g.inspiration, withReason });
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
  /** A look and its feedback (5b): what it was revised for, and the revision's summary or why none fitted. */
  revision?: Revision;
};
type Revision = {
  /** The look's change and dislike lines it has answered, as "id:version": a new or changed one revises it. */
  seen: string[];
  /** The change summary, on the look a revision made (R50). */
  summary?: string;
  /** The places of the pieces it changed, for their New chips. */
  changed?: number[];
  /** Why the last revision couldn't be made: the look stayed as it was. */
  none?: string;
  /** The wants it answers, as "id:version" (5c fix 6): a new one, or one taken back, changes it. */
  wanted?: string[];
};
type LookRow = { id: string; name: string | null; reason: string | null; items: LookItem[]; requirements_key: string | null; input_versions: Versions; status: string; created_at: string; revision_of: string | null };
const LOOK_COLUMNS = "id, name, reason, items, requirements_key, input_versions, status, created_at, revision_of";
type OnScreen = LookRow & { slot: number };

/** The looks on screen, one per place (published, or being checked again), in place order. */
async function onScreen(db: SupabaseClient, guestId: string, sessionId: string): Promise<OnScreen[]> {
  const { data } = await db
    .from("looks")
    .select(LOOK_COLUMNS)
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
const shownRow = (row: OnScreen, items: ResolvedItem[], g: Gathered): ShownLook => ({
  ...shown(row.id, row.slot, { name: row.name ?? "Look", reason: row.reason ?? "" }, items, g.requirements, row.status === "published" && row.requirements_key === g.key, row.input_versions.revision),
  // An earlier version in this place to compare with, and Undo feedback after a revision (5c, R51).
  earlier: Boolean(row.revision_of),
  canUndo: Boolean(row.revision_of && row.input_versions.revision?.summary),
});

async function sessionOpen(db: SupabaseClient, guestId: string, sessionId: string) {
  const { data } = await db.from("sessions").select("id").eq("id", sessionId).eq("user_id", guestId).in("status", ["active", "paused"]).maybeSingle().throwOnError();
  return Boolean(data);
}

export type BuildStage = "building" | "checking" | "updating" | "revising";
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
 * - Looks with feedback they haven't been revised for are revised (5b, revise()).
 * `emit` hears the stages, for "Putting looks together", "Checking your preferences" and "Updating", and
 * "revising" with the places of the looks being revised.
 * Null when the session isn't the guest's open one.
 */
export async function buildLooks(deps: LooksDeps, guestId: string, sessionId: string, emit: Emit = () => {}, options: BuildOptions = {}): Promise<BuildResult | null> {
  if (!(await sessionOpen(deps.db, guestId, sessionId))) return null;
  return inTurn(deps.db, sessionId, () => emit("building"), () => buildNow(deps, guestId, sessionId, emit, options));
}

export type Emit = (state: BuildStage, slots?: number[]) => void;

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

async function buildNow(deps: LooksDeps, guestId: string, sessionId: string, emit: Emit, options: BuildOptions): Promise<BuildResult> {
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
  const settled = !stale.length && (rows.length >= LOOKS_WANTED || (!options.force && (rows.length > 0 || session.looks_built_for === g.key)));
  // Feedback a look on screen hasn't been revised for (5b): a revision is due even with nothing else changed.
  // And what the shopper asked for once allowed, or took back, that a look hasn't been changed for (5c fix 6).
  const wantsDue = (r: OnScreen) => {
    const answered = r.input_versions.revision?.wanted ?? [];
    return g.wants.some((w) => !answered.includes(wantKey(w))) || droppedWants(g.notes, g.allowed, g.wants, answered).length > 0;
  };
  const revisable = rows.some((r) => isCurrent(r) && (pendingFeedback(lookFeedback(g.notes, r.slot), r.input_versions.revision?.seen ?? []).length > 0 || wantsDue(r)));
  const unchanged = settled && !revisable;
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
  const mustUse = g.owned.filter((o) => o.ref.kind === "photo").map((o) => o.ref);

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
    const swaps: { row: OnScreen; items: ResolvedItem[]; failed: number[] }[] = [];
    for (const c of rechecked) {
      if (c.verdict === "pass" && c.items) {
        const { data: ok } = await db.rpc("publish_look", { look: c.row.id, current_requirements: g.key }).throwOnError();
        if (ok) {
          kept.push({ slot: c.row.slot, items: c.items });
          continue;
        }
      }
      // A look that fails only on pieces a rule now rules out (Never: high heels again, once its exception
      // is removed) has just those pieces changed, like Change, rather than a whole new look (5c fix 6).
      const failed = c.items ? c.items.flatMap((it, i) => ("product" in it && c.failedProducts.includes(it.product.id) ? [i] : [])) : [];
      if (c.items && failed.length && failed.length === new Set(c.failedProducts).size) {
        swaps.push({ row: c.row, items: c.items, failed });
        continue;
      }
      // A look that fails is never shown (R55): its place is filled by a new one.
      await db.from("looks").update({ status: "held" }).eq("id", c.row.id).eq("status", "needs_check").eq("requirements_key", g.key).throwOnError();
      for (const id of c.failedProducts) excluded.add(id);
      if (c.items) avoid.push(`${c.items.map(nameOf).join(" + ")}: ${failedWhy(c)}`);
    }
    for (const { row, items, failed } of swaps) {
      const lines = lookFeedback(g.notes, row.slot);
      const plan: RevisionPlan = { ...revisionPlan(items, lines, [], (id) => products.get(id) ?? null), change: failed };
      // It answers the same feedback and wants as before, so those still due are done next (step 3).
      const before = row.input_versions.revision;
      const answers = { seen: before?.seen ?? [], wanted: (before?.wanted ?? []).filter((k) => g.wants.some((w) => wantKey(w) === k)) };
      const revised = await revise(deps, guestId, sessionId, g, row, items, lines, plan, answers, { catalog, products, mustUse, emit });
      if (revised.done === "stale") return { stale: true };
      if (revised.done === "published") {
        kept.push({ slot: row.slot, items: revised.items });
        continue;
      }
      await db.from("looks").update({ status: "held" }).eq("id", row.id).in("status", ["needs_check", "published"]).throwOnError();
      for (const i of failed) excluded.add(refId(items[i].ref));
      avoid.push(`${items.map(nameOf).join(" + ")}: breaks the shopper's preferences`);
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

  for (let round = 1; !settled && round <= ROUNDS && placed < empty.length; round++) {
    filtered = filterCandidates(
      catalog.filter((p) => !excluded.has(p.id)),
      g.requirements,
    );
    // Nothing new can be made from what still fits (only two dresses fit, and both are shown): stop
    // here, with the explanation, rather than build looks that can't be shown (looks speed plan).
    if (!filtered.kept.length || !canMakeAnother(filtered.kept, g.owned, mustUse, shownMains, g.requirements.budget)) break;
    // Ended meanwhile: no more building, and nothing saved after its data was deleted (5c fix 6: a build
    // went on for 30 seconds after Sabine ended, and saved 3 looks).
    if (!(await sessionOpen(db, guestId, sessionId))) throw new SessionEndedError();
    emit("building");
    const money = await deps.guard.checkAi(guestId, "claude");
    if (!money.ok) break;
    const built = await deps.builder.build({
      products: filtered.kept,
      owned: g.owned,
      mustUse,
      inspiration: g.inspiration,
      notes: g.builderNotes,
      budget: budgetText(g.requirements),
      preferredColors: g.preferredColors,
      likes: g.likes,
      judged: g.judged,
      avoid,
    });
    if (built.costUsd > 0) await deps.guard.recordAi(guestId, "claude", built.costUsd);
    // A build takes 20 to 30 seconds: the session may have ended meanwhile.
    if (!(await sessionOpen(db, guestId, sessionId))) throw new SessionEndedError();

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
        // Judged for several seconds: ended meanwhile, nothing is saved (review batch 1).
        if (!(await sessionOpen(db, guestId, sessionId))) throw new SessionEndedError();
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
        // Feedback already under this place was about the look that was there: it doesn't revise this one.
        const revision: Revision = { seen: seenOf(lookFeedback(g.notes, slot)) };
        await db.from("looks").update({ input_versions: { requirements: g.key, build, round, position: c.position, slot, revision } }).eq("id", c.id).throwOnError();
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

  // 3. Revise the looks that have feedback they haven't been revised for (5b), or what the shopper asked
  // for once allowed, or took back, that they haven't been changed for (5c fix 6).
  const due = (await onScreen(db, guestId, sessionId)).flatMap((row) => {
    if (!isCurrent(row)) return [];
    const lines = lookFeedback(g.notes, row.slot);
    const pending = pendingFeedback(lines, row.input_versions.revision?.seen ?? []);
    const answered = row.input_versions.revision?.wanted ?? [];
    const add = g.wants.filter((w) => !answered.includes(wantKey(w)));
    const drop = droppedWants(g.notes, g.allowed, g.wants, answered);
    const items = pending.length || add.length || drop.length ? resolve(row.items, products, g.owned) : null;
    return items ? [{ row, items, lines, plan: wantsPlan(revisionPlan(items, lines, pending, (id) => products.get(id) ?? null), items, add, drop, g.wants) }] : [];
  });
  const revising = ({ row, items, lines, plan }: (typeof due)[number]) =>
    revise(deps, guestId, sessionId, g, row, items, lines, plan, { seen: seenOf(lines), wanted: g.wants.map(wantKey) }, { catalog, products, mustUse, emit });
  // Changes to pieces, such as each look's shoes once heels are allowed, run side by side: one after
  // another took 42 seconds for three looks (the heels timing). A whole new look waits its turn, so two
  // new looks can't come out the same.
  const side = await Promise.all(due.filter((d) => !d.plan.whole).map(revising));
  if (side.some((r) => r.done === "stale")) return { stale: true };
  for (const d of due.filter((d) => d.plan.whole)) if ((await revising(d)).done === "stale") return { stale: true };
  const looks = await looksNow();
  return { looks, noMatch: explain(looks.length) };
}

/**
 * Revises one look from its feedback (5b; R48 to R50, R52, Sabine's answers to Q1 and Q2 in 5b). The
 * look stays on screen meanwhile ("revising"). Changing pieces works like Swap: code picks replacements
 * that keep the look within budget, never one turned down in this look, and only ones meeting the details
 * asked for where the catalog records them; up to 3 at a time are checked by the whole checker, which
 * is also told what the shopper asked of this look. A change to the whole look asks the looks builder for
 * a new one in its place, with the kept pieces. The first that passes takes the look's place through the
 * publishing gate, with its change summary (R50); if none does, the look stays, with a note saying so.
 * Newest wins (R52): if the requirements, this look's feedback or the wants changed meanwhile, nothing is
 * published and the page asks again. The caller makes the plan: from the look's feedback, what was asked
 * once allowed (5c fix 6), or the pieces a rule now rules out. `answers` is what the look will have
 * answered: its feedback lines and wants.
 */
async function revise(
  deps: LooksDeps,
  guestId: string,
  sessionId: string,
  g: Gathered,
  row: OnScreen,
  items: ResolvedItem[],
  lines: LookFeedback[],
  plan: RevisionPlan,
  answers: { seen: string[]; wanted: string[] },
  ctx: { catalog: Product[]; products: Map<string, Product>; mustUse: LookItem[]; emit: Emit },
): Promise<{ done: "published"; items: ResolvedItem[] } | { done: "kept" | "stale" }> {
  const { db } = deps;
  const { seen, wanted } = answers;
  // Answered without a new look: this feedback isn't revised again until it changes, unless the checks
  // couldn't run (`retry`), when the next request tries again (Sabine's answer to Q4 in 5c).
  const answered = (extra: Partial<Revision> = {}, retry = false) =>
    db
      .from("looks")
      .update({ input_versions: { ...row.input_versions, revision: { ...row.input_versions.revision, ...(retry ? {} : { seen, wanted }), none: undefined, ...extra } } })
      .eq("id", row.id)
      .throwOnError();
  const hold = (ids: string[]) => db.from("looks").update({ status: "held" }).in("id", ids).throwOnError();
  // Nothing to change: the feedback is about pieces no longer in this look, or it already has what was asked.
  if (!plan.whole && !plan.change.length) {
    await answered();
    return { done: "kept" };
  }
  ctx.emit("revising", [row.slot]);
  const fits = filterCandidates(
    ctx.catalog.filter((p) => !plan.turnedDown.has(p.id)),
    g.requirements,
  ).kept;
  const others = (await onScreen(db, guestId, sessionId))
    .filter((r) => r.id !== row.id)
    .flatMap((r) => {
      const its = resolve(r.items, ctx.products, g.owned);
      return its ? [{ slot: r.slot, main: mainPieces(its), names: its.map(nameOf).join(" + ") }] : [];
    });

  type Candidate = { refs: LookItem[]; items: ResolvedItem[]; name: string; reason: string | null };
  const batches: Candidate[][] = [];
  // How many replacements each changed piece had within the budget, for saying when the budget is the limit.
  let pooled: number[] = [];
  if (plan.whole) {
    const money = await deps.guard.checkAi(guestId, "claude");
    if (!money.ok) {
      await answered({ none: "This look couldn't be revised: today's AI allowance is used up." });
      return { done: "kept" };
    }
    const kept = row.items.filter((ref) => plan.keep.has(refId(ref)));
    const built = await deps.builder.build({
      products: fits,
      owned: g.owned,
      mustUse: [...ctx.mustUse, ...kept.filter((ref) => ref.kind !== "photo")],
      inspiration: g.inspiration,
      notes: [...g.builderNotes, ...plan.notes],
      budget: budgetText(g.requirements),
      preferredColors: g.preferredColors,
      likes: g.likes,
      judged: g.judged,
      avoid: [
        ...others.map((o) => `${o.names}: already shown, so make different looks`),
        `${items.map(nameOf).join(" + ")}: the look the shopper wants changed, so make different looks${kept.length ? " with the pieces marked must use" : ""}`,
      ],
    });
    if (built.costUsd > 0) await deps.guard.recordAi(guestId, "claude", built.costUsd);
    const keepsMain = items.some((i) => plan.keep.has(refId(i.ref)) && mainPieces([i]));
    batches.push(
      built.looks
        .flatMap((l: BuiltLook): Candidate[] => {
          const its = resolve(l.items, ctx.products, g.owned);
          if (!its) return [];
          const ids = new Set(its.map((i) => refId(i.ref)));
          const keepsAll = kept.every((ref) => ids.has(refId(ref)));
          const allowed = its.every((i) => !("product" in i) || (!plan.turnedDown.has(i.product.id) && meetsWishes(i.product, groupOf(i), plan.wishes)));
          // A new look, unless its main piece is one they asked to keep.
          const isNew = keepsMain || mainPieces(its) !== mainPieces(items);
          return keepsAll && allowed && isNew ? [{ refs: l.items, items: its, name: l.name, reason: l.reason }] : [];
        })
        .slice(0, 5),
    );
  } else {
    const pools = plan.change.map((i) => swapCandidates(fits, items, i, plan.turnedDown, g.requirements.budget).filter((p) => meetsWishes(p, productGroup(p.category), plan.wishes)));
    pooled = pools.map((p) => p.length);
    if (pools.every((pool) => pool.length)) {
      // The best replacement for each piece first, then the next best, and so on.
      const combos: Candidate[] = [];
      for (let k = 0; k < Math.min(Math.max(...pools.map((p) => p.length)), SWAP_BATCH * 3); k++) {
        const picks = pools.map((pool) => pool[Math.min(k, pool.length - 1)]);
        const refs = row.items.map((r, i): LookItem => (plan.change.includes(i) ? { kind: "product", productId: picks[plan.change.indexOf(i)].id } : r));
        const its = items.map((it, i): ResolvedItem => (plan.change.includes(i) ? { ref: refs[i], product: picks[plan.change.indexOf(i)] } : it));
        if (!combos.some((c) => JSON.stringify(c.refs) === JSON.stringify(refs))) combos.push({ refs, items: its, name: row.name ?? "Look", reason: null });
      }
      for (let b = 0; b < combos.length; b += SWAP_BATCH) batches.push(combos.slice(b, b + SWAP_BATCH));
    }
  }

  const before = feedbackKey(lines);
  const tried: { unchecked: boolean }[] = [];
  for (const batch of batches) {
    // Ended meanwhile: nothing more is checked or saved (5c fix 6).
    if (!(await sessionOpen(db, guestId, sessionId))) throw new SessionEndedError();
    const checked = await Promise.all(
      batch.map(async (c) => {
        const same = others.find((o) => o.main === mainPieces(c.items));
        const result: Checked = same
          ? { verdict: "conflict", reasons: [{ about: "Outfit", ok: false, why: `The same main pieces as Look ${same.slot}` }], failedProducts: [] }
          : await check(deps, guestId, g, c.items, true, plan.notes);
        if (!(await sessionOpen(db, guestId, sessionId))) throw new SessionEndedError();
        const total = totalOf(c.items, g.requirements);
        const changed = c.items.flatMap((it, i) => (items.some((o) => JSON.stringify(o.ref) === JSON.stringify(it.ref)) ? [] : [i]));
        const revision: Revision = { seen, wanted, summary: changeSummary(items, c.items, total, plan.asked), changed };
        const { data: inserted } = await db
          .from("looks")
          .insert({
            user_id: guestId,
            session_id: sessionId,
            items: c.refs,
            total_cents: total.totalCents,
            reason: result.reason ?? c.reason ?? row.reason,
            name: c.name,
            revision_of: row.id,
            requirements_key: g.key,
            input_versions: { slot: row.slot, revision },
            status: "checking",
          })
          .select("id")
          .single()
          .throwOnError();
        await db.rpc("record_check", { look: inserted!.id, verdict: result.verdict, reasons: result.reasons, requirements_key: g.key }).throwOnError();
        // A check that couldn't run (the judgment step failed or the day's AI is used up) isn't a "no".
        const unchecked = result.verdict === "needs_clarification" && result.reasons.some((r) => r.about === "Judgment" && !r.ok);
        return { id: inserted!.id as string, verdict: result.verdict, unchecked, items: c.items };
      }),
    );
    tried.push(...checked);
    const winner = checked.find((c) => c.verdict === "pass");
    const losers = checked.filter((c) => c !== winner).map((c) => c.id);
    if (losers.length) await hold(losers);
    // Newest wins (R52): a change to the requirements or to this look's feedback meanwhile means this
    // revision answered old information.
    const now = await gather(db, guestId, sessionId);
    if (now.key !== g.key || feedbackKey(lookFeedback(now.notes, row.slot)) !== before || wantsKey(now.wants) !== wantsKey(g.wants)) {
      if (winner) await hold([winner.id]);
      return { done: "stale" };
    }
    if (winner) {
      const { data: ok } = await db.rpc("publish_look", { look: winner.id, current_requirements: g.key, replaces: row.id }).throwOnError();
      if (ok) return { done: "published", items: winner.items };
      await hold([winner.id]);
      return { done: "stale" };
    }
  }
  if (tried.length && tried.every((t) => t.unchecked)) {
    await answered({ none: nothingFits(items, plan, { unchecked: true }) }, true);
    return { done: "kept" };
  }
  // The budget is the limit when every replacement within it was tried, and without it there would have
  // been more of the same kind (found in Sabine's 5b check: $83 left for shoes, and one pair under it).
  const budget = g.requirements.budget;
  const byBudget =
    !plan.whole &&
    budget !== null &&
    plan.change.some((i, n) => (pooled[n] ?? 0) < SWAP_BATCH * 3 && swapCandidates(fits, items, i, plan.turnedDown, null).filter((p) => meetsWishes(p, productGroup(p.category), plan.wishes)).length > (pooled[n] ?? 0));
  await answered({ none: nothingFits(items, plan, byBudget && budget ? { budget: budgetWords(budget) } : {}) });
  return { done: "kept" };
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

/** At most this many earlier versions of a look are shown in Compare (5c). */
const HISTORY = 10;

/** The earlier versions of a look in its place, newest first: the looks swaps, revisions and restores replaced (5c). */
async function earlierVersions(db: SupabaseClient, guestId: string, sessionId: string, row: LookRow): Promise<LookRow[]> {
  const out: LookRow[] = [];
  let next = row.revision_of;
  while (next && out.length < HISTORY) {
    const { data } = await db.from("looks").select(LOOK_COLUMNS).eq("id", next).eq("session_id", sessionId).eq("user_id", guestId).maybeSingle<LookRow>().throwOnError();
    if (!data) break;
    out.push(data);
    next = data.revision_of;
  }
  return out;
}

export type EarlierLook = ShownLook & { differences: string[] };

/**
 * Compare (GET /api/sessions/:id/looks/:lookId/history; R51, 5c): a look's earlier versions in its
 * place, newest first, each with how it differs. Null when the look isn't on the guest's screen.
 */
export async function lookHistory(deps: Pick<LooksDeps, "db" | "catalog">, guestId: string, sessionId: string, lookId: string): Promise<{ look: ShownLook; earlier: EarlierLook[] } | null> {
  const rows = await onScreen(deps.db, guestId, sessionId);
  const row = rows.find((r) => r.id === lookId);
  if (!row) return null;
  const versions = await earlierVersions(deps.db, guestId, sessionId, row);
  const [g, products] = await Promise.all([gather(deps.db, guestId, sessionId), productsOf(deps.catalog, [row, ...versions].flatMap((r) => r.items))]);
  const items = resolve(row.items, products, g.owned);
  if (!items) return null;
  const look = shownRow(row, items, g);
  const earlier = versions.flatMap((v) => {
    const its = resolve(v.items, products, g.owned);
    if (!its) return [];
    // Not current: an earlier version is checked again before it comes back.
    const was = shown(v.id, row.slot, { name: v.name ?? "Look", reason: v.reason ?? "" }, its, g.requirements, false);
    return [{ ...was, change: null, changed: [], note: null, differences: differences(look.items, was.items) }];
  });
  return { look, earlier };
}

export type RestoreResult =
  /** The earlier look, back in its place; for Undo feedback, the feedback lines to take back. */
  | { look: ShownLook; takeBack: string[] }
  /** It no longer fits, so the current look stays: why. */
  | { none: string }
  | { stale: true }
  | { limited: true };

/**
 * Undo feedback and Use this look (POST /api/sessions/:id/looks/:lookId/restore; R51, 5c). The earlier
 * look, the one before the last revision for Undo, is checked again by the whole checker on the current
 * requirements first (R51). If it passes, a copy of it takes the place through the publishing gate; if
 * not, nothing changes and the answer says why. Undo also names the feedback lines that revision
 * answered, to be taken back; the look that comes back has answered every line, so none revises it again.
 */
export async function restoreLook(
  deps: LooksDeps,
  guestId: string,
  sessionId: string,
  lookId: string,
  target: { undo: true } | { versionId: string },
  options: Pick<BuildOptions, "allowAi"> = {},
): Promise<RestoreResult | null> {
  if (!(await sessionOpen(deps.db, guestId, sessionId))) return null;
  return inTurn(deps.db, sessionId, () => {}, () => restoreNow(deps, guestId, sessionId, lookId, target, options));
}

async function restoreNow(deps: LooksDeps, guestId: string, sessionId: string, lookId: string, target: { undo: true } | { versionId: string }, options: Pick<BuildOptions, "allowAi">): Promise<RestoreResult | null> {
  const { db } = deps;
  const g = await gather(db, guestId, sessionId);
  const rows = await onScreen(db, guestId, sessionId);
  const row = rows.find((r) => r.id === lookId);
  if (!row) {
    const { data: known } = await db.from("looks").select("id").eq("id", lookId).eq("session_id", sessionId).eq("user_id", guestId).maybeSingle().throwOnError();
    return known ? { stale: true } : null;
  }
  if (row.status !== "published" || row.requirements_key !== g.key) return { stale: true };
  const undo = "undo" in target;
  if (undo && !row.input_versions.revision?.summary) return null;
  const versions = await earlierVersions(db, guestId, sessionId, row);
  const earlier = undo ? versions[0] : versions.find((v) => v.id === target.versionId);
  if (!earlier) return null;
  const products = await productsOf(deps.catalog, [...earlier.items, ...rows.flatMap((r) => r.items)]);
  const items = resolve(earlier.items, products, g.owned);
  if (!items) return { none: "That earlier look uses a piece that isn't here any more, so this one stays." };
  // A restore mustn't make two looks the same.
  const same = rows.find((r) => r.id !== row.id && mainPieces(resolve(r.items, products, g.owned) ?? []) === mainPieces(items));
  if (same) return { none: `That earlier look has the same main pieces as Look ${rows.indexOf(same) + 1}, so this one stays.` };
  if (options.allowAi && !(await options.allowAi())) return { limited: true };

  const lines = lookFeedback(g.notes, row.slot);
  // Undo takes back the lines the last revision answered for the first time.
  const before = new Set(earlier.input_versions.revision?.seen ?? []);
  const takeBack = undo ? [...new Set((row.input_versions.revision?.seen ?? []).filter((s) => !before.has(s)).map((s) => s.split(":")[0]))] : [];
  const result = await check(deps, guestId, g, items);
  if (!(await sessionOpen(db, guestId, sessionId))) throw new SessionEndedError();
  const total = totalOf(items, g.requirements);
  const { data: inserted } = await db
    .from("looks")
    .insert({
      user_id: guestId,
      session_id: sessionId,
      items: earlier.items,
      total_cents: total.totalCents,
      reason: earlier.reason,
      name: earlier.name,
      revision_of: row.id,
      requirements_key: g.key,
      // It has answered the feedback on this place and the wants, so none of it changes it again: the
      // shopper chose it as it is.
      input_versions: { slot: row.slot, revision: { seen: seenOf(lines), wanted: g.wants.map(wantKey) } },
      status: "checking",
    })
    .select("id")
    .single()
    .throwOnError();
  await db.rpc("record_check", { look: inserted!.id, verdict: result.verdict, reasons: result.reasons, requirements_key: g.key }).throwOnError();
  const hold = () => db.from("looks").update({ status: "held" }).eq("id", inserted!.id).throwOnError();
  if (result.verdict !== "pass") {
    await hold();
    return { none: `That earlier look no longer fits everything you've asked for (${failedWhy(result)}), so this one stays.` };
  }
  // Newest wins (R52): a change meanwhile means it was checked on old requirements.
  if ((await gather(db, guestId, sessionId)).key !== g.key) {
    await hold();
    return { stale: true };
  }
  const { data: ok } = await db.rpc("publish_look", { look: inserted!.id, current_requirements: g.key, replaces: row.id }).throwOnError();
  if (!ok) {
    await hold();
    return { stale: true };
  }
  const look = shown(inserted!.id, row.slot, { name: earlier.name ?? "Look", reason: earlier.reason ?? "" }, items, g.requirements, true);
  return { look: { ...look, earlier: true, canUndo: false }, takeBack };
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

/** What a swapped look keeps from the one it replaces: not a revision's summary, notes or New chips. */
const carried = (v: Versions): Versions => ({ ...v, revision: v.revision ? { seen: v.revision.seen } : undefined });

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
  // Pieces turned down in this look's feedback never come back to it (5b, R48).
  const turned = turnedDownIn(lookFeedback(g.notes, row.slot));
  // When a piece changes, what failed for the other pieces was checked against the old one: forgotten.
  const remember = (look: string, versions: Versions, othersStill: boolean) =>
    db
      .from("looks")
      .update({ input_versions: { ...versions, failed: { key: g.key, pieces: { ...(othersStill ? known : {}), [index]: [...failed] } } } })
      .eq("id", look)
      .throwOnError();
  let tried = new Set([...(row.input_versions.tried ?? []), ref.productId]);
  let pool = swapCandidates(filtered.kept, items, index, new Set([...tried, ...failed, ...turned]), g.requirements.budget);
  // Every one that passes has been shown here already: start again, leaving out the piece in the look now.
  if (!pool.length && tried.size > 1) {
    tried = new Set([ref.productId]);
    pool = swapCandidates(filtered.kept, items, index, new Set([...tried, ...failed, ...turned]), g.requirements.budget);
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
        if (!(await sessionOpen(db, guestId, sessionId))) throw new SessionEndedError();
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
            input_versions: { ...carried(row.input_versions), swap: { from: ref.productId, to: product.id }, tried: [...tried] },
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
      await remember(winner.id, { ...carried(row.input_versions), swap: { from: ref.productId, to: winner.product }, tried: [...tried] }, false);
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
