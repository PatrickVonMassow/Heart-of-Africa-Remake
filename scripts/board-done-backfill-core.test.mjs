// Point 1535: the done-card backfill on fixtures.
import { describe, it, expect } from 'vitest'
import {
  attributablePoints,
  backfillArchive,
  backfillBoard,
  backfillCard,
  cardPoint,
  measuresLookup,
  mergedPoint,
  recordedCheck,
} from './board-done-backfill-core.mjs'
import { MEASURES_SECTION_TITLE, MEASURES_UNKNOWN_TEXT, STATUS_SECTION_TITLE, doneCard, doneCards, toDone } from './board-core.mjs'

const doneEntry = (point, status, desc = 'Was der Punkt liefert.') =>
  `<details>\n  <summary><span class="num">${point}</span><span class="t">Titel ${point}</span>` +
  `<span class="right"><span class="meta">10:00 · 11:00</span></span></summary>\n  <div class="body">\n` +
  `    <p class="desc">${desc}</p>\n    <hr class="split">\n    <p class="status-head">${STATUS_SECTION_TITLE}</p>\n` +
  `    <p>${status}</p>\n  </div>\n</details>\n`
const queueEntry = (point) =>
  `<details>\n  <summary><span class="num">${point}</span><span class="t">Q</span><span class="right"><span class="meta">~1 h</span></span></summary>\n` +
  `  <div class="body">\n    <p class="desc">D.</p>\n    <hr class="split">\n    <p class="status-head">${STATUS_SECTION_TITLE}</p>\n    <p>Noch nicht begonnen.</p>\n  </div>\n</details>\n`
const sect = (name, body) => `<details class="sect"><summary><h2>${name}</h2></summary>\n${body}</details>\n`
const nowEntry = (n) =>
  `<details class="now">\n  <summary><span class="num">${n}</span><span class="t">Wieder offen</span>` +
  `<span class="right"><span class="meta">12:00 · ~13:00</span></span></summary>\n` +
  `  <div class="body">\n    <p><span class="stamp">Stand 12:10</span> läuft</p>\n  </div>\n</details>\n`
const board = (done, now = '') =>
  `<main>\n${sect('Woran ich gerade arbeite', now)}${sect('Von dir zu klären', '')}` +
  `${sect('Warteschlange', queueEntry(900))}${sect('Erledigt', done)}</main>\n`

const TEXTS = { 10: 'Kamele laufen jetzt flüssig.', 11: 'Die Küste flimmert nicht mehr.' }
const lookup = measuresLookup(TEXTS, new Set([10, 11, 12]))

describe('backfill of done cards (point 1535)', () => {
  it('swaps heading and content on done cards, keeps the description, leaves queue cards alone', () => {
    const { html, cards } = backfillBoard(board(doneEntry(10, 'Zusammengeführt, beide Backends geprüft.') + doneEntry(12, 'Abgehakt.')), lookup)
    const ten = doneCard(html, 10)
    expect(ten).toContain('<p class="desc">Was der Punkt liefert.</p>')
    expect(ten).toContain(`<p class="status-head">${MEASURES_SECTION_TITLE}</p>\n    <p>Kamele laufen jetzt flüssig.</p>`)
    expect(ten).toContain('<p class="check-note">✓ geprüft: beide Backends</p>')
    expect(ten).not.toContain('Zusammengeführt')
    // Attributable but no text written: not a guess, the fixed sentence.
    expect(doneCard(html, 12)).toContain(`<p>${MEASURES_UNKNOWN_TEXT}</p>`)
    expect(doneCard(html, 12)).not.toContain('check-note')
    // The queue card keeps its heading.
    expect(html.slice(0, html.indexOf('<h2>Erledigt'))).toContain(STATUS_SECTION_TITLE)
    expect(cards).toEqual([{ point: 10, outcome: 'written' }, { point: 12, outcome: 'unknown' }])
  })

  it('is idempotent', () => {
    const once = backfillBoard(board(doneEntry(10, 'x')), lookup).html
    const twice = backfillBoard(once, lookup)
    expect(twice.html).toBe(once)
    expect(twice.cards).toEqual([{ point: 10, outcome: 'kept' }])
  })

  it('gives an ambiguous or unmerged point the not-attributable text, even with a text on file', () => {
    const only = measuresLookup(TEXTS, new Set([11]))
    const { html } = backfillBoard(board(doneEntry(10, 'x') + doneEntry(11, 'y')), only)
    expect(doneCard(html, 10)).toContain(MEASURES_UNKNOWN_TEXT)
    expect(doneCard(html, 11)).toContain('Die Küste flimmert nicht mehr.')
  })

  it('rewrites the archive page done region only, not the decision log', () => {
    const log = '<h2 id="entscheidungsprotokoll">Entscheidungsprotokoll</h2>\n'
    const archive = `<main>\n<h2>Erledigt — Archiv</h2>\n${doneEntry(11, 'alt')}${log}${doneEntry(10, 'Logkarte')}</main>\n`
    const { html, cards } = backfillArchive(archive, lookup)
    expect(cards).toHaveLength(1)
    expect(html).toContain('Die Küste flimmert nicht mehr.')
    expect(html).toContain('Logkarte')
    // Without a log section the region runs to </main>.
    expect(backfillArchive(`<main>\n<h2>Erledigt</h2>\n${doneEntry(11, 'alt')}</main>\n`, lookup).html).toContain(MEASURES_SECTION_TITLE)
  })

  it('converts a legacy card without the split and reads a legacy numbered title', () => {
    const legacy = `<details>\n  <summary><span class="t">11 — Alt</span></summary>\n  <div class="body">\n    <p>Alter Text.</p>\n  </div>\n</details>`
    expect(cardPoint(legacy)).toBe(11)
    const out = backfillCard(legacy, 'M.')
    expect(out).toContain(`<p class="status-head">${MEASURES_SECTION_TITLE}</p>`)
    expect(out).not.toContain('Alter Text.')
  })

  it('keeps every status reader working on the new form', () => {
    // A backfilled card that comes back into current work and is archived again:
    // toDone reads its description back and folds it into one card.
    const { html } = backfillBoard(board(doneEntry(10, 'x'), nowEntry(10)), lookup)
    const again = toDone(html, 10, { text: 'Neue Maßnahme.', end: '13:00' })
    expect(doneCards(again, 10)).toHaveLength(1)
    expect(doneCard(again, 10)).toContain('<p class="desc">Was der Punkt liefert.</p>')
    expect(doneCard(again, 10)).toContain('<p>Neue Maßnahme.</p>')
    expect(doneCard(again, 10)).not.toContain('Kamele')
  })

  it('reads the picture check only from explicit statements', () => {
    expect(recordedCheck('Bild auf beiden Backends geprüft.')).toBe('beide Backends')
    expect(recordedCheck('WebGPU und WebGL 2 sauber.')).toBe('beide Backends')
    expect(recordedCheck('Bildprüfung auf WebGPU grün.')).toBe('WebGPU')
    expect(recordedCheck('Zusammengeführt.')).toBe('')
    expect(recordedCheck('Beide Backends werden später geprüft.')).toBe('')
    expect(recordedCheck('WebGPU wurde nicht geprüft.')).toBe('')
    expect(recordedCheck('Bildprüfung steht noch aus.')).toBe('')
    expect(recordedCheck('Bildprüfung auf WebGPU grün. WebGL 2 folgt noch.')).toBe('WebGPU')
  })

  it('attributes a point only through exactly one merged feat branch', () => {
    expect(mergedPoint("Merge branch 'feat/1532-backdrop-rock-fade'")).toBe(1532)
    expect(mergedPoint("Merge remote-tracking branch 'origin/feat/1529-giza-activity'")).toBe(1529)
    expect(mergedPoint("Merge branch 'main' into feat/1530-camel-model")).toBeNull()
    expect(mergedPoint("Merge remote-tracking branch 'origin/feat/1529-giza-activity' into feat/1529-giza-activity")).toBeNull()
    const set = attributablePoints([
      "Merge branch 'feat/1-a'",
      "Merge branch 'feat/1-a'",
      "Merge branch 'feat/2-a'",
      "Merge branch 'feat/2-b'",
    ])
    expect([...set]).toEqual([1])
  })
})
