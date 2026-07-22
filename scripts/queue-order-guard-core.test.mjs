// Decision-logic sweep of the queue-order Stop-hook guard (queue-order-guard-core):
// the finder-before-fix order rule, the dashboard-truth (false done-claim) rule
// with its negation/qualifier window tested BOTH ways, and totality on malformed
// input (the wrapper's fail-open depends on the core never throwing).
import { describe, it, expect } from 'vitest'
import {
  FINDER_POINTS,
  RELEASE_TAG_POINT,
  DONE_CLAIM_TOKENS,
  parseOpenPoints,
  parseQueueCards,
  parseNowCard,
  finderBeforeOpenFix,
  falseDoneClaims,
  evaluate,
} from './queue-order-guard-core.mjs'

/** Minimal dashboard in the real board's markup (queue cards + now-card + Erledigt). */
function boardHtml({ nowTitle = '210 — Meereskante', nowBody = 'Status: in Arbeit.', queue = [], done = [209] } = {}) {
  const q = queue
    .map(
      ({ n, t = `Task ${n}`, body = 'Offener Punkt.' }) =>
        `<details>\n  <summary><span class="num">${n}</span><span class="t">${t}</span></summary>\n  <div class="body"><p>${body}</p></div>\n</details>`,
    )
    .join('\n')
  const d = done
    .map((n) => `<details><summary><span class="num">${n}</span><span class="t">Done ${n}</span></summary></details>`)
    .join('\n')
  return `<main><h1>Dashboard</h1>
<h2>Woran ich gerade arbeite</h2>
<details class="now" open><summary><span class="t">${nowTitle}</span></summary>
<div class="body"><p>${nowBody}</p></div></details>
<h2>Von dir zu klären</h2>
<h2>Warteschlange</h2>
${q}
<h2>Erledigt</h2>
${d}
</main>`
}

const tasksMd = (open, done = [209]) =>
  [...open.map((n) => `- [ ] ${n}. Open point ${n}.`), ...done.map((n) => `- [x] ${n}. Done point ${n}.`)].join('\n')

describe('constants', () => {
  it('pin the finder set, the tag exemption and the claim tokens', () => {
    expect([...FINDER_POINTS].sort((a, b) => a - b)).toEqual([181, 184, 203, 204, 205, 207])
    expect(RELEASE_TAG_POINT).toBe(174)
    expect(DONE_CLAIM_TOKENS).toContain('behoben')
    expect(DONE_CLAIM_TOKENS).toContain('done')
  })
})

describe('parseOpenPoints', () => {
  it('collects open points, skipping DEFERRED, ignoring done', () => {
    const set = parseOpenPoints(
      ['- [ ] 210. Fix', '- [ ] 205. Audit DEFERRED until the tag', '- [x] 209. Done'].join('\n'),
    )
    expect([...set]).toEqual([210])
  })
  it('is total on non-string input', () => {
    expect(parseOpenPoints(null).size).toBe(0)
  })
})

describe('parseQueueCards / parseNowCard', () => {
  const html = boardHtml({ queue: [{ n: 211 }, { n: 203 }], done: [209] })
  it('returns the Warteschlange cards in document order, never the Erledigt cards', () => {
    const cards = parseQueueCards(html)
    expect(cards.map((c) => c.point)).toEqual([211, 203])
    expect(cards[0].text).toContain('Offener Punkt')
  })
  it('reads the now-card title point and its text; null point on non-point work', () => {
    expect(parseNowCard(html)).toMatchObject({ point: 210 })
    expect(parseNowCard(boardHtml({ nowTitle: 'Closing-Zyklus' })).point).toBeNull()
  })
  it('is total on missing sections / non-string input', () => {
    expect(parseQueueCards('<p>no board</p>')).toEqual([])
    expect(parseQueueCards(null)).toEqual([])
    expect(parseNowCard('<p>no board</p>')).toBeNull()
    expect(parseNowCard(undefined)).toBeNull()
  })
})

describe('finderBeforeOpenFix', () => {
  it('flags a finder queued ahead of an open fix', () => {
    expect(finderBeforeOpenFix([210, 203, 211, 174], new Set([210, 203, 211, 174]))).toEqual([203])
  })
  it('flags every misordered finder once', () => {
    expect(finderBeforeOpenFix([203, 205, 211], new Set([203, 205, 211]))).toEqual([203, 205])
  })
  it('allows finders after all open fixes (fixes closed or ordered first)', () => {
    expect(finderBeforeOpenFix([210, 211, 203, 205, 174], new Set([210, 211, 203, 205, 174]))).toEqual([])
    // 211 was closed in TASKS but still queued after the finder — no open fix follows.
    expect(finderBeforeOpenFix([203, 211], new Set([203]))).toEqual([])
  })
  it('exempts the release tag on both sides and ignores closed finders', () => {
    // Only 174 after the finder — exempt, not "open fix work".
    expect(finderBeforeOpenFix([203, 174], new Set([203, 174]))).toEqual([])
    // The finder itself is done (stale queue card — another guard's job).
    expect(finderBeforeOpenFix([203, 211], new Set([211]))).toEqual([])
  })
  it('is total on malformed input', () => {
    expect(finderBeforeOpenFix(null, null)).toEqual([])
    expect(finderBeforeOpenFix(['x', {}, 203], 'garbage')).toEqual([])
  })
})

describe('falseDoneClaims — the negation window, both ways', () => {
  const open = new Set([210, 204, 184])
  it('flags a live done-claim on an open point', () => {
    expect(falseDoneClaims([{ point: 210, text: 'Meereskante: behoben, beide Backends bildverifiziert.' }], open)).toEqual([210])
    expect(falseDoneClaims([{ point: 204, text: 'WebGPU coverage is done and green everywhere.' }], open)).toEqual([204])
  })
  it('does not flag a negated claim', () => {
    expect(falseDoneClaims([{ point: 210, text: 'Meereskante — NICHT behoben, Wand weiter sichtbar.' }], open)).toEqual([])
    expect(falseDoneClaims([{ point: 210, text: 'Stufige Meereskante („Wand") — NICHT gelöst' }], open)).toEqual([])
  })
  it('does not flag a retracted claim (negation AFTER the token)', () => {
    expect(
      falseDoneClaims([{ point: 210, text: 'die frühere „behoben, beide Backends"-Behauptung war FALSCH' }], open),
    ).toEqual([])
  })
  it('does not flag sub-work or sub-item claims', () => {
    expect(falseDoneClaims([{ point: 210, text: 'Diagnose-Vorarbeit erledigt (commit e233039), Fix steht aus.' }], open)).toEqual([])
    expect(falseDoneClaims([{ point: 204, text: 'Backend-Fallback via assertBackend. (b) erledigt (15bd21b): Lauf grün.' }], open)).toEqual([])
  })
  it('does not flag conditional/future phrasing', () => {
    expect(
      falseDoneClaims([{ point: 184, text: 'Der finale Closing-Lauf passiert erst, wenn ALLE offenen Bugfixes erledigt sind.' }], open),
    ).toEqual([])
  })
  it('does not flag a claim on a CLOSED point, planning "Fix:", inflections, or substrings', () => {
    expect(falseDoneClaims([{ point: 209, text: 'Behoben und verifiziert.' }], open)).toEqual([])
    expect(falseDoneClaims([{ point: 210, text: 'Fix: Normalen glätten + Tessellierung anheben.' }], open)).toEqual([])
    expect(falseDoneClaims([{ point: 210, text: 'Dashboard voll-reconciled, erledigte Karten entfernt.' }], open)).toEqual([])
    expect(falseDoneClaims([{ point: 210, text: 'Check grün: Plover {resolved:true} bei 0 FAIL.' }], open)).toEqual([])
  })
  it('is total on malformed input', () => {
    expect(falseDoneClaims(null, open)).toEqual([])
    expect(falseDoneClaims([null, { point: 'x' }, { point: 210 }], 'garbage')).toEqual([])
  })
})

describe('evaluate — end to end on the two raw files', () => {
  it('blocks a finder queued before an open fix, naming it', () => {
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 203 }, { n: 211 }, { n: 174 }] }),
      tasksMd: tasksMd([210, 203, 211, 174]),
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/QUEUE ORDER WRONG.*203/)
  })
  it('allows the finder once every fix ahead of it is closed', () => {
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 203 }, { n: 174 }] }),
      tasksMd: tasksMd([210, 203, 174]),
    })
    expect(r.block).toBe(false)
  })
  it('blocks a queue card claiming an open point done', () => {
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 211, body: 'Behoben, beide Backends bildverifiziert.' }] }),
      tasksMd: tasksMd([210, 211]),
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/CLAIMS DONE.*211/)
  })
  it('blocks a NOW-card claiming its open point done', () => {
    const r = evaluate({
      dashboardHtml: boardHtml({ nowTitle: '210 — Meereskante', nowBody: 'Behoben und verifiziert.', queue: [{ n: 211 }] }),
      tasksMd: tasksMd([210, 211]),
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/CLAIMS DONE.*210/)
  })
  it('allows a negated claim and a claim on a closed point', () => {
    const html = boardHtml({
      queue: [
        { n: 211, body: 'NICHT behoben — Kerbe weiter sichtbar.' },
        { n: 209, body: 'Behoben und verifiziert.' }, // stale queue card, but the point is closed
      ],
    })
    expect(evaluate({ dashboardHtml: html, tasksMd: tasksMd([210, 211]) }).block).toBe(false)
  })
  it('reports both problems in one reason', () => {
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 203 }, { n: 211, body: 'Behoben, beide Backends bildverifiziert.' }] }),
      tasksMd: tasksMd([203, 211]),
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/QUEUE ORDER WRONG.*203/)
    expect(r.reason).toMatch(/CLAIMS DONE.*211/)
  })
  it('fails open on malformed/missing input', () => {
    expect(evaluate().block).toBe(false)
    expect(evaluate({ dashboardHtml: null, tasksMd: null }).block).toBe(false)
    expect(evaluate({ dashboardHtml: 42, tasksMd: {} }).block).toBe(false)
    expect(evaluate({ dashboardHtml: '<p>no sections</p>', tasksMd: tasksMd([210]) }).block).toBe(false)
    // No open points at all → nothing enforceable.
    expect(evaluate({ dashboardHtml: boardHtml({ queue: [{ n: 203 }] }), tasksMd: '- [x] 209. Done.' }).block).toBe(false)
  })
})
