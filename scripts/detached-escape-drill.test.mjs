// THE DRILL'S READING, without spawning anything.
//
// The measurement itself takes five seconds and real processes; what has to be
// pinned is how its evidence is READ, because that is where a drill turns into
// a false green. A cross-vendor reading of the first version found two of them:
// a single post-kill beat counted as "still working", and a zombie counted as a
// live process. Both are cases below.
import { describe, it, expect } from 'vitest'
import { BEAT_MS, probeAlive, readOutcome, SHAPES, verdict } from './detached-escape-drill.mjs'

// A three-second window at the fixture's beat period: what a healthy worker
// would actually produce, and the yardstick every case below is measured on.
const WINDOW = 3000
const full = { observeMs: WINDOW, observedUntil: 10_000, lastBeatAt: 10_000 - BEAT_MS }

describe('readOutcome', () => {
  it('calls it an escape when the process is alive and kept its beat rate', () => {
    const escaped = readOutcome({ shape: 'files', alive: true, beatsBefore: 9, beatsAfter: 24, ...full })
    expect(escaped.escaped).toBe(true)
  })

  it('refuses a single post-kill beat as work', () => {
    // MEASURED DEFECT of the first version: any increase counted. A worker that
    // emits one beat and then hangs is the exact shape of a lane that survived
    // its parent and stopped authoring — the failure this drill exists to catch.
    const oneBeat = readOutcome({ shape: 'files', alive: true, beatsBefore: 9, beatsAfter: 10, ...full })
    expect(oneBeat.escaped).toBe(false)
    expect(oneBeat.why).toMatch(/one beat and hangs/)
  })

  it('refuses a worker that beat fast and then stopped before the window closed', () => {
    const stopped = readOutcome({
      shape: 'files',
      alive: true,
      beatsBefore: 9,
      beatsAfter: 24,
      observeMs: WINDOW,
      observedUntil: 10_000,
      lastBeatAt: 10_000 - WINDOW, // its last beat fell at the START of the window
    })
    expect(stopped.escaped).toBe(false)
    expect(stopped.why).toMatch(/stopped beating before the window closed/)
  })

  it('names the pipe when the child left its cause in its own log', () => {
    const died = readOutcome({
      shape: 'pipes',
      alive: false,
      beatsBefore: 9,
      beatsAfter: 11,
      lastLine: 'raised: EPIPE',
      ...full,
    })
    expect(died.escaped).toBe(false)
    expect(died.why).toMatch(/pipe whose reader went with the parent/)
  })

  it('does not invent a cause it was not given', () => {
    const died = readOutcome({ shape: 'pipes', alive: false, beatsBefore: 9, beatsAfter: 9, lastLine: 'beat 17', ...full })
    expect(died.why).toMatch(/cause not recorded/)
  })
})

describe('probeAlive', () => {
  const stat = (state) => `4242 (node) ${state} 1 4242 4242 0 -1 4194304 …`

  it('reads a zombie as DEAD, which the signal probe cannot', () => {
    // `kill(pid, 0)` answers true for an exited process still in the table, and
    // a killed worker is exactly the thing that can be left in that state.
    const verdictZ = probeAlive(4242, { readProc: () => stat('Z'), signal: () => true })
    expect(verdictZ.alive).toBe(false)
    expect(verdictZ.how).toMatch(/zombie/)
  })

  it('reads a sleeping or running process as alive', () => {
    for (const state of ['S', 'R', 'D']) {
      expect(probeAlive(4242, { readProc: () => stat(state), signal: () => false }).alive).toBe(true)
    }
  })

  it('parses the state from the RIGHT, so a process name containing ")" cannot shift it', () => {
    const tricky = `4242 (nod)e) Z 1 4242 …`
    expect(probeAlive(4242, { readProc: () => tricky, signal: () => true }).alive).toBe(false)
  })

  it('falls back to the signal probe and SAYS that it cannot see a zombie', () => {
    const fallback = probeAlive(4242, { readProc: () => null, signal: () => true })
    expect(fallback.alive).toBe(true)
    expect(fallback.how).toMatch(/zombie reads as alive/)
  })

  it('is total on a missing pid', () => {
    expect(probeAlive(NaN, { readProc: () => null, signal: () => true }).alive).toBe(false)
  })
})

describe('verdict', () => {
  const outcome = (shape, escaped) =>
    readOutcome({
      shape,
      alive: escaped,
      beatsBefore: 9,
      beatsAfter: escaped ? 24 : 9,
      lastLine: 'raised: EPIPE',
      ...full,
    })

  it('proves the cause only when the two shapes DIFFER', () => {
    const proved = verdict([outcome('pipes', false), outcome('files', true)])
    expect(proved.ok).toBe(true)
    expect(proved.note).toMatch(/the pipe is the binding/)
  })

  it('refuses to conclude when both shapes survived', () => {
    // Measured 22.08.2026: an earlier harness wrapped the parent in `setsid`,
    // the kill missed it, and BOTH shapes survived. Without this reading the run
    // would have read as a pass and the design would have kept the wrong cause.
    const both = verdict([outcome('pipes', true), outcome('files', true)])
    expect(both.ok).toBe(false)
    expect(both.note).toMatch(/inconclusive/)
  })

  it('refuses to conclude when both shapes died', () => {
    const neither = verdict([outcome('pipes', false), outcome('files', false)])
    expect(neither.ok).toBe(false)
    expect(neither.note).toMatch(/inconclusive/)
  })

  it('refuses a run that is missing one of the two shapes', () => {
    expect(verdict([outcome('files', true)]).ok).toBe(false)
    expect(SHAPES).toEqual(['pipes', 'files'])
  })
})
