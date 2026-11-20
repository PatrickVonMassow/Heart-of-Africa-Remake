// The derived "Von dir zu klären" cards: a typed gate yields its card on every
// rebuild, a broken marker a fallback card, an ungated point whose text names a
// wait a "vielleicht" card — and none of them refuses anything.
import { describe, expect, it } from 'vitest'
import { auditDashboard, parseKlaerungPoints, parseQueuePoints } from './dashboard-guard-core.mjs'
import { evaluate as evaluateTopic } from './dashboard-card-topic-guard-core.mjs'
import { boardHtml } from './dashboard-guard-fixtures.mjs'
import {
  DERIVED_VDZK_ATTR,
  applyDerivedVdzk,
  buildQueueSection,
  derivedUserWaitCards,
  headSkipAdvisory,
} from './board-queue-core.mjs'
import { gateSets, markGated } from './user-gate-core.mjs'

const userInput = {
  act: 'user-input',
  detail: 'run the F8 detail benchmark on the notebook, hand back: local/f8-detail-notebook.json plus a chat note, where: the Windows checkout',
  prepared: 'the measuring branch is pushed and waits unchanged',
}
const gate = (text, point, fields = userInput) => {
  const r = markGated(text, point, { since: '2026-11-20', ...fields })
  if (!r.ok) throw new Error(r.error)
  return r.text
}
const tasks = (...lines) => `# Work order\n${lines.join('\n')}\n`

describe('derivedUserWaitCards — one card per open gate, all four acts', () => {
  it('derives a gate card keyed by point number for every act', () => {
    let text = tasks('- [ ] 1543. Driving hitches', '- [ ] 12. Tag it', '- [ ] 13. Plain work')
    text = gate(text, 1543)
    text = gate(text, 12, { act: 'release-tag', detail: 'push the v1.2.0 tag', prepared: 'the build is verified locally' })
    const cards = derivedUserWaitCards(text, { titles: { 1543: 'Ruckler beim Fahren' } })
    expect(cards.map((c) => [c.point, c.kind, c.owns])).toEqual([[1543, 'gate', true], [12, 'gate', true]])
    expect(cards[0].title).toBe('1543 — Wartet auf dich: Ruckler beim Fahren')
    expect(cards[0].paragraphs.join(' ')).toContain('Zurückgeben: local/f8-detail-notebook.json plus a chat note')
    expect(cards[0].paragraphs.join(' ')).toContain('Wohin: the Windows checkout')
  })

  it('is gone once the gate is cleared or the point is closed', () => {
    const gated = gate(tasks('- [ ] 1543. Driving hitches'), 1543)
    expect(derivedUserWaitCards(gated)).toHaveLength(1)
    expect(derivedUserWaitCards(tasks('- [ ] 1543. Driving hitches USER-ANSWERED(2026-11-21)'))).toHaveLength(0)
    expect(derivedUserWaitCards(gated.replace('- [ ]', '- [x]'))).toHaveLength(0)
  })

  it('skips a point a current-work card already shows', () => {
    expect(derivedUserWaitCards(gate(tasks('- [ ] 1543. X'), 1543), { skip: [1543] })).toHaveLength(0)
  })

  it('renders a fallback card for a marker that does not parse', () => {
    const typedButBroken = tasks('- [ ] 77. Broken AWAITING-CONFIRMATION(2026-11-20; user-input: run it, safe prepared state: nothing is out yet)')
    const unclosed = tasks('- [ ] 78. Cut AWAITING-CONFIRMATION(2026-11-20; user-input: run the benchmark')
    for (const [text, point] of [[typedButBroken, 77], [unclosed, 78]]) {
      const [card] = derivedUserWaitCards(text)
      expect(card).toMatchObject({ point, kind: 'malformed', owns: false })
      expect(card.title).toBe(`Punkt ${point} wartet auf dich – Marker fehlerhaft`)
      expect(card.paragraphs.join(' ')).toContain('Roher Text: AWAITING-CONFIRMATION(')
    }
  })
})

describe('the text fallback — "vielleicht" cards for ungated points', () => {
  it('matches the phrase set on open ungated points, in head line and continuation', () => {
    const text = tasks(
      '- [ ] 1552. Fix the inversion. WAITS FOR the notebook run.',
      '- [ ] 20. Something',
      '  continuation: this waits on the user before it can land',
      '- [ ] 21. Ask for data WAITING ON the export',
      '- [ ] 22. Needs a file from the user.',
      '- [ ] 23. Ordinary work that waits for nothing in particular',
    )
    const cards = derivedUserWaitCards(text)
    expect(cards.map((c) => [c.point, c.kind])).toEqual([[1552, 'maybe'], [20, 'maybe'], [21, 'maybe'], [22, 'maybe']])
    expect(cards[0].title).toBe('Punkt 1552 wartet vielleicht auf dich (nur aus dem Text erkannt, nicht bestätigt)')
    expect(cards[0].owns).toBe(false)
  })

  it('a gated point quoting the phrase gets only its real card; a closed one none', () => {
    const gated = gate(tasks('- [ ] 30. Run it. WAITS FOR the notebook'), 30)
    expect(derivedUserWaitCards(gated).map((c) => c.kind)).toEqual(['gate'])
    expect(derivedUserWaitCards(tasks('- [x] 31. Done. WAITS FOR nothing now'))).toEqual([])
    expect(derivedUserWaitCards(tasks('- [ ] 32. DEFERRED. WAITS FOR the user'))).toEqual([])
    // A phrase merely QUOTED (as in a point that specifies this fallback) is no hit.
    expect(derivedUserWaitCards(tasks('- [ ] 33. Scan for (`WAITS FOR`, "WAITING ON", "from the user.")'))).toEqual([])
  })
})

describe('applyDerivedVdzk — rendered into "Von dir zu klären", rebuilt each time', () => {
  const text = gate(
    tasks('- [ ] 210. Now', '- [ ] 211. Queued', '- [ ] 204. Measure WAITS FOR the notebook', '- [ ] 1543. Hitches'),
    1543,
  )
  const known = [210, 211, 204, 1543]

  it('puts the derived cards on the board, replaces a manual gate card once and never doubles', () => {
    const board = boardHtml({ queue: [211, 204, 1543], klaerungExtra: ['1543 — Notebook-Lauf bitte', 'Allgemeine Frage'] })
    const cards = derivedUserWaitCards(text, { skip: [210] })
    const first = applyDerivedVdzk(board, cards, { knownPoints: known })
    expect(first.removed).toEqual(['1543 — Notebook-Lauf bitte'])
    expect(first.html).toContain('Allgemeine Frage')
    const second = applyDerivedVdzk(first.html, cards, { knownPoints: known })
    expect(second.html).toBe(first.html)
    expect(second.html.split(DERIVED_VDZK_ATTR)).toHaveLength(3)
    expect([...parseKlaerungPoints(second.html, { knownPoints: known })]).toEqual([1543])
    // A cleared gate takes its card with it on the next build.
    const cleared = applyDerivedVdzk(second.html, [], { knownPoints: known })
    expect(cleared.html).not.toContain(DERIVED_VDZK_ATTR)
  })

  it('the gated point leaves the queue; the board passes audit and topic guard', () => {
    const board = boardHtml({ queue: [211, 204, 1543] })
    const cards = derivedUserWaitCards(text, { skip: [210] })
    const withVdzk = applyDerivedVdzk(board, cards, { knownPoints: known }).html
    const built = buildQueueSection(withVdzk, {
      open: [211, 204, 1543],
      exclude: [210, ...cards.filter((c) => c.owns).map((c) => c.point)],
      gates: gateSets(text),
      data: { points: { 211: { body: 'Text.', estimate: '~1 h' }, 204: { body: 'Text.', estimate: '~1 h' } } },
    })
    expect([...parseQueuePoints(built.html)]).toEqual([211, 204])
    const audit = auditDashboard(built.html, { open: [210, 211, 204, 1543], done: [209] })
    expect(audit.filter((v) => ['dup-in-section', 'empty-body', 'duplicate-card-title'].includes(v.code))).toEqual([])
    expect(evaluateTopic({ dashboardHtml: built.html, tasksText: text }).block).toBe(false)
  })

  it('leaves a board without the section unchanged', () => {
    expect(applyDerivedVdzk('<main></main>', derivedUserWaitCards(text))).toEqual({ html: '<main></main>', removed: [] })
  })
})

describe('headSkipAdvisory — stateless, advisory only', () => {
  const open = [5, 6, 7]
  it('fires when the ungated head is not in flight while something else is', () => {
    expect(headSkipAdvisory({ open, inFlight: [6] })).toBe('head point 5 skipped without gate: work it or defer-for-user --act user-input')
  })
  it('stays silent when the head is the focus, nothing is in flight, or the head is gated', () => {
    expect(headSkipAdvisory({ open, inFlight: [5] })).toBe('')
    expect(headSkipAdvisory({ open, inFlight: [] })).toBe('')
    const gates = gateSets(gate(tasks('- [ ] 5. A', '- [ ] 6. B', '- [ ] 7. C'), 5))
    expect(headSkipAdvisory({ open, gates, inFlight: [6] })).toBe('')
  })
})
