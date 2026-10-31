"use client";

import { SessionLink } from "@/components/session/session-entry";
import { useState, useSyncExternalStore } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icons";
import { NOT_NOW } from "@/components/ui/not-now";
import { StatusChip } from "@/components/ui/status-chip";
import { dollars } from "@/core/looks/budget";
import type { OpenedLook, SavedLook } from "@/core/looks/saved";
import type { ShownItem } from "@/core/looks/shown";

// Saved looks (6a; R60, design 4: Saved looks). Each with a small collage of its pieces, its name and the
// date saved. Open checks it against the saved profile first (Sabine's answer to Q1), then shows it in
// full, or says why it no longer fits. Remove asks first. A piece from a session photo shows by name only:
// the photo went when the session ended (Q2).

const savedOn = (iso: string, timeZone?: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone });
const noChange = () => () => {};

/** "27 Oct" in the shopper's own time zone, which only their browser knows: the server renders the UTC date first (6d review). */
function SavedOn({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    noChange,
    () => savedOn(iso),
    () => savedOn(iso, "UTC"),
  );
  return <time dateTime={iso}>{text}</time>;
}

function Picture({ item, photos, className }: { item: ShownItem; photos: Record<string, string>; className: string }) {
  const src = item.owned ? (item.kind === "wardrobe" ? photos[item.id] : null) : item.imageUrl;
  if (!src)
    return (
      <div className={`flex flex-col items-center justify-center gap-1 bg-showroom p-1 text-center text-graphite ${className}`}>
        <Icon name={item.owned ? "youOwnThis" : "sampleProduct"} />
        <span className="type-small">{item.owned ? "Your item" : item.name}</span>
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element -- catalog photos are already sized, and wardrobe photos use short-lived private links
  return <img src={src} alt={item.imageAlt} className={`bg-page object-contain ${className}`} />;
}

function Opened({ look, photos }: { look: OpenedLook; photos: Record<string, string> }) {
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={`Items in ${look.name}`} className="m-0 grid list-none grid-cols-2 gap-3 p-0">
        {look.items.map((item, i) => (
          <li key={`${i}-${item.id}`} className="flex min-w-0 flex-col gap-1">
            <Picture item={item} photos={photos} className="aspect-square w-full rounded-image border border-hairline" />
            <p className="type-label m-0 text-ink">{item.name}</p>
            {item.owned ? (
              <p className="type-small m-0 flex items-center gap-1 text-ink">
                <Icon name="youOwnThis" />
                You own this
              </p>
            ) : (
              <>
                <p className="type-small m-0 flex items-center gap-1 text-graphite">
                  <Icon name="sampleProduct" />
                  Sample product
                </p>
                <p className="type-label price m-0 text-ink">{dollars(item.priceCents ?? 0)}</p>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-0.5">
        <p className="type-subheading price m-0 text-ink">{look.total.toBuy}</p>
        {look.total.comparison && <p className="type-body price m-0 text-graphite">{look.total.comparison}</p>}
      </div>
      {look.reason && <p className="type-body m-0 text-ink">{look.reason}</p>}
      <StatusChip status="checked" />
    </div>
  );
}

function SavedCard({ look, photos, onRemoved }: { look: SavedLook; photos: Record<string, string>; onRemoved: () => void }) {
  const [state, setState] = useState<{ kind: "closed" } | { kind: "checking" } | { kind: "open"; look: OpenedLook } | { kind: "note"; text: string }>({ kind: "closed" });
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function open() {
    setState({ kind: "checking" });
    const res = await fetch(`/api/saved-looks/${look.id}/open`, { method: "POST" }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) as { look?: OpenedLook; none?: string; error?: string } | null;
    if (answer?.look) setState({ kind: "open", look: answer.look });
    else setState({ kind: "note", text: answer?.none ?? answer?.error ?? NOT_NOW });
  }

  async function remove() {
    setProblem(null);
    const res = await fetch(`/api/saved-looks/${look.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) onRemoved();
    else setProblem(((await res?.json().catch(() => null)) as { error?: string } | null)?.error ?? NOT_NOW);
  }

  const titleId = `saved-${look.id}`;
  return (
    <li aria-labelledby={titleId} className="flex flex-col gap-3 rounded-panel border border-hairline bg-page p-4">
      {state.kind !== "open" && (
        <div aria-hidden="true" className="grid grid-cols-4 gap-1.5">
          {look.items.slice(0, 4).map((item, i) => (
            <Picture key={`${i}-${item.id}`} item={item} photos={photos} className="aspect-square w-full rounded-image border border-hairline" />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        <h2 id={titleId} className="type-heading m-0 text-ink">
          {look.name}
        </h2>
        <p className="type-small m-0 text-graphite">
          Saved <SavedOn iso={look.savedAt} /> · <span className="price">{dollars(look.totalCents)}</span> to buy
        </p>
      </div>
      {state.kind === "checking" && (
        <p role="status" className="type-body m-0 flex items-center gap-2 text-graphite">
          <span aria-hidden="true" className="size-4 animate-spin rounded-pill border-2 border-hairline border-t-emerald" />
          Checking your preferences
        </p>
      )}
      {state.kind === "note" && (
        <p role="status" className="type-body m-0 rounded-print bg-showroom px-3 py-2 text-ink">
          {state.text}
        </p>
      )}
      {state.kind === "open" && <Opened look={state.look} photos={photos} />}
      {problem && (
        <p role="status" className="type-body m-0 text-ink">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {state.kind === "open" ? (
          <Button variant="secondary" onClick={() => setState({ kind: "closed" })}>
            Close
          </Button>
        ) : (
          <Button variant="secondary" disabled={state.kind === "checking"} onClick={() => void open()}>
            Open
          </Button>
        )}
        <ConfirmDialog
          trigger={
            <Button variant="quiet" aria-label={`Remove ${look.name}`}>
              Remove
            </Button>
          }
          open={confirming}
          onOpenChange={setConfirming}
          title="Remove this saved look?"
          description="It goes from Saved looks. Your bag and your profile don't change."
          confirmLabel="Remove look"
          cancelLabel="Keep it"
          destructive
          onConfirm={() => void remove()}
        />
      </div>
    </li>
  );
}

export function SavedLooks({ initialLooks, photos }: { initialLooks: SavedLook[]; photos: Record<string, string> }) {
  const [looks, setLooks] = useState(initialLooks);
  if (!looks.length)
    return (
      <div className="flex flex-col items-start gap-3 rounded-panel border border-dashed border-hairline p-4">
        <p className="type-body m-0 text-graphite">No saved looks yet</p>
        <SessionLink className={buttonClasses("secondary")}>Go to your looks</SessionLink>
      </div>
    );
  return (
    <ul aria-label="Your saved looks" className="m-0 grid list-none gap-4 p-0 tablet:grid-cols-2 desktop:grid-cols-3">
      {looks.map((look) => (
        <SavedCard key={look.id} look={look} photos={photos} onRemoved={() => setLooks((list) => list.filter((l) => l.id !== look.id))} />
      ))}
    </ul>
  );
}
