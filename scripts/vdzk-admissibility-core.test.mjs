// Point 749: "Von dir zu klären" holds genuine user decisions only, and an
// automated path is HELD to that rule rather than reminded of it. These are the
// four cards the user actually cleared by hand, plus the two automated cards that
// must keep working.
import { describe, expect, it } from 'vitest'

import { judgeAutomatedCard, namesOptions } from './vdzk-admissibility-core.mjs'

const judge = (body, title = 'Eine Karte') => judgeAutomatedCard({ title, body })

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

describe('judgeAutomatedCard — the four cards the user cleared by hand', () => {
  it('REFUSES the unanswered-alert pause', () => {
    const verdict = judge('Der Batch hat sich selbst pausiert, weil ein Alarm fünfmal unbeantwortet blieb. Bitte prüfen, was die Meldung ausgelöst hat.')
    expect(verdict.ok).toBe(false)
    // The refusal has to say where it DOES belong, or the script writes it again.
    expect(verdict.reason).toMatch(/Woran ich gerade arbeite/)
    expect(verdict.reason).toMatch(/pause marker|alert ladder|retry state/)
  })

  it('REFUSES the environment outage', () => {
    expect(judge('Umgebungsausfall: npm war nicht erreichbar. Der nächste Versuch ist eingeplant.').ok).toBe(false)
  })

  it('REFUSES the continuation and corruption protocols, veto sentence and all', () => {
    const continuation = judge(
      'Automatische Entscheidung [25.08.2026]: Der Batch läuft weiter, weil die Meldung „PARALLEL batch sessions" ' +
        'wiederholt unbeantwortet blieb. Retroaktives Veto: Antworte auf diese Karte mit „Veto".',
    )
    expect(continuation.ok).toBe(false)
    const corruption = judge('Automatische Entscheidung: Die Korruptionsklasse führt den benannten Reparaturlauf aus. Nächster Versuch: 15:10.')
    expect(corruption.ok).toBe(false)
  })
})

describe('judgeAutomatedCard — what stays admissible', () => {
  it('admits a genuine choice with its options', () => {
    expect(judge('Soll das Dorf an die gemessene Position ziehen oder auf der historischen Karte bleiben?').ok).toBe(true)
  })

  it('admits the self-decided record, because it names both of the user\'s options', () => {
    const body =
      'Entscheidung: Die Höhenkarte wird neu gerastert. Evidenz: Die Messung vom 24.08.2026. ' +
      'Folge: Die Dörfer verschieben sich um bis zu 300 m. Deine Möglichkeiten: die Entscheidung stehen lassen, ' +
      'oder sie zurücknehmen — exakte Veto-Aktion: antworte „Veto Rasterung".'
    expect(judge(body).ok).toBe(true)
  })

  it('admits a blocked finding that says what can be done with it', () => {
    const body =
      'Der Befund braucht eine Grundsatzentscheidung. Deine Möglichkeiten: den Befund als Punkt aufnehmen, ' +
      'oder ihn verwerfen.'
    expect(judge(body).ok).toBe(true)
  })

  it('refuses an incomplete card outright rather than writing half of one', () => {
    expect(judge('', 'Titel').ok).toBe(false)
    expect(judge('Optionen: A oder B.', '').ok).toBe(false)
  })
})
