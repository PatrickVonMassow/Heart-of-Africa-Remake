// The chief's reward for the thing from the boulder: it must be speakable in
// the village's own tongue and readable to a player who did the learning —
// which means every one of its concepts is one he has already met. And it must
// say WHERE and no more: the direction alone, without a digging word.
import { describe, it, expect } from 'vitest'
import { CHIEF_REWARD_CONCEPTS, chiefRewardPhrase } from './chiefReply'
import { CHIEF_MESSAGE_CONCEPTS } from './drumMessage'
import { CONCEPT_IDS, conceptOf, utteranceOf } from './lexicon'

describe("the chief's reward", () => {
  it('is spoken in concepts of the lect, never in invented words', () => {
    for (const c of CHIEF_REWARD_CONCEPTS) expect(CONCEPT_IDS).toContain(c)
  })

  it('names the river and the direction with the current, and nothing else', () => {
    expect(CHIEF_REWARD_CONCEPTS).toEqual(['RIVER', 'DOWNSTREAM'])
  })

  it('carries no digging word — what to do down there is not spoken', () => {
    expect(CHIEF_REWARD_CONCEPTS).not.toContain('DIG')
  })

  it('turns the errand around: the message went upstream, the reward the other way', () => {
    expect(CHIEF_MESSAGE_CONCEPTS).toContain('UPSTREAM')
    expect(CHIEF_MESSAGE_CONCEPTS).not.toContain('DOWNSTREAM')
    expect(CHIEF_REWARD_CONCEPTS).toContain('DOWNSTREAM')
  })

  it('spends only words the traveller can have learned before this moment', () => {
    // RIVER stands in the drummed message he was sent with; DOWNSTREAM is
    // taught at the children's bank game, whose runs announce both directions.
    expect(CHIEF_MESSAGE_CONCEPTS).toContain('RIVER')
    expect(CONCEPT_IDS).toContain('DOWNSTREAM')
  })

  it('speaks the lexicon’s own atoms, in the order of its concepts', () => {
    const phrase = chiefRewardPhrase()
    expect(phrase).toEqual(CHIEF_REWARD_CONCEPTS.map((c) => utteranceOf(c)))
    expect(phrase.map((a) => conceptOf(a))).toEqual([...CHIEF_REWARD_CONCEPTS])
  })

  it('is short enough to be taken in at once', () => {
    expect(chiefRewardPhrase().length).toBeLessThanOrEqual(4)
  })
})
