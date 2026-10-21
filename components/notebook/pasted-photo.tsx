"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ItemDetails, OwnershipLabel } from "@/components/notebook/item-details";
import type { PagePhoto } from "@/components/session/use-photos";
import { Button } from "@/components/ui/button";
import { chosenItem, type DetailName } from "@/core/photos/item";
import { type NotebookPhoto, photoAnnouncement } from "@/lib/notebook";
import { MAX_PHOTOS } from "@/lib/photos";

// Style around this item (3a; R26, R27, R31, R32, R68; design 4.2). The shopper's photo is pasted into
// the notebook with a white print border, a 1 degree tilt and two strips of tape; the label beside it
// is never tilted. Its shape is kept: it's never cropped. Enlarge shows it full size and untilted.
// Replace and Remove act on it, and with several photos a row of thumbnails shows the active one.
// The photo reader (3b) names the item; its details and whose it is are reviewed under the photo.

const ROW = "pl-[calc(var(--margin-x)+0.75rem)] pr-4";

const sourceWords = (p: PagePhoto) => (p.source === "camera" ? "From your camera" : "Uploaded");
/** The item's name once the photo reader knows it (and, with several items, once one is chosen). */
const itemName = (p: PagePhoto) => (p.item ? chosenItem(p.item.reading)?.name : undefined);
/** Every photo has a description (R68), with the item's name once it's known. */
const describe = (p: PagePhoto, index: number, count: number) => {
  const name = itemName(p);
  return `${name ? `${name}, the item` : "Your item"} to style around${count > 1 ? `, photo ${index + 1} of ${count}` : ""}, ${sourceWords(p).toLowerCase()}`;
};

/** A photo in the few words announcements compare (R68). */
const forAnnouncing = (p: PagePhoto): NotebookPhoto => ({
  key: p.key,
  state: p.state,
  active: p.active,
  reading: p.item?.reading.state,
  name: itemName(p),
  items: p.item?.reading.items.length ?? 0,
  ownership: p.item?.ownership ?? null,
});

/** The 40 px thumbnail and label in the collapsed notebook's summary line (R27). */
export function PhotoThumbnail({ photo }: { photo: PagePhoto }) {
  return (
    <span className="inline-flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived private link, not a site image */}
      <img src={photo.thumbnailUrl} alt="" className="size-10 rounded-print bg-page object-contain shadow-photo" />
      <span className="type-small text-ink">{itemName(photo) ?? "Your item"}</span>
    </span>
  );
}

/** Enlarge: the full photo, untilted, with its description (design 4.2). */
function EnlargeDialog({
  photo,
  description,
  open,
  onOpenChange,
  trigger,
}: {
  photo: PagePhoto;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The Enlarge button. Focus goes back to it when the photo closes. */
  trigger: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="overlay-fade fixed inset-0 z-40 bg-ink/60" />
        <RadixDialog.Content className="dialog-pop fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(94vw,40rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-panel bg-page p-4 shadow-overlay">
          <RadixDialog.Title className="type-subheading m-0 text-ink">{itemName(photo) ?? "Your item"}</RadixDialog.Title>
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived private link, not a site image */}
          <img src={photo.photoUrl} alt={description} className="max-h-[70vh] w-full rounded-print object-contain" />
          <RadixDialog.Description className="type-small m-0 text-graphite">
            {description[0].toUpperCase() + description.slice(1)}.
          </RadixDialog.Description>
          <RadixDialog.Close asChild>
            <Button variant="secondary" className="self-end">
              Close
            </Button>
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export function StyleAroundThisItem({
  photos,
  active,
  canAdd,
  problem,
  holdAnnouncements,
  onAdd,
  onReplace,
  onRemove,
  onChoose,
  onRetry,
  onLinkExpired,
  onConfirm,
  onChooseItem,
  onOwnership,
  onSave,
  pickRef,
}: {
  photos: PagePhoto[];
  active: PagePhoto | null;
  /** A photo belongs to a session: Add a photo shows once the conversation has started (Q2 in 3a). */
  canAdd: boolean;
  problem: string | null;
  /** Someone is talking: screen reader updates wait (R68). */
  holdAnnouncements: boolean;
  onAdd: (file: File) => void;
  onReplace: (photo: PagePhoto, file: File) => void;
  onRemove: (photo: PagePhoto) => void;
  onChoose: (photo: PagePhoto) => void;
  onRetry: (photo: PagePhoto) => void;
  onLinkExpired: () => void;
  onConfirm: (photo: PagePhoto, detail: DetailName) => void;
  onChooseItem: (photo: PagePhoto, index: number) => void;
  onOwnership: (photo: PagePhoto, ownership: "owned" | "inspiration") => void;
  /** Save to wardrobe (3d). */
  onSave: (photo: PagePhoto, allow?: boolean) => Promise<"saved" | "permission" | "failed">;
  /** Lets Upload photo elsewhere on the screen open the same picker (3c: the camera's fallback). */
  pickRef?: RefObject<(() => void) | null>;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const replacing = useRef<PagePhoto | null>(null);
  const [enlarged, setEnlarged] = useState(false);
  // Previews a browser can't show (HEIC outside Safari) wait for the cleaned copy.
  const [noPreview, setNoPreview] = useState<string | null>(null);

  // Polite announcements (R68), held while anyone is talking, like the notes'.
  const live = useRef<HTMLParagraphElement>(null);
  const before = useRef(photos.map(forAnnouncing));
  const waiting = useRef<string[]>([]);
  useEffect(() => {
    const now = photos.map(forAnnouncing);
    const said = photoAnnouncement(before.current, now);
    if (said) waiting.current.push(said);
    before.current = now;
    const region = live.current;
    if (holdAnnouncements || !waiting.current.length || !region) return;
    const message = waiting.current.join(" ");
    waiting.current = [];
    region.textContent = "";
    const timer = setTimeout(() => (region.textContent = message), 100);
    return () => clearTimeout(timer);
  }, [photos, holdAnnouncements]);

  function pick(photo: PagePhoto | null) {
    replacing.current = photo;
    picker.current?.click();
  }
  useLayoutEffect(() => {
    if (!pickRef) return;
    pickRef.current = () => pick(null);
    return () => void (pickRef.current = null);
  });

  if (!photos.length && !canAdd) return null;
  const index = active ? photos.indexOf(active) : -1;
  const description = active ? describe(active, index, photos.length) : "";
  const showPreview = active && !(active.state !== "ready" && noPreview === active.photoUrl);

  return (
    <section aria-label="Style around this item" className="flex flex-col">
      <input
        ref={picker}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // the same photo can be picked again
          if (!file) return;
          if (replacing.current) onReplace(replacing.current, file);
          else onAdd(file);
        }}
      />

      {active && (
        <>
          <h3 className={`${ROW} type-heading m-0 leading-7 text-ink`}>
            Style around this item
          </h3>
          <div className={`${ROW} grid min-h-56 grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-center gap-4 py-3`}>
            {/* The print: a white border, a 1 degree tilt and two strips of tape. Tapping it enlarges it. */}
            <button
              type="button"
              tabIndex={-1}
              onClick={() => active.state === "ready" && setEnlarged(true)}
              className="relative justify-self-center rotate-1 rounded-print bg-page p-2 shadow-photo"
            >
              <span aria-hidden="true" className="absolute -left-3 -top-2 h-4 w-12 -rotate-[30deg] bg-hairline/70" />
              <span aria-hidden="true" className="absolute -right-3 -top-2 h-4 w-12 rotate-[30deg] bg-hairline/70" />
              {showPreview ? (
                // eslint-disable-next-line @next/next/no-img-element -- the shopper's own photo, from their device or a short-lived private link
                <img
                  src={active.photoUrl}
                  alt={description}
                  className="block max-h-48 max-w-full object-contain"
                  onError={() => (active.state === "ready" ? onLinkExpired() : setNoPreview(active.photoUrl))}
                />
              ) : (
                <span className="type-small grid size-36 place-items-center text-center text-graphite">Preparing preview</span>
              )}
            </button>

            <div className="flex min-w-0 flex-col items-start gap-1">
              <p className="type-note m-0 text-ink">{itemName(active) ?? "Your item"}</p>
              <p className="type-small m-0 text-graphite">{sourceWords(active)}</p>
              {active.item?.reading.state === "analyzing" && <p className="type-small m-0 text-graphite">Analyzing</p>}
              {active.item && chosenItem(active.item.reading) && <OwnershipLabel ownership={active.item.ownership} />}
              {active.state === "uploading" && (
                <div className="flex w-full flex-col gap-1 py-1">
                  <span id="photo-progress" className="type-small text-graphite">
                    Uploading
                  </span>
                  <progress aria-labelledby="photo-progress" value={active.progress} max={1} className="photo-progress h-1 w-full" />
                </div>
              )}
              {active.state === "failed" && (
                <>
                  <p className="type-small m-0 text-red-pen">The photo didn&rsquo;t upload.</p>
                  <Button variant="secondary" onClick={() => onRetry(active)}>
                    Try again
                  </Button>
                </>
              )}
              {active.state === "ready" && (
                <EnlargeDialog
                  photo={active}
                  description={description}
                  open={enlarged}
                  onOpenChange={setEnlarged}
                  trigger={
                    <Button variant="quiet" className="-ml-4">
                      Enlarge
                    </Button>
                  }
                />
              )}
              {active.state !== "failed" && (
                <Button variant="quiet" className="-ml-4" disabled={active.state === "uploading"} onClick={() => pick(active)}>
                  Replace
                </Button>
              )}
              <Button variant="quiet" className="-ml-4" onClick={() => onRemove(active)}>
                Remove
              </Button>
            </div>
          </div>

          {active.state === "ready" && active.item && (
            // Its own for each photo, so a question about one (Save photos to your wardrobe) never
            // carries over to another (Phase 3 code review).
            <ItemDetails
              key={active.key}
              item={active.item}
              onConfirm={(detail) => onConfirm(active, detail)}
              onChoose={(index) => onChooseItem(active, index)}
              onOwnership={(ownership) => onOwnership(active, ownership)}
              inWardrobe={active.inWardrobe}
              onSave={(allow) => onSave(active, allow)}
            />
          )}

          {photos.length > 1 && (
            <ul aria-label="Your photos" className={`${ROW} m-0 flex h-21 list-none items-start gap-3 p-0 pt-1`}>
              {photos.map((p, i) => (
                <li key={p.key} className="flex flex-col items-center gap-0.5">
                  <button
                    type="button"
                    aria-pressed={p.active}
                    aria-label={`Photo ${i + 1} of ${photos.length}`}
                    onClick={() => onChoose(p)}
                    disabled={!p.id}
                    className={`focus-ring size-14 rounded-print bg-page p-0.5 shadow-photo ${p.active ? "outline-2 outline-offset-1 outline-ink" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived private link or a local preview */}
                    <img src={p.thumbnailUrl} alt="" className="size-full object-contain" />
                  </button>
                  {p.active && <span className="type-small text-ink">Active</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {canAdd && photos.length < MAX_PHOTOS && (
        <div className={`${ROW} flex h-14 items-center`}>
          <Button variant="secondary" onClick={() => pick(null)}>
            {photos.length ? "Add another photo" : "Add a photo"}
          </Button>
        </div>
      )}
      {problem && (
        <p role="alert" className={`${ROW} type-small m-0 leading-7 text-red-pen`}>
          {problem}
        </p>
      )}
      <p ref={live} aria-live="polite" className="sr-only" />
    </section>
  );
}
