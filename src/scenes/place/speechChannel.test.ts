// The channel between a speaking figure and its overhead label (design.md
// §13.4, work-order point 485): the label rides on the SPEAKER's object, it is
// gone when its time is up, and it goes with the figure when that leaves the
// scene. The lifetime rules themselves are pinned in
// src/communication/speechLabel.test.ts.
import { describe, it, expect, beforeEach } from 'vitest'
import type { Object3D } from 'three/webgpu'
import { utteranceOf } from '../../communication/lexicon'
import { speechLabelHeight } from '../../communication/speechLabel'
import { markActor } from '../actorLabelSource'
import {
  clearSpeechLabels,
  pruneSpeechLabels,
  speakOverhead,
  speechAnchor,
  speechClock,
  speechLabelState,
  speechTargetLabel,
  subscribeSpeechLabels,
  updateSpeechTarget,
} from './speechChannel'

const COME = utteranceOf('COME')
const DIG = utteranceOf('DIG')

/** A stand-in for the figure the label rides on; `parent: null` = unmounted. */
function figure(parent: unknown = {}): Object3D {
  return { parent } as unknown as Object3D
}

beforeEach(() => {
  clearSpeechLabels()
})

describe('speaking over a figure (design.md §13.4)', () => {
  it("attaches the label to the speaker's own object", () => {
    const kid = figure()
    speakOverhead('kid-1', [COME], kid, { now: 0 })
    expect(speechLabelState().labels.map((l) => l.speakerId)).toEqual(['kid-1'])
    expect(speechAnchor('kid-1')).toBe(kid)
  })

  it('knows no anchor for a speaker that never spoke', () => {
    expect(speechAnchor('kid-9')).toBeNull()
  })

  it('re-speaking moves the label to the figure that speaks now', () => {
    const first = figure()
    const second = figure()
    speakOverhead('kid-1', [COME], first, { now: 0 })
    speakOverhead('kid-1', [DIG], second, { now: 1 })
    expect(speechLabelState().labels).toHaveLength(1)
    expect(speechAnchor('kid-1')).toBe(second)
  })

  it('notifies subscribers, and stops once unsubscribed', () => {
    let seen = 0
    const stop = subscribeSpeechLabels(() => (seen += 1))
    speakOverhead('kid-1', [COME], figure(), { now: 0 })
    expect(seen).toBe(1)
    stop()
    speakOverhead('kid-2', [DIG], figure(), { now: 0 })
    expect(seen).toBe(1)
  })

  it('an empty phrase changes nothing and notifies nobody', () => {
    let seen = 0
    const stop = subscribeSpeechLabels(() => (seen += 1))
    speakOverhead('kid-1', [], figure(), { now: 0 })
    expect(speechLabelState().labels).toHaveLength(0)
    expect(seen).toBe(0)
    stop()
  })

  it('uses the wall clock when the caller names no time', () => {
    const before = speechClock()
    speakOverhead('kid-1', [COME], figure())
    const label = speechLabelState().labels[0]
    expect(label.shownAt).toBeGreaterThanOrEqual(before)
    expect(label.hideAt).toBeGreaterThan(label.shownAt)
  })
})

describe('the scene never accumulates standing text (design.md §13.4)', () => {
  it('prunes a label whose time is up, and forgets its anchor with it', () => {
    speakOverhead('kid-1', [COME], figure(), { now: 0, seconds: 2 })
    pruneSpeechLabels(1)
    expect(speechLabelState().labels).toHaveLength(1)
    pruneSpeechLabels(2)
    expect(speechLabelState().labels).toHaveLength(0)
    expect(speechAnchor('kid-1')).toBeNull()
  })

  it('drops the label of a figure that left the scene graph', () => {
    const kid = figure()
    speakOverhead('kid-1', [COME], kid, { now: 0, seconds: 100 })
    ;(kid as unknown as { parent: unknown }).parent = null
    pruneSpeechLabels(1)
    expect(speechLabelState().labels).toHaveLength(0)
  })

  it('keeps the label of a figure that is still drawn', () => {
    speakOverhead('kid-1', [COME], figure(), { now: 0, seconds: 100 })
    pruneSpeechLabels(1)
    expect(speechLabelState().labels).toHaveLength(1)
  })

  it('pruning with nothing to prune notifies nobody', () => {
    speakOverhead('kid-1', [COME], figure(), { now: 0, seconds: 100 })
    let seen = 0
    const stop = subscribeSpeechLabels(() => (seen += 1))
    pruneSpeechLabels(1)
    expect(seen).toBe(0)
    stop()
  })

  it('speaking again sweeps out what has already run out', () => {
    speakOverhead('kid-1', [COME], figure(), { now: 0, seconds: 2 })
    speakOverhead('kid-2', [DIG], figure(), { now: 5, seconds: 2 })
    expect(speechLabelState().labels.map((l) => l.speakerId)).toEqual(['kid-2'])
  })

  it('leaving the settlement clears every label and anchor', () => {
    speakOverhead('kid-1', [COME], figure(), { now: 0, seconds: 100 })
    clearSpeechLabels()
    expect(speechLabelState().labels).toHaveLength(0)
    expect(speechAnchor('kid-1')).toBeNull()
  })
})

/**
 * The height the channel gives a note (work-order point 582): it is taken from
 * the SPEAKER, here, so no call site has to compute it and none can forget to.
 */
describe('the height comes from the speaker itself', () => {
  /** A figure drawn at `scale` whose actor record says how tall it stands. */
  function drawn(scale: number, height = 1.45): Object3D {
    const m = { elements: [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, 1] }
    return {
      parent: {},
      matrixWorld: m,
      userData: markActor({ kind: 'villager', height }),
      children: [],
    } as unknown as Object3D
  }

  it('gives a child a lower note than a grown villager, each over its own head', () => {
    speakOverhead('villager-1', [COME], drawn(1), { now: 0 })
    speakOverhead('kid-1', [COME], drawn(0.55), { now: 0 })
    const at = (id: string) => speechLabelState().labels.find((l) => l.speakerId === id)!.height
    expect(at('villager-1')).toBeCloseTo(speechLabelHeight(1.45))
    expect(at('kid-1')).toBeCloseTo(speechLabelHeight(1.45 * 0.55))
    expect(at('kid-1')).toBeLessThan(at('villager-1'))
  })

  it('falls back to a grown figure for an object that is no marked actor', () => {
    speakOverhead('probe', [COME], figure(), { now: 0 })
    expect(speechLabelState().labels[0].height).toBeCloseTo(speechLabelHeight())
  })

  it('lets an explicit height win — the dev hook and the tests set their own', () => {
    speakOverhead('probe', [COME], drawn(1), { now: 0, height: 9 })
    expect(speechLabelState().labels[0].height).toBe(9)
  })
})

/**
 * WHICH SPEAKER A CLICK WOULD TAKE (work-order point 588). The picking rule
 * itself is pinned in src/communication/speechTarget.test.ts; what the channel
 * owes is the measurement: the nearest DRAWN label, from the player's live
 * position, and no target at all outside a settlement.
 */
describe('the speaker a click would take (design.md §13.4)', () => {
  /** A figure standing at (x, z), mounted in the scene graph. */
  function standing(x: number, z: number): Object3D {
    return {
      parent: {},
      updateWorldMatrix() {},
      matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, z, 1] },
    } as unknown as Object3D
  }
  const anyLabel = () => true
  const player = (x: number, z: number) => ({ x, z, active: true })

  it('highlights the nearest speaker and follows him as he moves', () => {
    speakOverhead('kid-1', [COME], standing(3, 0), { now: 0, seconds: 100 })
    speakOverhead('kid-2', [DIG], standing(8, 0), { now: 0, seconds: 100 })
    updateSpeechTarget(anyLabel, 10, player(0, 0))
    expect(speechLabelState().targetId).toBe('kid-1')
    expect(speechTargetLabel()?.atoms).toEqual([COME])
    // The player walks past kid-1 and up to kid-2.
    updateSpeechTarget(anyLabel, 10, player(9, 0))
    expect(speechLabelState().targetId).toBe('kid-2')
  })

  it('never highlights a label the player cannot see drawn', () => {
    speakOverhead('kid-1', [COME], standing(1, 0), { now: 0, seconds: 100 })
    speakOverhead('kid-2', [DIG], standing(4, 0), { now: 0, seconds: 100 })
    updateSpeechTarget((l) => l.speakerId !== 'kid-1', 10, player(0, 0))
    expect(speechLabelState().targetId).toBe('kid-2')
  })

  it('holds the highlighted note against the sweep, and drops it once the pick moves', () => {
    speakOverhead('kid-1', [COME], standing(2, 0), { now: 0, seconds: 1 })
    updateSpeechTarget(anyLabel, 10, player(0, 0))
    pruneSpeechLabels(60)
    expect(speechLabelState().labels.map((l) => l.speakerId)).toEqual(['kid-1'])
    // He walks out of earshot: nothing is highlighted, and the note goes.
    updateSpeechTarget(anyLabel, 10, player(50, 0))
    pruneSpeechLabels(60)
    expect(speechLabelState().labels).toHaveLength(0)
    expect(speechTargetLabel()).toBeNull()
  })

  it('highlights nobody while the player is not in a settlement', () => {
    speakOverhead('kid-1', [COME], standing(1, 0), { now: 0, seconds: 100 })
    updateSpeechTarget(anyLabel, 10, { x: 0, z: 0, active: false })
    expect(speechLabelState().targetId).toBeNull()
  })

  it('takes the highlight with a figure that leaves the scene', () => {
    const kid = standing(1, 0)
    speakOverhead('kid-1', [COME], kid, { now: 0, seconds: 100 })
    updateSpeechTarget(anyLabel, 10, player(0, 0))
    ;(kid as unknown as { parent: unknown }).parent = null
    pruneSpeechLabels(1)
    expect(speechLabelState().targetId).toBeNull()
    expect(speechTargetLabel()).toBeNull()
  })
})
