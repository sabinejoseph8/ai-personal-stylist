"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { dollars } from "@/core/looks/budget";
import { DEMO_ONLY } from "@/core/looks/saved";
import type { ShownLook } from "@/core/looks/shown";
import { useKeeping } from "./keeping";

// Save look and Add to bag under each look (6a; R60, R61, design 4.3). Both wait while the look is being
// checked, revised or needs a new check. Save look then reads Saved, with "Look saved". Add to bag opens a
// sheet with the look's sample products, each ticked, in the profile's size when it comes in it; the
// shopper's own pieces say "You own this" and can't be added (R61).

const selectClass = "focus-ring type-body min-h-touch rounded-control border border-control-edge bg-page px-3 text-ink";

function BagSheet({ sessionId, look, number, disabled }: { sessionId: string; look: ShownLook; number: number; disabled: boolean }) {
  const keeping = useKeeping();
  const toast = useToast();
  const products = look.items.filter((i) => !i.owned && i.kind === "product");
  const fresh = () => Object.fromEntries(products.map((i) => [i.id, { on: true, size: i.size ?? "" }]));
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<Record<string, { on: boolean; size: string }>>(fresh);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const chosen = products.filter((i) => picks[i.id]?.on);
  const ready = chosen.length > 0 && chosen.every((i) => picks[i.id].size);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPicks(fresh());
          setProblem(null);
        }
      }}
      title={`Add Look ${number} to your bag`}
      trigger={
        <Button variant="secondary" disabled={disabled || !products.length}>
          Add to bag
        </Button>
      }
    >
      <p className="type-small m-0 text-graphite">{DEMO_ONLY}</p>
      <ul aria-label="Pieces in this look" className="m-0 flex list-none flex-col gap-3 p-0">
        {look.items.map((item, i) => {
          const pick = picks[item.id];
          return (
            <li key={`${i}-${item.id}`} className="flex flex-wrap items-center gap-3 border-b border-hairline pb-3">
              {item.owned || !pick ? (
                <p className="type-body m-0 flex flex-1 items-center gap-2 text-ink">
                  <Icon name="youOwnThis" />
                  {item.name}: you own this
                </p>
              ) : (
                <>
                  <label className="type-body flex min-h-touch flex-1 items-center gap-2 text-ink">
                    <input type="checkbox" className="size-5 accent-emerald" checked={pick.on} onChange={(e) => setPicks({ ...picks, [item.id]: { ...pick, on: e.target.checked } })} />
                    <span>
                      {item.name} <span className="price text-graphite">{dollars(item.priceCents ?? 0)}</span>
                    </span>
                  </label>
                  <select
                    aria-label={`Size for ${item.name}`}
                    className={selectClass}
                    value={pick.size}
                    disabled={!pick.on}
                    onChange={(e) => setPicks({ ...picks, [item.id]: { ...pick, size: e.target.value } })}
                  >
                    {!pick.size && <option value="">Pick a size</option>}
                    {(item.sizes ?? []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {problem && (
        <p role="status" className="type-body m-0 text-ink">
          {problem}
        </p>
      )}
      <Button
        className="self-start"
        disabled={!ready || busy || !keeping}
        onClick={async () => {
          setBusy(true);
          setProblem(null);
          const answer = await keeping!.add(
            sessionId,
            look,
            chosen.map((i) => ({ productId: i.id, size: picks[i.id].size })),
          );
          setBusy(false);
          if (answer === true) {
            setOpen(false);
            toast("Added to bag");
          } else setProblem(answer);
        }}
      >
        Add to bag
      </Button>
    </Sheet>
  );
}

export function LookActions({ sessionId, look, number, disabled }: { sessionId: string; look: ShownLook; number: number; disabled: boolean }) {
  const keeping = useKeeping();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (!keeping) return null;
  const saved = keeping.isSaved(look);
  const paused = disabled || !look.current;
  return (
    <>
      {saved ? (
        <Button variant="secondary" icon="confirmed" disabled>
          Saved
        </Button>
      ) : (
        <Button
          variant="secondary"
          disabled={paused || busy}
          onClick={async () => {
            setBusy(true);
            setProblem(null);
            const answer = await keeping.save(sessionId, look);
            setBusy(false);
            if (answer === true) toast("Look saved");
            else setProblem(answer);
          }}
        >
          Save look
        </Button>
      )}
      <BagSheet sessionId={sessionId} look={look} number={number} disabled={paused} />
      {problem && (
        <p role="status" className="type-small m-0 basis-full text-ink">
          {problem}
        </p>
      )}
    </>
  );
}
