"use client";

import { type RefObject, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { engineFor } from "@/connectors/conversation/client";
import type { ConversationEngine, ConversationEvent } from "@/connectors/conversation/types";
import { checkMicrophone, microphoneAllowed } from "@/lib/microphone";
import { type MicrophoneProblem, nextStage, READY, stageLabel, timeLeftLabel } from "@/lib/stage";

// The conversation's life on the session screen (R6 to R8, R12 to R14): starting a call (the
// microphone first), the stage's state, time left and Time is up, a dropped call started again by
// itself, pausing when the page is left, and End. Split out of the styling session in the Phase 2
// review (Sabine's answer to A), so the camera (Phase 3) and voice only (6c) can join it cleanly. The
// notes hear the call's events through `hooks`.

export type Flow = "idle" | "explain" | "declined" | "starting" | "live" | "ending";

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

/**
 * Tells the server the call is over: End closes the session, keep pauses it so it can be resumed. A
 * stopped call names itself, so a message delayed by a bad connection can't end the call that
 * replaced it after a reconnect (review batch 1).
 */
function endOnServer(sessionId: string, keep: boolean, beacon = false, callId?: string) {
  const url = `/api/sessions/${sessionId}/end`;
  const body = JSON.stringify({ keep, callId });
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

export type ConversationHooks = {
  /** Every event from the call (the notes read the shopper's words). */
  onEvent: (e: ConversationEvent) => void;
  /** A tapped phrase or quick reply, sent as if spoken. */
  onPhrase: (text: string) => void;
  /** End: the session's notes are cleared. */
  onEnd: () => void;
};

/** Where the stylist's video and voice play: elements the screen renders. */
export type CallMedia = { video: RefObject<HTMLVideoElement | null>; audio: RefObject<HTMLAudioElement | null> };

export function useConversation(openSessionId: string | null, media: CallMedia, onHooks: ConversationHooks) {
  const { video, audio } = media;
  // The latest hooks, so events from a call started a while ago reach this render's notes.
  const hooks = useRef(onHooks);
  useLayoutEffect(() => {
    hooks.current = onHooks;
  });
  const [flow, setFlow] = useState<Flow>("idle");
  const [stage, dispatch] = useReducer(nextStage, READY);
  const [sessionId, setSessionId] = useState(openSessionId);
  const [problem, setProblem] = useState<string | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const engine = useRef<ConversationEngine | null>(null);
  const live = useRef<{ sessionId: string; callId: string; ending: boolean } | null>(null);
  const shown = useRef(false);
  // R13: when the call's time runs out, and which limit ends it. R14: each Start, End or Try again
  // starts a new attempt, so a dropped call's retries stop when the shopper does something else.
  const callEnds = useRef<{ at: number; because: Limit } | null>(null);
  const attempt = useRef(0);
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [timeUpMessage, setTimeUpMessage] = useState<string | null>(null);
  // Leaving the page (Next.js hides it rather than closing it) or closing the tab pauses the
  // session, so the call doesn't run on unseen and the shopper can resume within 30 minutes.
  useLayoutEffect(() => {
    shown.current = true;
    const onPageHide = () => {
      if (live.current) void endOnServer(live.current.sessionId, true, true, live.current.callId);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      shown.current = false;
      window.removeEventListener("pagehide", onPageHide);
      const current = live.current;
      if (current) {
        current.ending = true;
        void engine.current?.leave();
        void endOnServer(current.sessionId, true, false, current.callId);
      }
      live.current = null;
      engine.current = null;
      setFlow("idle");
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
    void endOnServer(current.sessionId, true, false, current.callId);
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
    hooks.current.onEvent(e);
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
    live.current = { sessionId: data.sessionId, callId: data.call.callId, ending: false };
    const stopListening = e.on(onEvent);
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
      // Leave the call that couldn't join, so the next try can make a new one (Phase 2 review).
      stopListening();
      await e.leave();
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
    hooks.current.onPhrase(text);
    dispatch({ type: "phrase-sent" });
  }

  /**
   * A line the stylist answers as if the shopper said it, kept out of the notes: after a photo is read
   * she names the item and asks about it (Q1 in 3b).
   */
  function prompt(text: string) {
    if (!engine.current) return;
    engine.current.sendPhrase(text);
    dispatch({ type: "phrase-sent" });
  }

  /** An exact line the stylist says, such as asking before a saved preference is broken (5c, R57). */
  function say(line: string) {
    engine.current?.say(line);
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
    hooks.current.onEnd();
    setProblem(null);
    setSoundBlocked(false);
    setFlow("idle");
    dispatch({ type: "stopped" });
  }

  return {
    flow,
    stage,
    label: stageLabel(stage),
    sessionId,
    problem,
    /** A dropped call couldn't be brought back: the button reads Try again (R14). */
    lostConnection: problem === NO_RECONNECT,
    timeLeft: flow === "live" ? timeLeft : null,
    timeUpMessage: stage.timeUp ? timeUpMessage : null,
    soundBlocked,
    begin,
    start,
    end,
    toggleMute,
    sendPhrase,
    prompt,
    say,
    explainMicrophone: (declined: boolean) => setFlow(declined ? "declined" : "explain"),
    turnOnSound: () =>
      audio.current?.play().then(
        () => setSoundBlocked(false),
        () => undefined,
      ),
    updateContext: (context: string) => engine.current?.updateContext(context),
  };
}
