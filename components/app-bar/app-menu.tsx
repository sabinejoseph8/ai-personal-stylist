"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SessionLink } from "@/components/session/session-entry";
import { Sheet } from "@/components/ui/sheet";
import { openBehindTheScenes, useBagCount } from "./live";

// The app menu (7a, design 4: App bar and menu). Phones and tablets: a Menu button opening a sheet.
// Desktops: the same items across the top. A guest sees all seven; a new visitor only what they can use
// yet (Sabine's answer to Q1 in 7a).

export type MenuKey = "welcome" | "session" | "wardrobe" | "saved" | "bag" | "profile" | "about" | "behind";

type Item = { key: MenuKey; label: string; href: string };

const GUEST: Item[] = [
  { key: "session", label: "Session", href: "/session" },
  { key: "wardrobe", label: "Wardrobe", href: "/wardrobe" },
  { key: "saved", label: "Saved looks", href: "/saved-looks" },
  { key: "bag", label: "Demo bag", href: "/bag" },
  { key: "profile", label: "Profile and privacy", href: "/profile" },
  { key: "about", label: "About this project", href: "/about" },
  // From another page, it opens on the session page (it shows the session's records).
  { key: "behind", label: "Behind the scenes", href: "/session?behind=1" },
];

const VISITOR: Item[] = [
  { key: "welcome", label: "Try the demo", href: "/" },
  { key: "about", label: "About this project", href: "/about" },
];

const itemClass = "focus-ring type-label inline-flex min-h-touch items-center rounded-control px-3 text-ink hover:bg-showroom aria-[current=page]:text-emerald aria-[current=page]:underline aria-[current=page]:underline-offset-4";

export function AppMenu({ guest, current, bagCount }: { guest: boolean; current?: MenuKey; bagCount: number }) {
  const [open, setOpen] = useState(false);
  // The count this page was rendered with, unless the page has changed the bag since (Add to bag, Remove).
  const [shownAt] = useState(() => Date.now());
  const live = useBagCount();
  const count = live && live.at >= shownAt ? live.count : bagCount;
  const items = guest ? GUEST : VISITOR;

  const entry = (item: Item, inSheet: boolean) => {
    const label = item.key === "bag" && count ? `${item.label} (${count})` : item.label;
    // On the session page, Behind the scenes opens its panel there rather than reloading the page.
    if (item.key === "behind" && current === "session")
      return (
        <button
          type="button"
          className={itemClass}
          onClick={() => {
            setOpen(false);
            // After the menu sheet has closed, so focus can go back to Menu when the panel closes.
            if (inSheet) setTimeout(openBehindTheScenes, 0);
            else openBehindTheScenes();
          }}
        >
          {label}
        </button>
      );
    // Into the session from another page: a full load, so its camera and microphone policy applies
    // (Chrome, 30 Oct 2026). On the session page itself, Session stays a plain link: a reload would end the call.
    if (item.href.startsWith("/session") && current !== "session")
      return (
        <SessionLink href={item.href} className={itemClass} onClick={() => setOpen(false)}>
          {label}
        </SessionLink>
      );
    return (
      <Link href={item.href} className={itemClass} aria-current={item.key === current ? "page" : undefined} onClick={() => setOpen(false)}>
        {label}
      </Link>
    );
  };

  return (
    <nav aria-label="Main">
      <ul className="m-0 hidden list-none flex-wrap items-center gap-1 p-0 desktop:flex">
        {items.map((item) => (
          <li key={item.key}>{entry(item, false)}</li>
        ))}
      </ul>
      <div className="desktop:hidden">
        <Sheet
          open={open}
          onOpenChange={setOpen}
          title="Menu"
          trigger={
            <Button variant="quiet" aria-haspopup="dialog">
              Menu
            </Button>
          }
        >
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {items.map((item) => (
              <li key={item.key}>{entry(item, true)}</li>
            ))}
          </ul>
        </Sheet>
      </div>
    </nav>
  );
}
