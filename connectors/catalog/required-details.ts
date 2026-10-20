// The details every product must have, so the preference check never has to guess: a missing
// detail counts as a fail (R38, risk 6). Used by the contract tests and the catalog check script,
// so this file imports nothing (Node runs it directly from catalog/scripts/check-catalog.mjs).

type Detail = "sleeve" | "neckline" | "coverage" | "heelCm" | "toe";

const GARMENT: Detail[] = ["sleeve", "neckline", "coverage"];
const BOTTOMS: Detail[] = ["coverage"];

export const DETAILS_BY_CATEGORY: Record<string, Detail[]> = {
  dress: GARMENT,
  top: GARMENT,
  shirt: GARMENT,
  "t-shirt": GARMENT,
  knitwear: GARMENT,
  cardigan: GARMENT,
  blazer: GARMENT,
  suit: GARMENT,
  jacket: GARMENT,
  coat: GARMENT,
  trousers: BOTTOMS,
  jeans: BOTTOMS,
  skirt: BOTTOMS,
  shorts: BOTTOMS,
  shoes: ["heelCm", "toe"],
  bag: [],
  accessory: [],
};

type Checkable = {
  category: string;
  name: string;
  colors: string[];
  styleTags: string[];
  price: { amountCents: number; currency: string };
  variants: { size: string }[];
  details: Record<string, unknown>;
  image: { url: string; alt: string; rights: string };
};

const filled = (v: unknown) => v !== undefined && v !== null && v !== "";

/** Names what a product is missing. An empty list means it's complete. */
export function missingDetails(p: Checkable): string[] {
  const missing: string[] = [];
  if (!p.name) missing.push("name");
  if (!Number.isInteger(p.price.amountCents) || p.price.amountCents <= 0) missing.push("price");
  if (!/^[A-Z]{3}$/.test(p.price.currency)) missing.push("currency");
  if (!p.colors.length) missing.push("colors");
  if (!p.styleTags.length) missing.push("style tags");
  if (!p.variants.length) missing.push("sizes");
  if (!p.image.url || !p.image.alt || !p.image.rights) missing.push("photo");
  const { formality, heelCm } = p.details;
  if (!(Number.isInteger(formality) && (formality as number) >= 1 && (formality as number) <= 5)) missing.push("formality");
  for (const name of ["material", "pattern"]) if (!filled(p.details[name])) missing.push(name);
  const needed = DETAILS_BY_CATEGORY[p.category];
  if (!needed) return [...missing, `a known category (not "${p.category}")`];
  for (const name of needed) {
    const ok = name === "heelCm" ? typeof heelCm === "number" && heelCm >= 0 : filled(p.details[name]);
    if (!ok) missing.push(name);
  }
  return missing;
}
