// The channel between a speaking figure and the label over its head
// (design.md §13.4, docs/communication-poc-spec.md, work-order point 485).
//
// A speaking villager calls speakOverhead() with its own id and the object it
// is drawn as; the label layer (SpeechLabels.tsx) reads the labels from here
// and follows that object every frame, so the note is unmistakably attached to
// the speaker rather than parked at a world coordinate.
//
// A module-level channel rather than game state on purpose: labels are
// transient scene furniture, they are never saved, and a per-frame store write
// would re-render the HUD. What IS state — the player's own reading — lives in
// the game store and is read at render time (labelReadings), so the journal
// note and the label can never drift apart.
//
// The clock is the wall clock: the label's lifetime is what the player has time
// to read, not in-game days. The lifetime logic itself is pure and lives in
// src/communication/speechLabel.ts.

import type { Object3D } from 'three/webgpu'
import type { Phrase } from '../../communication/lexicon'
import {
  dropSpeechLabel,
  expireSpeechLabels,
  noSpeechLabels,
  showSpeechLabel,
  type SpeechLabelState,
} from '../../communication/speechLabel'

let state: SpeechLabelState = noSpeechLabels()

/** The object each speaker is drawn as — the label rides on its world position. */
const anchors = new Map<string, Object3D>()

const listeners = new Set<() => void>()

/** Seconds on the wall clock; the one place the module reads a clock at all. */
export function speechClock(): number {
  return typeof performance === 'undefined' ? Date.now() / 1000 : performance.now() / 1000
}

/** Subscribe to label changes (useSyncExternalStore); returns the unsubscribe. */
export function subscribeSpeechLabels(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The labels standing right now. Stable by reference while nothing changes. */
export function speechLabelState(): SpeechLabelState {
  return state
}

function publish(next: SpeechLabelState) {
  if (next === state) return
  state = next
  for (const listener of listeners) listener()
}

/**
 * Shows what a figure is saying over its head. Replaces whatever that speaker
 * was saying, and sweeps out labels whose time has run out — so a scene with no
 * label layer mounted still cannot pile them up.
 *
 * Which atoms actually carry a reading, and whether the label shows at all, is
 * decided at render time against the player's live memory: passing an utterance
 * he has never heard is harmless, it simply shows nothing.
 */
export function speakOverhead(
  speakerId: string,
  atoms: Phrase,
  anchor: Object3D,
  options: { seconds?: number; height?: number; now?: number } = {},
): void {
  const now = options.now ?? speechClock()
  anchors.set(speakerId, anchor)
  publish(showSpeechLabel(expireSpeechLabels(state, now), speakerId, atoms, now, options))
}

/** The object a speaker is drawn as, or null once it is gone. */
export function speechAnchor(speakerId: string): Object3D | null {
  return anchors.get(speakerId) ?? null
}

/**
 * Drops what has run out, and what has lost its figure: an anchor removed from
 * the scene graph (a streamed-out or unmounted inhabitant) takes its label with
 * it, so no note is ever left hanging in empty air.
 */
export function pruneSpeechLabels(now: number = speechClock()): void {
  let next = expireSpeechLabels(state, now)
  for (const label of next.labels) {
    const anchor = anchors.get(label.speakerId)
    if (!anchor || anchor.parent === null) next = dropSpeechLabel(next, label.speakerId)
  }
  for (const id of [...anchors.keys()]) {
    if (!next.labels.some((l) => l.speakerId === id)) anchors.delete(id)
  }
  publish(next)
}

/** Wipes the channel — the label layer does this when the settlement is left. */
export function clearSpeechLabels(): void {
  anchors.clear()
  publish(noSpeechLabels())
}
