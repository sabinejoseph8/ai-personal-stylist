import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// design.md section 6: every text color pair meets 4.5 to 1, control edges and focus meet 3 to 1.
// Read straight from the tokens in app/globals.css, so a changed color can't slip through.
const css = readFileSync("app/globals.css", "utf8");
const color = (name: string) => {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`no token --color-${name}`);
  return m[1];
};

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(color(a)), luminance(color(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("color contrast", () => {
  it.each([
    ["ink", "page"],
    ["ink", "showroom"],
    ["graphite", "page"],
    ["graphite", "showroom"],
    ["graphite", "highlighter"],
    ["emerald", "page"],
    ["white", "emerald"],
    ["ink", "highlighter"],
    ["red-pen", "page"],
    ["red-pen", "red-wash"],
    ["ink", "emerald-wash"],
    ["emerald", "emerald-wash"],
    ["ink", "red-wash"],
    ["white", "red-pen"],
    ["white", "ink"],
  ])("%s text on %s meets 4.5 to 1", (text, background) => {
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["control-edge", "page"],
    ["control-edge", "showroom"],
    ["focus", "page"],
    ["focus", "showroom"],
  ])("%s on %s meets 3 to 1", (edge, background) => {
    expect(contrast(edge, background)).toBeGreaterThanOrEqual(3);
  });
});
