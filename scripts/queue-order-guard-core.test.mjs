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
  queueOrderDrift,
  falseDoneClaims,
  parseWorkablePoints,
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
    // 181 is a concrete WebGPU BUG (a fix), not a QA-framework finder — excluded.
    expect([...FINDER_POINTS].sort((a, b) => a - b)).toEqual([184, 200, 203, 204, 205, 207, 285])
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

describe('parseWorkablePoints — open minus what waits on the user (point 450)', () => {
  const text = [
    '- [ ] 210. Fix',
    '- [ ] 211. Fix AWAITING-USER(2026-07-29; needs a ruling)',
    '- [ ] 212. Fix USER-ANSWERED(2026-08-07)',
    '- [x] 209. Done AWAITING-USER(2026-01-01; leftover)',
  ].join('\n')
  it('drops the gated point but keeps the answered one and the plain one', () => {
    expect([...parseWorkablePoints(text)].sort((a, b) => a - b)).toEqual([210, 212])
    // The full open set is unchanged — the done-claim rule still judges 211.
    expect([...parseOpenPoints(text)].sort((a, b) => a - b)).toEqual([210, 211, 212])
  })
  it('is total on non-string input', () => {
    expect(parseWorkablePoints(null).size).toBe(0)
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
  it('orders only the pre-release stretch — work queued after the tag is free', () => {
    // Deliberately deferred past the release (user 26.07.2026): 362/363/364 sit
    // behind 174, so the finder ahead of them is correctly ordered, not misordered.
    expect(
      finderBeforeOpenFix([210, 203, 174, 362, 363], new Set([210, 203, 174, 362, 363])),
    ).toEqual([])
    // The same finder DOES still block when the fix sits before the tag.
    expect(
      finderBeforeOpenFix([203, 362, 174, 363], new Set([203, 362, 174, 363])),
    ).toEqual([203])
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

// POINT 608: rule (1) judges the RANKING; it stayed green through both
// re-sequencings of 10.08.2026 because neither made a finder overtake a fix.
// This rule judges AGREEMENT — the board against the work order it renders.
describe('queueOrderDrift — the rendered sequence against the derived one', () => {
  it('says nothing while the board renders the derived sequence', () => {
    expect(queueOrderDrift([1, 2, 3], [1, 2, 3])).toBeNull()
    expect(queueOrderDrift([], [1, 2, 3])).toBeNull()
  })
  it('names the FIRST divergence and both sequences', () => {
    expect(queueOrderDrift([2, 1, 3], [1, 2, 3])).toMatchObject({ at: 0, got: 2, want: 1 })
    expect(queueOrderDrift([1, 3, 2], [1, 2, 3])).toMatchObject({ at: 1, got: 3, want: 2 })
  })
  it('judges only the points BOTH sides know', () => {
    // The derived order holds every open point, including those the now-section
    // took out of the queue; the board may still show a card for a point ticked
    // since. Neither difference is this rule's to report.
    expect(queueOrderDrift([2, 9], [1, 2, 3])).toBeNull()
    expect(queueOrderDrift([3, 1], [1, 2, 3])).toMatchObject({ at: 0, got: 3, want: 1 })
  })
  it('leaves a doubly listed card to the double-listing invariant', () => {
    expect(queueOrderDrift([2, 2], [1, 2])).toBeNull()
  })
  it('is total on malformed input', () => {
    expect(queueOrderDrift(null, [1])).toBeNull()
    expect(queueOrderDrift([1], null)).toBeNull()
    expect(queueOrderDrift(['x', {}], [1, 2])).toBeNull()
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
    // The cards stand in the DERIVED sequence (point 608): the finder sinks
    // behind the rank-0 tag, which is exactly what a rebuilt board renders.
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 174 }, { n: 203 }] }),
      tasksMd: tasksMd([210, 203, 174]),
    })
    expect(r.block).toBe(false)
  })
  it('does NOT call a finder misordered when the only fix behind it waits on the user (point 450)', () => {
    // The gated card sits at the BACK by construction; without the workable-set
    // rule the guard would read it as a fix the finder jumped, and block every
    // turn end for as long as the user is away.
    const tasks = [
      '- [ ] 203. Open point 203.',
      '- [ ] 211. Open point 211. AWAITING-USER(2026-07-29; needs a ruling)',
      '- [x] 209. Done point 209.',
    ].join('\n')
    const r = evaluate({ dashboardHtml: boardHtml({ queue: [{ n: 203 }, { n: 211 }] }), tasksMd: tasks })
    expect(r.block).toBe(false)
  })

  it('still blocks once that same point is answered and workable again', () => {
    const tasks = [
      '- [ ] 203. Open point 203.',
      '- [ ] 211. Open point 211. USER-ANSWERED(2026-08-07)',
      '- [x] 209. Done point 209.',
    ].join('\n')
    const r = evaluate({ dashboardHtml: boardHtml({ queue: [{ n: 203 }, { n: 211 }] }), tasksMd: tasks })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/QUEUE ORDER WRONG.*203/)
  })

  it('a done-claim on a GATED point is still a false claim', () => {
    const tasks = ['- [ ] 211. Open point 211. AWAITING-USER(2026-07-29; needs a ruling)'].join('\n')
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 211, body: 'Behoben und verifiziert.' }] }),
      tasksMd: tasks,
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/CLAIMS DONE.*211/)
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
  // POINT 608, the failure itself: two re-sequencings on 10.08.2026, the board
  // rebuilt and republished both times, and it kept showing the old plan.
  it('blocks a board whose queue no longer follows the work order', () => {
    const board = boardHtml({ queue: [{ n: 601 }, { n: 602 }, { n: 603 }] })
    expect(evaluate({ dashboardHtml: board, tasksMd: tasksMd([210, 601, 602, 603]) }).block).toBe(false)
    // The work order is re-sequenced; the board is not rebuilt.
    const r = evaluate({ dashboardHtml: board, tasksMd: tasksMd([210, 603, 601, 602]) })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/QUEUE ORDER DRIFTED/)
    expect(r.reason).toMatch(/603/)
    expect(r.reason).toMatch(/board-queue\.mjs/)
  })

  it('blocks a hand-edited card sequence even when the ranking stays legal', () => {
    // Two ordinary fixes swapped by hand: no finder overtakes anything, so rule
    // (1) is silent — this is the case that went unseen.
    const tasks = tasksMd([601, 602])
    expect(evaluate({ dashboardHtml: boardHtml({ queue: [{ n: 601 }, { n: 602 }] }), tasksMd: tasks }).block).toBe(false)
    const r = evaluate({ dashboardHtml: boardHtml({ queue: [{ n: 602 }, { n: 601 }] }), tasksMd: tasks })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/QUEUE ORDER DRIFTED/)
    expect(r.reason).not.toMatch(/QUEUE ORDER WRONG/)
  })

  it('prints the stretch AROUND a late divergence, not the head of the queue', () => {
    // The live queue is ~140 cards long; a head-only message printed two
    // identical opening runs and read as a guard confused about its own finding.
    const points = Array.from({ length: 20 }, (_, i) => 601 + i)
    const swapped = [...points]
    ;[swapped[17], swapped[18]] = [swapped[18], swapped[17]]
    const r = evaluate({ dashboardHtml: boardHtml({ queue: swapped.map((n) => ({ n })) }), tasksMd: tasksMd(points) })
    expect(r.block).toBe(true)
    expect(r.reason).toContain('position 18')
    expect(r.reason).toContain('Board there: …, 614, 615, 616, 617, 619, 618, 620')
    expect(r.reason).toContain('work order there: …, 614, 615, 616, 617, 618, 619, 620')
    expect(r.reason).not.toContain('601')
  })

  it('accepts the rank rules ON TOP of the work order, and a promoted card missing from the queue', () => {
    // 203 is a finder and sinks; 210 is the now-card and has no queue card at all.
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 601 }, { n: 602 }, { n: 203 }] }),
      tasksMd: tasksMd([210, 601, 203, 602]),
    })
    expect(r.block).toBe(false)
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
