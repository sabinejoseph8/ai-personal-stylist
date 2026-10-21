"use client";

import { useState, type ReactNode } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ICONS, Icon, type IconName } from "@/components/ui/icons";
import { PermissionCard } from "@/components/ui/permission-card";
import { Sheet } from "@/components/ui/sheet";
import { STATUSES, StatusChip, type Status } from "@/components/ui/status-chip";
import { ToastProvider, useToast } from "@/components/ui/toast";

// A living page of the design system (design.md 1.0), for reviewing on a phone or desktop.

const COLORS: [string, string, string][] = [
  ["Showroom", "bg-showroom", "App background"],
  ["Page", "bg-page", "Notebook, panels, sheets"],
  ["Ink", "bg-ink", "Main text, confirmed notes"],
  ["Graphite", "bg-graphite", "Secondary text, pencil notes"],
  ["Emerald", "bg-emerald", "Primary buttons, links"],
  ["Highlighter", "bg-highlighter", "Behind To confirm notes"],
  ["Red pen", "bg-red-pen", "Errors, destructive buttons"],
  ["Emerald wash", "bg-emerald-wash", "Selected, success"],
  ["Red wash", "bg-red-wash", "Error banners"],
  ["Control edge", "bg-control-edge", "Input and button borders"],
  ["Focus", "bg-focus", "Keyboard focus ring"],
  ["Rule blue", "bg-rule-blue", "Notebook lines (decoration)"],
  ["Margin pink", "bg-margin-pink", "Notebook margin (decoration)"],
  ["Hairline", "bg-hairline", "Dividers (decoration)"],
];

const TYPE: [string, string, string][] = [
  ["Display", "type-display", "Your stylist is listening"],
  ["Title", "type-title", "Saved looks"],
  ["Notebook title", "type-notebook-title", "My Styling Notes"],
  ["Heading", "type-heading", "Look 1, Garden ceremony"],
  ["Note value", "type-note", "Outdoor wedding, November"],
  ["Subheading", "type-subheading", "Remember your preferences"],
  ["Body", "type-body", "Talk naturally and your stylist will jot down what matters."],
  ["Label", "type-label", "Budget"],
  ["Small", "type-small price", "Sample product, $128.00"],
];

const MEANINGS: Record<IconName, string> = {
  confirmed: "Confirmed",
  toConfirm: "To confirm",
  undo: "Undo a removed note",
  revising: "Revising a look from feedback",
  youOwnThis: "You own this",
  sampleProduct: "Sample product",
  savedPreference: "Saved preference",
  thisSessionOnly: "This session only",
  checked: "Checked against your preferences",
  needsNewCheck: "Needs a new check",
  error: "Error or conflict",
  camera: "Camera (show an item)",
  switchCamera: "Switch camera",
  capture: "Capture",
  voiceOnly: "Voice only",
  microphone: "Mute (microphone on)",
  muted: "Muted",
  end: "End the conversation",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="type-title m-0">{title}</h2>
      {children}
    </section>
  );
}

function Demos() {
  const toast = useToast();
  const [chips, setChips] = useState<string[]>(["Womenswear"]);
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const toggle = (c: string) => setChips((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));

  return (
    <>
      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Save look</Button>
          <Button variant="secondary">Swap</Button>
          <Button variant="destructive">Delete all data</Button>
          <Button variant="quiet">Try again</Button>
          <Button icon="camera" variant="secondary">
            Camera
          </Button>
          <Button disabled>Checkout</Button>
        </div>
      </Section>

      <Section title="Chips">
        <div className="flex flex-wrap gap-2">
          {["Womenswear", "Menswear", "Classic", "Relaxed", "Bold"].map((c) => (
            <Chip key={c} selected={chips.includes(c)} onClick={() => toggle(c)}>
              {c}
            </Chip>
          ))}
        </div>
      </Section>

      <Section title="Status chips">
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUSES) as Status[]).map((s) => (
            <StatusChip key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="Banners">
        <div className="flex flex-col gap-3">
          <Banner title="Demo only: these sample products can't be bought." />
          <Banner tone="success" title="Look saved" />
          <Banner tone="error" title="Voice disconnected">
            Reconnecting, attempt 2 of 3.
          </Banner>
        </div>
      </Section>

      <Section title="Dialog, sheet and toast">
        <div className="flex flex-wrap gap-2">
          <ConfirmDialog
            trigger={<Button variant="destructive">Delete all data</Button>}
            open={dialog}
            onOpenChange={setDialog}
            title="Delete all your data?"
            description="Your profile, wardrobe, saved looks and bag will be deleted. This can't be undone."
            confirmLabel="Delete all data"
            destructive
            onConfirm={() => toast("All data deleted")}
          />
          <Sheet
            trigger={<Button variant="secondary">Open a sheet</Button>}
            open={sheet}
            onOpenChange={setSheet}
            title="Behind the scenes"
          >
            <p className="type-body m-0">Captured Budget: up to $500, from your voice, high certainty.</p>
            <p className="type-body m-0">Check passed: Look 2 meets Never: high heels, your budget and your colors.</p>
          </Sheet>
          <Button variant="secondary" onClick={() => toast("Look saved", () => toast("Save undone"))}>
            Show a toast
          </Button>
        </div>
      </Section>

      <Section title="Permission card">
        <div className="grid gap-3 tablet:grid-cols-2">
          <PermissionCard permission="microphone" />
          <PermissionCard permission="camera" state="denied" />
          <PermissionCard permission="camera" state="declined" />
          <PermissionCard permission="preferences" />
        </div>
      </Section>
    </>
  );
}

export default function Gallery() {
  return (
    <ToastProvider>
      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-8 tablet:px-6 desktop:px-8">
        <header className="flex flex-col gap-2">
          <p className="type-label m-0 text-graphite">Design system, design.md 1.0</p>
          <h1 className="type-display m-0">AI Personal Stylist</h1>
          <p className="type-body m-0 max-w-[60ch] text-graphite">
            Every color, type style and component the app is built from. Tap the buttons to try them.
          </p>
        </header>

        <Section title="Colors">
          <div className="grid grid-cols-2 gap-3 tablet:grid-cols-4">
            {COLORS.map(([name, swatch, use]) => (
              <div key={name} className="overflow-hidden rounded-image border border-hairline bg-page">
                <div className={`h-16 ${swatch}`} />
                <div className="p-3">
                  <p className="type-label m-0">{name}</p>
                  <p className="type-small m-0 text-graphite">{use}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type">
          <div className="flex flex-col gap-4 rounded-panel bg-page p-5">
            {TYPE.map(([name, cls, sample]) => (
              <div key={name} className="flex flex-col gap-1 border-b border-hairline pb-3 last:border-0">
                <span className="type-small text-graphite">{name}</span>
                <span className={cls}>{sample}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Icons">
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 tablet:grid-cols-2">
            {(Object.keys(ICONS) as IconName[]).map((n) => (
              <li key={n} className="type-body flex items-center gap-3 rounded-control bg-page px-3 py-2">
                <Icon name={n} size={24} className="text-ink" />
                {MEANINGS[n]}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Radius and shadows">
          <div className="flex flex-wrap gap-4">
            <div className="flex h-24 w-32 items-end rounded-paper bg-page p-2 shadow-paper type-small">Notebook, 4 px</div>
            <div className="flex h-24 w-32 items-end rounded-panel border border-hairline bg-page p-2 type-small">Look panel, 12 px</div>
            <div className="flex h-24 w-32 items-end rounded-image bg-page p-2 shadow-photo type-small">Photo, 8 px</div>
            <div className="flex h-24 w-32 items-end rounded-t-sheet bg-page p-2 shadow-overlay type-small">Sheet, 20 px</div>
          </div>
        </Section>

        <Demos />
      </main>
    </ToastProvider>
  );
}
