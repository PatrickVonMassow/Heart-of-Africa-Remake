// The chief's drum message (work-order point 486): the seven concepts, the
// strikes that beat them, and the elements the display shows. The load-bearing
// claim is that the drums say EXACTLY what the village speaks — sequence for
// sequence, with one constant pause between the concepts and nothing else.

import { afterEach, describe, expect, it } from 'vitest'
import { balance } from '../config/balance'
import { emptyMemory, observePhrase, setHypothesis } from './heard'
import { SEQUENCE_LENGTH, sequenceOf, tonesOf, utteranceOf } from './lexicon'
import { NO_READING } from './speechLabel'
import {
  CHIEF_MESSAGE_CONCEPTS,
  chiefMessagePhrase,
  drumMessageElements,
  drumMessagePlan,
  drumStrikeAt,
  drumStrikeProgress,
} from './drumMessage'

const defaults = { ...balance.communication }
const defaultVolume = balance.ambienceVolume
afterEach(() => {
  Object.assign(balance.communication, defaults)
  balance.ambienceVolume = defaultVolume
})

describe('the message itself', () => {
  it('is the seven concepts of the spec, in order', () => {
    expect(CHIEF_MESSAGE_CONCEPTS).toEqual([
      'GO_THERE',
      'RIVER',
      'FOLLOW',
      'UPSTREAM',
      'BIG_ROCK',
      'THERE',
      'DIG',
    ])
  })

  it('uses only concepts that are observable in the village beforehand', () => {
    // The children teach the six general concepts, the adults the five the
    // message needs on top (docs/communication-poc-spec.md).
    const taught = new Set([
      'COME', 'GO_THERE', 'FOLLOW', 'HERE', 'THERE', 'NO',
      'RIVER', 'UPSTREAM', 'DOWNSTREAM', 'BIG_ROCK', 'DIG',
    ])
    for (const concept of CHIEF_MESSAGE_CONCEPTS) expect(taught.has(concept)).toBe(true)
  })

  it('takes its atoms from the lexicon, never a literal of its own', () => {
    expect(chiefMessagePhrase()).toEqual(CHIEF_MESSAGE_CONCEPTS.map((c) => utteranceOf(c)))
  })
})

describe('the drum plan says what the village speaks', () => {
  it('beats each concept as its spoken sequence, concept for concept', () => {
    const plan = drumMessagePlan()
    CHIEF_MESSAGE_CONCEPTS.forEach((concept, index) => {
      const beats = plan.strikes.filter((s) => s.conceptIndex === index)
      expect(beats.map((s) => s.drum)).toEqual([...sequenceOf(concept)])
      expect(beats.map((s) => s.syllableIndex)).toEqual(beats.map((_, i) => i))
    })
  })

  it('beats the low drum for `ba` and the high one for `BA`', () => {
    const plan = drumMessagePlan()
    const spoken = plan.atoms.flatMap((atom) => tonesOf(atom))
    expect(plan.strikes.map((s) => s.drum)).toEqual(spoken)
  })

  it('holds one strike per syllable of the whole message', () => {
    const plan = drumMessagePlan()
    expect(plan.strikes).toHaveLength(CHIEF_MESSAGE_CONCEPTS.length * SEQUENCE_LENGTH)
  })

  it('separates the concepts by ONE constant pause and nothing else', () => {
    const { syllableSeconds, phrasePauseSeconds } = balance.communication
    const plan = drumMessagePlan()
    const gaps: number[] = []
    for (let i = 1; i < plan.strikes.length; i++) {
      const a = plan.strikes[i - 1]
      const b = plan.strikes[i]
      const step = b.at - a.at
      if (b.conceptIndex === a.conceptIndex) expect(step).toBeCloseTo(syllableSeconds, 6)
      else gaps.push(step)
    }
    expect(gaps).toHaveLength(CHIEF_MESSAGE_CONCEPTS.length - 1)
    for (const gap of gaps) expect(gap).toBeCloseTo(syllableSeconds + phrasePauseSeconds, 6)
  })

  it('follows the calibratable pace and pause', () => {
    balance.communication.syllableSeconds = 0.5
    balance.communication.phrasePauseSeconds = 2
    const plan = drumMessagePlan()
    const first = plan.strikes.findIndex((s) => s.conceptIndex === 1)
    expect(plan.strikes[first].at - plan.strikes[first - 1].at).toBeCloseTo(2.5, 6)
  })

  it('runs the whole message: five beats per concept plus the six pauses', () => {
    const { syllableSeconds, phrasePauseSeconds } = balance.communication
    const n = CHIEF_MESSAGE_CONCEPTS.length
    const plan = drumMessagePlan()
    const lastStart = (n * SEQUENCE_LENGTH - 1) * syllableSeconds + (n - 1) * phrasePauseSeconds
    expect(plan.strikes[plan.strikes.length - 1].at).toBeCloseTo(lastStart, 6)
    expect(plan.duration).toBeGreaterThan(lastStart)
  })

  it('carries an audible level even when the listener stands away from the drummer', () => {
    // Unlike a spoken utterance the drums are not attenuated by the hearing
    // curve — that is what makes them a message rather than a conversation.
    for (const strike of drumMessagePlan().strikes) expect(strike.peak).toBeGreaterThan(0)
  })
})

describe('drumStrikeAt (what the drummer shows on his hands)', () => {
  it('names the drum that is sounding, and nothing between two beats', () => {
    const plan = drumMessagePlan()
    const first = plan.strikes[0]
    expect(drumStrikeAt(plan, first.at)).toBe(first)
    expect(drumStrikeAt(plan, first.at + first.duration * 0.5)).toBe(first)
    // The syllable sounds shorter than its step, so the gap really is silent.
    expect(drumStrikeAt(plan, first.at + first.duration + 0.001)).toBeNull()
  })

  it('is silent before the first beat and after the last', () => {
    const plan = drumMessagePlan()
    expect(drumStrikeAt(plan, -1)).toBeNull()
    expect(drumStrikeAt(plan, plan.duration + 0.5)).toBeNull()
  })

  it('walks the strikes in order as the message plays', () => {
    const plan = drumMessagePlan()
    const seen = plan.strikes.map((s) => drumStrikeAt(plan, s.at + s.duration * 0.25))
    expect(seen).toEqual(plan.strikes)
  })

  it('reports how far into its ring a strike stands', () => {
    const plan = drumMessagePlan()
    const s = plan.strikes[0]
    expect(drumStrikeProgress(s, s.at)).toBe(0)
    expect(drumStrikeProgress(s, s.at + s.duration)).toBe(1)
    expect(drumStrikeProgress(s, s.at + s.duration * 0.5)).toBeCloseTo(0.5, 6)
    expect(drumStrikeProgress(s, s.at + s.duration * 2)).toBe(1)
  })
})

describe('the message display reads the journal notes themselves', () => {
  it('shows one element per concept, in message order', () => {
    const elements = drumMessageElements(emptyMemory())
    expect(elements.map((e) => e.utterance)).toEqual(chiefMessagePhrase())
    expect(elements.map((e) => e.index)).toEqual(CHIEF_MESSAGE_CONCEPTS.map((_, i) => i))
  })

  it('stands in for a concept the player has not read yet', () => {
    for (const element of drumMessageElements(emptyMemory())) {
      expect(element.reading).toBe(NO_READING)
      expect(element.unread).toBe(true)
    }
  })

  it('shows the reading written for that utterance — the journal one', () => {
    const dig = utteranceOf('DIG')
    let memory = observePhrase(emptyMemory(), chiefMessagePhrase(), 3)
    memory = setHypothesis(memory, dig, 'dig!')
    const element = drumMessageElements(memory).find((e) => e.utterance === dig)
    expect(element?.reading).toBe('dig!')
    expect(element?.unread).toBe(false)
  })
})
