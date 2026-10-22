"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import type { ShownItem, ShownLook } from "@/core/looks/shown";

// Compare (design 4.3, R51, Sabine's answer to Q3 in 5c): a look and its earlier versions in that place
// (from swaps, revisions and restores), newest first. Side by side on tablets and computers; on phones,
// a switch between Current and Earlier. The differences are labelled ("Different shoes"). Use this
// look checks the earlier one against the current requirements first, then brings it back or says why not.

type Earlier = ShownLook & { differences: string[] };

function MiniLook({ look, label, imageFor }: { look: ShownLook; label: string; imageFor: (item: ShownItem) => string | null }) {
  return (
    <section aria-label={label} className="flex flex-col gap-3">
      <h3 className="type-label m-0 text-graphite">{label}</h3>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0">
        {look.items.map((item, i) => {
          const src = item.owned ? imageFor(item) : item.imageUrl;
          return (
            <li key={`${i}-${item.id}`} className="flex min-w-0 flex-col gap-1">
              <div className="aspect-square overflow-hidden rounded-image border border-hairline bg-showroom">
                {/* eslint-disable-next-line @next/next/no-img-element -- catalog photos are already sized, and owned items use short-lived private links */}
                {src && <img src={src} alt={item.imageAlt} className="size-full object-contain" />}
              </div>
              <p className="type-small m-0 text-ink">{item.name}</p>
            </li>
          );
        })}
      </ul>
      <p className="type-label price m-0 text-ink">
        {look.total.toBuy}
        {look.total.comparison ? `, ${look.total.comparison}` : ""}
      </p>
    </section>
  );
}

export function CompareSheet({
  sessionId,
  look,
  number,
  disabled,
  imageFor,
  onUse,
}: {
  sessionId: string;
  look: ShownLook;
  number: number;
  disabled: boolean;
  imageFor: (item: ShownItem) => string | null;
  /** Use this look: true when it came back, or why it couldn't. */
  onUse: (versionId: string) => Promise<true | string>;
}) {
  const [open, setOpen] = useState(false);
  const [earlier, setEarlier] = useState<Earlier[] | null>(null);
  const [at, setAt] = useState(0);
  const [view, setView] = useState<"current" | "earlier">("earlier");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function load() {
    setEarlier(null);
    setAt(0);
    setProblem(null);
    const res = await fetch(`/api/sessions/${sessionId}/looks/${look.id}/history`).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { earlier?: Earlier[] } | null;
    if (body?.earlier) setEarlier(body.earlier);
    else setProblem("The earlier looks couldn't be loaded. Try again.");
  }

  const shownEarlier = earlier?.[at];
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
      title={`Compare Look ${number}`}
      wide
      trigger={
        <Button variant="secondary" disabled={disabled}>
          Compare
        </Button>
      }
    >
      {problem && (
        <p role="status" className="type-body m-0 text-ink">
          {problem}
        </p>
      )}
      {!earlier && !problem && <p className="type-body m-0 text-graphite">Loading the earlier looks…</p>}
      {earlier && !shownEarlier && <p className="type-body m-0 text-graphite">There are no earlier versions of this look.</p>}
      {shownEarlier && (
        <>
          {/* On phones, a switch between Current and Earlier. */}
          <div role="group" aria-label="Show" className="flex gap-2 tablet:hidden">
            <Chip selected={view === "current"} onClick={() => setView("current")}>
              Current
            </Chip>
            <Chip selected={view === "earlier"} onClick={() => setView("earlier")}>
              Earlier
            </Chip>
          </div>
          <ul aria-label="Differences" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {shownEarlier.differences.map((d) => (
              <li key={d} className="type-label rounded-pill bg-highlighter px-2.5 py-0.5 text-ink">
                {d}
              </li>
            ))}
          </ul>
          <div className="grid gap-6 tablet:grid-cols-2">
            <div className={view === "current" ? "" : "hidden tablet:block"}>
              <MiniLook look={look} label="Current" imageFor={imageFor} />
            </div>
            <div className={view === "earlier" ? "" : "hidden tablet:block"}>
              <MiniLook look={shownEarlier} label={`Earlier, ${at + 1} of ${earlier!.length}`} imageFor={imageFor} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {earlier!.length > 1 && (
              <>
                <Button variant="secondary" disabled={at === 0} onClick={() => setAt(at - 1)}>
                  Newer
                </Button>
                <Button variant="secondary" disabled={at === earlier!.length - 1} onClick={() => setAt(at + 1)}>
                  Older
                </Button>
              </>
            )}
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setProblem(null);
                const answer = await onUse(shownEarlier.id);
                setBusy(false);
                if (answer === true) setOpen(false);
                else setProblem(answer);
              }}
            >
              Use this look
            </Button>
          </div>
          {busy && <p className="type-small m-0 text-graphite">Checking it against your preferences…</p>}
        </>
      )}
    </Sheet>
  );
}
