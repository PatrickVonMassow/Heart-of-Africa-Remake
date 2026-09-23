import { SHIPPED_VOCABULARY } from './vocabulary'
// The chief's drum message (work-order point 486): the four concepts, the
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
  CHIEF_ANSWER_CONCEPTS,
  currentDrumMessage,
  drumMessagePhrase,
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
  it('is the four concepts of the spec, in order', () => {
    expect(CHIEF_MESSAGE_CONCEPTS).toEqual([
      'RIVER',
      'UPSTREAM',
      'ROCK',
      'DIG',
    ])
  })

  it('uses only concepts in the five-word inventory', () => {
    const inventory = new Set(['RIVER', 'UPSTREAM', 'DOWNSTREAM', 'ROCK', 'DIG'])
    for (const concept of CHIEF_MESSAGE_CONCEPTS) expect(inventory.has(concept)).toBe(true)
  })

  it('takes its atoms from the lexicon, never a literal of its own', () => {
    expect(drumMessagePhrase(SHIPPED_VOCABULARY)).toEqual(CHIEF_MESSAGE_CONCEPTS.map((c) => utteranceOf(c, SHIPPED_VOCABULARY)))
  })
})

describe('the drum plan says what the village speaks', () => {
  it('takes its level from the balance value, not from a literal in the code', () => {
    // The level used to be a `1.8` inside drumMessagePlan, where nothing could
    // calibrate it. It is `balance.communication.drumMessagePeak` now, and the
    // plan follows it: change the value and every strike moves with it.
    for (const strike of drumMessagePlan(SHIPPED_VOCABULARY).strikes) {
      expect(strike.peak).toBeCloseTo(balance.communication.drumMessagePeak * balance.ambienceVolume)
    }
    const held = balance.communication.drumMessagePeak
    try {
      balance.communication.drumMessagePeak = held * 2
      for (const strike of drumMessagePlan(SHIPPED_VOCABULARY).strikes) expect(strike.peak).toBeCloseTo(held * 2 * balance.ambienceVolume)
    } finally {
      balance.communication.drumMessagePeak = held
    }
    // An explicit volume still overrides the ambience volume under it.
    for (const strike of drumMessagePlan(SHIPPED_VOCABULARY, 'errand', { volume: 0.5 }).strikes) {
      expect(strike.peak).toBeCloseTo(balance.communication.drumMessagePeak * 0.5)
    }
  })

  it('stands at the loudness the user asked for on 18.09.2026', () => {
    // "Sie sollen 2,5 mal so laut sein. Im Rahmen vom gleichen Punkt auch die
    // Sprache 1,5 mal so laut machen." The two factors, against the values they
    // were applied to, so a later edit cannot quietly undo the instruction.
    expect(balance.communication.drumMessagePeak).toBeCloseTo(2.5 * 1.8)
    expect(balance.communication.speechVolume).toBeCloseTo(1.5 * 2)
    // …and that is what a strike really carries, at the shipped ambience volume.
    for (const strike of drumMessagePlan(SHIPPED_VOCABULARY).strikes) expect(strike.peak).toBeCloseTo(0.45)
  })

  it('beats each concept as its spoken sequence, concept for concept', () => {
    const plan = drumMessagePlan(SHIPPED_VOCABULARY)
    CHIEF_MESSAGE_CONCEPTS.forEach((concept, index) => {
      const beats = plan.strikes.filter((s) => s.conceptIndex === index)
      expect(beats.map((s) => s.drum)).toEqual([...sequenceOf(concept, SHIPPED_VOCABULARY)])
      expect(beats.map((s) => s.syllableIndex)).toEqual(beats.map((_, i) => i))
    })
  })

  it('beats the low drum for `ba` and the high one for `BA`', () => {
    const plan = drumMessagePlan(SHIPPED_VOCABULARY)
    const spoken = plan.atoms.flatMap((atom) => tonesOf(atom))
    expect(plan.strikes.map((s) => s.drum)).toEqual(spoken)
  })

  it('holds one strike per syllable of the whole message', () => {
    const plan = drumMessagePlan(SHIPPED_VOCABULARY)
    expect(plan.strikes).toHaveLength(CHIEF_MESSAGE_CONCEPTS.length * SEQUENCE_LENGTH)
  })

  it('separates the concepts by ONE constant pause and nothing else', () => {
    const { syllableSeconds, phrasePauseSeconds } = balance.communication
    const plan = drumMessagePlan(SHIPPED_VOCABULARY)
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
    const plan = drumMessagePlan(SHIPPED_VOCABULARY)
    const first = plan.strikes.findIndex((s) => s.conceptIndex === 1)
    expect(plan.strikes[first].at - plan.strikes[first - 1].at).toBeCloseTo(2.5, 6)
  })

  it('runs the whole message: four beats per concept plus the three pauses', () => {
    const { syllableSeconds, phrasePauseSeconds } = balance.communication
    const n = CHIEF_MESSAGE_CONCEPTS.length
    const plan = drumMessagePlan(SHIPPED_VOCABULARY)
    const lastStart = (n * SEQUENCE_LENGTH - 1) * syllableSeconds + (n - 1) * phrasePauseSeconds
    expect(plan.strikes[plan.strikes.length - 1].at).toBeCloseTo(lastStart, 6)
    expect(plan.duration).toBeGreaterThan(lastStart)
  })

  it('carries an audible level even when the listener stands away from the drummer', () => {
    // Unlike a spoken utterance the drums are not attenuated by the hearing
    // curve — that is what makes them a message rather than a conversation.
    for (const strike of drumMessagePlan(SHIPPED_VOCABULARY).strikes) expect(strike.peak).toBeGreaterThan(0)
  })
})

describe('drumStrikeAt (what the drummer shows on his hands)', () => {
  it('names the drum that is sounding, and nothing between two beats', () => {
    const plan = drumMessagePlan(SHIPPED_VOCABULARY)
    const first = plan.strikes[0]
    expect(drumStrikeAt(plan, first.at)).toBe(first)
    expect(drumStrikeAt(plan, first.at + first.duration * 0.5)).toBe(first)
    // The syllable sounds shorter than its step, so the gap really is silent.
    expect(drumStrikeAt(plan, first.at + first.duration + 0.001)).toBeNull()
  })

  it('is silent before the first beat and after the last', () => {
    const plan = drumMessagePlan(SHIPPED_VOCABULARY)
    expect(drumStrikeAt(plan, -1)).toBeNull()
    expect(drumStrikeAt(plan, plan.duration + 0.5)).toBeNull()
  })

  it('walks the strikes in order as the message plays', () => {
    const plan = drumMessagePlan(SHIPPED_VOCABULARY)
    const seen = plan.strikes.map((s) => drumStrikeAt(plan, s.at + s.duration * 0.25))
    expect(seen).toEqual(plan.strikes)
  })

  it('reports how far into its ring a strike stands', () => {
    const plan = drumMessagePlan(SHIPPED_VOCABULARY)
    const s = plan.strikes[0]
    expect(drumStrikeProgress(s, s.at)).toBe(0)
    expect(drumStrikeProgress(s, s.at + s.duration)).toBe(1)
    expect(drumStrikeProgress(s, s.at + s.duration * 0.5)).toBeCloseTo(0.5, 6)
    expect(drumStrikeProgress(s, s.at + s.duration * 2)).toBe(1)
  })
})

describe('the message display reads the journal notes themselves', () => {
  it('shows one element per concept, in message order', () => {
    const elements = drumMessageElements(emptyMemory(), SHIPPED_VOCABULARY)
    expect(elements.map((e) => e.utterance)).toEqual(drumMessagePhrase(SHIPPED_VOCABULARY))
    expect(elements.map((e) => e.index)).toEqual(CHIEF_MESSAGE_CONCEPTS.map((_, i) => i))
  })

  it('stands in for a concept the player has not read yet', () => {
    for (const element of drumMessageElements(emptyMemory(), SHIPPED_VOCABULARY)) {
      expect(element.reading).toBe(NO_READING)
      expect(element.unread).toBe(true)
    }
  })

  it('shows the reading written for that utterance — the journal one', () => {
    const dig = utteranceOf('DIG', SHIPPED_VOCABULARY)
    let memory = observePhrase(emptyMemory(), drumMessagePhrase(SHIPPED_VOCABULARY), 3)
    memory = setHypothesis(memory, dig, 'dig!')
    const element = drumMessageElements(memory, SHIPPED_VOCABULARY).find((e) => e.utterance === dig)
    expect(element?.reading).toBe('dig!')
    expect(element?.unread).toBe(false)
  })
})


describe('the answer on the same drums', () => {
  it('says where, with the direction pair reversed and no third word', () => {
    expect(CHIEF_ANSWER_CONCEPTS).toEqual(['RIVER', 'DOWNSTREAM'])
    expect(sequenceOf('DOWNSTREAM', SHIPPED_VOCABULARY)).toEqual(sequenceOf('UPSTREAM', SHIPPED_VOCABULARY).map((t) => t === 'low' ? 'high' : 'low'))
  })

  it.each(['buried', 'carried', 'given'] as const)('chooses the message for %s', (rockArtefact) => {
    expect(currentDrumMessage({ rockArtefact })).toBe(rockArtefact === 'given' ? 'answer' : 'errand')
  })

  it.each(['errand', 'answer'] as const)('beats %s from the lexicon with the shared pace, pause and level', (message) => {
    const concepts = message === 'answer' ? CHIEF_ANSWER_CONCEPTS : CHIEF_MESSAGE_CONCEPTS
    const plan = drumMessagePlan(SHIPPED_VOCABULARY, message)
    expect(plan.message).toBe(message)
    expect(plan.atoms).toEqual(concepts.map((c) => utteranceOf(c, SHIPPED_VOCABULARY)))
    expect(plan.strikes).toHaveLength(concepts.length * SEQUENCE_LENGTH)
    concepts.forEach((concept, i) => {
      const strikes = plan.strikes.filter((s) => s.conceptIndex === i)
      expect(strikes.map((s) => s.drum)).toEqual([...sequenceOf(concept, SHIPPED_VOCABULARY)])
      expect(strikes[0].at).toBeCloseTo(i * (SEQUENCE_LENGTH * balance.communication.syllableSeconds + balance.communication.phrasePauseSeconds))
    })
    for (const strike of plan.strikes) expect(strike.peak).toBeCloseTo(balance.communication.drumMessagePeak * balance.ambienceVolume)
    const last = plan.strikes.at(-1)!
    expect(plan.duration).toBeCloseTo(last.at + last.duration)
    expect(drumMessageElements(emptyMemory(), SHIPPED_VOCABULARY, message).map((e) => e.utterance)).toEqual(plan.atoms)
  })
})
