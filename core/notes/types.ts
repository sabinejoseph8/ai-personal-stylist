// My Styling Notes (R15 to R22): the stylist's jotted notes. The stylist core never imports an outside
// service (tech spec 1.4): the notes reader gets Claude passed in.

/** "feedback" is a reaction to a look (5a), jotted under that look: see feedback.ts. */
export const KINDS = ["occasion", "timing", "colors", "style", "budget", "outfit", "owned_item", "fit", "other", "feedback"] as const;
export type NoteKind = (typeof KINDS)[number];
export type NoteStatus = "to_confirm" | "confirmed";
/** A hidden detail behind a note, for looks and checks, such as max=500 or month=november. */
export type Detail = { name: string; value: string };

export type Note = {
  id: string;
  kind: NoteKind;
  text: string;
  status: NoteStatus;
  details: Detail[];
  source: "voice" | "touch";
  /** The words request whose reading last changed this note, or the sequence a touch happened at (R22). */
  changedSeq: number;
  version: number;
  /** Removed notes stay on record, so a late reading never brings them back. */
  removed: boolean;
};

export type NewNote = { kind: NoteKind; text: string; status: NoteStatus; details: Detail[] };
export type NoteUpdate = { id: string; text: string; status: NoteStatus; details: Detail[] };
/** What a reading changed: notes to add, notes to update (by id) and notes to remove (by id). */
export type NoteChanges = { add: NewNote[]; update: NoteUpdate[]; remove: string[] };
export const NO_CHANGES: NoteChanges = { add: [], update: [], remove: [] };

/** The one useful question to ask next (R19), with buttons when it has clear options. */
export type NextQuestion = { text: string; options: string[] } | null;

/** At most 12 notes in a session, saved preferences and feedback not counted (Sabine, 2c; 5a). */
export const NOTE_CAP = 12;
/** At most this many feedback lines in a session, across its looks (5a). */
export const FEEDBACK_CAP = 24;

/** What a feedback line is about (5a): the look's place on screen, its items, and what to do. */
export type FeedbackAct = "keep" | "change" | "like" | "dislike";
export type FeedbackScope = "item" | "look" | "session";
export type FeedbackInfo = { look: number; items: string[]; act: FeedbackAct; scope: FeedbackScope };

/** A note as the browser shows it: its hidden details stay on the server, except what feedback is about. */
export type ShownNote = Pick<Note, "id" | "kind" | "text" | "status"> & { feedback?: FeedbackInfo };

export const active = (notes: Note[]) => notes.filter((n) => !n.removed);

export const sameDetails = (a: Detail[], b: Detail[]) =>
  a.length === b.length && a.every((d) => b.some((e) => e.name === d.name && e.value === d.value));
