import { describe, expect, it } from 'vitest'
import {
  CONTEXT_HANDOVER_RESERVE_TOKENS,
  CONTEXT_TRIGGER_TOKENS,
} from './context-watermark-core.mjs'
import { handoverBudgetCompletion, handoverBudgetStart } from './handover-budget-core.mjs'

const SID = 'owner-744'

describe('the measured handover cap', () => {
  it('keeps the first refusal and does not move the start on repeated Stop attempts', () => {
    const first = handoverBudgetStart({ sessionId: SID, tokens: 111_400, at: 1 })
    expect(handoverBudgetStart({ current: first, sessionId: SID, tokens: 115_000, at: 2 })).toBe(first)
    expect(handoverBudgetStart({ current: first, sessionId: 'successor', tokens: 80_000, at: 3 })).toMatchObject({
      sessionId: 'successor',
      startTokens: 80_000,
    })
  })

  it('records the cap edge and the first token beyond it exactly', () => {
    const start = handoverBudgetStart({ sessionId: SID, tokens: CONTEXT_TRIGGER_TOKENS, at: 1 })
    expect(handoverBudgetCompletion({ start, sessionId: SID, tokens: 150_000, at: 2 })).toMatchObject({
      costTokens: CONTEXT_HANDOVER_RESERVE_TOKENS,
      capTokens: CONTEXT_HANDOVER_RESERVE_TOKENS,
      exceeded: false,
      overrunTokens: 0,
    })
    expect(handoverBudgetCompletion({ start, sessionId: SID, tokens: 150_001, at: 2 })).toMatchObject({
      exceeded: true,
      overrunTokens: 1,
    })
  })

  it('does not manufacture a measurement from another session or a falling reading', () => {
    const start = handoverBudgetStart({ sessionId: SID, tokens: CONTEXT_TRIGGER_TOKENS, at: 1 })
    expect(handoverBudgetCompletion({ start, sessionId: 'other', tokens: 150_001 })).toBeNull()
    expect(handoverBudgetCompletion({ start, sessionId: SID, tokens: 100_000 })).toBeNull()
  })
})
