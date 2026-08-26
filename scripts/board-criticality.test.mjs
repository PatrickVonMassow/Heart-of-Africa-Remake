import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { renderCardCriticalities, setCardTitle, summaryPoint } from './board-core.mjs'
import { readTasksAll } from './tasks-source.mjs'

const card = (point, title, extra = '') =>
  `<details><summary><span class="num">${point}</span>${extra}<span class="t">${title}</span></summary>` +
  '<div class="body"><p>Text.</p></div></details>'
const handover =
  '<details class="now" data-state="idle"><summary><span class="t">Gerade keine laufende Arbeit</span>' +
  '<span class="right"><span class="meta">10:00</span></span></summary><div class="body"><p>Weiter.</p></div></details>'
const tasks = `- [ ] 11. Low
  Criticality: low — reversible.
- [ ] 12. Medium
  Criticality: medium — visible.
- [x] 13. High
  Criticality: HIGH — reviewed.
- [ ] 14. Untagged
  No risk tag here.`

function rendered() {
  return renderCardCriticalities(
    `<html><head></head><body><main>${card(11, 'Elf')}${card(12, 'Zwölf')}${card(13, 'Dreizehn')}${card(14, 'Vierzehn')}${handover}</main></body></html>`,
    tasks,
  )
}

const summaryFor = (html, point) => {
  const document = new JSDOM(html).window.document
  return [...document.querySelectorAll('summary')].find(
    (summary) => summary.querySelector(':scope > .card-header-left > .num')?.textContent.trim() === String(point),
  )
}

describe('derived card criticality badges', () => {
  it.each([
    [11, 'low', 'niedrig'],
    [12, 'med', 'mittel'],
    [13, 'high', 'hoch'],
  ])('renders point %i as %s with its German label', (point, level, label) => {
    const badge = summaryFor(rendered(), point).querySelector(':scope > .card-header-left > .criticality')
    expect(badge.className).toBe(`criticality criticality-${level}`)
    expect(badge.textContent).toBe(label)
  })

  it('renders no empty or guessed badge for an untagged point', () => {
    expect(summaryFor(rendered(), 14).querySelector(':scope > .card-header-left > .criticality')).toBeNull()
  })

  it('leaves the unnumbered handover summary untouched', () => {
    const before = new JSDOM(handover).window.document.querySelector('summary').outerHTML
    const after = new JSDOM(rendered()).window.document.querySelector('details[data-state="idle"] > summary').outerHTML
    expect(after).toBe(before)
  })

  it('overwrites a hand-written stale badge with the derived value', () => {
    const stale = card(11, 'Elf', '<span class="criticality criticality-high">hoch</span>')
    const summary = summaryFor(renderCardCriticalities(stale, tasks), 11)
    expect(summary.querySelectorAll(':scope > .card-header-left > .criticality')).toHaveLength(1)
    expect(summary.querySelector(':scope > .card-header-left > .criticality').className).toContain('criticality-low')
    expect(summary.querySelector(':scope > .card-header-left > .criticality').textContent).toBe('niedrig')
  })

  it('keeps all three header columns bounded and wrap-capable at a narrow viewport', () => {
    const narrow = renderCardCriticalities(
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<details><summary><span class="num">12</span>' +
        '<span class="t">Ein absichtlich sehr langer Kartentitel für das schmale Telefon</span>' +
        '<span class="right"><span class="meta">10:00 · ~12:00</span></span></summary>' +
        '<div class="body"><p>Text.</p></div></details>',
      tasks,
    )
    const document = new JSDOM(narrow).window.document
    const summary = document.querySelector('details > summary')
    const groups = [...summary.children].map((element) => element.className)
    expect(groups).toEqual(['card-header-left', 't', 'right'])
    expect([...summary.querySelector('.card-header-left').children].map((element) => element.className)).toEqual([
      'num',
      'criticality criticality-med',
    ])
    expect(summary.querySelector('.right .meta').textContent).toBe('10:00 · ~12:00')

    const css = document.querySelector('#board-criticality-style').textContent
    expect(css).toContain('details:not(.sect)>summary:has(>.right){flex-wrap:wrap;min-width:0;max-width:100%}')
    expect(css).toContain('.card-header-left{display:inline-flex;flex:0 1 auto;flex-wrap:wrap;')
    expect(css).toContain('summary>.t{flex:1 1 12rem;min-width:0;max-width:100%;overflow-wrap:anywhere}')
    expect(css).toContain(
      'summary>.right{display:inline-flex;align-items:baseline;flex:0 1 auto;flex-wrap:nowrap;min-width:0;max-width:100%;white-space:normal}',
    )
    expect(css).toContain('summary>.right .meta{min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere}')
  })

  it('keeps the disclosure marker in the non-wrapping estimate group', () => {
    const document = new JSDOM(rendered()).window.document
    const rules = [...document.querySelector('#board-criticality-style').sheet.cssRules]
    const declarations = (selector) => rules.find((rule) => rule.selectorText === selector)?.style

    // The living board creates its marker as summary::after. Once the summary
    // wraps, that pseudo-element is a fourth flex item and can occupy a line by
    // itself. Suppress it only when there is a right-hand group, then recreate
    // both marker states inside that group. Its nowrap rule makes estimate and
    // marker one indivisible flex item at the summary level.
    expect(declarations('details:not(.sect)>summary:has(>.right)::after')?.content).toBe('none')
    expect(declarations('details:not(.sect)>summary>.right')?.flexWrap).toBe('nowrap')
    expect(declarations('details:not(.sect)>summary>.right::after')?.content).toBe('"▸"')
    expect(declarations('details:not(.sect)[open]>summary>.right::after')?.content).toBe('"▾"')
  })

  it('keeps old and decorated summary shapes readable and renders idempotently', () => {
    const once = rendered()
    expect(renderCardCriticalities(once, tasks)).toBe(once)
    expect(summaryPoint('<span class="num">11</span><span class="t">Elf</span>')).toEqual({ chip: '11', legacy: null })
    expect(summaryPoint(summaryFor(once, 11).innerHTML)).toEqual({ chip: '11', legacy: null })
    expect(new JSDOM(once).window.document.querySelectorAll('#board-criticality-style')).toHaveLength(1)
  })

  // The board is a git-ignored local artefact, so fresh CI checkouts do not
  // carry it. Where it exists, use its actual leading bytes and landmarks: a
  // remembered miniature is exactly how the title/meta/style drift escaped.
  const liveBoardPath = resolve(import.meta.dirname, '../.batch-dashboard.html')
  it.skipIf(!existsSync(liveBoardPath))('preserves the real board BOM and renders it idempotently', () => {
    const board = readFileSync(liveBoardPath, 'utf8')
    const titleEnd = board.indexOf('</title>')
    const viewport = board.indexOf('<meta name="viewport"')
    const ownStyle = board.indexOf('<style', viewport)
    const firstScript = board.indexOf('<script', ownStyle)
    const scriptEnd = board.indexOf('</script>', firstScript)
    const realMain = board.indexOf('<main', scriptEnd)

    expect([...Buffer.from(board).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(viewport).toBeGreaterThan(titleEnd)
    expect(ownStyle).toBeGreaterThan(viewport)
    expect(firstScript).toBeGreaterThan(ownStyle)
    expect(board.slice(firstScript, scriptEnd)).toContain('<main>')
    expect(realMain).toBeGreaterThan(scriptEnd)

    const once = renderCardCriticalities(board, readTasksAll())
    const document = new JSDOM(once).window.document
    const derivedStyle = document.querySelector('#board-criticality-style')
    const script = document.querySelector('script')

    expect(derivedStyle).not.toBeNull()
    expect(derivedStyle.previousElementSibling.tagName).toBe('STYLE')
    expect(script.textContent).not.toContain('board-criticality-style')
    expect(() => new Function(script.textContent)).not.toThrow()
    expect(Buffer.from(once).subarray(0, 3)).toEqual(Buffer.from(board).subarray(0, 3))
    expect(renderCardCriticalities(once, readTasksAll())).toBe(once)
  })

  it('keeps an already-decorated current-work card replaceable', () => {
    const now = renderCardCriticalities(card(11, 'Elf').replace('<details>', '<details class="now">'), tasks)
    const renamed = renderCardCriticalities(setCardTitle(now, 11, 'Elf neu'), tasks)

    expect(summaryFor(renamed, 11).querySelector(':scope > .t').textContent).toBe('Elf neu')
    expect(summaryFor(renamed, 11).querySelector(':scope > .card-header-left > .criticality').textContent).toBe('niedrig')
  })
})
