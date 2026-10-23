import type { Product } from "../../connectors/catalog/types";
import { active, type Note } from "../notes/types";
import { type FirmPreference, wantedNote } from "./exceptions";
import { type Group, groupOf, type ResolvedItem } from "./look";
import type { RevisionPlan } from "./revise";
import { type Rule, ruledOut } from "./rules";

// What the shopper asked for once they allowed it (5c fix 6, Sabine's answer to Q1): "High heels", jotted
// after allowing Never: high heels. It's no longer a requirement every look is checked against again:
// that failed all three looks and built three new ones, 1 to 2 minutes (found on Sabine's iPhone in 5c,
// A.5). Each look changes only the pieces it's about, like Change: its shoes become high heels. Taken
// back (the note removed), they change back. Pure rules, tested in tests/wants.test.ts.

type DetailRule = Extract<Rule, { type: "detail" }>;

/** A saved Must have or Never with its rule. */
export type RuledPreference = FirmPreference & { rule: Rule };

/** A confirmed note asking for a preference allowed for this session, and the rule that tests it in code. */
export type Want = { noteId: string; version: number; words: string; kind: FirmPreference["kind"]; rule: DetailRule };

/** "id:version": a look records the wants it was changed for, so a new or changed one changes it. */
export const wantKey = (w: Pick<Want, "noteId" | "version">) => `${w.noteId}:${w.version}`;

const asking = (p: RuledPreference, n: Note) => p.rule.type === "detail" && wantedNote(p).toLowerCase() === n.text.trim().toLowerCase();
const want = (n: Pick<Note, "id" | "version">, p: RuledPreference): Want => ({ noteId: n.id, version: n.version, words: wantedNote(p), kind: p.kind, rule: p.rule as DetailRule });

/**
 * The wants: confirmed notes asking for a preference allowed for this session ("High heels"), only for
 * rules code can test. One whose rule is judged stays an ordinary note.
 */
export function wantsFrom(notes: Note[], allowed: RuledPreference[]): Want[] {
  return active(notes).flatMap((n) => {
    const p = n.status === "confirmed" ? allowed.find((a) => asking(a, n)) : undefined;
    return p ? [want(n, p)] : [];
  });
}

/**
 * The wants a look was changed for (`answered`) that have been taken back, while still allowed: their
 * pieces change back. Once the preference applies again (Remove on its line), the check takes the
 * pieces that break it out instead.
 */
export function droppedWants(notes: Note[], allowed: RuledPreference[], wants: Want[], answered: string[]): Want[] {
  const now = new Set(wants.map((w) => w.noteId));
  return answered.flatMap((key) => {
    const id = key.slice(0, key.lastIndexOf(":"));
    const n = now.has(id) ? undefined : notes.find((x) => x.id === id);
    const p = n ? allowed.find((a) => asking(a, n)) : undefined;
    // Another note still asks for the same thing: nothing to take back (fix plan 8, found on Sabine's
    // iPhone in 5c, A.7, when "High heels" was jotted twice and one was removed).
    return n && p && !wants.some((w) => w.words === wantedNote(p)) ? [want(n, p)] : [];
  });
}

/**
 * The places of the pieces a want changes in a look: of its kind, and not yet what's asked (`on`), or,
 * for one taken back, what was asked. The shopper's own pieces and the ones they kept stay, and a jacket
 * or coat over the look keeps its sleeves. A piece whose detail the catalog doesn't record stays.
 */
export function wantPieces(items: ResolvedItem[], w: Want, keep: Set<string>, on = true): number[] {
  return items.flatMap((it, i) => {
    if (!("product" in it) || keep.has(it.product.id)) return [];
    if (w.kind === "must_have" && groupOf(it) === "outer") return [];
    const is = ruledOut(w.kind, w.rule, it.product);
    return is === null || is === on ? [] : [i];
  });
}

/**
 * A revision plan from the look's feedback plan (`base`), also changing the pieces the wants are about
 * (`add`) and those of the wants taken back (`drop`), so its replacements meet both.
 */
export function wantsPlan(base: RevisionPlan, items: ResolvedItem[], add: Want[], drop: Want[]): RevisionPlan {
  const change = new Set(base.change);
  const wishes = [...base.wishes];
  const asked = [...base.asked];
  const notes = [...base.notes];
  for (const [list, on] of [[add, true], [drop, false]] as const)
    for (const w of list) {
      const words = w.words.toLowerCase();
      const places = wantPieces(items, w, base.keep, on);
      for (const i of places) change.add(i);
      for (const group of new Set(places.map((i) => groupOf(items[i])))) wishes.push(wish(w, group, on));
      if (on && places.length) asked.push(words);
      notes.push(on ? `For this look, the shopper asked for ${words}, allowed for this session` : `For this look, the shopper no longer asks for ${words}`);
    }
  return { ...base, change: base.whole ? [] : [...change].sort((a, b) => a - b), wishes, asked, notes };
}

/** What a replacement must be: what's asked, or for a want taken back, not that. */
const wish = (w: Want, group: Group, on: boolean) => ({
  group,
  about: on ? w.words.toLowerCase() : `not ${w.words.toLowerCase()}`,
  test: (p: Product) => ruledOut(w.kind, w.rule, p) === on,
  words: on ? w.words.toLowerCase() : `not ${w.words.toLowerCase()}`,
});
