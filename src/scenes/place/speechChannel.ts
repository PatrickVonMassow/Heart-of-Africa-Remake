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
import { balance } from '../../config/balance'
import type { Phrase } from '../../communication/lexicon'
import {
  dropSpeechLabel,
  expireSpeechLabels,
  noSpeechLabels,
  showSpeechLabel,
  speechLabelHeight,
  withSpeechTarget,
  type SpeechLabel,
  type SpeechLabelState,
} from '../../communication/speechLabel'
import { pickSpeechTarget, type SpeechTargetCandidate } from '../../communication/speechTarget'
import { markedActorRise, type MarkedNode } from '../actorLabelSource'
import { placePlayerPosition } from './playerPosition'

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
  // The height is read from the SPEAKER, here rather than at each call site, so
  // every speaker — the villagers, the children, the dev hook — gets its note
  // over its own head without computing anything (work-order point 582). The
  // figure's own actor record says how tall it is drawn; a speaker that carries
  // none falls back to a grown figure's height.
  const height = options.height ?? speechLabelHeight(markedActorRise(anchor as MarkedNode))
  publish(showSpeechLabel(expireSpeechLabels(state, now), speakerId, atoms, now, { ...options, height }))
}

/** The object a speaker is drawn as, or null once it is gone. */
export function speechAnchor(speakerId: string): Object3D | null {
  return anchors.get(speakerId) ?? null
}

/**
 * Names the speaker a LEFT CLICK would take (point 588): the nearest one whose
 * label is actually drawn, within the reach a voice carries. Called once per
 * frame by the label layer, which alone knows which labels the player's own
 * memory lets it draw — an utterance he has never heard shows nothing, and
 * nothing is not clickable.
 *
 * The player's position is the settlement's live one; a frame taken outside a
 * settlement leaves no target at all.
 */
export function updateSpeechTarget(
  isVisible: (label: SpeechLabel) => boolean,
  reach: number = balance.communication.hearingRadius,
  player: { x: number; z: number; active: boolean } = placePlayerPosition,
): void {
  if (!player.active) {
    publish(withSpeechTarget(state, null))
    return
  }
  const candidates: SpeechTargetCandidate[] = []
  for (const label of state.labels) {
    if (!isVisible(label)) continue
    const anchor = anchors.get(label.speakerId)
    if (!anchor || anchor.parent === null) continue
    // The figure's world translation, taken off its own matrix rather than
    // through a scratch vector — the module stays free of a three value import.
    anchor.updateWorldMatrix(true, false)
    const e = anchor.matrixWorld.elements
    candidates.push({ speakerId: label.speakerId, distance: Math.hypot(e[12] - player.x, e[14] - player.z) })
  }
  publish(withSpeechTarget(state, pickSpeechTarget(candidates, state.targetId, reach)))
}

/** The label a click would take right now, or null while none is highlighted. */
export function speechTargetLabel(): SpeechLabel | null {
  const { labels, targetId } = state
  return targetId === null ? null : (labels.find((l) => l.speakerId === targetId) ?? null)
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
