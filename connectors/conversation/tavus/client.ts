import Daily, { type DailyCall, type DailyEventObjectAppMessage } from "@daily-co/daily-js";
import type { ConversationEngine, ConversationEvent, ConversationListener } from "../types";

// The Tavus video stylist, browser side: joins the call through Daily and turns Tavus's messages
// into connector events. Load it with a dynamic import, because Daily only runs in a browser.

type TavusMessage = { message_type?: string; event_type?: string; properties?: Record<string, unknown> };

export function createTavusEngine(): ConversationEngine {
  const listeners = new Set<ConversationListener>();
  let call: DailyCall | null = null;
  let callId = "";
  let ended = false;
  const media: { video: HTMLVideoElement | null; audio: HTMLAudioElement | null } = { video: null, audio: null };
  const tracks: { video: MediaStreamTrack | null; audio: MediaStreamTrack | null } = { video: null, audio: null };

  const emit = (event: ConversationEvent) => listeners.forEach((l) => l(event));

  function show() {
    if (media.video && tracks.video) media.video.srcObject = new MediaStream([tracks.video]);
    if (media.audio && tracks.audio) {
      media.audio.srcObject = new MediaStream([tracks.audio]);
      media.audio.play().catch(() => emit({ type: "error", message: "audio_blocked" }));
    }
  }

  function send(event_type: string, properties?: Record<string, unknown>) {
    if (!call || ended) return;
    call.sendAppMessage({ message_type: "conversation", event_type, conversation_id: callId, properties }, "*");
  }

  function onMessage(e: DailyEventObjectAppMessage | undefined) {
    const m = e?.data as TavusMessage | undefined;
    if (m?.message_type !== "conversation" || !m.event_type) return;
    const p = m.properties ?? {};
    const role = String(p.role ?? "");
    const speaker = role === "user" || m.event_type.includes(".user.") ? "shopper" : "stylist";
    const turnId = String(p.turn_idx ?? p.inference_id ?? "");
    if (m.event_type === "conversation.utterance.streaming") {
      emit({ type: "words", speaker, text: String(p.speech ?? ""), final: Boolean(p.final), turnId });
    } else if (m.event_type === "conversation.utterance") {
      emit({ type: "words", speaker, text: String(p.speech ?? ""), final: true, turnId });
    } else if (m.event_type.endsWith("started_speaking") || m.event_type.endsWith("stopped_speaking")) {
      const speaking = m.event_type.endsWith("started_speaking");
      emit(speaker === "shopper" ? { type: "shopper-speaking", speaking } : { type: "stylist-speaking", speaking });
    }
  }

  return {
    async join(target) {
      callId = target.callId;
      ended = false;
      emit({ type: "connection", state: "connecting" });
      // avoidEval loads Daily's call code as a script, which the site's security policy allows.
      call = Daily.createCallObject({ startVideoOff: true, startAudioOff: false, dailyConfig: { avoidEval: true } });
      call.on("track-started", (e) => {
        if (!e?.participant || e.participant.local || !e.track) return;
        if (e.track.kind === "video") tracks.video = e.track;
        if (e.track.kind === "audio") tracks.audio = e.track;
        show();
      });
      call.on("app-message", onMessage);
      call.on("network-connection", (e) => {
        if (e?.event === "interrupted") emit({ type: "connection", state: "reconnecting" });
        if (e?.event === "connected") emit({ type: "connection", state: "connected" });
      });
      call.on("left-meeting", () => {
        if (ended) return;
        ended = true;
        emit({ type: "connection", state: "ended" });
      });
      call.on("error", (e) => emit({ type: "error", message: e?.errorMsg ?? "call_error" }));
      await call.join({ url: target.joinUrl });
      emit({ type: "connection", state: "connected" });
    },

    async leave() {
      const current = call;
      call = null;
      if (!current) return;
      await current.leave().catch(() => undefined);
      await current.destroy().catch(() => undefined);
      if (!ended) {
        ended = true;
        emit({ type: "connection", state: "ended" });
      }
    },

    setMuted(muted) {
      call?.setLocalAudio(!muted);
    },
    interrupt: () => send("conversation.interrupt"),
    sendPhrase: (text) => send("conversation.respond", { text }),
    updateContext: (context) => send("conversation.overwrite_llm_context", { context }),
    say: (line) => send("conversation.echo", { modality: "text", text: line, done: true }),

    attach(elements) {
      media.video = elements.video;
      media.audio = elements.audio;
      show();
    },

    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
