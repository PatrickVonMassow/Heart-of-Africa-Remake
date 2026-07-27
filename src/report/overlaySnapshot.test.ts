// The overlay snapshot of the F6 bug report (design.md §21.1): the HUD and the
// floating labels are DOM, so they are absent from the canvas readback and have
// to travel as data. The witness case is the doubled place label — two entries
// with the same text at overlapping rectangles.

import { describe, it, expect, beforeEach } from 'vitest'
import { snapshotOverlay, findDuplicateLabels, type OverlayRect } from './overlaySnapshot'

// jsdom lays nothing out (every rect is 0×0), so the rectangles are injected —
// the reader is a seam for exactly this reason.
const rects = new Map<Element, OverlayRect>()
const rectOf = (el: Element): OverlayRect => rects.get(el) ?? { x: 0, y: 0, width: 0, height: 0 }

function build(html: string): HTMLElement {
  document.body.innerHTML = `<div id="root">${html}</div>`
  return document.getElementById('root')!
}

function place(selector: string, rect: OverlayRect, root: Element = document.body): void {
  for (const el of Array.from(root.querySelectorAll(selector))) rects.set(el, rect)
}

beforeEach(() => {
  rects.clear()
  document.body.innerHTML = ''
})

describe('snapshotOverlay', () => {
  it('lists a visible label with its text and its rectangle', () => {
    const root = build('<div class="map-label">Giza</div>')
    place('.map-label', { x: 120, y: 80, width: 60, height: 18 })
    const items = snapshotOverlay(root, { rectOf })
    expect(items).toEqual([{ kind: 'div.map-label', text: 'Giza', rect: { x: 120, y: 80, width: 60, height: 18 } }])
  })

  it('omits a hidden label and everything below it', () => {
    const root = build(
      '<div class="hud" style="display:none"><span class="inner">Cairo</span></div><div class="map-label">Meroe</div>',
    )
    place('.hud, .inner, .map-label', { x: 10, y: 10, width: 40, height: 12 })
    const items = snapshotOverlay(root, { rectOf })
    expect(items.map((i) => i.text)).toEqual(['Meroe'])
  })

  it('omits an element made invisible by visibility or zero opacity', () => {
    const root = build(
      '<div class="a" style="visibility:hidden">A</div><div class="b" style="opacity:0">B</div><div class="c">C</div>',
    )
    place('.a, .b, .c', { x: 0, y: 0, width: 20, height: 10 })
    expect(snapshotOverlay(root, { rectOf }).map((i) => i.text)).toEqual(['C'])
  })

  it('omits a zero-area element — it carries no picture', () => {
    const root = build('<div class="a">A</div>')
    place('.a', { x: 5, y: 5, width: 0, height: 0 })
    expect(snapshotOverlay(root, { rectOf })).toEqual([])
  })

  it('keeps BOTH of two labels sharing a text at overlapping boxes (the doubled-label witness)', () => {
    const root = build('<div class="map-label">Giza</div><div class="map-label italic">Giza</div>')
    const all = Array.from(root.querySelectorAll('.map-label'))
    rects.set(all[0], { x: 300, y: 200, width: 50, height: 16 })
    rects.set(all[1], { x: 306, y: 203, width: 50, height: 16 })
    const items = snapshotOverlay(root, { rectOf })
    expect(items).toHaveLength(2)
    expect(items.map((i) => i.text)).toEqual(['Giza', 'Giza'])
    expect(items[1].kind).toBe('div.map-label.italic')
    const dupes = findDuplicateLabels(items)
    expect(dupes).toHaveLength(1)
    expect(dupes[0][0].text).toBe('Giza')
  })

  it('does not pair two same-text labels that sit apart', () => {
    const root = build('<div class="l">Nil</div><div class="l">Nil</div>')
    const all = Array.from(root.querySelectorAll('.l'))
    rects.set(all[0], { x: 0, y: 0, width: 30, height: 12 })
    rects.set(all[1], { x: 400, y: 300, width: 30, height: 12 })
    expect(findDuplicateLabels(snapshotOverlay(root, { rectOf }))).toEqual([])
  })

  it('reports only an element OWN text, not the concatenation of its children', () => {
    const root = build('<div class="bar">Date <span class="v">01.01.1890</span></div>')
    place('.bar, .v', { x: 0, y: 0, width: 100, height: 20 })
    const items = snapshotOverlay(root, { rectOf })
    expect(items.map((i) => [i.kind, i.text])).toEqual([
      ['div.bar', 'Date'],
      ['span.v', '01.01.1890'],
    ])
  })

  it('flags a label lying outside the viewport', () => {
    const root = build('<div class="a">on</div><div class="b">off</div>')
    place('.a', { x: 10, y: 10, width: 30, height: 12 })
    place('.b', { x: -80, y: 10, width: 30, height: 12 })
    const items = snapshotOverlay(root, { rectOf, viewport: { width: 800, height: 600 } })
    expect(items[0].offScreen).toBeUndefined()
    expect(items[1].offScreen).toBe(true)
  })

  it('skips the report modal and other dialog layers covering the scene', () => {
    const root = build(
      '<div class="map-label">Kilwa</div><div class="dialog-backdrop state-dump-backdrop"><h3>Game State</h3></div>',
    )
    place('.map-label, .dialog-backdrop, h3', { x: 0, y: 0, width: 50, height: 20 })
    expect(snapshotOverlay(root, { rectOf }).map((i) => i.text)).toEqual(['Kilwa'])
  })

  it('cuts an over-long text but keeps the entry', () => {
    const root = build(`<div class="j">${'a'.repeat(400)}</div>`)
    place('.j', { x: 0, y: 0, width: 200, height: 300 })
    const items = snapshotOverlay(root, { rectOf, maxTextLength: 20 })
    expect(items[0].text).toBe('a'.repeat(20) + '…')
  })

  it('returns nothing for a missing root', () => {
    expect(snapshotOverlay(null)).toEqual([])
  })
})
