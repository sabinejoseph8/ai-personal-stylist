"use client";

import { useRef, useState } from "react";

// Phase 0 throwaway test page for the camera reader: one back-camera frame every
// 2 seconds goes to our server, which names the item. Nothing is stored.

const MODELS = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
  { id: "claude-opus-5-5", label: "Opus 5.5" },
];

type Result = { at: number; name: string; model: string; totalMs: number; serverMs: number };

export default function CameraTest() {
  const [passcode, setPasscode] = useState("");
  const [model, setModel] = useState(MODELS[0].id);
  const [status, setStatus] = useState("Camera off");
  const [on, setOn] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loop = useRef<ReturnType<typeof setInterval> | null>(null);
  const busy = useRef(false);
  const offTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modelRef = useRef(model);
  const t0 = useRef(0);

  async function sendFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (busy.current || !video || !canvas || !video.videoWidth) return;
    busy.current = true;
    const scale = 640 / Math.max(video.videoWidth, video.videoHeight);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
    const sent = performance.now();
    try {
      const res = await fetch("/api/test/camera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, image, model: modelRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(res.status === 401 ? "Wrong passcode" : `Error: ${data.error ?? res.status}`);
        stop();
        return;
      }
      setResults((r) =>
        [
          {
            at: (sent - t0.current) / 1000,
            name: data.name,
            model: data.model,
            totalMs: Math.round(performance.now() - sent),
            serverMs: data.serverMs,
          },
          ...r,
        ].slice(0, 40),
      );
    } finally {
      busy.current = false;
    }
  }

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      t0.current = performance.now();
      setOn(true);
      setStatus("Camera on: hold an item up to the camera");
      loop.current = setInterval(sendFrame, 2000);
      if (offTimer.current) clearTimeout(offTimer.current);
      offTimer.current = setTimeout(stop, 120_000); // the camera turns off after 2 minutes (R35)
    } catch (err) {
      setStatus(`Camera not available: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function stop() {
    if (loop.current) clearInterval(loop.current);
    if (offTimer.current) clearTimeout(offTimer.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setOn(false);
    setStatus("Camera off");
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", display: "grid", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Camera test</h1>
      <p style={{ margin: 0 }}>
        One frame every 2 seconds is named by Claude, then thrown away. The camera turns off after 2 minutes.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          type="password"
          placeholder="Passcode"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          style={{ padding: 10, fontSize: 16, flex: "1 1 160px" }}
        />
        <select
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            modelRef.current = e.target.value;
          }}
          style={{ padding: 10, fontSize: 16 }}
        >
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        {on ? (
          <button onClick={stop} style={{ ...btn, background: "#b42318" }}>
            Turn camera off
          </button>
        ) : (
          <button onClick={start} disabled={!passcode} style={btn}>
            Turn camera on
          </button>
        )}
      </div>

      <p style={{ margin: 0 }}>
        <strong>Status:</strong> {status}
      </p>
      <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: 12, background: "#c9cfd6" }} />
      <canvas ref={canvasRef} hidden />

      {results[0] && (
        <p style={{ margin: 0, fontSize: 22 }}>
          <strong>{results[0].name}</strong>
        </p>
      )}

      <section>
        <h2 style={{ fontSize: 18 }}>Results</h2>
        {results.map((r, i) => (
          <p key={i} style={{ margin: "4px 0", fontSize: 14 }}>
            <code>{r.at.toFixed(1)}s</code> {r.name} — <strong>{(r.totalMs / 1000).toFixed(1)}s</strong> in total (
            {(r.serverMs / 1000).toFixed(1)}s for Claude, {r.model.includes("haiku") ? "Haiku" : "Opus"})
          </p>
        ))}
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
