// The load-bearing test of the rolled vocabulary (work-order 1174): every
// consumer runs under a mapping that differs from the shipped one in all four
// rolled concepts. A consumer that forgot to thread the run vocabulary keeps
// producing the shipped syllables, and only a test like this one sees it.
import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { CONCEPT_IDS, tonesOf, type Vocabulary } from '../communication/lexicon'
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
    render(<JournalPanel />)
    // The heard utterances live behind the journal's second tab (point 579).
    fireEvent.click(document.querySelectorAll('.journal .journal-tab')[1])
    const heard = [...document.querySelectorAll('.journal .observation .utterance')].map((e) => e.textContent)
    for (const c of CHIEF_MESSAGE_CONCEPTS) expect(heard).toContain(OTHER[c])
    expect(heard).not.toContain(SHIPPED_VOCABULARY.RIVER)
    document.body.innerHTML = ''
    render(<DrumMessageDialog />)
    const readings = [...document.querySelectorAll('.drum-concept .reading')].map((e) => e.textContent)
    expect(readings[CHIEF_MESSAGE_CONCEPTS.indexOf('RIVER')]).toBe('my river')
  })

  it('the overhead label names the run concept in its debug view', () => {
    render(<SpeechLabelCard speakerId="s" atoms={[OTHER.CHIEF]} memory={g().communication} vocabulary={OTHER} conceptLabels />)
    expect(document.querySelector('.speech-atom .syllables')?.textContent).toBe('CHIEF')
  })
})
