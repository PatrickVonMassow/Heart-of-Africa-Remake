// The two teaching adapters in their INTERMEDIATE state (work-order point 686):
// the eleven-word catalogues went with the six concepts they spoke, and their
// replacements — the children's bank game and the adults' water and digging —
// are built in the two points that follow. Until then both adapters stage
// nothing, and this file pins that they stay SILENT rather than crash: the
// village keeps moving, so PlaceLife steps them every frame.

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
import {
  ADULT_CONCEPTS,
  ERRAND_SITUATIONS,
  clearErrand,
  createAdultErrands,
  errandOf,
  isDigging,
  noteErrandArrival,
  stepAdultErrands,
  type AdultErrandConfig,
  type ErrandView,
} from './adultErrands'
import { CONCEPT_IDS } from '../../communication/lexicon'

const CHILD_CFG: ChildSpeechConfig = {
  intervalSeconds: 6,
  intervalSpread: 2,
  actionSeconds: 3,
  actionPace: 1,
  refusalChance: 0.2,
  replySeconds: 1.5,
  silenceSeconds: 2,
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

const ADULT_CFG: AdultErrandConfig = {
  intervalSeconds: 8,
  intervalSpread: 3,
  dwellSeconds: 2,
  digSeconds: 4,
  errandSeconds: 20,
  stallSeconds: 6,
  silenceSeconds: 2,
  pace: 1,
}

const ADULT_VIEW: ErrandView = {
  villagers: [
    { x: 0, z: 0, free: true },
    { x: 5, z: 5, free: true },
  ],
  geography: {
    bank: { x: 4, z: 0 },
    upstream: { x: 8, z: -2 },
    downstream: { x: -6, z: 3 },
    stone: { x: 1, z: 9 },
    digSites: [{ x: 2, z: 2, kind: 'pit' }],
  },
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

describe('the adults stage no errand while the water and digging work is unbuilt', () => {
  it('has an empty catalogue and claims no concept', () => {
    expect(ERRAND_SITUATIONS).toEqual([])
    expect(ADULT_CONCEPTS).toEqual([])
  })

  it('gives every villager an empty assignment and never digs', () => {
    const state = createAdultErrands(ADULT_VIEW.villagers.length, ADULT_CFG)
    expect(state.assignments).toHaveLength(ADULT_VIEW.villagers.length)
    for (let i = 0; i < ADULT_VIEW.villagers.length; i++) {
      expect(errandOf(state, i)).toBeNull()
      expect(isDigging(state, i)).toBe(false)
    }
  })

  it('stays silent over a long run of frames instead of throwing', () => {
    const state = createAdultErrands(ADULT_VIEW.villagers.length, ADULT_CFG)
    for (let frame = 0; frame < 600; frame++) {
      expect(stepAdultErrands(state, ADULT_VIEW, 1 / 60, ADULT_CFG, () => 0.5)).toBeNull()
    }
    expect(state.last).toBeNull()
  })

  it('survives an arrival and a clear on an index that holds nothing', () => {
    const state = createAdultErrands(2, ADULT_CFG)
    expect(() => noteErrandArrival(state, 0, ADULT_CFG)).not.toThrow()
    expect(() => clearErrand(state, 0)).not.toThrow()
    expect(() => clearErrand(state, 9)).not.toThrow()
    expect(state.assignments).toHaveLength(2)
  })
})

describe('neither adapter reaches past the five-word language', () => {
  it('names only concepts the lexicon still carries', () => {
    for (const concept of [...CHILD_CONCEPTS, ...ADULT_CONCEPTS]) {
      expect(CONCEPT_IDS).toContain(concept)
    }
  })
})
