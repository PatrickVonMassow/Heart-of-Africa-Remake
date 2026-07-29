// Pure sweep of the DERIVED QUEUE (point 400, delta C).
//
// The two failures this projection is built to make impossible are the ones
// under test hardest: a point that silently drops off the board (the staleness
// the whole point exists to end), and a point listed TWICE because the generator
// re-added a card the now-section had already taken (invariant 4b of
// dashboard-guard-core, which is right to block — a reader would see one point
// as simultaneously in progress and waiting).
import { describe, it, expect } from 'vitest'
import { auditDashboard, QUEUE_STUB_META } from './dashboard-guard-core.mjs'
import { FINDER_POINTS, RELEASE_TAG_POINT } from './queue-order-guard-core.mjs'
import {
  QUEUE_STUB_BODY,
  buildQueueSection,
  importQueueFromHtml,
  normaliseQueueData,
  openPointsOf,
  parseTaskTitles,
  queueEntries,
  queueOrder,
  renderQueueCard,
  setQueueEntry,
} from './board-queue-core.mjs'

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
  it('drops everything hostile and keeps the order unique', () => {
    const d = normaliseQueueData({ order: [3, '3', 0, -1, 'x', 2], points: { 5: { body: ' b ' }, 0: { body: 'n' }, z: {} } })
    expect(d.order).toEqual([3, 2])
    expect(d.points).toEqual({ 5: { title: null, body: 'b', estimate: null } })
  })
  it('survives junk of every shape', () => {
    for (const raw of [null, undefined, 'x', 42, [], { points: 'no' }, { order: 'no' }]) {
      expect(() => normaliseQueueData(raw)).not.toThrow()
      expect(normaliseQueueData(raw)).toEqual({ order: [], points: {} })
    }
  })
})

describe('queueOrder — judgment first, work order second, finders last', () => {
  it('keeps the listed order and appends the unlisted ascending', () => {
    expect(queueOrder([9, 4, 7, 2], { order: [7, 4] })).toEqual([7, 4, 2, 9])
  })
  it('ignores listed points that are no longer open', () => {
    expect(queueOrder([4], { order: [7, 4] })).toEqual([4])
  })
  it('pushes the bug-FINDING points behind the fixes, by construction', () => {
    const finder = [...FINDER_POINTS][0]
    const out = queueOrder([finder, 999], { order: [finder, 999] })
    expect(out.indexOf(finder)).toBeGreaterThan(out.indexOf(999))
  })
  it('puts the release tag last of all', () => {
    const finder = [...FINDER_POINTS][0]
    const out = queueOrder([RELEASE_TAG_POINT, finder, 999], null)
    expect(out[out.length - 1]).toBe(RELEASE_TAG_POINT)
  })
})

describe('queueEntries — every open point gets a card, and never two', () => {
  it('emits a STUB rather than nothing for a point with no prose', () => {
    const [e] = queueEntries({ open: [412], titles: { 412: 'Der Titel' } })
    expect(e).toMatchObject({ point: 412, title: 'Der Titel', body: QUEUE_STUB_BODY, meta: QUEUE_STUB_META, stub: true })
  })
  it('falls back to the bare number when even the work order names nothing', () => {
    expect(queueEntries({ open: [412] })[0].title).toBe('Punkt 412')
  })
  it('prefers the board prose over the work-order headline', () => {
    const data = { points: { 412: { title: 'Board-Titel', body: 'Der Text.', estimate: '~3 h' } } }
    expect(queueEntries({ open: [412], data, titles: { 412: 'TASKS-Titel' } })[0]).toMatchObject({
      title: 'Board-Titel',
      body: 'Der Text.',
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
})

describe('the one-time import from a hand-written board', () => {
  it('reads back the prose, the order and a real estimate', () => {
    const html = board(
      renderQueueCard({ point: 8, title: 'Acht', body: 'Text acht.', meta: '~2 h' }) +
        renderQueueCard({ point: 3, title: 'Drei', body: 'Text drei.', meta: QUEUE_STUB_META }),
    )
    const data = importQueueFromHtml(html)
    expect(data.order).toEqual([8, 3])
    expect(data.points[8]).toEqual({ title: 'Acht', body: 'Text acht.', estimate: '~2 h' })
    // The stub meta is not an estimate anybody made — it must not be imported
    // as one, or the point would look estimated for ever.
    expect(data.points[3].estimate).toBeNull()
  })
  it('returns an empty projection rather than throwing on a board with no queue', () => {
    expect(importQueueFromHtml('<main></main>')).toEqual({ order: [], points: {} })
  })
})

describe('setQueueEntry — the commands edit the DATA, never the HTML', () => {
  it('appends a new point and keeps what it was not given', () => {
    const one = setQueueEntry(null, 5, { body: 'Erst.', estimate: '~1 h' })
    expect(one.order).toEqual([5])
    const two = setQueueEntry(one, 5, { body: 'Neu.' })
    expect(two.points[5]).toEqual({ title: null, body: 'Neu.', estimate: '~1 h' })
    expect(two.order).toEqual([5])
  })
  it('is pure — the input is not mutated', () => {
    const before = { order: [5], points: { 5: { title: null, body: 'a', estimate: null } } }
    setQueueEntry(before, 6, { body: 'b' })
    expect(before).toEqual({ order: [5], points: { 5: { title: null, body: 'a', estimate: null } } })
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
})
