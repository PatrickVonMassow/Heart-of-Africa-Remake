// Regression coverage for consumers of the board file after publish persists
// renderCardCriticalities' visual number/badge wrapper back into the source.
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nowCard, renderCardCriticalities } from './board-core.mjs'
import { pointCardStanding } from './batch-boundary.mjs'
import { readCard } from './board-heartbeat.mjs'

const POINT = 941
const TASKS = `- [ ] ${POINT}. Kartenkopf auf schmalen Ansichten\n  Criticality: high — reviewed.\n`

const board = () => `<!doctype html>
<html><head></head><body><main>
<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>
<details class="now">
  <summary><span class="num">${POINT}</span><span class="t">Kartenkopf auf schmalen Ansichten</span><span class="right"><span class="meta">10:02 · ~12:02</span></span></summary>
  <div class="body"><p><span class="stamp">Stand 10:17</span> Umsetzung läuft.</p></div>
</details>
</details>
<details class="sect"><summary><h2>Von dir zu klären</h2></summary></details>
<details class="sect"><summary><h2>Warteschlange</h2></summary></details>
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
})
