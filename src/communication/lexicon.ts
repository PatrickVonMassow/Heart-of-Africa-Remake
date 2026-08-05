// The tonal lexicon of the village communication slice (design.md §13.4,
// docs/communication-poc-spec.md): the eleven concepts, the tone sequence each
// one is spoken in, and the tone helpers every consumer — villager speech,
// drums, journal, overhead labels — reads instead of restating them.
//
// Pure data and pure logic. Nothing here knows about the scene, the store or
// the UI, and nothing here is localized: the game never hands the player a
// translation, it only ever shows him what he wrote down himself.
//
// The registry is keyed by LECT (a region's way of speaking), so a second
// region is a new entry in LECTS — consumers keep calling sequenceOf() /
// utteranceOf() with a lect id and never change.

/** The two meaning-bearing tones. Nothing else carries meaning anywhere. */
export type Tone = 'low' | 'high'

/** An utterance's meaning: an ordered run of tones. */
export type ToneSequence = readonly Tone[]

/**
 * The eleven concepts of the slice. Adding a twelfth here fails to compile
 * until every lect gives it a sequence (the Record below is exhaustive).
 */
export type ConceptId =
  // The children's six, taught at their game of tag.
  | 'COME'
  | 'GO_THERE'
  | 'FOLLOW'
  | 'HERE'
  | 'THERE'
  | 'NO'
  // The five the chief's message needs on top, taught by the adults.
  | 'RIVER'
  | 'UPSTREAM'
  | 'DOWNSTREAM'
  | 'BIG_ROCK'
  | 'DIG'

/** Every sequence is this long: five syllables, an even number of them high. */
export const SEQUENCE_LENGTH = 5

/** Syllables are written out separated by this, in speech and in the save. */
export const SYLLABLE_SEPARATOR = '-'

/**
 * An utterance as it is spoken and stored: the syllables of one atom joined by
 * SYLLABLE_SEPARATOR, e.g. `BA-BA-ba-ba-ba`. It is ATOMIC — nothing parses it
 * into meaning-bearing parts, and loudness, tempo, rhythm and syllable length
 * mean nothing anywhere. The text doubles as the key of the heard store, which
 * is why the lects must not share a syllable pair (asserted in the tests).
 */
export type UtteranceId = string

/**
 * A PHRASE is an ordered list of atoms spoken one after another, separated by
 * the constant pause the drums also use (balance.communication.phrasePauseSeconds)
 * and by nothing else — that is how a villager says "dig + here".
 */
export type Phrase = readonly UtteranceId[]

/** A region's way of speaking: its two syllables and its sequence per concept. */
export interface Lect {
  id: LectId
  /** The low syllable, written lowercase. */
  low: string
  /** The high syllable, written uppercase. */
  high: string
  /** One sequence per concept — exhaustive by type. */
  sequences: Readonly<Record<ConceptId, ToneSequence>>
  /** Well-formed sequences this lect deliberately leaves unused. */
  reserved: readonly ToneSequence[]
}

export type LectId = 'tonalWestCentre'

/** Reads a sequence the way docs/communication-poc-spec.md writes it. */
function seq(spoken: string): ToneSequence {
  return spoken.split(SYLLABLE_SEPARATOR).map(toneOfSyllable)
}

/**
 * The tone of a written syllable: HIGH when it is written in upper case, LOW
 * otherwise. Lect-independent on purpose, so the journal can sort a saved
 * utterance without knowing which region it came from.
 */
export function toneOfSyllable(syllable: string): Tone {
  return syllable === syllable.toUpperCase() ? 'high' : 'low'
}

/**
 * The tonal West/Centre belt of the slice — the only lect the PoC ships.
 * Five syllables with an EVEN number of highs: any two such sequences differ in
 * at least two syllables, so one misheard beat can never turn one concept into
 * another, only into a non-word the player notices. Four syllables cannot do
 * that for eleven concepts (a length-four code with every pair two apart holds
 * at most eight). Fifteen sequences qualify; eleven are used.
 */
const TONAL_WEST_CENTRE: Lect = {
  id: 'tonalWestCentre',
  low: 'ba',
  high: 'BA',
  sequences: {
    COME: seq('BA-BA-ba-ba-ba'), // falling, toward the speaker
    GO_THERE: seq('ba-ba-ba-BA-BA'), // rising, away — the mirror of COME
    HERE: seq('BA-ba-BA-ba-ba'), // the near thing
    THERE: seq('ba-ba-BA-ba-BA'), // its mirror, the far thing
    FOLLOW: seq('ba-BA-BA-ba-ba'),
    NO: seq('ba-ba-BA-BA-ba'), // its mirror
    UPSTREAM: seq('ba-BA-BA-BA-BA'), // rising against the current
    DOWNSTREAM: seq('BA-BA-BA-BA-ba'), // its mirror, falling with it
    RIVER: seq('ba-BA-ba-BA-ba'), // alternating, like the water
    BIG_ROCK: seq('BA-ba-ba-ba-BA'), // framed by two highs — a solid block
    DIG: seq('BA-ba-ba-BA-ba'),
  },
  reserved: [
    seq('ba-BA-ba-ba-BA'),
    seq('BA-BA-ba-BA-BA'),
    seq('BA-ba-BA-BA-BA'),
    seq('BA-BA-BA-ba-BA'),
  ],
}

/** Every lect. A new region adds an entry here and touches no consumer. */
export const LECTS: Readonly<Record<LectId, Lect>> = {
  tonalWestCentre: TONAL_WEST_CENTRE,
}

/** The lect of the village the slice plays in. */
export const DEFAULT_LECT: LectId = 'tonalWestCentre'

export function lectOf(id: LectId = DEFAULT_LECT): Lect {
  return LECTS[id]
}

/** Every concept, in the registry's order (children's six, then adults' five). */
export const CONCEPT_IDS: readonly ConceptId[] = Object.keys(
  TONAL_WEST_CENTRE.sequences,
) as ConceptId[]

/**
 * The four opposite pairs, whose sequences are exact reverses of each other.
 * A reward for listening closely, never a requirement: every concept stays
 * learnable from its situations alone.
 */
export const MIRROR_PAIRS: readonly (readonly [ConceptId, ConceptId])[] = [
  ['COME', 'GO_THERE'],
  ['HERE', 'THERE'],
  ['FOLLOW', 'NO'],
  ['UPSTREAM', 'DOWNSTREAM'],
]

export function sequenceOf(concept: ConceptId, lect: LectId = DEFAULT_LECT): ToneSequence {
  return lectOf(lect).sequences[concept]
}

/** Writes a sequence out in a lect's syllables, e.g. `BA-BA-ba-ba-ba`. */
export function speak(sequence: ToneSequence, lect: LectId = DEFAULT_LECT): UtteranceId {
  const { low, high } = lectOf(lect)
  return sequence.map((tone) => (tone === 'high' ? high : low)).join(SYLLABLE_SEPARATOR)
}

/** The spoken atom of a concept — the key the heard store and the save use. */
export function utteranceOf(concept: ConceptId, lect: LectId = DEFAULT_LECT): UtteranceId {
  return speak(sequenceOf(concept, lect), lect)
}

/** The tones of a written utterance, read off the syllables' case. */
export function tonesOf(utterance: UtteranceId): ToneSequence {
  if (utterance === '') return []
  return utterance.split(SYLLABLE_SEPARATOR).map(toneOfSyllable)
}

/** The concept an utterance names, or null when it names none. */
export function conceptOf(utterance: UtteranceId, lect: LectId = DEFAULT_LECT): ConceptId | null {
  for (const id of CONCEPT_IDS) if (utteranceOf(id, lect) === utterance) return id
  return null
}

/** How many syllables of a sequence are high. */
export function highCount(sequence: ToneSequence): number {
  return sequence.reduce((n, tone) => n + (tone === 'high' ? 1 : 0), 0)
}

/**
 * Syllables in which two sequences differ. Sequences of unequal length differ
 * in every position past the shorter one, so a dropped beat never reads as a
 * near-match.
 */
export function toneDistance(a: ToneSequence, b: ToneSequence): number {
  const len = Math.max(a.length, b.length)
  let d = 0
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) d++
  return d
}

/**
 * A sequence usable as a concept: the fixed length, at least one syllable of
 * each tone, and an even number of highs (which is what buys the distance of
 * two between any two of them).
 */
export function isWellFormed(sequence: ToneSequence): boolean {
  if (sequence.length !== SEQUENCE_LENGTH) return false
  const highs = highCount(sequence)
  return highs > 0 && highs < sequence.length && highs % 2 === 0
}

export function reversed(sequence: ToneSequence): ToneSequence {
  return [...sequence].reverse()
}

/**
 * The journal's sort order, defined once for every list of utterances:
 * syllable by syllable with the low tone before the high one (`ba` before
 * `BA`), and a shorter utterance before a longer one it prefixes — so lists of
 * differing lengths stay consistent. Syllables of the same tone from different
 * lects fall back to a case-insensitive text order, which keeps the sort total.
 */
export function compareUtterances(a: UtteranceId, b: UtteranceId): number {
  const sa = a === '' ? [] : a.split(SYLLABLE_SEPARATOR)
  const sb = b === '' ? [] : b.split(SYLLABLE_SEPARATOR)
  for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
    if (sa[i] === sb[i]) continue
    const ta = toneOfSyllable(sa[i])
    const tb = toneOfSyllable(sb[i])
    if (ta !== tb) return ta === 'low' ? -1 : 1
    const la = sa[i].toLowerCase()
    const lb = sb[i].toLowerCase()
    if (la !== lb) return la < lb ? -1 : 1
    return sa[i] < sb[i] ? -1 : 1
  }
  return sa.length - sb.length
}

/** The atoms of a phrase of concepts, in order. */
export function phraseOf(concepts: readonly ConceptId[], lect: LectId = DEFAULT_LECT): Phrase {
  return concepts.map((c) => utteranceOf(c, lect))
}
