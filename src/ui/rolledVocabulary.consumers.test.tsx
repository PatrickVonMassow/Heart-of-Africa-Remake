// The load-bearing test of the rolled vocabulary (work-order 1174): every
// consumer runs under a mapping that differs from the shipped one in all four
// rolled concepts. A consumer that forgot to thread the run vocabulary keeps
// producing the shipped syllables, and only a test like this one sees it.
import { describe, it, expect, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fireEvent, render } from '@testing-library/react'
import { CONCEPT_IDS, SYLLABLE_SEPARATOR, tonesOf, type Vocabulary } from '../communication/lexicon'
import { enumerateVocabularies, SHIPPED_VOCABULARY } from '../communication/vocabulary'
import { conceptSpeech } from '../communication/speaking'
import { drumMessagePhrase, drumMessagePlan, CHIEF_MESSAGE_CONCEPTS } from '../communication/drumMessage'
import { DrumMessageDialog } from './DrumMessage'
import { JournalPanel } from './JournalPanel'
import { SpeechLabelCard } from './SpeechLabelCard'
import { freshGame, g, useGame } from '../test/store'

const ROLLED = ['RIVER', 'ROCK', 'DIG', 'CHIEF'] as const
const OTHER: Vocabulary = enumerateVocabularies()
  .find((v) => ROLLED.every((c) => v[c] !== SHIPPED_VOCABULARY[c]))!

beforeEach(() => {
  freshGame()
  useGame.setState({ vocabulary: OTHER })
  g().setJournalOpen(true)
})

describe('consumers follow the run vocabulary, not the shipped one', () => {
  it('has a witness vocabulary that moves every rolled concept', () => {
    expect(OTHER).toBeDefined()
    for (const c of ROLLED) expect(OTHER[c]).not.toBe(SHIPPED_VOCABULARY[c])
  })

  it('villager speech says and sounds the run word', () => {
    for (const concept of CONCEPT_IDS) {
      const { utterance, plan } = conceptSpeech(concept, OTHER, 0)
      expect(utterance).toBe(OTHER[concept])
      expect(plan.syllables.map((s) => s.tone)).toEqual(tonesOf(OTHER[concept]))
    }
  })

  it('the drum message beats the run words', () => {
    const phrase = drumMessagePhrase(OTHER)
    expect(phrase).toEqual(CHIEF_MESSAGE_CONCEPTS.map((c) => OTHER[c]))
    const strikes = drumMessagePlan(OTHER).strikes.map((s) => s.drum)
    expect(strikes).toEqual(phrase.flatMap((u) => tonesOf(u)))
  })

  it('the journal and the drum display carry the run words after the drums', () => {
    g().receiveDrumMessage()
    g().setUtteranceHypothesis(OTHER.RIVER, 'my river')
    const journal = render(<JournalPanel />)
    // The heard utterances live behind the journal's second tab (point 579).
    fireEvent.click(document.querySelectorAll('.journal .journal-tab')[1])
    const heard = [...document.querySelectorAll('.journal .observation .utterance')].map((e) => e.textContent)
    const runWords = CHIEF_MESSAGE_CONCEPTS.map((c) => OTHER[c])
    expect([...heard].sort()).toEqual([...runWords].sort())
    journal.unmount()
    render(<DrumMessageDialog />)
    const shown = [...document.querySelectorAll('.drum-concept .utterance')].map((e) => e.textContent)
    expect(shown).toEqual(runWords.map((u) => u.split(SYLLABLE_SEPARATOR).join('')))
    const readings = [...document.querySelectorAll('.drum-concept .reading')].map((e) => e.textContent)
    expect(readings[CHIEF_MESSAGE_CONCEPTS.indexOf('RIVER')]).toBe('my river')
  })

  it('the overhead label names the run concept in its debug view', () => {
    render(<SpeechLabelCard speakerId="s" atoms={[OTHER.CHIEF]} memory={g().communication} vocabulary={OTHER} conceptLabels />)
    expect(document.querySelector('.speech-atom .syllables')?.textContent).toBe('CHIEF')
  })
})

// The tests above hand OTHER in, so they prove each consumer CAN follow the run
// vocabulary; this one proves no call site can reach the shipped one instead.
// With every default removed, the only route left is naming it.
describe('only the roll and the save fallback name the shipped vocabulary', () => {
  const SRC = join(__dirname, '..')
  const ALLOWED = ['communication/vocabulary.ts', 'state/store.ts']
  const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [])

  it('no other source file references SHIPPED_VOCABULARY or spells a shipped word', () => {
    const words = Object.values(SHIPPED_VOCABULARY)
    const offenders = sources(SRC)
      .map((f) => [relative(SRC, f).split('\\').join('/'), readFileSync(f, 'utf8')] as const)
      .filter(([rel]) => !ALLOWED.includes(rel))
      .filter(([, text]) => text.includes('SHIPPED_VOCABULARY') || words.some((w) => text.includes(`'${w}'`)))
      .map(([rel]) => rel)
    expect(offenders).toEqual([])
  })

  it('the store reads the shipped vocabulary only as the fallback for a save without one', () => {
    const store = readFileSync(join(SRC, 'state/store.ts'), 'utf8')
    const uses = store.split('\n').filter((l) => l.includes('SHIPPED_VOCABULARY') && !l.trimStart().startsWith('import'))
    expect(uses).toEqual([expect.stringMatching(/snap\.vocabulary \?\? \{ \.\.\.SHIPPED_VOCABULARY \}/)])
  })
})
