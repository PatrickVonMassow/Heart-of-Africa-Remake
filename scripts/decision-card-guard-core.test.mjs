// THE DECISION-CARD GUARD, proved on the shapes the project's own replies have.
//
// The rule (point 421, user 29.07.2026): a request for a user DECISION exists as a
// card in "Von dir zu klären". The chat may carry it as well, never instead — the
// user writes there and does not read there, so a question put only into a reply
// was never asked. What is pinned here is the FAIL DIRECTION as much as the logic:
// a false block costs one turn, a false pass costs a decision the user never sees.
import { describe, expect, it } from 'vitest'
import {
  DECISION_PHRASES,
  MIN_WORD_LENGTH,
  REMEDY,
  asksForDecision,
  contentWords,
  evaluate,
  matchingCard,
  topicWords,
} from './decision-card-guard-core.mjs'

// The observed case: a typography decision put to the user with three options.
const TYPOGRAPHY_ASK =
  '**Montag, 29.07.2026, 14:02** Die Kartenschrift ist gesetzt. Welche Variante willst du: ' +
  'die enge Kapitälchen-Version, die weite oder die gemischte?'

describe('a reply that asks the user to decide, with no card for it, BLOCKS', () => {
  it('blocks the observed typography question and names the one fixing command', () => {
    const v = evaluate({ replyText: TYPOGRAPHY_ASK, vdzkTitles: [] })
    expect(v.block).toBe(true)
    expect(v.reason).toContain(REMEDY)
    // The block has to say WHAT it saw, or the fix is guesswork.
    expect(v.reason).toContain('Welche Variante willst du')
  })

  it('blocks on a decision PHRASING that carries no question mark at all', () => {
    const v = evaluate({ replyText: 'Sag mir, welche Kartenschrift bleiben soll.', vdzkTitles: [] })
    expect(v.block).toBe(true)
    expect(v.trigger ?? v.reason).toContain('phrase:')
  })

  it('names the cards the board DOES hold, so a wrong-topic card is visible as such', () => {
    const v = evaluate({ replyText: TYPOGRAPHY_ASK, vdzkTitles: ['WebGPU-Bild auf deinem Rechner prüfen'] })
    expect(v.block).toBe(true)
    expect(v.reason).toContain('WebGPU-Bild auf deinem Rechner prüfen')
  })
})

describe('a card for the question lets the turn end', () => {
  it('passes when a VDZK card title shares a topic word with the question', () => {
    const v = evaluate({ replyText: TYPOGRAPHY_ASK, vdzkTitles: ['Kartenschrift: enge, weite oder gemischte Variante'] })
    expect(v).toEqual({ block: false, reason: null })
  })

  it('passes for a card written in THIS turn, whatever it is called', () => {
    const v = evaluate({ replyText: TYPOGRAPHY_ASK, vdzkTitles: ['Frage von 14:02'], cardAddedThisTurn: true })
    expect(v.block).toBe(false)
  })
})

describe('the fail direction is deliberate — a rhetorical question blocks too', () => {
  // NAMED as the trade it is: this is not a bug. A guard that tried to tell a
  // rhetorical question from a real one would need intent, and the one it got
  // wrong would be the decision the user never saw.
  it('blocks a rhetorical question inside a status sentence while only an unrelated card stands', () => {
    const reply =
      '**Montag, 29.07.2026, 14:02** Punkt 411 ist grün. Warum hat das so lange gedauert? ' +
      'Die Suite lief zweimal, weil die erste Runde auf einer belasteten Maschine kippte.'
    const v = evaluate({ replyText: reply, vdzkTitles: ['Zeitplan für die v0.3-Auslieferung'] })
    expect(v.block).toBe(true)
    // And it says how to get out without a card: drop the question form.
    expect(v.reason).toContain('rewrite the sentence without the question')
  })

  it('lets a reply with no question and no decision phrasing through', () => {
    const reply =
      '**Montag, 29.07.2026, 14:02** Punkt 424 ist umgesetzt und gepusht. Die Frist der Zustellung ' +
      'liegt jetzt bei drei Minuten, die Tests sind grün, die Tafel ist aktuell.'
    expect(evaluate({ replyText: reply, vdzkTitles: [] })).toEqual({ block: false, reason: null })
  })

  it('does not read a question mark inside code or a quoted command as a question', () => {
    const reply = 'Der Abgleich läuft über `node scripts/board-publish.mjs --check?dry=1` und ist grün.'
    expect(evaluate({ replyText: reply, vdzkTitles: [] }).block).toBe(false)
  })
})

describe('fail-open: what cannot be read is never a violation', () => {
  it('allows the stop for a missing or empty reply', () => {
    for (const bad of [undefined, null, '', '   ', 42]) {
      expect(evaluate({ replyText: bad, vdzkTitles: [] })).toEqual({ block: false, reason: null })
    }
  })

  it('allows the stop for a board whose VDZK section could not be parsed (null titles)', () => {
    expect(evaluate({ replyText: TYPOGRAPHY_ASK, vdzkTitles: null })).toEqual({ block: false, reason: null })
    expect(evaluate({ replyText: TYPOGRAPHY_ASK })).toEqual({ block: false, reason: null })
    expect(evaluate()).toEqual({ block: false, reason: null })
  })
})

// The four-eyes review (Fable 5, 30.07.2026) found these by probing, and they are
// the costly direction: each one PASSED a decision the user would never have seen.
describe('the false passes the four-eyes review found', () => {
  it('does not accept a card connected only by a project-generic word', () => {
    const v = evaluate({
      replyText: 'Soll ich die offenen Punkte vor dem Release mergen?',
      vdzkTitles: ['Offene Punkte der Typografie'],
    })
    expect(v.block).toBe(true)
  })

  it('does not let the mandated timestamp header connect a question to any card', () => {
    // "montag" and "2026" used to enter the first sentence's topic set, because
    // the sentence split only fires after `.!?` and the header has neither.
    const v = evaluate({
      replyText: '**Montag, 29.07.2026, 14:02** Soll ich mergen?',
      vdzkTitles: ['Montag-Termin für den 2026er Umzug'],
    })
    expect(v.block).toBe(true)
    expect(contentWords('**Montag, 29.07.2026, 14:02** Text').has('2026')).toBe(false)
  })

  it('blocks an imperative decision that never asks a question', () => {
    for (const reply of ['Bitte wähle die enge oder die weite Variante.', 'Sag bescheid, welche bleibt.']) {
      expect(evaluate({ replyText: reply, vdzkTitles: [] }).block, reply).toBe(true)
    }
  })

  it('still passes on a genuinely shared topic — one long word, or two short ones', () => {
    expect(evaluate({ replyText: 'Welche Kartenschrift?', vdzkTitles: ['Kartenschrift entscheiden'] }).block).toBe(false)
    // "enge" + "weite" — two short words that together name the same choice.
    expect(
      evaluate({ replyText: 'Enge oder weite Version?', vdzkTitles: ['Enge gegen weite Version'] }).block,
    ).toBe(false)
  })
})

describe('the parts', () => {
  it('detects every documented decision phrasing', () => {
    for (const p of DECISION_PHRASES) {
      expect(asksForDecision(`Kurzstand. ${p} bitte.`).asks, p).toBe(true)
    }
  })

  it('reports which sentences asked, not the whole reply', () => {
    const ask = asksForDecision('Erstens: alles grün. Welche Variante nehmen wir? Danach mache ich weiter.')
    expect(ask.questions).toEqual(['Welche Variante nehmen wir?'])
    expect(ask.trigger).toBe('question-mark')
  })

  it('drops function words and anything shorter than the minimum from the topic set', () => {
    const words = contentWords('Welche Variante willst du für die Kartenschrift?')
    expect(words.has('variante')).toBe(true)
    expect(words.has('kartenschrift')).toBe(true)
    expect(words.has('welche')).toBe(false)
    expect(words.has('die')).toBe(false)
    for (const w of words) expect(w.length).toBeGreaterThanOrEqual(MIN_WORD_LENGTH)
  })

  it('matches a card on a shared topic word and reports which one', () => {
    expect(matchingCard(['Welche Kartenschrift?'], ['Kartenschrift entscheiden'])).toEqual({
      title: 'Kartenschrift entscheiden',
      word: 'kartenschrift',
    })
    expect(matchingCard(['Welche Kartenschrift?'], ['Deploy-Zeitpunkt'])).toBeNull()
    expect(matchingCard([], ['Kartenschrift'])).toBeNull()
    expect(matchingCard(null, null)).toBeNull()
  })
})

// The block demanded a card whose TITLE matches, then described the matching
// rule in prose the writer had to reverse-engineer — so a title written blind
// matched by luck and a second miss cost a second turn (point 437 E).
describe('the block reason names the words a matching title must share', () => {
  it('names the strong words that carry a match on their own', () => {
    const v = evaluate({
      replyText: 'Welche Kartenschrift soll die Karte tragen?',
      vdzkTitles: ['Deploy-Zeitpunkt'],
    })
    expect(v.block).toBe(true)
    expect(v.reason).toContain('kartenschrift')
    expect(v.reason).toMatch(/SHARE the question's topic/)
  })

  it('demands TWO words when the question carries no strong one', () => {
    const v = evaluate({ replyText: 'Willst du Rot oder Blau als Farbe?', vdzkTitles: ['Deploy'] })
    expect(v.block).toBe(true)
    expect(v.reason).toMatch(/at least TWO of them/)
    expect(v.reason).toContain('farbe')
  })

  it('extracts the topic words longest first, function words dropped', () => {
    const words = topicWords(['Welche Kartenschrift willst du für die Karte?'])
    expect(words[0]).toBe('kartenschrift')
    expect(words).not.toContain('welche')
  })

  it('is total on rubbish', () => {
    expect(topicWords()).toEqual([])
    expect(topicWords('not a list')).toEqual([])
  })
})
