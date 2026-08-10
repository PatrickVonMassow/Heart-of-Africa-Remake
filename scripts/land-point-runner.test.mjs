// IS THE GATE RUNNER ACTUALLY ASYNCHRONOUS? (point 594, rider c)
//
// This one case exists because everything around it was already green while the
// feature did not work. `gateConcurrency` decided "parallel", the summary printed
// "parallel", `runSteps` scheduled with `Promise.all` — and the gate ran strictly
// one step after the other, because the runner underneath wrapped a SYNCHRONOUS
// `execFileSync` in a `new Promise(...)` executor. The executor body runs the
// moment the promise is constructed, so `map` over it completes each command
// before the next promise exists.
//
// No decision test can catch that, and neither can a scheduler test with a fake
// runner: the defect lives in the runner, and the only property that separates a
// real async runner from a synchronous one is that IT RETURNS BEFORE THE CHILD
// EXITS. So that is what is measured, against a child slow enough that a
// synchronous implementation could not possibly beat the bar.
//
// The margins are deliberately wide (a 400 ms child, a 150 ms bar). Load can only
// make the CHILD slower, which widens the gap rather than narrowing it — the
// failure mode of this test is a machine so loaded that spawning a process takes
// 150 ms, which is not a state any gate verdict would survive anyway.
import { describe, it, expect } from 'vitest'
import { runCommand } from './land-point.mjs'

/** A child that takes a measurable, deterministic amount of time. */
const slowChild = (ms) => ({ cmd: process.execPath, args: ['-e', `setTimeout(() => {}, ${ms})`], id: 'slow' })

describe('the gate runner', () => {
  it('RETURNS before the child exits — the property execFileSync cannot have', async () => {
    const started = Date.now()
    const pending = runCommand(slowChild(400))
    const returnedAfter = Date.now() - started
    expect(returnedAfter).toBeLessThan(150)

    const result = await pending
    expect(Date.now() - started).toBeGreaterThanOrEqual(350)
    expect(result).toMatchObject({ id: 'slow', ok: true })
  })

  it('overlaps two children instead of adding their durations', async () => {
    const started = Date.now()
    const both = await Promise.all([runCommand(slowChild(400)), runCommand(slowChild(400))])
    const elapsed = Date.now() - started
    expect(both.every((r) => r.ok)).toBe(true)
    // Serial would be >= 800 ms; concurrent is one child plus spawn overhead.
    expect(elapsed).toBeLessThan(700)
  })

  it('reports a failing command instead of throwing, and keeps its last output', async () => {
    const r = await runCommand({
      cmd: process.execPath,
      args: ['-e', 'console.error("boom"); process.exit(3)'],
      id: 'lint',
    })
    expect(r).toMatchObject({ id: 'lint', ok: false })
    expect(r.output).toContain('boom')
  })

  it('reports a command that does not exist rather than crashing the chain', async () => {
    const r = await runCommand({ cmd: 'definitely-not-a-real-binary-594', args: [], id: 'build' })
    expect(r.ok).toBe(false)
  })

  it('truncates a chatty failure to its last lines', async () => {
    const r = await runCommand({
      cmd: process.execPath,
      args: ['-e', 'for (let i = 0; i < 200; i++) console.log("line " + i); process.exit(1)'],
      id: 'unit',
      maxOutputLines: 5,
    })
    expect(r.ok).toBe(false)
    expect(r.output.split('\n').length).toBeLessThanOrEqual(5)
    expect(r.output).toContain('line 199')
  })
})
