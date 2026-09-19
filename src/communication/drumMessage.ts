// The chief's drum messages (design.md §13.4, docs/communication-poc-spec.md,
// work-order point 486): the concept lists the drums send, the strike plan the
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
import { balance } from '../config/balance'
import { phrasePlan, type SpeechOptions } from './speaking'

/**
 * The message: "River. Upstream. Rock. Dig."
 * Built only from the village lexicon the player can observe beforehand.
 */
export const CHIEF_MESSAGE_CONCEPTS: readonly ConceptId[] = [
  'RIVER',
  'UPSTREAM',
  'ROCK',
  'DIG',
]

/**
 * The answer says WHERE and no more: river, with the current. The wordless
 * mould carries what to do there, so there is no third word. Silence teaches
 * nothing; the absence of DIG is not a clue. DOWNSTREAM is UPSTREAM's tonal
 * mirror, taught at the bank but unused in the errand: the answer turns on
 * the direction pair the player was meant to notice.
 */
export const CHIEF_ANSWER_CONCEPTS: readonly ConceptId[] = ['RIVER', 'DOWNSTREAM']

export type DrumMessageId = 'errand' | 'answer'

/** The give alone changes which message the chief sends or repeats. */
export function currentDrumMessage(state: { rockArtefact: 'buried' | 'carried' | 'given' }): DrumMessageId {
  return state.rockArtefact === 'given' ? 'answer' : 'errand'
}

/** Which of the two drums a strike lands on: the large low one or the small high one. */
export type DrumId = 'low' | 'high'

/** One beat of the message: which drum, when, how long, and in which concept. */
export interface DrumStrike {
  drum: DrumId
  /** Seconds after the start of the message. */
  at: number
  /** Seconds the strike rings — the syllable's own sounding length. */
  duration: number
  /** Index into the selected concept list: the concept this beat belongs to. */
  conceptIndex: number
  /** Index of the syllable within that concept's sequence. */
  syllableIndex: number
  /** Envelope peak of the hit, already volume-scaled (as in a SpeechPlan). */
  peak: number
}

/** The whole message as it is beaten out. */
export interface DrumMessagePlan {
  /** Retained while it sounds, even if the give changes the current message. */
  message: DrumMessageId
  /** The atoms, in order — exactly the spoken ones. */
  atoms: Phrase
  /** Every strike in playing order. */
  strikes: DrumStrike[]
  /** Seconds from the first strike to the end of the last one. */
  duration: number
}

/** The atoms of the message in the given lect — the spoken phrase, unchanged. */
export function drumMessagePhrase(message: DrumMessageId = 'errand', lect?: LectId): Phrase {
  return phraseOf(message === 'answer' ? CHIEF_ANSWER_CONCEPTS : CHIEF_MESSAGE_CONCEPTS, lect)
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
export function drumMessagePlan(message: DrumMessageId = 'errand', options: SpeechOptions = {}, lect?: LectId): DrumMessagePlan {
  // Speech shares the timing, but its measured vowel/panner headroom must not
  // recalibrate the message drums: the message carries its OWN calibratable
  // level (`balance.communication.drumMessagePeak`).
  const peak = balance.communication.drumMessagePeak *
    Math.max(0, options.volume ?? balance.ambienceVolume)
  const atoms = drumMessagePhrase(message, lect)
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
      peak,
    })
    syllableIndex++
  }
  return { message, atoms, strikes, duration: plan.duration }
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
  message: DrumMessageId = 'errand',
  lect?: LectId,
): DrumMessageElement[] {
  return drumMessagePhrase(message, lect).map((utterance, index) => {
    const note = hypothesisFor(memory, utterance)
    return { index, utterance, reading: note === '' ? NO_READING : note, unread: note === '' }
  })
}
