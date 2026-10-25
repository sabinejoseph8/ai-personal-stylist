/**
 * Undo's answer (full code review, C12): once the earlier look is back in its place, the answer says so,
 * whatever happens to taking back the feedback it answered. That step is tried twice; a failure is logged
 * and the notebook catches up on the next update, rather than the page saying the look couldn't be checked
 * while it was already back.
 */
export async function undoAnswer<L, N>(look: L, takeBack: (() => Promise<N | null>) | null): Promise<{ look: L; notes?: N }> {
  if (!takeBack) return { look };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const notes = await takeBack();
      return notes ? { look, notes } : { look };
    } catch (e) {
      if (attempt) console.error(`looks: taking back the undone feedback failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { look };
}
