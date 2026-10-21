"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Sighting } from "@/core/camera/reader";
import { nextSeen, type Seen } from "@/core/camera/sightings";

// The camera (3c; R33 to R35, design 4.1). It stays off until the shopper taps Camera; the first time, a
// card explains why before the browser asks. Phones open the back camera first. While it's on, one small
// frame every 2 seconds goes to the camera reader, and an item is named only when two frames in a row
// agree. Capture takes a full-size still. The camera turns off after 2 minutes, when the session ends and
// when the page goes away. The call never gets the camera: it starts with video off.

export type CameraState = "off" | "explain" | "starting" | "on" | "blocked" | "missing";
export type Facing = "environment" | "user";

/** Two minutes on at most (R35). */
export const CAMERA_MINUTES = 2;
const FRAME_EVERY_MS = 2100;
const FRAME_SIDE = 640;

export const CAMERA_MESSAGES = {
  timedOut: "Camera turned off. Turn it on again to show another item.",
  blocked: "Camera blocked. Upload a photo instead.",
  missing: "No camera found. Upload a photo instead.",
  notNow: "No problem. You can upload a photo instead.",
  allowance: "You've reached today's limit for the demo, so the camera is off.",
} as const;

export type CameraHooks = {
  /** What the camera shows changed: an item, several items, or nothing (R34). */
  onSeen: (seen: Seen | null) => void;
  /** The camera can't be used, so upload is offered instead (R35). */
  onUnavailable: () => void;
};

/** A frame at most 640 px on its longest side, as base64 JPEG, or null before the video has a picture. */
function frameOf(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  if (!video.videoWidth) return null;
  const scale = Math.min(1, FRAME_SIDE / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7).split(",")[1] ?? null;
}

async function cameraAllowed() {
  try {
    return (await navigator.permissions?.query({ name: "camera" as PermissionName }))?.state === "granted";
  } catch {
    return false; // Safari without the camera permission query: the card explains first
  }
}

/** `live`: the conversation is running. The camera only runs during it, and turns off when it stops or ends. */
export function useCamera(sessionId: string | null, live: boolean, hooks: CameraHooks) {
  const [state, setState] = useState<CameraState>("off");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facing, setFacing] = useState<Facing>("environment");
  const [canSwitch, setCanSwitch] = useState(false);
  const [seen, setSeen] = useState<Seen | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const session = useRef(sessionId);
  const said = useRef(hooks);
  useLayoutEffect(() => {
    session.current = sessionId;
    said.current = hooks;
  });
  // One run of the camera: turning it off or switching cameras starts a new one, so old frames are ignored.
  const run = useRef(0);
  const tracks = useRef<MediaStream | null>(null);
  const explained = useRef(false);
  // When an item was last on screen, so "use this one" just after its name cleared still counts (3c fix).
  const itemAt = useRef(0);

  function stopTracks() {
    tracks.current?.getTracks().forEach((t) => t.stop());
    tracks.current = null;
    setStream(null);
  }

  /** Turns the camera off. `why` says what the shopper sees afterwards. */
  function stop(why?: keyof typeof CAMERA_MESSAGES) {
    run.current++;
    itemAt.current = 0;
    stopTracks();
    setState("off");
    setSeen(null);
    setMessage(why ? CAMERA_MESSAGES[why] : null);
    said.current.onSeen(null);
  }

  async function start(want: Facing = facing) {
    const mine = ++run.current;
    stopTracks();
    setMessage(null);
    setState("starting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: want }, width: { ideal: 1280 } }, audio: false });
      if (mine !== run.current) return void media.getTracks().forEach((t) => t.stop());
      tracks.current = media;
      setStream(media);
      setFacing(want);
      setState("on");
      const devices = (await navigator.mediaDevices.enumerateDevices?.().catch(() => [])) ?? [];
      setCanSwitch(devices.filter((d) => d.kind === "videoinput").length > 1);
      void watch(mine);
    } catch (e) {
      if (mine !== run.current) return;
      const name = e instanceof DOMException ? e.name : "";
      const missing = name === "NotFoundError" || name === "OverconstrainedError" || !navigator.mediaDevices;
      setState(missing ? "missing" : "blocked");
      setMessage(missing ? CAMERA_MESSAGES.missing : CAMERA_MESSAGES.blocked);
      said.current.onUnavailable();
    }
  }

  /** One frame every 2 seconds while this run lasts (R34): one at a time, and only while the page is in view. */
  async function watch(mine: number) {
    let before: Sighting | null = null;
    let shown: Seen | null = null;
    while (mine === run.current) {
      const started = Date.now();
      const id = session.current;
      const el = video.current;
      canvas.current ??= document.createElement("canvas");
      const frame = id && el && document.visibilityState === "visible" ? frameOf(el, canvas.current) : null;
      if (frame) {
        const res = await fetch(`/api/sessions/${id}/camera-frame`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frame }),
        }).catch(() => null);
        if (mine !== run.current) return;
        if (res?.status === 409) return stop("allowance");
        if (res?.status === 404) return stop();
        const answer = res?.ok ? ((await res.json().catch(() => ({}))) as { sighting?: Sighting }) : {};
        if (answer.sighting && mine === run.current) {
          const next = nextSeen(shown, before, answer.sighting);
          if (next.shown !== shown) setSeen(next.shown);
          shown = next.shown;
          if (shown?.kind === "item") itemAt.current = Date.now();
          if (next.news) said.current.onSeen(shown);
          before = answer.sighting;
        }
      }
      await new Promise((r) => setTimeout(r, Math.max(0, FRAME_EVERY_MS - (Date.now() - started))));
    }
  }

  // Off after 2 minutes (R35).
  useEffect(() => {
    if (state !== "on") return;
    const timer = setTimeout(() => stop("timedOut"), CAMERA_MINUTES * 60_000);
    return () => clearTimeout(timer);
    // stop only reads refs and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, stream]);

  // The video element shows the stream.
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);

  // Off when the conversation stops or the session ends (R35), and when the page goes away.
  useEffect(() => {
    // Turning off the camera itself, an outside system, which the state then follows.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!live) stop();
    // stop only reads refs and setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  useLayoutEffect(
    () => () => {
      run.current++;
      tracks.current?.getTracks().forEach((t) => t.stop());
      tracks.current = null;
    },
    [],
  );

  return {
    state,
    on: state === "on" || state === "starting",
    facing,
    canSwitch,
    seen,
    message,
    video,
    /** Camera: the first time, the card explains why before the browser asks (design 4.1). */
    begin: async () => {
      setMessage(null);
      if (explained.current || (await cameraAllowed())) return start();
      setState("explain");
    },
    allow: () => {
      explained.current = true;
      void start();
    },
    notNow: () => {
      setState("off");
      setMessage(CAMERA_MESSAGES.notNow);
    },
    stop: () => stop(),
    /** When an item was last on screen (0 when none has been). */
    lastItemAt: () => itemAt.current,
    switchCamera: () => void start(facing === "environment" ? "user" : "environment"),
    /** A full-size still of what's in view, as a photo file, or null before the video has a picture. */
    capture: async (): Promise<File | null> => {
      const el = video.current;
      if (!el?.videoWidth) return null;
      const still = document.createElement("canvas");
      still.width = el.videoWidth;
      still.height = el.videoHeight;
      still.getContext("2d")?.drawImage(el, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => still.toBlob(resolve, "image/jpeg", 0.92));
      return blob ? new File([blob], "camera.jpg", { type: "image/jpeg" }) : null;
    },
  };
}
