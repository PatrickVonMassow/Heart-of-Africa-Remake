import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { enumerateVocabularies, rollVocabulary, SHIPPED_VOCABULARY } from '../communication/vocabulary'
import { hypothesisFor } from '../communication/heard'
import { freshGame, g, useGame, withWorld } from '../test/store'

withWorld()
beforeEach(() => freshGame())
afterEach(() => window.history.replaceState({}, '', '/'))

describe('the vocabulary belongs to the run', () => {
  it('reaches all 20 through ?seed= and rerolls consecutive new games in the same application', () => {
    const witnesses = new Map<string, number>()
    for (let seed = 0; seed < 1000; seed++) witnesses.set(JSON.stringify(rollVocabulary(seed)), seed)
    expect(witnesses.size).toBe(20)
    const reached = new Set<string>()
    for (const [mapping, seed] of witnesses) {
      window.history.replaceState({}, '', `/?seed=${seed}`)
      g().newGame()
      expect(g().seed).toBe(seed)
      expect(JSON.stringify(g().vocabulary)).toBe(mapping)
      reached.add(JSON.stringify(g().vocabulary))
      g().newGame()
      expect(JSON.stringify(g().vocabulary)).toBe(mapping)
    }
    expect(reached.size).toBe(20)
  })

  it('retains one mapping across settlements, travel and return', () => {
    const vocabulary = g().vocabulary
    g().enterPlace('bambara-village')
    expect(g().vocabulary).toBe(vocabulary)
    g().leavePlace()
    g().moveTravel(1, 0, 1)
    expect(g().vocabulary).toBe(vocabulary)
    g().enterPlace('mandinka-village')
    expect(g().vocabulary).toBe(vocabulary)
    g().leavePlace()
    g().enterPlace('bambara-village')
    expect(g().vocabulary).toBe(vocabulary)
  })

  it('round-trips every mapping by value, regardless of the saved seed', () => {
    for (const vocabulary of enumerateVocabularies()) {
      localStorage.clear()
      useGame.setState({ vocabulary, seed: 0 })
      g().hearUtterance(vocabulary.RIVER)
      g().setUtteranceHypothesis(vocabulary.RIVER, 'my river note')
      g().saveCheckpoint()
      const [saved] = JSON.parse(localStorage.getItem('hoa-checkpoints-v1')!)
      expect(saved.vocabulary).toEqual(vocabulary)
      g().newGame()
      expect(g().loadCheckpoint()).toBe(true)
      expect(g().vocabulary).toEqual(vocabulary)
      expect(hypothesisFor(g().communication, g().vocabulary.RIVER)).toBe('my river note')
    }
  })

  it('restores the shipped vocabulary for an old save, preserving its utterance-keyed notes', () => {
    const seed = Array.from({ length: 100 }, (_, i) => i)
      .find((n) => rollVocabulary(n).RIVER !== SHIPPED_VOCABULARY.RIVER)!
    useGame.setState({ seed, vocabulary: SHIPPED_VOCABULARY })
    g().hearUtterance(SHIPPED_VOCABULARY.RIVER)
    g().setUtteranceHypothesis(SHIPPED_VOCABULARY.RIVER, 'the old river note')
    g().saveCheckpoint()
    const snapshots = JSON.parse(localStorage.getItem('hoa-checkpoints-v1')!)
    delete snapshots[0].vocabulary
    localStorage.setItem('hoa-checkpoints-v1', JSON.stringify(snapshots))
    useGame.setState({ vocabulary: rollVocabulary(seed) })
    expect(g().vocabulary.RIVER).not.toBe(SHIPPED_VOCABULARY.RIVER)
    expect(g().loadCheckpoint()).toBe(true)
    expect(g().vocabulary).toEqual(SHIPPED_VOCABULARY)
    expect(hypothesisFor(g().communication, g().vocabulary.RIVER)).toBe('the old river note')
  })
})
