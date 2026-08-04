// The channel between a speaking figure and its overhead label (design.md
// §13.4, work-order point 485): the label rides on the SPEAKER's object, it is
// gone when its time is up, and it goes with the figure when that leaves the
// scene. The lifetime rules themselves are pinned in
// src/communication/speechLabel.test.ts.
import { describe, it, expect, beforeEach } from 'vitest'
import type { Object3D } from 'three/webgpu'
import { utteranceOf } from '../../communication/lexicon'
import {
  clearSpeechLabels,
  pruneSpeechLabels,
  speakOverhead,
  speechAnchor,
  speechClock,
  speechLabelState,
  subscribeSpeechLabels,
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
