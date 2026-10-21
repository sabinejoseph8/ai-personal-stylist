import type { Product } from "../../connectors/catalog/types";
import type { Ask } from "../ask";
import { dollars } from "./budget";
import { type Group, groupOf, type LookItem, type OwnedPiece, productGroup } from "./look";

// The looks builder (4b; R40, tech spec 1.3 step 3 and 4.4): Claude Opus 5.5 at medium effort composes
// up to 5 candidate looks from the candidate filter's short list, by product number only, so it can't
// invent a product. Each look gets a short name and a one-line reason. Nothing it says is trusted: every
// look goes through the preference checker before it can be published. Claude is passed in as `ask`.

export type BuildInput = {
  /** The candidate filter's kept products. */
  products: Product[];
  /** The shopper's own pieces: the item to style around (when it's theirs) and wardrobe items chosen to style with. */
  owned: OwnedPiece[];
  /** In every look: the item to style around, when it's the shopper's, and pieces kept in a revision (5b). */
  mustUse: LookItem[];
  /** An inspiration photo's item, to be matched by similar sample products. */
  inspiration: string | null;
  /** The confirmed notes, in the stylist's words, such as "Outdoor wedding, November". */
  notes: string[];
  /** The budget for the whole look, in words, or null. */
  budget: string | null;
  /** Colors from confirmed notes ("prefer=emerald green"), for the main pieces. */
  preferredColors: string[];
  /** Likes, and firm preferences only judgment can check ("Never: anything too flashy"). */
  likes: string[];
  judged: string[];
  /** Looks from earlier rounds that didn't pass, and why, so the builder doesn't repeat them. */
  avoid: string[];
};

export type BuiltLook = { name: string; reason: string; items: LookItem[] };

export const BUILDER_SYSTEM = `You're a personal stylist putting together complete outfits for a shopper, from a short list of sample products and anything they own.

Make up to 5 different looks. Each look is a complete outfit:
- shoes, and either a dress, a suit, or a top (or jacket) with trousers, jeans, a skirt or shorts
- add a bag, an outer layer or one accessory when it helps the occasion
- never two dresses, two bottoms, two pairs of shoes or two bags

Use only the listed numbers. Items starting with "o" belong to the shopper and cost nothing. Any item marked "must use" goes in every look. Keep each look's sample items within the budget. Follow the shopper's notes and preferences: dress for the occasion, season and setting, and avoid what they said to avoid. Make the 5 looks clearly different from each other: each one has a different dress or suit, or a different top and bottom. Changing only the shoes, bag or jewelry doesn't make a different look.

Occasion and style: a strict stylist checks every piece on its own, not only the look as a whole, against the occasion and the shopper's style notes. Each product shows its formality, from 1 (casual) to 5 (black tie): for a wedding, an interview or another dressy occasion, leave out casual pieces (formality 1 or 2), such as a casual knit, a turtleneck or a shirt dress, even next to dressier ones. Match the season and setting too: no linen or summery pieces for a cold month outdoors.

Colors: when the shopper has preferred colors or liked colors, the main piece (the dress or suit), or at least one of the top and bottom, is in one of them. A navy, black or white main piece with the preferred color only in the shoes or bag doesn't count. Earth tones include burgundy; navy isn't one. Other colors are for accents. The colors in a look must go well together, and the shoes and bag must go with the outfit's colors, as a stylist would choose them. Black goes with many outfits, but not every one: black flats with a navy blazer, a burgundy top and a camel skirt don't go together, and tan or a neutral would suit those colors better.

For each look:
- n: a short name for it, 2 to 4 words, such as "Garden ceremony"
- r: one sentence on why it works for this shopper, in a stylist's voice
- i: the item numbers`;

export const BUILDER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    l: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { n: { type: "string" }, r: { type: "string" }, i: { type: "array", items: { type: "string" } } },
        required: ["n", "r", "i"],
      },
    },
  },
  required: ["l"],
};

/** One product as the builder reads it: "p12: Emerald satin midi dress (dress; emerald green; satin, solid; formality 4; $189)". */
function productLine(id: string, p: Product) {
  const d = p.details;
  const extra = [d.heelCm !== undefined ? `heel ${d.heelCm} cm` : "", d.sleeve ? `${d.sleeve.replace(/_/g, " ")} sleeves` : "", d.coverage ? d.coverage.replace(/_/g, " ") : ""].filter(Boolean);
  return `${id}: ${p.name} (${p.category}; ${p.colors.join(", ")}; ${d.material}, ${d.pattern}; formality ${d.formality}${extra.length ? `; ${extra.join(", ")}` : ""}; ${p.styleTags.join("/")}; ${dollars(p.price.amountCents)})`;
}

/** The builder's prompt, and the numbers it may use. */
export function builderPrompt(input: BuildInput): { user: string; ids: Map<string, LookItem> } {
  const ids = new Map<string, LookItem>();
  const lines = input.products.map((p, n) => {
    ids.set(`p${n + 1}`, { kind: "product", productId: p.id });
    // A piece the shopper asked to keep, when a look is revised (5b).
    const must = input.mustUse.some((m) => m.kind === "product" && m.productId === p.id);
    return `${productLine(`p${n + 1}`, p)}${must ? " (must use)" : ""}`;
  });
  const owned = input.owned.map((o, n) => {
    ids.set(`o${n + 1}`, o.ref);
    const must = input.mustUse.some((m) => JSON.stringify(m) === JSON.stringify(o.ref));
    return `o${n + 1}: ${o.name} (${o.words})${must ? " (must use)" : ""}`;
  });
  const user = [
    `The shopper's notes: ${input.notes.length ? input.notes.join("; ") : "none yet"}.`,
    input.budget ? `Budget for each look's sample items: ${input.budget}.` : "No budget given.",
    input.preferredColors.length ? `Preferred colors, for the main pieces: ${input.preferredColors.join(", ")}.` : "",
    input.likes.length ? `They like: ${input.likes.join("; ")}. Liked colors also count for the main pieces.` : "",
    input.judged.length ? `Firm preferences: ${input.judged.join("; ")}.` : "",
    input.inspiration ? `Their inspiration photo shows: ${input.inspiration}. Include a sample item similar to it in every look.` : "",
    owned.length ? `What they own:\n${owned.join("\n")}` : "",
    `Sample products:\n${lines.join("\n")}`,
    input.avoid.length
      ? `These looks are already shown, or didn't pass the preference check. Every new look needs a different dress or suit, or a different top and bottom, from the ones already shown, and leaves out any piece a reason names:\n${input.avoid.join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return { user, ids };
}

type Raw = { l: { n: string; r: string; i: string[] }[] };

/** Claude's looks with their numbers turned back into items. A look with a number that wasn't listed is dropped. */
export function looksFrom(raw: Raw, ids: Map<string, LookItem>): BuiltLook[] {
  return raw.l.slice(0, 5).flatMap((l) => {
    const items = l.i.map((id) => ids.get(id.trim().toLowerCase()));
    if (!items.length || items.some((i) => !i)) return [];
    return [{ name: l.n.trim().slice(0, 60) || "Look", reason: l.r.trim().slice(0, 300), items: items as LookItem[] }];
  });
}

export interface LooksBuilder {
  /** Up to 5 candidate looks, with the reading's cost (counted even when it fails). */
  build(input: BuildInput): Promise<{ looks: BuiltLook[]; costUsd: number }>;
}

export function createLooksBuilder(ask: Ask): LooksBuilder {
  return {
    async build(input) {
      const { user, ids } = builderPrompt(input);
      const { data, costUsd } = await ask({ system: BUILDER_SYSTEM, user, schema: BUILDER_SCHEMA, maxTokens: 8000 });
      return { looks: data ? looksFrom(data as Raw, ids) : [], costUsd };
    },
  };
}

/**
 * A fake looks builder for browser tests and the service's tests: plain combinations of the cheapest
 * products (a dress or a top with a bottom, shoes and a bag), the shopper's own item in each. Only used
 * when LOOKS_BUILDER=fake, never on the live site.
 */
export function createFakeLooksBuilder(): LooksBuilder {
  return {
    async build(input) {
      const by = (g: Group) => input.products.filter((p) => productGroup(p.category) === g);
      const ownedGroups = input.owned.filter((o) => input.mustUse.some((m) => JSON.stringify(m) === JSON.stringify(o.ref))).map((o) => groupOf({ ref: o.ref, owned: o }));
      const [dresses, tops, bottoms, shoes, bags] = [by("dress"), by("top"), by("bottom"), by("shoes"), by("bag")];
      const looks: BuiltLook[] = [];
      // Each look named in `avoid` moves the picks along, so a later round tries other products.
      for (let n = 0; n < 5; n++) {
        const pick = (list: Product[]) => list[(n + input.avoid.length) % Math.max(list.length, 1)];
        const main = dresses.length && !ownedGroups.includes("top") && !ownedGroups.includes("outer") ? [pick(dresses)] : [pick(tops), pick(bottoms)];
        const parts = [...main, pick(shoes), bags[0]].filter((p): p is Product => Boolean(p));
        looks.push({ name: `Test look ${n + 1}`, reason: "A fake look for tests.", items: [...input.mustUse, ...parts.map((p): LookItem => ({ kind: "product", productId: p.id }))] });
      }
      return { looks, costUsd: 0 };
    },
  };
}
