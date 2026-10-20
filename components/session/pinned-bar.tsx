"use client";

import { type RefObject, useEffect, useRef } from "react";
import { Icon } from "@/components/ui/icons";

// The pinned bar on phones (design 4.1 and 5.3): when the stylist scrolls out of view, a bar pins to the
// top with a small live circle of her, her state, Mute and the notes summary. Tapping the summary goes
// back to the notebook and opens it. "Camera on" joins it in Phase 3. Hidden from tablet size up.

export function PinnedBar({
  stylistVideo,
  label,
  muted,
  muteDisabled,
  onMute,
  summary,
  onShowNotes,
}: {
  /** The stage's video: the circle shows the same picture. */
  stylistVideo: RefObject<HTMLVideoElement | null>;
  label: string;
  muted: boolean;
  muteDisabled: boolean;
  onMute: () => void;
  summary: string;
  onShowNotes: () => void;
}) {
  const circle = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (circle.current) circle.current.srcObject = stylistVideo.current?.srcObject ?? null;
  }, [stylistVideo]);

  return (
    <aside
      aria-label="Your stylist and notes"
      className="fixed inset-x-0 top-0 z-20 flex items-center gap-3 border-b border-hairline bg-page px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-paper tablet:hidden"
    >
      <video ref={circle} autoPlay playsInline muted aria-hidden="true" className="size-14 shrink-0 rounded-pill bg-ink object-cover" />
      <p className="type-label m-0 min-w-0 flex-1 text-ink">{label}</p>
      <button
        type="button"
        aria-pressed={muted}
        aria-label={muted ? "Muted" : "Mute"}
        disabled={muteDisabled}
        onClick={onMute}
        className={`focus-ring grid size-11 shrink-0 place-items-center rounded-pill disabled:opacity-55 ${
          muted ? "bg-ink text-white" : "border border-control-edge bg-page text-ink"
        }`}
      >
        <Icon name={muted ? "muted" : "microphone"} />
      </button>
      <button
        type="button"
        onClick={onShowNotes}
        className="focus-ring type-label min-h-touch shrink-0 rounded-control px-2 text-right text-emerald hover:bg-emerald-wash"
      >
        {summary}
      </button>
    </aside>
  );
}
