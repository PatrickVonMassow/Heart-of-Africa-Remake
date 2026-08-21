import { describe, expect, it } from 'vitest'
import {
  BOUNDED_CONTROL_OPERATIONS,
  bookPendingDebit,
  boundedControlCall,
  countUnknownTypeCost,
  emptyPendingLedger,
  reconcilePendingLedger,
  remainingBudgetDecision,
  seriesKindCost,
} from './context-budget-core.mjs'
import {
  CONTEXT_CEILING_TOKENS,
  CONTEXT_HANDOVER_RESERVE_TOKENS,
} from './context-watermark-core.mjs'

const AT = Date.parse('2026-08-19T12:00:00.000Z')
const reading = (tokens, at = AT) => ({ tokens, at })
const series = {
  byKind: [
    { kind: 'read', calls: 55, p: 10_956 },
    { kind: 'agent', calls: 5, p: 5_910 },
    { kind: 'other', calls: 17, p: 3_513 },
    { kind: 'write', calls: 141, p: 2_279 },
    { kind: 'bash', calls: 2_869, p: 2_129 },
    { kind: 'browser-suite', calls: 12, p: 1_232 },
  ],
}

const decide = (overrides = {}) => remainingBudgetDecision({
  reading: reading(100_000),
  series,
  toolName: 'Read',
  toolInput: { file_path: 'large.log' },
  ...overrides,
})

describe('remainingBudgetDecision', () => {
  it('reads the p90 type cost from point 742 series input', () => {
    expect(seriesKindCost(series, 'read')).toBe(10_956)
    expect(seriesKindCost(series, 'web')).toBeNull()
    expect(decide()).toMatchObject({
      state: 'fit',
      fits: true,
      kind: 'read',
      projectedCost: 10_956,
      remainingBeforeCall: 22_000,
      remainingAfterCall: 11_044,
    })
  })

  it('refuses when the remainder cannot hold this call and the handover', () => {
    expect(decide({ reading: reading(112_000) })).toMatchObject({
      state: 'insufficient',
      fits: false,
      remainingBeforeCall: 10_000,
      remainingAfterCall: -956,
    })
  })

  it('fails open and loudly when the reading is unreadable', () => {
    for (const bad of [null, {}, { tokens: 0 }, { tokens: '100000' }]) {
      expect(decide({ reading: bad })).toMatchObject({
        state: 'unreadable',
        fits: true,
        alert: true,
        book: false,
      })
    }
    expect(decide({
      reading: null,
      toolName: 'Bash',
      toolInput: { command: 'node scripts/batch-boundary.mjs --prepare --context' },
    })).toMatchObject({ state: 'unreadable', fits: true, alert: true, book: false })
  })

  it('keeps an unclassified call allowed', () => {
    expect(decide({ toolName: '' })).toMatchObject({
      state: 'unclassified',
      fits: true,
      book: false,
    })
    // A known tool whose non-start kind is absent from the series takes the
    // same explicit fail-open direction.
    expect(decide({ toolName: 'WebFetch', toolInput: { url: 'https://example.invalid' } })).toMatchObject({
      state: 'unclassified',
      fits: true,
      kind: 'web',
    })
  })

  it('takes the conservative, countable branch only for an already-classified start with unknown cost', () => {
    const decision = decide({ series: { byKind: [] }, toolName: 'Agent', toolInput: { prompt: 'work' } })
    expect(decision).toMatchObject({
      state: 'insufficient',
      fits: false,
      kind: 'agent',
      projectedCost: CONTEXT_CEILING_TOKENS,
      unknownTypeCost: true,
      book: true,
    })
    expect(countUnknownTypeCost(emptyPendingLedger('s')).unknownTypeCostFirings).toBe(1)
  })

  it('subtracts the handover reserve from the first call onward', () => {
    const first = decide({
      ceiling: 150_000,
      reading: reading(120_000),
      handoverReserve: 28_000,
      series: { byKind: [{ kind: 'bash', p: 2_000 }] },
      toolName: 'Bash',
      toolInput: { command: 'rg needle file' },
    })
    expect(CONTEXT_HANDOVER_RESERVE_TOKENS).toBe(28_000)
    expect(first).toMatchObject({ remainingBeforeCall: 2_000, remainingAfterCall: 0, fits: true })
  })

  it('subtracts every pending debit from the stale reading', () => {
    const call = (pendingDebit) => decide({
      ceiling: 140,
      handoverReserve: 10,
      reading: reading(100),
      pendingDebit,
      series: { byKind: [{ kind: 'bash', p: 10 }] },
      toolName: 'Bash',
      toolInput: { command: 'rg needle file' },
    })
    expect(call(0)).toMatchObject({ fits: true, remainingBeforeCall: 30 })
    expect(call(10)).toMatchObject({ fits: true, remainingBeforeCall: 20 })
    expect(call(20)).toMatchObject({ fits: true, remainingBeforeCall: 10 })
    expect(call(30)).toMatchObject({ fits: false, remainingBeforeCall: 0 })
  })
})

describe('the pending-debit ledger', () => {
  it('books three calls against one unmoved reading instead of granting the same remainder three times', () => {
    let ledger = reconcilePendingLedger(emptyPendingLedger('s'), { sessionId: 's', reading: reading(100) }).ledger
    for (let i = 0; i < 3; i += 1) ledger = bookPendingDebit(ledger, 10)
    expect(ledger.pendingDebit).toBe(30)
    expect(reconcilePendingLedger(ledger, { sessionId: 's', reading: reading(100) }).ledger.pendingDebit).toBe(30)
  })

  it('reconciles pending projections when the next complete reading arrives', () => {
    let ledger = reconcilePendingLedger(emptyPendingLedger('s'), { sessionId: 's', reading: reading(100) }).ledger
    ledger = bookPendingDebit(bookPendingDebit(ledger, 10), 12)
    const next = reconcilePendingLedger(ledger, { sessionId: 's', reading: reading(117, AT + 1) })
    expect(next).toMatchObject({ reconciled: true, actualGrowth: 17 })
    expect(next.ledger.pendingDebit).toBe(0)
    expect(next.ledger.readingTokens).toBe(117)
  })

  it('never carries a debit into another session', () => {
    const old = { ...emptyPendingLedger('old'), readingId: '100:1', readingTokens: 100, pendingDebit: 30 }
    expect(reconcilePendingLedger(old, { sessionId: 'new', reading: reading(100, 1) }).ledger).toMatchObject({
      sessionId: 'new',
      pendingDebit: 0,
    })
  })
})

describe('bounded control exemptions', () => {
  it('enumerates each exemption with its reason', () => {
    expect(Object.keys(BOUNDED_CONTROL_OPERATIONS)).toEqual([
      'git-commit',
      'git-push',
      'board',
      'board-publish',
      'focus-stamp',
      'boundary',
    ])
    for (const entry of Object.values(BOUNDED_CONTROL_OPERATIONS)) expect(entry.reason.length).toBeGreaterThan(20)
  })

  it.each([
    ['git commit -m done', 'git-commit'],
    ['git push origin feat/x', 'git-push'],
    ['node scripts/board.mjs status 745 done', 'board'],
    ['node scripts/board-publish.mjs', 'board-publish'],
    ['node scripts/focus.mjs confirm', 'focus-stamp'],
    ['node scripts/batch-boundary.mjs --prepare --context', 'boundary'],
  ])('allows %s even at zero remaining budget', (command, id) => {
    const exemption = boundedControlCall({ toolName: 'Bash', command })
    expect(exemption.ids).toContain(id)
    expect(decide({ reading: reading(CONTEXT_CEILING_TOKENS), toolName: 'Bash', toolInput: { command } })).toMatchObject({
      state: 'exempt',
      fits: true,
      book: false,
    })
  })

  it('does not let one bounded segment exempt a growing call beside it', () => {
    expect(boundedControlCall({ toolName: 'Bash', command: 'git commit -m done && npm test' })).toBeNull()
    expect(decide({
      reading: reading(121_000),
      toolName: 'Bash',
      toolInput: { command: 'git commit -m done && npm test' },
    })).toMatchObject({ kind: 'browser-suite', state: 'insufficient' })
  })

  it('admits a large Read like every other measured growth call', () => {
    expect(decide({ reading: reading(112_000), toolName: 'Read', toolInput: { file_path: 'huge.log' } })).toMatchObject({
      kind: 'read',
      fits: false,
    })
  })
})
