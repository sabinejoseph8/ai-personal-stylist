"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { engineFor } from "@/connectors/conversation/client";
import type { ConversationEngine, ConversationEvent } from "@/connectors/conversation/types";

// A plain stylist stage for 2a: Start conversation (or Resume), the stylist's video, and End.
// 2b designs the full stage: the state in words, voice controls and the microphone card.

type Phase = "ready" | "starting" | "live" | "ending";
type Stage = "Ready" | "Connecting" | "Listening" | "Speaking" | "Reconnecting" | "Ended";

const NO_CONNECTION = "We couldn't reach your stylist. Check your connection and try again.";

/** Tells the server the call is over: End closes the session, keep pauses it so it can be resumed. */
function endOnServer(sessionId: string, keep: boolean, beacon = false) {
  const url = `/api/sessions/${sessionId}/end`;
  const body = JSON.stringify({ keep });
  if (beacon && navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return Promise.resolve();
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).then(
    () => undefined,
    () => undefined,
  );
}

export function ConversationPanel({ openSessionId }: { openSessionId: string | null }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [stage, setStage] = useState<Stage>("Ready");
  const [sessionId, setSessionId] = useState(openSessionId);
  const [problem, setProblem] = useState<string | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const engine = useRef<ConversationEngine | null>(null);
  const live = useRef<{ sessionId: string; ending: boolean } | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const shown = useRef(false);

  // Leaving the page (Next.js hides it rather than closing it) or closing the tab pauses the
  // session, so the call doesn't run on unseen and the shopper can resume within 30 minutes.
  useLayoutEffect(() => {
    shown.current = true;
    const onPageHide = () => {
      if (live.current) void endOnServer(live.current.sessionId, true, true);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      shown.current = false;
      window.removeEventListener("pagehide", onPageHide);
      const current = live.current;
      if (current) {
        current.ending = true;
        void engine.current?.leave();
        void endOnServer(current.sessionId, true);
      }
      live.current = null;
      engine.current = null;
      setPhase("ready");
      setStage("Ready");
    };
  }, []);

  function fail(message: string) {
    setPhase("ready");
    setStage("Ready");
    setProblem(message);
  }

  /** The call stopped without End (time up, connection lost): the session stays open to resume. */
  function callStopped() {
    const current = live.current;
    if (!current || current.ending) return;
    live.current = null;
    engine.current = null;
    void endOnServer(current.sessionId, true);
    setPhase("ready");
    setStage("Ended");
    setProblem("The call ended. You can resume while you have conversation time left today.");
  }

  function onEvent(e: ConversationEvent) {
    if (e.type === "connection") {
      if (e.state === "connecting") setStage("Connecting");
      else if (e.state === "connected") setStage("Listening");
      else if (e.state === "reconnecting") setStage("Reconnecting");
      else callStopped();
    } else if (e.type === "stylist-speaking") {
      setStage(e.speaking ? "Speaking" : "Listening");
    } else if (e.type === "shopper-speaking" && e.speaking) {
      setStage("Listening");
    } else if (e.type === "error" && e.message === "audio_blocked") {
      setSoundBlocked(true);
    }
  }

  async function start() {
    setProblem(null);
    setPhase("starting");
    setStage("Connecting");
    let res: Response;
    try {
      res = await fetch("/api/sessions", { method: "POST" });
    } catch {
      return fail(NO_CONNECTION);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.call) return fail(data?.error ?? NO_CONNECTION);

    setSessionId(data.sessionId);
    const e = await engineFor(data.call.joinUrl);
    engine.current = e;
    live.current = { sessionId: data.sessionId, ending: false };
    e.on(onEvent);
    e.attach({ video: video.current, audio: audio.current });
    try {
      await e.join(data.call);
      // The shopper left the page while the call was connecting: pause it straight away.
      if (!shown.current) {
        live.current = null;
        engine.current = null;
        await e.leave();
        return void endOnServer(data.sessionId, true);
      }
      setPhase("live");
    } catch {
      live.current = null;
      engine.current = null;
      void endOnServer(data.sessionId, true);
      fail("The call couldn't connect. Check that this site can use your microphone, then try again.");
    }
  }

  async function end() {
    const current = live.current;
    const id = current?.sessionId ?? sessionId;
    setPhase("ending");
    if (current) current.ending = true;
    await engine.current?.leave();
    live.current = null;
    engine.current = null;
    if (id) await endOnServer(id, false);
    setSessionId(null);
    setProblem(null);
    setSoundBlocked(false);
    setPhase("ready");
    setStage("Ended");
  }

  const showVideo = phase === "live" || phase === "starting";

  return (
    <section aria-labelledby="stage-title" className="flex flex-col gap-4">
      <h2 id="stage-title" className="sr-only">
        Your stylist
      </h2>
      <div className="relative aspect-[4/5] w-full max-w-md overflow-hidden rounded-panel bg-ink shadow-photo tablet:aspect-[3/2] tablet:max-w-none">
        <video ref={video} autoPlay playsInline muted className={`h-full w-full object-cover ${showVideo ? "" : "hidden"}`} />
        <audio ref={audio} autoPlay />
        {!showVideo && (
          <p className="type-body absolute inset-0 m-0 flex items-center justify-center p-6 text-center text-white/80">
            {stage === "Ended" ? "Conversation ended." : "Your stylist will appear here."}
          </p>
        )}
        <p aria-live="polite" className="type-label absolute left-3 top-3 m-0 rounded-pill bg-ink/70 px-3 py-1 text-white">
          {stage}
        </p>
      </div>

      {problem && <Banner tone="error" title={problem} />}
      {soundBlocked && (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() =>
            audio.current?.play().then(
              () => setSoundBlocked(false),
              () => undefined,
            )
          }
        >
          Turn on sound
        </Button>
      )}

      <div className="flex flex-wrap gap-2">
        {phase === "live" || phase === "ending" ? (
          <Button variant="destructive" onClick={end} disabled={phase === "ending"}>
            {phase === "ending" ? "Ending…" : "End"}
          </Button>
        ) : (
          <>
            <Button onClick={start} disabled={phase === "starting"}>
              {phase === "starting" ? "Starting…" : sessionId ? "Resume conversation" : "Start conversation"}
            </Button>
            {sessionId && phase === "ready" && (
              <Button variant="secondary" onClick={end}>
                End
              </Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
