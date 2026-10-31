"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { reportBagCount } from "@/components/app-bar/live";
import { NOT_NOW } from "@/components/ui/not-now";
import { itemsKey } from "@/core/looks/saved";
import type { ShownLook } from "@/core/looks/shown";

// Saved looks and the demo bag on the session page (6a; R60, R61). Which looks are saved, so Save look
// reads Saved (the bag's count goes to the app bar, 7a). Save look and Add to bag go to
// the server, which takes only a look whose check passed on the current requirements (Sabine's Q3).

type Keeping = {
  isSaved: (look: ShownLook) => boolean;
  /** Save look: true once it's saved, or why not. */
  save: (sessionId: string, look: ShownLook) => Promise<true | string>;
  /** Add to bag: true once the pieces are in, or why not. */
  add: (sessionId: string, look: ShownLook, picks: { productId: string; size: string }[]) => Promise<true | string>;
};

const Context = createContext<Keeping | null>(null);

export function useKeeping() {
  return useContext(Context);
}

export function KeepingProvider({ savedKeys, children }: { savedKeys: string[]; children: ReactNode }) {
  const [saved, setSaved] = useState(() => new Set(savedKeys));
  // When the server's list changes (back from Saved looks), start again from it (tech spec 5, rule 11),
  // without remounting the session underneath.
  const fromServer = savedKeys.join(",");
  const [seen, setSeen] = useState(fromServer);
  if (seen !== fromServer) {
    setSeen(fromServer);
    setSaved(new Set(savedKeys));
  }

  async function send(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const answer = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
    return { ok: !!res?.ok, answer };
  }

  const value: Keeping = {
    isSaved: (look) => saved.has(itemsKey(look.items)),
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
      if (Array.isArray(answer?.items)) reportBagCount(answer.items.length);
      return true;
    },
  };
  return <Context value={value}>{children}</Context>;
}
