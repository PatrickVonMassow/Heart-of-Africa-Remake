// The former adult teaching catalogue mixed every surviving word with a concept
// removed from the language. The villagers keep strolling through the scene,
// but this adapter stages no errands until the replacement water and digging
// teaching is built.

import type { ConceptId, Phrase } from '../../communication/lexicon'
import { createProducerWatch, type ProducerWatch } from '../../systems/devAssert'
import type { GestureKind } from '../../render/gesture'

export type ErrandSituationId = never
export type ErrandPlaceKind = 'bank' | 'upstream' | 'downstream' | 'stone' | 'dig'

export interface ErrandPoint {
  x: number
  z: number
}

export interface DigSite extends ErrandPoint {
  kind: 'pit' | 'postHole' | 'patch'
}

export interface ErrandGeography {
  bank: ErrandPoint | null
  upstream: ErrandPoint | null
  downstream: ErrandPoint | null
  stone: ErrandPoint | null
  digSites: readonly DigSite[]
}

export interface ErrandVillager extends ErrandPoint {
  free: boolean
}

export interface ErrandView {
  villagers: readonly ErrandVillager[]
  geography: ErrandGeography
}

export interface SpokenErrand {
  id: ErrandSituationId
  concepts: readonly ConceptId[]
  utterances: Phrase
  gesture: GestureKind
  speaker: number
  addressees: number[]
  aim: { x: number; y: number; z: number }
}

export interface AdultErrandConfig {
  intervalSeconds: number
  intervalSpread: number
  dwellSeconds: number
  digSeconds: number
  errandSeconds: number
  stallSeconds: number
  silenceSeconds: number
  pace: number
}

export interface ErrandAssignment extends ErrandPoint {
  situation: ErrandSituationId
  kind: 'walk' | 'follow' | 'dig'
  place: ErrandPlaceKind | 'speaker'
  arrived: boolean
}

export interface AdultErrandState {
  last: {
    id: ErrandSituationId
    concepts: readonly ConceptId[]
    speaker: number
    addressees: number[]
    age: number
  } | null
  assignments: (ErrandAssignment | null)[]
  staged: Record<ErrandSituationId, number>
  speech: ProducerWatch
}

/** No old mixed-concept errand remains in the five-word language. */
export const ERRAND_SITUATIONS = [] as const
export const ADULT_CONCEPTS: readonly ConceptId[] = []

export function createAdultErrands(
  count: number,
  _cfg: AdultErrandConfig,
): AdultErrandState {
  return {
    last: null,
    assignments: Array.from({ length: Math.max(0, count) }, () => null),
    staged: {},
    speech: createProducerWatch(),
  }
}

export function errandOf(
  state: AdultErrandState,
  index: number,
): ErrandAssignment | null {
  return state.assignments[index] ?? null
}

export function isDigging(_state: AdultErrandState, _index: number): boolean {
  return false
}

export function noteErrandArrival(
  _state: AdultErrandState,
  _index: number,
  _cfg: AdultErrandConfig,
): void {}

export function clearErrand(state: AdultErrandState, index: number): void {
  if (index >= 0 && index < state.assignments.length) state.assignments[index] = null
}

export function stepAdultErrands(
  _state: AdultErrandState,
  _view: ErrandView,
  _dt: number,
  _cfg: AdultErrandConfig,
  _rand: () => number,
): SpokenErrand | null {
  return null
}
