import { describe, expect, it } from 'vitest'
import { contextFenceState, scopeMandatoryDuty } from './guard-duty-core.mjs'

const NOW = 1_787_000_000_000
const marker = (over = {}) => ({
  phase: 'committed',
  cause: 'context',
  sessionId: 'old-session',
  at: NOW - 1_000,
  ...over,
})

describe('the shared mandatory-duty fence', () => {
  it('recognises only this session\'s fresh committed context boundary', () => {
    expect(contextFenceState({ marker: marker(), sessionId: 'old-session', now: NOW }).closed).toBe(true)
    expect(contextFenceState({ marker: marker({ cause: 'point' }), sessionId: 'old-session', now: NOW }).closed).toBe(false)
    expect(contextFenceState({ marker: marker(), sessionId: 'successor', now: NOW }).closed).toBe(false)
  })

  it('hands a fenced duty to the successor and names the one way back', () => {
    const verdict = scopeMandatoryDuty({
      owed: true,
      fence: contextFenceState({ marker: marker(), sessionId: 'old-session', now: NOW }),
      guardId: 'demo-guard',
      sessionId: 'old-session',
      duty: 'the demo review',
    })
    expect(verdict).toMatchObject({ owed: false, deferred: true })
    expect(verdict.message).toContain('successor session')
    expect(verdict.message).toContain('batch-boundary.mjs --clear')
  })

  it('keeps the same debt on the successor\'s first turn', () => {
    const verdict = scopeMandatoryDuty({
      owed: true,
      fence: contextFenceState({ marker: marker(), sessionId: 'successor', now: NOW }),
      guardId: 'demo-guard',
      sessionId: 'successor',
      duty: 'the demo review',
    })
    expect(verdict).toMatchObject({ owed: true, deferred: false })
    expect(verdict.message).toContain('session successor')
  })
})
