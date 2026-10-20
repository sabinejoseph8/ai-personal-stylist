"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { StatusChip } from "@/components/ui/status-chip";
import { chosenItem, DETAIL_NAMES, type DetailName, type StyleItem } from "@/core/photos/item";
import { PHOTO_MESSAGES } from "@/lib/photos";

// The item details review (3b; R28 to R30, R32; design 4.2): what the photo reader found, under the
// pasted photo. With several items, a numbered list to pick from (R29). For the chosen item, its type,
// colors, pattern and style on the ruled lines, in ink (Confirmed) or pencil (To confirm): tap one in
// pencil to confirm it, or say a correction. Then whose it is: It's mine or Inspiration (R30).

const ROW = "pl-[calc(var(--margin-x)+0.75rem)] pr-4";
const LABELS: Record<DetailName, string> = { type: "Type", colors: "Colors", pattern: "Pattern", style: "Style" };

function DetailRow({ name, value, pencil, onConfirm }: { name: DetailName; value: string; pencil: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const confirm = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) confirm.current?.focus();
  }, [open]);
  const words = (
    <span className="type-note min-w-0">
      <span className="text-graphite">{LABELS[name]}: </span>
      <span className={`px-0.5 ${pencil ? "highlighter-mark text-graphite" : "text-ink"}`}>{value}</span>
    </span>
  );
  const chip = (
    <span className="flex h-7 shrink-0 items-center">
      <StatusChip status={pencil ? "toConfirm" : "confirmed"} />
    </span>
  );
  if (!pencil)
    return (
      <li className={`${ROW} flex min-h-7 items-start justify-between gap-3`}>
        {words}
        {chip}
      </li>
    );
  return (
    <li className={ROW} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="focus-ring flex min-h-7 w-full items-start justify-between gap-3 rounded-[3px] text-left"
      >
        {words}
        {chip}
      </button>
      {open && (
        <div role="group" aria-label={`Change ${LABELS[name].toLowerCase()}`} className="flex h-14 items-center gap-2">
          <Button
            ref={confirm}
            icon="confirmed"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Confirm
          </Button>
        </div>
      )}
    </li>
  );
}

export function ItemDetails({
  item,
  onConfirm,
  onChoose,
  onOwnership,
}: {
  item: StyleItem;
  onConfirm: (name: DetailName) => void;
  onChoose: (index: number) => void;
  onOwnership: (ownership: "owned" | "inspiration") => void;
}) {
  const { reading, ownership } = item;
  if (reading.state === "analyzing") return null;
  if (reading.state === "failed" || !reading.items.length)
    return <p className={`${ROW} type-small m-0 leading-7 text-graphite`}>{PHOTO_MESSAGES.unread}</p>;

  const chosen = chosenItem(reading);
  return (
    <div className="flex flex-col">
      {reading.items.length > 1 && (
        <div role="group" aria-labelledby="which-item">
          <p id="which-item" className={`${ROW} type-label m-0 leading-7 text-ink`}>
            {chosen ? "Styling around" : "Which item should we style around?"}
          </p>
          <ol className="m-0 list-none p-0">
            {reading.items.map((it, i) => (
              <li key={`${i}-${it.name}`} className={`${ROW} flex h-14 items-center`}>
                <Button variant={i === reading.chosen ? "primary" : "secondary"} aria-pressed={i === reading.chosen} onClick={() => onChoose(i)}>
                  {i === reading.chosen && <Icon name="confirmed" />}
                  {`${i + 1}. ${it.name}`}
                </Button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {chosen && (
        <>
          <ul aria-label={`${chosen.name}: details`} className="m-0 list-none p-0">
            {DETAIL_NAMES.filter((n) => chosen.details[n]?.value).map((n) => (
              <DetailRow key={n} name={n} value={chosen.details[n].value} pencil={chosen.details[n].status === "to_confirm"} onConfirm={() => onConfirm(n)} />
            ))}
          </ul>
          {!ownership && (
            <div role="group" aria-labelledby="whose-item" className={`${ROW} flex flex-wrap items-center gap-x-3 gap-y-2 py-2`}>
              <p id="whose-item" className="type-label m-0 w-full leading-7 text-ink">
                Is this yours or an inspiration?
              </p>
              <Button variant="secondary" onClick={() => onOwnership("owned")}>
                It&rsquo;s mine
              </Button>
              <Button variant="secondary" onClick={() => onOwnership("inspiration")}>
                Inspiration
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Ownership in the photo's label (design 4.2): You own this, Inspiration, or Ownership: To confirm. */
export function OwnershipLabel({ ownership }: { ownership: StyleItem["ownership"] }) {
  if (ownership === "owned") return <StatusChip status="youOwnThis" />;
  if (ownership === "inspiration") return <span className="type-label inline-flex rounded-pill border border-hairline bg-page px-2.5 py-0.5 text-ink">Inspiration</span>;
  return <StatusChip status="toConfirm" label="Ownership: To confirm" />;
}
