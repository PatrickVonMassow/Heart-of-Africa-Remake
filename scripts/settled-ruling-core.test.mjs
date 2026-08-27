import { describe, expect, it } from 'vitest'
import { SETTLED_OWNER_RULINGS } from './settled-owner-rulings.mjs'
import {
  NOT_SETTLED_PREFIX,
  matchSettledRuling,
  settledRulingVerdict,
} from './settled-ruling-core.mjs'

const OBSERVED_TITLE = 'Anhebung der Anleitungs-Obergrenze: selbst entscheiden oder zurücknehmen?'

describe('the settled owner-ruling register', () => {
  it('keeps every entry attributable and matchable', () => {
    expect(SETTLED_OWNER_RULINGS.length).toBeGreaterThan(0)
    for (const entry of SETTLED_OWNER_RULINGS) {
      expect(entry.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.ruling.trim()).not.toBe('')
      expect(entry.ownerWords.trim()).not.toBe('')
      expect(entry.authorisedAction.trim()).not.toBe('')
      expect(entry.terms.length).toBeGreaterThan(0)
      expect(entry.terms.some((group) => group.anchor === true)).toBe(true)
      for (const group of entry.terms) {
        expect(group.name.trim()).not.toBe('')
        expect(group.anyOf.length).toBeGreaterThan(0)
        for (const term of group.anyOf) expect(term.trim()).not.toBe('')
      }
    }
  })
})

describe('settled ruling matching', () => {
  it('refuses the card that repeated the owner ruling verbatim', () => {
    expect(matchSettledRuling(OBSERVED_TITLE)).toMatchObject({
      kind: 'certain',
      ruling: { id: 'documentation-ceiling-increases' },
    })
  })

  it.each([
    'Soll ich für neue Anleitungen das Dokumentbudget anheben, oder soll ich Text kürzen?',
    'Should I increase the guidance ceiling myself or ask you first?',
    'Braucht die Dokumentations-Obergrenze deine Freigabe für eine Erhöhung?',
  ])('refuses a rewording: %s', (question) => {
    expect(settledRulingVerdict(question).block).toBe(true)
  })

  it('does not consume an unrelated decision question', () => {
    expect(settledRulingVerdict('Soll die Obergrenze für parallele Autoren von vier auf sechs steigen?')).toEqual({
      block: false,
      reason: null,
      match: null,
    })
  })

  it("prints the ruling's own words and the action it already authorises", () => {
    const verdict = settledRulingVerdict(OBSERVED_TITLE)
    expect(verdict.reason).toContain('Frage mich in Zukunft allgemein nicht mehr bzgl. Anhebungen')
    expect(verdict.reason).toContain('Already authorised action:')
  })

  it('makes an uncertain match loud and accepts one visible line distinguishing it', () => {
    const question = 'Welcher Wert soll für das Doc-Budget gelten?'
    const uncertain = settledRulingVerdict(question)
    expect(uncertain).toMatchObject({ block: true, match: { kind: 'uncertain' } })
    expect(uncertain.reason).toContain(
      `${NOT_SETTLED_PREFIX} documentation-ceiling-increases: <why this question is different>`,
    )

    const distinguished = settledRulingVerdict(
      `${question}\n${NOT_SETTLED_PREFIX} documentation-ceiling-increases: It asks for the current measured value, not permission to raise it.`,
    )
    expect(distinguished).toMatchObject({
      block: false,
      distinction: 'It asks for the current measured value, not permission to raise it.',
    })
  })

  it('does not let a one-line distinction override a certain repeated ruling', () => {
    const verdict = settledRulingVerdict(
      `${OBSERVED_TITLE}\n${NOT_SETTLED_PREFIX} documentation-ceiling-increases: This is different.`,
    )
    expect(verdict).toMatchObject({ block: true, match: { kind: 'certain' } })
  })

  it('prefers a certain later entry over an uncertain earlier entry', () => {
    const ruling = (id, terms) => ({ id, terms })
    const group = (name, anyOf, anchor = false) => ({ name, anyOf, anchor })
    const rulings = [
      ruling('possible-first', [group('shared', ['shared anchor'], true), group('missing', ['absent'])]),
      ruling('certain-second', [group('shared', ['shared anchor'], true), group('present', ['present'])]),
    ]
    expect(matchSettledRuling('Shared anchor and present.', rulings)).toMatchObject({
      kind: 'certain',
      ruling: { id: 'certain-second' },
    })
  })
})
