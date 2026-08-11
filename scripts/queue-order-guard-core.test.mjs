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
  parseNowCards,
  finderBeforeOpenFix,
  queueOrderDrift,
  falseDoneClaims,
  parseWorkablePoints,
  unrankedAppendProblem,
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

/**
 * The rank record as a settled order: `points` is the PROVENANCE baseline — what
 * the work order held when nothing was outstanding. Every fixture that is not
 * about the append gate itself carries one, because a checkout with no baseline
 * is a state the gate speaks up about in its own right (point 590).
 */
const ranks = (points, ranked = {}) =>
  JSON.stringify({ ranked, settled: { at: '2026-08-10T09:00:00.000Z', points } })

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
    expect(parseNowCards('<p>no board</p>')).toEqual([])
    expect(parseNowCards(undefined)).toEqual([])
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
  // FOUR-EYES FINDING 1 (Fable 5): invariant 4b covers a now-card also sitting
  // in the queue, and `parseQueuePoints` returns a Set — a point carded twice
  // INSIDE the Warteschlange was caught by nothing, so delegating it here would
  // have left a real drift unseen.
  it('reports a point carded twice instead of delegating it', () => {
    expect(queueOrderDrift([2, 2], [1, 2])).toMatchObject({ duplicate: 2 })
    expect(queueOrderDrift([1, 2, 1], [1, 2])).toMatchObject({ duplicate: 1 })
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
      rankRecordJson: ranks([174, 203, 210, 211]),
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
      rankRecordJson: ranks([174, 203, 210]),
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
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 203 }, { n: 211 }] }),
      tasksMd: tasks,
      rankRecordJson: ranks([203, 211]),
    })
    expect(r.block).toBe(false)
  })

  it('still blocks once that same point is answered and workable again', () => {
    const tasks = [
      '- [ ] 203. Open point 203.',
      '- [ ] 211. Open point 211. USER-ANSWERED(2026-08-07)',
      '- [x] 209. Done point 209.',
    ].join('\n')
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 203 }, { n: 211 }] }),
      tasksMd: tasks,
      rankRecordJson: ranks([203, 211]),
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/QUEUE ORDER WRONG.*203/)
  })

  it('a done-claim on a GATED point is still a false claim', () => {
    const tasks = ['- [ ] 211. Open point 211. AWAITING-USER(2026-07-29; needs a ruling)'].join('\n')
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 211, body: 'Behoben und verifiziert.' }] }),
      tasksMd: tasks,
      rankRecordJson: ranks([211]),
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/CLAIMS DONE.*211/)
  })

  it('blocks a queue card claiming an open point done', () => {
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 211, body: 'Behoben, beide Backends bildverifiziert.' }] }),
      tasksMd: tasksMd([210, 211]),
      rankRecordJson: ranks([210, 211]),
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/CLAIMS DONE.*211/)
  })
  it('blocks a NOW-card claiming its open point done', () => {
    const r = evaluate({
      dashboardHtml: boardHtml({ nowTitle: '210 — Meereskante', nowBody: 'Behoben und verifiziert.', queue: [{ n: 211 }] }),
      tasksMd: tasksMd([210, 211]),
      rankRecordJson: ranks([210, 211]),
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
    expect(evaluate({ dashboardHtml: html, tasksMd: tasksMd([210, 211]), rankRecordJson: ranks([210, 211]) }).block).toBe(
      false,
    )
  })
  it('reports both problems in one reason', () => {
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 203 }, { n: 211, body: 'Behoben, beide Backends bildverifiziert.' }] }),
      tasksMd: tasksMd([203, 211]),
      rankRecordJson: ranks([203, 211]),
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/QUEUE ORDER WRONG.*203/)
    expect(r.reason).toMatch(/CLAIMS DONE.*211/)
  })
  // POINT 608, the failure itself: two re-sequencings on 10.08.2026, the board
  // rebuilt and republished both times, and it kept showing the old plan.
  it('blocks a board whose queue no longer follows the work order', () => {
    const board = boardHtml({ queue: [{ n: 601 }, { n: 602 }, { n: 603 }] })
    const rankRecordJson = ranks([210, 601, 602, 603])
    expect(evaluate({ dashboardHtml: board, tasksMd: tasksMd([210, 601, 602, 603]), rankRecordJson }).block).toBe(false)
    // The work order is re-sequenced; the board is not rebuilt.
    const r = evaluate({ dashboardHtml: board, tasksMd: tasksMd([210, 603, 601, 602]), rankRecordJson })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/QUEUE ORDER DRIFTED/)
    expect(r.reason).toMatch(/603/)
    expect(r.reason).toMatch(/board-queue\.mjs/)
  })

  it('blocks a hand-edited card sequence even when the ranking stays legal', () => {
    // Two ordinary fixes swapped by hand: no finder overtakes anything, so rule
    // (1) is silent — this is the case that went unseen.
    const tasks = tasksMd([601, 602])
    const rankRecordJson = ranks([601, 602])
    expect(
      evaluate({ dashboardHtml: boardHtml({ queue: [{ n: 601 }, { n: 602 }] }), tasksMd: tasks, rankRecordJson }).block,
    ).toBe(false)
    const r = evaluate({ dashboardHtml: boardHtml({ queue: [{ n: 602 }, { n: 601 }] }), tasksMd: tasks, rankRecordJson })
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
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: swapped.map((n) => ({ n })) }),
      tasksMd: tasksMd(points),
      rankRecordJson: ranks(points),
    })
    expect(r.block).toBe(true)
    expect(r.reason).toContain('position 18')
    expect(r.reason).toContain('Board there: …, 614, 615, 616, 617, 619, 618, 620')
    expect(r.reason).toContain('work order there: …, 614, 615, 616, 617, 618, 619, 620')
    expect(r.reason).not.toContain('601')
  })

  it('blocks a hand-edited board that cards one point twice', () => {
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 601 }, { n: 602 }, { n: 601 }] }),
      tasksMd: tasksMd([601, 602]),
      rankRecordJson: ranks([601, 602]),
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/LISTS ONE POINT TWICE.*601/)
    expect(r.reason).toMatch(/board-queue\.mjs/)
  })

  it('accepts the rank rules ON TOP of the work order, and a promoted card missing from the queue', () => {
    // 203 is a finder and sinks; 210 is the now-card and has no queue card at all.
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 601 }, { n: 602 }, { n: 203 }] }),
      tasksMd: tasksMd([210, 601, 203, 602]),
      rankRecordJson: ranks([210, 203, 601, 602]),
    })
    expect(r.block).toBe(false)
  })

  it('fails open on malformed/missing input', () => {
    expect(evaluate().block).toBe(false)
    expect(evaluate({ dashboardHtml: null, tasksMd: null }).block).toBe(false)
    expect(evaluate({ dashboardHtml: 42, tasksMd: {} }).block).toBe(false)
    expect(
      evaluate({ dashboardHtml: '<p>no sections</p>', tasksMd: tasksMd([210]), rankRecordJson: ranks([210]) }).block,
    ).toBe(false)
    // No open points at all → nothing enforceable.
    expect(evaluate({ dashboardHtml: boardHtml({ queue: [{ n: 203 }] }), tasksMd: '- [x] 209. Done.' }).block).toBe(false)
  })
})

describe('a done-claim is attributed to the card it stands in (10.08.2026)', () => {
  /** The now-section as the live board builds it: one card PER point in parallel work. */
  const nowSection = (cards) =>
    `<main><h1>Dashboard</h1>
<h2>Woran ich gerade arbeite</h2>
${cards
  .map(
    ({ n, body }) =>
      `<details class="now"><summary><span class="t">${n} — Arbeit ${n}</span></summary>\n<div class="body"><p>${body}</p></div></details>`,
  )
  .join('\n')}
<h2>Von dir zu klären</h2>
<h2>Warteschlange</h2>
<h2>Erledigt</h2>
</main>`

  const tasks = ['- [ ] 610. A.', '- [ ] 590. B.', '- [ ] 509. C.', '- [ ] 585. D.'].join('\n')
  const rankRecordJson = ranks([509, 585, 590, 610])

  it('reads the section as one card PER point, in document order', () => {
    const cards = parseNowCards(nowSection([{ n: 610, body: 'läuft' }, { n: 590, body: 'fertig' }]))
    expect(cards.map((c) => c.point)).toEqual([610, 590])
    expect(cards[1].text).toContain('fertig')
    expect(cards[0].text).not.toContain('fertig')
  })

  it('names the point whose OWN card carries the claim, not the section’s first', () => {
    // The live case: the word stood in the 590 card and the guard blocked naming
    // 610, sending the reader to an innocent card with full confidence.
    const html = nowSection([
      { n: 610, body: 'Status: läuft.' },
      { n: 590, body: 'Der Zweig ist fertig und geprüft.' },
      { n: 509, body: 'Status: läuft.' },
    ])
    const r = evaluate({ dashboardHtml: html, tasksMd: tasks, rankRecordJson })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/CLAIMS DONE[^|]*\b590\b/)
    expect(r.reason).not.toMatch(/CLAIMS DONE[^|]*\b610\b/)
  })

  it('finds the claim in the LAST card as readily as in the first', () => {
    const r = evaluate({
      dashboardHtml: nowSection([
        { n: 610, body: 'Status: läuft.' },
        { n: 585, body: 'Alles erledigt.' },
      ]),
      tasksMd: tasks,
      rankRecordJson,
    })
    expect(r.reason).toMatch(/CLAIMS DONE[^|]*\b585\b/)
    expect(r.reason).not.toMatch(/CLAIMS DONE[^|]*\b610\b/)
  })

  it('flips to allowed when THAT card’s wording is corrected, and only then', () => {
    const clean = nowSection([
      { n: 610, body: 'Status: läuft.' },
      { n: 509, body: 'Der Zweig ist geprüft, der Punkt bleibt offen.' },
    ])
    expect(evaluate({ dashboardHtml: clean, tasksMd: tasks, rankRecordJson }).block).toBe(false)
    const stillClaiming = nowSection([
      { n: 610, body: 'Status: läuft.' },
      { n: 509, body: 'Der Zweig ist fertig und geprüft.' },
    ])
    expect(evaluate({ dashboardHtml: stillClaiming, tasksMd: tasks, rankRecordJson }).block).toBe(true)
  })

  it('says nothing about a card whose title carries no point number', () => {
    const r = evaluate({
      dashboardHtml: nowSection([{ n: 610, body: 'Status: läuft.' }]).replace(
        '610 — Arbeit 610',
        'Closing-Zyklus, alles erledigt',
      ),
      tasksMd: tasks,
      rankRecordJson,
    })
    expect(r.block).toBe(false)
  })
})

// POINT 590: rules (1) and (1b) judge the BOARD. This one judges the WORK ORDER
// — an appended point sits where append-and-defer put it, which is a default and
// not a judgment, and the board renders that default to the user.
describe('the APPEND GATE — a new point is ranked once, deliberately', () => {
  // 211 stands ahead of 210, so the order carries a judgment; 300 was appended
  // behind both — it is missing from the baseline the order was last settled
  // with — and nobody has said whether that is where it belongs.
  const appended = ['- [ ] 211. Erst dieser.', '- [ ] 210. Dann dieser.', '- [ ] 300. FRISCH ANGEHÄNGT.'].join('\n')
  const board = boardHtml({ queue: [{ n: 211 }, { n: 210 }, { n: 300 }] })
  const before = ranks([210, 211])

  it('blocks the turn that appended a point until its rank is settled', () => {
    const r = evaluate({ dashboardHtml: board, tasksMd: appended, rankRecordJson: before })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/APPENDED POINT NOT RANKED.*300/)
    expect(r.reason).toMatch(/queue-rank\.mjs --ranked/)
  })

  it('is satisfied by the recorded decision that last is right', () => {
    const rankRecordJson = ranks([210, 211], { 300: { at: '2026-08-10T09:00:00.000Z', why: 'nothing waits on it' } })
    expect(evaluate({ dashboardHtml: board, tasksMd: appended, rankRecordJson }).block).toBe(false)
  })

  it('never asks again once the appended point is part of the settled order', () => {
    // The FALSE BLOCK a review found: 300 answered and settled, then 300 lands —
    // and 210, which has stood there all along, was asked about because it now
    // happens to be last. Nothing was appended; nothing is asked.
    const settled = ranks([210, 211, 300])
    expect(evaluate({ dashboardHtml: board, tasksMd: appended, rankRecordJson: settled }).block).toBe(false)
    const closed = ['- [ ] 211. Erst dieser.', '- [ ] 210. Dann dieser.', '- [x] 300. Erledigt.'].join('\n')
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 211 }, { n: 210 }] }),
      tasksMd: closed,
      rankRecordJson: settled,
    })
    expect(r.block).toBe(false)
  })

  it('asks about EVERY point appended since, whatever the numbers do', () => {
    // The SILENT ESCAPE: two reopened points appended behind [9, 5] in
    // descending order — the running-maximum walk questioned only the last.
    const reopened = [
      '- [ ] 9. Alt.',
      '- [ ] 5. Auch alt.',
      '- [ ] 4. WIEDER GEÖFFNET.',
      '- [ ] 3. UND NOCH EINER.',
    ].join('\n')
    const r = evaluate({
      dashboardHtml: boardHtml({ queue: [{ n: 9 }, { n: 5 }, { n: 4 }, { n: 3 }] }),
      tasksMd: reopened,
      rankRecordJson: ranks([5, 9]),
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/NOT RANKED[^|]*\b4, 3\b/)
  })

  it('stops asking about a point that was MOVED into the order', () => {
    // Moved ahead of points the baseline remembers, 300 is judged by the move
    // itself — and no survivor takes its place in the question.
    const moved = [
      '- [ ] 300. FRISCH ANGEHÄNGT, sofort zu arbeiten.',
      '- [ ] 211. Erst dieser.',
      '- [ ] 210. Dann dieser.',
    ].join('\n')
    const html = boardHtml({ queue: [{ n: 300 }, { n: 211 }, { n: 210 }] })
    expect(evaluate({ dashboardHtml: html, tasksMd: moved, rankRecordJson: before }).block).toBe(false)
  })

  it('asks even where there is no board to judge — the gate is about the work order', () => {
    // The board rules have nothing to say without a Warteschlange; this one does,
    // so `evaluate` may not return early on an empty card list any more.
    for (const dashboardHtml of ['', '<p>kein Board</p>', boardHtml({ queue: [] })]) {
      const r = evaluate({ dashboardHtml, tasksMd: appended, rankRecordJson: before })
      expect(r.block).toBe(true)
      expect(r.reason).toMatch(/APPENDED POINT NOT RANKED/)
    }
  })

  it('stays QUIET on a TORN record rather than trapping the session', () => {
    // Every guard here is fail-OPEN by decree: an unreadable record is not a
    // verdict, and the CLI is the loud half (it refuses to write over it).
    // An EXISTING zero-byte file belongs in this list, not in the unarmed one
    // below: the guard used to block it as "never armed" while the CLI wrote
    // straight over it — both halves backwards.
    for (const rankRecordJson of ['', '   ', '{"ranked":{', 'not json', '[]', '{"settled":{"points":"kaputt"}}']) {
      expect(evaluate({ dashboardHtml: board, tasksMd: appended, rankRecordJson }).block).toBe(false)
    }
  })

  it('asks for the BASELINE where none was ever recorded, instead of waving the order through', () => {
    // A record that carries no baseline cannot tell an append from a survivor,
    // and falling silent there is the exemption that swallowed an unranked
    // append. One command answers the whole order — and an EMPTIED `ranked` is
    // not "never armed": armedness is read off `settled` alone.
    // `null` is the ONLY absence — that is what the reader passes when the file
    // is not there. An existing empty file is torn, and tested above.
    for (const rankRecordJson of [null, undefined, '{"ranked":{}}', '{"ranked":{"300":{}}}']) {
      const r = evaluate({ dashboardHtml: board, tasksMd: appended, rankRecordJson })
      expect(r.block).toBe(true)
      expect(r.reason).toMatch(/QUEUE RANK BASELINE MISSING/)
      expect(r.reason).toMatch(/queue-rank\.mjs --seed/)
    }
    expect(unrankedAppendProblem(appended, ranks([210, 211, 300], {}))).toBe('')
  })

  it('does not accept a decision that states no reason', () => {
    const r = evaluate({
      dashboardHtml: board,
      tasksMd: appended,
      rankRecordJson: ranks([210, 211], { 300: {} }),
    })
    expect(r.block).toBe(true)
    expect(r.reason).toMatch(/NOT RANKED[^|]*300/)
  })

  it('is total on malformed input, like every rule beside it', () => {
    expect(unrankedAppendProblem(null, null)).toMatch(/BASELINE MISSING/)
    expect(unrankedAppendProblem(42, null)).toMatch(/BASELINE MISSING/)
    // Anything that is not the file's own bytes reads as TORN, which is quiet.
    expect(unrankedAppendProblem('- [ ] 1. A.', {})).toBe('')
    expect(unrankedAppendProblem('- [ ] 1. A.', ranks([1]))).toBe('')
  })
})
