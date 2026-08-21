import { describe, expect, it } from 'vitest'
import {
  CONTEXT_OPERATION,
  CONTEXT_SESSION_CLASS,
  SESSION_CEILING_REMEDIES,
  attendedCeilingNoticeDecision,
  classifyContextSession,
  sessionCeilingDecision,
} from './session-context-ceiling-core.mjs'

const CLASSES = Object.values(CONTEXT_SESSION_CLASS)
const enough = { fits: true }
const spent = { fits: false }

describe('the three session classes share one ceiling', () => {
  it.each(CLASSES)('allows a %s call which still fits', (sessionClass) => {
    expect(sessionCeilingDecision({ sessionClass, budgetDecision: enough, mode: 'armed' })).toMatchObject({
      allowed: true,
      refused: false,
      observed: false,
    })
  })

  it.each([
    [CONTEXT_SESSION_CLASS.SUBAGENT, 'return-what-you-have', /return what you have/i],
    [CONTEXT_SESSION_CLASS.BATCH_OWNER, 'boundary', /boundary/i],
    [CONTEXT_SESSION_CLASS.ATTENDED, 'clear', /\/clear/],
  ])('refuses a %s call which does not fit and names its remedy', (sessionClass, id, text) => {
    const decision = sessionCeilingDecision({ sessionClass, budgetDecision: spent, mode: 'armed' })
    expect(decision).toMatchObject({ allowed: false, refused: true, observed: true, remedy: { id } })
    expect(decision.remedy.text).toMatch(text)
  })

  it.each(CLASSES)('never refuses an ANSWER from a %s', (sessionClass) => {
    expect(sessionCeilingDecision({
      sessionClass,
      budgetDecision: spent,
      operation: CONTEXT_OPERATION.ANSWER,
      mode: 'armed',
    })).toMatchObject({ allowed: true, refused: false, conversationSafe: true })
  })

  it.each(CLASSES)('admits a READ against the budget without silencing a %s', (sessionClass) => {
    expect(sessionCeilingDecision({
      sessionClass,
      budgetDecision: spent,
      operation: CONTEXT_OPERATION.READ,
      mode: 'armed',
    })).toMatchObject({ allowed: true, refused: false, conversationSafe: true })
  })

  it.each(CLASSES)('one permit admits one otherwise-refused %s call, not the next', (sessionClass) => {
    const first = sessionCeilingDecision({ sessionClass, budgetDecision: spent, mode: 'armed', permitUsed: true })
    const second = sessionCeilingDecision({ sessionClass, budgetDecision: spent, mode: 'armed', permitUsed: false })
    expect(first).toMatchObject({ allowed: true, refused: false, permitted: true })
    expect(second).toMatchObject({ allowed: false, refused: true, permitted: false })
  })

  it.each(CLASSES)('observe mode records but refuses nothing for a %s', (sessionClass) => {
    expect(sessionCeilingDecision({ sessionClass, budgetDecision: spent, mode: 'observe' })).toMatchObject({
      allowed: true,
      refused: false,
      observed: true,
    })
  })

  it('defines one distinct remedy for every class', () => {
    expect(new Set(Object.values(SESSION_CEILING_REMEDIES).map((entry) => entry.id)).size).toBe(CLASSES.length)
  })
})

describe('classification from real hook shapes', () => {
  it('uses agent_id to identify a subagent even though it inherits the owner session id', () => {
    expect(classifyContextSession({
      agentId: 'agent-a288e028424fe5835',
      sessionId: 'owner-session',
      ownerSessionId: 'owner-session',
    })).toBe(CONTEXT_SESSION_CLASS.SUBAGENT)
  })

  it('identifies the batch owner from the ordinary main-thread payload and lock', () => {
    expect(classifyContextSession({ sessionId: 'owner-session', ownerSessionId: 'owner-session' }))
      .toBe(CONTEXT_SESSION_CLASS.BATCH_OWNER)
  })

  it('identifies an attended main window when another session owns the lock', () => {
    expect(classifyContextSession({ sessionId: 'person-window', ownerSessionId: 'batch-worker' }))
      .toBe(CONTEXT_SESSION_CLASS.ATTENDED)
  })

  it('does not mistake agent_type alone for the subagent-only agent_id signal', () => {
    expect(classifyContextSession({ agentType: 'reviewer', sessionId: 'person-window' }))
      .toBe(CONTEXT_SESSION_CLASS.ATTENDED)
  })
})

describe('the attended reading notice', () => {
  const ask = (overrides = {}) => attendedCeilingNoticeDecision({
    sessionClass: CONTEXT_SESSION_CLASS.ATTENDED,
    tokens: 150_001,
    ...overrides,
  })

  it('says nothing below the mark and asks once above it', () => {
    expect(ask({ tokens: 149_999 })).toEqual({ speak: false, reason: 'below' })
    expect(ask()).toMatchObject({ speak: true, reason: 'past-ceiling' })
    expect(ask({ alreadyNotified: true })).toEqual({ speak: false, reason: 'already-notified' })
  })

  it('suppresses the bad moments without consuming the future notice', () => {
    expect(ask({ gitBusy: true })).toEqual({ speak: false, reason: 'git-busy' })
    expect(ask({ verificationRunning: true })).toEqual({ speak: false, reason: 'verification-running' })
  })

  it('does not guess from an unreadable reading', () => {
    for (const tokens of [null, undefined, '--', 0]) {
      expect(ask({ tokens })).toEqual({ speak: false, reason: 'unreadable' })
    }
  })

  it('leaves the batch owner on its existing boundary path', () => {
    expect(ask({ sessionClass: CONTEXT_SESSION_CLASS.BATCH_OWNER }))
      .toEqual({ speak: false, reason: 'batch-owner-unchanged' })
  })
})
