import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { renderCardCriticalities, summaryPoint } from './board-core.mjs'

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
    (summary) => summary.querySelector(':scope > .num')?.textContent.trim() === String(point),
  )
}

describe('derived card criticality badges', () => {
  it.each([
    [11, 'low', 'niedrig'],
    [12, 'med', 'mittel'],
    [13, 'high', 'hoch'],
  ])('renders point %i as %s with its German label', (point, level, label) => {
    const badge = summaryFor(rendered(), point).querySelector(':scope > .criticality')
    expect(badge.className).toBe(`criticality criticality-${level}`)
    expect(badge.textContent).toBe(label)
  })

  it('renders no empty or guessed badge for an untagged point', () => {
    expect(summaryFor(rendered(), 14).querySelector(':scope > .criticality')).toBeNull()
  })

  it('leaves the unnumbered handover summary untouched', () => {
    const before = new JSDOM(handover).window.document.querySelector('summary').outerHTML
    const after = new JSDOM(rendered()).window.document.querySelector('details[data-state="idle"] > summary').outerHTML
    expect(after).toBe(before)
  })

  it('overwrites a hand-written stale badge with the derived value', () => {
    const stale = card(11, 'Elf', '<span class="criticality criticality-high">hoch</span>')
    const summary = summaryFor(renderCardCriticalities(stale, tasks), 11)
    expect(summary.querySelectorAll(':scope > .criticality')).toHaveLength(1)
    expect(summary.querySelector(':scope > .criticality').className).toContain('criticality-low')
    expect(summary.querySelector(':scope > .criticality').textContent).toBe('niedrig')
  })

  it('keeps old and decorated summary shapes readable and renders idempotently', () => {
    const once = rendered()
    expect(renderCardCriticalities(once, tasks)).toBe(once)
    expect(summaryPoint('<span class="num">11</span><span class="t">Elf</span>')).toEqual({ chip: '11', legacy: null })
    expect(summaryPoint(summaryFor(once, 11).innerHTML)).toEqual({ chip: '11', legacy: null })
    expect(new JSDOM(once).window.document.querySelectorAll('#board-criticality-style')).toHaveLength(1)
  })
})
