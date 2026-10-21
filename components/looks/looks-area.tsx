"use client";

import { useEffect, useRef } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import type { NoMatch } from "@/core/looks/no-match";
import type { ShownItem, ShownLook } from "@/core/looks/shown";
import { LookPanel } from "./look-panel";
import type { LooksPhase } from "./use-looks";

// The looks area of the session (design 4.3, 5.3 to 5.6; R39, R45, R59): what's still needed before
// looks can be built, placeholders with "Putting looks together" and "Checking your preferences", the
// look panels, Updating after a change, Try again when building fails (anything shown stays), and the
// no-match explanation with its choices. It reports which look is most on screen, for spoken swaps.

const STAGE_WORDS: Partial<Record<LooksPhase, string>> = {
  building: "Putting looks together",
  checking: "Checking your preferences",
  updating: "Updating your looks",
};

function Placeholder({ words }: { words: string }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4 rounded-panel border border-hairline bg-page p-4">
      <div className="h-5 w-1/2 rounded-print bg-showroom" />
      <div className="grid grid-cols-2 gap-3 desktop:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="aspect-square rounded-image bg-showroom" />
        ))}
      </div>
      <p className="type-label m-0 text-graphite">{words}</p>
    </div>
  );
}

export function LooksArea({
  className = "",
  started,
  looks,
  phase,
  needs,
  noMatch,
  problem,
  swapping,
  fresh,
  swapNote,
  canTalk,
  imageFor,
  onSwap,
  onTryAgain,
  onChoice,
  onInView,
}: {
  /** Its place in the session page's grid. */
  className?: string;
  /** A session has started, so looks can be built. */
  started: boolean;
  looks: ShownLook[];
  phase: LooksPhase;
  needs: string | null;
  noMatch: NoMatch | null;
  problem: string | null;
  swapping: { lookId: string; index: number } | null;
  fresh: Record<string, number>;
  swapNote: { lookId: string; text: string } | null;
  /** The call is live, so a no-match choice can be said to the stylist. */
  canTalk: boolean;
  imageFor: (item: ShownItem) => string | null;
  onSwap: (lookId: string, index: number) => void;
  onTryAgain: () => void;
  onChoice: (choice: string) => void;
  onInView: (look: number | null) => void;
}) {
  const busy = phase === "building" || phase === "checking" || phase === "updating";
  const words = STAGE_WORDS[phase];

  // The look most on screen: a spoken "show me different shoes" means that one (Q2 in 4c).
  const panels = useRef(new Map<number, HTMLElement>());
  const shares = useRef(new Map<number, number>());
  const report = useRef(onInView);
  useEffect(() => {
    report.current = onInView;
  });
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) shares.current.set(Number((e.target as HTMLElement).dataset.look), e.isIntersecting ? e.intersectionRatio : 0);
        let best: number | null = null;
        let most = 0.25;
        for (const [n, share] of shares.current) if (share > most) [best, most] = [n, share];
        report.current(best);
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of panels.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [looks]);

  let lead: string | null = null;
  if (!started) lead = "Looks appear here once you tell the stylist the occasion.";
  else if (needs) lead = needs;

  return (
    <section aria-labelledby="looks-title" className={`flex flex-col gap-4 ${className}`}>
      <h2 id="looks-title" className="sr-only">
        Your looks
      </h2>
      {lead && (
        <div className="rounded-panel border border-dashed border-hairline p-4">
          <p className="type-body m-0 text-graphite">{lead}</p>
        </div>
      )}
      <p aria-live="polite" className={looks.length && words ? "type-label m-0 flex items-center gap-2 text-graphite" : "sr-only"}>
        {words && (
          <>
            {looks.length > 0 && <span aria-hidden="true" className="size-4 animate-spin rounded-pill border-2 border-hairline border-t-emerald" />}
            {words}
          </>
        )}
      </p>
      {phase === "error" && problem && (
        <Banner tone="error" title={problem}>
          <div className="mt-2">
            <Button variant="secondary" onClick={onTryAgain}>
              Try again
            </Button>
          </div>
        </Banner>
      )}
      {!looks.length && busy && words && [0, 1, 2].map((i) => <Placeholder key={i} words={words} />)}
      {looks.map((look, i) => (
        <LookPanel
          key={look.slot}
          look={look}
          number={i + 1}
          count={looks.length}
          updating={phase === "updating"}
          swappingIndex={swapping?.lookId === look.id ? swapping.index : null}
          newIndex={fresh[look.id] ?? null}
          note={swapNote?.lookId === look.id ? swapNote.text : null}
          canSwap={!swapping && !busy}
          imageFor={imageFor}
          onSwap={(index) => onSwap(look.id, index)}
          panelRef={(el) => {
            if (el) panels.current.set(i + 1, el);
            else panels.current.delete(i + 1);
          }}
        />
      ))}
      {noMatch && looks.length > 0 && !busy && (
        <div role="status" className="flex flex-col gap-3 rounded-panel border border-hairline bg-page p-4">
          <p className="type-body m-0 text-ink">{noMatch.message}</p>
          <div className="flex flex-wrap gap-2">
            {noMatch.choices.map((choice) =>
              choice === "Try again" ? (
                <Button key={choice} variant="secondary" onClick={onTryAgain}>
                  Try again
                </Button>
              ) : (
                <Button key={choice} variant="secondary" disabled={!canTalk} onClick={() => onChoice(choice)}>
                  {choice}
                </Button>
              ),
            )}
          </div>
        </div>
      )}
      {noMatch && !looks.length && !busy && phase !== "error" && (
        <Banner title="No looks yet">
          <p className="m-0">{noMatch.message}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {noMatch.choices.map((choice) => (
              <Button key={choice} variant="secondary" disabled={choice !== "Try again" && !canTalk} onClick={() => (choice === "Try again" ? onTryAgain() : onChoice(choice))}>
                {choice}
              </Button>
            ))}
          </div>
        </Banner>
      )}
    </section>
  );
}
