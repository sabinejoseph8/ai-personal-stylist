"use client";

import { useSyncExternalStore } from "react";

// What the app bar hears from the page under it (7a): the demo bag's count as pieces are added or removed,
// and a request to open Behind the scenes from the menu. Small stores in the browser, so the bar needn't
// sit inside every page's own state.

type Listener = () => void;

function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/** The bag's count, with when it was told: a bar shows it only when it's newer than the bar itself. */
const bag = store<{ count: number; at: number } | null>(null);

/** The page changed what's in the bag (Add to bag, Remove). */
export function reportBagCount(count: number) {
  bag.set({ count, at: Date.now() });
}

export function useBagCount(): { count: number; at: number } | null {
  return useSyncExternalStore(bag.subscribe, bag.get, () => null);
}

/** Behind the scenes, asked to open from the menu: a counter, so each request opens it once. */
const behind = store(0);

export function openBehindTheScenes() {
  behind.set(behind.get() + 1);
}

export function useBehindTheScenesRequests() {
  return useSyncExternalStore(behind.subscribe, behind.get, () => 0);
}
