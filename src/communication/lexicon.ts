// The tonal lexicon of the village communication slice (design.md §13.4,
// docs/communication-poc-spec.md): the six concepts, the lects that speak
// them, and the tone helpers every consumer — villager speech,
// drums, journal, overhead labels — reads instead of restating them.
//
// Pure data and pure logic. Nothing here knows about the scene, the store or
// the UI, and nothing here is localized: the game never hands the player a
// translation, it only ever shows him what he wrote down himself.
//
// Lects hold the fixed syllables and reserved sequences. The six concept
// assignments are an explicit Vocabulary value rolled once per run; every
// consumer supplies that value rather than resolving a module-level mapping.

/** The two meaning-bearing tones. Nothing else carries meaning anywhere. */
export type Tone = 'low' | 'high'

/** An utterance's meaning: an ordered run of tones. */
export type ToneSequence = readonly Tone[]

/**
 * The concepts of the slice. Adding another here fails to compile
 * until every vocabulary gives it a sequence (the Record below is exhaustive).
 */
export type ConceptId =
  | 'RIVER'
  | 'UPSTREAM'
  | 'DOWNSTREAM'
  | 'ROCK'
  | 'DIG'
  | 'CHIEF'

/**
 * Every sequence has this many syllables and an even number of highs, so any
 * two are at least two syllables apart. Counted at four: eight such sequences,
 * six words and two reserved. Another length derives another set.
 */
export const SEQUENCE_LENGTH = 4

/** Syllables are written out separated by this, in speech and in the save. */
export const SYLLABLE_SEPARATOR = '-'

/**
 * An utterance as it is spoken and stored: the syllables of one atom joined by
 * SYLLABLE_SEPARATOR, e.g. `BA-BA-ba-ba`. It is ATOMIC — nothing parses it
 * into meaning-bearing parts, and loudness, tempo, rhythm and syllable length
 * mean nothing anywhere. The text doubles as the key of the heard store, which
 * is why the lects must not share a syllable pair (asserted in the tests).
 */
export type UtteranceId = string

/** The run's six tone sequences, written as utterances so saves retain the mapping. */
export type Vocabulary = Readonly<Record<ConceptId, UtteranceId>>

/**
 * A PHRASE is an ordered list of atoms spoken one after another, separated by
 * the constant pause the drums also use (balance.communication.phrasePauseSeconds)
 * and by nothing else — that is how a villager says "dig + here".
 */
export type Phrase = readonly UtteranceId[]

/** The fixed parts of a region's speech; concept assignments live in Vocabulary. */
export interface Lect {
  id: LectId
  /** The low syllable, written lowercase. */
  low: string
  /** The high syllable, written uppercase. */
  high: string
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
 * Four syllables with an EVEN number of highs: any two such sequences differ in
 * at least two syllables, so one misheard beat can never turn one concept into
 * another, only into a non-word the player notices. Eight sequences qualify.
 *
 * A WORD additionally carries AT LEAST ONE SYLLABLE OF EACH TONE. The two
 * single-tone sequences are four identical strikes, the least hearable thing
 * the drums can beat — so they stay out of every vocabulary and are the whole
 * of `reserved`; the six mixed sequences are all words, in a rolled order.
 */
const TONAL_WEST_CENTRE: Lect = {
  id: 'tonalWestCentre',
  low: 'ba',
  high: 'BA',
  // Derived, not written out: the single-tone sequences of this length. They
  // are the least hearable thing the drums can beat, so they are never words.
  reserved: wellFormedSequences().filter(
    (s) => highCount(s) === 0 || highCount(s) === s.length,
  ),
}

/** Every lect. A new region adds an entry here and touches no consumer. */
export const LECTS: Readonly<Record<LectId, Lect>> = {
  tonalWestCentre: TONAL_WEST_CENTRE,
}

/** The lect of the village the slice plays in. */
export const DEFAULT_LECT: LectId = 'tonalWestCentre'

export function lectOf(id: LectId): Lect {
  return LECTS[id]
}

/** Keyed by ConceptId, so a concept added to the type fails to compile here. */
const CONCEPT_ORDER: Record<ConceptId, true> = {
  RIVER: true, UPSTREAM: true, DOWNSTREAM: true, ROCK: true, DIG: true, CHIEF: true,
}

/** Every concept, in the vocabulary table's order. */
export const CONCEPT_IDS: readonly ConceptId[] = Object.keys(CONCEPT_ORDER) as ConceptId[]

/**
 * The direction pair is an exact tonal mirror, the relationship the player is
 * meant to notice.
 */
export const MIRROR_PAIRS: readonly (readonly [ConceptId, ConceptId])[] = [
  ['UPSTREAM', 'DOWNSTREAM'],
]

export function sequenceOf(concept: ConceptId, vocabulary: Vocabulary): ToneSequence {
  return tonesOf(vocabulary[concept])
}

/** Writes a sequence out in a lect's syllables, e.g. `BA-BA-ba-ba`. */
export function speak(sequence: ToneSequence, lect: LectId): UtteranceId {
  const { low, high } = lectOf(lect)
  return sequence.map((tone) => (tone === 'high' ? high : low)).join(SYLLABLE_SEPARATOR)
}

/** The spoken atom of a concept — the key the heard store and the save use. */
export function utteranceOf(concept: ConceptId, vocabulary: Vocabulary): UtteranceId {
  return vocabulary[concept]
}

/** The tones of a written utterance, read off the syllables' case. */
export function tonesOf(utterance: UtteranceId): ToneSequence {
  if (utterance === '') return []
  return utterance.split(SYLLABLE_SEPARATOR).map(toneOfSyllable)
}

/** The concept an utterance names, or null when it names none. */
export function conceptOf(utterance: UtteranceId, vocabulary: Vocabulary): ConceptId | null {
  for (const id of CONCEPT_IDS) if (utteranceOf(id, vocabulary) === utterance) return id
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
 * A sequence the village's tongue CAN form: the fixed length and an even number
 * of highs, which buys the distance of two between any two inventory entries.
 *
 * Not the same as "usable as a concept", which it used to say. The single-tone
 * sequences `ba-ba-ba-ba` and `BA-BA-BA-BA` are well formed by this rule and are
 * deliberately never words — two of two reserved sequences. Whether a sequence
 * IS a word is `conceptOf`'s question, answered against the run vocabulary.
 */
export function isWellFormed(sequence: ToneSequence, length: number = SEQUENCE_LENGTH): boolean {
  if (sequence.length !== length) return false
  const highs = highCount(sequence)
  return highs % 2 === 0
}

/**
 * Every sequence the tongue can form at a length, in a stable order. Derived
 * rather than written out, so raising SEQUENCE_LENGTH needs no new literals.
 */
export function wellFormedSequences(length: number = SEQUENCE_LENGTH): ToneSequence[] {
  const all: ToneSequence[] = []
  for (let mask = 0; mask < 1 << length; mask++) {
    const sequence: ToneSequence = Array.from({ length }, (_, i) =>
      mask & (1 << (length - 1 - i)) ? 'high' : 'low',
    )
    if (isWellFormed(sequence, length)) all.push(sequence)
  }
  return all
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
export function phraseOf(concepts: readonly ConceptId[], vocabulary: Vocabulary): Phrase {
  return concepts.map((c) => utteranceOf(c, vocabulary))
}
