"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { readLines } from "@/components/session/use-notes";
import type { NoMatch } from "@/core/looks/no-match";
import { sameLooks } from "@/core/looks/context";
import type { ShownLook } from "@/core/looks/shown";

// The browser's side of the looks (4c; R39 to R45, R58). Whenever what the looks must meet may have
// changed (`inputs`: the confirmed notes, the item to style around and the wardrobe items chosen), it
// asks the server to bring them up to date, after a short wait so the shopper can finish. The server
// answers at once when nothing changed, checks the looks on screen again when something did (keeping
// those that still pass), and fills empty places. Only the newest request's answer is shown (R52).
// Swap asks for a different piece in one look (R43). Feedback revises a look (5b): the server says which
// places it's revising, and those looks show Revising until the revised look arrives.

export type LooksPhase = "idle" | "building" | "checking" | "updating" | "revising" | "ready" | "error";

type Line = { state?: "building" | "checking" | "updating" | "revising"; slots?: number[]; needs?: string; looks?: ShownLook[]; noMatch?: NoMatch | null; stale?: true; error?: string };

/** Something the stylist should hear about. */
export type LooksEvent =
  | { kind: "new"; before: ShownLook[]; looks: ShownLook[] }
  | { kind: "updated"; before: ShownLook[]; looks: ShownLook[] }
  | { kind: "swapped"; look: ShownLook; index: number; number: number }
  | { kind: "restored"; look: ShownLook; number: number; undo: boolean };

/** What bringing back an earlier look did (5c): the notes after Undo, or why it couldn't. */
export type RestoreAnswer = { ok: true; notes?: unknown } | { ok: false; none?: string };

/** Waits this long after a change before asking, so a few quick changes make one request. */
const WAIT_MS = 1200;
const FAILED = "The looks couldn't be put together.";

/**
 * `holdUntil` gives a time to wait for before asking: after a Keep or Change tap, 2 seconds, so several
 * taps make one revision (Sabine's answer to Q1 in 5b).
 */
export function useLooks(sessionId: string | null, inputs: string, onEvent: (e: LooksEvent) => void, holdUntil: () => number = () => 0) {
  const [looks, setLooks] = useState<ShownLook[]>([]);
  const [phase, setPhase] = useState<LooksPhase>("idle");
  const [needs, setNeeds] = useState<string | null>(null);
  const [noMatch, setNoMatch] = useState<NoMatch | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<{ lookId: string; index: number } | null>(null);
  // The piece each swapped look got, for its New chip.
  const [fresh, setFresh] = useState<Record<string, number>>({});
  // What a swap couldn't do, shown on the piece's own tile (found on Sabine's iPhone in 4d).
  const [swapNote, setSwapNote] = useState<{ lookId: string; index: number; text: string } | null>(null);
  // The places of the looks being revised from feedback (5b).
  const [revising, setRevising] = useState<number[]>([]);
  // A look whose earlier version is being checked before it comes back, and why one couldn't (5c).
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreNote, setRestoreNote] = useState<{ lookId: string; text: string } | null>(null);

  const latest = useRef(0);
  // Counts finished swaps: an answer read before a swap finished would bring back the old piece.
  const swapsDone = useRef(0);
  const shown = useRef<ShownLook[]>([]);
  const session = useRef(sessionId);
  const hook = useRef(onEvent);
  const hold = useRef(holdUntil);
  useLayoutEffect(() => {
    session.current = sessionId;
    hook.current = onEvent;
    hold.current = holdUntil;
  });

  function show(next: ShownLook[]) {
    shown.current = next;
    setLooks(next);
  }

  /** Brings the looks up to date. `force` is Try again. */
  async function refresh(force = false, staleTries = 2): Promise<void> {
    const id = session.current;
    if (!id) return;
    const mine = ++latest.current;
    const swapsBefore = swapsDone.current;
    const before = shown.current;
    setProblem(null);
    let answer: Line | null = null;
    // The looks on screen were checked again after a change, even if they all still fit (R44).
    let rechecked = false;
    try {
      const res = await fetch(`/api/sessions/${id}/looks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force }) });
      if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => null)) as Line | null)?.error ?? FAILED);
      await readLines<Line>(res, (line) => {
        if (mine !== latest.current) return;
        if (line.state) {
          setPhase(line.state);
          // The server only builds once nothing is needed any more: "Confirm your budget to see looks"
          // goes as building starts, not when the looks arrive (found on Sabine's iPhone in 4c).
          setNeeds(null);
          if (line.state === "updating") rechecked = true;
          if (line.state === "revising") setRevising((r) => [...new Set([...r, ...(line.slots ?? [])])]);
        } else answer = line;
      });
    } catch (e) {
      if (mine !== latest.current || id !== session.current) return;
      setRevising([]);
      setProblem(e instanceof Error && e.message !== "Failed to fetch" ? e.message : FAILED);
      setPhase("error");
      return;
    }
    if (mine !== latest.current || id !== session.current) return;
    setRevising([]);
    if (swapsDone.current !== swapsBefore) return refresh(force, staleTries);
    const got = answer as Line | null;
    if (got?.stale && staleTries > 0) {
      // What the looks must meet changed meanwhile: ask again on the newest (R52).
      await new Promise((r) => setTimeout(r, 800));
      if (mine === latest.current) return refresh(force, staleTries - 1);
      return;
    }
    if (!got || got.error || got.stale) {
      setProblem(got?.error ?? FAILED);
      setPhase("error");
      return;
    }
    if (got.needs !== undefined) {
      // Looks already shown stay, marked Needs a new check, until the new requirement is confirmed (R45, R58).
      show(before.map((l) => ({ ...l, current: false })));
      setNeeds(got.needs);
      setNoMatch(null);
      setPhase("idle");
      return;
    }
    const next = got.looks ?? [];
    setNeeds(null);
    setNoMatch(got.noMatch ?? null);
    show(next);
    setPhase("ready");
    // A revision that couldn't be made changes no look, but its note is news too (5b), even when it says
    // the same as last time: which feedback it answers (noteFor) tells the two apart, so the stylist is
    // told again that the change couldn't be made (full code review, C3; the second half of 5c fix 9).
    const same = sameLooks(before, next);
    if (!before.length && next.length) hook.current({ kind: "new", before, looks: next });
    else if (before.length && (rechecked || !same)) hook.current({ kind: "updated", before, looks: next });
  }

  /** Swap the piece at `index` in a look (R43). */
  async function swap(lookId: string, index: number) {
    const id = session.current;
    if (!id || swapping) return;
    setSwapping({ lookId, index });
    setSwapNote(null);
    try {
      const res = await fetch(`/api/sessions/${id}/looks/${lookId}/swap`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ index }) });
      const body = (await res.json().catch(() => null)) as { look?: ShownLook; index?: number; none?: string; stale?: true; error?: string } | null;
      if (id !== session.current) return;
      if (body?.look) {
        const look = body.look;
        swapsDone.current++;
        const number = shown.current.findIndex((l) => l.id === lookId) + 1;
        show(shown.current.map((l) => (l.id === lookId ? look : l)));
        setFresh((f) => ({ ...f, [look.id]: index }));
        hook.current({ kind: "swapped", look, index, number });
      } else if (body?.none) setSwapNote({ lookId, index, text: body.none });
      else if (body?.stale) void refresh();
      else setSwapNote({ lookId, index, text: body?.error ?? "The swap couldn't be checked. Try again." });
    } catch {
      setSwapNote({ lookId, index, text: "The swap couldn't be checked. Try again." });
    } finally {
      setSwapping(null);
    }
  }

  /**
   * Undo feedback, or Use this look from Compare (5c, R51): the earlier look is checked first, then
   * takes the place, or the look stays with a note saying why.
   */
  async function restore(lookId: string, target: { undo: true } | { versionId: string }): Promise<RestoreAnswer> {
    const id = session.current;
    if (!id || restoring || swapping) return { ok: false };
    setRestoring(lookId);
    setRestoreNote(null);
    try {
      const res = await fetch(`/api/sessions/${id}/looks/${lookId}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) });
      const body = (await res.json().catch(() => null)) as { look?: ShownLook; notes?: unknown; none?: string; stale?: true; error?: string } | null;
      if (id !== session.current) return { ok: false };
      if (body?.look) {
        const look = body.look;
        swapsDone.current++;
        const number = shown.current.findIndex((l) => l.id === lookId) + 1;
        show(shown.current.map((l) => (l.id === lookId ? look : l)));
        hook.current({ kind: "restored", look, number, undo: "undo" in target });
        return { ok: true, notes: body.notes };
      }
      if (body?.stale) void refresh();
      const text = body?.none ?? body?.error ?? "That look couldn't be checked. Try again.";
      setRestoreNote({ lookId, text });
      return { ok: false, none: text };
    } catch {
      setRestoreNote({ lookId, text: "That look couldn't be checked. Try again." });
      return { ok: false };
    } finally {
      setRestoring(null);
    }
  }

  // Asks after each change to what the looks must meet, once things settle.
  useEffect(() => {
    if (!sessionId) return;
    const timer = setTimeout(() => void refresh(), Math.max(WAIT_MS, hold.current() - Date.now()));
    return () => clearTimeout(timer);
    // refresh only reads refs and sets state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, inputs]);

  return {
    looks,
    phase,
    needs,
    noMatch,
    problem,
    swapping,
    fresh,
    swapNote,
    revising,
    restoring,
    restoreNote,
    restore,
    /** Try again (R45). */
    tryAgain: () => void refresh(true),
    swap,
    /** The session ended: nothing is shown until the next one has looks. */
    reset: () => {
      latest.current++;
      show([]);
      setPhase("idle");
      setNeeds(null);
      setNoMatch(null);
      setProblem(null);
      setFresh({});
      setSwapNote(null);
      setRevising([]);
      setRestoreNote(null);
    },
  };
}
