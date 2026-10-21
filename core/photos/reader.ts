import type { Ask } from "../ask";
import { DETAIL_NAMES, type DetailName, type PhotoItem } from "./item";

// The photo reader (R28, R29, tech spec 4.4): Claude Opus 5.5 at low effort looks at the shopper's
// photo and lists the clothing items in it, each with its type, main colors, pattern and style, and how
// sure it is of each. Details it's sure of are in ink; the rest are To confirm (R28). Claude is passed in
// as `ask`, so the core imports no outside service.

export const PHOTO_SYSTEM = `You are a personal stylist looking at a photo a shopper added, of something they'd like to style an outfit around.

List the clothing items, shoes, bags and accessories clearly shown, at most 4, the most prominent first. For each one:
- n: its name as a stylist would write it, a few words: "Navy wool blazer", "White leather sneakers".
- t: its type in one or two plain words: blazer, dress, jeans, trousers, skirt, shirt, t-shirt, top, knitwear, cardigan, jacket, coat, suit, shorts, heels, boots, sneakers, flats, loafers, sandals, bag, belt, scarf, hat, tie, jewelry.
- c: its main colors, at most 3, in plain words: "navy", "emerald green", "cream".
- p: its pattern: solid, striped, check, floral, polka dot, animal print, geometric, graphic, or another short word.
- s: its style in 1 to 3 words from: classic, elegant, relaxed, minimal, preppy, bold, romantic, edgy, sporty, bohemian.

For each of t, c, p and s, give v (the value) and k (how sure you are): "h" when it's clearly visible, "m" when it's likely, "l" when it's a guess.

Rules:
- Only items that are clearly shown. Ignore people's faces and bodies, the background, and anything that isn't clothing, shoes, bags or accessories.
- Never name a brand or claim it's a specific product.
- If no item is clearly shown, return an empty list.`;

const sure = { type: "object", additionalProperties: false, properties: { v: { type: "string" }, k: { type: "string", enum: ["h", "m", "l"] } }, required: ["v", "k"] };

export const PHOTO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { n: { type: "string" }, t: sure, c: sure, p: sure, s: sure },
        required: ["n", "t", "c", "p", "s"],
      },
    },
  },
  required: ["items"],
};

/** At most 4 items, as the prompt asks (R29 lists them to choose from). */
export const MAX_ITEMS = 4;

export type PhotoInput = { jpegBase64: string; width: number; height: number };
/** `items` is null when the reading failed (R32). The cost counts either way: a cut-off answer is still paid for. */
export type PhotoRead = { items: PhotoItem[] | null; costUsd: number };

export interface PhotoReader {
  read(input: PhotoInput): Promise<PhotoRead>;
}

type Raw = { items: { n: string; t: { v: string; k: string }; c: { v: string; k: string }; p: { v: string; k: string }; s: { v: string; k: string } }[] };
const KEYS: Record<DetailName, "t" | "c" | "p" | "s"> = { type: "t", colors: "c", pattern: "p", style: "s" };

/** Claude's answer as items: a detail it's sure of is confirmed, anything else to confirm (R28). */
export function itemsFrom(raw: Raw): PhotoItem[] {
  return raw.items
    .filter((it) => it.n?.trim() && it.t?.v?.trim())
    .slice(0, MAX_ITEMS)
    .map((it) => ({
      name: it.n.trim().slice(0, 60),
      details: Object.fromEntries(
        DETAIL_NAMES.map((name) => {
          const d = it[KEYS[name]];
          return [name, { value: (d?.v ?? "").trim().slice(0, 40), status: d?.k === "h" ? "confirmed" : "to_confirm" }];
        }),
      ) as PhotoItem["details"],
    }));
}

export function createPhotoReader(ask: Ask): PhotoReader {
  return {
    async read({ jpegBase64 }) {
      const { data, costUsd } = await ask({
        system: PHOTO_SYSTEM,
        user: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpegBase64 } },
          { type: "text", text: "What items are in this photo?" },
        ],
        schema: PHOTO_SCHEMA,
        maxTokens: 2000,
      });
      return { items: data ? itemsFrom(data as Raw) : null, costUsd };
    },
  };
}
