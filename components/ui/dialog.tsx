"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Button } from "./button";

// Confirm dialogs for anything that can't be undone (design.md section 4.4).
// The destructive button is Red pen and names the action, for example "Delete all data".
export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: {
  /** The button that opens the dialog. Focus goes back to it when the dialog closes. */
  trigger: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** The button that keeps things as they are, for example "Keep talking". */
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="overlay-fade fixed inset-0 z-40 bg-ink/40" />
        <RadixDialog.Content className="dialog-pop fixed left-1/2 top-1/2 z-50 flex w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-panel bg-page p-6 shadow-overlay">
          <RadixDialog.Title className="type-subheading m-0 text-ink">{title}</RadixDialog.Title>
          <RadixDialog.Description className="type-body m-0 text-graphite">{description}</RadixDialog.Description>
          <div className="flex flex-wrap justify-end gap-2">
            <RadixDialog.Close asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </RadixDialog.Close>
            <Button
              variant={destructive ? "destructive" : "primary"}
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
