"use client";

import { type RefObject, useEffect, useRef } from "react";
import type { Facing } from "@/components/session/use-camera";
import { type Seen, seenLabel } from "@/core/camera/sightings";

// The camera view (3c; R33, R34, design 4.1), inside the stylist stage. On desktops and tablets it's a
// tile in the corner, labeled "Camera on" with a Red pen dot and "Video isn't saved." On phones it fills
// the stage with a frame guide while the stylist shrinks to a corner circle (styling-session.tsx). What
// the camera reader has named shows on the view, with a question mark when it isn't sure.

export function CameraView({ video, facing, seen }: { video: RefObject<HTMLVideoElement | null>; facing: Facing; seen: Seen | null }) {
  return (
    <div className="absolute inset-0 tablet:inset-auto tablet:bottom-3 tablet:right-3 tablet:aspect-[4/3] tablet:w-[55%] tablet:overflow-hidden tablet:rounded-image tablet:shadow-photo">
      <video
        ref={video}
        autoPlay
        playsInline
        muted
        aria-label="Your camera"
        // The front camera shows like a mirror; what's captured isn't mirrored.
        className={`h-full w-full bg-ink object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
      />

      {/* Phones: a frame guide while an item is being shown. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-[12%] bottom-[20%] top-[26%] rounded-panel border-2 border-dashed border-white/80 tablet:hidden">
        <p className="type-small m-0 pt-2 text-center text-white [text-shadow:0_1px_2px_rgb(31_42_68/0.8)]">Hold one item in the frame</p>
      </div>

      <div className="absolute left-3 top-12 flex flex-col items-start gap-1 tablet:left-2 tablet:top-2">
        <p className="type-label m-0 inline-flex items-center gap-1.5 rounded-pill bg-ink/70 px-3 py-1 text-white tablet:px-2 tablet:py-0.5">
          <span aria-hidden="true" className="size-2 rounded-pill bg-red-pen" />
          Camera on
        </p>
        <p className="type-small m-0 rounded-pill bg-ink/70 px-3 py-0.5 text-white tablet:px-2">Video isn&rsquo;t saved.</p>
      </div>

      {/* Phones keep the bottom right for the stylist's circle. */}
      {seen && (
        <p className="type-label absolute bottom-3 left-3 m-0 max-w-[calc(100%-7.5rem)] tablet:bottom-2 tablet:left-2 tablet:max-w-[calc(100%-1rem)]">
          <span className="block truncate rounded-pill bg-page px-3 py-1 text-ink shadow-photo">{seenLabel(seen)}</span>
        </p>
      )}
    </div>
  );
}

/**
 * What screen readers hear about the camera (R68): "On camera: Navy wool blazer", or "not sure", held
 * while anyone is talking, like the notes' announcements.
 */
export function CameraAnnouncer({ seen, hold }: { seen: Seen | null; hold: boolean }) {
  const region = useRef<HTMLDivElement>(null);
  const waiting = useRef<string | null>(null);
  const last = useRef<Seen | null>(null);
  useEffect(() => {
    if (seen !== last.current) {
      last.current = seen;
      if (seen) waiting.current = `On camera: ${seenLabel(seen).replace(/\?$/, ", not sure")}`;
    }
    const el = region.current;
    if (hold || !waiting.current || !el) return;
    const message = waiting.current;
    waiting.current = null;
    el.textContent = "";
    const timer = setTimeout(() => (el.textContent = message), 100);
    return () => clearTimeout(timer);
  }, [seen, hold]);
  return <div ref={region} aria-live="polite" className="sr-only" />;
}
