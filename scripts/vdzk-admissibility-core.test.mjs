import { describe, expect, it } from 'vitest'

import {
  USER_OWNED_CATEGORIES,
  isAdvisoryDecisionRecord,
  judgeAutomatedCard,
  namesOptions,
  userOwnedCategory,
} from './vdzk-admissibility-core.mjs'

const judge = (body, title = 'Eine Karte') => judgeAutomatedCard({ title, body })
const typedQuestion = (category, question) => `User-owned category: ${category}.\n${question}`

describe('the typed authority', () => {
  it('recognises only a selected closed category', () => {
    expect(userOwnedCategory(typedQuestion('design-content', 'Welche Fassung?'))).toBe('design-content')
    expect(userOwnedCategory('User-owned category: internal-process.\nWelche Fassung?')).toBe('')
    expect(userOwnedCategory('This concerns the content of design.md.')).toBe('')
  })

  it('names every category from the brief as a closed key', () => {
    expect(USER_OWNED_CATEGORIES).toEqual({
      'design-content': 'content of design.md',
      'release-tag': 'releases and tags',
      'scope-extension': 'an extension of the commissioned scope',
      'money-permission': 'money or permissions',
      'user-data-deletion': 'deletion of user data',
    })
  })
})

describe('namesOptions', () => {
  it('sees an explicit list, an entweder/oder, a bullet pair and an alternative question', () => {
    expect(namesOptions('Optionen: A oder B.')).toBe(true)
    expect(namesOptions('Entweder das Dorf zieht um, oder die Karte bleibt.')).toBe(true)
    expect(namesOptions('(a) umziehen\n(b) stehen lassen')).toBe(true)
    expect(namesOptions('Soll es ziehen oder bleiben?')).toBe(true)
  })

  it('sees none in a status report', () => {
    expect(namesOptions('Der Batch hat sich selbst pausiert.')).toBe(false)
    expect(namesOptions('')).toBe(false)
  })
})

describe('judgeAutomatedCard — owner-decidable questions continue', () => {
  const observed = 'Vier-Augen-Rückstand: würde ich als eigenen Punkt vorziehen — oder anders priorisiert?'

  it('refuses the observed prioritisation card and teaches both typed patterns', () => {
    const verdict = judge(observed, observed)
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toContain('User-owned category: <key>.')
    expect(verdict.reason).toContain('design-content, release-tag, scope-extension, money-permission, user-data-deletion')
    expect(verdict.reason).toContain('Entscheidungsprotokoll:')
    expect(verdict.reason).toContain('exakte Veto-Aktion:')
    expect(verdict.reason).toContain('veto is the user’s only action')
  })

  it('admits the same matter once the owner records the decision already acting', () => {
    const body =
      `Entscheidung: Der Vier-Augen-Rückstand wird als eigener Punkt vorgezogen. Evidenz: ${observed}. ` +
      'Folge: Der Punkt steht bereits vor den niedriger priorisierten Arbeiten. ' +
      'Deine Möglichkeiten: die Entscheidung stehen lassen, oder sie zurücknehmen — ' +
      'exakte Veto-Aktion: antworte „Veto Vier-Augen-Priorität“. '
    const title = 'Entscheidungsprotokoll: Vier-Augen-Rückstand wird vorgezogen'
    expect(isAdvisoryDecisionRecord({ title, body })).toBe(true)
    expect(judge(body, title).ok).toBe(true)
  })

  it.each([
    ['prioritisation', 'Soll ich diesen Punkt zuerst oder nach dem Abschlusslauf bearbeiten?'],
    ['ordering', 'Soll ich die Schritte A oder B zuerst ausführen?'],
    ['splitting', 'Soll ich den Befund teilen oder in einem Punkt bearbeiten?'],
    ['internal process', 'Soll ich einen zweiten Review-Pass einplanen oder den bestehenden Pass erweitern?'],
  ])('does not turn owner-decidable %s into authority by naming an unknown category', (_kind, question) => {
    expect(judge(typedQuestion('internal-process', question)).ok).toBe(false)
  })
})

describe('judgeAutomatedCard — the five user-owned categories', () => {
  it.each([
    ['design-content', 'Soll design.md die erste oder die zweite Produktregel festschreiben?'],
    ['release-tag', 'Soll ich Release v1.4 veröffentlichen oder den Tag unveröffentlicht lassen?'],
    ['scope-extension', 'Soll der Auftrag auch die mobile Ansicht oder nur die Desktop-Ansicht umfassen?'],
    ['money-permission', 'Soll ich die kostenpflichtige API buchen oder ohne diese Berechtigung fortfahren?'],
    ['user-data-deletion', 'Soll ich die gespeicherten Nutzerdaten löschen oder unverändert behalten?'],
  ])('admits %s when the card names the category and options', (category, question) => {
    expect(judge(typedQuestion(category, question)).ok).toBe(true)
  })

  it('still refuses a typed status report, incomplete card, and unaddressed options', () => {
    expect(judge(typedQuestion('release-tag', 'Der nächste Versuch ist eingeplant.')).ok).toBe(false)
    expect(judge('', 'Titel').ok).toBe(false)
    expect(judge('Optionen: A oder B.', '').ok).toBe(false)
    expect(judge(typedQuestion('scope-extension', 'Optionen: Mobil oder Desktop.')).ok).toBe(false)
  })
})
