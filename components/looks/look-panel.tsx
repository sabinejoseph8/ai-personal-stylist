"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { StatusChip } from "@/components/ui/status-chip";
import { dollars } from "@/core/looks/budget";
import type { ShownItem, ShownLook } from "@/core/looks/shown";

// A look panel and its item tiles (design 4.3; R40 to R43, R55, R58): "Look 1 of 3" and its name, the
// items with their photos, "You own this" or "Sample product" and a price, Swap, the total to buy and
// how it compares with the budget, the one-line reason, and "Checked against your preferences", or
// "Needs a new check" while it's checked again after a change. Keep and Change join in 5a; Save look,
// Give feedback, Compare and Add to bag in Phases 5 and 6.

const KINDS: Record<string, string> = {
  outer: "Jacket",
  bottom: "Bottoms",
  "t-shirt": "T-shirt",
};
const kindOf = (category: string) => KINDS[category] ?? category.charAt(0).toUpperCase() + category.slice(1);

/** A square photo on white, with a soft placeholder while it loads, and the icon and name if it fails. */
function TilePhoto({ item, src }: { item: ShownItem; src: string | null }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">(src ? "loading" : "failed");
  if (state === "failed" || !src)
    return (
      <div className="flex size-full flex-col items-center justify-center gap-1 bg-showroom p-2 text-center text-graphite">
        <Icon name={item.owned ? "youOwnThis" : "sampleProduct"} size={24} />
        <span className="type-small">{item.name}</span>
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- catalog photos are already 800 px, and owned items use short-lived private links
    <img
      src={src}
      alt={item.imageAlt}
      onLoad={() => setState("loaded")}
      onError={() => setState("failed")}
      className={`swap-fade size-full object-contain ${state === "loading" ? "bg-showroom" : "bg-page"}`}
    />
  );
}

function ItemTile({
  item,
  image,
  isNew,
  note,
  checking,
  canSwap,
  onSwap,
}: {
  item: ShownItem;
  image: string | null;
  isNew: boolean;
  note: string | null;
  checking: boolean;
  canSwap: boolean;
  onSwap: () => void;
}) {
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <div className="relative aspect-square overflow-hidden rounded-image border border-hairline bg-page">
        {/* A new piece is a new photo: keyed by the item, so it fades in rather than morphing, and by the
            link, so a refreshed link for the shopper's own photo is tried again (4e review). */}
        <TilePhoto key={`${item.id} ${image ?? ""}`} item={item} src={image} />
        {isNew && <span className="type-label absolute left-2 top-2 rounded-pill bg-emerald px-2 py-0.5 text-white">New</span>}
        {checking && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-page/85 p-2 text-center">
            <span aria-hidden="true" className="size-5 animate-spin rounded-pill border-2 border-hairline border-t-emerald" />
            <span className="type-small text-ink">Checking your preferences</span>
          </div>
        )}
      </div>
      <p className="type-label m-0 text-ink">{item.name}</p>
      <p className="type-small m-0 text-graphite">{kindOf(item.category)}</p>
      {item.owned ? (
        <p className="type-small m-0 flex items-center gap-1 whitespace-nowrap text-ink">
          <Icon name="youOwnThis" />
          You own this
        </p>
      ) : (
        <>
          <p className="type-small m-0 flex items-center gap-1 whitespace-nowrap text-graphite">
            <Icon name="sampleProduct" />
            Sample product
          </p>
          <p className="type-label price m-0 text-ink">{dollars(item.priceCents ?? 0)}</p>
          {/* At the bottom of the tile, so the Swap buttons in a row line up. */}
          <div className="mt-auto flex flex-col gap-1.5 pt-1">
            {note && (
              <p role="status" className="type-small m-0 rounded-print bg-showroom px-2 py-1.5 text-ink">
                {note}
              </p>
            )}
            <Button variant="secondary" className="self-start" disabled={!canSwap} aria-label={`Swap ${item.name}`} onClick={onSwap}>
              Swap
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

export function LookPanel({
  look,
  number,
  count,
  updating,
  swappingIndex,
  newIndex,
  note,
  canSwap,
  imageFor,
  onSwap,
  panelRef,
}: {
  look: ShownLook;
  number: number;
  count: number;
  /** The looks are being brought up to date after a change. */
  updating: boolean;
  /** The piece being swapped in this look, if any. */
  swappingIndex: number | null;
  /** The piece a swap just brought in. */
  newIndex: number | null;
  /** What a swap couldn't do, on that piece's tile, such as "No other shoes fit everything you've asked for, so these stay." */
  note: { index: number; text: string } | null;
  canSwap: boolean;
  imageFor: (item: ShownItem) => string | null;
  onSwap: (index: number) => void;
  panelRef?: (el: HTMLElement | null) => void;
}) {
  const titleId = `look-${look.id}`;
  return (
    <article ref={panelRef} data-look={number} aria-labelledby={titleId} className="flex flex-col gap-4 rounded-panel border border-hairline bg-page p-4">
      <header className="flex flex-col gap-0.5">
        <p className="type-label m-0 text-graphite">
          Look {number} of {count}
        </p>
        <h3 id={titleId} className="type-heading m-0 text-ink">
          {look.name}
        </h3>
      </header>
      <ul aria-label={`Items in ${look.name}`} className="m-0 grid list-none grid-cols-2 gap-3 p-0 desktop:grid-cols-3">
        {look.items.map((item, i) => (
          <ItemTile
            key={`${i}-${item.id}`}
            item={item}
            image={item.owned ? imageFor(item) : item.imageUrl}
            isNew={newIndex === i}
            note={note?.index === i ? note.text : null}
            checking={swappingIndex === i}
            canSwap={canSwap && look.current && !updating}
            onSwap={() => onSwap(i)}
          />
        ))}
      </ul>
      <div className="flex flex-col gap-0.5">
        <p className="type-subheading price m-0 text-ink">{look.total.toBuy}</p>
        {look.total.comparison && <p className="type-body price m-0 text-graphite">{look.total.comparison}</p>}
      </div>
      <p className="type-body m-0 text-ink">{look.reason}</p>
      <div className="flex flex-wrap items-center gap-2">
        {look.current ? <StatusChip status="checked" /> : <StatusChip status="needsNewCheck" />}
        {updating && !look.current && <span className="type-label text-graphite">Updating</span>}
      </div>
    </article>
  );
}
