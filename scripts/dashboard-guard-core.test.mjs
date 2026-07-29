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
  sliceSections,
  parseCards,
  auditDashboard,
  evaluate,
  ERLEDIGT_ON_BOARD,
  ETA_GRACE_MIN,
} from './dashboard-guard-core.mjs'

import { boardHtml, green } from './dashboard-guard-fixtures.mjs'


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
  it('is empty on a missing section and non-string input', () => {
    expect(parseNowCardPoints('<h2>Warteschlange</h2>').size).toBe(0)
    expect(parseNowCardPoints(null).size).toBe(0)
    expect(parseNowCardPoints(undefined).size).toBe(0)
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
