import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import type { ShownNote } from "@/core/notes/types";

// My Styling Notes as a notebook page (design.md sections 3 and 4.2): ruled lines every
// 28 px, a margin line, notes jotted in pencil (To confirm) or ink (Confirmed).
// Used by the welcome hero; the session's notebook is my-styling-notes.tsx (2d).

export type JottedNote = Pick<ShownNote, "id" | "text" | "status">;

export function NotebookPage({ title = "My Styling Notes", children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`notebook-page relative rounded-paper bg-page pb-4 pt-3 shadow-paper ${className}`}>
      <h2 className="type-notebook-title m-0 pl-[calc(var(--margin-x)+0.75rem)] pr-4 text-ink">{title}</h2>
      <ul className="m-0 list-none p-0">{children}</ul>
    </section>
  );
}

/** One jotted note. `inkIn` plays the signature "ink in" as it appears (it's off with reduced motion). */
export function NoteLine({ note, inkIn = false, delayMs = 0 }: { note: JottedNote; inkIn?: boolean; delayMs?: number }) {
  const pencil = note.status === "to_confirm";
  return (
    <li className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 pl-[calc(var(--margin-x)+0.75rem)] pr-4">
      <span className={`type-note ${inkIn ? "ink-in" : ""}`} style={inkIn ? { animationDelay: `${delayMs}ms` } : undefined}>
        <span className={`px-0.5 ${pencil ? "highlighter-mark text-graphite" : "text-ink"}`}>{note.text}</span>
      </span>
      <span className={`type-small inline-flex max-w-full items-center gap-1 ${pencil ? "text-graphite" : "text-emerald"}`}>
        <Icon name={pencil ? "toConfirm" : "confirmed"} />
        {pencil ? "To confirm" : "Confirmed"}
      </span>
    </li>
  );
}
