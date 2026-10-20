import { readFileSync } from "node:fs";
import sharp from "sharp";

// The answer key for the photo and camera evals (3b, 3c): sample catalog photos, one of each kind plus
// the patterned ones, photos of two catalog items side by side, and the words that count as the same
// answer as the catalog's own details.

export type Product = { slug: string; category: string; name: string; colors: string[]; style_tags: string[]; attributes: { pattern?: string } };
export const catalog: Product[] = JSON.parse(readFileSync("catalog/products.json", "utf8"));

// One of each kind of item, then the patterned ones, up to 20.
export function pickSingles() {
  const sorted = [...catalog].sort((a, b) => a.slug.localeCompare(b.slug));
  const picked: Product[] = [];
  for (const p of sorted) if (!picked.some((x) => x.category === p.category)) picked.push(p);
  for (const p of sorted) if (picked.length < 20 && (p.attributes.pattern ?? "solid") !== "solid" && !picked.includes(p)) picked.push(p);
  return picked.slice(0, 20);
}
const bySlugStart = (category: string, skip = 0) => [...catalog].sort((a, b) => a.slug.localeCompare(b.slug)).filter((p) => p.category === category)[skip];
export const PAIRS: [Product, Product][] = [
  [bySlugStart("blazer"), bySlugStart("jeans")],
  [bySlugStart("dress", 1), bySlugStart("shoes", 2)],
  [bySlugStart("shirt"), bySlugStart("bag")],
  [bySlugStart("coat"), bySlugStart("trousers", 1)],
];

// Words that count as the same answer.
const TYPES: Record<string, string[]> = {
  shoes: ["shoe", "heel", "pump", "boot", "sneaker", "trainer", "flat", "loafer", "sandal", "mule", "oxford", "brogue", "derby", "slingback"],
  accessory: ["belt", "scarf", "hat", "tie", "jewel", "necklace", "earring", "bracelet", "watch", "sunglasses", "cufflink", "glove", "pocket square", "accessor", "beanie", "cap"],
  top: ["top", "blouse", "camisole", "cami", "tank", "shell", "bodysuit", "sweater"],
  trousers: ["trouser", "pant", "chino", "slack"],
  jacket: ["jacket", "bomber", "blazer"],
  blazer: ["blazer", "jacket"],
  shirt: ["shirt", "blouse"],
  suit: ["suit"],
  coat: ["coat", "trench", "parka"],
  jeans: ["jean", "denim"],
  knitwear: ["sweater", "jumper", "knit", "pullover", "turtleneck", "cardigan"],
  skirt: ["skirt"],
  "t-shirt": ["t-shirt", "tee", "tshirt"],
  shorts: ["short"],
  cardigan: ["cardigan", "sweater", "knit"],
  dress: ["dress", "gown"],
  bag: ["bag", "tote", "clutch", "purse", "crossbody", "satchel", "backpack"],
};
const COLOR_FAMILIES = [
  ["black", "jet", "onyx"],
  ["white", "ivory", "cream", "ecru", "off-white"],
  ["grey", "gray", "charcoal", "heather", "slate", "silver"],
  ["navy", "blue", "indigo", "cobalt", "denim"],
  ["green", "emerald", "olive", "sage", "forest", "khaki"],
  ["red", "burgundy", "wine", "maroon", "oxblood", "crimson"],
  ["pink", "blush", "rose", "nude"],
  ["brown", "camel", "tan", "cognac", "chocolate", "rust", "caramel", "chestnut"],
  ["beige", "sand", "stone", "oatmeal", "natural", "nude", "khaki", "taupe", "camel", "tan", "cream"],
  ["yellow", "sunflower", "mustard", "gold"],
  ["gold", "metallic"],
  ["silver", "metallic"],
  ["orange", "rust"],
];
const PATTERNS: Record<string, string[]> = {
  solid: ["solid", "plain", "none"],
  check: ["check", "plaid", "tartan", "gingham", "houndstooth"],
  striped: ["stripe", "pinstripe"],
  floral: ["floral", "flower"],
  "polka dot": ["dot", "spot"],
  "animal print": ["animal", "leopard", "zebra", "snake", "cheetah"],
  "cable knit": ["cable", "knit", "textured", "solid"],
  geometric: ["geometric", "graphic", "abstract", "print"],
  lace: ["lace", "floral"],
  sequin: ["sequin", "embellish", "sparkle", "solid"],
  quilted: ["quilt", "diamond", "solid"],
  textured: ["textur", "solid", "knit", "boucle", "tweed"],
  herringbone: ["herringbone", "tweed", "textur"],
};
const STYLE_FAMILIES = [
  ["elegant", "formal", "sophisticated", "polished", "refined", "dressy", "glamorous"],
  ["classic", "timeless", "tailored", "smart", "traditional", "polished"],
  ["relaxed", "casual", "laid-back", "easy"],
  ["minimal", "minimalist", "clean", "simple", "understated"],
  ["preppy", "classic", "smart"],
  ["bold", "statement", "striking"],
  ["romantic", "feminine", "soft"],
  ["edgy", "rock", "grunge", "punk", "street"],
  ["sporty", "athletic", "athleisure", "sport"],
  ["bohemian", "boho"],
];

const words = (s: string) => s.toLowerCase().split(/[^a-z-]+/).filter(Boolean);
const families = (list: string[][], text: string) => list.flatMap((f, i) => (words(text).some((w) => f.some((x) => w.startsWith(x))) ? [i] : []));
export const typeOk = (category: string, value: string) => (TYPES[category] ?? [category]).some((t) => value.toLowerCase().includes(t));
export const colorOk = (expected: string[], value: string) => {
  const want = new Set(expected.flatMap((c) => families(COLOR_FAMILIES, c)));
  return families(COLOR_FAMILIES, value).some((f) => want.has(f));
};
export const patternOk = (expected: string, value: string) => (PATTERNS[expected] ?? [expected]).some((p) => value.toLowerCase().includes(p));
export const styleOk = (expected: string[], value: string) => {
  const want = new Set(expected.flatMap((s) => families(STYLE_FAMILIES, s)));
  return families(STYLE_FAMILIES, value).some((f) => want.has(f));
};

export async function photoOf(slug: string) {
  return sharp(readFileSync(`public/catalog/${slug}.jpg`));
}

/** Two catalog photos side by side on white, like a shopper's photo of two items. */
export async function pairPhoto(a: Product, b: Product) {
  const [left, right] = await Promise.all([a, b].map(async (p) => (await photoOf(p.slug)).resize(700, 700, { fit: "inside" }).toBuffer()));
  return sharp({ create: { width: 1500, height: 760, channels: 3, background: "#ffffff" } })
    .composite([
      { input: left, left: 20, top: 30 },
      { input: right, left: 780, top: 30 },
    ])
    .jpeg()
    .toBuffer();
}
