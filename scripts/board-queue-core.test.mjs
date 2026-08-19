// Pure sweep of the DERIVED QUEUE (point 400, delta C).
//
// The two failures this projection is built to make impossible are the ones
// under test hardest: a point that silently drops off the board (the staleness
// the whole point exists to end), and a point listed TWICE because the generator
// re-added a card the now-section had already taken (invariant 4b of
// dashboard-guard-core, which is right to block — a reader would see one point
// as simultaneously in progress and waiting).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { auditDashboard, findTransliterations, parseQueuePoints, QUEUE_STUB_META } from './dashboard-guard-core.mjs'
import { boardMissingPoints } from './board-currency-core.mjs'
import { queueCard, toNow } from './board-core.mjs'
import { concisenessOffenders } from './dashboard-conciseness-guard-core.mjs'
import { evaluate as evaluateTopic } from './dashboard-card-topic-guard-core.mjs'
import {
  FINDER_POINTS,
  RELEASE_TAG_POINT,
  QUEUE_STUB_BODY,
  assertNotFlagValue,
  boardTitleReport,
  buildQueueSection,
  importQueueFromHtml,
  isUntranslatedTitle,
  mergeQueueImport,
  normaliseQueueData,
  openPointsOf,
  paragraphs,
  parseQueueDataFile,
  queueImportOffenders,
  parseSetArgs,
  parseTaskTitles,
  queueEntries,
  queueOrder,
  blockedCardTitle,
  boardSafeTitle,
  renderQueueCard,
  renderRequestsCard,
  setQueueEntry,
  unestimatedPoints,
  untranslatedTitlePoints,
  QUEUE_GATED_META,
  gatedEntryPoints,
  gatedMeta,
  normaliseGates,
  frontCandidates,
  commissionDecision,
  commissionRefusal,
  COMMISSION_OVERRIDE_CMD,
} from './board-queue-core.mjs'
import { gateSets } from './user-gate-core.mjs'
import { POOL_CAP } from './batch-in-flight-core.mjs'

const board = (queue) => `<title>B</title>
<main><h1>Dashboard</h1>
<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>
<details class="now"><summary><span class="t">210 — Arbeit</span>
<span class="right"><span class="meta">09:00 · bis ~23:00</span></span></summary>
<div class="body"><p>Status (Stand 09:00): läuft.</p></div></details>
</details>
<details class="sect"><summary><h2>Von dir zu klären</h2></summary>
</details>
<details class="sect"><summary><h2>Warteschlange</h2></summary>
${queue}
</details>
<details class="sect">
<summary><h2>Erledigt</h2></summary>
<p class="archive-link">Ältere im <a href="https://example.invalid/archiv">Archiv</a>.</p>
</details>
</main>`

describe('normaliseQueueData — a hand-editable file must degrade, never throw', () => {
  it('keeps the prose and drops everything hostile', () => {
    const d = normaliseQueueData({ points: { 5: { body: ' b ' }, 0: { body: 'n' }, z: {} } })
    expect(d.points).toEqual({ 5: { title: null, body: ['b'], estimate: null } })
  })
  it('survives junk of every shape', () => {
    for (const raw of [null, undefined, 'x', 42, [], { points: 'no' }, { order: 'no' }]) {
      expect(() => normaliseQueueData(raw)).not.toThrow()
      expect(normaliseQueueData(raw)).toEqual({ points: {} })
    }
  })
  // POINT 608: the file used to carry its own `order`, and the two drifted.
  it('drops a stored order rather than giving the sequence a second home', () => {
    expect(normaliseQueueData({ order: [3, 2], points: {} })).toEqual({ points: {} })
  })
})

describe('queueOrder — the WORK ORDER is the sequence (point 608)', () => {
  it('renders the open points in the sequence the work order lists them', () => {
    expect(queueOrder([9, 4, 7, 2])).toEqual([9, 4, 7, 2])
  })
  it('re-sequencing the work order re-sequences the queue, with nothing else edited', () => {
    expect(queueOrder([2, 7, 4, 9])).toEqual([2, 7, 4, 9])
  })
  it('ignores a stored order — a leftover file may not steer the board any more', () => {
    // The old second argument WAS the data file. Handing it in now must change
    // nothing, or the drift this point ended could come back through a stale call.
    expect(queueOrder([9, 4, 7, 2], { order: [7, 4] })).toEqual([9, 4, 7, 2])
  })
  it('drops duplicates and anything that is not a point number', () => {
    expect(queueOrder([9, 9, 0, -1, 'x', 4])).toEqual([9, 4])
  })
  it('pushes the bug-FINDING points behind the fixes, by construction', () => {
    const finder = [...FINDER_POINTS][0]
    expect(queueOrder([finder, 999])).toEqual([999, finder])
  })
  it('keeps the release tag where the work order put it, ahead of the finder block', () => {
    // User 10.08.2026: v0.3 ships once the communication mechanic and the critical
    // bugs are done. The finders and audits are POST-release work, so they sink
    // past the tag instead of gating it — while an ordinary fix keeps whatever
    // position the work order gave it.
    const finder = [...FINDER_POINTS][0]
    expect(queueOrder([999, RELEASE_TAG_POINT, finder])).toEqual([999, RELEASE_TAG_POINT, finder])
    expect(queueOrder([finder, RELEASE_TAG_POINT, 999])).toEqual([RELEASE_TAG_POINT, 999, finder])
  })
  it('keeps two finders in their work-order sequence behind the fixes', () => {
    const [a, b] = [...FINDER_POINTS]
    expect(queueOrder([b, 999, a])).toEqual([999, b, a])
  })
})

describe('queueEntries — every open point gets a card, and never two', () => {
  it('emits a STUB rather than nothing for a point with no prose', () => {
    const [e] = queueEntries({ open: [412], titles: { 412: 'Der Titel' } })
    expect(e).toMatchObject({ point: 412, title: 'Der Titel', body: [QUEUE_STUB_BODY], meta: QUEUE_STUB_META, stub: true })
  })
  it('falls back to the bare number when even the work order names nothing', () => {
    expect(queueEntries({ open: [412] })[0].title).toBe('Punkt 412')
  })
  it('prefers the board prose over the work-order headline', () => {
    const data = { points: { 412: { title: 'Board-Titel', body: 'Der Text.', estimate: '~3 h' } } }
    expect(queueEntries({ open: [412], data, titles: { 412: 'TASKS-Titel' } })[0]).toMatchObject({
      title: 'Board-Titel',
      body: ['Der Text.'],
      meta: '~3 h',
      stub: false,
    })
  })
  it('REFUSES to re-add a point another section already claims', () => {
    // The double-listing trap: the point moved to the now-card must not come
    // back as a queue card, or invariant 4b blocks the very turn that published.
    expect(queueEntries({ open: [210, 412], exclude: [210] }).map((e) => e.point)).toEqual([412])
    expect(queueEntries({ open: [210], exclude: new Set([210]) })).toEqual([])
  })
})

describe('the user gate (point 450) — a point waiting on the user never jams the queue', () => {
  const gates = (...lines) => gateSets(lines.join('\n'))

  it('moves a gated point behind every workable one, whatever the work order says', () => {
    const g = gates('- [ ] 7. GATED AWAITING-USER(2026-07-29; needs a ruling)')
    expect(queueOrder([7, 8, 9], g)).toEqual([8, 9, 7])
  })

  it('keeps several gated points out of the way at once, in their work-order sequence', () => {
    const g = gates(
      '- [ ] 7. A AWAITING-USER(2026-07-29; a)',
      '- [ ] 8. B AWAITING-USER(2026-07-30; b)',
    )
    expect(queueOrder([7, 8, 9], g)).toEqual([9, 7, 8])
  })

  it('puts an ANSWERED point back at the very HEAD, ahead of work appended while it waited', () => {
    const g = gates('- [ ] 9. ANSWERED USER-ANSWERED(2026-08-07)')
    expect(queueOrder([7, 8, 9], g)).toEqual([9, 7, 8])
  })

  it('lets an answered point outrank even the head of the work order', () => {
    const g = gates('- [ ] 9. ANSWERED USER-ANSWERED(2026-08-07)', '- [ ] 7. GATED AWAITING-USER(2026-01-01; why)')
    expect(queueOrder([7, 8, 9], g)).toEqual([9, 8, 7])
  })

  it('orders exactly as the work order does when nothing is gated', () => {
    expect(queueOrder([9, 4, 7, 2], null)).toEqual(queueOrder([9, 4, 7, 2]))
    expect(queueOrder([9, 4], gates('- [ ] 4. PLAIN POINT.'))).toEqual([9, 4])
  })

  it('takes the raw work order as its gate argument, not only a parsed one', () => {
    const tasks = '- [ ] 7. GATED AWAITING-USER(2026-07-29; needs a ruling)\n- [ ] 8. B.\n- [ ] 9. C.'
    expect(queueOrder([7, 8, 9], tasks)).toEqual([8, 9, 7])
  })

  it('marks the card as waiting on the USER instead of promising a duration', () => {
    const g = gates('- [ ] 7. GATED AWAITING-USER(2026-07-29; needs a ruling)')
    const data = { points: { 7: { title: 'Gattertitel', body: 'Der Text.', estimate: '~3 h' } } }
    const [e] = queueEntries({ open: [7], data, gates: g })
    expect(e.gated).toBe(true)
    expect(e.meta).toBe(`${QUEUE_GATED_META} (seit 29.07.)`)
    expect(e.body).toEqual(['Der Text.'])
    expect(gatedEntryPoints([e])).toEqual([7])
  })

  it('omits the date when the gate carries none, and says nothing about a normal card', () => {
    expect(gatedMeta('')).toBe(QUEUE_GATED_META)
    expect(gatedMeta('nonsense')).toBe(QUEUE_GATED_META)
    const [plain] = queueEntries({ open: [7], data: { points: { 7: { body: 'X', estimate: '~1 h' } } } })
    expect(plain.gated).toBe(false)
    expect(plain.meta).toBe('~1 h')
    expect(gatedEntryPoints([plain])).toEqual([])
  })

  it('KEEPS the gated point on the board — a skipped point is never a dropped one', () => {
    const g = gates('- [ ] 7. GATED AWAITING-USER(2026-07-29; why)')
    expect(queueEntries({ open: [7, 8], gates: g }).map((e) => e.point)).toEqual([8, 7])
  })

  it('does not nag for an estimate the gate itself forbids', () => {
    const g = gates('- [ ] 7. GATED AWAITING-USER(2026-07-29; why)')
    const entries = queueEntries({ open: [7], gates: g })
    expect(unestimatedPoints(entries)).toEqual([])
  })

  it('passes the board audit with the gated meta — no block loop while the user is away', () => {
    const g = gates('- [ ] 412. GATED AWAITING-USER(2026-07-29; why)')
    const { html } = buildQueueSection(board(''), { open: [210, 412], exclude: [210], titles: { 412: 'Neu' }, gates: g })
    expect(html).toContain(QUEUE_GATED_META)
    expect(auditDashboard(html, { open: [210, 412], done: [], nowMinutes: 9 * 60 }).map((x) => x.code)).not.toContain('queue-meta')
  })

  it('never imports the gated meta back as the point’s estimate', () => {
    const g = gates('- [ ] 412. GATED AWAITING-USER(2026-07-29; why)')
    const { html } = buildQueueSection(board(''), { open: [412], titles: { 412: 'Neu' }, gates: g })
    const imported = importQueueFromHtml(html)
    expect(imported.points[412].estimate).toBeNull()
    expect(imported.points[412].gated).toBe(true)
    expect(boardTitleReport(html, { 412: 'Neu' }).unestimated).not.toContain(412)
    // …and the flag never reaches the stored data file.
    expect(normaliseQueueData(imported).points[412]).not.toHaveProperty('gated')
  })

  it('normaliseGates takes text, a parsed result or nothing at all', () => {
    expect(normaliseGates(null).gated.size).toBe(0)
    expect(normaliseGates(undefined).answered.size).toBe(0)
    expect([...normaliseGates('- [ ] 3. X AWAITING-USER(2026-01-01; y)').gated]).toEqual([3])
    expect([...normaliseGates(gates('- [ ] 3. X AWAITING-USER(2026-01-01; y)')).gated]).toEqual([3])
  })
})

describe('buildQueueSection — the projection replaces the section, nothing else', () => {
  it('rebuilds the queue and leaves every other section untouched', () => {
    const before = board('<details><summary><span class="num">1</span><span class="t">alt</span><span class="right"><span class="meta">~1 h</span></span></summary><div class="body"><p>alt</p></div></details>')
    const { html, entries } = buildQueueSection(before, { open: [210, 412], exclude: [210], titles: { 412: 'Neu' } })
    expect(entries.map((e) => e.point)).toEqual([412])
    expect(html).toContain('>Neu<')
    expect(html).not.toContain('>alt<')
    expect(html).toContain('<h2>Erledigt</h2>')
    expect(html).toContain('210 — Arbeit')
    expect(html).toContain('archive-link')
  })
  it('says so loudly when there is no Warteschlange to project into', () => {
    expect(() => buildQueueSection('<main></main>', { open: [1] })).toThrow(/Warteschlange/)
  })
})

describe('the generated board passes its own audit — no block loop', () => {
  // The rule this pins is the one the spec demanded be settled in the design and
  // not in a debugger: a stub card carries no "~<n> h", so without the named
  // exemption the audit would refuse to attest a board only the generator can
  // produce, and the session would be stuck between two guards.
  const audit = (html, open) => auditDashboard(html, { open, done: [], nowMinutes: 9 * 60 })

  it('accepts the unestimated stub the generator emits', () => {
    const { html } = buildQueueSection(board(''), { open: [210, 412], exclude: [210], titles: { 412: 'Neu' } })
    expect(audit(html, [210, 412]).map((x) => x.code)).not.toContain('queue-meta')
  })

  it('still rejects a meta that merely failed to parse', () => {
    const bad = renderQueueCard({ point: 412, title: 'Neu', body: 'Text.', meta: 'irgendwann' })
    expect(audit(board(bad), [210, 412]).map((x) => x.code)).toContain('queue-meta')
  })

  it('and a real estimate passes as it always did', () => {
    const good = renderQueueCard({ point: 412, title: 'Neu', body: 'Text.', meta: '~2 h' })
    expect(audit(board(good), [210, 412]).map((x) => x.code)).not.toContain('queue-meta')
  })
})

describe('renderQueueCard — the markup the guard parsers read, and no injection', () => {
  it('escapes everything that came from a data file', () => {
    const html = renderQueueCard({ point: 7, title: '<script>x</script>', body: 'a & b', meta: '~1 h' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a &amp; b')
    expect(html).toMatch(/<span class="num">7<\/span>/)
  })

  // The hand-kept board carried two or three paragraphs per card; the projection
  // that replaced it could emit only one, which turns a restored body into the
  // long unbroken paragraph the conciseness guard rejects.
  it('renders one <p> per paragraph, and still accepts a bare string', () => {
    const many = renderQueueCard({ point: 9, title: 'Neun', body: ['Erster.', 'Zweiter.'], meta: '~1 h' })
    expect(many.match(/<p>/g)).toHaveLength(2)
    expect(many).toContain('<p>Erster.</p>')
    expect(many).toContain('<p>Zweiter.</p>')

    const one = renderQueueCard({ point: 9, title: 'Neun', body: 'Nur einer.', meta: '~1 h' })
    expect(one.match(/<p>/g)).toHaveLength(1)
  })

  it('drops empty paragraphs rather than rendering a blank one', () => {
    const html = renderQueueCard({ point: 9, title: 'Neun', body: ['Da.', '   ', ''], meta: '~1 h' })
    expect(html.match(/<p>/g)).toHaveLength(1)
  })
})

describe('paragraphs — a body is a list, however it was written', () => {
  it('normalises both shapes and refuses nothing else', () => {
    expect(paragraphs('Eins.')).toEqual(['Eins.'])
    expect(paragraphs(['Eins.', 'Zwei.'])).toEqual(['Eins.', 'Zwei.'])
    expect(paragraphs('  ')).toBeNull()
    expect(paragraphs([])).toBeNull()
    expect(paragraphs(null)).toBeNull()
    expect(paragraphs(42)).toBeNull()
  })

  it('splits a string on its BLANK LINES — stdin delivers one string (point 469)', () => {
    expect(paragraphs('Eins.\n\nZwei.')).toEqual(['Eins.', 'Zwei.'])
    // Windows line endings and an indented blank line separate just the same.
    expect(paragraphs('Eins.\r\n\r\nZwei.')).toEqual(['Eins.', 'Zwei.'])
    expect(paragraphs('Eins.\n \nZwei.')).toEqual(['Eins.', 'Zwei.'])
    // A SINGLE newline is a wrapped line, not a new paragraph.
    expect(paragraphs('Eins.\nnoch eins.')).toEqual(['Eins.\nnoch eins.'])
    // Already-split bodies keep working, and a member may split further.
    expect(paragraphs(['Eins.\n\nZwei.', 'Drei.'])).toEqual(['Eins.', 'Zwei.', 'Drei.'])
    expect(paragraphs('\n\n')).toBeNull()
  })

  it('survives a stored array in normaliseQueueData', () => {
    const { points } = normaliseQueueData({ points: { 5: { body: ['A.', 'B.'] } } })
    expect(points[5].body).toEqual(['A.', 'B.'])
  })
})

describe('the one-time import from a hand-written board', () => {
  it('reads back the prose and a real estimate, but no sequence', () => {
    const html = board(
      renderQueueCard({ point: 8, title: 'Acht', body: 'Text acht.', meta: '~2 h' }) +
        renderQueueCard({ point: 3, title: 'Drei', body: 'Text drei.', meta: QUEUE_STUB_META }),
    )
    const data = importQueueFromHtml(html)
    // POINT 608: the card sequence is the work order's, so importing it back
    // would re-create the second home the point removed.
    expect(data.order).toBeUndefined()
    expect(data.points[8]).toEqual({ title: 'Acht', body: ['Text acht.'], estimate: '~2 h' })
    // The stub meta is not an estimate anybody made — it must not be imported
    // as one, or the point would look estimated for ever.
    expect(data.points[3].estimate).toBeNull()
  })
  it('returns an empty projection rather than throwing on a board with no queue', () => {
    expect(importQueueFromHtml('<main></main>')).toEqual({ points: {} })
  })

  // POINT 530: the round trip data → board → data is what destroyed 46 cards.
  it('keeps every rendered <p> as its own paragraph', () => {
    const body = ['Erster Absatz.', 'Zweiter Absatz.', 'Dritter Absatz.']
    const html = board(renderQueueCard({ point: 9, title: 'Neun', body, meta: '~2 h' }))
    expect(importQueueFromHtml(html).points[9].body).toEqual(body)
  })
  it('reads a hand-written card that has no <p> at all', () => {
    const html = board('<details>\n  <summary><span class="num">7</span><span class="t">Sieben</span></summary>\n  <div class="body">Roher Text.</div>\n</details>\n')
    expect(importQueueFromHtml(html).points[7].body).toEqual(['Roher Text.'])
  })
  // FINDING 2: the card renders its title through `esc`, so an entity stored as
  // read would grow a layer on every round trip and never match the headline.
  it('stores the title unescaped, so it survives a round trip', () => {
    const title = 'Krieg & Frieden <1890>'
    const once = importQueueFromHtml(board(renderQueueCard({ point: 6, title, body: 'Text.', meta: '~1 h' })))
    expect(once.points[6].title).toBe(title)
    const twice = importQueueFromHtml(board(renderQueueCard({ point: 6, ...once.points[6], meta: '~1 h' })))
    expect(twice.points[6].title).toBe(title)
  })

  it('recognises an entity-carrying fallback title as still the work order’s', () => {
    const headline = 'BUY & SELL DIALOGS'
    const html = board(renderQueueCard({ point: 6, title: headline, body: 'Text.', meta: '~1 h' }))
    expect(boardTitleReport(html, { 6: headline }).untranslated).toEqual([6])
    expect(boardTitleReport(html, { 6: 'Etwas anderes' }).untranslated).toEqual([])
  })

  it('does not import the generator’s own stub as prose', () => {
    const html = board(renderQueueCard({ point: 4, title: 'Vier', body: null, meta: QUEUE_STUB_META }))
    expect(importQueueFromHtml(html).points[4].body).toBeNull()
  })
})

describe('a data file that does not parse stops the command (point 530, finding 1)', () => {
  it('reads a stored file and treats an absent or empty one as nothing yet', () => {
    expect(parseQueueDataFile('{"order":[5],"points":{}}')).toEqual({ order: [5], points: {} })
    expect(parseQueueDataFile(null)).toBeNull()
    expect(parseQueueDataFile(undefined)).toBeNull()
    expect(parseQueueDataFile('  \n ')).toBeNull()
  })

  it('refuses a torn file instead of reporting "nothing stored yet"', () => {
    // Treating this as null is what lets a rewrite drop every card the board
    // does not render — a point promoted to the now-section or to VDZK.
    expect(() => parseQueueDataFile('{"order":[5],"poi')).toThrow(/does not parse/)
    expect(() => parseQueueDataFile('{"a":1}x', { path: '.claude/board-queue.json' })).toThrow(
      /\.claude\/board-queue\.json/,
    )
  })
})

describe('import is additive — it may never destroy a stored body (point 530)', () => {
  const stored = {
    points: { 8: { title: 'Acht', body: ['Erster Absatz.', 'Zweiter Absatz.', 'Dritter Absatz.'], estimate: '~2 h' } },
  }

  it('keeps the stored paragraphs when the board says the same point differently', () => {
    const fromBoard = { points: { 8: { title: 'Eight', body: ['Alles in einem Block.'], estimate: '~9 h' } } }
    const { data, added, kept } = mergeQueueImport(stored, fromBoard)
    expect(data.points[8]).toEqual(stored.points[8])
    expect(added).toEqual([])
    expect(kept).toBe(1)
  })

  it('adds a point the data does not know yet, and stores no sequence for it', () => {
    const fromBoard = { points: { 12: { title: 'Zwölf', body: ['Neu.'], estimate: null } } }
    const { data, added } = mergeQueueImport(stored, fromBoard)
    expect(added).toEqual([12])
    expect(data.order).toBeUndefined()
    expect(data.points[12].body).toEqual(['Neu.'])
    expect(data.points[8].body).toEqual(stored.points[8].body)
  })

  it('fills only the fields the stored card has nothing for', () => {
    const partial = { points: { 5: { title: null, body: ['Text.'], estimate: null } } }
    const { data } = mergeQueueImport(partial, { points: { 5: { title: 'Fünf', body: ['Anders.'], estimate: '~3 h' } } })
    expect(data.points[5]).toEqual({ title: 'Fünf', body: ['Text.'], estimate: '~3 h' })
  })

  it('keeps a stored point the board no longer shows, and is pure', () => {
    const before = JSON.parse(JSON.stringify(stored))
    const { data } = mergeQueueImport(stored, { points: {} })
    expect(data.points[8]).toEqual(stored.points[8])
    expect(stored).toEqual(before)
  })

  it('imports neither an empty stub card nor a fallback title', () => {
    const fromBoard = {
      points: {
        4: { title: 'Punkt 4', body: null, estimate: null },
        5: { title: 'THE ENGLISH HEADLINE', body: null, estimate: null },
        6: { title: 'Ein deutscher Titel', body: null, estimate: null },
      },
    }
    const { data, added } = mergeQueueImport(null, fromBoard, { titles: { 5: 'THE ENGLISH HEADLINE' } })
    expect(added).toEqual([6])
    expect(Object.keys(data.points)).toEqual(['6'])
  })

  it('degrades to the board alone when there is no data file yet', () => {
    const { data, added, kept } = mergeQueueImport(null, { points: { 3: { body: ['A.'] } } })
    expect(added).toEqual([3])
    expect(kept).toBe(0)
    expect(data.points[3].body).toEqual(['A.'])
  })
})

describe('the conciseness budget is enforced at the IMPORT, not only at the turn end (point 530)', () => {
  const words = (n) => Array.from({ length: n }, (_, i) => `Wort${i}`).join(' ')

  it('reports a card that would land as one unbroken over-long paragraph', () => {
    const [offender, ...rest] = queueImportOffenders({ points: { 8: { body: [words(70)] } } })
    expect(rest).toEqual([])
    expect(offender.point).toBe(8)
    expect(offender.paragraphs).toBe(1)
    expect(offender.reason).toMatch(/unbroken/)
  })

  it('passes the same words once they are split into paragraphs', () => {
    expect(queueImportOffenders({ points: { 8: { body: [words(35), words(35)] } } })).toEqual([])
  })

  it('reports a body over the word budget however it is split', () => {
    const offenders = queueImportOffenders({ points: { 8: { body: [words(50), words(50)] } } })
    expect(offenders).toHaveLength(1)
    expect(offenders[0].reason).toMatch(/too verbose/)
  })

  it('says nothing about short cards or a card with no prose yet', () => {
    expect(queueImportOffenders({ points: { 8: { body: ['Kurz.'] }, 9: { body: null } } })).toEqual([])
    expect(queueImportOffenders(null)).toEqual([])
  })
})

describe('setQueueEntry — the commands edit the DATA, never the HTML', () => {
  it('adds a new point and keeps what it was not given', () => {
    const one = setQueueEntry(null, 5, { body: 'Erst.', estimate: '~1 h' })
    expect(one.points[5]).toEqual({ title: null, body: 'Erst.', estimate: '~1 h' })
    const two = setQueueEntry(one, 5, { body: 'Neu.' })
    expect(two.points[5]).toEqual({ title: null, body: 'Neu.', estimate: '~1 h' })
  })
  // POINT 608: writing a card must not put a sequence back into the file — the
  // next write is what finally clears a leftover one.
  it('writes no order, and drops a leftover one from the file it rewrites', () => {
    const written = setQueueEntry({ order: [9, 5], points: {} }, 5, { body: 'Text.' })
    expect(written.order).toBeUndefined()
    expect(Object.keys(written)).toEqual(['points'])
  })
  it('is pure — the input is not mutated', () => {
    const before = { points: { 5: { title: null, body: 'a', estimate: null } } }
    setQueueEntry(before, 6, { body: 'b' })
    expect(before).toEqual({ points: { 5: { title: null, body: 'a', estimate: null } } })
  })
  it('refuses anything that is not a point number', () => {
    for (const bad of [0, -1, 'x', null, 1.5]) expect(() => setQueueEntry(null, bad, { body: 'b' })).toThrow()
  })
})

describe('the work order supplies the names and the open set', () => {
  const tasks = `## Checklist
- [ ] 412. Ein Titel des Punktes (mit Klammer) und dann noch viel mehr Text der nicht auf die Karte gehört.
- [ ] 413. Ein zweiter Titel — und der Rest, der nicht auf die Karte gehört.
- [ ] 414. Zu kurz — der Rest.
- [x] 400. Erledigt.
`
  it('cuts the headline at the first bracket or dash, never the whole spec', () => {
    const t = parseTaskTitles(tasks)
    expect(t[412]).toBe('Ein Titel des Punktes')
    expect(t[413]).toBe('Ein zweiter Titel')
    expect(t[412].length).toBeLessThan(90)
  })
  it('keeps a headline the cut would leave too short to be one', () => {
    // The cut is blunt on purpose; below a dozen characters it is likelier to
    // have found a stray dash than a title, so the line is kept.
    expect(parseTaskTitles(tasks)[414]).toBe('Zu kurz — der Rest')
  })
  it('caps a headline that never breaks', () => {
    const long = `- [ ] 9. ${'w'.repeat(200)}\n`
    expect(parseTaskTitles(long)[9].length).toBeLessThanOrEqual(90)
  })
  it('reads the OPEN set with the same parser the audit uses', () => {
    expect(openPointsOf(tasks)).toContain(412)
    expect(openPointsOf(tasks)).not.toContain(400)
  })
  it('never throws on junk', () => {
    for (const raw of [null, 42, {}, '']) expect(() => parseTaskTitles(raw)).not.toThrow()
  })

  // THE ROOT CAUSE of "444 Punkt 444, 445 Punkt 445 …" on the user's phone
  // (30.07.2026). The pattern is `$`-anchored and `.` never matches a `\r`, so on
  // a checkout where TASKS.md carries CRLF this returned ZERO titles — silently,
  // for every line — and the card fell through to its last fallback rung. A
  // fixture written only with `\n` passes either way and proves nothing, which is
  // exactly how it survived; this one feeds the CRLF the file actually had.
  it('reads a CRLF work order — the ending the file is checked out with', () => {
    const crlf = tasks.replace(/\n/g, '\r\n')
    expect(parseTaskTitles(crlf)[412]).toBe('Ein Titel des Punktes')
    expect(Object.keys(parseTaskTitles(crlf))).toHaveLength(Object.keys(parseTaskTitles(tasks)).length)
    // …and no `\r` rides along into the card title.
    for (const title of Object.values(parseTaskTitles(crlf))) expect(title).not.toMatch(/\r/)
  })

  it('a CRLF work order projects titled cards, not bare numbers', () => {
    const entries = queueEntries({ open: [412, 413], titles: parseTaskTitles(tasks.replace(/\n/g, '\r\n')) })
    expect(entries.map((e) => e.title)).toEqual(['Ein Titel des Punktes', 'Ein zweiter Titel'])
    expect(entries.map((e) => e.title)).not.toContain('Punkt 412')
  })
})

// ═══ Point 439 — the fallback stays, but it can no longer pass unnoticed ═══
// The user asked TWICE why the card titles were English and in capitals. The
// middle rung of `entry.title || titles[point] || "Punkt N"` is the work-order
// headline, English by rule and written in capitals; the last is the bare
// number. Neither said anything, which is why it came back.
describe('isUntranslatedTitle — measured against the parsed headline, never a language guess', () => {
  const titles = { 444: 'THE BOARD LOSES ITS UMLAUTS ON THE WAY IN' }

  it('passes an authored German title', () => {
    expect(isUntranslatedTitle('Die Tafel verliert ihre Umlaute', 444, titles)).toBe(false)
  })
  it('reports the raw work-order headline', () => {
    expect(isUntranslatedTitle(titles[444], 444, titles)).toBe(true)
  })
  it('reports the bare-number fallback', () => {
    expect(isUntranslatedTitle('Punkt 444', 444, {})).toBe(true)
    expect(isUntranslatedTitle('', 444, {})).toBe(true)
  })
  it('does NOT report a German title that merely RESEMBLES the headline', () => {
    // No language heuristic anywhere: only an exact match against the parsed
    // headline counts, so a title that borrows its words stays untouched.
    expect(isUntranslatedTitle('THE BOARD LOSES ITS UMLAUTS ON THE WAY IN (Fassung)', 444, titles)).toBe(false)
    expect(isUntranslatedTitle('Punkt 4440', 444, {})).toBe(false)
  })
  it('never mistakes another point’s headline for this one’s', () => {
    expect(isUntranslatedTitle(titles[444], 445, titles)).toBe(false)
  })
})

describe('the generator SAYS which cards are still unnamed and unestimated', () => {
  const titles = { 444: 'A WORK ORDER HEADLINE', 445: 'ANOTHER ONE' }

  it('flags the fallback title on the entry itself, and lists the points', () => {
    const data = { points: { 444: { title: 'Ein deutscher Titel', body: 'Text.', estimate: '~2 h' } } }
    const entries = queueEntries({ open: [444, 445, 446], data, titles })
    expect(entries.map((e) => e.untranslated)).toEqual([false, true, true])
    expect(untranslatedTitlePoints(entries)).toEqual([445, 446])
  })

  it('lists the cards carrying the named "no estimate yet" marker', () => {
    // `auditDashboard` accepts that marker BY NAME — rightly, or the board would
    // deadlock against a card only the generator can produce. So it must be
    // REPORTED instead: sixteen appended points sat unestimated at once.
    const data = { points: { 444: { body: 'Text.', estimate: '~2 h' } } }
    const entries = queueEntries({ open: [444, 445], data, titles })
    expect(unestimatedPoints(entries)).toEqual([445])
    expect(entries.map((e) => e.meta)).toEqual(['~2 h', QUEUE_STUB_META])
    // Reported, and STILL passing the audit — the report is not a new block.
    const { html } = buildQueueSection(board(''), { open: [210, 444, 445], exclude: [210], titles })
    expect(auditDashboard(html, { open: [210, 444, 445], done: [], nowMinutes: 9 * 60 }).map((x) => x.code)).not.toContain(
      'queue-meta',
    )
  })

  it('reads the same two reports back off a BOARD, which is what the publish check sees', () => {
    const html = board(
      renderQueueCard({ point: 444, title: 'Ein deutscher Titel', body: 'Text.', meta: '~2 h' }) +
        renderQueueCard({ point: 445, title: titles[445], body: 'Text.', meta: '~1 h' }) +
        renderQueueCard({ point: 446, title: 'Punkt 446', body: 'Text.', meta: QUEUE_STUB_META }),
    )
    expect(boardTitleReport(html, titles)).toEqual({ untranslated: [445, 446], unestimated: [446] })
  })

  it('survives a board with no queue at all rather than throwing inside a publish', () => {
    expect(boardTitleReport('<main></main>', titles)).toEqual({ untranslated: [], unestimated: [] })
  })
})

describe('a command-line flag is never a card text', () => {
  // `board-queue.mjs set` had no `--text-stdin`, so a session that tried to pipe
  // German prose in stored the literal string as the card body — six cards, three
  // of them live, showed the user a flag where their explanation belonged.
  it('REFUSES to store a value that begins with --', () => {
    expect(() => setQueueEntry(null, 452, { body: '--text-stdin' })).toThrow(/--text-stdin/)
    expect(() => setQueueEntry(null, 452, { title: '--title' })).toThrow(/title/)
    expect(() => setQueueEntry(null, 452, { estimate: '--estimate' })).toThrow(/estimate/)
    expect(() => assertNotFlagValue('--whatever', 'body')).toThrow(/refusing to store the flag "--whatever"/)
  })
  it('accepts a text that legitimately begins with a single dash', () => {
    expect(setQueueEntry(null, 452, { body: '– so beginnt der Text' }).points[452].body).toBe('– so beginnt der Text')
    expect(assertNotFlagValue('-nicht geflaggt', 'body')).toBe('-nicht geflaggt')
  })
})

describe('parseSetArgs — the flags behind one `set` call', () => {
  it('takes the body from the argv by default', () => {
    expect(parseSetArgs(['452', 'Der', 'Text.'])).toMatchObject({ point: '452', body: 'Der Text.', stdinField: null })
  })
  it('routes --title and --estimate into their own fields', () => {
    expect(parseSetArgs(['452', '--title', 'Ein Titel', '--estimate', '~2 h', 'Der Text.'])).toMatchObject({
      point: '452',
      title: 'Ein Titel',
      estimate: '~2 h Der Text.',
    })
  })
  it('names which field --text-stdin fills — the umlaut-safe path for a TITLE', () => {
    expect(parseSetArgs(['452', '--text-stdin']).stdinField).toBe('body')
    expect(parseSetArgs(['452', '--title', '--text-stdin']).stdinField).toBe('title')
    expect(parseSetArgs(['452', '--estimate', '--text-stdin']).stdinField).toBe('estimate')
    // Never stored as prose, whichever field it stood in.
    expect(parseSetArgs(['452', '--text-stdin']).body).toBeNull()
    expect(parseSetArgs(['452', '--title', '--text-stdin']).title).toBeNull()
  })
  it('refuses to guess when two fields claim the pipe', () => {
    expect(() => parseSetArgs(['452', '--text-stdin', '--title', '--text-stdin'])).toThrow(/only ONE field/)
  })
  it('refuses an unknown flag and NAMES the ones it knows', () => {
    expect(() => parseSetArgs(['452', '--titel', 'x'])).toThrow(/--title/)
  })
  it('a bare -- ends the flags, so a text starting with a dash stays writable', () => {
    expect(parseSetArgs(['452', '--', '--kein', 'Flag']).body).toBe('--kein Flag')
    expect(parseSetArgs(['452', '--title', '--', '--seltsam']).title).toBe('--seltsam')
  })
  it('never throws on nothing at all', () => {
    expect(parseSetArgs([])).toMatchObject({ point: undefined, body: null })
    expect(parseSetArgs(null)).toMatchObject({ point: undefined })
  })
})


// ═══ Point 472 — the queue is ONE FLAT LIST again ═════════════════════════
// Point 452 had grouped the cards by bundle; the user took it back out the same
// evening ("Mehr Übersicht bringt sie mir auch nicht, weil die Warteschlange
// jetzt nicht mehr die Reihenfolge abbildet"). The demand attached to it was NO
// LEFTOVERS, so what is under test is the ABSENCE of the grouping in everything
// the board renders — not merely that a flat render is possible.
describe('the rendered queue — one flat list, no bundle left in the markup', () => {
  const built = (open, data = null) => buildQueueSection(board(''), { open, data, titles: {} })

  it('renders no group wrapper and no group hook, whatever it is given', () => {
    const { html } = built([439, 465, 200, 184])
    expect(html).not.toContain('class="group"')
    expect(html).not.toContain('data-group')
    // …and no leftover group summary shape either ("Name · 3 Punkte").
    expect(html).not.toMatch(/·\s*\d+\s*Punkte/)
  })

  it('takes no packages argument any more — an extra option cannot re-group it', () => {
    // The call site that used to hand the bundles in is gone; passing them now
    // is simply ignored, which is what "never rendered" has to mean in code.
    const { html } = buildQueueSection(board(''), {
      open: [439, 465],
      titles: {},
      packages: { bundles: [{ id: 'H', name: 'Chat & Tafel', points: [439, 465] }], order: ['Chat & Tafel'] },
    })
    expect(html).not.toContain('class="group"')
    expect(html).toContain('<span class="num">439</span>')
  })

  it('lists every open point exactly ONCE, in the queue order the cards are read in', () => {
    const open = [465, 439, 184, 295, RELEASE_TAG_POINT]
    const { html, entries } = built(open)
    const rendered = [...html.matchAll(/class="num">(\d+)</g)].map((m) => Number(m[1]))
    expect(rendered).toEqual(entries.map((e) => e.point))
    expect(new Set(rendered).size).toBe(rendered.length)
    expect(rendered.slice().sort((a, b) => a - b)).toEqual(open.slice().sort((a, b) => a - b))
    // The work order's sequence, with only the finder sunk past it (point 608).
    expect(rendered).toEqual([465, 439, 295, RELEASE_TAG_POINT, 184])
    expect(FINDER_POINTS.has(184)).toBe(true)
  })

  // POINT 608, the failure itself: the work order was re-sequenced twice on
  // 10.08.2026 and the published board kept showing the old plan.
  it('re-sequencing the work order re-sequences the rendered cards, nothing else edited', () => {
    const data = { points: { 439: { title: 'A', body: 'Eins.' }, 465: { title: 'B', body: 'Zwei.' } } }
    const cards = (open) =>
      [...built(open, data).html.matchAll(/class="num">(\d+)</g)].map((m) => Number(m[1]))
    expect(cards([439, 465, 295])).toEqual([439, 465, 295])
    expect(cards([295, 465, 439])).toEqual([295, 465, 439])
  })

  it('carries NO `open` attribute — the reader’s own choice owns that (house rule)', () => {
    expect(built([439, 200, 184]).html).not.toMatch(/<details[^>]*\sopen[\s>]/)
  })

  it('holds every open point of the LIVE work order exactly once, flat', () => {
    const tasks = readFileSync(resolve(REPO_ROOT, 'TASKS.md'), 'utf8')
    const open = openPointsOf(tasks)
    const { html } = buildQueueSection(board(''), { open, titles: parseTaskTitles(tasks) })
    const rendered = [...html.matchAll(/class="num">(\d+)</g)].map((m) => Number(m[1]))
    expect(rendered.slice().sort((a, b) => a - b)).toEqual(open.slice().sort((a, b) => a - b))
    expect(html).not.toContain('class="group"')
  })

  it('keeps every point findable by the coverage check that gates the publish', () => {
    const open = [439, 452, 465, 200, 295, 184]
    const { html } = built(open)
    expect(boardMissingPoints(html, open)).toEqual([])
    expect([...parseQueuePoints(html)].sort((a, b) => a - b)).toEqual(open.slice().sort((a, b) => a - b))
  })

  it('lets the one-command loop find and promote a card', () => {
    const { html } = built([439, 465])
    expect(queueCard(html, 439)).toContain('<span class="num">439</span>')
    // The promoted card keeps the chip the queue card carried (point 655).
    expect(toNow(html, 439, 'Läuft.', { stamp: '16:20' })).toContain('<span class="num">439</span><span class="t">')
  })

  it('reads its own cards back on import, paragraph split intact', () => {
    const stored = { points: { 439: { title: 'Ein Titel', body: ['Erster Teil.', 'Zweiter Teil.'] } } }
    const { html } = built([439, 465], stored)
    const back = importQueueFromHtml(html)
    expect(back.points[439]).toMatchObject({ title: 'Ein Titel', body: ['Erster Teil.', 'Zweiter Teil.'] })
    // 465 has no prose in the data, so the board shows the stub — which the
    // import must NOT store as a described card (point 530).
    expect(Object.keys(back.points).map(Number).sort((a, b) => a - b)).toEqual([439, 465])
    expect(back.points[465].body).toBeNull()
    // And the round trip is a fixed point: nothing changes, nothing is added.
    const { data, added } = mergeQueueImport(stored, back)
    expect(added).toEqual([])
    expect(data.points[439].body).toEqual(['Erster Teil.', 'Zweiter Teil.'])
  })

  it('leaves the board free of audit, conciseness and topic violations', () => {
    const open = [439, 452, 465, 200, 295, 184]
    const { html } = built(open)
    const codes = auditDashboard(html, { open: [210, ...open], done: [], nowMinutes: 9 * 60 }).map((x) => x.code)
    // `queue-stubbed` is the generator's own honest report that these cards have
    // no prose yet — every OTHER code would be a defect of the flat render.
    expect(codes.filter((c) => c !== 'queue-stubbed')).toEqual([])
    expect(concisenessOffenders(html)).toEqual([])
    expect(evaluateTopic({ dashboardHtml: html, tasksText: '- [ ] 439. X\n- [ ] 465. Y\n' }).block).toBe(false)
  })
})

describe('setQueueEntry — a title lands without disturbing anything else', () => {
  it('writes the title and leaves body and estimate exactly as they were', () => {
    const before = setQueueEntry(null, 452, { body: 'Der Text.', estimate: '~3 h' })
    const after = setQueueEntry(before, 452, { title: 'Ein deutscher Titel' })
    expect(after.points[452]).toEqual({ title: 'Ein deutscher Titel', body: ['Der Text.'], estimate: '~3 h' })
  })
  it('and an estimate lands without disturbing title or body', () => {
    const before = setQueueEntry(null, 452, { title: 'Titel', body: 'Text.' })
    expect(setQueueEntry(before, 452, { estimate: '~4 h' }).points[452]).toEqual({
      title: 'Titel',
      body: ['Text.'],
      estimate: '~4 h',
    })
  })
})

// --- the deposits of other windows, named under the queue (point 462) --------

describe('the pending-request card', () => {
  const req = (title, over = {}) => ({ at: '2026-07-30T20:11:00.000Z', title, route: 'tasks', ...over })

  it('renders nothing at all while no request waits', () => {
    expect(renderRequestsCard([])).toBe('')
    expect(renderRequestsCard(undefined)).toBe('')
    expect(renderRequestsCard([{ at: 'x' }])).toBe('')
  })

  it('names every waiting deposit, with its day', () => {
    const html = renderRequestsCard([req('Sitzungsübergabe härten'), req('Kartenbeschriftung prüfen')])
    expect(html).toContain('2 Anfragen warten')
    expect(html).toContain('30.07. Sitzungsübergabe härten')
    expect(html).toContain('30.07. Kartenbeschriftung prüfen')
  })

  it('says which one needs the user rather than the work order', () => {
    expect(renderRequestsCard([req('Eine offene Frage', { route: 'vdzk' })])).toContain('braucht deine Entscheidung')
  })

  it('caps the list instead of growing the card without end', () => {
    const html = renderRequestsCard(Array.from({ length: 8 }, (_, i) => req(`Anfrage ${i}`)))
    expect(html).toContain('… und 3 weitere.')
  })

  it('carries no point number, so no parser reads it as a queued point', () => {
    const html = renderRequestsCard([req('Eine Anfrage')])
    expect(parseQueuePoints(`<h2>Warteschlange</h2>${html}`).size).toBe(0)
    expect(importQueueFromHtml(board(html)).points).toEqual({})
  })

  it('neutralises a title that would trip the board guards on the OWNER’s turn', () => {
    const t = boardSafeTitle('Punkt 462: scripts/finding.mjs und design.md §19.5 (462) c2950bc0')
    expect(t).not.toMatch(/scripts\//)
    expect(t).not.toMatch(/\.mjs|\.md/)
    expect(t).not.toContain('§')
    expect(t).not.toMatch(/\bPunkt 462\b/)
    expect(t).not.toMatch(/\(462\)/)
  })

  it('truncates a long title rather than filling the card with one', () => {
    const t = boardSafeTitle('Ein sehr langer Titel, der auf einem Telefon niemals in eine Zeile passen würde')
    expect(t.length).toBeLessThanOrEqual(60)
    expect(t.endsWith('…')).toBe(true)
  })

  it('leaves an ordinary German title alone', () => {
    expect(boardSafeTitle('  Sitzungsübergabe   härten ')).toBe('Sitzungsübergabe härten')
  })

  it('repairs the transliteration a shell-mangled title arrives with', () => {
    // Four-eyes finding 2 (Fable 5): the title is the one field that travels as
    // an argument, so a depositor writes "fuer"/"pruefen" — and the board audit
    // then blocks the OWNER for text it never wrote.
    // Only the flagged words are repaired: "loesen" is not on the audit's stem
    // list, so it is not the guard's business and not this function's either.
    const t = boardSafeTitle('Bitte fuer die Warteschlange pruefen und moeglichst loesen')
    expect(t).toBe('Bitte für die Warteschlange prüfen und möglichst loesen')
    expect(findTransliterations(t)).toEqual([])
    expect(boardSafeTitle('Ueberpruefung zurueckstellen')).toBe('Überprüfung zurückstellen')
  })

  it('leaves a word the audit does not flag untouched', () => {
    expect(boardSafeTitle('Steuerung am Aequator neu justieren')).toBe('Steuerung am Aequator neu justieren')
  })

  it('neutralises the blocked card’s title the same way the queue card’s is', () => {
    // Four-eyes finding 4 (Fable 5, 31.07.2026): `--blocked` handed the raw
    // deposit title to vdzk-add while the queue card already routed through
    // boardSafeTitle — and the audit reads the whole published board, titles
    // included, on the OWNER's turn.
    const raw = 'Bitte fuer Punkt 465 pruefen (465) scripts/finding.mjs'
    expect(findTransliterations(`<span class="t">Anfrage nicht übernehmbar: ${raw}</span>`).length).toBeGreaterThan(0)
    const safe = blockedCardTitle(raw)
    expect(findTransliterations(`<span class="t">${safe}</span>`)).toEqual([])
    expect(safe).toContain('Anfrage nicht übernehmbar: ')
    expect(safe).not.toMatch(/scripts\/|\.mjs/)
    expect(safe).not.toMatch(/\bPunkt 465\b/)
    expect(safe).not.toMatch(/\(465\)/)
  })

  it('keeps a hostile title out of the audit on the real card', () => {
    const html = renderRequestsCard([
      { at: '2026-07-30T20:11:00.000Z', title: 'Bitte fuer Punkt 465 pruefen (465) scripts/finding.mjs', route: 'tasks' },
    ])
    expect(findTransliterations(html)).toEqual([])
  })
})

describe('the request card inside a rebuilt queue', () => {
  const withRequests = (requests) =>
    buildQueueSection(board(''), { open: [439, 465], data: null, titles: {}, requests }).html

  it('sits in the Warteschlange and leaves the point cards untouched', () => {
    const html = withRequests([{ at: '2026-07-30T20:11:00.000Z', title: 'Sitzungsübergabe härten', route: 'tasks' }])
    expect(html).toContain('Anfragen aus anderen Fenstern')
    expect([...parseQueuePoints(html)].sort((a, b) => a - b)).toEqual([439, 465])
  })

  it('disappears again on the next rebuild once the deposit was queued', () => {
    expect(withRequests([])).not.toContain('Anfragen aus anderen Fenstern')
  })

  it('breaks no audit, conciseness or topic rule', () => {
    const html = withRequests([
      { at: '2026-07-30T20:11:00.000Z', title: 'Punkt 465 in scripts/finding.mjs härten', route: 'vdzk' },
      { at: '2026-07-31T06:00:00.000Z', title: 'Kartenbeschriftung prüfen', route: 'tasks' },
    ])
    const codes = auditDashboard(html, { open: [210, 439, 465], done: [], nowMinutes: 9 * 60 }).map((x) => x.code)
    expect(codes.filter((c) => c !== 'queue-stubbed')).toEqual([])
    expect(concisenessOffenders(html)).toEqual([])
    expect(evaluateTopic({ dashboardHtml: html, tasksText: '- [ ] 439. X\n- [ ] 465. Y\n' }).block).toBe(false)
  })
})

// ---- THE QUEUE BINDS THE PICKER (point 712) --------------------------------
//
// The measured 17.08.2026 state is the fixture the blocks below run on: point
// 697 was commissioned while the derived sequence read `700 701 707 708 711 705
// 706 710 662 …`, and nothing refused it.

/** The open sequence as the work order carried it on 17.08.2026, abridged after
 *  the head that matters — the order is what is under test, not the length. */
const QUEUE_17_08 = [700, 701, 707, 708, 711, 705, 706, 710, 662, 553, 596, 597, 686, 687, 697]

describe('frontCandidates — the workable head of the derived order', () => {
  it('is the first `count` open points of queueOrder', () => {
    expect(frontCandidates({ open: QUEUE_17_08 })).toEqual([700, 701, 707])
    expect(frontCandidates({ open: QUEUE_17_08, count: 1 })).toEqual([700])
    expect(frontCandidates({ open: QUEUE_17_08, count: 5 })).toEqual([700, 701, 707, 708, 711])
  })

  it('SKIPS a user-gated point — it cannot be worked, so it may not hold a slot open', () => {
    const gates = { gated: new Set([700, 701]), answered: new Set(), since: new Map() }
    expect(frontCandidates({ open: QUEUE_17_08, gates })).toEqual([707, 708, 711])
  })

  it('SKIPS a point already in flight, so the window stays three real candidates deep', () => {
    expect(frontCandidates({ open: QUEUE_17_08, inFlight: [700, 707] })).toEqual([701, 708, 711])
  })

  it('lifts an ANSWERED point to the head, exactly as the board ranks it', () => {
    const gates = { gated: new Set(), answered: new Set([662]), since: new Map() }
    expect(frontCandidates({ open: QUEUE_17_08, gates })).toEqual([662, 700, 701])
  })

  it('accepts the raw work-order text as its gates, like every other queue rule', () => {
    const tasks = '- [ ] 700. A\n- [ ] 701. B AWAITING-USER(2026-08-17; needs his word)\n- [ ] 707. C\n- [ ] 708. D\n'
    expect(frontCandidates({ open: [700, 701, 707, 708], gates: tasks })).toEqual([700, 707, 708])
  })

  it('never throws and never invents a candidate on hostile input', () => {
    expect(frontCandidates()).toEqual([])
    expect(frontCandidates({ open: [], inFlight: 'nonsense' })).toEqual([])
    expect(frontCandidates({ open: QUEUE_17_08, count: 0 })).toHaveLength(POOL_CAP)
    expect(frontCandidates({ open: QUEUE_17_08, count: -4 })).toHaveLength(POOL_CAP)
    expect(frontCandidates({ open: QUEUE_17_08, count: 2.7 })).toEqual([700, 701])
    expect(frontCandidates({ open: QUEUE_17_08, inFlight: [null, 'x', 0, -1] })).toEqual([700, 701, 707])
  })
})

describe('commissionDecision — the real 17.08.2026 pick is refused', () => {
  it('REFUSES point 697 against that queue and names 700, 701 and 707', () => {
    const d = commissionDecision({ point: 697, open: QUEUE_17_08 })
    expect(d.allowed).toBe(false)
    expect(d.why).toBe('behind-front')
    expect(d.candidates).toEqual([700, 701, 707])
    expect(d.position).toBe(15)
    expect(d.total).toBe(15)
    const text = commissionRefusal(d)
    expect(text).toContain('697')
    expect(text).toContain('700, 701, 707')
    expect(text).toContain('15 of 15')
    expect(text).toContain('--override')
  })

  it('ACCEPTS a front candidate — each of the three, not merely the first', () => {
    for (const n of [700, 701, 707]) {
      expect(commissionDecision({ point: n, open: QUEUE_17_08 })).toMatchObject({ allowed: true, why: 'at-front' })
    }
  })

  it('lets the fourth point through the moment the three ahead of it are in flight', () => {
    expect(commissionDecision({ point: 708, open: QUEUE_17_08 })).toMatchObject({ allowed: false })
    expect(commissionDecision({ point: 708, open: QUEUE_17_08, inFlight: [700, 701, 707] })).toMatchObject({
      allowed: true,
      why: 'at-front',
    })
  })

  it('skips a GATED point when the front three are chosen, and refuses commissioning it', () => {
    const gates = { gated: new Set([701]), answered: new Set(), since: new Map() }
    const d = commissionDecision({ point: 708, open: QUEUE_17_08, gates })
    expect(d.candidates).toEqual([700, 707, 708])
    expect(d).toMatchObject({ allowed: true, why: 'at-front' })
    const gated = commissionDecision({ point: 701, open: QUEUE_17_08, gates })
    expect(gated).toMatchObject({ allowed: false, why: 'user-gated' })
    expect(commissionRefusal(gated)).toContain('WAITING ON THE USER')
  })

  // THE GATED REFUSAL NAMES THE REMEDY THAT ACTUALLY LIFTS IT, AND NO OTHER
  // (fourth review, finding 13). Printing the override command here sent the
  // reader into a recorded-then-ignored loop: the decision asks the gate BEFORE
  // the override, so following that remedy records a reason that changes
  // nothing and the guard denies again.
  it('the GATED refusal never prints the override command, and names the user\'s word instead', () => {
    const gates = { gated: new Set([701]), answered: new Set(), since: new Map() }
    const text = commissionRefusal(commissionDecision({ point: 701, open: QUEUE_17_08, gates }))
    expect(text).not.toContain('--override')
    expect(text).not.toContain(COMMISSION_OVERRIDE_CMD)
    expect(text).toContain('AWAITING-USER')
    expect(text).toContain("user's answer")
    expect(text).toContain('NOT honoured')
    // …while the ORDINARY queue refusal keeps the override as its recorded escape.
    const behind = commissionRefusal(commissionDecision({ point: 697, open: QUEUE_17_08 }))
    expect(behind).toContain(COMMISSION_OVERRIDE_CMD)
  })

  it('skips an IN-FLIGHT point when the front three are chosen', () => {
    const d = commissionDecision({ point: 708, open: QUEUE_17_08, inFlight: [701] })
    expect(d.candidates).toEqual([700, 707, 708])
    expect(d.allowed).toBe(true)
  })

  it('ACCEPTS an override with a recorded reason and reports the reason back', () => {
    const d = commissionDecision({ point: 697, open: QUEUE_17_08, override: '  red on main masks other suites  ' })
    expect(d).toMatchObject({ allowed: true, why: 'override' })
    expect(d.override).toBe('red on main masks other suites')
  })

  it('takes an EMPTY or whitespace override as no override at all — silence is the forbidden way', () => {
    for (const override of ['', '   ', '\n\t', null, undefined]) {
      expect(commissionDecision({ point: 697, open: QUEUE_17_08, override }).allowed).toBe(false)
    }
  })

  it('does not override a USER GATE — a gated point waits, whatever reason is typed', () => {
    const gates = { gated: new Set([697]), answered: new Set(), since: new Map() }
    expect(commissionDecision({ point: 697, open: QUEUE_17_08, gates, override: 'urgent' })).toMatchObject({
      allowed: false,
      why: 'user-gated',
    })
  })

  it('lets work on a point already in flight through — that is finishing, not opening', () => {
    expect(commissionDecision({ point: 697, open: QUEUE_17_08, inFlight: [697] })).toMatchObject({
      allowed: true,
      why: 'already-in-flight',
    })
  })

  // THE INTERSECTION, which the two cases above miss between them (Sol, review of
  // 91d88f9a): a gated point WITH a branch standing. Asked in the other order, an
  // open branch bought every further commissioning on a point the user has
  // stopped — the opposite of "cannot be worked at all".
  it('a GATED point stays refused even while its branch stands open', () => {
    const gates = { gated: new Set([697]), answered: new Set(), since: new Map() }
    const d = commissionDecision({ point: 697, open: QUEUE_17_08, gates, inFlight: [697] })
    expect(d).toMatchObject({ allowed: false, why: 'user-gated' })
    expect(commissionRefusal(d)).toContain('WAITING ON THE USER')
    // …and with a typed reason on top of the branch, still refused.
    expect(
      commissionDecision({ point: 697, open: QUEUE_17_08, gates, inFlight: [697], override: 'urgent' }).allowed,
    ).toBe(false)
  })

  it('cannot judge, so it ALLOWS: no point, no work order, a point the order does not carry', () => {
    expect(commissionDecision({ open: QUEUE_17_08 })).toMatchObject({ allowed: true, why: 'no-point' })
    expect(commissionDecision({ point: 0, open: QUEUE_17_08 }).why).toBe('no-point')
    expect(commissionDecision({ point: 'x', open: QUEUE_17_08 }).why).toBe('no-point')
    expect(commissionDecision({ point: 697, open: [] })).toMatchObject({ allowed: true, why: 'no-work-order' })
    expect(commissionDecision({ point: 999, open: QUEUE_17_08 })).toMatchObject({
      allowed: true,
      why: 'not-in-work-order',
    })
  })

  it('ALLOWS when the front offers nothing — a refusal naming no alternative is a trap', () => {
    const gates = { gated: new Set(QUEUE_17_08), answered: new Set(), since: new Map() }
    const d = commissionDecision({ point: 999, open: QUEUE_17_08, gates })
    expect(d.candidates).toEqual([])
    expect(d).toMatchObject({ allowed: true, why: 'not-in-work-order' })
    // …and with every OTHER point in flight, the one left is still commissionable.
    const busy = QUEUE_17_08.filter((n) => n !== 697)
    expect(commissionDecision({ point: 697, open: QUEUE_17_08, inFlight: busy })).toMatchObject({
      allowed: true,
      why: 'at-front',
    })
  })

  it('never throws on hostile input', () => {
    expect(() => commissionDecision()).not.toThrow()
    expect(commissionDecision().allowed).toBe(true)
    expect(() => commissionRefusal()).not.toThrow()
    expect(commissionRefusal()).toContain('?')
    expect(commissionRefusal({ point: 5, candidates: [], position: null, total: 0 })).toContain('no workable candidate')
  })

  it('follows the pool cap rather than a second number', () => {
    expect(commissionDecision({ point: 708, open: QUEUE_17_08, cap: 4 })).toMatchObject({ allowed: true })
    expect(commissionDecision({ point: 708, open: QUEUE_17_08, cap: POOL_CAP })).toMatchObject({ allowed: false })
  })
})
