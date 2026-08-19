// Decision-logic sweep of the dashboard Stop-hook guard (dashboard-guard-core):
// every invariant blocks on its violation, the fully consistent state allows,
// and partial/malformed inputs never throw (the wrapper's fail-open depends on
// the core being total). The regression scenario that motivated the hardening —
// the now-card still naming point 200 while the work had pivoted to 210 — is
// pinned explicitly.
import { describe, it, expect } from 'vitest'
import {
  FOCUS_FRESH_MS,
  SECTION_TITLES,
  parseTasks,
  parseNowCardPoint,
  parseNowCardPoints,
  parseQueuePoints,
  parseKlaerungPoints,
  nowCardText,
  looksDoubleEncoded,
  findTransliterations,
  sliceSections,
  parseCards,
  footerOpenCount,
  auditDashboard,
  evaluate,
  ERLEDIGT_ON_BOARD,
  ETA_GRACE_MIN,
  ETA_MARGIN_MIN,
  ETA_REVISION_LIMIT,
  ETA_RULE,
  etaMinutes,
  etaRevisionPatch,
  etaStatus,
  QUEUE_STUB_BODY,
  QUEUE_GATED_META,
  QUEUE_STUB_META,
} from './dashboard-guard-core.mjs'

import { boardHtml, green } from './dashboard-guard-fixtures.mjs'
import { renderQueueCard } from './board-queue-core.mjs'


describe('parseTasks', () => {
  const text = [
    '- [ ] 210. Fix the coast',
    '- [ ] 205. Audit DEFERRED until the tag',
    '- [ ] 203. Finder AWAITING-USER(2026-07-22)',
    '- [x] 209. Smoothed',
    'not a checkbox line',
  ].join('\n')
  it('collects open and done points, skipping DEFERRED but keeping AWAITING-USER', () => {
    expect(parseTasks(text)).toEqual({ open: [210, 203], done: [209] })
  })
  it('is total on non-string input', () => {
    expect(parseTasks(null)).toEqual({ open: [], done: [] })
  })
})

describe('parseNowCardPoint', () => {
  it('reads the now-card title point', () => {
    expect(parseNowCardPoint(boardHtml({ nowPoint: 210 }))).toBe(210)
  })
  it('ignores incidental point mentions in the status text', () => {
    // The body says "point-200" but the title says 210 — the title wins.
    expect(parseNowCardPoint(boardHtml({ nowPoint: 210 }))).not.toBe(200)
  })
  it('is null for a non-point title, a missing section, and non-string input', () => {
    expect(parseNowCardPoint(boardHtml({ nowPoint: null, nowTitle: 'Closing-Zyklus' }))).toBeNull()
    expect(parseNowCardPoint('<h2>Warteschlange</h2>')).toBeNull()
    expect(parseNowCardPoint(undefined)).toBeNull()
  })
  it('does not run past the now-card into a numbered VDZK card (non-numeric title)', () => {
    // Regression 22.07.2026: a cross-cutting/closing now-card (no leading number)
    // let the scan reach the "Von dir zu klären" 206 card and read 206 as the
    // now-card point. The search must stop at the now-card section boundary.
    const html = boardHtml({ nowPoint: null, nowTitle: 'Automatik absichern', klaerung: [206] })
    expect(parseNowCardPoint(html)).toBeNull()
  })
  it('reads the FIRST of several parallel now-cards (back-compat view)', () => {
    expect(parseNowCardPoint(boardHtml({ nowCards: [226, 211] }))).toBe(226)
  })
})

describe('parseNowCardPoints', () => {
  it('collects ALL numeric now-card title points (parallel work)', () => {
    const set = parseNowCardPoints(boardHtml({ nowCards: [226, 211] }))
    expect([...set].sort()).toEqual([211, 226])
  })
  it('lets non-numeric now-cards contribute nothing beside numeric siblings', () => {
    const set = parseNowCardPoints(boardHtml({ nowCards: [226, 'Closing-Zyklus'] }))
    expect([...set]).toEqual([226])
  })
  it('stays section-bounded: numbered VDZK/queue cards never leak in', () => {
    const html = boardHtml({ nowCards: ['Automatik absichern'], klaerung: [206], queue: [211, 204] })
    expect(parseNowCardPoints(html).size).toBe(0)
  })
  // Point 655: the now-card carries its number in the same numbered chip the
  // queue cards use, and its title names the subject. Both shapes are read, so
  // a board written before the chip existed keeps being understood.
  it('reads the point from the numbered CHIP of a now-card', () => {
    const chip =
      '<details class="now"><summary><span class="num">655</span>' +
      '<span class="t">Jede Karte nennt ihren Punkt</span>' +
      '<span class="right"><span class="meta">09:00</span></span></summary>' +
      '<div class="body"><p>Kurzstand.</p></div></details>'
    const html = boardHtml({ nowCards: [226] }).replace('<h2>Woran ich gerade arbeite</h2></summary>', `<h2>Woran ich gerade arbeite</h2></summary>\n${chip}`)
    expect([...parseNowCardPoints(html)].sort((a, b) => a - b)).toEqual([226, 655])
  })
  it('is empty on a missing section and non-string input', () => {
    expect(parseNowCardPoints('<h2>Warteschlange</h2>').size).toBe(0)
    expect(parseNowCardPoints(null).size).toBe(0)
    expect(parseNowCardPoints(undefined).size).toBe(0)
  })
  it('lets the focus name ANY standing card, not only the first (point 713)', () => {
    // Measured 17.08.2026: `board.mjs now` prepends and the focus tooling read
    // the FIRST card, so opening strand 697 silently moved the focus off 700.
    // focus.mjs set/confirm match membership in this SET, so the section's
    // order carries no focus meaning — the render decides it (focused first).
    const set = parseNowCardPoints(boardHtml({ nowCards: [697, 700] }))
    expect(set.has(700)).toBe(true)
    expect(set.has(697)).toBe(true)
  })
})

describe('parseQueuePoints', () => {
  it('collects only Warteschlange numbers, not the Erledigt .num spans', () => {
    const set = parseQueuePoints(boardHtml({ queue: [211, 204], done: [209] }))
    expect([...set].sort()).toEqual([204, 211])
    expect(set.has(209)).toBe(false)
  })
  it('is empty on missing section / non-string input', () => {
    expect(parseQueuePoints('<p>no board</p>').size).toBe(0)
    expect(parseQueuePoints(null).size).toBe(0)
  })
})

describe('parseKlaerungPoints', () => {
  it('reads leading-number VDZK cards and ignores a no-number card', () => {
    const html = boardHtml({
      klaerung: [206, 210],
      klaerungExtra: ['📱 ntfy-Topic abonnieren — dann bekommst du Ausfall-Pushes'],
    })
    expect([...parseKlaerungPoints(html)].sort()).toEqual([206, 210])
  })
  it('does not pick up now-card, queue, or Erledigt titles', () => {
    // No VDZK cards at all — nothing from the surrounding sections leaks in.
    expect(parseKlaerungPoints(boardHtml()).size).toBe(0)
  })
  it('is empty on missing section / non-string input', () => {
    expect(parseKlaerungPoints('<h2>Warteschlange</h2>').size).toBe(0)
    expect(parseKlaerungPoints(null).size).toBe(0)
    expect(parseKlaerungPoints(undefined).size).toBe(0)
  })
})

describe('evaluate — silent allows', () => {
  it('allows when the batch is paused, whatever else is stale', () => {
    expect(evaluate(green({ paused: true, head: 'moved', focus: null })).decision).toBe('allow')
  })
  it('allows when no open points remain (batch complete)', () => {
    expect(evaluate(green({ open: [] })).decision).toBe('allow')
  })
})

describe('evaluate — registration and freshness (pre-existing invariants)', () => {
  it('blocks when no dashboard is registered', () => {
    const r = evaluate(green({ marker: null }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/NOT REGISTERED/)
  })
  it('blocks when the registered file is gone', () => {
    const r = evaluate(green({ markerFileExists: false }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/NOT REGISTERED/)
  })
  it('blocks when HEAD moved since the last review', () => {
    const r = evaluate(green({ head: 'def5678' }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/OUT OF DATE/)
  })
  it('blocks a ticked point still sitting in the Warteschlange', () => {
    const r = evaluate(green({ html: boardHtml({ queue: [211, 204, 209] }) }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/STALE.*209/)
  })
  it('blocks an open point missing from queue and now-card', () => {
    const r = evaluate(green({ open: [210, 211, 204, 184] }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/INCOMPLETE.*184/)
  })
  it('blocks a point double-listed in the now-card AND the Warteschlange', () => {
    // 214 regression: the now-card point also had a queue card (reads as
    // in-progress and pending at once).
    const html = boardHtml({ nowPoint: 210, queue: [210, 211, 204] })
    const r = evaluate(green({ html }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/DOUBLE-LISTS.*210/)
  })
  it('allows the now-card point when it is NOT also in the queue', () => {
    const r = evaluate(green({ html: boardHtml({ nowPoint: 210, queue: [211, 204] }) }))
    expect(r.decision).toBe('allow')
  })
})

describe('evaluate — multiple parallel now-cards (feature-branch workflow)', () => {
  // One card PER point in active work (user decision 22.07.2026): 226 and 211
  // are both being worked in parallel worktrees, 204 waits in the queue.
  const multi = (overrides = {}) =>
    green({
      open: [226, 211, 204],
      html: boardHtml({ nowCards: [226, 211], queue: [204] }),
      focus: { point: 226, note: 'guard multi-now', setAt: 1000, confirmedAt: 1000 },
      ...overrides,
    })

  it('completeness (4) counts EVERY now-card: both parallel points are covered', () => {
    expect(evaluate(multi()).decision).toBe('allow')
  })
  it('blocks (4) when a point is in no now-card, queue, or VDZK section', () => {
    const r = evaluate(multi({ open: [226, 211, 204, 184] }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/INCOMPLETE.*184/)
  })
  it('blocks (4b) when ANY now-card point also has a queue card', () => {
    const r = evaluate(multi({ html: boardHtml({ nowCards: [226, 211], queue: [211, 204] }) }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/DOUBLE-LISTS.*211/)
  })
  it('allows the focus on the FIRST now-card', () => {
    expect(evaluate(multi()).decision).toBe('allow')
  })
  it('allows the focus on a LATER now-card (among the set, not necessarily first)', () => {
    const r = evaluate(multi({ focus: { point: 211, note: 'parallel branch', setAt: 1000, confirmedAt: 1000 } }))
    expect(r.decision).toBe('allow')
  })
  it('blocks (6) a focus point that is in NO now-card', () => {
    const r = evaluate(multi({ focus: { point: 204, note: 'queued, not now', setAt: 1000, confirmedAt: 1000 } }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/NOW-CARD OUT OF SYNC/)
    expect(r.reason).toMatch(/204/)
  })
  it('blocks (4c) a VDZK point that equals ANY now-card point', () => {
    const r = evaluate(multi({ html: boardHtml({ nowCards: [226, 211], queue: [204], klaerung: [211] }) }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/VON DIR ZU KLÄREN.*211.*now-card/)
  })
})

describe('evaluate — one section per point ("Von dir zu klären" overlaps)', () => {
  it('blocks a point in BOTH the Warteschlange and "Von dir zu klären" (the 206 case)', () => {
    const r = evaluate(
      green({ open: [210, 211, 204, 206], html: boardHtml({ queue: [211, 204, 206], klaerung: [206] }) }),
    )
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/VON DIR ZU KLÄREN.*206.*Warteschlange/)
  })
  it('blocks when a VDZK point is the now-card focus (user answered, work resumed)', () => {
    // The twice-reported failure: the question was answered, the point became
    // the current work, but its VDZK card lingered.
    const r = evaluate(green({ html: boardHtml({ nowPoint: 210, klaerung: [210] }) }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/VON DIR ZU KLÄREN.*210.*now-card/)
  })
  it('blocks when a VDZK point is ticked done', () => {
    const r = evaluate(green({ html: boardHtml({ klaerung: [209] }) }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/VON DIR ZU KLÄREN.*209.*done/)
  })
  it('allows a point that lives ONLY under "Von dir zu klären" (blocked on the user)', () => {
    // Not queued, not the focus, not done — the one legitimate home for a
    // user-blocked point; completeness (4) counts the VDZK card as visible.
    const r = evaluate(
      green({ open: [210, 211, 204, 206], html: boardHtml({ queue: [211, 204], klaerung: [206] }) }),
    )
    expect(r.decision).toBe('allow')
  })
  it('ignores no-number VDZK cards (never point-tied)', () => {
    const r = evaluate(green({ html: boardHtml({ klaerungExtra: ['ntfy-Topic abonnieren'] }) }))
    expect(r.decision).toBe('allow')
  })
})

describe('evaluate — focus declaration and the now-card match', () => {
  it('blocks when no focus is declared', () => {
    const r = evaluate(green({ focus: null }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/FOCUS NOT DECLARED/)
  })
  it('blocks the 200-vs-210 regression: card says 200, real focus is 210', () => {
    // Board still titled 200 (and 210 waiting in the queue), work pivoted to 210.
    const html = boardHtml({ nowPoint: 200, queue: [210, 211, 204] })
    const r = evaluate(
      green({ html, open: [200, 210, 211, 204], focus: { point: 210, note: 'sea edge', confirmedAt: 1000 } }),
    )
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/NOW-CARD OUT OF SYNC/)
    expect(r.reason).toMatch(/210/)
  })
  it('blocks when the now-card has no parseable point but the focus names one', () => {
    // 210 sits in the queue so the completeness check passes; the mismatch is the finding.
    const html = boardHtml({ nowPoint: null, nowTitle: 'Aufräumen', queue: [210, 211, 204] })
    const r = evaluate(green({ html }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/NOW-CARD OUT OF SYNC/)
  })
  it('skips the number equality for declared non-point work', () => {
    const r = evaluate(green({ focus: { point: null, note: 'closing cycle', confirmedAt: 1000 } }))
    expect(r.decision).toBe('allow')
  })
  it('allows when card and focus agree', () => {
    expect(evaluate(green()).decision).toBe('allow')
  })
})

describe('evaluate — pivot reconcile after a user prompt', () => {
  it('blocks while this session has an unacknowledged pivot check', () => {
    const r = evaluate(green({ pending: { sessionId: 'sess-a', at: 1500 } }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/RECONCILE REQUIRED/)
  })
  it('binds when the marker or the hook input has no session id (err toward enforcement)', () => {
    expect(evaluate(green({ pending: { at: 1500 } })).decision).toBe('block')
    expect(evaluate(green({ pending: { sessionId: 'sess-a', at: 1500 }, sessionId: '' })).decision).toBe('block')
  })
  it('does not drag a parallel session into another session\'s pivot check', () => {
    const r = evaluate(green({ pending: { sessionId: 'sess-b', at: 1500 } }))
    expect(r.decision).toBe('allow')
  })
  it('allows after the check was cleared (focus confirm/set removed the marker)', () => {
    expect(evaluate(green({ pending: null })).decision).toBe('allow')
  })
})

describe('evaluate — focus freshness during long work', () => {
  const confirmedAt = 1_000_000
  it('blocks after a long working stretch with no re-affirmation', () => {
    const r = evaluate(
      green({
        focus: { point: 210, note: 'x', confirmedAt },
        lastToolAt: confirmedAt + 5000,
        now: confirmedAt + FOCUS_FRESH_MS + 60_000,
      }),
    )
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/RE-AFFIRMATION REQUIRED/)
  })
  it('does not nag an idle stretch (no tool work since the confirmation)', () => {
    const r = evaluate(
      green({
        focus: { point: 210, note: 'x', confirmedAt },
        lastToolAt: confirmedAt - 5000,
        now: confirmedAt + FOCUS_FRESH_MS + 60_000,
      }),
    )
    expect(r.decision).toBe('allow')
  })
  it('allows while the confirmation is fresh', () => {
    const r = evaluate(
      green({
        focus: { point: 210, note: 'x', confirmedAt },
        lastToolAt: confirmedAt + 5000,
        now: confirmedAt + FOCUS_FRESH_MS - 60_000,
      }),
    )
    expect(r.decision).toBe('allow')
  })
  it('honors a calibrated freshMs override', () => {
    const r = evaluate(
      green({
        focus: { point: 210, note: 'x', confirmedAt },
        lastToolAt: confirmedAt + 5000,
        now: confirmedAt + 10 * 60_000,
        freshMs: 5 * 60_000,
      }),
    )
    expect(r.decision).toBe('block')
  })
})

describe('evaluate — publish parity (edited must not masquerade as live)', () => {
  it('blocks when the repo file differs from the last published content', () => {
    const r = evaluate(green({ repoHash: 'hash-2' }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/NOT REPUBLISHED/)
  })
  it('blocks when no publish was ever recorded', () => {
    const r = evaluate(green({ marker: { dashboardPath: '.batch-dashboard.html', head: 'abc1234' } }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/no publish recorded/)
  })
  it('allows when repo and published hashes match', () => {
    expect(evaluate(green()).decision).toBe('allow')
  })
  it('accepts the PAGES publish as a publish — it is the one a headless session can run', () => {
    const marker = { dashboardPath: '.batch-dashboard.html', head: 'abc1234', pagesPublishedHash: 'hash-1' }
    expect(evaluate(green({ marker })).decision).toBe('allow')
    // …but only for exactly those bytes: an older pages push covers nothing.
    expect(evaluate(green({ marker: { ...marker, pagesPublishedHash: 'hash-0' } })).decision).toBe('block')
  })
  it('honors an explicit deferral for the CURRENT content only', () => {
    const marker = {
      dashboardPath: '.batch-dashboard.html',
      head: 'abc1234',
      publishDeferred: { at: 1, reason: 'headless', repoHash: 'hash-3' },
    }
    expect(evaluate(green({ marker, repoHash: 'hash-3' })).decision).toBe('allow')
    // A further edit after the deferral re-blocks.
    expect(evaluate(green({ marker, repoHash: 'hash-4' })).decision).toBe('block')
  })
  it('fails open when the repo hash could not be computed', () => {
    expect(evaluate(green({ repoHash: null, marker: { dashboardPath: 'x.html', head: 'abc1234' } })).decision).toBe(
      'allow',
    )
  })
})

// ═══ Point 313: the full-consistency audit ═══════════════════════════════════
// Every check is pinned with its REAL 25.07.2026 witness (the gaps the morning
// audit had to find by hand) plus the legitimate-board pass case, so a future
// tightening cannot silently re-open one of them.

/** Re-create the 24.07 damage: UTF-8 bytes displayed through cp1252. Built
 *  programmatically so this file itself stays clean UTF-8 (pasting literal
 *  mojibake would corrupt the test source and hide the bug it pins). */
function mojibake(text) {
  const high = {
    0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020,
    0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152,
    0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
    0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
    0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
  }
  return Array.from(Buffer.from(text, 'utf8'))
    .map((b) => String.fromCharCode(high[b] ?? b))
    .join('')
}

describe('looksDoubleEncoded (mojibake detector)', () => {
  it('flags the 24.07 damage class: umlauts, dashes, quotes, symbols, a mis-decoded BOM', () => {
    for (const src of ['überall', '— Strich', '„deutsch"', '−5', 'π', '﻿<title>', '·', '≈', '↔', '⅓']) {
      expect(looksDoubleEncoded(mojibake(src)).length, src).toBeGreaterThan(0)
    }
  })
  it('passes legitimate content — German text, the CSS arrows, punctuation, emoji, a real BOM', () => {
    for (const good of [
      'Für Höhen, Straßen und Bäume',
      'content:"▸" content:"▾"',
      '„Zitat" — Gedankenstrich · Punkt … →',
      '✓ ✔ 📱 🤖 ± ° § ⅓ π − ≈',
      '﻿<title>Board</title>',
      'Meroë, Aksum, Café',
    ]) {
      expect(looksDoubleEncoded(good), good).toEqual([])
    }
  })
  it('is total on non-string input', () => {
    expect(looksDoubleEncoded(null)).toEqual([])
    expect(looksDoubleEncoded(undefined)).toEqual([])
  })
})

describe('sliceSections / parseCards', () => {
  it('slices exactly the four sections in document order, the last running to EOF', () => {
    const { order, sections } = sliceSections(boardHtml() + '<footer>Stand</footer>')
    expect(order).toEqual(SECTION_TITLES)
    expect(sections['Erledigt']).toMatch(/<footer>/)
  })
  it('anchors on <h2>, so the words inside a card body steal no section', () => {
    const html = boardHtml({ nowCards: ['Audit der Warteschlange und der Erledigt-Liste'] })
    expect(sliceSections(html).order).toEqual(SECTION_TITLES)
  })
  it('reads point numbers from .num, from a leading .t number, and from compound titles', () => {
    const html =
      '<details><summary><span class="num">262</span><span class="t">A</span></summary><div class="body">x</div></details>' +
      '<details><summary><span class="t">287+288 — B</span></summary><div class="body">x</div></details>' +
      '<details><summary><span class="t">232·233·234 — C</span></summary><div class="body">x</div></details>' +
      '<details><summary><span class="t">313: D</span></summary><div class="body">x</div></details>'
    expect(parseCards(html).flatMap((c) => c.points)).toEqual([262, 287, 288, 232, 233, 234, 313])
  })
  it('does NOT read a sub-delivery .num like "203A" as a point number', () => {
    const html = '<details><summary><span class="num">203A</span><span class="t">Teil</span></summary><div class="body">x</div></details>'
    expect(parseCards(html)[0].points).toEqual([])
  })
  it('splits a COMPOUND .num the real board writes ("232·233·234", "92+94", "71/72")', () => {
    const card = (num) => `<details><summary><span class="num">${num}</span><span class="t">X</span></summary><div class="body">x</div></details>`
    expect(parseCards(card('232·233·234'))[0].points).toEqual([232, 233, 234])
    expect(parseCards(card('92+94'))[0].points).toEqual([92, 94])
    expect(parseCards(card('71/72'))[0].points).toEqual([71, 72])
  })
  it('reads no phantom point from a date, a count or a year in a title', () => {
    const card = (t) => `<details><summary><span class="t">${t}</span></summary><div class="body">x</div></details>`
    expect(parseCards(card('2026-07-25 — Rückblick'))[0].points).toEqual([])
    expect(parseCards(card('5-Minuten-Check — X'))[0].points).toEqual([])
    expect(parseCards(card('1890 — Kartenstand'))[0].points).toEqual([])
    expect(parseCards(card('1890er Namen für Landmarken'))[0].points).toEqual([])
  })
  it('reads a body that starts with a container child (no false empty-body)', () => {
    const html =
      '<details><summary><span class="t">X</span></summary>' +
      '<div class="body"><div class="pills"><span>x</span></div><p>Echter Text.</p></div></details>'
    expect(parseCards(html)[0].body).toMatch(/Echter Text/)
  })
  it('is total on non-string input', () => {
    expect(parseCards(null)).toEqual([])
    expect(sliceSections(null).order).toEqual([])
  })
})

describe('auditDashboard — the 25.07 witnesses', () => {
  const base = { open: [210, 211, 204], done: [209], doneSeen: [209] }
  const codes = (html, o = {}) => auditDashboard(html, { ...base, ...o }).map((v) => v.code)

  it('passes the consistent board', () => {
    expect(auditDashboard(boardHtml(), base)).toEqual([])
  })

  it('WITNESS 262: a newly ticked point with no Erledigt card blocks', () => {
    // 262 ticked, baseline only knows 209, and no Erledigt card carries it.
    expect(codes(boardHtml(), { done: [209, 262] })).toContain('erledigt-missing')
    // …and passes once its card exists.
    expect(codes(boardHtml({ done: [209, 262] }), { done: [209, 262] })).not.toContain('erledigt-missing')
  })
  it('grandfathers pre-guard history: no baseline yet → no new-tick complaints', () => {
    expect(codes(boardHtml(), { done: [209, 262, 273, 293, 305], doneSeen: null })).not.toContain('erledigt-missing')
  })
  it('an Erledigt card for a newly ticked point must carry a time meta', () => {
    const html = boardHtml().replace('<span class="meta">09:00 – 10:00</span>', '<span class="meta">fertig</span>')
    expect(codes(html, { done: [209], doneSeen: [] })).toContain('erledigt-meta')
  })
  it('…but a HISTORICAL card without a time meta passes (the live board has many)', () => {
    const html = boardHtml().replace('<span class="meta">09:00 – 10:00</span>', '<span class="meta">bis 13:28</span>')
    expect(codes(html.replace('<span class="meta">bis 13:28</span>', ''), { done: [209], doneSeen: [209] })).not.toContain(
      'erledigt-meta',
    )
  })

  it('WITNESS 306: an OPEN point with an Erledigt card blocks', () => {
    expect(codes(boardHtml({ done: [209, 306] }), { open: [210, 211, 204, 306] })).toContain('open-in-erledigt')
  })

  it('WITNESS 224: a queue card whose meta is no duration blocks', () => {
    const html = boardHtml().replace('<span class="meta">~2 h</span>', '<span class="meta">23:11 · regression-failed</span>')
    expect(codes(html)).toContain('queue-meta')
  })
  it('accepts a duration with extra tokens and a decimal', () => {
    for (const meta of ['~4 h · Feature', '~1,5 h', '~1 h · nach 292/311']) {
      expect(codes(boardHtml().replace('<span class="meta">~2 h</span>', `<span class="meta">${meta}</span>`))).not.toContain(
        'queue-meta',
      )
    }
  })

  it('accepts the WAITING-ON-THE-USER meta by name, with or without its date (point 450)', () => {
    for (const meta of [QUEUE_GATED_META, `${QUEUE_GATED_META} (seit 29.07.)`]) {
      expect(codes(boardHtml().replace('<span class="meta">~2 h</span>', `<span class="meta">${meta}</span>`))).not.toContain(
        'queue-meta',
      )
    }
    // …and a meta that merely mentions the user is still no duration.
    expect(codes(boardHtml().replace('<span class="meta">~2 h</span>', '<span class="meta">irgendwas mit dir</span>'))).toContain(
      'queue-meta',
    )
  })

  it('WITNESS mojibake: a double-encoded board blocks', () => {
    expect(codes(boardHtml({ nowTitle: mojibake('Meereskante glätten') }))).toContain('mojibake')
  })

  it('WITNESS auto-open: a hardcoded `open` attribute blocks (user mandate 23.07.2026)', () => {
    expect(codes(boardHtml().replace('<details class="now">', '<details class="now" open>'))).toContain('auto-open')
  })

  it('WITNESS duplicate: the same point on two cards of ONE open section blocks', () => {
    expect(codes(boardHtml({ queue: [211, 211, 204] }))).toContain('dup-in-section')
  })
  it('but Erledigt may hold several delivery cards for one point (the real point-206 case)', () => {
    expect(codes(boardHtml({ done: [206, 206, 209] }))).not.toContain('dup-in-section')
  })

  it('requires the Erledigt heading to stay wrapped in its collapsible section', () => {
    // The board as published: wrapped, no `open` → clean.
    expect(codes(boardHtml())).not.toContain('section-not-collapsible')
    // A republish that unwrapped it (plain heading again) blocks.
    const unwrapped = boardHtml()
      .replace('<details class="sect">\n<summary><h2>Erledigt</h2></summary>', '<h2>Erledigt</h2>')
      .replace(/<\/details>\n<\/main>/, '</main>')
    expect(codes(unwrapped)).toContain('section-not-collapsible')
    // And it must still start CLOSED — the standing no-auto-open mandate covers
    // the wrapper like any card.
    expect(codes(boardHtml().replace('<details class="sect">', '<details class="sect" open>'))).toContain('auto-open')
  })
  it('never counts the section wrapper as a card of the preceding section', () => {
    // The wrapper's opening tag falls just before the <h2> the slice ends at,
    // so a naive split would hand Warteschlange a point-less, body-less card.
    const html = boardHtml()
    expect(codes(html)).not.toContain('queue-meta')
    expect(codes(html)).not.toContain('empty-body')
    expect(parseCards(sliceSections(html).sections['Warteschlange']).length).toBe(2) // 211, 204 — not the wrapper
  })

  it('flags a missing section, a wrong order and an empty card body', () => {
    expect(codes(boardHtml().replace('<h2>Erledigt</h2>', ''))).toContain('structure')
    expect(codes(boardHtml().replace('<div class="body"><p>Kurzstand.</p></div>', '<div class="body"></div>'))).toContain(
      'empty-body',
    )
  })
  // POINT 472 — the empty-body rule has NO exemption left. The bundle-group card
  // of point 452 was the only card that ever bought one (its body held nothing
  // but nested cards); with the grouping taken back out, an exemption would be a
  // hole in a guard with nothing left to justify it.
  it('flags an empty body in EVERY section, and a class="group" buys no exemption', () => {
    const empty = '<div class="body"></div>'
    const card = (cls, inner) =>
      `<details${cls}><summary><span class="num">777</span><span class="t">Task 777</span>` +
      `<span class="right"><span class="meta">~2 h</span></span></summary>${inner}</details>`
    // One per section: the queue, "Von dir zu klären", the now-section, Erledigt.
    const withQueue = boardHtml().replace('<h2>Warteschlange</h2></summary>', `<h2>Warteschlange</h2></summary>\n${card('', empty)}`)
    expect(codes(withQueue, { open: [210, 211, 204, 777] })).toContain('empty-body')
    const withKlaerung = boardHtml().replace(
      '<h2>Von dir zu klären</h2></summary>',
      `<h2>Von dir zu klären</h2></summary>\n<details><summary><span class="t">Eine Frage</span></summary>${empty}</details>`,
    )
    expect(codes(withKlaerung)).toContain('empty-body')
    expect(
      codes(boardHtml().replace(/<div class="body"><p>Status[^<]*<\/p><\/div>/, empty)),
    ).toContain('empty-body')
    // Erledigt takes TWO cards: the LAST card of that section absorbs the
    // trailing archive link into its body slice, so only a card with a sibling
    // behind it can be empty at all.
    const withDone = boardHtml({ done: [209, 208] }).replace(
      /(Done 209<\/span>[\s\S]*?<\/summary>)<div class="body"><p>Kurzstand\.<\/p><\/div>/,
      `$1${empty}`,
    )
    expect(withDone).toContain(`</summary>${empty}`)
    expect(codes(withDone, { done: [209, 208], doneSeen: [209, 208] })).toContain('empty-body')
    // THE EXEMPTION IS GONE: the very markup that used to be waved through blocks.
    const grouped = boardHtml().replace(
      '<h2>Warteschlange</h2></summary>',
      `<h2>Warteschlange</h2></summary>\n${card(' class="group" data-group="Chat & Tafel"', empty)}`,
    )
    expect(codes(grouped, { open: [210, 211, 204, 777] })).toContain('empty-body')
    // …and parseCards no longer even reports such a flag for anyone to read.
    expect(parseCards(card(' class="group"', empty))[0]).not.toHaveProperty('isGroup')
  })
  it('flags a now-card without a time meta and a stale footer count', () => {
    expect(codes(boardHtml().replace('<span class="meta">09:00 · bis ~11:00</span>', '<span class="meta">läuft</span>'))).toContain(
      'now-meta',
    )
    expect(codes(boardHtml() + '<footer>15 offene Punkte</footer>')).toContain('footer-stale')
    expect(codes(boardHtml() + '<footer>3 offene Punkte</footer>')).not.toContain('footer-stale')
  })
  it('is total on missing/malformed input', () => {
    expect(auditDashboard(null, base)).toEqual([])
    expect(() => auditDashboard(boardHtml(), { open: 'x', done: null, doneSeen: 'nope' })).not.toThrow()
  })
})

// THE FOOTER CHECK BINDS TO THE FOOTER (measured 07.08.2026).
// It used to search the WHOLE document for the first "NN offene Punkte", so a
// queue card whose prose legitimately said "29 offene Punkte" made it report
// "the footer claims 29 open points, TASKS.md has 114" while the real footer
// read the correct 114 — and it refused the attest until the card was reworded,
// enforcing a rule nothing states. Both directions are pinned here: card prose
// never triggers it, a genuinely stale footer still does.
describe('footer currency reads the footer element, not a card', () => {
  const base = { open: [210, 211, 204], done: [209], doneSeen: [209] }
  const codes = (html, o = {}) => auditDashboard(html, { ...base, ...o }).map((v) => v.code)
  const stale = (html, o = {}) => auditDashboard(html, { ...base, ...o }).find((v) => v.code === 'footer-stale')
  const footer = (text) => `<footer>${text}</footer>`
  /** The 07.08 shape: a QUEUE card whose prose names an open-point count. */
  const cardSaying = (text) => boardHtml().replace('<p>Kurzstand.</p>', `<p>${text}</p>`)

  describe('footerOpenCount', () => {
    it('reads the figure out of the footer, in both German forms', () => {
      expect(footerOpenCount(footer('Stand: 07.08.2026, 09:12 (Europe/Berlin) · 114 offene Punkte · lädt neu.'))).toBe(114)
      expect(footerOpenCount(footer('Stand: 07.08.2026 · 1 offener Punkt · lädt neu.'))).toBe(1)
      expect(footerOpenCount(footer('Stand: 07.08.2026 · 7 offenen Punkten'))).toBe(7)
    })
    it('reads through markup inside the footer and through its attributes', () => {
      expect(footerOpenCount('<footer class="foot" id="f"><span class="n">42</span> offene Punkte</footer>')).toBe(42)
    })
    it('is null where nothing states a count: no footer, a countless footer, non-strings', () => {
      expect(footerOpenCount(boardHtml())).toBe(null)
      expect(footerOpenCount(footer('Stand: 07.08.2026 · lädt sich alle 30 s selbst neu.'))).toBe(null)
      expect(footerOpenCount(null)).toBe(null)
      expect(footerOpenCount(undefined)).toBe(null)
      expect(footerOpenCount(123)).toBe(null)
    })
    it('never reads a count out of a card, a heading or a script', () => {
      expect(footerOpenCount(cardSaying('Damals waren es 29 offene Punkte.'))).toBe(null)
      expect(footerOpenCount('<h2>29 offene Punkte</h2><script>const t = "8 offene Punkte"</script>')).toBe(null)
      expect(footerOpenCount(cardSaying('29 offene Punkte') + footer('3 offene Punkte'))).toBe(3)
    })
  })

  it('passes a card that names a DIFFERENT count while the footer agrees with the work order', () => {
    const html = cardSaying('Der Rückstand betrug 29 offene Punkte.') + footer('Stand: 07.08.2026 · 3 offene Punkte')
    expect(codes(html)).not.toContain('footer-stale')
    expect(auditDashboard(html, base)).toEqual([])
  })

  it('blocks a genuinely stale footer and names BOTH numbers', () => {
    const v = stale(boardHtml() + footer('Stand: 07.08.2026 · 15 offene Punkte'))
    expect(v).toBeTruthy()
    expect(v.msg).toMatch(/claims 15 open points/)
    expect(v.msg).toMatch(/TASKS\.md has 3/)
    // …and the remedy names the publish that derives the figure.
    expect(v.msg).toContain('node scripts/board-publish.mjs')
  })

  it('still blocks the stale footer when a card happens to state the RIGHT count', () => {
    expect(codes(cardSaying('3 offene Punkte offen.') + footer('15 offene Punkte'))).toContain('footer-stale')
  })

  it('fails OPEN on a document with no footer — even one whose card names a count', () => {
    expect(codes(boardHtml())).not.toContain('footer-stale')
    expect(codes(cardSaying('29 offene Punkte'))).not.toContain('footer-stale')
    expect(codes(cardSaying('29 offene Punkte'), { open: [1] })).not.toContain('footer-stale')
  })

  it('fails OPEN on a footer that states no count at all', () => {
    expect(codes(boardHtml() + footer('Stand: 07.08.2026 · lädt sich alle 30 s selbst neu.'))).not.toContain('footer-stale')
  })

  it('holds for the singular the publish writes', () => {
    expect(codes(boardHtml() + footer('Stand: 07.08.2026 · 1 offener Punkt'), { open: [210] })).not.toContain('footer-stale')
    expect(stale(boardHtml() + footer('Stand: 07.08.2026 · 1 offener Punkt')).msg).toMatch(/claims 1 open points/)
  })

  it('says nothing while the work order lists no open point, and never throws', () => {
    expect(codes(boardHtml() + footer('15 offene Punkte'), { open: [] })).not.toContain('footer-stale')
    expect(() => auditDashboard(boardHtml() + footer('15 offene Punkte'), { open: null })).not.toThrow()
  })
})

describe('evaluate — invariant 8c: the now-card TEXT must actually be rewritten', () => {
  // User mandate 25.07.2026 ("the dashboard is completely out of date — always
  // write what you are doing RIGHT NOW"): confirming the focus used to satisfy
  // every check while the card body stayed byte-identical for hours.
  const withMarker = (extra) => ({
    dashboardPath: '.batch-dashboard.html',
    head: 'abc1234',
    publishedHash: 'hash-1',
    ...extra,
  })

  it('blocks when work happened and the body is byte-identical to the reviewed one', () => {
    const r = evaluate(
      green({
        marker: withMarker({ nowCardHash: 'same', syncedAt: 0 }),
        nowCardHash: 'same',
        lastToolAt: 1000,
        now: FOCUS_FRESH_MS + 5000,
        focus: { point: 210, note: 'x', setAt: 1000, confirmedAt: FOCUS_FRESH_MS + 4000 },
      }),
    )
    expect(r).toMatchObject({ decision: 'block' })
    expect(r.reason).toMatch(/NOW-CARD TEXT UNCHANGED/)
    expect(r.reason).toMatch(/SHORT and HIGH-LEVEL/)
  })
  it('allows once the body really changed', () => {
    expect(
      evaluate(
        green({
          marker: withMarker({ nowCardHash: 'old', syncedAt: 0 }),
          nowCardHash: 'new',
          lastToolAt: 1000,
          now: FOCUS_FRESH_MS + 5000,
          focus: { point: 210, note: 'x', setAt: 1000, confirmedAt: FOCUS_FRESH_MS + 4000 },
        }),
      ).decision,
    ).toBe('allow')
  })
  it('never fires on a quiet stretch (no tool work since the review)', () => {
    expect(
      evaluate(
        green({
          marker: withMarker({ nowCardHash: 'same', syncedAt: 10_000 }),
          nowCardHash: 'same',
          lastToolAt: 500,
          now: FOCUS_FRESH_MS + 20_000,
          focus: { point: 210, note: 'x', setAt: 1000, confirmedAt: FOCUS_FRESH_MS + 19_000 },
        }),
      ).decision,
    ).toBe('allow')
  })
  it('never fires before the freshness window has elapsed', () => {
    expect(
      evaluate(
        green({
          marker: withMarker({ nowCardHash: 'same', syncedAt: 0 }),
          nowCardHash: 'same',
          lastToolAt: 1000,
          now: 2000,
        }),
      ).decision,
    ).toBe('allow')
  })
  it('is inert on a first review (no recorded hash yet)', () => {
    expect(
      evaluate(
        green({
          marker: withMarker({ syncedAt: 0 }),
          nowCardHash: 'whatever',
          lastToolAt: 1000,
          now: FOCUS_FRESH_MS + 5000,
          focus: { point: 210, note: 'x', setAt: 1000, confirmedAt: FOCUS_FRESH_MS + 4000 },
        }),
      ).decision,
    ).toBe('allow')
  })
})

describe('nowCardText', () => {
  it('extracts the now-card bodies, tag-free and whitespace-collapsed', () => {
    const t = nowCardText(boardHtml())
    expect(t).toMatch(/Status \(Stand 09:00\)/)
    expect(t).not.toMatch(/</)
  })
  it('reads only the now SECTION, not the queue or Erledigt bodies', () => {
    expect(nowCardText(boardHtml())).not.toMatch(/Kurzstand/)
  })
  it('is total on missing input', () => {
    expect(nowCardText(null)).toBe('')
    expect(nowCardText('<main>no sections</main>')).toBe('')
  })
})

describe('evaluate — invariant 8b wires the audit', () => {
  it('blocks on a violation, naming the code', () => {
    const html = boardHtml().replace('<span class="meta">~2 h</span>', '<span class="meta">später</span>')
    const r = evaluate(green({ html }))
    expect(r.decision).toBe('block')
    expect(r.reason).toMatch(/CONSISTENCY AUDIT FAILED/)
    expect(r.reason).toMatch(/queue-meta/)
  })
  it('caps the listed violations so a big miss cannot flood the message', () => {
    // Six violations at once (dup, queue-meta, empty body, now-meta, mojibake,
    // stale footer) — all inside the audit, none tripping an earlier invariant.
    const html =
      boardHtml({ queue: [211, 211, 204] })
        .replace('<span class="meta">~2 h</span>', '<span class="meta">x</span>')
        .replace('<div class="body"><p>Kurzstand.</p></div>', '<div class="body"></div>')
        .replace('<span class="meta">09:00 · bis ~11:00</span>', '<span class="meta">läuft</span>')
        .replace('<h2>Erledigt</h2>', `<h2>Erledigt</h2>\n<!-- ${mojibake('ü')} -->`) + '<footer>99 offene Punkte</footer>'
    const r = evaluate(green({ html }))
    expect(r.decision).toBe('block')
    expect(r.reason.match(/\[[a-z-]+\]/g).length).toBeLessThanOrEqual(5)
    expect(r.reason).toMatch(/and \d+ more/)
  })
  it('a waiver bound to the CURRENT file hash lets the turn end', () => {
    const html = boardHtml().replace('<span class="meta">~2 h</span>', '<span class="meta">später</span>')
    const marker = { dashboardPath: 'd.html', head: 'abc1234', publishedHash: 'hash-1', auditWaived: { repoHash: 'hash-1' } }
    expect(evaluate(green({ html, marker })).decision).toBe('allow')
  })
  it('…but the waiver dies with the next edit (a different hash re-arms it)', () => {
    const html = boardHtml().replace('<span class="meta">~2 h</span>', '<span class="meta">später</span>')
    const marker = { dashboardPath: 'd.html', head: 'abc1234', publishedHash: 'hash-2', auditWaived: { repoHash: 'hash-1' } }
    const r = evaluate(green({ html, marker, repoHash: 'hash-2' }))
    expect(r.reason).toMatch(/CONSISTENCY AUDIT FAILED/)
  })
  it('reports an audit violation BEFORE publish parity (fix first, publish once)', () => {
    const html = boardHtml().replace('<span class="meta">~2 h</span>', '<span class="meta">später</span>')
    const r = evaluate(green({ html, repoHash: 'hash-2' }))
    expect(r.reason).toMatch(/CONSISTENCY AUDIT FAILED/)
  })
})

describe('evaluate — check ordering and totality', () => {
  it('reports content staleness before publish parity (fix first, publish once)', () => {
    const r = evaluate(green({ head: 'def5678', repoHash: 'hash-2' }))
    expect(r.reason).toMatch(/OUT OF DATE/)
  })
  it('reports the focus mismatch before publish parity', () => {
    const html = boardHtml({ nowPoint: 200, queue: [210, 211, 204] })
    const r = evaluate(green({ html, open: [200, 210, 211, 204], repoHash: 'hash-2' }))
    expect(r.reason).toMatch(/NOW-CARD OUT OF SYNC/)
  })
  it('never throws on empty, null, or malformed input (wrapper fail-open depends on it)', () => {
    expect(() => evaluate()).not.toThrow()
    expect(() => evaluate(null)).not.toThrow()
    expect(() => evaluate({})).not.toThrow()
    expect(() =>
      evaluate({ open: 'garbage', marker: 42, html: 7, focus: 'x', pending: 1, now: NaN }),
    ).not.toThrow()
    // No open-points info at all reads as "nothing enforceable" → allow.
    expect(evaluate({}).decision).toBe('allow')
  })
})

// Point 371 — the board stops growing, folds away, and dates its own status.
// Each case is the shape the guard must FAIL on, because each of the three
// requirements was lost once already by a plain republish.
describe('the board keeps its shape (point 371)', () => {
  const card = (n, body) =>
    `<details>\n  <summary><span class="num">${n}</span><span class="t">T${n}</span><span class="right"><span class="meta">~1 h</span></span></summary>\n  <div class="body"><p>${body}</p></div>\n</details>\n`
  const board = ({ done = 1, link = true, nowBody = 'Stand 14:12 — läuft' } = {}) =>
    `<main><h1>B</h1>` +
    `<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>\n<details class="now"><summary><span class="t">1 — X</span></summary><div class="body"><p>${nowBody}</p></div></details>\n</details>` +
    `<details class="sect"><summary><h2>Von dir zu klären</h2></summary>\n</details>` +
    `<details class="sect"><summary><h2>Warteschlange</h2></summary>\n</details>` +
    `<details class="sect"><summary><h2>Erledigt</h2></summary>\n` +
    Array.from({ length: done }, (_, i) => card(900 + i, 'fertig')).join('') +
    (link ? '<p class="archive-link">im <a href="https://example.invalid/a">Archiv</a>.</p>' : '') +
    `</details>` +
    `<footer>Stand: 27.07.2026 · 1 offene Punkte</footer></main>`
  // auditDashboard(html, input) returns the violation ARRAY; these structural
  // cases need no point lists beyond the one open point the fixture names.
  const codes = (html) => auditDashboard(html, { open: [1], done: [] }).map((x) => x.code)

  it('passes a board that keeps its twenty, links the archive and dates its status', () => {
    expect(codes(board())).not.toContain('erledigt-overflow')
    expect(codes(board())).not.toContain('archive-link-missing')
    expect(codes(board())).not.toContain('now-card-undated')
  })

  it('fails when the Erledigt section grew past the twenty the board keeps', () => {
    expect(codes(board({ done: ERLEDIGT_ON_BOARD + 1 }))).toContain('erledigt-overflow')
  })

  it('fails when the archive link is gone, which would orphan the moved cards', () => {
    expect(codes(board({ link: false }))).toContain('archive-link-missing')
  })

  it('fails when a current-work card states no time for its status', () => {
    expect(codes(board({ nowBody: 'läuft noch' }))).toContain('now-card-undated')
  })

  it('demands every section fold, not only Erledigt', () => {
    const flat = board().replace(
      '<details class="sect"><summary><h2>Warteschlange</h2></summary>',
      '<h2>Warteschlange</h2>',
    )
    expect(codes(flat)).toContain('section-not-collapsible')
  })
})

// The expected end of a current-work card is a promise to a reader who checks
// the board from a phone (user 28.07.2026). A "~HH:MM" that has passed reads as
// a stalled batch while the work is running, so it BLOCKS rather than reminds —
// the 388 card had stood two hours past its estimate.
describe('a current-work estimate stays ahead of the clock (user 28.07.2026)', () => {
  const board = (meta) =>
    `<main><h1>B</h1>` +
    `<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>\n` +
    `<details class="now"><summary><span class="t">388 — T</span><span class="right">` +
    `<span class="meta">${meta}</span></span></summary><div class="body"><p>Stand 14:12 — läuft</p></div></details>\n` +
    `</details>` +
    `<details class="sect"><summary><h2>Von dir zu klären</h2></summary>\n</details>` +
    `<details class="sect"><summary><h2>Warteschlange</h2></summary>\n</details>` +
    `<details class="sect"><summary><h2>Erledigt</h2></summary>\n` +
    `<p class="archive-link">im <a href="https://example.invalid/a">Archiv</a>.</p></details>` +
    `<footer>Stand: 28.07.2026 · 1 offene Punkte</footer></main>`
  const codes = (meta, nowMinutes) =>
    auditDashboard(board(meta), { open: [1], done: [], nowMinutes }).map((x) => x.code)

  it('passes while the estimate is still ahead', () => {
    expect(codes('10:44 · ~15:15', 13 * 60)).not.toContain('now-eta-past')
  })

  it('blocks once the estimate has passed, naming the card', () => {
    const v = auditDashboard(board('10:44 · ~11:15'), { open: [1], done: [], nowMinutes: 13 * 60 })
    const hit = v.find((x) => x.code === 'now-eta-past')
    expect(hit).toBeDefined()
    expect(hit.msg).toContain('388')
  })

  it('grants a few minutes of grace so a republish on the minute cannot flap', () => {
    expect(codes('10:44 · ~13:00', 13 * 60 + ETA_GRACE_MIN)).not.toContain('now-eta-past')
    expect(codes('10:44 · ~13:00', 13 * 60 + ETA_GRACE_MIN + 1)).toContain('now-eta-past')
  })

  it('reads an estimate earlier than its own start as the next day, not as overdue', () => {
    expect(codes('23:40 · ~00:30', 23 * 60 + 50)).not.toContain('now-eta-past')
  })

  it('stays silent when no clock is handed in — the rule is pure, never guessed', () => {
    expect(codes('10:44 · ~11:15', null)).not.toContain('now-eta-past')
    expect(codes('10:44 · ~11:15', undefined)).not.toContain('now-eta-past')
  })

  it('ignores a card that states no expected end at all', () => {
    expect(codes('10:44', 13 * 60)).not.toContain('now-eta-past')
  })

  // Point 411 — the user reported the stale end times three times in one night.
  // Flagging a PASSED estimate is one tick too late by construction: the card is
  // already wrong when the guard speaks, and the reader had been looking at it
  // for the half hour a delegated build takes.
  it('flags an estimate that is CLOSE, before the promise breaks', () => {
    // 20 minutes left: still honest, nothing said.
    expect(codes('10:44 · ~13:20', 13 * 60)).not.toContain('now-eta-soon')
    // 10 minutes left: flagged while the board is still true.
    expect(codes('10:44 · ~13:10', 13 * 60)).toContain('now-eta-soon')
    expect(codes('10:44 · ~13:10', 13 * 60)).not.toContain('now-eta-past')
  })

  it('says the PASSED case louder, and never both at once for one card', () => {
    const v = auditDashboard(board('10:44 · ~11:15'), { open: [1], done: [], nowMinutes: 13 * 60 })
    const past = v.find((x) => x.code === 'now-eta-past')
    expect(past.msg).toContain('ALREADY PASSED')
    expect(v.find((x) => x.code === 'now-eta-soon')).toBeUndefined()
  })

  it('hands over the estimating RULE with either flag — the estimates were optimistic every time', () => {
    for (const meta of ['10:44 · ~13:10', '10:44 · ~11:15']) {
      const v = auditDashboard(board(meta), { open: [1], done: [], nowMinutes: 13 * 60 })
      const hit = v.find((x) => x.code === 'now-eta-soon' || x.code === 'now-eta-past')
      expect(hit.msg, meta).toContain(ETA_RULE)
    }
  })

  it('adds the METHOD observation once one card has been re-estimated too often', () => {
    const args = (revisions) => ({ open: [1], done: [], nowMinutes: 13 * 60, etaRevisions: revisions })
    const twice = auditDashboard(board('10:44 · ~13:10'), args({ byPoint: { 388: ETA_REVISION_LIMIT } }))
    expect(twice.find((x) => x.code === 'now-eta-soon').msg).not.toContain('METHOD')
    const thrice = auditDashboard(board('10:44 · ~13:10'), args({ byPoint: { 388: ETA_REVISION_LIMIT + 1 } }))
    expect(thrice.find((x) => x.code === 'now-eta-soon').msg).toContain('METHOD')
    // And it never throws on a garbled counter.
    for (const bad of [null, 42, 'nope', { byPoint: 'x' }, { byPoint: { 388: 'viele' } }]) {
      expect(() => auditDashboard(board('10:44 · ~13:10'), args(bad))).not.toThrow()
    }
  })

  it('never mistakes a wrapped estimate for a close or a past one', () => {
    // 23:50 against an estimate of 00:30 the next day: 40 minutes left, honest.
    expect(codes('23:40 · ~00:30', 23 * 60 + 50)).not.toContain('now-eta-soon')
    expect(codes('23:40 · ~00:30', 23 * 60 + 50)).not.toContain('now-eta-past')
    // An estimate inside the same day is still flagged when it comes close.
    expect(codes('23:00 · ~23:30', 23 * 60 + 20)).toContain('now-eta-soon')
  })

  it('is silent without a clock, and never throws on a garbled meta', () => {
    expect(codes('10:44 · ~13:10', null)).not.toContain('now-eta-soon')
    for (const meta of ['', 'irgendwas', '~99:99', '~:15', '10:44 · ~']) {
      expect(() => codes(meta, 13 * 60), meta).not.toThrow()
    }
  })
})

describe('the estimate helpers, on their own (point 411)', () => {
  it('reads the end and the start, wrapping past midnight', () => {
    expect(etaMinutes('10:44 · ~13:10')).toEqual({ eta: 13 * 60 + 10, start: 10 * 60 + 44 })
    expect(etaMinutes('23:40 · ~00:30')).toEqual({ eta: 1440 + 30, start: 23 * 60 + 40 })
    expect(etaMinutes('10:44')).toBeNull()
    expect(etaMinutes(null)).toBeNull()
  })

  it('reads an estimate against a clock that rolled past midnight', () => {
    const at = (meta, nowMinutes) => etaStatus({ meta, nowMinutes })
    // Before midnight the wrapped estimate is still honest.
    expect(at('23:40 · ~00:30', 23 * 60 + 50)).toEqual({ minutesLeft: 40, state: 'ok' })
    // After it, five minutes PAST 00:30 — not 1435 minutes short of it.
    expect(at('23:40 · ~00:30', 35).minutesLeft).toBe(-5)
    expect(at('23:40 · ~00:30', 30 + ETA_GRACE_MIN + 1).state).toBe('past')
    // The same rollover for an estimate that never wrapped.
    expect(at('23:00 · ~23:30', 10)).toEqual({ minutesLeft: -40, state: 'past' })
    // A clock a minute behind the card's own stamp is skew, never a rollover.
    expect(at('10:44 · ~13:10', 10 * 60 + 43).state).toBe('ok')
    // A meta with no start stamp cannot be rolled, so it is never called overdue.
    expect(etaMinutes('~13:00')).toEqual({ eta: 13 * 60, start: null })
    expect(at('~13:00', 10).state).toBe('ok')
  })

  it('classifies ok / soon / past around the margin and the grace', () => {
    const at = (meta, nowMinutes) => etaStatus({ meta, nowMinutes })
    expect(at('10:00 · ~13:00', 12 * 60).state).toBe('ok')
    // Exactly the margin is still ok; one minute inside it is not.
    expect(at('10:00 · ~13:00', 13 * 60 - ETA_MARGIN_MIN).state).toBe('ok')
    expect(at('10:00 · ~13:00', 13 * 60 - ETA_MARGIN_MIN + 1).state).toBe('soon')
    expect(at('10:00 · ~13:00', 13 * 60 + ETA_GRACE_MIN).state).toBe('soon')
    expect(at('10:00 · ~13:00', 13 * 60 + ETA_GRACE_MIN + 1).state).toBe('past')
    expect(at('10:00 · ~13:00', null)).toBeNull()
    expect(at('10:00', 12 * 60)).toBeNull()
    expect(etaStatus()).toBeNull()
  })

  it('counts a moved estimate per session, and starts fresh in a new one', () => {
    const card = (eta) => ({ meta: `10:00 · ~${eta}`, points: [388] })
    let state = {}
    state = etaRevisionPatch({ state, sessionId: 's1', cards: [card('12:00')] })
    expect(state.etaRevisions.byPoint).toEqual({}) // the FIRST estimate is no revision
    state = etaRevisionPatch({ state, sessionId: 's1', cards: [card('13:00')] })
    state = etaRevisionPatch({ state, sessionId: 's1', cards: [card('14:00')] })
    expect(state.etaRevisions.byPoint).toEqual({ 388: 2 })
    // An unchanged estimate is not a revision.
    state = etaRevisionPatch({ state, sessionId: 's1', cards: [card('14:00')] })
    expect(state.etaRevisions.byPoint).toEqual({ 388: 2 })
    // A new session estimates afresh — the count is about one sitting.
    const next = etaRevisionPatch({ state, sessionId: 's2', cards: [card('09:00')] })
    expect(next.etaRevisions.byPoint).toEqual({})
    // Total on junk.
    expect(() => etaRevisionPatch()).not.toThrow()
    expect(etaRevisionPatch({ state: 'nope', cards: 'nope' }).etaRevisions.byPoint).toEqual({})
  })
})

// The rule has to bite in the STOP chain, not only at a manual --synced: a card
// whose status text is refreshed and whose HEAD has not moved satisfies every
// other invariant while its header ages. Found by the four-eyes review.
describe('the expected-end rule reaches the turn end', () => {
  it('blocks the stop when a current-work estimate has passed', () => {
    const stale = boardHtml().replace(/class="meta">[^<]*</, 'class="meta">10:44 · ~11:15<')
    const withClock = evaluate(green({ html: stale, nowMinutes: 13 * 60 }))
    expect(JSON.stringify(withClock)).toContain('now-eta-past')
    // Without a clock the rule stays silent — it is never guessed.
    expect(JSON.stringify(evaluate(green({ html: stale })))).not.toContain('now-eta-past')
  })
})

describe('duplicate card titles', () => {
  const codes = (html) => auditDashboard(html, { open: [210, 211, 204], done: [209] }).map((v) => v.code)

  it('fails on a hand-built duplicate in any section and clears after repair', () => {
    const duplicated = boardHtml({ klaerungExtra: ['Kartenschrift wählen', 'Kartenschrift wählen'] })
    expect(codes(duplicated)).toContain('duplicate-card-title')

    const repaired = duplicated.replace('Kartenschrift wählen', 'Kartenschrift für Überschriften wählen')
    expect(codes(repaired)).not.toContain('duplicate-card-title')
  })
})

describe('a queue of placeholders is a regression, not a valid board (point 419 d)', () => {
  // The failure this counts: when the queue became a projection, the prose was
  // never migrated — 79 of 81 cards carried the stub body and every existing
  // rule passed, because the stub is exempt by name and coverage only asks that
  // a point appear somewhere. Formally perfect, materially empty.
  const stubCard = (n) =>
    `<details><summary><span class="num">${n}</span><span class="t">Task ${n}</span>` +
    `<span class="right"><span class="meta">${QUEUE_STUB_META}</span></span></summary>` +
    `<div class="body"><p>${QUEUE_STUB_BODY}</p></div></details>`
  const realCard = (n) =>
    `<details><summary><span class="num">${n}</span><span class="t">Task ${n}</span>` +
    `<span class="right"><span class="meta">~2 h</span></span></summary>` +
    `<div class="body"><p>Echte Beschreibung für ${n}.</p></div></details>`

  const boardWith = (cards) =>
    boardHtml().replace(
      /(<summary><h2>Warteschlange<\/h2><\/summary>\n)[\s\S]*?(\n<\/details>)/,
      `$1${cards.join('\n')}$2`,
    )
  const codesFor = (cards, open) =>
    auditDashboard(boardWith(cards), { open, done: [] }).map((x) => x.code)

  it('flags a queue that is mostly placeholder', () => {
    const cards = [1, 2, 3, 4, 5, 6, 7, 8].map(stubCard)
    expect(codesFor(cards, [210, 1, 2, 3, 4, 5, 6, 7, 8])).toContain('queue-stubbed')
  })

  it('accepts a handful of fresh points among written ones', () => {
    const cards = [realCard(1), realCard(2), realCard(3), realCard(4), realCard(5), realCard(6), stubCard(7)]
    expect(codesFor(cards, [210, 1, 2, 3, 4, 5, 6, 7])).not.toContain('queue-stubbed')
  })

  it('flags a RUN of placeholders even when the share is under the ceiling', () => {
    // 4 of 20 is 20 %, under the share ceiling — but a reader meets them in a row.
    const cards = [
      ...[1, 2, 3, 4].map(stubCard),
      ...Array.from({ length: 16 }, (_, i) => realCard(i + 5)),
    ]
    const open = [210, ...Array.from({ length: 20 }, (_, i) => i + 1)]
    expect(codesFor(cards, open)).toContain('queue-stubbed')
  })

  it('says nothing about an empty queue', () => {
    expect(codesFor([], [210])).not.toContain('queue-stubbed')
  })

  it('recognises the exact body the generator emits, not a lookalike', () => {
    const lookalike = [1, 2, 3, 4, 5, 6, 7, 8].map(
      (n) =>
        `<details><summary><span class="num">${n}</span><span class="t">Task ${n}</span>` +
        `<span class="right"><span class="meta">~1 h</span></span></summary>` +
        `<div class="body"><p>Noch offen, aber hier steht echter Text über den Punkt.</p></div></details>`,
    )
    expect(codesFor(lookalike, [210, 1, 2, 3, 4, 5, 6, 7, 8])).not.toContain('queue-stubbed')
  })
})

describe('the placeholder rule has a floor, and reads the card the generator really writes', () => {
  // Both findings of the second model's review of that rule.
  const boardWith = (cards) =>
    boardHtml().replace(
      /(<summary><h2>Warteschlange<\/h2><\/summary>\n)[\s\S]*?(\n<\/details>)/,
      `$1${cards.join('\n')}$2`,
    )
  const codesFor = (cards, open) =>
    auditDashboard(boardWith(cards), { open, done: [] }).map((x) => x.code)
  const stubCard = (n) => renderQueueCard({ point: n, title: `Task ${n}`, body: null, meta: QUEUE_STUB_META })
  const realCard = (n) =>
    renderQueueCard({ point: n, title: `Task ${n}`, body: `Echte Beschreibung für ${n}.`, meta: '~2 h' })

  it('tolerates a single fresh point on a SHORT queue, where the bare ratio would not', () => {
    // 1 of 3 is 33 %, over the share ceiling — and must not block a turn end.
    expect(codesFor([stubCard(1), realCard(2), realCard(3)], [210, 1, 2, 3])).not.toContain('queue-stubbed')
  })

  it('still tolerates three, and flags the fourth on a short queue', () => {
    const three = [stubCard(1), stubCard(2), realCard(3), stubCard(4), realCard(5)]
    expect(codesFor(three, [210, 1, 2, 3, 4, 5])).not.toContain('queue-stubbed')
    const four = [stubCard(1), stubCard(2), realCard(3), stubCard(4), realCard(5), stubCard(6)]
    expect(codesFor(four, [210, 1, 2, 3, 4, 5, 6])).toContain('queue-stubbed')
  })

  it('catches the all-placeholder queue the rule was written for', () => {
    const cards = Array.from({ length: 20 }, (_, i) => stubCard(i + 1))
    const open = [210, ...Array.from({ length: 20 }, (_, i) => i + 1)]
    expect(codesFor(cards, open)).toContain('queue-stubbed')
  })

  // The stub body goes through esc() on the way out and parseCards on the way
  // back; building the fixture from the raw constant would not exercise that.
  it('recognises a stub rendered through the real generator, entities and all', () => {
    const rendered = Array.from({ length: 10 }, (_, i) => stubCard(i + 1))
    expect(rendered[0]).toContain('&lt;N&gt;')
    const open = [210, ...Array.from({ length: 10 }, (_, i) => i + 1)]
    expect(codesFor(rendered, open)).toContain('queue-stubbed')
  })
})

// Point 410 — the board is German prose the user reads on a phone, and
// "faellt weg" / "kuenftig" read to him as broken text. The stdin path removes
// the REASON to transliterate; this rule removes the habit, which would
// otherwise return the next time the argument path looks convenient.
describe('a transliterated umlaut on a card is a defect (point 410)', () => {
  const board = ({ title = '410 — Die Tafel', body = 'Stand 14:12 — läuft' } = {}) =>
    `<main><h1>B</h1>` +
    `<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>\n` +
    `<details class="now"><summary><span class="t">${title}</span><span class="right">` +
    `<span class="meta">10:44 · ~15:15</span></span></summary><div class="body"><p>${body}</p></div></details>\n` +
    `</details>` +
    `<details class="sect"><summary><h2>Von dir zu klären</h2></summary>\n</details>` +
    `<details class="sect"><summary><h2>Warteschlange</h2></summary>\n</details>` +
    `<details class="sect"><summary><h2>Erledigt</h2></summary>\n` +
    `<p class="archive-link">im <a href="https://example.invalid/a">Archiv</a>.</p></details></main>`
  const audit = (opts) => auditDashboard(board(opts), { open: [410], done: [] })
  const codes = (opts) => audit(opts).map((x) => x.code)

  it('accepts real umlauts', () => {
    expect(
      codes({ body: 'Stand 14:12 — die Prüfung läuft, künftig fällt der Umweg über die Shell weg.' }),
    ).not.toContain('transliterated-umlaut')
  })

  it('flags a transliterated body and NAMES the card', () => {
    const hit = audit({ body: 'Stand 14:12 — der Umweg faellt kuenftig weg.' }).find(
      (x) => x.code === 'transliterated-umlaut',
    )
    expect(hit).toBeDefined()
    expect(hit.msg).toContain('410 — Die Tafel')
    expect(hit.msg).toContain('faellt')
    expect(hit.msg).toContain('--text-stdin')
  })

  it('flags a transliterated TITLE too, not only the body', () => {
    expect(codes({ title: '410 — Pruefung der Tafel' })).toContain('transliterated-umlaut')
  })

  it('leaves legitimate words that merely carry those letters alone', () => {
    expect(
      codes({ body: 'Stand 14:12 — Quelle, Steuer, Aequator, Feuer, Museum, neue Route, Duell.' }),
    ).not.toContain('transliterated-umlaut')
  })

  it('never throws on an unreadable board', () => {
    expect(findTransliterations(null)).toEqual([])
    expect(findTransliterations(undefined)).toEqual([])
    expect(() => auditDashboard(null, { open: [1], done: [] })).not.toThrow()
  })

  it('catches the words the user reported, and the compounds around them', () => {
    expect(findTransliterations('faellt weg')).toContain('faellt')
    expect(findTransliterations('kuenftig')).toContain('kuenftig')
    expect(findTransliterations('Ueberpruefung')).toContain('ueberpruefung')
    expect(findTransliterations('ausgefuehrt')).toContain('ausgefuehrt')
    expect(findTransliterations('groesser')).toContain('groesser')
  })

  it('reaches the turn end through the audit invariant', () => {
    const broken = boardHtml().replace('Kurzstand.', 'Kurzstand, faellt kuenftig weg.')
    expect(JSON.stringify(evaluate(green({ html: broken })))).toContain('transliterated-umlaut')
  })
})
