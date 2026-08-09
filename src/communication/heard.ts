// What the player has HEARD, and what he believes it means
// (docs/communication-poc-spec.md). One store, read by the journal, the
// overhead labels and the drum message alike, so the three can never drift
// apart — and plain JSON throughout, so it travels with the save unchanged.
//
// Pure logic: every function takes a memory and returns one, and an update
// that changes nothing returns the SAME object, so a consumer can compare by
// reference. Nothing here decides WHERE the player stands — the scene measures
// the distance and asks isWithinHearing().

import { balance } from '../config/balance'
import { compareUtterances, type Phrase, type UtteranceId } from './lexicon'

/** One utterance the player has heard at least once. */
export interface HeardUtterance {
  utterance: UtteranceId
  /** In-game day of the FIRST hearing (later hearings change nothing). */
  firstHeardDay: number
  /**
   * Place the utterance was FIRST heard in — the settlement id, rendered
   * through the language files exactly as the status bar names it. Absent when
   * it was heard outside a settlement, and absent for everything recorded
   * before this was tracked: such an entry reads WITHOUT a village rather than
   * with an invented one.
   */
  firstHeardPlace?: string
  /** The player's own reading, free text. The game never checks it. '' = none. */
  hypothesis: string
}

/** Everything the player has picked up of a people's speech. Serializable. */
export interface CommunicationMemory {
  /** Heard utterances by their spoken text; insertion order carries no meaning. */
  heard: Readonly<Record<UtteranceId, HeardUtterance>>
}

export function emptyMemory(): CommunicationMemory {
  return { heard: {} }
}

export function hasHeard(memory: CommunicationMemory, utterance: UtteranceId): boolean {
  return Object.hasOwn(memory.heard, utterance)
}

/**
 * Whether an utterance spoken this far away reaches the player. The utterances
 * carry a short distance and fall off sharply, so that among the children he
 * hears the children and among the adults the adults, with no permanent babble
 * of both in the middle of the village.
 */
export function isWithinHearing(
  distance: number,
  radius: number = balance.communication.hearingRadius,
): boolean {
  return Number.isFinite(distance) && distance >= 0 && distance <= radius
}

/**
 * Records one utterance as heard. The first hearing is the one that counts:
 * hearing it again keeps the day it was first heard and the hypothesis written
 * for it, and returns the memory unchanged.
 */
export function observeUtterance(
  memory: CommunicationMemory,
  utterance: UtteranceId,
  day: number,
  place?: string,
): CommunicationMemory {
  if (utterance === '' || hasHeard(memory, utterance)) return memory
  const entry: HeardUtterance = { utterance, firstHeardDay: day, hypothesis: '' }
  if (place) entry.firstHeardPlace = place
  return { ...memory, heard: { ...memory.heard, [utterance]: entry } }
}

/**
 * Records a phrase: each atom is observed on its own, once — a phrase that
 * repeats an atom does not record it twice, and one whose atoms are all known
 * returns the memory unchanged.
 */
export function observePhrase(
  memory: CommunicationMemory,
  phrase: Phrase,
  day: number,
  place?: string,
): CommunicationMemory {
  let next = memory
  for (const atom of phrase) next = observeUtterance(next, atom, day, place)
  return next
}

/**
 * Writes the player's reading of an utterance. Trimmed; an empty text clears
 * it. Only a HEARD utterance can carry one, so no note can outlive its entry.
 */
export function setHypothesis(
  memory: CommunicationMemory,
  utterance: UtteranceId,
  text: string,
): CommunicationMemory {
  const entry = memory.heard[utterance]
  const hypothesis = text.trim()
  if (!entry || entry.hypothesis === hypothesis) return memory
  return { ...memory, heard: { ...memory.heard, [utterance]: { ...entry, hypothesis } } }
}

/** The player's reading of an utterance, '' when he has written none. */
export function hypothesisFor(memory: CommunicationMemory, utterance: UtteranceId): string {
  return memory.heard[utterance]?.hypothesis ?? ''
}

/** Every heard utterance in the journal's order (lexicon.compareUtterances). */
export function heardUtterances(memory: CommunicationMemory): HeardUtterance[] {
  return Object.values(memory.heard).sort((a, b) => compareUtterances(a.utterance, b.utterance))
}

/** The memory as it goes into a save — already plain JSON. */
export function serializeMemory(memory: CommunicationMemory): unknown {
  return { heard: memory.heard }
}

/**
 * The memory as it comes back out of a save. Tolerant by design: a snapshot
 * written before this system existed, or a hand-edited one, yields an empty or
 * partial memory rather than a crash.
 */
export function deserializeMemory(raw: unknown): CommunicationMemory {
  const source = (raw as { heard?: unknown } | null)?.heard
  if (!source || typeof source !== 'object') return emptyMemory()
  const heard: Record<UtteranceId, HeardUtterance> = {}
  for (const [utterance, value] of Object.entries(source as Record<string, unknown>)) {
    if (!utterance || !value || typeof value !== 'object') continue
    const entry = value as Partial<HeardUtterance>
    const day = Number(entry.firstHeardDay)
    const restored: HeardUtterance = {
      utterance,
      firstHeardDay: Number.isFinite(day) ? day : 0,
      hypothesis: typeof entry.hypothesis === 'string' ? entry.hypothesis : '',
    }
    // A snapshot written before the place was tracked simply carries none.
    if (typeof entry.firstHeardPlace === 'string' && entry.firstHeardPlace) {
      restored.firstHeardPlace = entry.firstHeardPlace
    }
    heard[utterance] = restored
  }
  return { heard }
}
