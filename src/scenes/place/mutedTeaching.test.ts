// The CHILDREN'S OLD SITUATION ADAPTER, which stages nothing (work-order 686):
// the eleven-word catalogue went with the six concepts it spoke, and the group's
// teaching is the bank game of work-order 687 now. PlaceLife still steps this
// adapter every frame, so what is pinned here is that it stays SILENT rather
// than crash. The adults' side moved to `adultWork.test.ts` when their water and
// digging work was built (work-order 688).

import { describe, expect, it } from 'vitest'
import {
  CHILD_CONCEPTS,
  CHILD_SITUATIONS,
  createChildSpeech,
  childSteer,
  stepChildSpeech,
  type ChildSpeechConfig,
  type SituationView,
} from './childSituations'
import { ADULT_CONCEPTS } from './adultWork'
import { CONCEPT_IDS } from '../../communication/lexicon'

const CHILD_CFG: ChildSpeechConfig = {
  intervalSeconds: 6,
  intervalSpread: 2,
  actionSeconds: 3,
  actionPace: 1,
  refusalChance: 0.2,
  replySeconds: 1.5,
}

const CHILD_VIEW: SituationView = {
  playing: true,
  chaser: 0,
  target: 1,
  immune: -1,
  children: [
    { x: 0, z: 0, heading: 0 },
    { x: 2, z: 1, heading: 1 },
    { x: -3, z: 2, heading: 2 },
  ],
  ground: { x: 0, z: 0, radius: 8 },
  farMark: { x: 12, z: 4 },
}

describe('the children stage no situation while the bank game is unbuilt', () => {
  it('has an empty catalogue and claims no concept', () => {
    expect(CHILD_SITUATIONS).toEqual([])
    expect(CHILD_CONCEPTS).toEqual([])
  })

  it('stays silent over a long run of frames instead of throwing', () => {
    const state = createChildSpeech(CHILD_VIEW.children.length, CHILD_CFG)
    expect(state.last).toBeNull()
    for (let frame = 0; frame < 600; frame++) {
      expect(stepChildSpeech(state, CHILD_VIEW, 1 / 60, CHILD_CFG, () => 0.5)).toBeNull()
    }
    expect(state.last).toBeNull()
  })

  it('steers no child, so the tag game keeps its own chase', () => {
    const state = createChildSpeech(CHILD_VIEW.children.length, CHILD_CFG)
    for (let i = 0; i < CHILD_VIEW.children.length; i++) {
      expect(childSteer(state, CHILD_VIEW, i, CHILD_CFG)).toBeNull()
    }
  })
})

describe('neither teaching reaches past the five-word language', () => {
  it('names only concepts the lexicon still carries', () => {
    for (const concept of [...CHILD_CONCEPTS, ...ADULT_CONCEPTS]) {
      expect(CONCEPT_IDS).toContain(concept)
    }
  })
})
