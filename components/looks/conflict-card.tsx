"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { conflictQuestion, type FirmPreference } from "@/core/looks/exceptions";

// The conflict card (design 4.3, R57, 5c): when the shopper asks for something a saved Must have or
// Never rules out, it asks the same question as the stylist: "Your profile says Never: high heels.
// Allow high heels for this session?" with Allow for this session and Keep my preference.

export function ConflictCard({ preference, onAllow, onKeep }: { preference: FirmPreference; onAllow: () => Promise<boolean>; onKeep: () => void }) {
  const [busy, setBusy] = useState(false);
  const question = conflictQuestion(preference);
  return (
    <section role="group" aria-label="Allow for this session?" className="flex flex-col gap-3 rounded-panel border border-hairline bg-highlighter p-4">
      <p aria-live="polite" className="type-body m-0 flex items-start gap-2 text-ink">
        <Icon name="thisSessionOnly" className="mt-1 shrink-0" />
        {question}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            if (!(await onAllow())) setBusy(false);
          }}
        >
          Allow for this session
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onKeep}>
          Keep my preference
        </Button>
      </div>
    </section>
  );
}
