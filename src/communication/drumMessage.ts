// The chief's drum message (design.md §13.4, docs/communication-poc-spec.md,
// work-order point 486): the seven concepts the drums send, the strike plan the
// drummer beats them with, and the elements the message display shows.
//
// The sequences are NEVER re-authored here. The message is a list of CONCEPTS;
// its atoms come from the lexicon (phraseOf) and its timing from the same
// speaking plan a villager's phrase uses (phrasePlan), so what the drums beat is
// by construction what the village speaks — including the one constant pause
// between the concepts, and nothing else.
//
// Pure logic. Nothing here touches the scene, the store, WebAudio or the UI: the
// drummer figure animates from `drumStrikeAt`, the ambience engine plays the
// same strikes, and the display reads its elements from the player's memory.

import { hypothesisFor, type CommunicationMemory } from './heard'
import { phraseOf, tonesOf, type ConceptId, type LectId, type Phrase, type UtteranceId } from './lexicon'
import { NO_READING } from './speechLabel'
import { phrasePlan, type SpeechOptions } from './speaking'

/**
 * The message: "Go to the river. Follow it upstream. Dig at the big rock."
 * Built only from concepts the player can observe in the village beforehand —
 * the children's six teach GO_THERE, FOLLOW and THERE, the adults' errands
 * RIVER, UPSTREAM, BIG_ROCK and DIG.
 */
export const CHIEF_MESSAGE_CONCEPTS: readonly ConceptId[] = [
  'GO_THERE',
  'RIVER',
  'FOLLOW',
  'UPSTREAM',
  'BIG_ROCK',
  'THERE',
  'DIG',
]

/** Which of the two drums a strike lands on: the large low one or the small high one. */
export type DrumId = 'low' | 'high'

/** One beat of the message: which drum, when, how long, and in which concept. */
export interface DrumStrike {
  drum: DrumId
  /** Seconds after the start of the message. */
  at: number
  /** Seconds the strike rings — the syllable's own sounding length. */
  duration: number
  /** Index into CHIEF_MESSAGE_CONCEPTS: the concept this beat belongs to. */
  conceptIndex: number
  /** Index of the syllable within that concept's sequence. */
  syllableIndex: number
  /** Envelope peak of the hit, already volume-scaled (as in a SpeechPlan). */
  peak: number
}

/** The whole message as it is beaten out. */
export interface DrumMessagePlan {
  /** The atoms, in order — exactly the spoken ones. */
  atoms: Phrase
  /** Every strike in playing order. */
  strikes: DrumStrike[]
  /** Seconds from the first strike to the end of the last one. */
  duration: number
}

/** The atoms of the message in the given lect — the spoken phrase, unchanged. */
export function chiefMessagePhrase(lect?: LectId): Phrase {
  return phraseOf(CHIEF_MESSAGE_CONCEPTS, lect)
}

/**
 * The strike plan. The timing is the SPEECH plan of the same phrase at zero
 * distance — the drums carry, so no hearing falloff applies to them, but pace
 * and the constant inter-atom pause are the village's own and stay calibratable
 * through `balance.communication.*`.
 *
 * Every syllable becomes one strike: a low syllable on the large drum, a high
 * one on the small drum, and nothing else encodes anything.
 */
export function drumMessagePlan(options: SpeechOptions = {}, lect?: LectId): DrumMessagePlan {
  const atoms = chiefMessagePhrase(lect)
  const plan = phrasePlan(atoms, 0, options)
  const perAtom = atoms.map((atom) => tonesOf(atom).length)
  const strikes: DrumStrike[] = []
  let conceptIndex = 0
  let syllableIndex = 0
  for (const syllable of plan.syllables) {
    while (conceptIndex < perAtom.length && syllableIndex >= perAtom[conceptIndex]) {
      conceptIndex++
      syllableIndex = 0
    }
    strikes.push({
      drum: syllable.tone === 'high' ? 'high' : 'low',
      at: syllable.startOffset,
      duration: syllable.duration,
      conceptIndex,
      syllableIndex,
      peak: syllable.peak,
    })
    syllableIndex++
  }
  return { atoms, strikes, duration: plan.duration }
}

/**
 * The strike sounding `elapsed` seconds into the message, or null between two
 * beats. The drummer figure reads this every frame, so the hand that falls and
 * the drum that sounds can never disagree: both come from the one plan.
 */
export function drumStrikeAt(plan: DrumMessagePlan, elapsed: number): DrumStrike | null {
  for (const strike of plan.strikes) {
    if (elapsed < strike.at) return null // the strikes are ordered — none can follow
    if (elapsed < strike.at + strike.duration) return strike
  }
  return null
}

/** How far into its own ring a strike is at `elapsed`, 0 at the hit .. 1 faded. */
export function drumStrikeProgress(strike: DrumStrike, elapsed: number): number {
  if (strike.duration <= 0) return 1
  return Math.max(0, Math.min(1, (elapsed - strike.at) / strike.duration))
}

/** One concept of the message as the display shows it. */
export interface DrumMessageElement {
  /** Position in the message, 0-based. */
  index: number
  /** The syllables as they were beaten, and as the journal lists them. */
  utterance: UtteranceId
  /** The player's own reading, or NO_READING where he wrote none. */
  reading: string
  /** True while he has written no reading for it. */
  unread: boolean
}

/**
 * The message as the display shows it: one element per concept, each carrying
 * the note the player wrote for that utterance. Derived from the live memory on
 * every call — never stored on the message — so the note edited here and the
 * note edited in the journal are one and the same (point 486).
 */
export function drumMessageElements(
  memory: CommunicationMemory,
  lect?: LectId,
): DrumMessageElement[] {
  return chiefMessagePhrase(lect).map((utterance, index) => {
    const note = hypothesisFor(memory, utterance)
    return { index, utterance, reading: note === '' ? NO_READING : note, unread: note === '' }
  })
}
