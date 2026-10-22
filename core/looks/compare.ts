import type { Group } from "./look";
import type { ShownItem } from "./shown";

// Compare (5c, R51, design 4.3): what's different about an earlier version of a look, in a few words
// ("Different shoes", "With a jacket"), so the shopper sees it at a glance. Plain code, tested in
// tests/compare.test.ts.

const WORDS: Record<Group, string> = {
  dress: "dress",
  suit: "suit",
  top: "top",
  outer: "jacket",
  bottom: "trousers or skirt",
  shoes: "shoes",
  bag: "bag",
  accessory: "accessory",
  other: "piece",
};

/** How an earlier look differs from the current one, piece by piece, in the order a look lists them. */
export function differences(current: ShownItem[], earlier: ShownItem[]): string[] {
  const groups = [...new Set([...earlier, ...current].map((i) => i.group))];
  const of = (items: ShownItem[], g: Group) =>
    items
      .filter((i) => i.group === g)
      .map((i) => i.id)
      .sort()
      .join(",");
  const out: string[] = [];
  for (const g of groups) {
    const [now, then] = [of(current, g), of(earlier, g)];
    if (now === then) continue;
    const article = g === "shoes" || g === "bottom" ? "" : g === "accessory" ? "an " : "a ";
    if (!now) out.push(`With ${article}${WORDS[g]}`);
    else if (!then) out.push(`Without the ${WORDS[g]}`);
    else out.push(`Different ${WORDS[g]}`);
  }
  return out.length ? out : ["The same pieces"];
}
