import { describe, expect, it } from 'vitest'

import { blockedCardBody, blockedCardTitle } from './board-queue-core.mjs'
import { advisoryDecisionCard } from './user-gate-core.mjs'
import {
  USER_OWNED_CATEGORIES,
  isAdvisoryDecisionRecord,
  judgeAutomatedCard,
  namesOptions,
  userOwnedCategory,
  withoutCategoryLine,
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

// THE TWO SCRIPTS THAT ACTUALLY WRITE CARDS. Widening the gate from `--automated`
// to every writer put both of them under a rule they were never adapted to, and
// the branch's first draft dropped the very test that had covered one of them:
// `finding.mjs --blocked` was refused outright, so a deposited finding stayed
// pending with no card — the parking that escape hatch exists to prevent. These
// judge the card each caller BUILDS, not a paraphrase of it.
describe('the live automated callers stay admissible', () => {
  it('admits the blocked-finding card as a scope-extension question', () => {
    const title = blockedCardTitle('Der Träger meldet einen Befund ohne Punkt')
    const body = blockedCardBody('Der Befund braucht eine Grundsatzentscheidung.')
    expect(userOwnedCategory(body)).toBe('scope-extension')
    expect(judgeAutomatedCard({ title, body }).ok).toBe(true)
  })

  it('admits the self-decided record `defer-for-user` writes', () => {
    const card = advisoryDecisionCard(946, {
      decision: 'Der Punkt läuft ohne Rückfrage weiter',
      evidence: 'Die Messung vom 28.08.2026',
      consequence: 'Die Warteschlange steht nicht still',
      vetoAction: 'antworte „Veto 946“',
    })
    expect(card.ok).toBe(true)
    expect(judgeAutomatedCard({ title: card.title, body: card.body }).ok).toBe(true)
  })
})

// The tag is authority for the gate, never prose for the reader: the board is
// German, and the card the user opens must not lead with an English key.
describe('withoutCategoryLine', () => {
  it('drops the tag and leaves the question itself untouched', () => {
    expect(withoutCategoryLine('User-owned category: design-content.\nSoll §13.4 nachziehen?'))
      .toBe('Soll §13.4 nachziehen?')
    expect(withoutCategoryLine('Vorwort.\nUser-owned category: release-tag.\nTaggen oder warten?'))
      .toBe('Vorwort.\nTaggen oder warten?')
  })

  it('leaves a card without a tag exactly as it is', () => {
    expect(withoutCategoryLine('Nur eine Frage, oder?')).toBe('Nur eine Frage, oder?')
  })
})
