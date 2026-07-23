// Decision-logic sweep of the dashboard-card-topic Stop-hook guard
// (dashboard-card-topic-guard-core): the two reference forms with their exact
// gates (known set, own number, single-digit exemption), the section scoping
// (Erledigt exempt, VDZK in scope), every mandated false-positive class, and
// totality on malformed input (the wrapper's fail-open depends on the core
// never throwing).
import { describe, it, expect } from 'vitest'
import {
  knownPoints,
  parseCards,
  foreignRefs,
  topicViolations,
  evaluate,
} from './dashboard-card-topic-guard-core.mjs'

/** Known-point set covering the numbers the cases below reference. */
const KNOWN = new Set([1, 13, 92, 188, 244, 246, 266, 272])

const TASKS_SAMPLE = `# TASKS
- [x] 1. First point ever.
- [x] 92. A mid-range point.
- [ ] 272. OCCASIONAL FRAME HITCHES WHILE DRIVING CONTINUOUSLY.
  - [ ] a sub item 99. that must not register
some prose mentioning 123. without the checkbox form
- [x] 246. Crocodile fix.
- [x] 266. Trample crush sound.
`

/** Minimal dashboard in the real board's markup (now + questions + queue + done). */
function boardHtml({ now = [], questions = [], queue = [], done = [] } = {}) {
  const card = ({ n, t = 'Titel', body }) =>
    `<details>\n  <summary>${n != null ? `<span class="num">${n}</span>` : ''}<span class="t">${t}</span></summary>\n  <div class="body">${body}</div>\n</details>`
  const nowCard = ({ n, t = 'Titel', body }) =>
    `<details class="now" open>\n  <summary><span class="t">${n != null ? `${n} — ` : ''}${t}</span></summary>\n  <div class="body">${body}</div>\n</details>`
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

describe('knownPoints', () => {
  it('collects every `- [ ] N.` / `- [x] N.` line and nothing else', () => {
    expect([...knownPoints(TASKS_SAMPLE)].sort((a, b) => a - b)).toEqual([1, 92, 246, 266, 272])
  })

  it('is total on non-string input', () => {
    expect(knownPoints(null)).toEqual(new Set())
    expect(knownPoints(42)).toEqual(new Set())
  })
})

describe('parseCards', () => {
  it('reads the own point from class="num" (queue) or the leading now-title number', () => {
    const html = boardHtml({
      now: [{ n: 272, body: '<p>Kurz.</p>' }, { t: 'Prozess-Karte', body: '<p>Kurz.</p>' }],
      queue: [{ n: 244, body: '<p>Kurz.</p>' }],
    })
    const now = parseCards(html.slice(html.indexOf('Woran ich'), html.indexOf('<h2>Von dir')), 'now')
    expect(now.map((c) => c.point)).toEqual([272, null])
    const queue = parseCards(html.slice(html.indexOf('<h2>Warteschlange'), html.indexOf('<h2>Erledigt')), 'queue')
    expect(queue.map((c) => c.point)).toEqual([244])
  })

  it('is total on malformed input', () => {
    expect(parseCards(null, 'queue')).toEqual([])
    expect(parseCards('<details><summary>kein body</summary></details>', 'now')).toEqual([])
  })
})

describe('foreignRefs', () => {
  it('finds parenthesized and spelled-out foreign points, deduplicated and sorted', () => {
    const body = '<p>Der Krokodil-Fix (246) und der Geräusch-Fix (266) sind gelandet, siehe Punkt 244 und nochmal (246).</p>'
    expect(foreignRefs(body, 272, KNOWN)).toEqual([244, 246, 266])
  })

  it('never flags the card own number', () => {
    expect(foreignRefs('<p>Der Fix (246) aus Punkt 246 selbst.</p>', 246, KNOWN)).toEqual([])
  })

  it('gates every form on the known-point set', () => {
    expect(foreignRefs('<p>Screenshot (99) und Punkt 99 sind kein Punkt.</p>', 272, KNOWN)).toEqual([])
    expect(foreignRefs('<p>Aber (92) ist einer.</p>', 272, KNOWN)).toEqual([92])
  })

  it('is total on bad input', () => {
    expect(foreignRefs(null, 1, KNOWN)).toEqual([])
    expect(foreignRefs('<p>(246)</p>', 272, null)).toEqual([])
  })
})

describe('topicViolations', () => {
  it('flags the 272 regression: a now-card reporting on 246 and 266', () => {
    const html = boardHtml({
      now: [
        {
          n: 272,
          t: 'Lauf-Hänger beheben',
          body: '<p>Der Krokodil-Fix (246) und der Geräusch-Fix (266) sind geprüft und gelandet.</p>',
        },
      ],
    })
    const v = topicViolations(html, KNOWN)
    expect(v).toHaveLength(2)
    expect(v[0]).toMatchObject({ where: 'now', point: 272, ref: 246 })
    expect(v[1]).toMatchObject({ where: 'now', point: 272, ref: 266 })
  })

  it('never flags a card citing its own number', () => {
    const html = boardHtml({
      queue: [{ n: 246, body: '<p>Der Fix (246) ist gebaut — Punkt 246 wartet auf die Prüfung.</p>' }],
    })
    expect(topicViolations(html, KNOWN)).toEqual([])
  })

  it('flags "Punkt N"/"point N" to a foreign point in now and queue cards', () => {
    const punkt = boardHtml({ queue: [{ n: 256, body: '<p>Folgt nach Punkt 244.</p>' }] })
    expect(topicViolations(punkt, KNOWN)).toMatchObject([{ where: 'queue', point: 256, ref: 244 }])
    const point = boardHtml({ now: [{ n: 272, body: '<p>Blocked behind point 244 for now.</p>' }] })
    expect(topicViolations(point, KNOWN)).toMatchObject([{ where: 'now', point: 272, ref: 244 }])
  })

  it('treats any known-point reference in an own-number-less VDZK card as foreign', () => {
    const html = boardHtml({
      questions: [{ t: 'Entscheidung nötig', body: '<p>Das hängt an Punkt 246.</p>' }],
    })
    expect(topicViolations(html, KNOWN)).toMatchObject([{ where: 'question', point: null, ref: 246 }])
  })

  it('passes the live-board VDZK enumeration style "(1) … (4)"', () => {
    const html = boardHtml({
      questions: [
        { t: 'Regionszuschnitt', body: '<p>Vorschlag: (1) Schrift-Norden, (2) tonaler Westen, (3) Zeichen-Tasche, (4) Signal-Osten.</p>' },
      ],
    })
    expect(topicViolations(html, KNOWN)).toEqual([])
  })

  it('never flags counts, dates, times, years, versions, §-refs, slashed pairs, hashes or "(1)"', () => {
    const body =
      '<p>15 neue Tests, insgesamt 2532 Tests. Kalender stoppt am 31.12.1895, Lauf bis 14:54, Start 1890. ' +
      'Kommt in v0.2, Rest in v0.3. Regel aus §19.8 und §4.4. Screenshots 129/130 und Screenshot 92. ' +
      'Pill [x] 7ae7150, Inventar (1), dreimal (3×).</p>'
    const html = boardHtml({ now: [{ n: 272, body }], queue: [{ n: 244, body }] })
    expect(topicViolations(html, KNOWN)).toEqual([])
  })

  it('flags a parenthesized number only when it is a known point', () => {
    const unknown = boardHtml({ now: [{ n: 272, body: '<p>Siehe Screenshot (93).</p>' }] })
    expect(topicViolations(unknown, new Set([272]))).toEqual([])
    const known = boardHtml({ now: [{ n: 272, body: '<p>Siehe (92).</p>' }] })
    expect(topicViolations(known, KNOWN)).toMatchObject([{ where: 'now', point: 272, ref: 92 }])
  })

  it('exempts Erledigt cards however cross-referential their history', () => {
    const html = boardHtml({
      done: [{ n: 263, body: '<p>Baut auf Punkt 188 auf und schloss (246) und (266) mit ab.</p>' }],
    })
    expect(topicViolations(html, KNOWN)).toEqual([])
  })

  it('passes a clean on-topic board', () => {
    const html = boardHtml({
      now: [{ n: 272, body: '<p>Der Fix ist gebaut; der WebGPU-Bildcheck läuft.</p>' }],
      questions: [{ t: 'ntfy abonnieren', body: '<p>Öffne das Topic einmal im Browser.</p>' }],
      queue: [{ n: 244, body: '<p>Die Space-Taste wartet auf die Browser-Prüfung.</p>' }],
      done: [{ n: 246, body: '<p>Krokodil sichtbar gefixt.</p>' }],
    })
    expect(topicViolations(html, KNOWN)).toEqual([])
  })

  it('yields no violations on malformed input', () => {
    expect(topicViolations(null, KNOWN)).toEqual([])
    expect(topicViolations('<html>kein dashboard</html>', KNOWN)).toEqual([])
    expect(topicViolations(boardHtml(), null)).toEqual([])
    expect(topicViolations('<h2>Warteschlange</h2><details>kaputt', KNOWN)).toEqual([])
  })
})

describe('evaluate', () => {
  it('blocks naming the card and each foreign reference', () => {
    const html = boardHtml({
      now: [
        { n: 272, body: '<p>Der Krokodil-Fix (246) und der Geräusch-Fix (266) sind geprüft und gelandet.</p>' },
      ],
    })
    const r = evaluate({ dashboardHtml: html, tasksText: TASKS_SAMPLE })
    expect(r.block).toBe(true)
    expect(r.reason).toContain('now-card "272" references point 246')
    expect(r.reason).toContain('now-card "272" references point 266')
    expect(r.reason).toContain('--synced')
  })

  it('allows a clean board and is total on missing input', () => {
    const clean = boardHtml({ now: [{ n: 272, body: '<p>Läuft.</p>' }] })
    expect(evaluate({ dashboardHtml: clean, tasksText: TASKS_SAMPLE }).block).toBe(false)
    expect(evaluate({}).block).toBe(false)
    expect(evaluate().block).toBe(false)
  })
})
