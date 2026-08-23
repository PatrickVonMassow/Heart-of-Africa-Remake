// THE PARENT-DEATH DRILL AS A REGRESSION (point 834): the scenario that
// reproduces the run lost on 21.08.2026 — the spawning session's process group
// SIGKILLed mid-authoring — must keep passing, and an unknown scenario must be
// refused rather than reported as a passed nothing.
import { describe, it, expect } from 'vitest'
import { runDrill } from './batch-daemon-drill.mjs'

describe('runDrill', () => {
  it('refuses an unknown scenario instead of passing it silently', async () => {
    const res = await runDrill({ scenario: 'made-up' })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/unknown scenario/)
  })

  it('parent-death: daemon and worker survive the killed session and a fresh session adopts them', async () => {
    const result = await runDrill({ scenario: 'parent-death' })
    const failed = (result.checks ?? []).filter((c) => !c.ok)
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([])
    expect(result.ok).toBe(true)
    // The drill's evidence is its named checks; assert the load-bearing ones by
    // name so a rewrite cannot quietly drop them.
    const names = result.checks.map((c) => c.name)
    expect(names).toContain('the daemon survived under its recorded pid and start time')
    expect(names).toContain('the worker pushed a SHA that did not exist at the kill')
    expect(names).toContain('a new checkpoint request was ACKNOWLEDGED by that daemon')
    expect(names).toContain('the cancellation preserved the branch')
  }, 120_000)
})
