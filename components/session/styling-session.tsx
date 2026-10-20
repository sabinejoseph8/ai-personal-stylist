"use client";

import { type ButtonHTMLAttributes, type ReactNode, type Ref, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MyStylingNotes } from "@/components/notebook/my-styling-notes";
import { PhotoThumbnail, StyleAroundThisItem } from "@/components/notebook/pasted-photo";
import { PinnedBar } from "@/components/session/pinned-bar";
import { useConversation } from "@/components/session/use-conversation";
import { type ShownNote, useNotes } from "@/components/session/use-notes";
import { type ShownPhoto, usePhotos } from "@/components/session/use-photos";
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/ui/icons";
import { PermissionCard } from "@/components/ui/permission-card";
import { notesSummary } from "@/lib/notebook";
import { SAMPLE_PHRASES } from "@/lib/sample-phrases";
import { type MicrophoneProblem, showSamplePhrases, someoneSpeaking } from "@/lib/stage";

// The styling session (design 4.1, 4.2, 5.3 and 5.6). The stylist stage (R6 to R8, R70): the video
// stylist with her state in words, Mute and End, the microphone card, and tap-to-try phrases, with no
// captions, transcript or message box (R10, R11). Camera (Phase 3) and Voice only (6c) join the
// controls when they exist. Then My Styling Notes (2d), with the photo to style around (3a), which
// takes the second column on desktops, and the pinned bar on phones once the stylist scrolls out of
// view. The call itself runs in use-conversation.ts, the notes in use-notes.ts and the photos in
// use-photos.ts.

const MICROPHONE_HELP: Record<MicrophoneProblem, string> = {
  // Browsers apply a changed microphone setting only after the page reloads (found on Sabine's iPhone in 2f).
  blocked:
    "Allow the microphone for this site, then reload the page. On an iPhone, tap aA in Safari's address bar, then Website Settings, then Microphone, then Allow. On a computer, use the microphone icon in the address bar. Your notes are kept.",
  missing: "No microphone was found. Connect one, then try again.",
  failed: "Your microphone isn't working. Check that no other app is using it, then try again.",
};

/** What she hears when a photo has been read: her context then says what's in it and what to ask. */
const PHOTO_ADDED = "I've added a photo of something I'd like to style around.";

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
  preferences,
  children,
}: {
  openSessionId: string | null;
  initialNotes?: ShownNote[];
  initialPhotos?: ShownPhoto[];
  /** Saved preferences in words, shown at the top of the notebook (R24). */
  preferences: string[];
  /** Shown under the notebook: what the profile says (Sabine's answer to Q2 in 2d). */
  children?: ReactNode;
}) {
  // The call, and the notes it feeds: the shopper's words go to the notes reader, a tapped phrase is
  // read as if spoken, and End clears the notes.
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const call = useConversation(openSessionId, { video, audio }, {
    onEvent: (e) => notes.onEvent(e),
    onPhrase: (text) => notes.say(text),
    onEnd: () => {
      notes.reset();
      photos.reset();
    },
  });
  // The item to style around (3a), and what the photo reader makes of it (3b). The stylist is told
  // every change, and speaks up once a new photo is read (Sabine's answer to Q1 in 3b).
  const speakUp = useRef<string | null>(null);
  const photos = usePhotos(call.sessionId, initialPhotos, {
    onContext: (context) => call.updateContext(context),
    onRead: (key) => (speakUp.current = key),
  });
  // My Styling Notes (2c, 2d): words go to the server, notes and the next question come back, and the
  // stylist is told every change, including Confirm and Remove by touch. What the shopper says about
  // the photo comes back too (3b).
  const notes = useNotes(
    call.sessionId,
    call.flow === "live",
    initialNotes,
    (context) => call.updateContext(context),
    (id, item) => photos.setItem(id, item),
  );
  const [notebookOpen, setNotebookOpen] = useState(true);
  const notebookTitle = useRef<HTMLHeadingElement>(null);
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

  // She speaks up about a newly read photo once nobody is talking, if it's still the one to style around.
  const quiet = flow === "live" && !someoneSpeaking(stage);
  useEffect(() => {
    const key = speakUp.current;
    if (!key || !quiet) return;
    speakUp.current = null;
    if (photos.active?.key === key) call.prompt(PHOTO_ADDED);
  });
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
            className={`type-label absolute right-3 top-3 m-0 rounded-pill bg-ink/70 px-3 py-1 text-white ${call.timeLeft ? "" : "sr-only"}`}
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
          styleAround={
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
              onConfirm={photos.confirm}
              onChooseItem={photos.chooseItem}
              onOwnership={photos.setOwnership}
            />
          }
          thumbnail={photos.active && <PhotoThumbnail photo={photos.active} />}
        />
        {children}
      </div>

      {inCall && !stageInView && (
        <PinnedBar
          stylistVideo={video}
          label={label}
          muted={stage.muted}
          muteDisabled={flow !== "live"}
          onMute={call.toggleMute}
          summary={notesSummary(notes.notes)}
          onShowNotes={showNotes}
        />
      )}
    </>
  );
}
