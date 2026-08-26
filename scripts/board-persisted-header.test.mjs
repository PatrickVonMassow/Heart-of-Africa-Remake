// Regression coverage for consumers of the board file after publish persists
// renderCardCriticalities' visual number/badge wrapper back into the source.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nowCard, pointSubject, queueCard, renderCardCriticalities, setCardTitle } from './board-core.mjs'
import { pointCardStanding } from './batch-boundary.mjs'
import { readCard } from './board-heartbeat.mjs'
import { boardCardReady } from './fold-point-core.mjs'

const POINT = 941
const QUEUE_POINT = 942
const TASKS =
  `- [ ] ${POINT}. Kartenkopf auf schmalen Ansichten\n  Criticality: high — reviewed.\n\n` +
  `- [ ] ${QUEUE_POINT}. Nächste Kartenarbeit\n  Criticality: med — reviewed.\n`

const board = () => `<!doctype html>
<html><head></head><body><main>
<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>
<details class="now">
  <summary><span class="num">${POINT}</span><span class="t">Kartenkopf auf schmalen Ansichten</span><span class="right"><span class="meta">10:02 · ~12:02</span></span></summary>
  <div class="body"><p><span class="stamp">Stand 10:17</span> Umsetzung läuft.</p></div>
</details>
</details>
<details class="sect"><summary><h2>Von dir zu klären</h2></summary></details>
<details class="sect"><summary><h2>Warteschlange</h2></summary>
<details>
  <summary><span class="num">${QUEUE_POINT}</span><span class="t">Nächste Kartenarbeit</span><span class="right"><span class="meta">~2 h · Feature</span></span></summary>
  <div class="body"><p>Wartet auf Umsetzung.</p></div>
</details>
</details>
<details class="sect"><summary><h2>Erledigt</h2></summary></details>
</main></body></html>`

const publishedBoard = () => renderCardCriticalities(board(), TASKS)

describe('persisted card-header-left wrappers', () => {
  it('remain visible to the current-card readers after the real render pass', () => {
    const html = publishedBoard()
    expect(html).toContain(
      `<span class="card-header-left"><span class="num">${POINT}</span>` +
        '<span class="criticality criticality-high">hoch</span></span>',
    )
    expect(nowCard(html, POINT)).toContain('Umsetzung läuft.')

    const dir = mkdtempSync(join(tmpdir(), 'hoa-persisted-card-header-'))
    const path = join(dir, '.batch-dashboard.html')
    try {
      writeFileSync(path, html)
      expect(pointCardStanding(POINT, { path })).toBe(true)
      expect(readCard({ dashboardPath: '.batch-dashboard.html' }, dir)).toMatchObject({
        ok: true,
        point: POINT,
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('remain visible to the queue and fold readers after the real render pass', () => {
    const html = publishedBoard()
    const card = queueCard(html, QUEUE_POINT)

    expect(card).toContain(`<span class="card-header-left"><span class="num">${QUEUE_POINT}</span>`)
    expect(card).toContain('Wartet auf Umsetzung.')
    expect(boardCardReady(html, QUEUE_POINT)).toEqual({ ok: true, from: 'queue' })
  })

  it('preserve subject lookup and every title rewrite after the real render pass', () => {
    const html = publishedBoard()

    expect(pointSubject(html, POINT)).toBe('Kartenkopf auf schmalen Ansichten')
    expect(pointSubject(html, QUEUE_POINT)).toBe('Nächste Kartenarbeit')

    const renamedNow = setCardTitle(html, POINT, 'Neu angeordneter Kartenkopf')
    expect(renamedNow).toContain(`<span class="num">${POINT}</span><span class="t">Neu angeordneter Kartenkopf</span>`)

    const renamedQueue = setCardTitle(html, QUEUE_POINT, 'Spätere Kartenarbeit')
    expect(renamedQueue).toContain(`<span class="num">${QUEUE_POINT}</span><span class="t">Spätere Kartenarbeit</span>`)

    const closing = renderCardCriticalities(
      board()
        .replace('<details class="now">', '<details class="now" data-state="closing">')
        .replace(
          '<span class="t">Kartenkopf auf schmalen Ansichten</span>',
          '<span class="t">Kartenkopf auf schmalen Ansichten: Abschlussarbeiten</span>',
        ),
      TASKS,
    )
    const renamedClosing = setCardTitle(closing, POINT, 'Neu angeordneter Kartenkopf')
    expect(renamedClosing).toContain(
      `<span class="num">${POINT}</span><span class="t">Neu angeordneter Kartenkopf: Abschlussarbeiten</span>`,
    )
  })
})
