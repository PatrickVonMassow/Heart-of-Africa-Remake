// The hypothesis over the speaker's head (design.md §13.4, work-order point
// 485): its lifetime, and its binding to the ONE note the journal edits. The
// scene channel is covered in src/scenes/place/speechChannel.test.ts.
import { SHIPPED_VOCABULARY } from './vocabulary'
import { describe, it, expect } from 'vitest'
import { balance } from '../config/balance'
import { emptyMemory, observeUtterance, setHypothesis } from './heard'
import { phraseOf, utteranceOf } from './lexicon'
import {
  GROWN_FIGURE_HEIGHT,
  NO_READING,
  dropSpeechLabel,
  expireSpeechLabels,
  isSpeechLabelVisible,
  labelReadings,
  noSpeechLabels,
  readingOf,
  showSpeechLabel,
  speechLabelHeight,
  speechLabelPresence,
  speechLabelRecedes,
  speechLabelSeconds,
  withSpeechTarget,
} from './speechLabel'

const RIVER_UTTERANCE = utteranceOf('RIVER', SHIPPED_VOCABULARY)
const DIG = utteranceOf('DIG', SHIPPED_VOCABULARY)
const ROCK_UTTERANCE = utteranceOf('ROCK', SHIPPED_VOCABULARY)

/** A memory that has heard the given utterances, on day 1. */
function heardMemory(...utterances: string[]) {
  let memory = emptyMemory()
  for (const u of utterances) memory = observeUtterance(memory, u, 1)
  return memory
}

describe('what the label says (design.md §13.4)', () => {
  it('shows the reading the player wrote', () => {
    const memory = setHypothesis(heardMemory(RIVER_UTTERANCE), RIVER_UTTERANCE, 'come here')
    expect(readingOf(memory, RIVER_UTTERANCE)).toBe('come here')
  })

  it('shows ??? where he wrote none', () => {
    expect(readingOf(heardMemory(RIVER_UTTERANCE), RIVER_UTTERANCE)).toBe(NO_READING)
    expect(NO_READING).toBe('???')
  })

  it('shows one reading per atom of a phrase, in order', () => {
    let memory = heardMemory(DIG, ROCK_UTTERANCE)
    memory = setHypothesis(memory, DIG, 'dig')
    const readings = labelReadings(memory, phraseOf(['DIG', 'ROCK'], SHIPPED_VOCABULARY))
    expect(readings.map((r) => r.utterance)).toEqual([DIG, ROCK_UTTERANCE])
    expect(readings.map((r) => r.reading)).toEqual(['dig', NO_READING])
  })

  it('keeps the syllables beside the reading, never instead of it', () => {
    const memory = setHypothesis(heardMemory(RIVER_UTTERANCE), RIVER_UTTERANCE, 'come here')
    expect(labelReadings(memory, [RIVER_UTTERANCE])[0]).toEqual({ utterance: RIVER_UTTERANCE, reading: 'come here' })
  })

  it('follows the note the journal edits, with nothing kept on the label', () => {
    const label = showSpeechLabel(noSpeechLabels(), 'kid-1', [RIVER_UTTERANCE], 0).labels[0]
    let memory = heardMemory(RIVER_UTTERANCE)
    expect(labelReadings(memory, label.atoms)[0].reading).toBe(NO_READING)
    // The player writes his reading in the journal — the SAME label now reads it.
    memory = setHypothesis(memory, RIVER_UTTERANCE, 'come!')
    expect(labelReadings(memory, label.atoms)[0].reading).toBe('come!')
    // And clearing the note takes it straight back to ???.
    memory = setHypothesis(memory, RIVER_UTTERANCE, '')
    expect(labelReadings(memory, label.atoms)[0].reading).toBe(NO_READING)
  })
})

describe('when a label shows at all (design.md §13.4)', () => {
  it('shows for speech the player has already observed', () => {
    expect(isSpeechLabelVisible(heardMemory(RIVER_UTTERANCE), [RIVER_UTTERANCE])).toBe(true)
  })

  it('stays away for an utterance he has never heard', () => {
    expect(isSpeechLabelVisible(heardMemory(RIVER_UTTERANCE), [DIG])).toBe(false)
    expect(isSpeechLabelVisible(emptyMemory(), [RIVER_UTTERANCE])).toBe(false)
  })

  it('shows a phrase as soon as one of its atoms is known', () => {
    expect(isSpeechLabelVisible(heardMemory(DIG), phraseOf(['DIG', 'ROCK'], SHIPPED_VOCABULARY))).toBe(true)
  })
})

describe('how long a label stands (design.md §13.4)', () => {
  it('one atom stands the calibrated base time', () => {
    expect(speechLabelSeconds(1)).toBeCloseTo(balance.communication.labelSeconds)
  })

  it('a phrase adds one pause per further atom', () => {
    const { labelSeconds, phrasePauseSeconds } = balance.communication
    expect(speechLabelSeconds(3)).toBeCloseTo(labelSeconds + 2 * phrasePauseSeconds)
  })

  it('is brief — a seven-atom message stays under a quarter minute', () => {
    expect(speechLabelSeconds(7)).toBeLessThan(15)
  })

  it('shows a label from now until its time is up', () => {
    const state = showSpeechLabel(noSpeechLabels(), 'kid-1', [RIVER_UTTERANCE], 10)
    expect(state.labels).toHaveLength(1)
    expect(state.labels[0]).toMatchObject({ speakerId: 'kid-1', shownAt: 10, height: speechLabelHeight() })
    expect(state.labels[0].hideAt).toBeCloseTo(10 + speechLabelSeconds(1))
  })

  it('takes an explicit lifetime and height', () => {
    const state = showSpeechLabel(noSpeechLabels(), 'kid-1', [RIVER_UTTERANCE], 10, { seconds: 4, height: 1.4 })
    expect(state.labels[0].hideAt).toBe(14)
    expect(state.labels[0].height).toBe(1.4)
  })

  it('expires when its time is up, and not a moment before', () => {
    const state = showSpeechLabel(noSpeechLabels(), 'kid-1', [RIVER_UTTERANCE], 0, { seconds: 3 })
    expect(expireSpeechLabels(state, 2.9)).toBe(state)
    expect(expireSpeechLabels(state, 3).labels).toHaveLength(0)
  })

  it('never accumulates: one speaker carries one label, the newest', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [RIVER_UTTERANCE], 0, { seconds: 10 })
    state = showSpeechLabel(state, 'kid-1', [DIG], 1, { seconds: 10 })
    expect(state.labels).toHaveLength(1)
    expect(state.labels[0].atoms).toEqual([DIG])
    expect(state.labels[0].shownAt).toBe(1)
  })

  it('sweeps out what has run out while showing a new one', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [RIVER_UTTERANCE], 0, { seconds: 2 })
    state = showSpeechLabel(state, 'kid-2', [DIG], 5, { seconds: 2 })
    expect(state.labels.map((l) => l.speakerId)).toEqual(['kid-2'])
  })

  it('lets two speakers talk at once', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [RIVER_UTTERANCE], 0, { seconds: 10 })
    state = showSpeechLabel(state, 'kid-2', [DIG], 0, { seconds: 10 })
    expect(state.labels.map((l) => l.speakerId)).toEqual(['kid-1', 'kid-2'])
  })

  it('copies the atoms, so a caller reusing its array cannot rewrite a label', () => {
    const spoken = [RIVER_UTTERANCE]
    const state = showSpeechLabel(noSpeechLabels(), 'kid-1', spoken, 0)
    spoken[0] = DIG
    expect(state.labels[0].atoms).toEqual([RIVER_UTTERANCE])
  })

  it('ignores an empty phrase and a nameless speaker', () => {
    const empty = noSpeechLabels()
    expect(showSpeechLabel(empty, 'kid-1', [], 0)).toBe(empty)
    expect(showSpeechLabel(empty, '', [RIVER_UTTERANCE], 0)).toBe(empty)
  })

  it('drops the label of a speaker whose figure is gone', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [RIVER_UTTERANCE], 0, { seconds: 10 })
    state = showSpeechLabel(state, 'kid-2', [DIG], 0, { seconds: 10 })
    expect(dropSpeechLabel(state, 'kid-1').labels.map((l) => l.speakerId)).toEqual(['kid-2'])
  })

  it('returns the same state when nothing changed', () => {
    const state = showSpeechLabel(noSpeechLabels(), 'kid-1', [RIVER_UTTERANCE], 0, { seconds: 10 })
    expect(expireSpeechLabels(state, 1)).toBe(state)
    expect(dropSpeechLabel(state, 'kid-9')).toBe(state)
  })
})

/**
 * THE CLICK TARGET MUST LIVE LONG ENOUGH TO BE CLICKED (work-order point 588).
 * A label stands 2.6 s, which is shorter than reaching for the mouse — so the
 * one label the player is invited to click is held against the sweep for as
 * long as it is that target, and goes the moment it stops being one.
 */
describe('the note a click would take (design.md §13.4)', () => {
  it('names the target and keeps the same state object when it does not change', () => {
    const state = showSpeechLabel(noSpeechLabels(), 'kid-1', [RIVER_UTTERANCE], 0, { seconds: 2 })
    expect(state.targetId).toBeNull()
    const targeted = withSpeechTarget(state, 'kid-1')
    expect(targeted.targetId).toBe('kid-1')
    expect(withSpeechTarget(targeted, 'kid-1')).toBe(targeted)
  })

  it('holds the targeted label past its time, and lets it go once it is not the target', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [RIVER_UTTERANCE], 0, { seconds: 2 })
    state = showSpeechLabel(state, 'kid-2', [DIG], 0, { seconds: 2 })
    state = withSpeechTarget(state, 'kid-1')
    // Long past both lifetimes: only the target still stands.
    state = expireSpeechLabels(state, 30)
    expect(state.labels.map((l) => l.speakerId)).toEqual(['kid-1'])
    // Another speaker takes the highlight — the held note goes with the next sweep.
    state = withSpeechTarget(state, null)
    expect(expireSpeechLabels(state, 30).labels).toHaveLength(0)
  })

  it('keeps the target while another speaker speaks over him', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [RIVER_UTTERANCE], 0, { seconds: 2 })
    state = withSpeechTarget(state, 'kid-1')
    state = showSpeechLabel(state, 'kid-2', [DIG], 30, { seconds: 2 })
    expect(state.targetId).toBe('kid-1')
    expect(state.labels.map((l) => l.speakerId).sort()).toEqual(['kid-1', 'kid-2'])
  })

  it('takes the highlight with the figure when that leaves the scene', () => {
    let state = showSpeechLabel(noSpeechLabels(), 'kid-1', [RIVER_UTTERANCE], 0, { seconds: 10 })
    state = withSpeechTarget(state, 'kid-1')
    expect(dropSpeechLabel(state, 'kid-1').targetId).toBeNull()
  })
})

/**
 * WHERE THE NOTE'S TAIL ENDS (work-order points 582, 1276). The old flat height
 * was 2.3 m over the speaker's FEET whoever spoke; then a 0.15 m gap over the
 * actor record (itself 0.11 m over the head sphere), which on screen grew to
 * 65-85 px over a speaker 4 m away. The anchor is now the top of the speaker's
 * own DRAWN head, and the gap a screen lift applied by the scene layer.
 */
describe('the anchor is the speaker’s own head top', () => {
  const grown = 1.34 // a grown figure's drawn head top: bodyH 1.0 + 0.18 + r 0.16
  const kid = grown * 0.55

  it('stands exactly on the head top it is given, grown or child', () => {
    for (const top of [grown, kid]) expect(speechLabelHeight(top)).toBeCloseTo(top)
  })

  it('carries no metre gap: a metre gap grows on screen as the speaker nears', () => {
    // Pinhole projection, 1080 px over a 50° vertical field: what 0.26 m —
    // the old record-plus-headroom gap over the head sphere — spans at 4 m,
    // against the band the screen lift is held to.
    const pxPerMetre = (d: number) => 1080 / (2 * d * Math.tan((25 * Math.PI) / 180))
    expect(0.26 * pxPerMetre(4)).toBeGreaterThan(balance.communication.labelTipGap.maxPx)
    expect(speechLabelHeight(grown) - grown).toBe(0)
  })

  it('is the defect it fixes: the old flat height stood far higher over both', () => {
    const FLAT = 2.3
    expect(FLAT - grown).toBeGreaterThan(0.8)
    expect(FLAT - kid).toBeGreaterThan(kid)
    expect(speechLabelHeight(kid)).toBeLessThan(FLAT - 1)
  })

  it('falls back to a grown figure for a speaker that carries no height', () => {
    for (const missing of [undefined, null, 0, -1]) {
      expect(speechLabelHeight(missing)).toBeCloseTo(GROWN_FIGURE_HEIGHT)
    }
  })

  it('holds the calibrated screen lift inside its own band', () => {
    const { px, minPx, maxPx } = balance.communication.labelTipGap
    expect(minPx).toBeLessThanOrEqual(px)
    expect(px).toBeLessThanOrEqual(maxPx)
  })
})

describe('an older note recedes behind a newer one (point 1238)', () => {
  const two = () =>
    showSpeechLabel(
      showSpeechLabel(noSpeechLabels(), 'elder', [RIVER_UTTERANCE], 10),
      'youth',
      [DIG],
      11,
    ).labels
  const byId = (labels: ReturnType<typeof two>, id: string) => labels.find((l) => l.speakerId === id)!

  it('dims the older note once a newer one is drawn, and never the newer', () => {
    const labels = two()
    expect(speechLabelRecedes(byId(labels, 'elder'), labels, null)).toBe(true)
    expect(speechLabelRecedes(byId(labels, 'youth'), labels, null)).toBe(false)
  })

  it('never dims the targeted note, however much was said after it', () => {
    const labels = two()
    expect(speechLabelRecedes(byId(labels, 'elder'), labels, 'elder')).toBe(false)
    // and the newer one stays at full presence while the older is the target
    expect(speechLabelRecedes(byId(labels, 'youth'), labels, 'elder')).toBe(false)
  })

  it('leaves a lone note, and notes raised together, at full presence', () => {
    const one = showSpeechLabel(noSpeechLabels(), 'elder', [RIVER_UTTERANCE], 10).labels
    expect(speechLabelRecedes(one[0], one, null)).toBe(false)
    const together = showSpeechLabel(
      showSpeechLabel(noSpeechLabels(), 'a', [RIVER_UTTERANCE], 10), 'b', [DIG], 10,
    ).labels
    expect(together.some((l) => speechLabelRecedes(l, together, null))).toBe(false)
  })

  it('is judged against the DRAWN notes only — a hidden newer note dims nothing', () => {
    const labels = two()
    const drawn = labels.filter((l) => l.speakerId !== 'youth')
    expect(speechLabelRecedes(byId(labels, 'elder'), drawn, null)).toBe(false)
  })

  it('a speaker speaking again comes to the front again', () => {
    const labels = showSpeechLabel(
      showSpeechLabel(showSpeechLabel(noSpeechLabels(), 'elder', [RIVER_UTTERANCE], 10), 'youth', [DIG], 11),
      'elder', [DIG], 12,
    ).labels
    expect(speechLabelRecedes(byId(labels, 'elder'), labels, null)).toBe(false)
    expect(speechLabelRecedes(byId(labels, 'youth'), labels, null)).toBe(true)
  })

  it('takes the receded look from balance, and full presence otherwise', () => {
    expect(speechLabelPresence(false)).toEqual({ opacity: 1, scale: 1 })
    const before = { ...balance.communication.labelRecede }
    try {
      balance.communication.labelRecede = { opacity: 0.3, scale: 0.7 }
      expect(speechLabelPresence(true)).toEqual({ opacity: 0.3, scale: 0.7 })
    } finally {
      balance.communication.labelRecede = before
    }
    const { opacity, scale } = speechLabelPresence(true)
    expect(opacity).toBeGreaterThan(0.2)
    expect(opacity).toBeLessThan(1)
    expect(scale).toBeGreaterThan(0.5)
    expect(scale).toBeLessThan(1)
  })
})
