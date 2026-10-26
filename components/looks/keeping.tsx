"use client";

import Link from "next/link";
import { createContext, type ReactNode, useContext, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { itemsKey } from "@/core/looks/saved";
import type { ShownLook } from "@/core/looks/shown";

// Saved looks and the demo bag on the session page (6a; R60, R61). Which looks are saved, so Save look
// reads Saved, and how many pieces are in the bag, for the Demo bag link. Save look and Add to bag go to
// the server, which takes only a look whose check passed on the current requirements (Sabine's Q3).

type Keeping = {
  isSaved: (look: ShownLook) => boolean;
  bagCount: number;
  /** Save look: true once it's saved, or why not. */
  save: (sessionId: string, look: ShownLook) => Promise<true | string>;
  /** Add to bag: true once the pieces are in, or why not. */
  add: (sessionId: string, look: ShownLook, picks: { productId: string; size: string }[]) => Promise<true | string>;
};

const NOT_NOW = "That didn't work. Check your connection and try again.";
const Context = createContext<Keeping | null>(null);

export function useKeeping() {
  return useContext(Context);
}

export function KeepingProvider({ savedKeys, bagCount, children }: { savedKeys: string[]; bagCount: number; children: ReactNode }) {
  const [saved, setSaved] = useState(() => new Set(savedKeys));
  const [count, setCount] = useState(bagCount);
  // When the server's numbers change (back from the bag or Saved looks), start again from them (tech spec
  // 5, rule 11), without remounting the session underneath.
  const fromServer = `${bagCount}|${savedKeys.join(",")}`;
  const [seen, setSeen] = useState(fromServer);
  if (seen !== fromServer) {
    setSeen(fromServer);
    setSaved(new Set(savedKeys));
    setCount(bagCount);
  }

  async function send(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: !!res?.ok, answer };
  }

  const value: Keeping = {
    isSaved: (look) => saved.has(itemsKey(look.items)),
    bagCount: count,
    async save(sessionId, look) {
      const { ok, answer } = await send("/api/saved-looks", { sessionId, lookId: look.id });
      if (!ok) return typeof answer?.error === "string" ? answer.error : NOT_NOW;
      const key = (answer?.saved as { key?: string } | undefined)?.key ?? itemsKey(look.items);
      setSaved((s) => new Set(s).add(key));
      return true;
    },
    async add(sessionId, look, picks) {
      const { ok, answer } = await send("/api/bag", { sessionId, lookId: look.id, items: picks });
      if (!ok) return typeof answer?.error === "string" ? answer.error : NOT_NOW;
      if (Array.isArray(answer?.items)) setCount(answer.items.length);
      return true;
    },
  };
  return <Context value={value}>{children}</Context>;
}

/** Saved looks and Demo bag, beside Wardrobe until the app menu arrives in Phase 7. */
export function KeepingLinks() {
  const keeping = useKeeping();
  const count = keeping?.bagCount ?? 0;
  return (
    <>
      <Link href="/saved-looks" className={buttonClasses("secondary")}>
        Saved looks
      </Link>
      <Link href="/bag" className={buttonClasses("secondary")}>
        {count ? `Demo bag (${count})` : "Demo bag"}
      </Link>
    </>
  );
}
