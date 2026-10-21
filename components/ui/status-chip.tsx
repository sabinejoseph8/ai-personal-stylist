import { Icon, type IconName } from "./icons";

// Status is always an icon plus a word, never color alone (design.md sections 3.1 and 6).
export const STATUSES = {
  confirmed: { icon: "confirmed", word: "Confirmed", tone: "bg-emerald-wash text-emerald" },
  toConfirm: { icon: "toConfirm", word: "To confirm", tone: "bg-highlighter text-ink" },
  youOwnThis: { icon: "youOwnThis", word: "You own this", tone: "bg-page text-ink border border-hairline" },
  sampleProduct: { icon: "sampleProduct", word: "Sample product", tone: "bg-page text-graphite border border-hairline" },
  savedPreference: { icon: "savedPreference", word: "Saved preference", tone: "bg-page text-ink border border-hairline" },
  thisSessionOnly: { icon: "thisSessionOnly", word: "This session only", tone: "bg-page text-ink border border-hairline" },
  checked: { icon: "checked", word: "Checked against your preferences", tone: "bg-emerald-wash text-emerald" },
  needsNewCheck: { icon: "needsNewCheck", word: "Needs a new check", tone: "bg-highlighter text-ink" },
  revising: { icon: "revising", word: "Revising", tone: "bg-highlighter text-ink" },
  error: { icon: "error", word: "Error", tone: "bg-red-wash text-red-pen" },
} satisfies Record<string, { icon: IconName; word: string; tone: string }>;

export type Status = keyof typeof STATUSES;

export function StatusChip({ status, label }: { status: Status; label?: string }) {
  const s = STATUSES[status];
  return (
    <span className={`type-label inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 ${s.tone}`}>
      <Icon name={s.icon} />
      {label ?? s.word}
    </span>
  );
}
