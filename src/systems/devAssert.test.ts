// The in-game invariant channel (point 207(i)): a failed assert reports itself
// via console.error — which every verify suite's console-error gate turns into
// a failure — and lands in window.__assertLog; per-code rate limiting keeps a
// persistent violation from flooding. DEV-only by the import.meta.env.DEV guard
// (vitest runs with DEV true, so the behaviour is testable here).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { devAssert, resetDevAsserts } from './devAssert'

describe('devAssert (point 207(i) — broken rules report themselves)', () => {
  let spy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    resetDevAsserts()
    ;(window as unknown as { __assertLog?: unknown[] }).__assertLog = []
    spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => spy.mockRestore())

  it('a passing condition stays silent and never evaluates the detail', () => {
    let evaluated = false
    devAssert(true, 'ok-code', () => {
      evaluated = true
      return 'x'
    })
    expect(spy).not.toHaveBeenCalled()
    expect(evaluated).toBe(false)
  })

  it('a failing condition logs [ASSERT] with the code and detail and records to __assertLog', () => {
    devAssert(false, 'demo-broken', () => 'zebra at NaN')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0][0])).toContain('[ASSERT] demo-broken')
    expect(String(spy.mock.calls[0][0])).toContain('zebra at NaN')
    const log = (window as unknown as { __assertLog: Array<{ code: string }> }).__assertLog
    expect(log.length).toBe(1)
    expect(log[0].code).toBe('demo-broken')
  })

  it('rate-limits per code but not across codes', () => {
    devAssert(false, 'code-a')
    devAssert(false, 'code-a') // suppressed (same code, within the window)
    devAssert(false, 'code-b') // different code fires
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
