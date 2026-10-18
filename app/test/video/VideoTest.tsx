"use client";

import { useRef, useState } from "react";
import Daily, { type DailyCall } from "@daily-co/daily-js";

// Phase 0 throwaway test page: start a Tavus call, show the stylist in our own frame,
// print live words with timings, and try the three controls (notes, scripted line, interrupt).

type Line = { at: number; who: string; text: string; final: boolean };

const SAMPLE_NOTES =
  "Shopper's confirmed notes: Occasion: summer wedding guest. Budget: up to $500. Sizes: dress 8, shoe 7. Never: high heels.";
const SCRIPTED_LINE = "I'm switching to voice only, so I'll sound a little different.";

export default function VideoTest() {
  const [passcode, setPasscode] = useState("");
  const [status, setStatus] = useState("Not started");
  const [lines, setLines] = useState<Line[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [active, setActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const convRef = useRef<string | null>(null);
  const t0 = useRef(0);

  const since = () => Math.round(performance.now() - t0.current);
  const note = (text: string) => setLog((l) => [`${(since() / 1000).toFixed(2)}s  ${text}`, ...l].slice(0, 80));

  function send(event_type: string, properties?: Record<string, unknown>) {
    const call = callRef.current;
    if (!call || !convRef.current) return;
    call.sendAppMessage(
      { message_type: "conversation", event_type, conversation_id: convRef.current, properties },
      "*",
    );
    note(`sent ${event_type}`);
  }

  async function start() {
    t0.current = performance.now();
    setLines([]);
    setLog([]);
    setStatus("Asking our server to start a call…");
    const res = await fetch("/api/test/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(
        res.status === 401
          ? "Wrong passcode"
          : `Tavus refused the call (${data.tavusStatus}): ${data.tavusMessage ?? data.error}`,
      );
      note(`start failed: ${res.status}`);
      return;
    }
    note("server created the call");
    convRef.current = data.conversationId;

    const call = Daily.createCallObject({ startVideoOff: true, startAudioOff: false });
    callRef.current = call;
    call.on("track-started", (e) => {
      if (!e?.participant || e.participant.local || !e.track) return;
      const stream = new MediaStream([e.track]);
      if (e.track.kind === "video" && videoRef.current) {
        videoRef.current.srcObject = stream;
        note("stylist video arrived");
        setStatus("Live");
      }
      if (e.track.kind === "audio" && audioRef.current) {
        audioRef.current.srcObject = stream;
        audioRef.current.play().catch(() => note("audio needs another tap"));
        note("stylist audio arrived");
      }
    });
    call.on("app-message", (e) => {
      const m = e?.data;
      if (!m?.event_type) return;
      const p = m.properties ?? {};
      if (m.event_type === "conversation.utterance.streaming") {
        const who = p.role === "user" ? "You" : "Stylist";
        setLines((ls) => {
          const rest = ls.filter((l) => !(l.who === who && !l.final));
          return [...rest, { at: since(), who, text: p.speech ?? "", final: !!p.final }].slice(-40);
        });
      } else if (m.event_type === "conversation.utterance") {
        if (p.role === "user") note(`final words from you: "${p.speech}"`);
      } else if (
        m.event_type === "conversation.started_speaking" ||
        m.event_type === "conversation.stopped_speaking"
      ) {
        note(`${p.role} ${m.event_type.endsWith("started_speaking") ? "started" : "stopped"} speaking`);
      } else {
        note(m.event_type);
      }
    });
    call.on("left-meeting", () => {
      setStatus("Call ended");
      setActive(false);
    });
    call.on("error", (e) => note(`call error: ${e?.errorMsg ?? "unknown"}`));

    setStatus("Joining the call…");
    await call.join({ url: data.conversationUrl });
    note("joined the call");
    setActive(true);
  }

  async function end() {
    await callRef.current?.leave();
    await callRef.current?.destroy();
    callRef.current = null;
    if (convRef.current) {
      await fetch("/api/test/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, conversationId: convRef.current }),
      });
      note("asked Tavus to end the call");
    }
    convRef.current = null;
    setActive(false);
    setStatus("Call ended");
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Video stylist test</h1>
      <p style={{ margin: 0 }}>Phase 0 test page. Each call uses Tavus minutes, so end it when you finish.</p>

      {!active && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="password"
            placeholder="Passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            style={{ padding: 10, fontSize: 16, flex: "1 1 160px" }}
          />
          <button onClick={start} disabled={!passcode} style={btn}>
            Start
          </button>
        </div>
      )}

      <p style={{ margin: 0 }}>
        <strong>Status:</strong> {status}
      </p>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", aspectRatio: "16 / 9", background: "#c9cfd6", borderRadius: 12 }}
      />
      <audio ref={audioRef} autoPlay />

      {active && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn} onClick={() => send("conversation.overwrite_llm_context", { context: SAMPLE_NOTES })}>
            Send notes
          </button>
          <button
            style={btn}
            onClick={() => send("conversation.echo", { modality: "text", text: SCRIPTED_LINE, done: true })}
          >
            Say scripted line
          </button>
          <button style={btn} onClick={() => send("conversation.interrupt")}>
            Interrupt
          </button>
          <button style={{ ...btn, background: "#b42318" }} onClick={end}>
            End call
          </button>
        </div>
      )}

      <section>
        <h2 style={{ fontSize: 18 }}>Live words</h2>
        {lines.map((l, i) => (
          <p key={i} style={{ margin: "4px 0", opacity: l.final ? 1 : 0.7 }}>
            <code>{(l.at / 1000).toFixed(2)}s</code> <strong>{l.who}:</strong> {l.text}
          </p>
        ))}
      </section>

      <section>
        <h2 style={{ fontSize: 18 }}>Event log</h2>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{log.join("\n")}</pre>
      </section>
    </main>
  );
}

const btn = {
  padding: "10px 16px",
  fontSize: 16,
  borderRadius: 10,
  border: 0,
  background: "#0b6b4f",
  color: "#fff",
} as const;
