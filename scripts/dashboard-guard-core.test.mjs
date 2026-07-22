// Decision-logic sweep of the dashboard Stop-hook guard (dashboard-guard-core):
// every invariant blocks on its violation, the fully consistent state allows,
// and partial/malformed inputs never throw (the wrapper's fail-open depends on
// the core being total). The regression scenario that motivated the hardening —
// the now-card still naming point 200 while the work had pivoted to 210 — is
// pinned explicitly.
import { describe, it, expect } from 'vitest'
import {
  FOCUS_FRESH_MS,
  parseTasks,
  parseNowCardPoint,
  parseNowCardPoints,
  parseQueuePoints,
  parseKlaerungPoints,
  evaluate,
} from './dashboard-guard-core.mjs'

/** Minimal dashboard HTML in the real board's markup (incl. an Erledigt section
 *  that also uses `.num`, which the queue parser must NOT pick up). `nowCards`
 *  renders SEVERAL now-cards for the parallel-work workflow (numbers become
 *  `N — Task N` titles, strings stay literal non-point titles) and overrides
 *  the single `nowPoint`/`nowTitle` pair. `klaerung` renders point-tied
 *  "Von dir zu klären" cards (leading number in the title); `klaerungExtra`
 *  adds no-number cards like the real ntfy one. */
function boardHtml({
  nowPoint = 210,
  nowTitle = 'Meereskante glätten',
  nowCards = null,
  queue = [211, 204],
  done = [209],
  klaerung = [],
  klaerungExtra = [],
} = {}) {
  const q = queue
    .map((n) => `<details><summary><span class="num">${n}</span><span class="t">Task ${n}</span></summary></details>`)
    .join('\n')
  const d = done
    .map((n) => `<details><summary><span class="num">${n}</span><span class="t">Done ${n}</span></summary></details>`)
    .join('\n')
  const k = [
    ...klaerung.map((n) => `<details><summary><span class="t">${n} — Frage zu Punkt ${n}</span></summary></details>`),
    ...klaerungExtra.map((t) => `<details><summary><span class="t">${t}</span></summary></details>`),
  ].join('\n')
  const nowTitles = (nowCards ?? [nowPoint == null ? nowTitle : `${nowPoint} — ${nowTitle}`]).map((c) =>
    typeof c === 'number' ? `${c} — Task ${c}` : c,
  )
  const now = nowTitles
    .map(
      (t) => `<details class="now" open><summary><span class="t">${t}</span></summary>
<div class="body"><p>Status (Stand 09:00): der point-200-Vergleich darf hier NICHT zählen.</p></div></details>`,
    )
    .join('\n')
  return `<main><h1>Dashboard</h1>
<h2>Woran ich gerade arbeite</h2>
${now}
<h2>Von dir zu klären</h2>
${k}
<h2>Warteschlange</h2>
${q}
<h2>Erledigt</h2>
${d}
</main>`
}

/** A fully consistent input — every invariant satisfied → allow. */
function green(overrides = {}) {
  const html = overrides.html ?? boardHtml()
  return {
    paused: false,
    open: [210, 211, 204],
    done: [209],
    marker: {
      dashboardPath: '.batch-dashboard.html',
      head: 'abc1234',
      publishedHash: 'hash-1',
    },
    markerFileExists: true,
    head: 'abc1234',
    html,
    repoHash: 'hash-1',
    focus: { point: 210, note: 'smooth the sea edge', setAt: 1000, confirmedAt: 1000 },
    pending: null,
    sessionId: 'sess-a',
    lastToolAt: 500,
    now: 2000,
    ...overrides,
  }
}

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
