import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogConnector, Product } from "@/connectors/catalog/types";
import { type BuiltLook, type LooksBuilder } from "@/core/looks/builder";
import { filterCandidates, type Requirements, ruleLabel } from "@/core/looks/candidates";
import { type Anchor, type CheckReason, codeCheck } from "@/core/looks/checker";
import type { Judge, Verdict } from "@/core/looks/judge";
import { type LookItem, mainPieces, nameOf, type OwnedPiece, ownedGroup, type ResolvedItem } from "@/core/looks/look";
import { explainNoMatch, type NoMatch } from "@/core/looks/no-match";
import { looksReadiness } from "@/core/looks/readiness";
import { type LookTotal, lookTotal } from "@/core/looks/totals";
import { active, type Note } from "@/core/notes/types";
import { chosenItem } from "@/core/photos/item";
import type { BudgetGuard } from "@/lib/budget-guard";
import { lookRequirements } from "@/lib/looks-inputs";
import { loadNotes } from "@/lib/notes-store";
import { activePhoto } from "@/lib/photos-service";
import { loadProfile } from "@/lib/profile-store";
import { categoryOf } from "@/lib/wardrobe";

// Building looks (4b; R39, R40, R54, R55, R59, tech spec 1.3): the candidate filter, the looks builder,
// the preference checker (rules in code, then the judgment step) and the one publishing gate. Up to 3
// rounds, until 3 looks pass; if fewer do, the ones that passed are shown with an explanation (Sabine's
// answer to Q2 in 4b). Looks and checks are the app's own record (decision A), written with the server
// key, and every decision is kept for Behind the scenes (4d).

export type LooksDeps = { db: SupabaseClient; catalog: CatalogConnector; guard: BudgetGuard; builder: LooksBuilder; judge: Judge };

/** A look as the browser gets it (4c draws the panels). */
export type ShownLook = {
  id: string;
  name: string;
  reason: string;
  items: { kind: LookItem["kind"]; name: string; category: string; owned: boolean; priceCents: number | null; imageUrl: string | null; imageAlt: string }[];
  total: LookTotal;
  /** Still built on the current requirements; false means it needs a new check (R58, 4c). */
  current: boolean;
};

export type BuildResult =
  | { needs: string }
  | { looks: ShownLook[]; noMatch: NoMatch | null }
  /** The requirements changed while the looks were being built (newest wins, R52): build again. */
  | { stale: true };

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
  const confirmed = active(notes).filter((n) => n.status === "confirmed" && n.kind !== "budget");
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

function shown(id: string, look: { name: string; reason: string }, items: ResolvedItem[], r: Requirements, current: boolean): ShownLook {
  return {
    id,
    name: look.name,
    reason: look.reason,
    // The owned pieces' own photos join in 4c.
    items: items.map((i) =>
      "product" in i
        ? { kind: "product", name: i.product.name, category: i.product.category, owned: false, priceCents: i.product.price.amountCents, imageUrl: i.product.image.url, imageAlt: i.product.image.alt }
        : { kind: i.ref.kind, name: i.owned.name, category: i.owned.group, owned: true, priceCents: null, imageUrl: null, imageAlt: i.owned.name },
    ),
    total: totalOf(items, r),
    current,
  };
}

/** Checks one candidate look: rules in code, then, only if they all hold, the judgment step. */
async function check(deps: LooksDeps, guestId: string, g: Gathered, items: ResolvedItem[]): Promise<{ verdict: Verdict; reasons: CheckReason[]; failedProducts: string[] }> {
  const code = codeCheck({ items, requirements: g.requirements, anchor: g.anchor, wardrobePicks: g.owned.filter((o) => o.ref.kind === "wardrobe").map((o) => (o.ref as { itemId: string }).itemId) });
  if (!code.ok) return { verdict: "conflict", reasons: code.reasons, failedProducts: code.failedProducts };
  const money = await deps.guard.checkAi(guestId, "claude");
  if (!money.ok) return { verdict: "needs_clarification", reasons: [...code.reasons, { about: "Judgment", ok: false, why: "Today's AI allowance is used up" }], failedProducts: [] };
  const judged = await deps.judge.judge({ items, notes: g.noteWords, judged: g.judged, likes: g.likes, inspiration: g.inspiration });
  if (judged.costUsd > 0) await deps.guard.recordAi(guestId, "claude", judged.costUsd);
  return { verdict: judged.verdict, reasons: [...code.reasons, ...judged.reasons], failedProducts: [] };
}

/**
 * Build looks for a session (POST /api/sessions/:id/looks). `emit` hears the stages, for 4c's
 * "Putting looks together" and "Checking your preferences". Null when the session isn't the guest's open one.
 */
export async function buildLooks(deps: LooksDeps, guestId: string, sessionId: string, emit: (state: "building" | "checking") => void = () => {}): Promise<BuildResult | null> {
  const { db } = deps;
  const { data: session } = await db.from("sessions").select("id").eq("id", sessionId).eq("user_id", guestId).in("status", ["active", "paused"]).maybeSingle().throwOnError();
  if (!session) return null;
  const g = await gather(db, guestId, sessionId);
  const ready = looksReadiness(g.notes);
  if (!ready.ready) return { needs: ready.needs };

  const department = g.requirements.departments.length === 1 ? g.requirements.departments[0] : undefined;
  const catalog = await deps.catalog.search({ department, limit: 1000 });
  const products = new Map(catalog.map((p) => [p.id, p]));
  const build = randomUUID();
  const published: ShownLook[] = [];
  // The main pieces of each published look: no two looks share them (Sabine's review of the sample looks).
  const shownMains = new Set<string>();
  const excluded = new Set<string>();
  const avoid: string[] = [];
  let filtered = filterCandidates(catalog, g.requirements);

  for (let round = 1; round <= ROUNDS && published.length < LOOKS_WANTED; round++) {
    emit("building");
    filtered = filterCandidates(catalog.filter((p) => !excluded.has(p.id)), g.requirements);
    if (!filtered.kept.length) break;
    const money = await deps.guard.checkAi(guestId, "claude");
    if (!money.ok) break;
    const built = await deps.builder.build({
      products: filtered.kept,
      owned: g.owned,
      mustUse: g.owned.filter((o) => o.ref.kind === "photo").map((o) => o.ref),
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
        const result = items
          ? await check(deps, guestId, g, items)
          : { verdict: "conflict" as const, reasons: [{ about: "Items", ok: false, why: "Uses an item that isn't on the list" }], failedProducts: [] };
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
        return { id: row!.id as string, look, items, ...result };
      }),
    );

    // Newest wins (R52): if anything the looks must meet changed meanwhile, none of these is published.
    const now = await gather(db, guestId, sessionId);
    if (now.key !== g.key) {
      await db.from("looks").update({ status: "held" }).eq("session_id", sessionId).filter("input_versions->>build", "eq", build).neq("status", "published").throwOnError();
      return { stale: true };
    }
    for (const c of checked) {
      const main = c.items ? mainPieces(c.items) : "";
      if (c.verdict === "pass" && c.items && published.length < LOOKS_WANTED && !shownMains.has(main)) {
        // The one publishing gate: the database checks the pass was for these exact items and requirements.
        const { data: ok } = await db.rpc("publish_look", { look: c.id, current_requirements: g.key }).throwOnError();
        if (ok) {
          published.push(shown(c.id, c.look, c.items, g.requirements, true));
          shownMains.add(main);
          continue;
        }
      }
      if (c.verdict === "pass" && c.items && shownMains.has(main)) avoid.push(`${c.items.map(nameOf).join(" + ")}: the same main pieces as a look already chosen`);
      await db.from("looks").update({ status: "held" }).eq("id", c.id).throwOnError();
      for (const id of c.failedProducts) excluded.add(id);
      if (c.verdict !== "pass" && c.items) avoid.push(`${c.items.map(nameOf).join(" + ")}: ${c.reasons.filter((r) => !r.ok).map((r) => r.why).join("; ")}`);
    }
  }
  const noMatch = published.length < LOOKS_WANTED ? explainNoMatch(g.requirements, filtered.kept, filtered.leftOut, published.length) : null;
  return { looks: published, noMatch };
}

/** The session's published looks from its latest build, each marked whether it's still current (4c). */
export async function currentLooks(deps: Pick<LooksDeps, "db" | "catalog">, guestId: string, sessionId: string): Promise<ShownLook[]> {
  const { data } = await deps.db
    .from("looks")
    .select("id, name, reason, items, requirements_key, input_versions, created_at")
    .eq("session_id", sessionId)
    .eq("user_id", guestId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .throwOnError();
  const rows = data ?? [];
  if (!rows.length) return [];
  type Versions = { build?: string; round?: number; position?: number };
  const latest = (rows[0].input_versions as Versions).build;
  const g = await gather(deps.db, guestId, sessionId);
  // In the order they were published: by round, then the builder's order.
  const order = (r: (typeof rows)[number]) => ((r.input_versions as Versions).round ?? 0) * 10 + ((r.input_versions as Versions).position ?? 0);
  const mine = rows.filter((r) => (r.input_versions as Versions).build === latest).sort((a, b) => order(a) - order(b));
  const ids = [...new Set(mine.flatMap((r) => (r.items as LookItem[]).flatMap((i) => (i.kind === "product" ? [i.productId] : []))))];
  const products = new Map((await Promise.all(ids.map((id) => deps.catalog.getProduct(id)))).flatMap((p) => (p ? [[p.id, p] as const] : [])));
  return mine.flatMap((r) => {
    const items = resolve(r.items as LookItem[], products, g.owned);
    return items ? [shown(r.id, { name: r.name ?? "Look", reason: r.reason ?? "" }, items, g.requirements, r.requirements_key === g.key)] : [];
  });
}
