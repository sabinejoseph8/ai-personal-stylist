"use client";

import { useEffect, useRef, useState } from "react";
import Daily, { type DailyCall } from "@daily-co/daily-js";

// Phase 0 throwaway "full demo" page for the 0f test demos: Anna on video, jotted notes
// from the shopper's live words, the camera, and a cost meter. No captions and no typing
// (product spec 1.4). Notes are confirmed or removed by touch, with Undo for 5 seconds.

type Note = { key: string; kind: string; text: string; status: "to_confirm" | "confirmed" };
type Removed = { note: Note; until: number };

const TAVUS_PER_MINUTE = 22 / 120; // Starter plan: $22 for 120 minutes
// Clock reads happen only in event handlers and timers, never while rendering.
const clock = () => performance.now();
const wallClock = () => Date.now();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9$ ]/g, "").trim();

export default function DemoTest() {
  const [passcode, setPasscode] = useState("");
  const [status, setStatus] = useState("Not started");
  const [active, setActive] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);
  const [claudeUSD, setClaudeUSD] = useState(0);
  const [videoSeconds, setVideoSeconds] = useState(0);
  const [summary, setSummary] = useState<string | null>(null);
  const [counts, setCounts] = useState({ notesCalls: 0, frames: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const camRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const convRef = useRef<string | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const camLoop = useRef<ReturnType<typeof setInterval> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // Shopper's words: finished turns plus the turn in progress.
  const doneTurns = useRef<string[]>([]);
  const liveTurn = useRef("");
  const lastSent = useRef("");
  const version = useRef(0);
  const applied = useRef(0);
  const inFlight = useRef(false);
  const confirmedKeys = useRef(new Set<string>());
  const removedKeys = useRef(new Set<string>());
  const lastFrame = useRef<string | null>(null);
  const videoStart = useRef<number | null>(null);
  const claudeRef = useRef(0);
  const notesRef = useRef<Note[]>([]);
  const seenRef = useRef<string | null>(null);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const words = () => [...doneTurns.current, liveTurn.current].filter(Boolean).join(" ");
  const addCost = (usd: number) => {
    claudeRef.current += usd;
    setClaudeUSD(claudeRef.current);
  };

  // Tell Anna what's in the notebook, so she can use it and ask one useful question.
  function sendContext(list: Note[], item: string | null) {
    const call = callRef.current;
    if (!call || !convRef.current) return;
    const ink = list.filter((n) => n.status === "confirmed").map((n) => n.text);
    const pencil = list.filter((n) => n.status !== "confirmed").map((n) => n.text);
    const context = [
      "The shopper's styling notes so far.",
      ink.length ? `Confirmed: ${ink.join("; ")}.` : "",
      pencil.length ? `To confirm: ${pencil.join("; ")}.` : "",
      item ? `They are holding up: ${item}.` : "",
      "Use these notes. Ask about anything still to confirm, one question at a time.",
    ]
      .filter(Boolean)
      .join(" ");
    call.sendAppMessage(
      { message_type: "conversation", event_type: "conversation.overwrite_llm_context", conversation_id: convRef.current, properties: { context } },
      "*",
    );
  }

  async function readNotesNow() {
    const text = words();
    if (inFlight.current || !text || text === lastSent.current) return;
    inFlight.current = true;
    lastSent.current = text;
    const v = ++version.current;
    try {
      const res = await fetch("/api/test/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, words: text }),
      });
      if (!res.ok) return;
      const data = await res.json();
      addCost(data.costUSD ?? 0);
      setCounts((c) => ({ ...c, notesCalls: c.notesCalls + 1 }));
      if (v < applied.current) return; // a newer reading already landed (latest word wins)
      applied.current = v;
      const next: Note[] = (data.notes ?? [])
        .map((n: Omit<Note, "key">) => ({ ...n, key: norm(n.text) }))
        .filter((n: Note) => n.key && !removedKeys.current.has(n.key))
        .map((n: Note) => (confirmedKeys.current.has(n.key) ? { ...n, status: "confirmed" as const } : n));
      setNotes(next);
      sendContext(next, seenRef.current);
    } finally {
      inFlight.current = false;
    }
  }

  async function start() {
    setSummary(null);
    setNotes([]);
    doneTurns.current = [];
    liveTurn.current = "";
    lastSent.current = "";
    confirmedKeys.current.clear();
    removedKeys.current.clear();
    claudeRef.current = 0;
    setClaudeUSD(0);
    setVideoSeconds(0);
    setCounts({ notesCalls: 0, frames: 0 });
    setStatus("Starting Anna…");
    const res = await fetch("/api/test/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(res.status === 401 ? "Wrong passcode" : `Tavus refused the call: ${data.tavusMessage ?? data.error}`);
      return;
    }
    convRef.current = data.conversationId;
    const call = Daily.createCallObject({ startVideoOff: true, startAudioOff: false });
    callRef.current = call;
    call.on("track-started", (e) => {
      if (!e?.participant || e.participant.local || !e.track) return;
      const stream = new MediaStream([e.track]);
      if (e.track.kind === "video" && videoRef.current) {
        videoRef.current.srcObject = stream;
        if (videoStart.current === null) videoStart.current = clock();
        setStatus("Live: talk to Anna");
      }
      if (e.track.kind === "audio" && audioRef.current) {
        audioRef.current.srcObject = stream;
        audioRef.current.play().catch(() => setStatus("Tap the page to hear Anna"));
      }
    });
    call.on("app-message", (e) => {
      const m = e?.data;
      const p = m?.properties ?? {};
      if (m?.event_type === "conversation.utterance.streaming" && p.role === "user") {
        liveTurn.current = p.speech ?? "";
        if (p.final) {
          doneTurns.current.push(liveTurn.current);
          liveTurn.current = "";
        }
      } else if (m?.event_type === "conversation.utterance" && p.role === "user" && liveTurn.current) {
        doneTurns.current.push(liveTurn.current);
        liveTurn.current = "";
      }
    });
    call.on("left-meeting", () => finish("Call ended"));
    await call.join({ url: data.conversationUrl });
    setActive(true);
    tick.current = setInterval(() => {
      readNotesNow();
      if (videoStart.current !== null) setVideoSeconds(Math.round((clock() - videoStart.current) / 1000));
    }, 1000);
  }

  async function finish(reason: string) {
    if (tick.current) clearInterval(tick.current);
    stopCamera();
    const conv = convRef.current;
    convRef.current = null;
    await callRef.current?.leave().catch(() => {});
    await callRef.current?.destroy().catch(() => {});
    callRef.current = null;
    if (conv) {
      await fetch("/api/test/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, conversationId: conv }),
      }).catch(() => {});
    }
    setActive(false);
    setStatus(reason);
    const mins = videoStart.current === null ? 0 : (clock() - videoStart.current) / 60000;
    videoStart.current = null;
    setSummary(
      [
        `Video: ${mins.toFixed(1)} minutes (about $${(mins * TAVUS_PER_MINUTE).toFixed(2)} of the Tavus plan)`,
        `Claude (notes and camera): $${claudeRef.current.toFixed(3)}`,
        `Notes jotted: ${notesRef.current.length}, ${notesRef.current.filter((n) => n.status === "confirmed").length} confirmed`,
      ].join("\n"),
    );
  }

  function confirmNote(key: string) {
    confirmedKeys.current.add(key);
    const next = notes.map((n) => (n.key === key ? { ...n, status: "confirmed" as const } : n));
    setNotes(next);
    setOpen(null);
    sendContext(next, seenRef.current);
  }

  function removeNote(key: string) {
    const note = notes.find((n) => n.key === key);
    if (!note) return;
    removedKeys.current.add(key);
    const next = notes.filter((n) => n.key !== key);
    setNotes(next);
    setOpen(null);
    setRemoved({ note, until: wallClock() + 5000 });
    setTimeout(() => setRemoved((r) => (r && r.note.key === key && wallClock() >= r.until ? null : r)), 5100);
    sendContext(next, seenRef.current);
  }

  function undoRemove() {
    if (!removed) return;
    removedKeys.current.delete(removed.note.key);
    const next = [...notes, removed.note];
    setNotes(next);
    setRemoved(null);
    sendContext(next, seenRef.current);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      camStream.current = stream;
      if (camRef.current) {
        camRef.current.srcObject = stream;
        await camRef.current.play();
      }
      setCameraOn(true);
      lastFrame.current = null;
      camLoop.current = setInterval(sendFrame, 2000);
      setTimeout(stopCamera, 120_000); // off after 2 minutes (R35)
    } catch {
      setStatus("Camera not available");
    }
  }

  function stopCamera() {
    if (camLoop.current) clearInterval(camLoop.current);
    camStream.current?.getTracks().forEach((t) => t.stop());
    camStream.current = null;
    setCameraOn(false);
  }

  async function sendFrame() {
    const video = camRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    const scale = 640 / Math.max(video.videoWidth, video.videoHeight);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
    const res = await fetch("/api/test/camera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode, image, model: "claude-haiku-5-5" }),
    });
    if (!res.ok) return;
    const data = await res.json();
    addCost(data.costUSD ?? 0);
    setCounts((c) => ({ ...c, frames: c.frames + 1 }));
    const name = String(data.name ?? "").replace(/\.$/, "");
    const isItem = name && !/^no item/i.test(name) && name.split(" ").length <= 8;
    // Only name an item once two frames in a row agree, so one odd frame can't invent an item.
    if (isItem && lastFrame.current && norm(lastFrame.current) === norm(name) && norm(name) !== norm(seenRef.current ?? "")) {
      seenRef.current = name;
      setSeen(name);
      sendContext(notesRef.current, name);
    }
    lastFrame.current = isItem ? name : null;
  }

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", display: "grid", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Full demo test</h1>
      <p style={{ margin: 0 }}>Phase 0 test: Anna on video, jotted notes and the camera, with a cost meter. Calls end after 10 minutes.</p>

      {!active && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input type="password" placeholder="Passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} style={{ padding: 10, fontSize: 16, flex: "1 1 160px" }} />
          <button onClick={start} disabled={!passcode} style={btn}>Start</button>
        </div>
      )}
      <p style={{ margin: 0 }}>
        <strong>Status:</strong> {status}
      </p>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
        <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", aspectRatio: "16 / 9", background: "#c9cfd6", borderRadius: 12 }} />
          <audio ref={audioRef} autoPlay />
          {active && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {cameraOn ? (
                <button style={btnLight} onClick={stopCamera}>Camera off</button>
              ) : (
                <button style={btnLight} onClick={startCamera}>Show an item</button>
              )}
              <button style={{ ...btn, background: "#b42318" }} onClick={() => finish("Call ended")}>End call</button>
            </div>
          )}
          <video ref={camRef} playsInline muted style={{ width: cameraOn ? "40%" : 0, borderRadius: 8 }} />
          <canvas ref={canvasRef} hidden />
          {seen && <p style={{ margin: 0 }}>Item seen: <strong>{seen}</strong></p>}
        </div>

        <section style={notebook}>
          <h2 style={{ margin: "0 0 4px", fontFamily: "Georgia, serif", fontWeight: 500 }}>My Styling Notes</h2>
          <p style={{ margin: "0 0 8px", fontSize: 13, color: "#575e6a" }}>Tap a note to confirm or remove it. To change one, just say so.</p>
          {notes.length === 0 && <p style={{ color: "#575e6a", fontStyle: "italic" }}>Notes will appear as you talk.</p>}
          {notes.map((n) => (
            <div key={n.key} style={{ borderBottom: "1px solid #c8d7ea", padding: "6px 0" }}>
              <button onClick={() => setOpen(open === n.key ? null : n.key)} style={noteBtn}>
                <span style={{ fontFamily: "Georgia, serif", fontSize: 18, color: n.status === "confirmed" ? "#1f2a44" : "#575e6a", background: n.status === "confirmed" ? "transparent" : "#fff3c4", padding: "0 4px", borderRadius: 3 }}>
                  {n.text}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: n.status === "confirmed" ? "#0b6b4f" : "#575e6a" }}>
                  {n.status === "confirmed" ? "Confirmed" : "To confirm"}
                </span>
              </button>
              {open === n.key && (
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {n.status !== "confirmed" && <button style={btn} onClick={() => confirmNote(n.key)}>Confirm</button>}
                  <button style={btnLight} onClick={() => removeNote(n.key)}>Remove</button>
                </div>
              )}
            </div>
          ))}
          {removed && (
            <p style={{ margin: "8px 0 0" }}>
              Removed “{removed.note.text}”. <button style={btnLight} onClick={undoRemove}>Undo</button>
            </p>
          )}
        </section>
      </div>

      <section style={{ fontSize: 14, background: "#fff", borderRadius: 10, padding: 12 }}>
        <strong>Cost meter:</strong> video {Math.floor(videoSeconds / 60)}:{String(videoSeconds % 60).padStart(2, "0")} (about ${((videoSeconds / 60) * TAVUS_PER_MINUTE).toFixed(2)} of the Tavus plan) · Claude ${claudeUSD.toFixed(3)} · {counts.notesCalls} note readings · {counts.frames} camera frames
      </section>

      {summary && (
        <section style={{ background: "#e3f1ea", borderRadius: 10, padding: 12 }}>
          <strong>Demo summary (screenshot this):</strong>
          <pre style={{ whiteSpace: "pre-wrap", margin: "6px 0 0", fontFamily: "inherit" }}>{summary}</pre>
        </section>
      )}
    </main>
  );
}

const btn = { padding: "10px 16px", fontSize: 16, borderRadius: 10, border: 0, background: "#0b6b4f", color: "#fff" } as const;
const btnLight = { padding: "8px 14px", fontSize: 15, borderRadius: 10, border: "1px solid #7a818b", background: "#fff", color: "#1f2a44" } as const;
const noteBtn = { all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, width: "100%", alignItems: "baseline" } as const;
const notebook = { background: "#fff", borderRadius: 6, padding: "14px 16px 16px 40px", boxShadow: "0 1px 1px rgba(31,42,68,.08), 0 12px 24px -8px rgba(31,42,68,.2)", borderLeft: "1px solid #e8a1a6" } as const;
