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
  dropFloorLabels,
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
import {
  drawnHeadShape,
  drawnHeadTop,
  markedActorRise,
  silhouetteTop,
  type HeadNode,
  type MarkedNode,
} from '../actorLabelSource'
import type { UseCandidate } from './useKeyTarget'
import { placePlayerPosition } from './playerPosition'

let state: SpeechLabelState = noSpeechLabels()

/** How far each speaker's voice carries; set and cleared with its anchor. */
const reaches = new Map<string, number>()
/** The object each speaker is drawn as — the label rides on its world position. */
const anchors = new Map<string, Object3D>()
/** Speakers whose caller set the height explicitly: no live head tracking. */
const fixedHeights = new Set<string>()

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
  options: { seconds?: number; height?: number; now?: number; reach?: number; floor?: boolean } = {},
): void {
  // Nothing said, nothing changed: not the labels, nor how an existing note
  // follows its speaker (a fixed height must not flip to head tracking).
  if (atoms.length === 0) return
  const now = options.now ?? speechClock()
  // THE FLOOR CLEARS WHAT THE FLOOR RAISED, and nothing else. Clearing every
  // label instead swept away the chief's answer to the player — raised outside
  // the floor and deliberately held for as long as the player needs to read it
  // — the moment any villager said anything, which is what the picture check
  // caught: the words were gone from over his head when the shot was taken.
  let base = expireSpeechLabels(state, now)
  if (options.floor) {
    const before = base
    base = dropFloorLabels(before)
    for (const label of before.labels) {
      if (!label.floor || label.speakerId === speakerId || base.labels.some((l) => l.speakerId === label.speakerId)) continue
      anchors.delete(label.speakerId)
      reaches.delete(label.speakerId)
      fixedHeights.delete(label.speakerId)
    }
  }
  anchors.set(speakerId, anchor)
  reaches.set(speakerId, options.reach ?? balance.communication.talk.reach)
  if (options.height === undefined) fixedHeights.delete(speakerId)
  else fixedHeights.add(speakerId)
  // The height is read from the SPEAKER, here rather than at each call site, so
  // every speaker — the villagers, the children, the dev hook — gets its note
  // over its own head without computing anything (work-order point 582). The
  // figure's DRAWN head says where the tail ends (point 1276); a speaker
  // without one falls back to its actor record, then to a grown figure. The
  // matrices are refreshed first: a figure placed this frame has not been
  // through the render's own update yet. This height is only the start value
  // and the fallback — the label layer re-reads the head every frame
  // (speechTipWorld), so a pose or scale change carries the tail along.
  ;(anchor as Partial<Object3D>).updateWorldMatrix?.(true, true)
  const height =
    options.height ??
    speechLabelHeight(drawnHeadTop(anchor as HeadNode)?.[1] ?? markedActorRise(anchor as MarkedNode))
  publish(showSpeechLabel(base, speakerId, atoms, now, { ...options, height }))
}

/**
 * Where a label's tail tip stands in the world RIGHT NOW (point 1276): the top
 * of its speaker's drawn head, read live off the refreshed matrices so a lean,
 * a kneel or a step since the speech started carries the note with it. Given
 * the `camera`, the top of the head's SILHOUETTE as that camera draws it
 * (silhouetteTop) — seen from above or close by, the world crown projects
 * below the outline and the tip would sink into the hair. Without a visible
 * head — or with a height its caller fixed — the stored height over the
 * speaker's origin stands in. Writes `out`; false when there is no anchor.
 */
export function speechTipWorld(
  label: SpeechLabel,
  out: { x: number; y: number; z: number },
  camera?: Object3D,
): boolean {
  const anchor = anchors.get(label.speakerId)
  if (!anchor) return false
  ;(anchor as Partial<Object3D>).updateWorldMatrix?.(true, true)
  const e = (anchor as HeadNode).matrixWorld?.elements
  if (!e) return false
  const fixed = fixedHeights.has(label.speakerId)
  const shape = fixed || !camera ? null : drawnHeadShape(anchor as HeadNode)
  if (shape && camera) {
    camera.updateWorldMatrix(true, false)
    if (silhouetteTop(shape.center, shape.axes, camera.matrixWorld.elements, out)) return true
  }
  const top = fixed ? null : drawnHeadTop(anchor as HeadNode)
  if (top) {
    out.x = e[12] + top[0]
    out.y = e[13] + top[1]
    out.z = e[14] + top[2]
  } else {
    out.x = e[12]
    out.y = e[13] + label.height
    out.z = e[14]
  }
  return true
}

/** Scratch for placeSpeechNote. */
const TIP = { x: 0, y: 0, z: 0 }

/**
 * Stands a note's scene node on its tail tip for this frame (point 1276): the
 * speaker's head-silhouette top as `camera` draws it, published to the node's
 * world matrix at once — drei's <Html> reads that matrix in a frame callback
 * of its own, before the renderer refreshes the graph. False, node untouched,
 * when the speaker is gone.
 */
export function placeSpeechNote(node: Object3D, label: SpeechLabel, camera: Object3D): boolean {
  if (!speechTipWorld(label, TIP, camera)) return false
  node.position.set(TIP.x, TIP.y, TIP.z)
  node.updateMatrix()
  node.updateMatrixWorld(true)
  return true
}

/** The object a speaker is drawn as, or null once it is gone. */
export function speechAnchor(speakerId: string): Object3D | null {
  return anchors.get(speakerId) ?? null
}

/**
 * Names the speaker the guess key would take (points 588, 1139): the nearest
 * one whose label is actually drawn, within the reach its voice carries. Called once per
 * frame by the label layer, which alone knows which labels the player's own
 * memory lets it draw — an utterance he has never heard shows nothing, and
 * nothing is not clickable.
 *
 * The player's position is the settlement's live one; a frame taken outside a
 * settlement leaves no target at all.
 */
export function updateSpeechTarget(
  isVisible: (label: SpeechLabel) => boolean,
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
    const distance = Math.hypot(e[12] - player.x, e[14] - player.z)
    // Every anchored speaker carries a reach: the two maps are set and cleared together.
    if (distance <= reaches.get(label.speakerId)!) candidates.push({ speakerId: label.speakerId, distance })
  }
  publish(withSpeechTarget(state, pickSpeechTarget(candidates, state.targetId, Infinity)))
}

/** The label the guess key would take right now, or null while none is highlighted. */
export function speechTargetLabel(): SpeechLabel | null {
  const { labels, targetId } = state
  return targetId === null ? null : (labels.find((l) => l.speakerId === targetId) ?? null)
}

/**
 * The speech target as a key candidate (work-order points 691, 1139): the guess
 * key takes it, and on the gamepad, where one button means everything, the
 * nearest of all candidates wins (`pickForKeyPress`). WHICH speaker is the
 * speaker candidate is still decided by speechTarget.ts above; this only
 * measures how far he stands and how far his voice carries, so the door and the
 * utterance are comparable on the pad at all.
 *
 * The distance is taken from the speaker's LIVE world position rather than from
 * the frame that picked him, so a key press after a teleport or a fast step
 * cannot act on a stale reading.
 */
export function speechUseCandidate(
  player: { x: number; z: number; active: boolean } = placePlayerPosition,
): UseCandidate<SpeechLabel> | null {
  const label = speechTargetLabel()
  if (!label || !player.active) return null
  const anchor = anchors.get(label.speakerId)
  if (!anchor || anchor.parent === null) return null
  anchor.updateWorldMatrix(true, false)
  const e = anchor.matrixWorld.elements
  return {
    key: `speech:${label.speakerId}`,
    distance: Math.hypot(e[12] - player.x, e[14] - player.z),
    range: reaches.get(label.speakerId)!,
    payload: label,
  }
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
    if (!next.labels.some((l) => l.speakerId === id)) {
      anchors.delete(id)
      reaches.delete(id)
      fixedHeights.delete(id)
    }
  }
  publish(next)
}

/**
 * Takes ONE speaker's note down at once, without waiting for its own seconds.
 *
 * A note is normally held against expiry for as long as it is the guess target
 * (point 588), which is what lets the player reach for it — and that hold is
 * also what makes a note go stale when the world moves on around it. The one
 * case in the settlement is the drummer: his own word is about the chief, and
 * the moment the chief himself walks up beside him it is no longer what the
 * player is being shown. The figure that ends the situation ends the note.
 */
export function forgetSpeechLabel(speakerId: string): void {
  publish(dropSpeechLabel(state, speakerId))
}

/** Wipes the channel — the label layer does this when the settlement is left. */
export function clearSpeechLabels(): void {
  anchors.clear()
  reaches.clear()
  fixedHeights.clear()
  publish(noSpeechLabels())
}
