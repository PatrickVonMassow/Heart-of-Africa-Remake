// THE CHIP AS THE READER SEES IT ON A PHONE (point 655).
//
// The number chip has existed in the Warteschlange since the board did, and the
// user reads that section on a phone every day — so its phone rendering is
// proven by use. What is NEW is a chip inside a `<details class="now">` summary,
// and the risk that carries is a layout one: a card whose chip is squeezed out,
// wrapped onto its own line, or hidden by a rule written for the current-work
// section would put the number back out of the reader's sight, which is exactly
// the defect this point ends.
//
// WHY NOT A BROWSER. The board's stylesheet lives in `.batch-dashboard.html`,
// which is git-ignored — the board is one living file, never checked out — so a
// pixel check cannot run in CI at all, and a re-implementation of the CSS here
// would prove nothing about the page the reader loads. The check is therefore
// split: the STRUCTURE half runs everywhere and holds the now-card's summary
// against the queue card's, element for element, so the chip renders through the
// same rules that already carry it on the phone; the STYLESHEET half reads the
// REAL board when it is present (the main checkout) and refuses any rule that
// would hide or shrink the chip away, the phone media query included.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from './repo-paths.mjs'
import { toClosingWork, toNoCurrentWork, toNow } from './board-core.mjs'
import { REQUIRED_SECTIONS } from './board-structure-core.mjs'

const PHONE_WIDTH = 390 // an iPhone-class viewport, well under the 460 px break
/** The living board. Git-ignored, so the stylesheet half is SKIPPED where it is absent. */
const BOARD_FILE = resolve(REPO_ROOT, '.batch-dashboard.html')

const sect = (title, body) => `<details class="sect"><summary><h2>${title}</h2></summary>\n${body}\n</details>`
const queueCard = (n, title) =>
  `<details>\n  <summary><span class="num">${n}</span><span class="t">${title}</span>` +
  `<span class="right"><span class="meta">~2 h</span></span></summary>\n` +
  `  <div class="body">\n    <p>Warum das ansteht.</p>\n  </div>\n</details>\n`

const board = () =>
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n<main>\n' +
  sect(REQUIRED_SECTIONS[0], '') +
  '\n' +
  sect(REQUIRED_SECTIONS[1], '') +
  '\n' +
  sect(REQUIRED_SECTIONS[2], queueCard(655, 'Jede Karte nennt ihren Punkt')) +
  '\n' +
  sect(REQUIRED_SECTIONS[3], '') +
  '\n</main>'

/** One summary as the DOM the browser builds: its element children, in order. */
function summaryShape(html, selector) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`)
  const summary = dom.window.document.querySelector(`${selector} > summary`)
  expect(summary, `no summary for ${selector}`).toBeTruthy()
  return [...summary.children].map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
}

describe('the numbered chip renders on a now-card as it does in the queue', () => {
  it('gives the now-card the SAME summary structure as the queue card', () => {
    const promoted = toNow(board(), 655, 'Läuft.', { stamp: '09:00' })
    const nowShape = summaryShape(promoted, 'details.now')
    expect(nowShape[0]).toBe('span.num')
    expect(nowShape[1]).toBe('span.t')
    // Element for element the shape the phone already renders every day.
    expect(nowShape).toEqual(summaryShape(board(), 'details.sect:nth-of-type(3) details'))
  })

  it('shows the number and the subject as separate, non-empty nodes', () => {
    const promoted = toNow(board(), 655, 'Läuft.', { stamp: '09:00' })
    const dom = new JSDOM(`<!doctype html><html><body>${promoted}</body></html>`)
    const summary = dom.window.document.querySelector('details.now > summary')
    expect(summary.querySelector('span.num').textContent.trim()).toBe('655')
    expect(summary.querySelector('span.t').textContent.trim()).toBe('Jede Karte nennt ihren Punkt')
    // The chip is not repeated inside the title — the reader must not read the
    // number twice on one line.
    expect(summary.querySelector('span.t').textContent).not.toMatch(/^\s*655/)
  })

  it('carries the chip on the closing card too, and none on the handover card', () => {
    const closing = toClosingWork(board(), 655, { reason: 'Vier-Augen fehlt.', stamp: '23:40' })
    const dom = new JSDOM(`<!doctype html><html><body>${closing}</body></html>`)
    const summary = dom.window.document.querySelector('details.now > summary')
    expect(summary.querySelector('span.num').textContent.trim()).toBe('655')
    expect(summary.querySelector('span.t').textContent).toContain('Abschlussarbeiten')

    const handover = toNoCurrentWork(board(), 'Der Nachfolger nimmt Punkt 656.', { stamp: '23:55' })
    const idle = new JSDOM(`<!doctype html><html><body>${handover}</body></html>`)
    const head = idle.window.document.querySelector('details.now > summary')
    expect(head.querySelector('span.num')).toBeNull()
    expect(head.querySelector('span.t').textContent.trim()).toBe('Gerade keine laufende Arbeit')
  })

  // The REAL stylesheet, where it is available: the board file is git-ignored,
  // so this half is skipped in a fresh checkout rather than faked.
  it.skipIf(!existsSync(BOARD_FILE))('is hidden by no rule of the real board, the phone media query included', () => {
    const css = (readFileSync(BOARD_FILE, 'utf8').match(/<style>([\s\S]*?)<\/style>/) ?? [])[1] ?? ''
    expect(css, 'the board carries no stylesheet').toContain('.num{')
    // Every rule that mentions the chip, the phone block included: none of them
    // may take it out of the picture.
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/\.num\b/.test(selector)) continue
      expect(body, `${selector.trim()} hides the chip`).not.toMatch(
        /display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?![.\d])/,
      )
    }
    // …and the summary is the flex row that puts chip and title side by side,
    // with the chip refusing to shrink.
    const summaryRule = (css.match(/\bsummary\{([^}]*)\}/) ?? [])[1] ?? ''
    expect(summaryRule).toContain('display:flex')
    expect(summaryRule).toContain('flex-wrap:nowrap')
    expect((css.match(/\.num\{([^}]*)\}/) ?? [])[1] ?? '').toContain('flex-shrink:0')
    // The phone break must not reach the chip at all.
    const phone = (css.match(new RegExp(`@media\\(max-width:(\\d+)px\\)\\{([^}]*\\}[^{]*)*`)) ?? [])[0] ?? ''
    expect(Number((phone.match(/max-width:(\d+)px/) ?? [])[1] ?? 0)).toBeGreaterThan(PHONE_WIDTH)
    expect(phone).not.toContain('.num')
    // AND NO RULE SCOPED TO THE CURRENT-WORK SECTION MAY RELAY IT (four-eyes
    // review, 12.08.2026): the DOM comparison above cannot see an ancestor rule
    // like `.now summary{flex-wrap:wrap}`, which would push the chip onto its own
    // line only inside the section this point is about.
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/\.now\b/.test(selector) || !/summary|\.t\b/.test(selector)) continue
      expect(body, `${selector.trim()} relays the current-work summary`).not.toMatch(
        /flex-wrap\s*:\s*wrap|display\s*:\s*(block|grid)|flex-direction\s*:\s*column/,
      )
    }
  })
})
