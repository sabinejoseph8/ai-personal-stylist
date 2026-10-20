import type { ConversationEvent } from "@/connectors/conversation/types";

// The stylist stage's state in words (R8, design 4.1), worked out from the conversation's events.
// Pure rules, so every state has a test. Voice only arrives in 6c.

export type StageLabel =
  | "Ready"
  | "Connecting"
  | "Listening"
  | "Thinking"
  | "Speaking"
  | "Muted"
  | "Reconnecting"
  | "Microphone needed"
  | "Time is up"
  | "Ended";

export type MicrophoneProblem = "blocked" | "missing" | "failed";

export type Stage = {
  connection: "idle" | "connecting" | "connected" | "reconnecting" | "ended";
  stylistSpeaking: boolean;
  /** The shopper is talking right now: screen reader updates wait until they stop (R68). */
  shopperSpeaking: boolean;
  /** The shopper finished speaking (or tapped a phrase) and she hasn't started answering yet. */
  awaitingReply: boolean;
  muted: boolean;
  microphone: MicrophoneProblem | null;
  /** The shopper has spoken or tapped a phrase: the sample phrases go away (R70). */
  shopperHasSpoken: boolean;
  /** The day's (or month's) conversation time ran out and the call ended (R13). */
  timeUp: boolean;
};

export const READY: Stage = {
  connection: "idle",
  stylistSpeaking: false,
  shopperSpeaking: false,
  awaitingReply: false,
  muted: false,
  microphone: null,
  shopperHasSpoken: false,
  timeUp: false,
};

/** What the screen itself does, besides the call's events. */
export type StageAction =
  | ConversationEvent
  | { type: "starting" }
  | { type: "muted"; muted: boolean }
  | { type: "phrase-sent" }
  | { type: "stopped" }
  | { type: "time-up" };

export function nextStage(stage: Stage, action: StageAction): Stage {
  switch (action.type) {
    case "starting":
      return { ...READY, connection: "connecting" };
    case "stopped":
      return { ...READY, connection: "ended" };
    case "time-up":
      return { ...READY, connection: "ended", timeUp: true };
    case "connection":
      if (action.state === "ended") return { ...stage, connection: "ended", stylistSpeaking: false, shopperSpeaking: false, awaitingReply: false };
      return { ...stage, connection: action.state };
    case "stylist-speaking":
      return { ...stage, stylistSpeaking: action.speaking, awaitingReply: false };
    case "shopper-speaking":
      // Talking over her stops her at once (R7): the stage goes straight to Listening.
      return action.speaking
        ? { ...stage, stylistSpeaking: false, shopperSpeaking: true, awaitingReply: false, shopperHasSpoken: true }
        : { ...stage, shopperSpeaking: false, awaitingReply: true };
    case "words":
      return action.speaker === "shopper" ? { ...stage, shopperHasSpoken: true } : stage;
    case "phrase-sent":
      return { ...stage, awaitingReply: true, shopperHasSpoken: true };
    case "muted":
      return { ...stage, muted: action.muted };
    case "microphone":
      return { ...stage, microphone: action.problem };
    default:
      return stage;
  }
}

export function stageLabel(stage: Stage): StageLabel {
  if (stage.microphone) return "Microphone needed";
  if (stage.timeUp) return "Time is up";
  switch (stage.connection) {
    case "idle":
      return "Ready";
    case "connecting":
      return "Connecting";
    case "reconnecting":
      return "Reconnecting";
    case "ended":
      return "Ended";
  }
  if (stage.stylistSpeaking) return "Speaking";
  if (stage.muted) return "Muted";
  if (stage.awaitingReply) return "Thinking";
  return "Listening";
}

/** The sample phrases show once she's connected and before the shopper first speaks (R70). */
export const showSamplePhrases = (stage: Stage) =>
  stage.connection === "connected" && !stage.shopperHasSpoken && !stage.microphone;

/** Someone is talking, so screen reader updates wait (R68: never over the conversation). */
export const someoneSpeaking = (stage: Stage) => stage.stylistSpeaking || stage.shopperSpeaking;

/** Time left, shown in the last 2 minutes (R13): "2 minutes left", then "1 minute left". */
export function timeLeftLabel(secondsLeft: number): string | null {
  if (secondsLeft > 120 || secondsLeft <= 0) return null;
  const minutes = Math.ceil(secondsLeft / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"} left`;
}
