import { active, type Note } from "../notes/types";

// When looks are built (R39, 4b): once the occasion is confirmed, and no stated firm requirement (a
// budget, colors to avoid, the outfit type) is still To confirm. Until then, the outfit area says what's
// needed (4c). Pure rules, tested in tests/checker.test.ts.

export function looksReadiness(notes: Note[]): { ready: true } | { ready: false; needs: string } {
  const live = active(notes);
  const pending = (n: Note) => n.status === "to_confirm";
  const occasion = live.filter((n) => n.kind === "occasion");
  if (!occasion.some((n) => n.status === "confirmed"))
    return { ready: false, needs: occasion.length ? "Confirm the occasion to see looks" : "Tell the stylist the occasion to see looks" };
  if (live.some((n) => n.kind === "budget" && pending(n))) return { ready: false, needs: "Confirm your budget to see looks" };
  if (live.some((n) => pending(n) && n.details.some((d) => d.name === "avoid"))) return { ready: false, needs: "Confirm the colors to avoid to see looks" };
  if (live.some((n) => pending(n) && n.details.some((d) => d.name === "outfit"))) return { ready: false, needs: "Confirm the outfit type to see looks" };
  return { ready: true };
}
