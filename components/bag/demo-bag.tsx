"use client";

import Link from "next/link";
import { useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button, buttonClasses } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { dollars } from "@/core/looks/budget";
import { type BagItem, DEMO_ONLY } from "@/core/looks/saved";

// The demo bag (6a; R61, R62, design 4: Demo bag). The banner, then each piece with its photo, name,
// size, price, "Sample product" and Remove, then the total and Checkout, disabled with the reason under
// it. The server refuses checkout too. Nothing here is in stock, on sale or sold by a real retailer (R62).

const selectClass = "focus-ring type-body min-h-touch rounded-control border border-control-edge bg-page px-3 text-ink";
const NOT_NOW = "That didn't work. Check your connection and try again.";

export function DemoBag({ initialItems }: { initialItems: BagItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function change(item: BagItem, init: RequestInit, done: (answer: { items?: BagItem[] }) => void) {
    setBusy(item.id);
    setProblem(null);
    const res = await fetch(`/api/bag/${item.id}`, init).catch(() => null);
    const answer = (await res?.json().catch(() => null)) as { items?: BagItem[]; error?: string } | null;
    setBusy(null);
    if (res?.ok && answer) done(answer);
    else setProblem(answer?.error ?? NOT_NOW);
  }

  if (!items.length)
    return (
      <div className="flex flex-col items-start gap-3 rounded-panel border border-dashed border-hairline p-4">
        <p className="type-body m-0 text-graphite">Your demo bag is empty. Add pieces from a look.</p>
        <Link href="/session" className={buttonClasses("secondary")}>
          Go to your looks
        </Link>
      </div>
    );

  const total = items.reduce((sum, i) => sum + i.priceCents, 0);
  return (
    <div className="flex flex-col gap-4">
      <Banner title={DEMO_ONLY} />
      <ul aria-label="Pieces in your demo bag" className="m-0 flex list-none flex-col gap-4 p-0">
        {items.map((item) => (
          <li key={item.id} className="flex gap-3 border-b border-hairline pb-4">
            <div className="size-24 shrink-0 overflow-hidden rounded-image border border-hairline bg-page">
              {/* eslint-disable-next-line @next/next/no-img-element -- catalog photos are already sized */}
              <img src={item.imageUrl} alt={item.imageAlt} className="size-full object-contain" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="type-label m-0 text-ink">{item.name}</p>
              <p className="type-small m-0 flex items-center gap-1 text-graphite">
                <Icon name="sampleProduct" />
                Sample product
              </p>
              <p className="type-label price m-0 text-ink">{dollars(item.priceCents)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="type-small flex items-center gap-2 text-graphite">
                  Size
                  <select
                    className={selectClass}
                    value={item.size}
                    disabled={busy === item.id}
                    onChange={(e) =>
                      void change(item, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ size: e.target.value }) }, (a) => a.items && setItems(a.items))
                    }
                  >
                    {item.sizes.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <Button variant="quiet" disabled={busy === item.id} aria-label={`Remove ${item.name}`} onClick={() => void change(item, { method: "DELETE" }, () => setItems((list) => list.filter((i) => i.id !== item.id)))}>
                  Remove
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {problem && (
        <p role="status" className="type-body m-0 text-ink">
          {problem}
        </p>
      )}
      {/* Pinned to the bottom on phones (design 5.8). */}
      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-hairline bg-showroom py-4 tablet:static">
        <p className="type-subheading price m-0 text-ink">Total: {dollars(total)}</p>
        <Button disabled aria-describedby="checkout-why" className="self-start">
          Checkout
        </Button>
        <p id="checkout-why" className="type-small m-0 text-graphite">
          {DEMO_ONLY}
        </p>
      </div>
    </div>
  );
}
