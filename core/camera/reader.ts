import type { Ask } from "../ask";

// The camera reader (R34, tech spec 4.4): Claude Haiku 5.5 at low effort looks at one small frame from
// the shopper's camera and says whether one item is clearly being shown, and if so what it is. The
// frame is read and thrown away. Claude is passed in as `ask`, so the core imports no outside service.

export const CAMERA_SYSTEM = `You look at one frame from a shopper's camera while they hold something up to show their stylist.

Say what's being shown:
- s: "one" when one clothing item, shoe, bag or accessory is clearly the one being shown; "several" when two or more are equally prominent, so you can't tell which is meant; "none" when no item is clearly shown.
- n: the item's name as a stylist would write it, a few words with its color and type: "Navy wool blazer". Empty unless s is "one".
- t: its type in one or two plain words: blazer, dress, jeans, trousers, skirt, shirt, t-shirt, top, knitwear, cardigan, jacket, coat, suit, shorts, heels, boots, sneakers, flats, loafers, sandals, bag, belt, scarf, hat, tie, jewelry. Empty unless s is "one".
- c: its main color in plain words. Empty unless s is "one".
- k: "h" when you're sure of the name, "m" when it's likely, "l" when it's a guess.

Ignore people's faces and bodies, and the background. Never name a brand.`;

export const CAMERA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    s: { type: "string", enum: ["one", "several", "none"] },
    n: { type: "string" },
    t: { type: "string" },
    c: { type: "string" },
    k: { type: "string", enum: ["h", "m", "l"] },
  },
  required: ["s", "n", "t", "c", "k"],
};

/** What one frame shows. `sure` is false when the reader isn't sure of the name. */
export type Sighting = { kind: "item"; name: string; type: string; color: string; sure: boolean } | { kind: "several" } | { kind: "none" };

/** `sighting` is null when the reading failed. The cost counts either way. */
export type CameraRead = { sighting: Sighting | null; costUsd: number };

export interface CameraReader {
  read(jpegBase64: string): Promise<CameraRead>;
}

type Raw = { s: "one" | "several" | "none"; n: string; t: string; c: string; k: "h" | "m" | "l" };

export function sightingFrom(raw: Raw): Sighting {
  if (raw.s === "several") return { kind: "several" };
  const name = raw.n?.trim().slice(0, 60) ?? "";
  const type = raw.t?.trim().toLowerCase().slice(0, 30) ?? "";
  if (raw.s !== "one" || !name || !type) return { kind: "none" };
  return { kind: "item", name, type, color: raw.c?.trim().toLowerCase().slice(0, 30) ?? "", sure: raw.k === "h" };
}

export function createCameraReader(ask: Ask): CameraReader {
  return {
    async read(jpegBase64) {
      const { data, costUsd } = await ask({
        system: CAMERA_SYSTEM,
        user: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpegBase64 } },
          { type: "text", text: "What is being shown?" },
        ],
        schema: CAMERA_SCHEMA,
        maxTokens: 1000,
      });
      return { sighting: data ? sightingFrom(data as Raw) : null, costUsd };
    },
  };
}

/** A fake camera reader for browser tests: every frame shows a navy wool blazer it isn't sure of. Never on the live site. */
export function createFakeCameraReader(): CameraReader {
  return { read: async () => ({ sighting: { kind: "item", name: "Navy wool blazer", type: "blazer", color: "navy", sure: false }, costUsd: 0 }) };
}
