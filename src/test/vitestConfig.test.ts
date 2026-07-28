// @vitest-environment node
// The fast layer's own contract (point 398): how long a unit case may take
// before the runner calls it hung, and that a slow one is still REPORTED.
//
// This is pinned rather than merely written in a comment because the value is
// what the whole delegated workflow leans on. `npm run test:unit` is the gate
// under `pre-push-gate.mjs` and several Stop hooks, and at vitest's default
// 5000 ms it went red on `main` twice within ten minutes on 28.07.2026 — 2 then
// 5 failures, every one of them `Test timed out in 5000ms`, none an assertion —
// simply because three worktree agents were building. A later "tidy-up" that
// pulled the ceiling back down would re-break the push under exactly the load
// this project is designed to run at, so the number is asserted here with its
// reason attached.
import { describe, expect, it } from 'vitest'
import config from '../../vitest.config'

const unitTest = config.test!

describe('the fast layer is timed to survive the agent pool (point 398)', () => {
  it('gives every case a load-proof ceiling, not a tight one', () => {
    // The slowest honest cases sit at 1.5-2.3 s (a real git probe, a heavy
    // constructor, a child process). Twenty seconds is roughly ten times the
    // worst of them: load cannot reach it, a genuine hang still cannot pass it.
    expect(unitTest.testTimeout).toBe(20_000)
    // Hooks share the bar — otherwise the same flake just moves into a beforeAll.
    expect(unitTest.hookTimeout).toBe(20_000)
  })

  it('still reports a slow case, so cost cannot hide inside the larger budget', () => {
    // The threshold has to stay WELL below the timeout: a case that grows from
    // 2 s to 15 s must be printed with its duration long before it is failed.
    expect(unitTest.slowTestThreshold).toBe(1000)
    expect(unitTest.slowTestThreshold!).toBeLessThan(unitTest.testTimeout! / 2)
  })

  // The other half of the bargain: the ceiling was raised to stop LOAD failures,
  // not to let a real hang stall the suite. A never-settling promise must still
  // be failed by the runner. `.fails` inverts the expectation, so the timeout it
  // provokes is the assertion — and its own 250 ms budget keeps the proof cheap
  // and independent of the configured floor above.
  it.fails('fails a deliberately hanging case instead of stalling on it', async () => {
    await new Promise(() => {})
  }, 250)
})
