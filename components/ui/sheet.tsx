"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

// A bottom sheet on phones, with 20 px top corners (design.md section 3.4). It slides up,
// or fades in with reduced motion.
export function Sheet({
  trigger,
  open,
  onOpenChange,
  title,
  children,
}: {
  /** The button that opens the sheet. Focus goes back to it when the sheet closes. */
  trigger: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="overlay-fade fixed inset-0 z-40 bg-ink/40" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="sheet-slide fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85vh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-t-sheet bg-page p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-overlay"
        >
          <div className="flex items-center justify-between gap-4">
            <RadixDialog.Title className="type-subheading m-0 text-ink">{title}</RadixDialog.Title>
            <RadixDialog.Close className="focus-ring inline-flex size-touch items-center justify-center rounded-control text-graphite hover:bg-showroom" aria-label="Close">
              <X size={24} strokeWidth={1.5} aria-hidden="true" />
            </RadixDialog.Close>
          </div>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
