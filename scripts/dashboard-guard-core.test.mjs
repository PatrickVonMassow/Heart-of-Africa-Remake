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
  parseQueuePoints,
  evaluate,
} from './dashboard-guard-core.mjs'

/** Minimal dashboard HTML in the real board's markup (incl. an Erledigt section
 *  that also uses `.num`, which the queue parser must NOT pick up). */
function boardHtml({ nowPoint = 210, nowTitle = 'Meereskante glätten', queue = [211, 204], done = [209] } = {}) {
  const q = queue
    .map((n) => `<details><summary><span class="num">${n}</span><span class="t">Task ${n}</span></summary></details>`)
    .join('\n')
  const d = done
    .map((n) => `<details><summary><span class="num">${n}</span><span class="t">Done ${n}</span></summary></details>`)
    .join('\n')
  const nowT = nowPoint == null ? nowTitle : `${nowPoint} — ${nowTitle}`
  return `<main><h1>Dashboard</h1>
<h2>Woran ich gerade arbeite</h2>
<details class="now" open><summary><span class="t">${nowT}</span></summary>
<div class="body"><p>Status (Stand 09:00): der point-200-Vergleich darf hier NICHT zählen.</p></div></details>
<h2>Von dir zu klären</h2>
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
