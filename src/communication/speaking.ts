// How an utterance is SPOKEN and how far it carries (design.md §13.4,
// docs/communication-poc-spec.md): the timing plan of the syllables, the
// distance curve that decides how loud they arrive, and the hearing gate that
// records what actually reached the player.
//
// Pure logic. Nothing here touches WebAudio — the plan is data, and the
// ambience engine (src/systems/ambience.ts, which owns the audio graph and the
// single §21 ambience volume) plays it. That split is what lets the pace, the
// pause and the attenuation curve be unit-tested without a browser.

import { balance } from '../config/balance'
import { isWithinHearing, observePhrase, observeUtterance, type CommunicationMemory } from './heard'
import { tonesOf, type Phrase, type Tone, type UtteranceId } from './lexicon'

/** One syllable as it is played: which of the two samples, when, how loud. */
export interface SpokenSyllable {
  /** `low` plays the low sample (`ba`), `high` the high one (`BA`). */
  tone: Tone
  /** Seconds after the start of the whole plan. */
  startOffset: number
  /** Seconds the sample sounds — shorter than the step, so syllables separate. */
  duration: number
  /** Envelope peak (pre-bus), already distance- and volume-scaled. */
  peak: number
}

/** A whole spoken plan: one utterance or a phrase of them. */
export interface SpeechPlan {
  /** Every syllable in playing order. Empty when nothing is audible. */
  syllables: SpokenSyllable[]
  /** Seconds from the first syllable's start to the last one's end. */
  duration: number
  /** The level the utterance arrives at, 0..1; 0 = out of range or muted. */
  gain: number
}

/** Overridable inputs; each defaults to its calibratable balance value. */
export interface SpeechOptions {
  /** How far an utterance carries at all (balance.communication.hearingRadius). */
  radius?: number
  /** Steepness of the fall inside that radius (balance.communication.hearingFalloff). */
  falloff?: number
  /** Seconds per syllable — the constant pace (balance.communication.syllableSeconds). */
  syllableSeconds?: number
  /** Constant pause between the atoms of a phrase (balance.communication.phrasePauseSeconds). */
  pauseSeconds?: number
  /** The §21 ambience volume the whole soundscape sits under. */
  volume?: number
}

/**
 * The fraction of a syllable's step the sample actually sounds. Shape, not
 * balance: it keeps a gap between two syllables at ANY pace, so five beats read
 * as five and never smear into one tone.
 */
const SYLLABLE_DUTY = 0.62

/**
 * Peak of one syllable before the buses. Like the thunder and crunch peaks it
 * compensates the ambient bus (0.5) × master (0.5) attenuation, so a villager
 * standing beside the player is plainly heard over the beds. Calibratable
 * shape; the audible RANGE is the balance value, not this.
 */
const SPEECH_PEAK = 1.8

/**
 * How loud an utterance spoken `distance` away arrives: 1 right beside the
 * speaker, falling off sharply with the square of the distance, and cut to
 * exactly 0 beyond the hearing radius. The hard cut is deliberate — it makes
 * "audible" and isWithinHearing() the SAME condition, so nothing is ever
 * recorded that could not be heard, and nothing heard goes unrecorded.
 *
 * `falloff` is the steepness: the level at the rim of the radius is
 * 1/(1+falloff), so a large value means the voices die away close to the
 * speaker — which is what keeps the children's group and the adults' group
 * from babbling over each other in the middle of the village.
 */
export function hearingGain(
  distance: number,
  radius: number = balance.communication.hearingRadius,
  falloff: number = balance.communication.hearingFalloff,
): number {
  if (!isWithinHearing(distance, radius)) return 0
  if (radius <= 0) return distance <= 0 ? 1 : 0
  const d = distance / radius
  return 1 / (1 + Math.max(0, falloff) * d * d)
}

/** The seconds one atom of `syllables` beats occupies, pause excluded. */
export function utteranceSeconds(
  syllables: number,
  syllableSeconds: number = balance.communication.syllableSeconds,
): number {
  return Math.max(0, syllables) * Math.max(0, syllableSeconds)
}

/** The balance-backed defaults an options object may override. */
function resolve(options: SpeechOptions = {}) {
  const c = balance.communication
  return {
    radius: options.radius ?? c.hearingRadius,
    falloff: options.falloff ?? c.hearingFalloff,
    syllableSeconds: Math.max(0, options.syllableSeconds ?? c.syllableSeconds),
    pauseSeconds: Math.max(0, options.pauseSeconds ?? c.phrasePauseSeconds),
    volume: Math.max(0, options.volume ?? balance.ambienceVolume),
  }
}

/** An empty plan — nothing audible, nothing scheduled. */
function silence(): SpeechPlan {
  return { syllables: [], duration: 0, gain: 0 }
}

/**
 * The plan for ONE utterance spoken `distance` away: its syllables at the
 * constant pace, each carrying the same distance-scaled peak. Out of range, at
 * volume 0 or for an empty text the plan is silent and schedules nothing.
 */
export function utterancePlan(
  utterance: UtteranceId,
  distance: number,
  options: SpeechOptions = {},
): SpeechPlan {
  return phrasePlan(utterance === '' ? [] : [utterance], distance, options)
}

/**
 * The plan for a PHRASE: its atoms one after another, separated by the constant
 * pause and by nothing else (docs/communication-poc-spec.md). The pause sits
 * BETWEEN atoms only — a phrase never opens or closes with dead air.
 */
export function phrasePlan(
  phrase: Phrase,
  distance: number,
  options: SpeechOptions = {},
): SpeechPlan {
  const { radius, falloff, syllableSeconds, pauseSeconds, volume } = resolve(options)
  const gain = hearingGain(distance, radius, falloff)
  const level = gain * volume
  if (level <= 0 || syllableSeconds <= 0) return { ...silence(), gain }
  const peak = SPEECH_PEAK * level
  const syllables: SpokenSyllable[] = []
  let t = 0
  for (const atom of phrase) {
    const tones = tonesOf(atom)
    if (tones.length === 0) continue
    if (syllables.length > 0) t += pauseSeconds // between atoms only
    for (const tone of tones) {
      syllables.push({
        tone,
        startOffset: t,
        duration: syllableSeconds * SYLLABLE_DUTY,
        peak,
      })
      t += syllableSeconds
    }
  }
  if (syllables.length === 0) return { ...silence(), gain }
  const last = syllables[syllables.length - 1]
  return { syllables, duration: last.startOffset + last.duration, gain }
}

/**
 * Records an utterance the player HEARD: within the hearing radius it goes into
 * the memory of point 477, beyond it nothing happens — seeing a villager speak
 * or gesture from too far away teaches him nothing.
 */
export function hearUtterance(
  memory: CommunicationMemory,
  utterance: UtteranceId,
  distance: number,
  day: number,
  radius: number = balance.communication.hearingRadius,
): CommunicationMemory {
  return isWithinHearing(distance, radius) ? observeUtterance(memory, utterance, day) : memory
}

/** The same for a phrase: in range each atom is recorded on its own, once. */
export function hearPhrase(
  memory: CommunicationMemory,
  phrase: Phrase,
  distance: number,
  day: number,
  radius: number = balance.communication.hearingRadius,
): CommunicationMemory {
  return isWithinHearing(distance, radius) ? observePhrase(memory, phrase, day) : memory
}
