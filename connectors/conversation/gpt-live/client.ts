import type { ConversationEngine, ConversationEvent, ConversationListener } from "../types";
import { createTurns } from "./turns";

// The GPT-Live voice-only stylist, browser side (6c; R9, tech spec 4.2). A WebRTC call: the microphone
// goes up, her voice comes down, and a data channel carries the words and the commands. The offer goes
// to our server (the join URL), which creates the call with OpenAI and returns only the answer; OpenAI
// limits this channel to context, exact lines, mute and close (Sabine's answer to Q3).

/** The longest context sent at once. */
const MAX_CONTEXT = 8000;

export function createGptLiveEngine(): ConversationEngine {
  const listeners = new Set<ConversationListener>();
  const emit = (event: ConversationEvent) => listeners.forEach((l) => l(event));
  const turns = createTurns(emit);
  let peer: RTCPeerConnection | null = null;
  let channel: RTCDataChannel | null = null;
  let mic: MediaStream | null = null;
  let remote: MediaStreamTrack | null = null;
  let audio: HTMLAudioElement | null = null;
  let ended = false;
  let counter = 0;

  function play() {
    if (!audio || !remote) return;
    audio.srcObject = new MediaStream([remote]);
    audio.play().catch(() => emit({ type: "error", message: "audio_blocked" }));
  }

  function send(event: Record<string, unknown>) {
    if (channel?.readyState !== "open") return;
    channel.send(JSON.stringify({ ...event, event_id: `p${++counter}` }));
  }

  /** The call is over, whoever ended it: said once, as Tavus's engine does. */
  function over() {
    if (ended) return;
    ended = true;
    turns.flush();
    emit({ type: "connection", state: "ended" });
  }

  function cleanup() {
    mic?.getTracks().forEach((t) => t.stop());
    channel?.close();
    peer?.close();
    mic = null;
    channel = null;
    peer = null;
  }

  function onMessage(raw: string) {
    let e: { type?: string; delta?: string; error?: { code?: string; message?: string } };
    try {
      e = JSON.parse(raw);
    } catch {
      return;
    }
    if (e.type === "session.input_transcript.delta") turns.heard("shopper", String(e.delta ?? ""));
    else if (e.type === "session.output_transcript.delta") turns.heard("stylist", String(e.delta ?? ""));
    else if (e.type === "session.closed") over();
    else if (e.type === "error") emit({ type: "error", message: e.error?.code ?? "voice_error" });
  }

  return {
    async join(target) {
      ended = false;
      emit({ type: "connection", state: "connecting" });
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        emit({ type: "microphone", problem: name === "NotAllowedError" ? "blocked" : name === "NotFoundError" ? "missing" : "failed" });
        throw e;
      }
      const pc = new RTCPeerConnection();
      peer = pc;
      for (const track of mic.getAudioTracks()) {
        track.addEventListener("ended", () => !ended && emit({ type: "microphone", problem: "failed" }));
        pc.addTrack(track, mic);
      }
      pc.addEventListener("track", (e) => {
        remote = e.track;
        play();
      });
      pc.addEventListener("connectionstatechange", () => {
        if (pc.connectionState === "disconnected") emit({ type: "connection", state: "reconnecting" });
        if (pc.connectionState === "connected") emit({ type: "connection", state: "connected" });
        if (pc.connectionState === "failed" || pc.connectionState === "closed") over();
      });
      const chan = pc.createDataChannel("oai-events");
      channel = chan;
      chan.addEventListener("message", (m) => onMessage(String(m.data)));
      const started = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("the voice call didn't start")), 15_000);
        chan.addEventListener("message", (m) => {
          if (String(m.data).includes('"session.started"')) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      try {
        await pc.setLocalDescription(await pc.createOffer());
        // All candidates in the offer: the server sends it to OpenAI once.
        if (pc.iceGatheringState !== "complete") {
          await new Promise<void>((resolve) => {
            const done = () => pc.iceGatheringState === "complete" && resolve();
            pc.addEventListener("icegatheringstatechange", done);
            setTimeout(resolve, 3000);
          });
        }
        const res = await fetch(target.joinUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callId: target.callId, sdp: pc.localDescription?.sdp }),
        });
        const answer = (await res.json().catch(() => null)) as { sdp?: string; callId?: string } | null;
        if (!res.ok || !answer?.sdp || !answer.callId) throw new Error("the voice call couldn't be created");
        await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });
        await started;
        emit({ type: "connection", state: "connected" });
        return { callId: answer.callId };
      } catch (e) {
        ended = true;
        cleanup();
        throw e;
      }
    },

    async leave() {
      if (!peer) return;
      send({ type: "session.close" });
      cleanup();
      over();
    },

    setMuted(muted) {
      mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
      send({ type: muted ? "session.input_audio.mute" : "session.input_audio.unmute" });
    },
    // Talking over her stops her (R7): GPT-Live does that by itself.
    interrupt() {},
    sendPhrase: (text) =>
      send({ type: "session.instructions.append", delegation_id: null, content: `The shopper just said: "${text}". Reply to it naturally, as if they had said it aloud.` }),
    updateContext: (context) =>
      send({ type: "session.thinking.append", delegation_id: null, content: `What the app knows now (this replaces anything it told you before):\n${context.slice(0, MAX_CONTEXT)}` }),
    say: (line) => send({ type: "session.instructions.append", delegation_id: null, content: `Immediately say exactly, and nothing else: ${line}` }),

    attach(elements) {
      audio = elements.audio;
      play();
    },

    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
