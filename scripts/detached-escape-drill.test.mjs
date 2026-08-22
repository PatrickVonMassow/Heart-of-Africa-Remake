// THE DRILL'S READING, without spawning anything.
//
// The measurement itself takes five seconds and real processes; what has to be
// pinned is how its evidence is READ, because that is where a drill turns into
// a false green. A cross-vendor reading of the first version found two of them:
// a single post-kill beat counted as "still working", and a zombie counted as a
// live process. Both are cases below.
import { describe, it, expect } from 'vitest'
import {
  BEAT_MS,
  DEAD_STATES,
  LIVE_STATES,
  MAX_GAP_BEATS,
  probeAlive,
  readOutcome,
  SHAPES,
  startTicksOf,
  verdict,
} from './detached-escape-drill.mjs'

// A three-second observation window at the fixture's beat period. Times are
// plain milliseconds; the kill is at 0 so every case reads at a glance.
const KILL = 0
const WINDOW = 3000
const beatsEvery = (ms, from = BEAT_MS, until = WINDOW) => {
  const out = []
  for (let t = from; t <= until; t += ms) out.push(t)
  return out
}
const healthy = { killedAt: KILL, observedUntil: WINDOW, beatTimes: beatsEvery(BEAT_MS), beatsBefore: 9 }

describe('readOutcome', () => {
  it('calls it an escape when the process is alive and never went silent', () => {
    const escaped = readOutcome({ shape: 'files', alive: true, ...healthy })
    expect(escaped.escaped).toBe(true)
    expect(escaped.gained).toBe(15)
  })

  it('refuses a single post-kill beat as work', () => {
    const oneBeat = readOutcome({ shape: 'files', alive: true, ...healthy, beatTimes: [BEAT_MS] })
    expect(oneBeat.escaped).toBe(false)
    expect(oneBeat.why).toMatch(/silent for 2800 ms/)
  })

  it('refuses a worker that beat its quota and then hung until the window closed', () => {
    // MEASURED DEFECT of the second version, found by the cross-vendor reading:
    // seven beats in three seconds satisfied a COUNT while the lane hung for the
    // last second. A count cannot see a gap, so the reading measures silence.
    const quotaThenHang = readOutcome({
      shape: 'files',
      alive: true,
      ...healthy,
      beatTimes: beatsEvery(BEAT_MS, BEAT_MS, 2001),
    })
    expect(quotaThenHang.escaped).toBe(false)
    expect(quotaThenHang.maxGap).toBeGreaterThan(BEAT_MS * MAX_GAP_BEATS)
  })

  it('refuses a hang in the MIDDLE, which no last-beat check would catch', () => {
    const gapInside = readOutcome({
      shape: 'files',
      alive: true,
      ...healthy,
      beatTimes: [...beatsEvery(BEAT_MS, BEAT_MS, 600), ...beatsEvery(BEAT_MS, 2200, WINDOW)],
    })
    expect(gapInside.escaped).toBe(false)
    expect(gapInside.maxGap).toBe(1600)
  })

  it('measures the FIRST gap from the kill, so a late start cannot hide', () => {
    const lateStart = readOutcome({
      shape: 'files',
      alive: true,
      ...healthy,
      beatTimes: beatsEvery(BEAT_MS, 1400, WINDOW),
    })
    expect(lateStart.escaped).toBe(false)
    expect(lateStart.maxGap).toBe(1400)
  })

  it('tolerates one skipped beat on a loaded host', () => {
    const jitter = readOutcome({
      shape: 'files',
      alive: true,
      ...healthy,
      beatTimes: beatsEvery(BEAT_MS).filter((t) => t !== 1000),
    })
    expect(jitter.escaped).toBe(true)
  })

  it('refuses an unreadable liveness probe as an escape', () => {
    const undecidable = readOutcome({ shape: 'files', alive: false, unknownLiveness: true, ...healthy })
    expect(undecidable.escaped).toBe(false)
    expect(undecidable.why).toMatch(/liveness could not be established/)
  })

  it('CALIBRATES its tolerance against the run\'s own pre-kill jitter', () => {
    // A fixed 600 ms was a guess about a loaded host. A worker that already
    // paused 500 ms before the kill is allowed the same slack after it, so a
    // slow host does not read as a dead lane.
    const jittery = readOutcome({
      shape: 'files',
      alive: true,
      killedAt: 1000,
      observedUntil: 4000,
      beatTimes: [200, 700, 1200, 1900, 2400, 2900, 3400, 3900],
      beatsBefore: 2,
    })
    expect(jittery.limit).toBe(1000) // twice the worst 500 ms pause before the kill
    expect(jittery.escaped).toBe(true)
  })

  it('calls a host too loaded to measure INCONCLUSIVE rather than green', () => {
    const starved = readOutcome({
      shape: 'files',
      alive: true,
      killedAt: 3000,
      observedUntil: 6000,
      beatTimes: [200, 2800, 3200, 3600, 4000, 4400, 4800, 5200, 5600, 6000],
      beatsBefore: 2,
    })
    expect(starved.unmeasurable).toBe(true)
    expect(starved.escaped).toBe(false)
    expect(starved.why).toMatch(/measures nothing/)
  })

  it('names the pipe when the child left its cause in its own log', () => {
    const died = readOutcome({
      shape: 'pipes',
      alive: false,
      ...healthy,
      beatTimes: [BEAT_MS],
      lastLine: 'raised: EPIPE',
    })
    expect(died.escaped).toBe(false)
    expect(died.why).toMatch(/pipe whose reader went with the parent/)
  })

  it('does not invent a cause it was not given', () => {
    const died = readOutcome({ shape: 'pipes', alive: false, ...healthy, beatTimes: [], lastLine: 'beat 17' })
    expect(died.why).toMatch(/cause not recorded/)
  })
})

describe('probeAlive', () => {
  const stat = (state) => `4242 (node) ${state} 1 4242 4242 0 -1 4194304 …`

  it('reads every DEAD state as dead, not only the zombie', () => {
    // `kill(pid, 0)` answers true for an exited process still in the table, and
    // Z is not the only such state: X and x are the exit states too.
    for (const state of DEAD_STATES) {
      const dead = probeAlive(4242, { readProc: () => stat(state), signal: () => true })
      expect(dead.alive, `state ${state}`).toBe(false)
      expect(dead.how).toMatch(new RegExp(`state ${state}`))
    }
  })

  it('reads a running, sleeping or stopped process as alive', () => {
    for (const state of LIVE_STATES) {
      expect(probeAlive(4242, { readProc: () => stat(state), signal: () => false }).alive, `state ${state}`).toBe(true)
    }
  })

  it('FAILS CLOSED on a state letter it does not know', () => {
    const unknown = probeAlive(4242, { readProc: () => stat('Q'), signal: () => true })
    expect(unknown.alive).toBe(false)
    expect(unknown.how).toMatch(/unrecognised/)
  })

  it('parses the state from the RIGHT, so a process name containing ")" cannot shift it', () => {
    const tricky = `4242 (nod)e) Z 1 4242 …`
    expect(probeAlive(4242, { readProc: () => tricky, signal: () => true }).alive).toBe(false)
  })

  it('FAILS CLOSED when /proc cannot be read but the pid still answers', () => {
    // MEASURED DEFECT of the third version: the fallback returned alive, and
    // `verdict` consumes only that boolean — so a transient read failure greened
    // a corpse. Undecidable is now its own answer and is never an escape.
    const undecidable = probeAlive(4242, { readProc: () => null, signal: () => true })
    expect(undecidable.alive).toBe(false)
    expect(undecidable.unknown).toBe(true)
    expect(undecidable.how).toMatch(/UNKNOWN/)
  })

  it('calls a pid nothing answers for GONE, not undecidable', () => {
    const gone = probeAlive(4242, { readProc: () => null, signal: () => false })
    expect(gone.alive).toBe(false)
    expect(gone.unknown).toBeUndefined()
    expect(gone.how).toMatch(/no such process/)
  })

  it('refuses a RECYCLED pid, because a number is not an identity', () => {
    const spawned = `4242 (node) S 1 4242 4242 0 -1 0 0 0 0 0 1 2 3 4 20 0 1 0 900000 …`
    const other = `4242 (node) S 1 4242 4242 0 -1 0 0 0 0 0 1 2 3 4 20 0 1 0 999999 …`
    expect(startTicksOf(spawned)).toBe(900000)
    const recycled = probeAlive(4242, { startedAt: startTicksOf(spawned), readProc: () => other, signal: () => true })
    expect(recycled.alive).toBe(false)
    expect(recycled.how).toMatch(/recycled/)
    // …and the same process at the same start time is still itself.
    expect(probeAlive(4242, { startedAt: startTicksOf(spawned), readProc: () => spawned }).alive).toBe(true)
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
      killedAt: KILL,
      observedUntil: WINDOW,
      beatTimes: escaped ? beatsEvery(BEAT_MS) : [],
      lastLine: 'raised: EPIPE',
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
