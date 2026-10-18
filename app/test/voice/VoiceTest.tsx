"use client";

import { useRef, useState } from "react";

// Phase 0 throwaway test page for voice only (GPT-Live): live words with timings,
// feeding the stylist facts mid-call, the switch line, and choosing a voice.

const VOICES = ["marin", "gleam", "coral", "shimmer", "sage", "willow", "quartz", "delta"];
const SAMPLE_NOTES =
  "The shopper's confirmed notes: Occasion: summer wedding guest. Budget: up to $500. Sizes: dress 8, shoe 7. Never: high heels.";
const SWITCH_LINE = "I'm switching to voice only, so I'll sound a little different.";
const MAX_SECONDS = 300;

type Line = { at: number; who: string; text: string };

export default function VoiceTest() {
  const [passcode, setPasscode] = useState("");
  const [voice, setVoice] = useState("marin");
  const [status, setStatus] = useState("Not started");
  const [active, setActive] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const chanRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const t0 = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const since = () => Math.round(performance.now() - t0.current);
  const note = (text: string) => setLog((l) => [`${(since() / 1000).toFixed(2)}s  ${text}`, ...l].slice(0, 80));

  function addWords(who: string, delta: string) {
    setLines((ls) => {
      const last = ls.at(-1);
      if (last && last.who === who) return [...ls.slice(0, -1), { ...last, text: last.text + delta }];
      return [...ls, { at: since(), who, text: delta }].slice(-40);
    });
  }

  function send(type: string, content: string) {
    const chan = chanRef.current;
    if (!chan || chan.readyState !== "open") return;
    chan.send(JSON.stringify({ type, event_id: `e${++counter.current}`, delegation_id: null, content }));
    note(`sent ${type}`);
  }

  function cleanup() {
    if (timer.current) clearTimeout(timer.current);
    micRef.current?.getTracks().forEach((t) => t.stop());
    chanRef.current?.close();
    peerRef.current?.close();
    peerRef.current = null;
    chanRef.current = null;
    setActive(false);
  }

  async function start() {
    t0.current = performance.now();
    setLines([]);
    setLog([]);
    setStatus("Connecting…");
    try {
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      peer.addEventListener("track", (e) => {
        if (audioRef.current) {
          audioRef.current.srcObject = new MediaStream([e.track]);
          audioRef.current.play().catch(() => note("audio needs another tap"));
        }
        note("stylist audio arrived");
      });
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRef.current = mic;
      mic.getAudioTracks().forEach((t) => peer.addTrack(t, mic));

      const chan = peer.createDataChannel("oai-events");
      chanRef.current = chan;
      chan.addEventListener("message", ({ data }) => {
        const e = JSON.parse(data);
        if (e.type === "session.input_transcript.delta") addWords("You", e.delta);
        else if (e.type === "session.output_transcript.delta") addWords("Stylist", e.delta);
        else if (e.type === "session.started") {
          setStatus(`Live, voice ${voice}`);
          setActive(true);
          note("session started");
        } else if (e.type === "session.closed") {
          note(`session closed, ${e.usage?.seconds ?? "?"} seconds billed`);
          setStatus("Call ended");
          cleanup();
        } else if (e.type === "error") note(`error: ${e.error?.message ?? JSON.stringify(e).slice(0, 200)}`);
        else if (!e.type?.includes("usage")) note(e.type);
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      if (peer.iceGatheringState !== "complete") {
        await new Promise<void>((resolve) => {
          const done = () => peer.iceGatheringState === "complete" && resolve();
          peer.addEventListener("icegatheringstatechange", done);
          setTimeout(resolve, 5000);
        });
      }
      const res = await fetch("/api/test/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, voice, sdp: peer.localDescription?.sdp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(res.status === 401 ? "Wrong passcode" : `OpenAI refused the call (${data.status}): ${data.message}`);
        cleanup();
        return;
      }
      note("server created the session");
      await peer.setRemoteDescription({ type: "answer", sdp: data.sdp });
      timer.current = setTimeout(end, MAX_SECONDS * 1000);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
      cleanup();
    }
  }

  function end() {
    const chan = chanRef.current;
    if (chan?.readyState === "open") {
      chan.send(JSON.stringify({ type: "session.close" }));
      setStatus("Finishing the call…");
      setTimeout(cleanup, 15000);
    } else cleanup();
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Voice only test</h1>
      <p style={{ margin: 0 }}>Phase 0 test page for GPT-Live. Calls end on their own after 5 minutes.</p>

      {!active && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="password"
            placeholder="Passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            style={{ padding: 10, fontSize: 16, flex: "1 1 160px" }}
          />
          <select value={voice} onChange={(e) => setVoice(e.target.value)} style={{ padding: 10, fontSize: 16 }}>
            {VOICES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <button onClick={start} disabled={!passcode} style={btn}>
            Start
          </button>
        </div>
      )}

      <p style={{ margin: 0 }}>
        <strong>Status:</strong> {status}
      </p>
      <audio ref={audioRef} autoPlay />

      {active && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={btn} onClick={() => send("session.thinking.append", SAMPLE_NOTES)}>
            Send notes
          </button>
          <button
            style={btn}
            onClick={() =>
              send("session.instructions.append", `Immediately say exactly, and nothing else: ${SWITCH_LINE}`)
            }
          >
            Say switch line
          </button>
          <button style={{ ...btn, background: "#b42318" }} onClick={end}>
            End call
          </button>
        </div>
      )}

      <section>
        <h2 style={{ fontSize: 18 }}>Live words</h2>
        {lines.map((l, i) => (
          <p key={i} style={{ margin: "4px 0" }}>
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
