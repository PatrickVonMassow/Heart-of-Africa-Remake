// The former tag-game teaching catalogue was removed with the six concepts it
// spoke. The tag game stays alive while the replacement bank game is built; its
// speech adapter deliberately returns no situations in this intermediate state.

import type { ConceptId, UtteranceId } from '../../communication/lexicon'
import type { GestureKind } from '../../render/gesture'

export type ChildSituationId = never

export interface SituationChild {
  x: number
  z: number
  heading: number
}

export interface SituationView {
  playing: boolean
  chaser: number
  target: number
  immune: number
  children: readonly SituationChild[]
  ground: { x: number; z: number; radius: number }
  farMark: { x: number; z: number }
}

export interface SpokenSituation {
  id: ChildSituationId
  concept: ConceptId
  utterance: UtteranceId
  gesture: GestureKind
  speaker: number
  addressees: number[]
  aim: { x: number; y: number; z: number }
}

export interface ChildSpeechConfig {
  intervalSeconds: number
  intervalSpread: number
  actionSeconds: number
  actionPace: number
  refusalChance: number
  replySeconds: number
  silenceSeconds: number
}

export interface ChildSpeechState {
  last: {
    id: ChildSituationId
    concept: ConceptId
    speaker: number
    addressees: number[]
    age: number
  } | null
  staged: Record<ChildSituationId, number>
}

/** No old tag-game situation remains in the five-word language. */
export const CHILD_SITUATIONS = [] as const
export const CHILD_CONCEPTS: readonly ConceptId[] = []

export function createChildSpeech(
  _count: number,
  _cfg: ChildSpeechConfig,
): ChildSpeechState {
  return { last: null, staged: {} }
}

export function stepChildSpeech(
  _state: ChildSpeechState,
  _view: SituationView,
  _dt: number,
  _cfg: ChildSpeechConfig,
  _rand: () => number,
): SpokenSituation | null {
  return null
}

/** The retained tag game follows only its own chase steering. */
export function childSteer(
  _state: ChildSpeechState,
  _view: SituationView,
  _index: number,
  _cfg: ChildSpeechConfig,
): null {
  return null
}
