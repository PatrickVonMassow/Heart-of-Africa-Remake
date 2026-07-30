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
import { auditDashboard, parseQueuePoints, QUEUE_STUB_META } from './dashboard-guard-core.mjs'
import { boardMissingPoints } from './board-currency-core.mjs'
import { queueCard, toNow } from './board-core.mjs'
import { concisenessOffenders } from './dashboard-conciseness-guard-core.mjs'
import { evaluate as evaluateTopic } from './dashboard-card-topic-guard-core.mjs'
import { FINDER_POINTS, RELEASE_TAG_POINT } from './queue-order-guard-core.mjs'
import {
  QUEUE_STUB_BODY,
  assertNotFlagValue,
  boardTitleReport,
  buildQueueSection,
  importQueueFromHtml,
  isUntranslatedTitle,
  normaliseQueueData,
  openPointsOf,
  paragraphs,
  parseSetArgs,
  parseTaskTitles,
  queueEntries,
  queueOrder,
  renderQueueCard,
  setQueueEntry,
  unestimatedPoints,
  untranslatedTitlePoints,
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
    expect(d.points).toEqual({ 5: { title: null, body: ['b'], estimate: null } })
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
    // The order is the queue's own judgment, undisturbed: the fixes first, the
    // bug-FINDING point behind them, the release tag last of all.
    expect(rendered).toEqual([295, 439, 465, 184, RELEASE_TAG_POINT])
    expect(FINDER_POINTS.has(184)).toBe(true)
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
    expect(toNow(html, 439, 'Läuft.', { stamp: '16:20' })).toContain('<span class="t">439 — ')
  })

  it('reads its own cards back on import', () => {
    const { html } = built([439, 465], { points: { 439: { title: 'Ein Titel', body: 'Text.' } } })
    const back = importQueueFromHtml(html)
    expect(back.points[439]).toMatchObject({ title: 'Ein Titel', body: 'Text.' })
    expect(Object.keys(back.points).map(Number).sort((a, b) => a - b)).toEqual([439, 465])
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
    expect(after.order).toEqual([452])
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
