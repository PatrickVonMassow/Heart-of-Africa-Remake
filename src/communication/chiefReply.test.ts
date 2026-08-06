// The chief's acknowledgment of the artefact (work-order point 487): it must be
// speakable in the village's own tongue and understandable to a player who did
// the learning — which means every one of its concepts is one he has already met.
import { describe, it, expect } from 'vitest'
import { CHIEF_ACKNOWLEDGE_CONCEPTS, chiefAcknowledgePhrase } from './chiefReply'
import { CHIEF_MESSAGE_CONCEPTS } from './drumMessage'
import { CONCEPT_IDS, conceptOf, utteranceOf } from './lexicon'
import { CHILD_CONCEPTS } from '../scenes/place/childSituations'
import { ADULT_CONCEPTS } from '../scenes/place/adultErrands'

describe("the chief's acknowledgment (point 487)", () => {
  it('is spoken in concepts of the lect, never in invented words', () => {
    for (const c of CHIEF_ACKNOWLEDGE_CONCEPTS) expect(CONCEPT_IDS).toContain(c)
  })

  it('introduces nothing new: every concept is one the village teaches', () => {
    const taught = new Set<string>([...CHILD_CONCEPTS, ...ADULT_CONCEPTS])
    for (const c of CHIEF_ACKNOWLEDGE_CONCEPTS) expect(taught).toContain(c)
  })

  it('names the errand back: the boulder and the digging are the message’s own', () => {
    expect(CHIEF_ACKNOWLEDGE_CONCEPTS).toContain('BIG_ROCK')
    expect(CHIEF_ACKNOWLEDGE_CONCEPTS).toContain('DIG')
    for (const c of ['BIG_ROCK', 'DIG'] as const) expect(CHIEF_MESSAGE_CONCEPTS).toContain(c)
  })

  it('speaks the lexicon’s own atoms, in the order of its concepts', () => {
    const phrase = chiefAcknowledgePhrase()
    expect(phrase).toEqual(CHIEF_ACKNOWLEDGE_CONCEPTS.map((c) => utteranceOf(c)))
    expect(phrase.map((a) => conceptOf(a))).toEqual([...CHIEF_ACKNOWLEDGE_CONCEPTS])
  })

  it('is short enough to be taken in at once', () => {
    expect(chiefAcknowledgePhrase().length).toBeLessThanOrEqual(4)
  })
})
