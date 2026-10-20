"use client";

import * as RadixToast from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icon } from "./icons";

// Toasts confirm small actions ("Look saved") for 4 seconds, with Undo where possible (design.md section 4.4).
type ToastItem = { id: number; message: string; onUndo?: () => void };
const ToastContext = createContext<(message: string, onUndo?: () => void) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, onUndo?: () => void) => {
    setItems((list) => [...list, { id: Date.now() + Math.random(), message, onUndo }]);
  }, []);
  const remove = (id: number) => setItems((list) => list.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={show}>
      <RadixToast.Provider duration={4000} swipeDirection="down" label="Notification">
        {children}
        {items.map((t) => (
          <RadixToast.Root
            key={t.id}
            onOpenChange={(open) => !open && remove(t.id)}
            className="toast-rise flex items-center gap-3 rounded-control bg-ink px-4 py-3 text-white shadow-overlay"
          >
            <Icon name="confirmed" />
            <RadixToast.Title className="type-body flex-1">{t.message}</RadixToast.Title>
            {t.onUndo && (
              <RadixToast.Action altText="Undo" asChild>
                <button
                  type="button"
                  onClick={t.onUndo}
                  className="focus-ring type-label inline-flex min-h-touch items-center gap-1 rounded-control px-3 text-white underline underline-offset-2"
                >
                  <Icon name="undo" />
                  Undo
                </button>
              </RadixToast.Action>
            )}
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed inset-x-4 bottom-4 z-50 m-0 mx-auto flex max-w-md list-none flex-col gap-2 p-0" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
