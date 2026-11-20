// The board's Backlog section (user order 19.11.2026): the docs/backlog.md
// reader (both entry forms, resolved entries skipped, newest-first cut), the
// collapsed section below Erledigt, its fail-soft state, and the structure
// gates accepting it there and nowhere else. Fixtures only — the real backlog
// changes daily.
import { describe, expect, it } from 'vitest'
import {
  BACKLOG_ON_BOARD,
  ERLEDIGT_ANCHOR,
  applyBacklogSection,
  parseBacklog,
  renderBacklogSection,
  rotateBoardArchives,
  sectionBounds,
} from './board-core.mjs'
import { BACKLOG_PAGE_URL } from './board-currency-core.mjs'
import { structureViolations } from './board-structure-core.mjs'
import { BACKLOG_TITLE, auditDashboard, expectedSections, parseCards, sliceSections } from './dashboard-guard-core.mjs'

const BACKLOG = `# Backlog (non-blocking)

Preamble prose, not an entry.

<!-- entries -->
- 2026-10-23 cloud probe — parseMarker reads only one form
- 2026-11-18 CLOSED WONTFIX (user decision) — the red band is required
  Original text:
    - [ ] 1163. indented, part of the entry above
- 2026-11-19 model guard — a verified commit stays a hit

## Speech bubble crosses the viewport edge (30.09.2026)

Body prose with an Erledigt-Karte mention, which is no marker.

## Brunnen entfernen (07.09.2026) — EINGEREIHT als Punkt 1092 (10.09.2026)

## Station noch offen (01.10.2026)

NICHT EINGEREIHT: erst diskutieren.

## Comes back later (14.09.2026)

ERLEDIGT (17.09.2026): als Punkt 1142 gefahren.

## The give's second frame (measured 07.09.2026, FIXED 08.09.2026)

\`\`\`
- 2026-12-01 inside a fence, not an entry
\`\`\`

- Undated bullet without any date
- 2026-11-19 later same-day entry — written below the other
`

const sect = (title, body = '') => `<details class="sect"><summary><h2>${title}</h2></summary>\n${body}</details>\n`
const doneSect = (body = '') => `${ERLEDIGT_ANCHOR}\n${body}</details>\n`
const doneCard = (n) =>
  `<details>\n  <summary><span class="num">${n}</span><span class="t">Fertig ${n}</span>` +
  `<span class="right"><span class="meta">09:00 · 10:00</span></span></summary>\n  <div class="body">\n    <p>Erledigt.</p>\n  </div>\n</details>\n` +
  '<p class="archive-link">Die älteren erledigten Punkte stehen im <a href="https://example.invalid/board/archive/">Archiv der erledigten Punkte</a>.</p>\n'
const board = (done = doneCard(7)) =>
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n<main>\n' +
  `${sect('Woran ich gerade arbeite')}${sect('Von dir zu klären')}${sect('Warteschlange')}` +
  `${doneSect(done)}${sect('Entscheidungsprotokoll')}<footer>Stand</footer>\n</main>\n`
const headings = (html) => sliceSections(html).order

describe('parseBacklog', () => {
  it('reads both entry forms and skips resolved or queued ones', () => {
    const titles = parseBacklog(BACKLOG).entries.map((e) => e.title)
    expect(titles).toEqual([
      'later same-day entry — written below the other',
      'model guard — a verified commit stays a hit',
      'cloud probe — parseMarker reads only one form',
      'Station noch offen',
      'Speech bubble crosses the viewport edge',
      'Undated bullet without any date',
    ])
    expect(parseBacklog(BACKLOG).count).toBe(6)
  })

  it('dates entries from either house form and sorts newest first, undated last', () => {
    const dates = parseBacklog(BACKLOG).entries.map((e) => e.date)
    expect(dates).toEqual(['2026-11-19', '2026-11-19', '2026-10-23', '2026-10-01', '2026-09-30', ''])
  })

  it('throws only on a non-string, and reads an empty backlog as zero', () => {
    expect(() => parseBacklog(null)).toThrow(/not readable/)
    expect(parseBacklog('')).toEqual({ count: 0, entries: [] })
  })

  it('shortens a long title at a word', () => {
    const long = `- 2026-11-20 ${'word '.repeat(60)}`
    const [entry] = parseBacklog(long).entries
    expect(entry.title.length).toBeLessThanOrEqual(122)
    expect(entry.title.endsWith(' …')).toBe(true)
  })
})

describe('renderBacklogSection', () => {
  it('cuts to the newest entries and states the full count and the link', () => {
    const many = Array.from({ length: 14 }, (_, i) => `- 2026-11-${String(i + 1).padStart(2, '0')} entry ${i + 1}`).join('\n')
    const html = renderBacklogSection(parseBacklog(many))
    expect(html).toContain('14 offene Einträge, die neuesten 10:')
    expect((html.match(/<li>/g) ?? []).length).toBe(BACKLOG_ON_BOARD)
    expect(html.indexOf('entry 14')).toBeLessThan(html.indexOf('entry 13'))
    expect(html).not.toContain('entry 4<')
    expect(html).toContain('<span class="meta">14.11.2026</span>')
    expect(html).toContain(`<a href="${BACKLOG_PAGE_URL}">docs/backlog.md</a>`)
  })

  it('escapes entry text', () => {
    expect(renderBacklogSection(parseBacklog('- 2026-11-20 a <b> & c'))).toContain('a &lt;b&gt; &amp; c')
  })

  it('fails soft: an unreadable backlog shows the unknown count and the link', () => {
    const html = renderBacklogSection(null)
    expect(html).toContain('Anzahl unbekannt')
    expect(html).not.toContain('<li>')
    expect(html).toContain(BACKLOG_PAGE_URL)
  })
})

describe('applyBacklogSection', () => {
  it('places a collapsed section directly below Erledigt, idempotently', () => {
    const once = applyBacklogSection(board(), BACKLOG)
    expect(headings(once)).toEqual([
      'Woran ich gerade arbeite',
      'Von dir zu klären',
      'Warteschlange',
      'Erledigt',
      BACKLOG_TITLE,
      'Entscheidungsprotokoll',
    ])
    expect(once).toMatch(/<details class="sect">\n<summary><h2>Backlog<\/h2><\/summary>/)
    expect(once).not.toMatch(/<details[^>]*\sopen[\s>]/)
    expect(applyBacklogSection(once, BACKLOG)).toBe(once)
    expect(applyBacklogSection(once, '- 2026-11-21 fresh entry')).toContain('fresh entry')
    expect(applyBacklogSection(once, '- 2026-11-21 fresh entry')).not.toContain('model guard')
  })

  it('moves a misplaced section back below Erledigt', () => {
    const misplaced = board().replace('<footer>', `${renderBacklogSection(parseBacklog(BACKLOG))}\n<footer>`)
    expect(headings(misplaced).at(-1)).toBe(BACKLOG_TITLE)
    expect(headings(applyBacklogSection(misplaced, BACKLOG))[4]).toBe(BACKLOG_TITLE)
  })

  it('renders the unknown state for a missing file instead of throwing', () => {
    expect(applyBacklogSection(board(), null)).toContain('Anzahl unbekannt')
  })

  it('keeps the Erledigt section, its cards, its anchor and the archive rotation intact', () => {
    const html = applyBacklogSection(board(doneCard(7) + doneCard(8)), BACKLOG)
    expect(html).toContain(ERLEDIGT_ANCHOR)
    expect(parseCards(sliceSections(html).sections.Erledigt).map((c) => c.points)).toEqual([[7], [8]])
    expect(parseCards(sliceSections(html).sections[BACKLOG_TITLE])).toEqual([])
    const { from, end } = sectionBounds(html, 'done')
    expect(html.slice(from, end)).not.toContain('Backlog')
    const archive = '<main>\n<h2>Erledigt (älter)</h2>\n<footer>x</footer>\n</main>\n'
    const r = rotateBoardArchives({ board: html, archive, caps: { done: 1 } })
    expect(r.moved.done).toBe(1)
    expect(headings(r.board)[4]).toBe(BACKLOG_TITLE)
    expect(r.board).toContain('Der vollständige Backlog steht in')
  })
})

describe('structure gates', () => {
  it('accept a board with the section below Erledigt and one without it', () => {
    expect(structureViolations(board())).toEqual([])
    expect(structureViolations(applyBacklogSection(board(), BACKLOG))).toEqual([])
    const codes = (html) => auditDashboard(html, {}).map((v) => v.code)
    expect(codes(applyBacklogSection(board(), BACKLOG))).not.toContain('structure')
    expect(codes(applyBacklogSection(board(), BACKLOG))).not.toContain('section-not-collapsible')
    expect(codes(board())).not.toContain('structure')
  })

  it('refuse the section anywhere but below Erledigt', () => {
    const misplaced = board().replace('<footer>', `${renderBacklogSection(null)}\n<footer>`)
    expect(structureViolations(misplaced).map((v) => v.code)).toContain('sections-wrong')
    expect(auditDashboard(misplaced, {}).map((v) => v.code)).toContain('structure')
    expect(expectedSections(['Erledigt'])).not.toContain(BACKLOG_TITLE)
  })
})
