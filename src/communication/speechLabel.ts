// The hypothesis over a speaker's head (design.md §13.4,
// docs/communication-poc-spec.md): when a figure speaks an utterance the player
// has already heard, the reading HE wrote for it stands briefly above that
// figure — `???` where he wrote none, one reading per atom for a phrase.
//
// The label holds only WHO speaks and WHICH atoms; the reading itself is read
// out of the heard-store at render time (labelReadings). That is the whole
// point of this module: the journal's note and the overhead label are ONE
// source seen twice, so editing the note in the journal changes what stands
// over the speaker's head at once, with nothing to keep in sync.
//
// Pure logic — no scene, no store, no clock of its own. The caller passes the
// time; an update that changes nothing returns the SAME state object, so a
// consumer can compare by reference and skip a render.

import { balance } from '../config/balance'
import { hypothesisFor, hasHeard, type CommunicationMemory } from './heard'
import type { Phrase, UtteranceId } from './lexicon'

/** Stands in for a reading the player has not written. Language-neutral. */
export const NO_READING = '???'

/**
 * How high a GROWN figure reaches above its own feet, in settlement units —
 * the height its actor record carries (`markActor` in PlaceLife's Figure, the
 * body height plus the head). Only a FALLBACK: a speaker is measured from its
 * own record, and this stands in for one that carries none (the dev hook can
 * speak over any object at all).
 */
export const GROWN_FIGURE_HEIGHT = 1.45

/**
 * Where a label floats above the speaker's own origin — that speaker's own
 * crown plus the calibratable gap, never a flat height over its FEET.
 *
 * The flat height was 2.3 m for everyone (work-order point 582): about 0.85 m
 * over a grown villager's head, and over a CHILD at 0.55 scale roughly twice
 * the child's own height — and the children teach most of the concepts. The
 * user reported missing utterances entirely because of it.
 *
 * The gap is in METRES and does NOT scale with the figure: the note is an HTML
 * box whose size on screen follows the distance to the camera and not the
 * height of whoever is speaking, so a small figure needs the same absolute
 * clearance to keep the box off its head.
 */
export function speechLabelHeight(figureHeight?: number | null): number {
  const crown = figureHeight != null && figureHeight > 0 ? figureHeight : GROWN_FIGURE_HEIGHT
  return crown + Math.max(0, balance.communication.labelHeadroom)
}

/** One label: the atoms one speaker is saying, and how long it stands. */
export interface SpeechLabel {
  /** Who is speaking. One label per speaker — a new utterance replaces it. */
  speakerId: string
  /** The atoms spoken, in order. A single utterance is a phrase of one. */
  atoms: Phrase
  /** Seconds on the caller's clock when the label appeared. */
  shownAt: number
  /** Seconds on the caller's clock when it disappears again. */
  hideAt: number
  /** Metres above the speaker's origin. */
  height: number
}

/** Every label standing right now. Nothing here is saved. */
export interface SpeechLabelState {
  readonly labels: readonly SpeechLabel[]
}

export function noSpeechLabels(): SpeechLabelState {
  return { labels: [] }
}

/**
 * How long a label stands: the calibratable base for one atom, plus one pause
 * per further atom, so a seven-atom phrase stays readable to its end while a
 * single call is gone again in a moment. Brief either way — the scene never
 * accumulates standing text.
 */
export function speechLabelSeconds(atomCount: number): number {
  const { labelSeconds, phrasePauseSeconds } = balance.communication
  return labelSeconds + phrasePauseSeconds * Math.max(0, atomCount - 1)
}

/**
 * Shows one speaker's atoms. Replaces whatever that speaker was saying (a head
 * never carries two labels) and sweeps out the labels that have run out, so a
 * scene nobody looks at cannot pile them up either.
 */
export function showSpeechLabel(
  state: SpeechLabelState,
  speakerId: string,
  atoms: Phrase,
  now: number,
  options: { seconds?: number; height?: number } = {},
): SpeechLabelState {
  if (speakerId === '' || atoms.length === 0) return state
  const seconds = Math.max(0, options.seconds ?? speechLabelSeconds(atoms.length))
  const kept = state.labels.filter((l) => l.speakerId !== speakerId && l.hideAt > now)
  return {
    labels: [
      ...kept,
      {
        speakerId,
        atoms: [...atoms],
        shownAt: now,
        hideAt: now + seconds,
        height: options.height ?? speechLabelHeight(),
      },
    ],
  }
}

/** Drops every label whose time has run out. */
export function expireSpeechLabels(state: SpeechLabelState, now: number): SpeechLabelState {
  const labels = state.labels.filter((l) => l.hideAt > now)
  return labels.length === state.labels.length ? state : { labels }
}

/** Drops one speaker's label — used when its figure leaves the scene. */
export function dropSpeechLabel(state: SpeechLabelState, speakerId: string): SpeechLabelState {
  const labels = state.labels.filter((l) => l.speakerId !== speakerId)
  return labels.length === state.labels.length ? state : { labels }
}

/** One atom as the label shows it: what was said, and what the player makes of it. */
export interface AtomReading {
  /** The syllables as they are spoken and as the journal lists them. */
  utterance: UtteranceId
  /** The player's own note, or NO_READING where he wrote none. */
  reading: string
}

/** The player's reading of one utterance, NO_READING where he wrote none. */
export function readingOf(memory: CommunicationMemory, utterance: UtteranceId): string {
  const note = hypothesisFor(memory, utterance)
  return note === '' ? NO_READING : note
}

/**
 * One reading per atom, in the order they are spoken. Derived from the live
 * memory on every call — never stored on the label — so a note edited in the
 * journal shows over the speaker's head immediately.
 */
export function labelReadings(memory: CommunicationMemory, atoms: Phrase): AtomReading[] {
  return atoms.map((utterance) => ({ utterance, reading: readingOf(memory, utterance) }))
}

/**
 * Whether a label is shown at all: only for speech the player has ALREADY
 * observed. Someone shouting an utterance he has never heard from close up
 * gets no label — the observation is what unlocks the note, not the label.
 */
export function isSpeechLabelVisible(memory: CommunicationMemory, atoms: Phrase): boolean {
  return atoms.some((atom) => hasHeard(memory, atom))
}
