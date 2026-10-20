"use client";

import { type ButtonHTMLAttributes, type ReactNode, type Ref, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { MyStylingNotes } from "@/components/notebook/my-styling-notes";
import { PinnedBar } from "@/components/session/pinned-bar";
import { type ShownNote, useNotes } from "@/components/session/use-notes";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/ui/icons";
import { PermissionCard } from "@/components/ui/permission-card";
import { engineFor } from "@/connectors/conversation/client";
import type { ConversationEngine, ConversationEvent } from "@/connectors/conversation/types";
import { checkMicrophone, microphoneAllowed } from "@/lib/microphone";
import { notesSummary } from "@/lib/notebook";
import { SAMPLE_PHRASES } from "@/lib/sample-phrases";
import { type MicrophoneProblem, nextStage, READY, showSamplePhrases, someoneSpeaking, stageLabel, timeLeftLabel } from "@/lib/stage";

// The styling session (design 4.1, 4.2, 5.3 and 5.6). The stylist stage (R6 to R8, R70): the video
// stylist with her state in words, Mute and End, the microphone card, and tap-to-try phrases, with no
// captions, transcript or message box (R10, R11). Camera (Phase 3) and Voice only (6c) join the
// controls when they exist. Then My Styling Notes (2d), which takes the second column on desktops, and
// the pinned bar on phones once the stylist scrolls out of view.

type Flow = "idle" | "explain" | "declined" | "starting" | "live" | "ending";

const NO_CONNECTION = "We couldn't reach your stylist. Check your connection and try again.";
const NO_RECONNECT = "We couldn't reconnect to your stylist. Check your connection, then tap Try again. Your notes are still here.";

/** What Time is up says, by the limit that ended the call (R13). */
const TIME_UP = {
  day: "You've used today's 10 minutes with your stylist. Come back tomorrow to talk again.",
  month: "The video stylist is resting until the 1st of next month.",
} as const;
type Limit = keyof typeof TIME_UP;
const TIME_USED = new Set(["daily_time_used", "monthly_video_used"]);

/**
 * A dropped call is started again by itself up to 3 times, 2, 4 and 6 seconds apart (R14). While the
 * phone is offline (Wi-Fi off), it first waits up to 90 seconds for the connection to come back, so the
 * tries aren't used up while nothing can work (found on Sabine's iPhone in 2e).
 */
const RETRIES = 3;
const RETRY_MS = 2000;
const OFFLINE_WAIT_MS = 90_000;

/** True once the browser is online (at once if it is), false if it's still offline after `ms`. */
function waitUntilOnline(ms: number) {
  if (navigator.onLine) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const done = (online: boolean) => {
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      resolve(online);
    };
    const onOnline = () => done(true);
    const timer = setTimeout(() => done(false), ms);
    window.addEventListener("online", onOnline);
  });
}

/** How starting a call went. `final` means trying again won't help (a refusal or the microphone). */
type Outcome = { ok: true } | { ok: false; final: boolean; message?: string; reason?: string };

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

export function StylingSession({
  openSessionId,
  initialNotes = [],
  preferences,
  children,
}: {
  openSessionId: string | null;
  initialNotes?: ShownNote[];
  /** Saved preferences in words, shown at the top of the notebook (R24). */
  preferences: string[];
  /** Shown under the notebook: what the profile says (Sabine's answer to Q2 in 2d). */
  children?: ReactNode;
}) {
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
  // R13: when the call's time runs out, and which limit ends it. R14: each Start, End or Try again
  // starts a new attempt, so a dropped call's retries stop when the shopper does something else.
  const callEnds = useRef<{ at: number; because: Limit } | null>(null);
  const attempt = useRef(0);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [timeUpMessage, setTimeUpMessage] = useState<string | null>(null);
  // My Styling Notes (2c, 2d): words go to the server, notes and the next question come back, and the
  // stylist is told every change, including Confirm and Remove by touch.
  const notes = useNotes(sessionId, flow === "live", initialNotes, (context) => engine.current?.updateContext(context));
  const [notebookOpen, setNotebookOpen] = useState(true);
  const notebookTitle = useRef<HTMLHeadingElement>(null);

  // Phones: the pinned bar shows while the stylist is scrolled out of view.
  const frame = useRef<HTMLDivElement>(null);
  const [stageInView, setStageInView] = useState(true);
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setStageInView(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** The pinned bar's summary: back to the notebook, opened. */
  function showNotes() {
    setNotebookOpen(true);
    requestAnimationFrame(() => {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      notebookTitle.current?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
      notebookTitle.current?.focus({ preventScroll: true });
    });
  }

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

  // Time left in the last 2 minutes, and Time is up when it runs out (R13).
  useEffect(() => {
    if (flow !== "live") return;
    const timer = setInterval(() => {
      const ends = callEnds.current;
      if (!ends) return;
      const left = (ends.at - Date.now()) / 1000;
      setTimeLeft(timeLeftLabel(left));
      if (left <= 0) timeUp(ends.because);
    }, 1000);
    return () => clearInterval(timer);
    // timeUp only uses refs and state setters, so the timer needn't restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow]);

  /** Leaves the call, and pauses the session on the server so it can be resumed. False if there was no call. */
  function leaveCall() {
    const current = live.current;
    if (!current || current.ending) return false;
    current.ending = true;
    const e = engine.current;
    live.current = null;
    engine.current = null;
    callEnds.current = null;
    void e?.leave();
    void endOnServer(current.sessionId, true);
    return true;
  }

  /** The microphone stopped working: the session pauses (R6). */
  function pauseCall(reason: MicrophoneProblem) {
    if (!leaveCall()) return;
    setFlow("idle");
    dispatch({ type: "microphone", problem: reason });
  }

  /** The day's or month's conversation time ran out: the conversation ends for now, and the notes stay (R13). */
  function timeUp(because: Limit, message: string = TIME_UP[because]) {
    leaveCall();
    callEnds.current = null;
    setFlow("idle");
    setProblem(null);
    setTimeUpMessage(message);
    dispatch({ type: "time-up" });
  }

  /** The call dropped: a fresh call starts by itself, up to 3 times, then Try again (R14). */
  async function dropped() {
    const near = callEnds.current && Date.now() >= callEnds.current.at - 10_000;
    // Tavus ends a call itself when its time is up.
    if (near) return timeUp(callEnds.current!.because);
    if (!leaveCall()) return;
    const mine = ++attempt.current;
    setFlow("starting");
    dispatch({ type: "connection", state: "reconnecting" });
    for (let i = 0; i < RETRIES; i++) {
      if (!(await waitUntilOnline(OFFLINE_WAIT_MS))) break;
      await new Promise((r) => setTimeout(r, RETRY_MS * (i + 1)));
      if (attempt.current !== mine || !shown.current) return;
      const outcome = await connect({ reconnecting: true });
      if (outcome.ok || attempt.current !== mine) return;
      if (outcome.final) return settle(outcome);
    }
    if (attempt.current !== mine || !shown.current) return;
    // The session isn't over: the notes stay, and Try again picks it up (R14).
    setFlow("idle");
    setProblem(NO_RECONNECT);
    dispatch({ type: "connection-lost" });
  }

  function onEvent(e: ConversationEvent) {
    if (e.type === "connection" && e.state === "ended") return void dropped();
    if (e.type === "microphone") return pauseCall(e.problem);
    if (e.type === "error" && e.message === "audio_blocked") setSoundBlocked(true);
    notes.onEvent(e);
    dispatch(e);
  }

  /** A call that couldn't start: Time is up when the time is used, otherwise the reason in words. */
  function settle(outcome: Outcome) {
    if (outcome.ok) return;
    if (outcome.reason && TIME_USED.has(outcome.reason)) return timeUp(outcome.reason === "daily_time_used" ? "day" : "month", outcome.message);
    if (!outcome.message) return; // the microphone card, or the page was left
    setFlow("idle");
    dispatch({ type: "stopped" });
    setProblem(outcome.message);
  }

  /** Start conversation, Resume or Try again: explain the microphone first unless it's allowed. */
  async function begin() {
    setProblem(null);
    if (await microphoneAllowed()) await start();
    else setFlow("explain");
  }

  async function start() {
    attempt.current++;
    setTimeUpMessage(null);
    settle(await connect());
  }

  async function connect({ reconnecting = false } = {}): Promise<Outcome> {
    setProblem(null);
    setFlow("starting");
    dispatch(reconnecting ? { type: "connection", state: "reconnecting" } : { type: "starting" });
    // The microphone is checked before the server starts a call, so it never uses Tavus minutes.
    const mic = await checkMicrophone();
    if (mic) {
      setFlow("idle");
      dispatch({ type: "microphone", problem: mic });
      return { ok: false, final: true };
    }

    let res: Response;
    try {
      res = await fetch("/api/sessions", { method: "POST" });
    } catch {
      return { ok: false, final: false, message: NO_CONNECTION };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.call) {
      // A refusal (time used, the stylist busy, too many starts) won't change by trying again.
      const final = [401, 409, 429, 503].includes(res.status);
      return { ok: false, final, message: data?.error ?? NO_CONNECTION, reason: data?.reason };
    }

    setSessionId(data.sessionId);
    callEnds.current = { at: Date.now() + data.seconds * 1000, because: data.endsBecause === "month" ? "month" : "day" };
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
        void endOnServer(data.sessionId, true);
        return { ok: false, final: true };
      }
      if (live.current) setFlow("live");
      return { ok: true };
    } catch {
      live.current = null;
      engine.current = null;
      callEnds.current = null;
      void endOnServer(data.sessionId, true);
      return { ok: false, final: false, message: "The call couldn't connect. Please try again." };
    }
  }

  function toggleMute() {
    const muted = !stage.muted;
    engine.current?.setMuted(muted);
    dispatch({ type: "muted", muted });
  }

  /** A tapped phrase or quick reply: the stylist hears it as if spoken, and the notes reader reads it. */
  function sendPhrase(text: string) {
    engine.current?.sendPhrase(text);
    notes.say(text);
    dispatch({ type: "phrase-sent" });
  }

  function answer(option: string) {
    notes.clearQuestion();
    sendPhrase(option);
  }

  async function end() {
    const current = live.current;
    const id = current?.sessionId ?? sessionId;
    attempt.current++;
    callEnds.current = null;
    setTimeUpMessage(null);
    setFlow("ending");
    if (current) current.ending = true;
    await engine.current?.leave();
    live.current = null;
    engine.current = null;
    if (id) await endOnServer(id, false);
    setSessionId(null);
    notes.reset();
    setProblem(null);
    setSoundBlocked(false);
    setFlow("idle");
    dispatch({ type: "stopped" });
  }

  const label = stageLabel(stage);
  const inCall = flow === "starting" || flow === "live" || flow === "ending";
  const showVideo = inCall && !stage.microphone;

  return (
    <>
      <section aria-labelledby="stage-title" className="flex flex-col gap-4">
        <h2 id="stage-title" className="sr-only">
          Your stylist
        </h2>

        {/* Phones: a portrait frame before the conversation, then a head-and-shoulders band (design 4.1). */}
        <div
          ref={frame}
          className={`relative w-full overflow-hidden rounded-panel bg-ink shadow-photo desktop:aspect-[4/5] ${
            inCall ? "aspect-[3/2]" : "aspect-[4/5] max-w-md"
          }`}
        >
          <video ref={video} autoPlay playsInline muted className={`h-full w-full object-cover ${showVideo ? "" : "hidden"}`} />
          <audio ref={audio} autoPlay />
          {!showVideo && (
            <p className="type-body absolute inset-0 m-0 flex items-center justify-center p-6 text-center text-white/80">
              {label === "Ended" || label === "Time is up"
                ? "Conversation ended."
                : label === "Connection lost"
                  ? "Connection lost."
                  : "Your stylist will appear here."}
            </p>
          )}
          <p aria-live="polite" className="type-label absolute left-3 top-3 m-0 rounded-pill bg-ink/70 px-3 py-1 text-white">
            {label}
          </p>
          {/* Time left, in the last 2 minutes (R13). Always there, so screen readers hear it change. */}
          <p
            role="status"
            className={`type-label absolute right-3 top-3 m-0 rounded-pill bg-ink/70 px-3 py-1 text-white ${flow === "live" && timeLeft ? "" : "sr-only"}`}
          >
            {flow === "live" ? timeLeft : null}
          </p>
        </div>

        {/* Quick replies (R19): the next question's options, answered as if spoken. */}
        {flow === "live" && notes.question && notes.question.options.length > 0 && (
          <div role="group" aria-label={`Quick replies: ${notes.question.text}`} className="flex flex-wrap gap-2">
            {notes.question.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => answer(option)}
                className="focus-ring type-label min-h-touch rounded-pill border border-control-edge bg-page px-4 text-ink hover:bg-showroom"
              >
                {option}
              </button>
            ))}
          </div>
        )}

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
        {stage.timeUp && timeUpMessage && <Banner title="Time is up">{timeUpMessage} Your notes stay here until you end the session.</Banner>}

        {(flow === "explain" || flow === "declined") && (
          <PermissionCard
            permission="microphone"
            state={flow === "explain" ? "ask" : "declined"}
            onAllow={() => void start()}
            onNotNow={() => setFlow("declined")}
          />
        )}

        {!inCall && !stage.microphone && flow !== "explain" && (
          <div className="flex flex-wrap gap-2">
            {/* After Time is up there's no time left to resume with (R13). */}
            {!stage.timeUp && (
              <Button onClick={begin}>{problem === NO_RECONNECT ? "Try again" : sessionId ? "Resume conversation" : "Start conversation"}</Button>
            )}
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

      <div className="flex flex-col gap-6">
        <MyStylingNotes
          notes={notes.notes}
          preferences={preferences}
          paused={notes.paused}
          open={notebookOpen}
          onOpenChange={setNotebookOpen}
          onTouch={notes.touch}
          holdAnnouncements={someoneSpeaking(stage)}
          titleRef={notebookTitle}
        />
        {children}
      </div>

      {inCall && !stageInView && (
        <PinnedBar
          stylistVideo={video}
          label={label}
          muted={stage.muted}
          muteDisabled={flow !== "live"}
          onMute={toggleMute}
          summary={notesSummary(notes.notes)}
          onShowNotes={showNotes}
        />
      )}
    </>
  );
}
