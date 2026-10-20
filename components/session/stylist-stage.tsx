"use client";

import { type ButtonHTMLAttributes, type Ref, useLayoutEffect, useReducer, useRef, useState } from "react";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/ui/icons";
import { PermissionCard } from "@/components/ui/permission-card";
import { engineFor } from "@/connectors/conversation/client";
import type { ConversationEngine, ConversationEvent } from "@/connectors/conversation/types";
import { checkMicrophone, microphoneAllowed } from "@/lib/microphone";
import { SAMPLE_PHRASES } from "@/lib/sample-phrases";
import { type MicrophoneProblem, nextStage, READY, showSamplePhrases, stageLabel } from "@/lib/stage";

// The stylist stage (R6 to R8, R70, design 4.1 and 5.3): the video stylist with her state in words,
// Mute and End, the microphone card, and tap-to-try phrases. No captions, transcript or message box
// (R10, R11). Camera (Phase 3) and Voice only (6c) join the controls when they exist.

type Flow = "idle" | "explain" | "declined" | "starting" | "live" | "ending";

const NO_CONNECTION = "We couldn't reach your stylist. Check your connection and try again.";

const MICROPHONE_HELP: Record<MicrophoneProblem, string> = {
  blocked:
    "Allow the microphone for this site. On an iPhone, tap aA in Safari's address bar, then Website Settings, then Microphone, then Allow. On a computer, use the microphone icon in the address bar.",
  missing: "No microphone was found. Connect one, then try again.",
  failed: "Your microphone isn't working. Check that no other app is using it, then try again.",
};

/** Tells the server the call is over: End closes the session, keep pauses it so it can be resumed. */
function endOnServer(sessionId: string, keep: boolean, beacon = false) {
  const url = `/api/sessions/${sessionId}/end`;
  const body = JSON.stringify({ keep });
  if (beacon && navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return Promise.resolve();
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).then(
    () => undefined,
    () => undefined,
  );
}

/** A 48 px round voice control with its label underneath (design 4.1). It passes everything else to the
 *  button, so a dialog can use it as its trigger. */
function ControlButton({
  icon,
  label,
  pressed,
  danger = false,
  ref,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  label: string;
  pressed?: boolean;
  danger?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  const circle = danger ? "bg-red-pen text-white" : pressed ? "bg-ink text-white" : "border border-control-edge bg-page text-ink";
  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      aria-pressed={pressed}
      className="focus-ring group flex min-w-touch flex-col items-center gap-1 rounded-control disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span
        className={`grid size-12 place-items-center rounded-pill transition-[filter] duration-quick group-hover:brightness-95 ${circle}`}
      >
        <Icon name={icon} />
      </span>
      <span className="type-small text-ink">{label}</span>
    </button>
  );
}

export function StylistStage({ openSessionId }: { openSessionId: string | null }) {
  const [flow, setFlow] = useState<Flow>("idle");
  const [stage, dispatch] = useReducer(nextStage, READY);
  const [sessionId, setSessionId] = useState(openSessionId);
  const [problem, setProblem] = useState<string | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmEndPaused, setConfirmEndPaused] = useState(false);
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
      setFlow("idle");
      setConfirmEnd(false);
      setConfirmEndPaused(false);
      dispatch({ type: "stopped" });
    };
  }, []);

  /** The call stops without End: the session pauses, so it can be resumed. */
  function pauseCall(reason?: MicrophoneProblem) {
    const current = live.current;
    if (!current || current.ending) return;
    current.ending = true;
    const e = engine.current;
    live.current = null;
    engine.current = null;
    void e?.leave();
    void endOnServer(current.sessionId, true);
    setFlow("idle");
    if (reason) dispatch({ type: "microphone", problem: reason });
    else {
      dispatch({ type: "stopped" });
      setProblem("The call ended. You can resume while you have conversation time left today.");
    }
  }

  function onEvent(e: ConversationEvent) {
    if (e.type === "connection" && e.state === "ended") return pauseCall();
    if (e.type === "microphone") return pauseCall(e.problem);
    if (e.type === "error" && e.message === "audio_blocked") setSoundBlocked(true);
    dispatch(e);
  }

  function fail(message: string) {
    setFlow("idle");
    dispatch({ type: "stopped" });
    setProblem(message);
  }

  /** Start conversation, Resume or Try again: explain the microphone first unless it's allowed. */
  async function begin() {
    setProblem(null);
    if (await microphoneAllowed()) await connect();
    else setFlow("explain");
  }

  async function connect() {
    setProblem(null);
    setFlow("starting");
    dispatch({ type: "starting" });
    // The microphone is checked before the server starts a call, so it never uses Tavus minutes.
    const mic = await checkMicrophone();
    if (mic) {
      setFlow("idle");
      return dispatch({ type: "microphone", problem: mic });
    }

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
      if (live.current) setFlow("live");
    } catch {
      live.current = null;
      engine.current = null;
      void endOnServer(data.sessionId, true);
      fail("The call couldn't connect. Please try again.");
    }
  }

  function toggleMute() {
    const muted = !stage.muted;
    engine.current?.setMuted(muted);
    dispatch({ type: "muted", muted });
  }

  function sendPhrase(text: string) {
    engine.current?.sendPhrase(text);
    dispatch({ type: "phrase-sent" });
  }

  async function end() {
    const current = live.current;
    const id = current?.sessionId ?? sessionId;
    setFlow("ending");
    if (current) current.ending = true;
    await engine.current?.leave();
    live.current = null;
    engine.current = null;
    if (id) await endOnServer(id, false);
    setSessionId(null);
    setProblem(null);
    setSoundBlocked(false);
    setFlow("idle");
    dispatch({ type: "stopped" });
  }

  const label = stageLabel(stage);
  const inCall = flow === "starting" || flow === "live" || flow === "ending";
  const showVideo = inCall && !stage.microphone;

  return (
    <section aria-labelledby="stage-title" className="flex flex-col gap-4">
      <h2 id="stage-title" className="sr-only">
        Your stylist
      </h2>

      {/* Phones: a portrait frame before the conversation, then a head-and-shoulders band (design 4.1). */}
      <div
        className={`relative w-full overflow-hidden rounded-panel bg-ink shadow-photo desktop:aspect-[4/5] ${
          inCall ? "aspect-[3/2]" : "aspect-[4/5] max-w-md"
        }`}
      >
        <video ref={video} autoPlay playsInline muted className={`h-full w-full object-cover ${showVideo ? "" : "hidden"}`} />
        <audio ref={audio} autoPlay />
        {!showVideo && (
          <p className="type-body absolute inset-0 m-0 flex items-center justify-center p-6 text-center text-white/80">
            {label === "Ended" ? "Conversation ended." : "Your stylist will appear here."}
          </p>
        )}
        <p aria-live="polite" className="type-label absolute left-3 top-3 m-0 rounded-pill bg-ink/70 px-3 py-1 text-white">
          {label}
        </p>
      </div>

      {/* In a call, Mute and End sit right under the stage, so End is always within reach. */}
      {inCall && (
        <div className="flex items-start justify-center gap-8 desktop:justify-start">
          <ControlButton
            icon={stage.muted ? "muted" : "microphone"}
            label={stage.muted ? "Muted" : "Mute"}
            pressed={stage.muted}
            onClick={toggleMute}
            disabled={flow !== "live"}
          />
          <ConfirmDialog
            open={confirmEnd}
            onOpenChange={setConfirmEnd}
            trigger={<ControlButton icon="end" label="End" danger disabled={flow !== "live"} />}
            title="End this session?"
            description="Notes you haven't saved will be cleared."
            confirmLabel="End session"
            cancelLabel="Keep talking"
            destructive
            onConfirm={end}
          />
        </div>
      )}

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

      {flow === "live" && showSamplePhrases(stage) && (
        <div className="flex flex-col gap-2">
          <p id="try-saying" className="type-label m-0 text-graphite">
            Try saying
          </p>
          <ul aria-labelledby="try-saying" className="m-0 flex list-none flex-col gap-2 p-0">
            {SAMPLE_PHRASES.map((phrase) => (
              <li key={phrase}>
                <button
                  type="button"
                  onClick={() => sendPhrase(phrase)}
                  className="focus-ring type-body w-full rounded-control border border-control-edge bg-page px-3 py-2 text-left text-ink hover:bg-showroom"
                >
                  &ldquo;{phrase}&rdquo;
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stage.microphone && !inCall && (
        <div className="flex flex-col items-start gap-3">
          <Banner tone="error" title="The stylist needs your microphone to hear you">
            {MICROPHONE_HELP[stage.microphone]}
          </Banner>
          <Button onClick={begin}>Try again</Button>
        </div>
      )}

      {problem && <Banner tone="error" title={problem} />}

      {(flow === "explain" || flow === "declined") && (
        <PermissionCard
          permission="microphone"
          state={flow === "explain" ? "ask" : "declined"}
          onAllow={connect}
          onNotNow={() => setFlow("declined")}
        />
      )}

      {!inCall && !stage.microphone && flow !== "explain" && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={begin}>{sessionId ? "Resume conversation" : "Start conversation"}</Button>
          {sessionId && (
            <ConfirmDialog
              open={confirmEndPaused}
              onOpenChange={setConfirmEndPaused}
              trigger={<Button variant="secondary">End</Button>}
              title="End this session?"
              description="Notes you haven't saved will be cleared."
              confirmLabel="End session"
              cancelLabel="Keep talking"
              destructive
              onConfirm={end}
            />
          )}
        </div>
      )}
    </section>
  );
}
