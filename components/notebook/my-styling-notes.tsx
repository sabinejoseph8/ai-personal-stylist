"use client";

import { type ReactNode, type Ref, useEffect, useRef, useState } from "react";
import type { ShownNote, TouchAction } from "@/components/session/use-notes";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { type ShownException, takeOffQuestion } from "@/core/looks/exceptions";
import { announcement, type NoteChange, noteChanges, notesSummary } from "@/lib/notebook";

// My Styling Notes (2d; R15, R16, R20, R23 to R25, R68; design 4.2 and 5.7): a ruled notebook page,
// not a form. Saved preferences sit at the top, then the stylist's notes in the order she jotted them,
// in pencil (To confirm) or ink (Confirmed). Tapping a note shows Confirm and Remove; a removed note
// can be undone for 5 seconds. Every row is a multiple of the 28 px ruled lines, so text sits on them.
// Style around this item (3a) sits between the saved preferences and the notes. Feedback on the looks
// (5a) comes last, under a small heading for each look, and is confirmed, removed and undone like notes.

const UNDO_MS = 5000;
const STRIKE_MS = 600;
const ROW = "pl-[calc(var(--margin-x)+0.75rem)] pr-4";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A note's words. A new note inks in; when the words change by voice, the old ones are struck through for a moment first. */
function NoteText({ text, pencil, animate }: { text: string; pencil: boolean; animate: boolean }) {
  const [view, setView] = useState({ text, old: null as string | null, ink: animate ? 1 : 0 });
  if (view.text !== text) setView({ text, old: reducedMotion() ? null : view.text, ink: view.ink + 1 });
  useEffect(() => {
    if (!view.old) return;
    const timer = setTimeout(() => setView((v) => ({ ...v, old: null })), STRIKE_MS);
    return () => clearTimeout(timer);
  }, [view.old]);

  if (view.old)
    return (
      <span className="type-note text-graphite">
        <s aria-hidden="true">{view.old}</s>
        <span className="sr-only">{view.text}</span>
      </span>
    );
  // The inner span stays inline, so the highlighter is a stroke behind the words, not a block.
  return (
    <span key={view.ink} className={`type-note min-w-0 ${view.ink ? "ink-in" : ""}`}>
      <span className={`px-0.5 transition-colors duration-standard ${pencil ? "highlighter-mark text-graphite" : "text-ink"}`}>{view.text}</span>
    </span>
  );
}

function NoteRow({
  note,
  animate,
  selected,
  focusMe,
  onSelect,
  onClose,
  onConfirm,
  onRemove,
}: {
  note: ShownNote;
  animate: boolean;
  selected: boolean;
  focusMe: boolean;
  onSelect: () => void;
  onClose: () => void;
  onConfirm: () => void;
  onRemove: () => void;
}) {
  const pencil = note.status === "to_confirm";
  const button = useRef<HTMLButtonElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);
  const wasSelected = useRef(selected);
  // Focus goes to the first action when the buttons appear, and back to the note when they close.
  useEffect(() => {
    if (selected) firstAction.current?.focus();
    else if (wasSelected.current && button.current?.isConnected) button.current.focus();
    wasSelected.current = selected;
  }, [selected]);
  useEffect(() => {
    if (focusMe) button.current?.focus();
  }, [focusMe]);

  return (
    <li
      className={ROW}
      onKeyDown={(e) => {
        if (e.key === "Escape" && selected) onClose();
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={selected}
        onClick={selected ? onClose : onSelect}
        className="focus-ring flex min-h-7 w-full items-start justify-between gap-3 rounded-[3px] text-left"
      >
        <NoteText text={note.text} pencil={pencil} animate={animate} />
        <span className="flex h-7 shrink-0 items-center">
          <StatusChip status={pencil ? "toConfirm" : "confirmed"} />
        </span>
      </button>
      {selected && (
        <div role="group" aria-label={`Change “${note.text}”`} className="flex h-14 items-center gap-2">
          {pencil && (
            <Button ref={firstAction} icon="confirmed" onClick={onConfirm}>
              Confirm
            </Button>
          )}
          <Button ref={pencil ? undefined : firstAction} variant="secondary" onClick={onRemove}>
            Remove
          </Button>
        </div>
      )}
    </li>
  );
}

/** Where a removed note was, with Undo for 5 seconds (R20). Focus moves to Undo when it appears. */
function RemovedRow({ id, text, onUndo }: { id: string; text: string; onUndo: () => void }) {
  const undo = useRef<HTMLButtonElement>(null);
  useEffect(() => undo.current?.focus(), []);
  return (
    <li data-removed={id} className={`${ROW} flex h-14 items-center justify-between gap-3`}>
      <span className="type-note text-graphite">
        Removed: <s>{text}</s>
      </span>
      <Button ref={undo} variant="quiet" icon="undo" onClick={onUndo}>
        Undo
      </Button>
    </li>
  );
}

type Removed = { note: ShownNote; index: number; until: number };

/**
 * A "This session only" exception (5c, R57, design 4.2): a clock, its words, and Save to my profile
 * (after a confirmation, Sabine's answer to Q2) and Remove.
 */
function ExceptionRow({ exception, onAction }: { exception: ShownException; onAction: (action: "remove" | "save") => Promise<boolean> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const act = async (action: "remove" | "save") => {
    setBusy(true);
    const ok = await onAction(action);
    if (!ok) setBusy(false);
  };
  return (
    <li className={ROW}>
      <div className="flex min-h-7 items-start justify-between gap-3">
        <span className="type-note leading-7 text-ink">{exception.text}</span>
        <span className="flex h-7 shrink-0 items-center">
          <StatusChip status="thisSessionOnly" />
        </span>
      </div>
      {asking ? (
        <div role="group" aria-label="Save to my profile">
          <p className="type-small m-0 leading-7 text-ink">{takeOffQuestion(exception)}</p>
          <div className="flex h-14 items-center gap-2">
            <Button disabled={busy} onClick={() => void act("save")}>
              Take it off
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div role="group" aria-label={`Change “${exception.text}”`} className="flex h-14 items-center gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => setAsking(true)}>
            Save to my profile
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void act("remove")}>
            Remove
          </Button>
        </div>
      )}
    </li>
  );
}

export function MyStylingNotes({
  notes,
  preferences,
  paused,
  open,
  onOpenChange,
  onTouch,
  holdAnnouncements,
  titleRef,
  styleAround,
  thumbnail,
  lookNumber = () => null,
  exceptions = [],
  onException = async () => false,
}: {
  notes: ShownNote[];
  /** Saved preferences that apply, in words, such as "Never: high heels" (R24). */
  preferences: string[];
  paused: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTouch: (note: ShownNote, action: TouchAction, index?: number) => Promise<boolean>;
  /** Someone is talking: screen reader updates wait, then come grouped (R68). */
  holdAnnouncements: boolean;
  titleRef?: Ref<HTMLHeadingElement>;
  /** Style around this item, with Add a photo (3a). */
  styleAround?: ReactNode;
  /** The active photo's thumbnail, shown with the summary when the notebook is hidden (R27). */
  thumbnail?: ReactNode;
  /** A look's number on screen, by its place, for feedback headings; null when it's gone (5a). */
  lookNumber?: (slot: number) => number | null;
  /** Saved preferences allowed for this session only (5c, R57). */
  exceptions?: ShownException[];
  onException?: (exception: ShownException, action: "remove" | "save") => Promise<boolean>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Removed[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  // Notes already there when the page opened (a resumed session) don't ink in again.
  const [atStart] = useState(() => new Set(notes.map((n) => n.id)));
  const section = useRef<HTMLElement>(null);

  // Polite announcements (R68): written straight into the live region, held while anyone is talking.
  const live = useRef<HTMLParagraphElement>(null);
  const before = useRef(notes);
  const waiting = useRef<NoteChange[]>([]);
  useEffect(() => {
    if (before.current !== notes) {
      waiting.current.push(...noteChanges(before.current, notes));
      before.current = notes;
    }
    const region = live.current;
    if (holdAnnouncements || !waiting.current.length || !region) return;
    const message = announcement(waiting.current);
    waiting.current = [];
    // Cleared first, so the same words twice in a row are still read out.
    region.textContent = "";
    const timer = setTimeout(() => (region.textContent = message), 100);
    return () => clearTimeout(timer);
  }, [notes, holdAnnouncements]);

  // Each removed note's Undo lasts 5 seconds. If focus was on that Undo, it moves to the notebook's title.
  useEffect(() => {
    if (!removed.length) return;
    const first = removed.reduce((a, b) => (a.until <= b.until ? a : b));
    const timer = setTimeout(
      () => {
        if (section.current?.querySelector(`[data-removed="${first.note.id}"]`)?.contains(document.activeElement)) {
          section.current.querySelector<HTMLElement>("#notebook-title")?.focus();
        }
        setRemoved((r) => r.filter((x) => x !== first));
      },
      Math.max(0, first.until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [removed]);

  async function touch(note: ShownNote, action: TouchAction, index?: number) {
    setProblem(null);
    if (!(await onTouch(note, action, index))) setProblem("That didn't save. Check your connection and try again.");
  }

  function remove(note: ShownNote) {
    const index = notes.findIndex((n) => n.id === note.id);
    setSelected(null);
    setRemoved((r) => [...r.filter((x) => x.note.id !== note.id), { note, index, until: Date.now() + UNDO_MS }]);
    void touch(note, "remove");
  }

  function restore({ note, index }: Removed) {
    setRemoved((r) => r.filter((x) => x.note.id !== note.id));
    setFocusId(note.id);
    void touch(note, "restore", index);
  }

  // Removed notes keep their place until Undo runs out. One that came back (Undo, or a failed save) drops out.
  const gone = removed.filter((r) => !notes.some((n) => n.id === r.note.id));
  const rows: ({ kind: "note"; note: ShownNote } | ({ kind: "removed" } & Removed))[] = notes.map((note) => ({ kind: "note" as const, note }));
  for (const r of [...gone].sort((a, b) => a.index - b.index)) rows.splice(Math.min(r.index, rows.length), 0, { kind: "removed", ...r });
  const summary = notesSummary(notes);
  type Row = (typeof rows)[number];
  const noteOf = (row: Row) => row.note;
  const regular = rows.filter((row) => !noteOf(row).feedback);
  // Feedback grouped by its look, in the looks' order on screen; a look no longer shown goes last.
  const groups = new Map<number, Row[]>();
  for (const row of rows) {
    const look = noteOf(row).feedback?.look;
    if (look) groups.set(look, [...(groups.get(look) ?? []), row]);
  }
  const feedback = [...groups.entries()]
    .map(([slot, list]) => ({ slot, number: lookNumber(slot), list }))
    .sort((a, b) => (a.number ?? 99) - (b.number ?? 99) || a.slot - b.slot);
  const renderRow = (row: Row) =>
    row.kind === "removed" ? (
      <RemovedRow key={`removed-${row.note.id}`} id={row.note.id} text={row.note.text} onUndo={() => restore(row)} />
    ) : (
      <NoteRow
        key={row.note.id}
        note={row.note}
        animate={!atStart.has(row.note.id)}
        selected={selected === row.note.id}
        focusMe={focusId === row.note.id}
        onSelect={() => setSelected(row.note.id)}
        onClose={() => setSelected(null)}
        onConfirm={() => {
          setSelected(null);
          void touch(row.note, "confirm");
        }}
        onRemove={() => remove(row.note)}
      />
    );

  return (
    <section
      ref={section}
      aria-labelledby="notebook-title"
      className="notebook-page relative rounded-paper bg-page pb-4 pt-3 shadow-paper"
    >
      <div className={`${ROW} flex h-7 items-center justify-between gap-3 pr-2`}>
        <h2 id="notebook-title" ref={titleRef} tabIndex={-1} className="type-notebook-title m-0 scroll-mt-24 text-ink outline-none">
          My Styling Notes
        </h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="notebook-notes"
          onClick={() => {
            setSelected(null);
            onOpenChange(!open);
          }}
          className="focus-ring type-label -my-2 min-h-touch rounded-control px-3 text-emerald hover:bg-emerald-wash"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {!open && (
        <div className={`${ROW} flex flex-wrap items-center justify-between gap-x-3 gap-y-1`}>
          <p className="type-body m-0 leading-7 text-graphite">{summary}</p>
          {thumbnail}
        </div>
      )}

      <div id="notebook-notes" hidden={!open}>
        <p className={`${ROW} type-small m-0 leading-7 text-graphite`}>
          Notes appear here as you talk. Tap a note to confirm or remove it, or say a correction.
        </p>

        {preferences.length > 0 && (
          <ul aria-label="Saved preferences" className="m-0 list-none p-0">
            {preferences.map((p) => (
              <li key={p} className={`${ROW} flex flex-wrap items-start justify-between gap-x-3`}>
                <span className="type-note text-ink">{p}</span>
                <span className="flex h-7 shrink-0 items-center">
                  <StatusChip status="savedPreference" />
                </span>
              </li>
            ))}
          </ul>
        )}

        {styleAround}

        <ul aria-label="Notes" className={`m-0 list-none p-0 ${rows.length ? "" : "min-h-28"}`}>
          {regular.map(renderRow)}
        </ul>

        {exceptions.length > 0 && (
          <ul aria-label="This session only" className="m-0 list-none p-0">
            {exceptions.map((e) => (
              <ExceptionRow key={e.id} exception={e} onAction={(action) => onException(e, action)} />
            ))}
          </ul>
        )}

        {feedback.map(({ slot, number, list }) => {
          const heading = number ? `Look ${number}` : "An earlier look";
          return (
            <section key={slot} aria-label={`Feedback on ${heading}`}>
              <h3 className={`${ROW} type-label m-0 leading-7 text-graphite`}>{heading}</h3>
              <ul aria-label={`Feedback on ${heading}`} className="m-0 list-none p-0">
                {list.map(renderRow)}
              </ul>
            </section>
          );
        })}

        {paused && (
          <p role="status" className={`${ROW} type-small m-0 leading-7 text-graphite`}>
            Notes paused. You can still confirm or remove notes.
          </p>
        )}
        {problem && (
          <p role="alert" className={`${ROW} type-small m-0 leading-7 text-red-pen`}>
            {problem}
          </p>
        )}
      </div>

      <p ref={live} aria-live="polite" className="sr-only" />
    </section>
  );
}
