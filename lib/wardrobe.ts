import { z } from "zod";

// What the page and the server agree on about the wardrobe (3d; R36, R37, design 4.2). Pure rules,
// tested in tests/wardrobe.test.ts.

export const CATEGORIES = ["tops", "bottoms", "dresses", "outerwear", "shoes", "bags", "accessories", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  tops: "Tops",
  bottoms: "Bottoms",
  dresses: "Dresses",
  outerwear: "Outerwear",
  shoes: "Shoes",
  bags: "Bags",
  accessories: "Accessories",
  other: "Other",
};

/** The wardrobe's filters (design 4.2): All, then the categories. "Other" items only show under All. */
export const FILTERS = ["all", "tops", "bottoms", "dresses", "outerwear", "shoes", "bags", "accessories"] as const;
export type Filter = (typeof FILTERS)[number];

const WORDS: [Category, string[]][] = [
  ["dresses", ["dress", "gown", "jumpsuit", "romper"]],
  ["outerwear", ["blazer", "jacket", "coat", "trench", "parka", "bomber", "suit", "gilet", "vest", "poncho"]],
  ["bottoms", ["trouser", "pant", "jean", "skirt", "short", "chino", "legging", "culotte"]],
  ["shoes", ["shoe", "heel", "boot", "sneaker", "trainer", "flat", "loafer", "sandal", "pump", "mule", "oxford", "brogue", "slipper", "espadrille"]],
  ["bags", ["bag", "tote", "clutch", "purse", "backpack", "satchel", "weekender", "duffel", "duffle"]],
  ["accessories", ["belt", "scarf", "hat", "tie", "jewel", "necklace", "earring", "bracelet", "ring", "watch", "sunglass", "cap", "glove", "beanie", "cufflink"]],
  ["tops", ["top", "shirt", "blouse", "tee", "tank", "cami", "knit", "sweater", "jumper", "cardigan", "turtleneck", "polo", "bodysuit", "hoodie", "sweatshirt"]],
];

/** The wardrobe category for the photo reader's type ("blazer" is Outerwear, "sneakers" Shoes). */
export function categoryOf(type: string): Category {
  const t = type.toLowerCase();
  // Checked in order, so "t-shirt dress" is a dress and "shirt jacket" outerwear.
  for (const [category, words] of WORDS) if (words.some((w) => t.includes(w))) return category;
  return "other";
}

export type WardrobeDetails = { type: string; colors: string; pattern: string; style: string };
/** A wardrobe item as the browser gets it: short-lived links, never where the files are kept. */
export type ShownWardrobeItem = {
  id: string;
  name: string;
  category: Category;
  details: WardrobeDetails;
  photoUrl: string | null;
  thumbnailUrl: string | null;
  /** Chosen with Style with these (R37). */
  styling: boolean;
};

const text = (max: number) => z.string().trim().max(max);

/** The longest each detail can be: the Wardrobe page's boxes stop at the same lengths. */
export const DETAIL_LENGTHS: Record<keyof WardrobeDetails, number> = { type: 40, colors: 60, pattern: 40, style: 60 };

/** What Edit can change (R37). A name is required; the rest are short words. */
export const WardrobeEdit = z.object({
  name: z.string().trim().min(1, "Give the item a name.").max(120),
  category: z.enum(CATEGORIES),
  details: z.object({
    type: text(DETAIL_LENGTHS.type),
    colors: text(DETAIL_LENGTHS.colors),
    pattern: text(DETAIL_LENGTHS.pattern),
    style: text(DETAIL_LENGTHS.style),
  }),
});
export type WardrobeEdit = z.infer<typeof WardrobeEdit>;

export const WARDROBE_MESSAGES = {
  empty: "Your wardrobe is empty. Add a photo of something you own.",
  notOwned: "Mark the item as yours before saving it to your wardrobe.",
  photo: "That photo has been removed.",
  saveFailed: "That didn't save. Check your connection and try again.",
  cleared: "Your session won't use wardrobe items now.",
} as const;
