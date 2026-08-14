// The spoken utterance (design.md §13.4, docs/communication-poc-spec.md): the
// attenuation curve, the timing of the syllables and the phrase pause, and the
// hearing bookkeeping — out of range records nothing, in range records once, a
// phrase records each atom. All pure; the browser only proves sound plays.

import { afterEach, describe, expect, it } from 'vitest'
import { balance } from '../config/balance'
import { emptyMemory, hasHeard, heardUtterances } from './heard'
import { phraseOf, utteranceOf, SEQUENCE_LENGTH } from './lexicon'
import {
  hearPhrase,
  hearUtterance,
  hearingGain,
  phrasePlan,
  utterancePlan,
  utteranceSeconds,
} from './speaking'

const RIVER_UTTERANCE = utteranceOf('ROCK')
const DIG = utteranceOf('DIG')
const ROCK_UTTERANCE = utteranceOf('ROCK')

const defaults = { ...balance.communication }
const defaultVolume = balance.ambienceVolume
afterEach(() => {
  Object.assign(balance.communication, defaults)
  balance.ambienceVolume = defaultVolume
})

describe('hearingGain (the short, sharply falling range)', () => {
  const radius = 10
  const falloff = 24

  it('is full right beside the speaker', () => {
    expect(hearingGain(0, radius, falloff)).toBe(1)
  })

  it('falls off sharply and monotonically inside the radius', () => {
    const levels = [0, 1, 2, 3, 5, 8, 10].map((d) => hearingGain(d, radius, falloff))
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThan(levels[i - 1])
    // Half way out a voice is already faint — that is what keeps the children's
    // group and the adults' group from babbling over each other.
    expect(hearingGain(radius / 2, radius, falloff)).toBeLessThan(0.2)
    expect(hearingGain(radius, radius, falloff)).toBeLessThan(0.05)
  })

  it('is exactly 0 beyond the radius — audible and "within hearing" are one condition', () => {
    expect(hearingGain(radius + 0.001, radius, falloff)).toBe(0)
    expect(hearingGain(radius * 3, radius, falloff)).toBe(0)
    // Everything up to and including the rim still carries something.
    expect(hearingGain(radius, radius, falloff)).toBeGreaterThan(0)
  })

  it('rejects a nonsensical distance', () => {
    expect(hearingGain(-1, radius, falloff)).toBe(0)
    expect(hearingGain(Number.NaN, radius, falloff)).toBe(0)
    expect(hearingGain(Number.POSITIVE_INFINITY, radius, falloff)).toBe(0)
  })

  it('a larger falloff makes the same distance quieter', () => {
    expect(hearingGain(4, radius, 48)).toBeLessThan(hearingGain(4, radius, 24))
    expect(hearingGain(4, radius, 0)).toBe(1) // no falloff: flat inside the radius
  })

  it('reads the calibratable balance values by default', () => {
    balance.communication.hearingRadius = 4
    balance.communication.hearingFalloff = 24
    expect(hearingGain(5)).toBe(0)
    expect(hearingGain(0)).toBe(1)
    balance.communication.hearingRadius = 40
    expect(hearingGain(5)).toBeGreaterThan(0)
  })
})

describe('utterancePlan (the syllables at a constant pace)', () => {
  it('plays one sample per syllable, evenly spaced', () => {
    const plan = utterancePlan(RIVER_UTTERANCE, 0, { syllableSeconds: 0.3, volume: 1 })
    expect(plan.syllables).toHaveLength(SEQUENCE_LENGTH)
    plan.syllables.forEach((s, i) => expect(s.startOffset).toBeCloseTo(i * 0.3, 10))
    expect(plan.syllables.map((s) => s.tone)).toEqual(['high', 'low', 'low', 'high'])
  })

  it('keeps a gap between syllables at any pace, so four beats read as four', () => {
    for (const pace of [0.15, 0.3, 0.8]) {
      const plan = utterancePlan(RIVER_UTTERANCE, 0, { syllableSeconds: pace, volume: 1 })
      for (const s of plan.syllables) expect(s.duration).toBeLessThan(pace)
      expect(plan.duration).toBeLessThanOrEqual(utteranceSeconds(SEQUENCE_LENGTH, pace))
    }
  })

  it('scales every syllable with the distance and the single ambience volume', () => {
    const near = utterancePlan(RIVER_UTTERANCE, 0, { volume: 0.5 })
    const far = utterancePlan(RIVER_UTTERANCE, 6, { volume: 0.5 })
    expect(near.syllables[0].peak).toBeGreaterThan(far.syllables[0].peak)
    const loud = utterancePlan(RIVER_UTTERANCE, 0, { volume: 1 })
    expect(loud.syllables[0].peak).toBeCloseTo(near.syllables[0].peak * 2, 10)
    // One utterance, one level: no syllable is louder than another.
    const peaks = new Set(near.syllables.map((s) => s.peak))
    expect(peaks.size).toBe(1)
  })

  it('schedules nothing out of range, at volume 0, or for an empty text', () => {
    expect(utterancePlan(RIVER_UTTERANCE, 999, { volume: 1 }).syllables).toHaveLength(0)
    expect(utterancePlan(RIVER_UTTERANCE, 999, { volume: 1 }).gain).toBe(0)
    expect(utterancePlan(RIVER_UTTERANCE, 0, { volume: 0 }).syllables).toHaveLength(0)
    expect(utterancePlan('', 0, { volume: 1 }).syllables).toHaveLength(0)
    expect(utterancePlan('', 0, { volume: 1 }).duration).toBe(0)
  })

  it('takes its pace from the calibratable balance value', () => {
    balance.ambienceVolume = 1
    balance.communication.syllableSeconds = 0.5
    const plan = utterancePlan(RIVER_UTTERANCE, 0)
    expect(plan.syllables[1].startOffset).toBeCloseTo(0.5, 10)
  })
})

describe('phrasePlan (atoms with the constant pause between them)', () => {
  const phrase = phraseOf(['DIG', 'ROCK'])

  it('plays every atom, separated by exactly the constant pause', () => {
    const plan = phrasePlan(phrase, 0, { syllableSeconds: 0.3, pauseSeconds: 0.9, volume: 1 })
    expect(plan.syllables).toHaveLength(2 * SEQUENCE_LENGTH)
    const firstAtomEnd = SEQUENCE_LENGTH * 0.3 // the last beat's full step
    expect(plan.syllables[SEQUENCE_LENGTH].startOffset).toBeCloseTo(firstAtomEnd + 0.9, 10)
  })

  it('never opens or closes with dead air — the pause sits BETWEEN atoms only', () => {
    const plan = phrasePlan(phrase, 0, { syllableSeconds: 0.3, pauseSeconds: 0.9, volume: 1 })
    expect(plan.syllables[0].startOffset).toBe(0)
    const last = plan.syllables[plan.syllables.length - 1]
    expect(plan.duration).toBeCloseTo(last.startOffset + last.duration, 10)
    const single = phrasePlan([DIG], 0, { syllableSeconds: 0.3, pauseSeconds: 0.9, volume: 1 })
    expect(single.duration).toBeLessThan(SEQUENCE_LENGTH * 0.3)
  })

  it('takes the pause from the calibratable balance value', () => {
    balance.ambienceVolume = 1
    balance.communication.syllableSeconds = 0.3
    balance.communication.phrasePauseSeconds = 2
    const plan = phrasePlan(phrase, 0)
    expect(plan.syllables[SEQUENCE_LENGTH].startOffset).toBeCloseTo(SEQUENCE_LENGTH * 0.3 + 2, 10)
  })

  it('is silent as a whole when the speaker stands too far away', () => {
    const plan = phrasePlan(phrase, 999, { volume: 1 })
    expect(plan.syllables).toHaveLength(0)
    expect(plan.duration).toBe(0)
  })

  it('skips an empty atom instead of leaving a hole in the phrase', () => {
    const plan = phrasePlan([DIG, '', ROCK_UTTERANCE], 0, { syllableSeconds: 0.3, pauseSeconds: 0.9, volume: 1 })
    expect(plan.syllables).toHaveLength(2 * SEQUENCE_LENGTH)
  })
})

describe('hearing bookkeeping (point 477 store — what the distance decides)', () => {
  const day = 12
  const radius = 10

  it('records nothing at all from out of range — a gesture seen from afar teaches nothing', () => {
    const memory = hearUtterance(emptyMemory(), RIVER_UTTERANCE, radius + 1, day, radius)
    expect(memory.heard).toEqual({})
    expect(hasHeard(memory, RIVER_UTTERANCE)).toBe(false)
  })

  it('records an in-range utterance ONCE, keeping the first day', () => {
    const first = hearUtterance(emptyMemory(), RIVER_UTTERANCE, 2, day, radius)
    expect(hasHeard(first, RIVER_UTTERANCE)).toBe(true)
    expect(first.heard[RIVER_UTTERANCE].firstHeardDay).toBe(day)
    const again = hearUtterance(first, RIVER_UTTERANCE, 1, day + 40, radius)
    expect(again).toBe(first) // unchanged by reference: nothing new was learnt
    expect(heardUtterances(again)).toHaveLength(1)
  })

  it('records EACH atom of a phrase heard in range', () => {
    const memory = hearPhrase(emptyMemory(), phraseOf(['DIG', 'ROCK']), 3, day, radius)
    expect(heardUtterances(memory).map((h) => h.utterance).sort()).toEqual([DIG, ROCK_UTTERANCE].sort())
    expect(memory.heard[DIG].firstHeardDay).toBe(day)
  })

  it('records no atom of a phrase spoken out of range', () => {
    const memory = hearPhrase(emptyMemory(), phraseOf(['DIG', 'ROCK']), radius * 2, day, radius)
    expect(heardUtterances(memory)).toHaveLength(0)
  })

  it('walking closer turns the same phrase into a recorded one', () => {
    const phrase = phraseOf(['DIG', 'ROCK'])
    const far = hearPhrase(emptyMemory(), phrase, radius * 2, day, radius)
    const near = hearPhrase(far, phrase, radius * 0.4, day + 1, radius)
    expect(heardUtterances(near)).toHaveLength(2)
    expect(near.heard[DIG].firstHeardDay).toBe(day + 1)
  })

  it('agrees with the level curve: whatever is recorded was audible', () => {
    for (const distance of [0, 1, 5, 9.9, 10, 10.1, 25]) {
      const heard = hearUtterance(emptyMemory(), RIVER_UTTERANCE, distance, day, radius)
      const audible = hearingGain(distance, radius, 24) > 0
      expect(hasHeard(heard, RIVER_UTTERANCE)).toBe(audible)
    }
  })

  it('uses the calibratable radius when none is passed', () => {
    balance.communication.hearingRadius = 3
    expect(hasHeard(hearUtterance(emptyMemory(), RIVER_UTTERANCE, 4, day), RIVER_UTTERANCE)).toBe(false)
    balance.communication.hearingRadius = 30
    expect(hasHeard(hearUtterance(emptyMemory(), RIVER_UTTERANCE, 4, day), RIVER_UTTERANCE)).toBe(true)
  })
})
