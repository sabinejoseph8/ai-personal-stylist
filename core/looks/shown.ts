import type { Group, LookItem } from "./look";
import type { LookTotal } from "./totals";

// A look as the browser gets it (4c), shared by the server (lib/looks-service.ts) and the look panels.

/** One item in a look, as its tile shows it (design 4.3). `id` is the product, photo or wardrobe item. */
export type ShownItem = {
  kind: LookItem["kind"];
  id: string;
  group: Group;
  name: string;
  category: string;
  owned: boolean;
  priceCents: number | null;
  imageUrl: string | null;
  imageAlt: string;
};

/** A look for its panel. */
export type ShownLook = {
  id: string;
  /** Its place on screen, 1 to 3: it keeps it through swaps and new checks. */
  slot: number;
  name: string;
  reason: string;
  items: ShownItem[];
  total: LookTotal;
  /** Checked against the current requirements; false means it needs a new check (R58). */
  current: boolean;
  /** A revised look's change summary (5b, R50): "Changed: … Kept: … New total: …". */
  change?: string | null;
  /** The places of the pieces a revision brought in, for their New chips. */
  changed?: number[];
  /** Why the last revision couldn't be made, so the look stayed: "No other shoes fit everything …". */
  note?: string | null;
  /** What that note answered (the look's feedback and wants), so a new attempt that fails the same way is told too (fix plan 9). */
  noteFor?: string | null;
  /** It has an earlier version in its place to compare with (5c, R51). */
  earlier?: boolean;
  /** It's a revision, so Undo feedback can bring back the look before it (5c, R51). */
  canUndo?: boolean;
};
