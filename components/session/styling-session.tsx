"use client";

import { type ButtonHTMLAttributes, type ReactNode, type Ref, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BehindTheScenesSource } from "@/components/behind/behind-the-scenes";
import { LooksArea } from "@/components/looks/looks-area";
import { type LooksEvent, useLooks } from "@/components/looks/use-looks";
import { FromYourWardrobe } from "@/components/notebook/from-wardrobe";
import { MyStylingNotes } from "@/components/notebook/my-styling-notes";
import { PhotoThumbnail, StyleAroundThisItem } from "@/components/notebook/pasted-photo";
import { CameraAnnouncer, CameraView } from "@/components/session/camera-view";
import { PinnedBar } from "@/components/session/pinned-bar";
import { CAMERA_MESSAGES, useCamera } from "@/components/session/use-camera";
import { useConversation } from "@/components/session/use-conversation";
import { type ShownNote, useNotes } from "@/components/session/use-notes";
import { type ShownPhoto, usePhotos } from "@/components/session/use-photos";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/ui/icons";
import { PermissionCard } from "@/components/ui/permission-card";
import { useToast } from "@/components/ui/toast";
import type { ShownWardrobeItem } from "@/lib/wardrobe";
import { asksToCapture, CAPTURE_GRACE_MS, type CameraNote, cameraForStylist, whenToCapture } from "@/core/camera/sightings";
import { looksChanged, looksForStylist } from "@/core/looks/context";
import { askingHint, asksAboutIt, exceptionsForStylist, type FirmPreference, type ShownException, spokenQuestion } from "@/core/looks/exceptions";
import { ALLOW_CHOICE } from "@/core/looks/no-match";
import type { ShownItem, ShownLook } from "@/core/looks/shown";
import type { SwapRequest } from "@/core/notes/reader";
import { notesSummary } from "@/lib/notebook";
import { MAX_PHOTOS, PHOTO_MESSAGES } from "@/lib/photos";
import { SAMPLE_PHRASES } from "@/lib/sample-phrases";
import { holdFor, type MicrophoneProblem, showSamplePhrases, someoneSpeaking } from "@/lib/stage";

// The styling session (design 4.1, 4.2, 5.3 and 5.6). The stylist stage (R6 to R8, R70): the video
// stylist with her state in words, Mute and End, the microphone card, and tap-to-try phrases, with no
// captions, transcript or message box (R10, R11). Camera (Phase 3) and Voice only (6c) join the
// controls when they exist. Then My Styling Notes (2d), with the photo to style around (3a), which
// takes the second column on desktops, and the pinned bar on phones once the stylist scrolls out of
// view. Then the looks (4c): the third column on desktops, the second on tablets, last on phones. The
// call itself runs in use-conversation.ts, the notes in use-notes.ts, the photos in use-photos.ts and
// the looks in use-looks.ts.

const MICROPHONE_HELP: Record<MicrophoneProblem, string> = {
  // Browsers apply a changed microphone setting only after the page reloads (found on Sabine's iPhone in 2f).
  blocked:
    "Allow the microphone for this site, then reload the page. On an iPhone, tap aA in Safari's address bar, then Website Settings, then Microphone, then Allow. On a computer, use the microphone icon in the address bar. Your notes are kept.",
  missing: "No microphone was found. Connect one, then try again.",
  failed: "Your microphone isn't working. Check that no other app is using it, then try again.",
};

/** What she hears when a photo has been read: her context then says what's in it and what to ask. */
const PHOTO_ADDED = "I've added a photo of something I'd like to style around.";
/** What she hears when the camera names something (3c), or can't be used: her context says the rest. */
const ON_CAMERA = "I'm holding something up to my camera.";
const NO_CAMERA = "My camera won't turn on.";
/** What she hears when new looks appear, or after a change brings them up to date (4c, R44): her context
 *  lists them and says what changed, and she presents them in her own words (Sabine's answer to Q4). */
const LOOKS_NEW = "Can you walk me through the looks you've put together?";
const LOOKS_UPDATED = "What changed in my looks?";
/** After a Keep or Change tap, the looks wait this long, so several taps make one revision (Q1 in 5b). */
const TAP_WAIT_MS = 2000;
/** How long to wait for the stylist's own reply before the app asks the question for her (fix plan 3). */
const BACKUP_WAIT_MS = 6000;
const tapWaitEnds = () => Date.now() + TAP_WAIT_MS;
/** Now, from event handlers (outside the component, for the purity rule). */
const timeNow = () => Date.now();

/** The gap between two lines she's asked to speak up about, when nobody has spoken in between. */
const SPEAK_UP_GAP_MS = 5000;
/** After she asks the shopper something, how long their answer is waited for before she speaks up (5c fix 6). */
const ANSWER_WAIT_MS = 12_000;

/** Something she speaks up about once nobody is talking. */
/** `say`: the stylist says `text` word for word, rather than answering it as the shopper's words (5c). */
/** `preference`: the saved preference an "exception" line asks about, so it's never said for another (review batch 2, A7). */
type SpeakUp = { kind: "photo" | "camera" | "looks" | "exception"; text: string; photo?: string; say?: boolean; preference?: string };

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
  initialPhotos = [],
  wardrobe = [],
  preferences,
  children,
}: {
  openSessionId: string | null;
  initialNotes?: ShownNote[];
  initialPhotos?: ShownPhoto[];
  /** Wardrobe items chosen with Style with these (3d). */
  wardrobe?: ShownWardrobeItem[];
  /** Saved preferences in words, shown at the top of the notebook (R24). */
  preferences: string[];
  /** Shown under the notebook: what the profile says (Sabine's answer to Q2 in 2d). */
  children?: ReactNode;
}) {
  // The call, and the notes it feeds: the shopper's words go to the notes reader, a tapped phrase is
  // read as if spoken, and End clears the notes.
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  // Set once the looks exist, further down.
  const resetLooks = useRef<(() => void) | null>(null);
  const swapBySpeech = useRef<((swap: SwapRequest) => void) | null>(null);
  // A request that breaks a saved preference (5c). Set after every render, so it sees the call as it is
  // now: set once, it saw the call before it started, and never asked the stylist to speak up (found on
  // Sabine's iPhone in 5c, A.3).
  const askException = useRef<((preference: FirmPreference) => void) | null>(null);
  // What End clears besides the notes, photos and looks: set after every render, like askException below.
  const clearForNextCall = useRef<(() => void) | null>(null);
  const askingNow = useRef<(FirmPreference & { wanted?: boolean }) | null>(null);
  // What the stylist has said since the shopper last finished speaking, and whether a back-up question
  // is still waiting for her reply (fix plan 3: one question, never two in a row).
  const stylistReplies = useRef<string[]>([]);
  // When she last asked the shopper something they haven't answered yet, or 0 (5c fix 6).
  const askedAt = useRef(0);
  const backup = useRef<{ question: string; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const settleBackup = useRef<((said: string | null) => void) | null>(null);
  // The last question she asked: the notes reader is told she just asked about a preference only while
  // that's her latest question (review batch 2, B10).
  const herLastQuestion = useRef<string | null>(null);
  // Her "what changed" line has been said, so the shopper's next turn clears it from her context (review batch 2, A12).
  const changeSaid = useRef(false);
  // The look most on screen, sent with the words for feedback that doesn't name a look (5a).
  const inViewNow = useRef<number | null>(null);
  const looksShownNow = useRef(false);
  // What changed in the looks, for her context until she has said it (4c; cleared on the shopper's next turn, review batch 2, A12).
  const [looksChange, setLooksChange] = useState<string | null>(null);
  const call = useConversation(openSessionId, { video, audio }, {
    onEvent: (e) => {
      notes.onEvent(e);
      if (e.type === "words" && e.final) {
        if (e.speaker === "shopper") {
          stylistReplies.current = [];
          askedAt.current = 0;
          if (changeSaid.current) {
            changeSaid.current = false;
            setLooksChange(null);
          }
        } else {
          stylistReplies.current.push(e.text);
          if (e.text.includes("?")) {
            askedAt.current = timeNow();
            herLastQuestion.current = e.text;
          }
          settleBackup.current?.(e.text);
        }
      }
      // "Use this one" takes the still, heard by plain code while an item is on camera (Q1 in 3c).
      if (e.type === "words" && e.speaker === "shopper" && asksToCapture(e.text, e.final)) heardCapture.current?.();
    },
    // A tapped phrase or quick reply is the shopper's turn, as spoken words are: her reply from before the
    // tap mustn't count as her answer to what the tap raises (review batch 2, A6).
    onPhrase: (text) => {
      stylistReplies.current = [];
      askedAt.current = 0;
      notes.say(text);
    },
    onEnd: () => {
      notes.reset();
      photos.reset();
      resetLooks.current?.();
      clearForNextCall.current?.();
    },
  });
  // What the stylist is told: the server's latest context, plus the looks on screen (4c) and what's on
  // camera (3c), which only the page knows: which look is in view, and frames are thrown away.
  const told = useRef("");
  const looksTold = useRef("");
  // "This session only" exceptions and a request she should ask about (5c), which only the page knows.
  const exceptionsTold = useRef("");
  const cameraNote = useRef<CameraNote>(null);
  const withCamera = () => [told.current, exceptionsTold.current, looksTold.current, cameraForStylist(cameraNote.current)].filter(Boolean).join("\n");
  const tell = (context: string) => {
    told.current = context;
    call.updateContext(withCamera());
  };
  // Things she speaks up about once nobody is talking: a newly read photo (Q1 in 3b), only if it's still
  // the one to style around, and what's on camera (3c).
  // One of each kind waits, the newest of its kind: a looks update no longer pushes out a photo that's
  // waiting to be named (Phase 4 code review). She takes them one quiet moment at a time.
  const speakUp = useRef<SpeakUp[]>([]);
  const queue = (line: SpeakUp) => (speakUp.current = [...speakUp.current.filter((l) => l.kind !== line.kind), line]);
  // A render to look at the waiting lines again (a timer, or a line queued with nothing else changing).
  const [, recheck] = useState(0);

  // The item to style around (3a), and what the photo reader makes of it (3b).
  const photos = usePhotos(call.sessionId, initialPhotos, {
    onContext: tell,
    onRead: (key) => queue({ kind: "photo", text: PHOTO_ADDED, photo: key }),
  });
  // My Styling Notes (2c, 2d): words go to the server, notes and the next question come back, and the
  // stylist is told every change, including Confirm and Remove by touch. What the shopper says about
  // the photo comes back too (3b).
  const notes = useNotes(
    call.sessionId,
    call.flow === "live",
    initialNotes,
    tell,
    (id, item) => photos.setItem(id, item),
    (swap) => swapBySpeech.current?.(swap),
    () => ({ any: looksShownNow.current, inView: inViewNow.current }),
    (preference) => askException.current?.(preference),
    {
      now: () => askingHint(askingNow.current?.id ?? null, herLastQuestion.current),
      wanted: () => Boolean(askingNow.current?.wanted),
      // A spoken yes or no to her question does what the buttons do (5c).
      answered: (answer) => {
        if (answer.exceptions) setExceptions(answer.exceptions);
        // A spoken no is Keep my preference: she's told so (review batch 2, A8).
        if (!answer.allow && askingNow.current?.id === answer.preferenceId) keepPreference(askingNow.current);
        setAsking(null);
      },
    },
  );

  // "This session only" exceptions (5c, R57): the card asks, as the stylist does, before a saved Must
  // have or Never is broken. Allowed ones are jotted in the notebook and stop limiting this session's looks.
  const [exceptions, setExceptions] = useState<ShownException[]>([]);
  // `wanted`: the shopper asked for it, so allowing it jots it too (fix plan 3, Q1).
  const [asking, setAsking] = useState<(FirmPreference & { wanted?: boolean }) | null>(null);
  const [savedPreferences, setSavedPreferences] = useState(preferences);
  // Permissions taken back with Remove, so she's told they no longer hold (fix plan 7).
  const [takenBack, setTakenBack] = useState<FirmPreference[]>([]);
  // Preferences kept when she asked (Keep my preference, or a spoken no), so she's told the answer was no
  // rather than left waiting for it (review batch 2, A8).
  const [kept, setKept] = useState<FirmPreference[]>([]);
  const keepPreference = (p: FirmPreference) => setKept((k) => [...k.filter((x) => x.id !== p.id), { id: p.id, kind: p.kind, words: p.words }]);
  const exceptionsNow = useRef<ShownException[]>([]);
  useLayoutEffect(() => {
    exceptionsNow.current = exceptions;
    askingNow.current = asking;
    askException.current = (preference) => {
      if (exceptions.some((e) => e.id === preference.id)) return;
      askingNow.current = { ...preference, wanted: true };
      setAsking(askingNow.current);
      if (call.flow !== "live") return;
      // She asks in her own reply, with the words she's given. The app says the question only if her
      // reply doesn't ask, or she says nothing for 6 seconds (fix plan 3, found on Sabine's iPhone in 5c).
      const question = spokenQuestion(preference);
      if (backup.current?.timer) clearTimeout(backup.current.timer);
      backup.current = { question, timer: null };
      const replied = stylistReplies.current;
      herLastQuestion.current = replied.filter((l) => l.includes("?")).at(-1) ?? null;
      if (replied.some(asksAboutIt)) settleBackup.current?.(replied.find(asksAboutIt)!);
      else if (replied.length) settleBackup.current?.(replied.at(-1)!);
      else if (backup.current) backup.current.timer = setTimeout(() => settleBackup.current?.(null), BACKUP_WAIT_MS);
    };
    // End clears everything else the page holds for the call, so nothing carries into the next session: the
    // conflict card, the back-up question, queued lines, her replies and what she's been told (review batch 2, A4).
    clearForNextCall.current = () => {
      if (backup.current?.timer) clearTimeout(backup.current.timer);
      backup.current = null;
      speakUp.current = [];
      stylistReplies.current = [];
      askedAt.current = 0;
      herLastQuestion.current = null;
      changeSaid.current = false;
      told.current = "";
      looksTold.current = "";
      exceptionsTold.current = "";
      cameraNote.current = null;
      askingNow.current = null;
      setAsking(null);
      setKept([]);
      setExceptions([]);
      setTakenBack([]);
      setLooksChange(null);
    };
    // Her reply arrived (or none did): only when it doesn't ask is the question said, once.
    settleBackup.current = (said) => {
      const waiting = backup.current;
      if (!waiting) return;
      if (waiting.timer) clearTimeout(waiting.timer);
      backup.current = null;
      if (said && asksAboutIt(said)) return;
      if (!askingNow.current) return;
      queue({ kind: "exception", text: waiting.question, say: true, preference: askingNow.current.id });
      // Nothing on screen changed, so the line waiting to be said needs a nudge.
      recheck((n) => n + 1);
    };
  });
  useEffect(() => {
    const id = call.sessionId;
    if (!id) return;
    let current = true;
    fetch(`/api/sessions/${id}/exceptions`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { exceptions?: ShownException[] } | null) => {
        if (!current) return;
        setExceptions(body?.exceptions ?? []);
        // A new session starts with nothing taken back.
        setTakenBack([]);
      })
      .catch(() => null);
    return () => {
      current = false;
    };
  }, [call.sessionId]);
  async function allowException(preference: FirmPreference & { wanted?: boolean }) {
    const id = call.sessionId;
    if (!id) return false;
    const res = await fetch(`/api/sessions/${id}/exceptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferenceId: preference.id, wanted: Boolean(preference.wanted) }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { exceptions?: ShownException[]; notes?: Parameters<typeof notes.receive>[0] } | null;
    if (!res?.ok || !body?.exceptions) {
      toast("That didn't save. Try again.");
      return false;
    }
    setExceptions(body.exceptions);
    setKept((k) => k.filter((p) => p.id !== preference.id));
    // What they asked for, now jotted, so the looks change to include it.
    if (body.notes) notes.receive(body.notes);
    setAsking(null);
    return true;
  }
  async function changeException(exception: ShownException, action: "remove" | "save") {
    const id = call.sessionId;
    if (!id) return false;
    const res = await fetch(action === "remove" ? `/api/sessions/${id}/exceptions/${exception.id}` : `/api/sessions/${id}/exceptions/${exception.id}/save`, {
      method: action === "remove" ? "DELETE" : "POST",
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { exceptions?: ShownException[]; preferences?: string[]; notes?: Parameters<typeof notes.receive>[0] } | null;
    if (!res?.ok || !body?.exceptions) {
      toast("That didn't save. Try again.");
      return false;
    }
    setExceptions(body.exceptions);
    if (action === "remove") setTakenBack((t) => [...t.filter((p) => p.id !== exception.id), { id: exception.id, kind: exception.kind, words: exception.words }]);
    if (body.preferences) setSavedPreferences(body.preferences);
    // Remove takes back what was asked for with it (fix plan 3).
    if (body.notes) notes.receive(body.notes);
    return true;
  }

  // The looks (4c): asked for again whenever what they must meet may have changed: the notes and whether
  // they're confirmed (R39), the item to style around once it's known whose it is, and the wardrobe
  // items chosen to style with. Not while a photo uploads or is read: that changes nothing yet.
  const inputs = useMemo(
    () =>
      JSON.stringify([
        notes.notes.map((n) => [n.id, n.text, n.status]),
        photos.active?.id && photos.active.item?.ownership ? [photos.active.id, photos.active.version, photos.active.item] : null,
        wardrobe.map((w) => w.id),
        exceptions.map((e) => e.id),
      ]),
    [notes.notes, photos.active, wardrobe, exceptions],
  );
  // When the looks may ask again after a Keep or Change tap (TAP_WAIT_MS).
  const tapHold = useRef(0);
  const looks = useLooks(
    call.sessionId,
    inputs,
    (e: LooksEvent) => {
    if (e.kind === "swapped") {
      setLooksChange(`Just swapped in Look ${e.number}: ${e.look.items[e.index].name}, checked against their preferences.`);
      return;
    }
    if (e.kind === "restored") {
      setLooksChange(
        `Look ${e.number} is back to ${e.undo ? "how it was before their last feedback" : "an earlier version they chose in Compare"}, checked against their preferences first. Say so in a few words.`,
      );
      return;
    }
    setLooksChange(e.kind === "updated" ? looksChanged(e.before, e.looks) : null);
    if (call.flow === "live") queue({ kind: "looks", text: e.kind === "new" ? LOOKS_NEW : LOOKS_UPDATED });
    },
    () => tapHold.current,
  );
  // The look most on screen, for a spoken swap that doesn't say which (Sabine's answer to Q2 in 4c).
  const [lookInView, setLookInView] = useState<number | null>(null);
  useLayoutEffect(() => {
    looksShownNow.current = looks.looks.length > 0;
    resetLooks.current = looks.reset;
    swapBySpeech.current = (swap) => {
      const look = looks.looks[(swap.look || lookInView || 0) - 1];
      // No look named or on screen: she asks which one (her context says so).
      if (!look) return;
      const index = look.items.findIndex((i) => i.group === swap.piece && !i.owned);
      if (index >= 0) void looks.swap(look.id, index);
    };
  });
  // Keep and Change (5a): what the notes say about each item, with a tap shown at once while it saves.
  const [pressing, setPressing] = useState<Record<string, "keep" | "change" | null>>({});
  const feedbackFor = (look: ShownLook, item: ShownItem) => {
    const key = `${look.id} ${item.id}`;
    if (key in pressing) return pressing[key];
    const said = notes.notes.filter((n) => n.feedback?.look === look.slot && n.feedback.items.includes(item.id) && (n.feedback.act === "keep" || n.feedback.act === "change"));
    return (said.at(-1)?.feedback?.act as "keep" | "change" | undefined) ?? null;
  };
  // Taps are saved in the order they're made, so the last one wins: a quick Keep then Change could
  // otherwise arrive the other way round (found in 5b's browser tests).
  const taps = useRef<Promise<unknown>>(Promise.resolve());
  const lastTap = useRef<Record<string, number>>({});
  async function giveFeedback(look: ShownLook, index: number, act: "keep" | "change", on: boolean) {
    const id = call.sessionId;
    const key = `${look.id} ${look.items[index].id}`;
    if (!id) return;
    tapHold.current = tapWaitEnds();
    const mine = (lastTap.current[key] ?? 0) + 1;
    lastTap.current[key] = mine;
    setPressing((p) => ({ ...p, [key]: on ? act : null }));
    const save = taps.current.then(async () => {
      const res = await fetch(`/api/sessions/${id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookId: look.id, index, act, on }),
      });
      if (!res.ok) throw new Error(String(res.status));
      notes.receive(await res.json());
    });
    taps.current = save.catch(() => undefined);
    try {
      await save;
    } catch {
      toast("That didn't save. Try again.");
    } finally {
      // The tile shows what was tapped until the newest tap on it is saved.
      if (lastTap.current[key] === mine)
        setPressing((p) => {
          const next = { ...p };
          delete next[key];
          return next;
        });
    }
  }
  /** The look's number on screen for a place, for feedback headings in the notebook (5a). */
  const lookNumber = (slot: number) => {
    const n = looks.looks.findIndex((l) => l.slot === slot);
    return n >= 0 ? n + 1 : null;
  };

  /** The shopper's own pieces show their own photos. */
  const imageFor = (item: ShownItem) =>
    (item.kind === "photo" ? photos.photos.find((p) => p.id === item.id)?.thumbnailUrl : wardrobe.find((w) => w.id === item.id)?.thumbnailUrl) ?? null;

  const [notebookOpen, setNotebookOpen] = useState(true);
  const notebookTitle = useRef<HTMLHeadingElement>(null);

  // The camera (3c): she names what's shown, and Capture or "use this one" adds a still to the notes.
  const camera = useCamera(call.sessionId, call.flow === "live", {
    onSeen: (seen) => {
      if (!seen) return;
      queue({ kind: "camera", text: ON_CAMERA });
      if (seen.kind === "item") namedOnCamera.current?.();
    },
    onUnavailable: () => queue({ kind: "camera", text: NO_CAMERA }),
  });
  const toast = useToast();
  const pickPhoto = useRef<(() => void) | null>(null);
  // One still at a time: "use this one" arrives in several pieces as it's heard.
  const capturing = useRef(false);
  const captureWaitsUntil = useRef(0);
  async function capture() {
    if (capturing.current) return;
    capturing.current = true;
    try {
      const file = await camera.capture();
      if (!file) return;
      // Five photos already, or the server refuses it: the camera stays on and the notebook says why,
      // rather than "Photo added" with the camera off (review batch 5, D4).
      if (photos.photos.length >= MAX_PHOTOS) {
        toast(PHOTO_MESSAGES.full);
        return;
      }
      if (!(await photos.add(file, "camera"))) return;
      // The still is now the item, so the camera turns off (Sabine's answer to Q2 in 3c).
      camera.stop();
      setNotebookOpen(true);
      toast("Photo added to your notes");
    } finally {
      capturing.current = false;
    }
  }
  const heardCapture = useRef<(() => void) | null>(null);
  const namedOnCamera = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    // "Use this one" said just before the name appeared.
    namedOnCamera.current = () => {
      if (captureWaitsUntil.current <= Date.now()) return;
      captureWaitsUntil.current = 0;
      void capture();
    };
    heardCapture.current = () => {
      const when = whenToCapture(Date.now(), { on: camera.state === "on", itemShown: camera.seen?.kind === "item", lastItemAt: camera.lastItemAt() });
      if (when === "now") void capture();
      if (when === "wait") captureWaitsUntil.current = Date.now() + CAPTURE_GRACE_MS;
    };
  });
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmEndPaused, setConfirmEndPaused] = useState(false);
  // Leaving the page closes any open End dialog (Next.js keeps the page's state while it's hidden).
  useLayoutEffect(
    () => () => {
      setConfirmEnd(false);
      setConfirmEndPaused(false);
    },
    [],
  );

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

  const { flow, stage, label } = call;

  // As a call starts she's told everything so far: notes, preferences, the photo and the wardrobe items
  // chosen to style with (3d), rather than waiting for the first change.
  const sessionId = call.sessionId;
  const live = flow === "live";
  useEffect(() => {
    if (!live || !sessionId) return;
    let current = true;
    void fetch(`/api/sessions/${sessionId}/context`)
      .then((res) => (res.ok ? (res.json() as Promise<{ context?: string }>) : null))
      .then((answer) => {
        if (current && answer?.context) tell(answer.context);
      })
      .catch(() => null);
    return () => {
      current = false;
    };
    // tell only reads refs; this runs as each call starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, sessionId]);

  // She's told about the looks whenever they change, before she's asked to present them.
  const looksBusy = looks.phase === "building" || looks.phase === "checking";
  useEffect(() => {
    const feedback = notes.notes.filter((n) => n.feedback && n.feedback.look);
    looksTold.current = looksForStylist({
      looks: looks.looks,
      building: looksBusy,
      needs: looks.needs,
      noMatch: looks.noMatch,
      inView: lookInView,
      changed: looksChange,
      revising: looks.revising.flatMap((slot) => lookNumber(slot) ?? []),
      feedback: feedback.map((n) => ({ look: lookNumber(n.feedback!.look), text: n.text, confirmed: n.status === "confirmed" })),
    });
    if (flow === "live") call.updateContext(withCamera());
    // withCamera and call only read refs; this runs when the looks change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [looks.looks, looksBusy, looks.needs, looks.noMatch, lookInView, looksChange, looks.revising, flow, notes.notes]);

  // She's told the exceptions allowed, and a request to ask about, whenever they change (5c).
  useEffect(() => {
    exceptionsTold.current = exceptionsForStylist(exceptions, asking, takenBack, kept);
    if (flow === "live") call.updateContext(withCamera());
    // withCamera and call only read refs; this runs when the exceptions change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exceptions, asking, takenBack, kept, flow]);

  // She's told what's on camera whenever it changes, before she's asked to speak about it.
  useEffect(() => {
    cameraNote.current =
      camera.state === "on" ? { seen: camera.seen, blocked: false } : camera.state === "blocked" || camera.state === "missing" ? { seen: null, blocked: true } : null;
    if (flow === "live") call.updateContext(withCamera());
    // withCamera and call only read refs; this runs when the camera changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera.state, camera.seen]);

  // She speaks up once nobody is talking, one line at a time: the next once someone has spoken, or after
  // a few quiet seconds, so two lines never arrive together.
  const talking = flow !== "live" || someoneSpeaking(stage);
  const spokeUpAt = useRef(0);
  // When she started thinking of her reply to the shopper, so a line waits for it (review batch 2, A5).
  const thinkingSince = useRef(0);
  useEffect(() => {
    thinkingSince.current = stage.awaitingReply ? thinkingSince.current || Date.now() : 0;
  }, [stage.awaitingReply]);
  useEffect(() => {
    if (talking) {
      spokeUpAt.current = 0;
      return;
    }
    if (!speakUp.current.length) return;
    // Not in the gap between the shopper's question and her reply, or she answers the app instead of them.
    const wait = Math.max(holdFor(stage, thinkingSince.current, Date.now()), spokeUpAt.current + SPEAK_UP_GAP_MS - Date.now());
    if (wait > 0) {
      const timer = setTimeout(() => recheck((n) => n + 1), wait);
      return () => clearTimeout(timer);
    }
    // After she asks the shopper something, her looks line waits for the answer: sent at the first pause, it
    // had her talk straight on (found on Sabine's iPhone in 5c: "What heel height?", then on to the looks).
    // A photo or the camera is the shopper's own doing, so she speaks about it at once.
    const answerWait = askedAt.current ? askedAt.current + ANSWER_WAIT_MS - Date.now() : 0;
    const ready = (l: SpeakUp) => l.kind !== "looks" || answerWait <= 0;
    // A photo replaced meanwhile isn't spoken about.
    while (speakUp.current.length) {
      // While her question waits for the shopper's answer, nothing else is said: a line said for the
      // shopper, such as "Can you walk me through the looks…?" once the looks arrived, had her answer
      // "Absolutely, should I allow it?" (found on Sabine's iPhone in 5c). The rest waits its turn.
      const next = askingNow.current ? speakUp.current.find((l) => l.kind === "exception") : speakUp.current.find(ready);
      if (!next) {
        if (answerWait <= 0 || askingNow.current) return;
        const timer = setTimeout(() => recheck((n) => n + 1), answerWait);
        return () => clearTimeout(timer);
      }
      speakUp.current = speakUp.current.filter((l) => l !== next);
      if (next.photo && photos.active?.key !== next.photo) continue;
      // A question already answered isn't asked, nor one about a preference other than the one being asked
      // about now (review batch 2, A7).
      if (next.kind === "exception" && (!askingNow.current || (next.preference && next.preference !== askingNow.current.id))) continue;
      spokeUpAt.current = Date.now();
      if (next.kind === "looks") changeSaid.current = true;
      if (next.say) call.say(next.text);
      else call.prompt(next.text);
      return;
    }
  });
  const inCall = flow === "starting" || flow === "live" || flow === "ending";
  const showVideo = inCall && !stage.microphone;

  return (
    <>
      <section aria-labelledby="stage-title" className="flex flex-col gap-4 tablet:col-start-1">
        <h2 id="stage-title" className="sr-only">
          Your stylist
        </h2>

        {/* Phones: a portrait frame before the conversation, then a head-and-shoulders band (design 4.1). */}
        <div
          ref={frame}
          className={`relative w-full overflow-hidden rounded-panel bg-ink shadow-photo desktop:aspect-[4/5] ${
            inCall ? (camera.on ? "aspect-[4/5] tablet:aspect-[3/2]" : "aspect-[3/2]") : "aspect-[4/5] max-w-md"
          }`}
        >
          {/* Phones: while the camera is on, the stylist shrinks to a circle in the corner (design 4.1). */}
          <video
            ref={video}
            autoPlay
            playsInline
            muted
            className={`object-cover ${showVideo ? "" : "hidden"} ${
              camera.on
                ? "absolute bottom-3 right-3 z-10 size-20 rounded-pill border-2 border-page tablet:static tablet:size-full tablet:rounded-none tablet:border-0"
                : "h-full w-full"
            }`}
          />
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
          {camera.on && <CameraView video={camera.video} facing={camera.facing} seen={camera.seen} />}
          <p aria-live="polite" className="type-label absolute left-3 top-3 z-10 m-0 rounded-pill bg-ink/70 px-3 py-1 text-white">
            {label}
          </p>
          {/* Time left, in the last 2 minutes (R13). Always there, so screen readers hear it change. */}
          <p
            role="status"
            className={`type-label absolute right-3 top-3 z-10 m-0 rounded-pill bg-ink/70 px-3 py-1 text-white ${call.timeLeft ? "" : "sr-only"}`}
          >
            {call.timeLeft}
          </p>
        </div>

        {/* Quick replies (R19): the next question's options, answered as if spoken. */}
        {flow === "live" && notes.question && notes.question.options.length > 0 && (
          <div role="group" aria-label={`Quick replies: ${notes.question.text}`} className="flex flex-wrap gap-2">
            {notes.question.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  notes.clearQuestion();
                  call.sendPhrase(option);
                }}
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
              onClick={call.toggleMute}
              disabled={flow !== "live"}
            />
            <ControlButton
              icon="camera"
              label={camera.on ? "Camera on" : "Camera"}
              pressed={camera.on}
              onClick={() => (camera.on ? camera.stop() : void camera.begin())}
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
              onConfirm={call.end}
            />
          </div>
        )}

        {camera.on && (
          <div className="flex flex-wrap items-center justify-center gap-2 desktop:justify-start">
            {camera.seen?.kind === "item" && (
              <Button icon="capture" onClick={() => void capture()}>
                Capture
              </Button>
            )}
            {camera.canSwitch && (
              <Button variant="secondary" icon="switchCamera" onClick={camera.switchCamera}>
                Switch camera
              </Button>
            )}
            <Button variant="secondary" className="tablet:hidden" onClick={camera.stop}>
              Done showing
            </Button>
          </div>
        )}

        {camera.state === "explain" && <PermissionCard permission="camera" state="ask" onAllow={camera.allow} onNotNow={camera.notNow} />}
        {camera.message && (
          <div className="flex flex-col items-start gap-3">
            <Banner
              tone={camera.message === CAMERA_MESSAGES.blocked || camera.message === CAMERA_MESSAGES.missing ? "error" : undefined}
              title={camera.message}
            />
            {camera.message !== CAMERA_MESSAGES.timedOut && camera.message !== CAMERA_MESSAGES.allowance && (
              <Button variant="secondary" onClick={() => pickPhoto.current?.()}>
                Upload photo
              </Button>
            )}
          </div>
        )}
        <CameraAnnouncer seen={camera.seen} hold={someoneSpeaking(stage)} />

        {call.soundBlocked && (
          <Button variant="secondary" className="self-start" onClick={call.turnOnSound}>
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
                    onClick={() => call.sendPhrase(phrase)}
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
            {stage.microphone === "blocked" ? (
              <Button onClick={() => window.location.reload()}>Reload page</Button>
            ) : (
              <Button onClick={call.begin}>Try again</Button>
            )}
          </div>
        )}

        {call.problem && <Banner tone="error" title={call.problem} />}
        {call.timeUpMessage && <Banner title="Time is up">{call.timeUpMessage} Your notes stay here until you end the session.</Banner>}

        {(flow === "explain" || flow === "declined") && (
          <PermissionCard
            permission="microphone"
            state={flow === "explain" ? "ask" : "declined"}
            onAllow={() => void call.start()}
            onNotNow={() => call.explainMicrophone(true)}
          />
        )}

        {!inCall && !stage.microphone && flow !== "explain" && (
          <div className="flex flex-wrap gap-2">
            {/* After Time is up there's no time left to resume with (R13). */}
            {!stage.timeUp && (
              <Button onClick={call.begin}>{call.lostConnection ? "Try again" : call.sessionId ? "Resume conversation" : "Start conversation"}</Button>
            )}
            {call.sessionId && (
              <ConfirmDialog
                open={confirmEndPaused}
                onOpenChange={setConfirmEndPaused}
                trigger={<Button variant="secondary">End</Button>}
                title="End this session?"
                description="Notes you haven't saved will be cleared."
                confirmLabel="End session"
                cancelLabel="Keep talking"
                destructive
                onConfirm={call.end}
              />
            )}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-6 tablet:col-start-1 desktop:col-start-2">
        <MyStylingNotes
          notes={notes.notes}
          preferences={savedPreferences}
          exceptions={exceptions}
          onException={changeException}
          paused={notes.paused}
          open={notebookOpen}
          onOpenChange={setNotebookOpen}
          onTouch={notes.touch}
          lookNumber={lookNumber}
          holdAnnouncements={someoneSpeaking(stage)}
          titleRef={notebookTitle}
          styleAround={
            <>
            <StyleAroundThisItem
              photos={photos.photos}
              active={photos.active}
              canAdd={Boolean(call.sessionId)}
              problem={photos.problem}
              holdAnnouncements={someoneSpeaking(stage)}
              onAdd={photos.add}
              onReplace={photos.replace}
              onRemove={photos.remove}
              onChoose={photos.choose}
              onRetry={photos.retry}
              onLinkExpired={photos.refresh}
              pickRef={pickPhoto}
              onSave={photos.saveToWardrobe}
              onConfirm={photos.confirm}
              onChooseItem={photos.chooseItem}
              onOwnership={photos.setOwnership}
            />
            <FromYourWardrobe items={wardrobe} />
            </>
          }
          thumbnail={photos.active && <PhotoThumbnail photo={photos.active} />}
        />
        {/* Behind the scenes, beside Wardrobe, hears of each change to the notes and looks (4d). */}
        <BehindTheScenesSource sessionId={call.sessionId} changes={`${inputs}|${looks.phase}|${looks.looks.map((l) => l.id).join(",")}`}>
          {children}
        </BehindTheScenesSource>
      </div>

      <LooksArea
        className="tablet:col-start-2 tablet:row-span-2 tablet:row-start-2 desktop:col-start-3 desktop:row-span-1"
        sessionId={call.sessionId}
        restoring={looks.restoring}
        restoreNote={looks.restoreNote}
        onRestore={async (lookId, target) => {
          const answer = await looks.restore(lookId, target);
          // Undo takes back the feedback the revision answered: the notebook shows it gone.
          if (answer.ok && answer.notes) notes.receive(answer.notes as Parameters<typeof notes.receive>[0]);
          return answer.ok ? true : (answer.none ?? "That look couldn't be checked. Try again.");
        }}
        started={Boolean(call.sessionId)}
        looks={looks.looks}
        phase={looks.phase}
        needs={looks.needs}
        noMatch={looks.noMatch}
        problem={looks.problem}
        swapping={looks.swapping}
        fresh={looks.fresh}
        swapNote={looks.swapNote}
        revising={looks.revising}
        asking={asking}
        onAllow={() => (asking ? allowException(asking) : Promise.resolve(false))}
        onKeep={() => {
          if (asking) keepPreference(asking);
          setAsking(null);
        }}
        canTalk={flow === "live"}
        imageFor={imageFor}
        onSwap={(lookId, index) => void looks.swap(lookId, index)}
        feedbackFor={feedbackFor}
        onFeedback={(look, index, act, on) => void giveFeedback(look, index, act, on)}
        onTryAgain={looks.tryAgain}
        onChoice={(choice) => {
          // "Allow it for this session" asks with the card first (5c, R57).
          if (choice === ALLOW_CHOICE && looks.noMatch?.preference) setAsking(looks.noMatch.preference);
          else call.sendPhrase(choice);
        }}
        onInView={(n) => {
          inViewNow.current = n;
          setLookInView(n);
        }}
      />

      {inCall && !stageInView && (
        <PinnedBar
          stylistVideo={video}
          label={label}
          muted={stage.muted}
          muteDisabled={flow !== "live"}
          onMute={call.toggleMute}
          summary={notesSummary(notes.notes)}
          cameraOn={camera.on}
          onShowNotes={showNotes}
        />
      )}
    </>
  );
}
