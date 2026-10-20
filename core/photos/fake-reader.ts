import type { PhotoItem } from "./item";
import type { PhotoReader } from "./reader";

// A fake photo reader for browser tests: it goes by the photo's shape instead of asking Claude, so tests
// are free and the same every time. Only used when PHOTO_READER=fake, never on the live site.
// - About twice as wide as tall: two items, so the shopper picks one (R29).
// - Much taller than wide: nothing recognized (R32).
// - Anything else: a navy wool blazer, its colors To confirm.
// It takes a second, like a real reading, so tests can see Analyzing.

const item = (name: string, type: string, colors: string, colorsSure: boolean): PhotoItem => ({
  name,
  details: {
    type: { value: type, status: "confirmed" },
    colors: { value: colors, status: colorsSure ? "confirmed" : "to_confirm" },
    pattern: { value: "solid", status: "confirmed" },
    style: { value: "classic", status: "to_confirm" },
  },
});

export function createFakePhotoReader(): PhotoReader {
  return {
    async read({ width, height }) {
      await new Promise((r) => setTimeout(r, 1000));
      const shape = width / height;
      if (shape >= 1.8) return { items: [item("Denim jacket", "jacket", "mid blue", true), item("White T-shirt", "t-shirt", "white", true)], costUsd: 0 };
      if (shape <= 0.5) return { items: [], costUsd: 0 };
      return { items: [item("Navy wool blazer", "blazer", "navy", false)], costUsd: 0 };
    },
  };
}
