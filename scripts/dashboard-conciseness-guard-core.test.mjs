// Decision-logic sweep of the dashboard-conciseness Stop-hook guard
// (dashboard-conciseness-guard-core): the verbosity, tech-density and
// paragraph-structure rules with their exact boundaries, the section
// exemptions (Erledigt / Von dir zu klären), and totality on malformed input
// (the wrapper's fail-open depends on the core never throwing).
import { describe, it, expect } from 'vitest'
import {
  WORD_BUDGET,
  TECH_TOKEN_BUDGET,
  SINGLE_PARAGRAPH_WORD_BUDGET,
  parseCards,
  cardStats,
  concisenessOffenders,
  evaluate,
} from './dashboard-conciseness-guard-core.mjs'

/** n plain words with no technical tokens. */
const lorem = (n) => Array.from({ length: n }, (_, i) => `wort${i}`).join(' ')

/** Minimal dashboard in the real board's markup (now + questions + queue + done). */
function boardHtml({ now = [], questions = [], queue = [], done = [] } = {}) {
  const card = ({ n, t = 'Titel', body }) =>
    `<details>\n  <summary>${n != null ? `<span class="num">${n}</span>` : ''}<span class="t">${t}</span></summary>\n  <div class="body">${body}</div>\n</details>`
  const nowCard = ({ n, t = 'Titel', body }) =>
    `<details class="now" open>\n  <summary><span class="t">${n != null ? `${n} ` : ''}${t}</span></summary>\n  <div class="body">${body}</div>\n</details>`
  return `<main><h1>Dashboard</h1>
<h2>Woran ich gerade arbeite</h2>
${now.map(nowCard).join('\n')}
<h2>Von dir zu klären</h2>
${questions.map(card).join('\n')}
<h2>Warteschlange</h2>
${queue.map(card).join('\n')}
<h2>Erledigt</h2>
${done.map(card).join('\n')}
</main>`
}

describe('budgets', () => {
  it('pin the calibrated thresholds (live-board gap of 23.07.2026)', () => {
    expect(WORD_BUDGET).toBe(90)
    expect(TECH_TOKEN_BUDGET).toBe(4)
    expect(SINGLE_PARAGRAPH_WORD_BUDGET).toBe(65)
  })
})

describe('cardStats', () => {
  it('counts words, paragraphs and technical tokens', () => {
    const s = cardStats('<p><b>Fix</b> in <code>flow.mjs</code> at abc1234 per design.md §19.5</p><p>Zwei.</p>')
    expect(s.paragraphs).toBe(2)
    expect(s.words).toBe(9) // Fix in flow.mjs at abc1234 per design.md §19.5 Zwei.
    // <code> span + flow.mjs + abc1234 + design.md + § = 5
    expect(s.techTokens).toBe(5)
  })

  it('counts a repo path once, not per-segment', () => {
    expect(cardStats('<p>siehe src/scenes/travel/Wildlife.tsx dort</p>').techTokens).toBe(1)
    expect(cardStats('<p>siehe docs/peoples-1890.md §9</p>').techTokens).toBe(2) // path + §
  })

  it('is total on non-string input', () => {
    expect(cardStats(null)).toEqual({ words: 0, paragraphs: 0, techTokens: 0 })
  })
})

describe('parseCards', () => {
  it('reads the point from class="num" (queue) or the leading title number (now)', () => {
    const html = boardHtml({
      now: [{ n: 244, body: '<p>Kurz.</p>' }],
      queue: [{ n: 181, body: '<p>Kurz.</p>' }, { t: 'Prozess-Karte ohne Nummer', body: '<p>Kurz.</p>' }],
    })
    const queue = parseCards(html.slice(html.indexOf('<h2>Warteschlange'), html.indexOf('<h2>Erledigt')), 'queue')
    expect(queue.map((c) => c.point)).toEqual([181, null])
    const now = parseCards(html.slice(html.indexOf('Woran ich'), html.indexOf('<h2>Von dir')), 'now')
    expect(now.map((c) => c.point)).toEqual([244])
  })

  it('is total on malformed input', () => {
    expect(parseCards(null, 'queue')).toEqual([])
    expect(parseCards('<details><summary>kein body</summary></details>', 'queue')).toEqual([])
  })
})

describe('concisenessOffenders', () => {
  it('passes a concise high-level card', () => {
    const html = boardHtml({
      now: [{ n: 249, body: `<p>${lorem(30)}</p>` }],
      queue: [{ n: 181, body: `<p>${lorem(40)}</p>` }],
    })
    expect(concisenessOffenders(html)).toEqual([])
  })

  it('flags an over-budget body as too verbose', () => {
    const html = boardHtml({ queue: [{ n: 262, body: `<p>${lorem(50)}</p><p>${lorem(WORD_BUDGET - 49)}</p>` }] })
    const off = concisenessOffenders(html)
    expect(off).toHaveLength(1)
    expect(off[0]).toMatchObject({ where: 'queue', point: 262 })
    expect(off[0].reason).toContain('too verbose')
  })

  it('respects the word-budget boundary exactly', () => {
    const at = boardHtml({ queue: [{ n: 1, body: `<p>${lorem(45)}</p><p>${lorem(WORD_BUDGET - 45)}</p>` }] })
    expect(concisenessOffenders(at)).toEqual([])
    const over = boardHtml({ queue: [{ n: 1, body: `<p>${lorem(45)}</p><p>${lorem(WORD_BUDGET - 44)}</p>` }] })
    expect(concisenessOffenders(over)).toHaveLength(1)
  })

  it('flags a card stuffed with hashes, paths and code spans as too technical', () => {
    const body = `<p>Fix via <code>a</code> <code>b</code> in flow.mjs at abc1234 und deadbee1 ${lorem(10)}</p>`
    const off = concisenessOffenders(boardHtml({ now: [{ n: 244, body }] }))
    expect(off).toHaveLength(1)
    expect(off[0]).toMatchObject({ where: 'now', point: 244 })
    expect(off[0].reason).toContain('reads like a changelog')
  })

  it('respects the tech-token boundary exactly', () => {
    const four = `<p>abc1234 flow.mjs src/x/y.ts §21 ${lorem(10)}</p>` // exactly 4
    expect(concisenessOffenders(boardHtml({ queue: [{ n: 1, body: four }] }))).toEqual([])
    const five = `<p>abc1234 flow.mjs src/x/y.ts §21 design.md ${lorem(10)}</p>`
    expect(concisenessOffenders(boardHtml({ queue: [{ n: 1, body: five }] }))).toHaveLength(1)
  })

  it('flags one long unbroken paragraph, passes the same length split into paragraphs', () => {
    const words = SINGLE_PARAGRAPH_WORD_BUDGET + 5 // 70 — under WORD_BUDGET, so only structure can flag
    const blob = concisenessOffenders(boardHtml({ queue: [{ n: 256, body: `<p>${lorem(words)}</p>` }] }))
    expect(blob).toHaveLength(1)
    expect(blob[0].reason).toContain('split into paragraphs')
    const split = boardHtml({ queue: [{ n: 256, body: `<p>${lorem(35)}</p><p>${lorem(words - 35)}</p>` }] })
    expect(concisenessOffenders(split)).toEqual([])
  })

  it('passes a short single-<p> card and holds the single-paragraph boundary exactly', () => {
    const at = boardHtml({ queue: [{ n: 1, body: `<p>${lorem(SINGLE_PARAGRAPH_WORD_BUDGET)}</p>` }] })
    expect(concisenessOffenders(at)).toEqual([])
    const over = boardHtml({ queue: [{ n: 1, body: `<p>${lorem(SINGLE_PARAGRAPH_WORD_BUDGET + 1)}</p>` }] })
    expect(concisenessOffenders(over)).toHaveLength(1)
  })

  it('treats a <p>-less long body as a single unbroken paragraph', () => {
    const off = concisenessOffenders(boardHtml({ queue: [{ n: 2, body: lorem(70) }] }))
    expect(off).toHaveLength(1)
    expect(off[0].reason).toContain('split into paragraphs')
  })

  it('exempts Erledigt and Von-dir-zu-klären cards however awful their bodies', () => {
    const awful = `<p>${lorem(200)} abc1234 deadbee1 flow.mjs src/a/b.ts <code>x</code></p>`
    const html = boardHtml({
      queue: [{ n: 181, body: `<p>${lorem(20)}</p>` }],
      questions: [{ t: 'Frage', body: awful }],
      done: [{ n: 263, body: awful }],
    })
    expect(concisenessOffenders(html)).toEqual([])
  })

  it('yields no offenders on malformed input', () => {
    expect(concisenessOffenders(null)).toEqual([])
    expect(concisenessOffenders(42)).toEqual([])
    expect(concisenessOffenders('<html>kein dashboard</html>')).toEqual([])
    expect(concisenessOffenders('<h2>Warteschlange</h2><details>kaputt')).toEqual([])
  })
})

describe('evaluate', () => {
  it('blocks with the offending points and the rewrite guidance', () => {
    const html = boardHtml({
      now: [{ n: 244, body: `<p>${lorem(WORD_BUDGET + 30)}</p>` }],
      queue: [{ n: 181, body: `<p>${lorem(20)}</p>` }],
    })
    const r = evaluate({ dashboardHtml: html })
    expect(r.block).toBe(true)
    expect(r.reason).toContain('now card 244')
    expect(r.reason).toContain('HIGH-LEVEL')
    expect(r.reason).toContain('--synced')
  })

  it('allows a clean board and is total on missing input', () => {
    expect(evaluate({ dashboardHtml: boardHtml({ queue: [{ n: 1, body: `<p>${lorem(10)}</p>` }] }) }).block).toBe(false)
    expect(evaluate({}).block).toBe(false)
    expect(evaluate().block).toBe(false)
  })
})
