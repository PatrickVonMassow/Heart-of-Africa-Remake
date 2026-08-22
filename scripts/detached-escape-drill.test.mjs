// THE DRILL'S READING, without spawning anything.
//
// The measurement itself takes five seconds and real processes; what has to be
// pinned is how its evidence is READ, because that is where a drill turns into
// a false green. Two readings matter: a survivor that stopped working is not an
// escape, and two shapes that behave alike identify no cause at all.
import { describe, it, expect } from 'vitest'
import { readOutcome, SHAPES, verdict } from './detached-escape-drill.mjs'

describe('readOutcome', () => {
  it('calls it an escape only when the process is alive AND still working', () => {
    const escaped = readOutcome({ shape: 'files', alive: true, beatsBefore: 9, beatsAfter: 24 })
    expect(escaped.escaped).toBe(true)

    // A LIVE PROCESS THAT STOPPED is the failure this drill exists to catch: a
    // supervisor could report the lane as up while nothing is being authored.
    const stalled = readOutcome({ shape: 'files', alive: true, beatsBefore: 9, beatsAfter: 9 })
    expect(stalled.escaped).toBe(false)
    expect(stalled.why).toMatch(/survivor that stopped/)
  })

  it('names the pipe when the child left its cause in its own log', () => {
    const died = readOutcome({ shape: 'pipes', alive: false, beatsBefore: 9, beatsAfter: 11, lastLine: 'died: EPIPE' })
    expect(died.escaped).toBe(false)
    expect(died.why).toMatch(/pipe whose reader went with the parent/)
  })

  it('does not invent a cause it was not given', () => {
    const died = readOutcome({ shape: 'pipes', alive: false, beatsBefore: 9, beatsAfter: 9, lastLine: 'beat 17' })
    expect(died.why).toMatch(/cause not recorded/)
  })
})

describe('verdict', () => {
  const outcome = (shape, escaped) =>
    readOutcome({ shape, alive: escaped, beatsBefore: 9, beatsAfter: escaped ? 24 : 9, lastLine: 'died: EPIPE' })

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
