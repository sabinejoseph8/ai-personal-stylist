import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icons";

// My Styling Notes as a notebook page (design.md sections 3 and 4.2): ruled lines every
// 28 px, a margin line, notes jotted in pencil (To confirm) or ink (Confirmed).
// Reused by the welcome hero now and the real notebook in Phase 2.

export type JottedNote = { id: string; text: string; status: "to_confirm" | "confirmed" };

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
    <li className="flex min-h-7 items-center justify-between gap-3 pl-[calc(var(--margin-x)+0.75rem)] pr-4">
      <span
        className={`type-note ${inkIn ? "ink-in" : ""} ${pencil ? "rounded-[3px] bg-highlighter px-1 text-graphite" : "text-ink"}`}
        style={inkIn ? { animationDelay: `${delayMs}ms` } : undefined}
      >
        {note.text}
      </span>
      <span className={`type-small inline-flex shrink-0 items-center gap-1 ${pencil ? "text-graphite" : "text-emerald"}`}>
        <Icon name={pencil ? "toConfirm" : "confirmed"} />
        {pencil ? "To confirm" : "Confirmed"}
      </span>
    </li>
  );
}
