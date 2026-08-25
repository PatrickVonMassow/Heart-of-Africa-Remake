// THE DRILL'S READING — and, at the end, THE DRILL ITSELF.
//
// Most cases pin how the evidence is READ, without spawning anything, because
// the reading is where a drill turns into a false green: a cross-vendor
// reading of the first version found a single post-kill beat counted as
// "still working" and a zombie counted as a live process. But a reading-only
// suite lets the MEASUREMENT rot while every case stays green — the group
// kill, the pipe's EPIPE, the descriptor escape, the pid capture and the
// cleanup are process behaviour no fixture exercises (cross-vendor review of
// point 834, H6) — so the last case runs the real drill, processes, kill and
// all.
import { describe, it, expect } from 'vitest'
import {
  BEAT_MS,
  DEAD_STATES,
  LIVE_STATES,
  labelFor,
  MAX_GAP_BEATS,
  MIN_BASELINE_BEATS,
  probeAlive,
  reap,
  runDrill,
  signalState,
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
// The observation begins BEFORE the kill: a baseline of beats is what the
// tolerance is calibrated on, so every fixture that expects a verdict carries one.
const BASELINE = beatsEvery(BEAT_MS, -1400, -BEAT_MS)
const healthy = {
  startedObserving: -1600,
  killedAt: KILL,
  observedUntil: WINDOW,
  beatTimes: [...BASELINE, ...beatsEvery(BEAT_MS)],
  beatsBefore: BASELINE.length,
}

describe('readOutcome', () => {
  it('calls it an escape when the process is alive and never went silent', () => {
    const escaped = readOutcome({ shape: 'files', alive: true, ...healthy })
    expect(escaped.escaped).toBe(true)
    expect(escaped.gained).toBe(15)
  })

  it('refuses a single post-kill beat as work', () => {
    const oneBeat = readOutcome({ shape: 'files', alive: true, ...healthy, beatTimes: [...BASELINE, BEAT_MS] })
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
      beatTimes: [...BASELINE, ...beatsEvery(BEAT_MS, BEAT_MS, 2001)],
    })
    expect(quotaThenHang.escaped).toBe(false)
    // …and for the RIGHT reason: the baseline is intact, so this is a hang and
    // not an unmeasurable host.
    expect(quotaThenHang.unmeasurable).toBe(false)
    expect(quotaThenHang.maxGap).toBeGreaterThan(BEAT_MS * MAX_GAP_BEATS)
  })

  it('refuses a hang in the MIDDLE, which no last-beat check would catch', () => {
    const gapInside = readOutcome({
      shape: 'files',
      alive: true,
      ...healthy,
      beatTimes: [...BASELINE, ...beatsEvery(BEAT_MS, BEAT_MS, 600), ...beatsEvery(BEAT_MS, 2200, WINDOW)],
    })
    expect(gapInside.escaped).toBe(false)
    expect(gapInside.unmeasurable).toBe(false)
    expect(gapInside.maxGap).toBe(1600)
  })

  it('measures the FIRST gap from the kill, so a late start cannot hide', () => {
    const lateStart = readOutcome({
      shape: 'files',
      alive: true,
      ...healthy,
      beatTimes: [...BASELINE, ...beatsEvery(BEAT_MS, 1400, WINDOW)],
    })
    expect(lateStart.escaped).toBe(false)
    expect(lateStart.unmeasurable).toBe(false)
    expect(lateStart.maxGap).toBe(1400)
  })

  it('tolerates one skipped beat on a loaded host', () => {
    const jitter = readOutcome({
      shape: 'files',
      alive: true,
      ...healthy,
      beatTimes: [...BASELINE, ...beatsEvery(BEAT_MS).filter((t) => t !== 1000)],
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
      startedObserving: 0,
      killedAt: 2500,
      observedUntil: 5500,
      // Five baseline beats whose worst pause is 500 ms, then a post-kill run
      // that pauses 900 ms — inside twice the baseline, outside the 600 ms floor.
      beatTimes: [500, 1000, 1500, 2000, 2500, 3400, 3900, 4400, 4900, 5400],
      beatsBefore: 5,
    })
    expect(jittery.limit).toBe(1000)
    expect(jittery.escaped).toBe(true)
  })

  it('calls a host too loaded to measure INCONCLUSIVE rather than green', () => {
    const starved = readOutcome({
      shape: 'files',
      alive: true,
      startedObserving: 0,
      killedAt: 3000,
      observedUntil: 6000,
      // Six baseline beats, but one 1800 ms hole among them: the host was
      // already starving before the kill, so nothing after it can be attributed.
      beatTimes: [200, 400, 600, 800, 1000, 2800, 3200, 3600, 4000, 4400, 4800, 5200, 5600, 6000],
      beatsBefore: 6,
    })
    expect(starved.unmeasurable).toBe(true)
    expect(starved.escaped).toBe(false)
    expect(starved.why).toMatch(/measures nothing/)
  })

  it('counts the EDGES of the baseline window, not only the gaps between beats', () => {
    // A worker whose first beat came late, or that fell silent just before the
    // kill, was invisible to a between-beats measurement — and those are the two
    // shapes of starvation that matter most here.
    const lateFirstBeat = readOutcome({
      shape: 'files',
      alive: true,
      startedObserving: 0,
      killedAt: 3000,
      observedUntil: 6000,
      beatTimes: [2000, 2200, 2400, 2600, 2800, 3200, 3400, 3600, 3800, 4000, 4200],
      beatsBefore: 5,
    })
    expect(lateFirstBeat.jitter).toBe(2000)
    expect(lateFirstBeat.unmeasurable).toBe(true)

    // …and the TRAILING edge: beats that stop well before the kill.
    const silentBeforeKill = readOutcome({
      shape: 'files',
      alive: true,
      startedObserving: 0,
      killedAt: 3000,
      observedUntil: 6000,
      beatTimes: [200, 400, 600, 800, 1000, 3200, 3400, 3600, 3800, 4000, 4200],
      beatsBefore: 5,
    })
    expect(silentBeforeKill.jitter).toBe(2000)
    expect(silentBeforeKill.unmeasurable).toBe(true)
  })

  it('lets a definite death stand even when the baseline was unmeasurable', () => {
    // A corpse is a corpse whatever the host was doing; only a POSITIVE verdict
    // needs a baseline. Without this the reading of the pipes shape would have
    // depended on machine load.
    const deadOnBadHost = readOutcome({
      shape: 'pipes',
      alive: false,
      startedObserving: 0,
      killedAt: 3000,
      observedUntil: 6000,
      beatTimes: [2900],
      beatsBefore: 1,
      lastLine: 'raised: EPIPE',
    })
    expect(deadOnBadHost.unmeasurable).toBe(true)
    expect(deadOnBadHost.dead).toBe(true)
    expect(deadOnBadHost.why).toMatch(/pipe whose reader went with the parent/)
  })

  it('calls a settling window with almost no beats unmeasurable, not a clean baseline', () => {
    const thin = readOutcome({
      shape: 'files',
      alive: true,
      startedObserving: -400,
      killedAt: KILL,
      beatTimes: [-200, ...beatsEvery(BEAT_MS)],
      observedUntil: WINDOW,
      beatsBefore: 1,
    })
    expect(thin.unmeasurable).toBe(true)
    expect(thin.why).toMatch(/too few for a baseline/)
    expect(MIN_BASELINE_BEATS).toBeGreaterThan(1)
  })

  it('names the pipe when the child left its cause in its own log', () => {
    const died = readOutcome({
      shape: 'pipes',
      alive: false,
      ...healthy,
      beatTimes: [...BASELINE, BEAT_MS],
      lastLine: 'raised: EPIPE',
    })
    expect(died.escaped).toBe(false)
    expect(died.why).toMatch(/pipe whose reader went with the parent/)
    expect(died.pipeCause).toBe(true)
  })

  it('does not invent a cause it was not given', () => {
    const died = readOutcome({ shape: 'pipes', alive: false, ...healthy, beatTimes: BASELINE, lastLine: 'beat 17' })
    expect(died.why).toMatch(/cause not recorded/)
    expect(died.pipeCause).toBe(false)
  })

  it('never attributes the pipe to a worker that is not even dead', () => {
    // `pipeCause` is a fact about a DEATH: an EPIPE string in the log of a
    // live or unprobeable worker attributes nothing.
    const alive = readOutcome({ shape: 'pipes', alive: true, ...healthy, lastLine: 'raised: EPIPE' })
    expect(alive.pipeCause).toBe(false)
    const unknown = readOutcome({ shape: 'pipes', alive: false, unknownLiveness: true, ...healthy, lastLine: 'raised: EPIPE' })
    expect(unknown.pipeCause).toBe(false)
  })
})

describe('probeAlive', () => {
  const stat = (state) => `4242 (node) ${state} 1 4242 4242 0 -1 4194304 …`

  it('reads every DEAD state as dead, not only the zombie', () => {
    // `kill(pid, 0)` answers true for an exited process still in the table, and
    // Z is not the only such state: X and x are the exit states too.
    for (const state of DEAD_STATES) {
      const dead = probeAlive(4242, { readProc: () => stat(state), signal: () => 'exists' })
      expect(dead.alive, `state ${state}`).toBe(false)
      expect(dead.how).toMatch(new RegExp(`state ${state}`))
    }
  })

  it('reads a running, sleeping or stopped process as alive', () => {
    for (const state of LIVE_STATES) {
      expect(probeAlive(4242, { readProc: () => stat(state), signal: () => 'gone' }).alive, `state ${state}`).toBe(true)
    }
  })

  it('FAILS CLOSED on a state letter it does not know, and marks it UNCERTAIN', () => {
    const unknown = probeAlive(4242, { readProc: () => stat('Q'), signal: () => 'exists' })
    expect(unknown.alive).toBe(false)
    expect(unknown.how).toMatch(/unrecognised/)
    // Without the flag, `reap` fell through to silence for a state it had
    // OBSERVED and could not classify — which its contract forbids.
    expect(unknown.unknown).toBe(true)
    const reads = [{ alive: true, how: '/proc state S' }, ...Array(6).fill(null).map(() => probeAlive(4242, { readProc: () => stat('Q'), signal: () => 'exists' }))]
    expect(reap(4242, 900000, { probe: () => reads.shift(), kill: () => {}, settle: () => {} })).toMatch(
      /state could not be read/,
    )
  })

  it('parses the state from the RIGHT, so a process name containing ")" cannot shift it', () => {
    const tricky = `4242 (nod)e) Z 1 4242 …`
    expect(probeAlive(4242, { readProc: () => tricky, signal: () => 'exists' }).alive).toBe(false)
  })

  it('FAILS CLOSED when /proc cannot be read but the pid still answers', () => {
    // MEASURED DEFECT of the third version: the fallback returned alive, and
    // `verdict` consumes only that boolean — so a transient read failure greened
    // a corpse. Undecidable is now its own answer and is never an escape.
    const undecidable = probeAlive(4242, { readProc: () => null, signal: () => 'exists' })
    expect(undecidable.alive).toBe(false)
    expect(undecidable.unknown).toBe(true)
    expect(undecidable.how).toMatch(/UNKNOWN/)
  })

  it('calls a pid nothing answers for GONE, not undecidable', () => {
    const gone = probeAlive(4242, { readProc: () => null, signal: () => 'gone' })
    expect(gone.alive).toBe(false)
    expect(gone.unknown).toBeUndefined()
    expect(gone.how).toMatch(/no such process/)
  })

  it('keeps a pid it may not signal UNDECIDED rather than gone', () => {
    // EPERM says the process EXISTS and is not ours to signal. Folding it into
    // "gone" would report a live foreign process as dead.
    const forbidden = probeAlive(4242, { readProc: () => null, signal: () => 'exists' })
    expect(forbidden.unknown).toBe(true)
    const unclassified = probeAlive(4242, { readProc: () => null, signal: () => 'unknown' })
    expect(unclassified.unknown).toBe(true)
    expect(unclassified.how).toMatch(/unclassified/)
  })

  it('classifies the real signal probe: this process exists, a free number is gone', () => {
    expect(signalState(process.pid)).toBe('exists')
    expect(signalState(2 ** 30)).toBe('gone')
  })

  it('classifies EPERM as EXISTS, which a bare catch would have called gone', () => {
    // The branch itself, not a hand-written answer: a process we may not signal
    // is a process that IS there, and folding it into "gone" reports a live
    // foreign worker as dead.
    const raise = (code) => () => {
      const err = new Error(code)
      err.code = code
      throw err
    }
    expect(signalState(1, raise('EPERM'))).toBe('exists')
    expect(signalState(1, raise('ESRCH'))).toBe('gone')
    expect(signalState(1, raise('EINVAL'))).toBe('unknown')
    expect(signalState(1, () => undefined)).toBe('exists')
  })

  it('refuses to answer when NO spawn-time identity was captured', () => {
    // `startedAt && now && …` silently switched recycling detection off whenever
    // the spawn-time read had failed — which is when it is needed most.
    const nothingCaptured = probeAlive(4242, {
      requireIdentity: true,
      startedAt: 0,
      readProc: () => `4242 (node) S 1 …`,
      signal: () => 'exists',
    })
    expect(nothingCaptured.alive).toBe(false)
    expect(nothingCaptured.unknown).toBe(true)
    expect(nothingCaptured.how).toMatch(/no spawn-time identity/)
  })

  it('refuses a RECYCLED pid, because a number is not an identity', () => {
    const spawned = `4242 (node) S 1 4242 4242 0 -1 0 0 0 0 0 1 2 3 4 20 0 1 0 900000 …`
    const other = `4242 (node) S 1 4242 4242 0 -1 0 0 0 0 0 1 2 3 4 20 0 1 0 999999 …`
    expect(startTicksOf(spawned)).toBe(900000)
    const recycled = probeAlive(4242, { startedAt: startTicksOf(spawned), readProc: () => other, signal: () => 'exists' })
    expect(recycled.alive).toBe(false)
    expect(recycled.how).toMatch(/recycled/)
    // …and the same process at the same start time is still itself.
    expect(probeAlive(4242, { startedAt: startTicksOf(spawned), readProc: () => spawned }).alive).toBe(true)
  })

  it('reads a missing pid as UNKNOWN, never as a corpse', () => {
    // `{ alive: false }` without `unknown` flows through readOutcome into
    // `dead: true` — a definite death verdict for a worker that was never even
    // identified, and one half of a passed drill. Nothing observed, no verdict.
    for (const pid of [NaN, 0, -5, undefined]) {
      const nothing = probeAlive(pid, { readProc: () => null, signal: () => 'gone' })
      expect(nothing.alive, `pid ${pid}`).toBe(false)
      expect(nothing.unknown, `pid ${pid}`).toBe(true)
      expect(nothing.how).toMatch(/nothing was ever observed/)
    }
  })

  it('calls a captured pid nothing answers for DEAD even without spawn-time identity', () => {
    // The identity requirement is ONE-DIRECTIONAL: it stops a live stranger at
    // a recycled number being read as the live worker. It cannot rescue a death
    // verdict — a captured pid that is absent entails the spawned process
    // exited, because recycling itself requires the original to exit first.
    const gone = probeAlive(4242, { requireIdentity: true, startedAt: 0, readProc: () => null, signal: () => 'gone' })
    expect(gone.alive).toBe(false)
    expect(gone.unknown).toBeUndefined()
    expect(gone.how).toMatch(/no such process/)
    // …while the same missing identity keeps a pid that still ANSWERS undecided:
    // that is the direction a recycled number can lie in.
    const answers = probeAlive(4242, { requireIdentity: true, startedAt: 0, readProc: () => null, signal: () => 'exists' })
    expect(answers.alive).toBe(false)
    expect(answers.unknown).toBe(true)
  })
})

describe('reap', () => {
  const identity = (how, alive) => () => ({ alive, how })

  it('NEVER signals pid 0 or 1 — that would hit the caller\'s own process group', () => {
    // `Number.isFinite(0)` was true and `process.kill(0, 'SIGKILL')` signals the
    // caller's group: the batch session running this drill.
    let signalled = 0
    for (const pid of [0, 1, NaN, -5]) {
      const said = reap(pid, 12345, { probe: identity('/proc state R', true), kill: () => (signalled += 1) })
      expect(said).toMatch(/nothing was signalled/)
    }
    expect(signalled).toBe(0)
  })

  it('refuses a pid whose identity does not match, and says so', () => {
    let signalled = 0
    const said = reap(4242, 900000, {
      probe: identity('pid 4242 was recycled — start 999999 is not the 900000 we spawned', false),
      kill: () => (signalled += 1),
    })
    expect(signalled).toBe(0)
    expect(said).toMatch(/not reaped/)
    expect(said).toMatch(/recycled/)
  })

  it('says nothing about a worker that is simply gone — that is one shape\'s normal end', () => {
    expect(reap(4242, 900000, { probe: identity('no such process', false), kill: () => {} })).toBeUndefined()
  })

  it('DETECTS the check-to-signal window it cannot prevent', () => {
    // Node exposes no pidfd, so the interval between reading /proc and sending
    // the signal cannot be closed. It is read again afterwards, and a changed
    // identity is reported rather than passed over.
    const answers = [
      { alive: true, how: '/proc state S' },
      { alive: false, how: 'pid 4242 was recycled — start 999999 is not the 900000 we spawned' },
    ]
    const said = reap(4242, 900000, { probe: () => answers.shift(), kill: () => {}, settle: () => {} })
    expect(said).toMatch(/recycled between the check and the signal/)
  })

  it('reports a signal that FAILED, instead of calling it cleanup', () => {
    // `catch { return undefined }` treated EPERM and every unclassified error as
    // a worker that had gone away by itself, so one this drill left running read
    // as reaped. Only ESRCH is that case.
    const raise = (code) => () => {
      const err = new Error(code)
      err.code = code
      throw err
    }
    expect(reap(4242, 900000, { probe: identity('/proc state S', true), kill: raise('EPERM') })).toMatch(/NOT signalled/)
    expect(reap(4242, 900000, { probe: identity('/proc state S', true), kill: raise('EINVAL') })).toMatch(/NOT signalled/)
    expect(reap(4242, 900000, { probe: identity('/proc state S', true), kill: raise('ESRCH') })).toBeUndefined()
  })

  it('cannot see the branch where the stranger vanishes, and does not pretend to', () => {
    // Original exits, number reused, stranger signalled, stranger gone before the
    // reread: the probe answers "no such process", which is exactly what a clean
    // reap answers. Residual 4 records that this detection is best-effort.
    const answers = [
      { alive: true, how: '/proc state S' },
      { alive: false, how: 'no such process' },
    ]
    expect(reap(4242, 900000, { probe: () => answers.shift(), kill: () => {}, settle: () => {} })).toBeUndefined()
  })

  it('gives an asynchronously delivered signal time, then reports what is still true', () => {
    // Signal delivery is asynchronous, so ONE read proves nothing about a process
    // still in the table — but silence for it covered a live survivor, which is
    // the opposite of what this function promises. It re-reads a bounded number
    // of times and reports whatever remains.
    const settling = [
      { alive: true, how: '/proc state R' },
      { alive: true, how: '/proc state R' },
      { alive: false, how: 'no such process' },
    ]
    expect(reap(4242, 900000, { probe: () => settling.shift(), kill: () => {}, settle: () => {} })).toBeUndefined()

    const stubborn = reap(4242, 900000, {
      probe: identity('/proc state R', true),
      kill: () => {},
      settle: () => {},
    })
    expect(stubborn).toMatch(/still running/)
  })

  it('reports a post-signal probe it could not read, instead of calling it done', () => {
    const reads = [
      { alive: true, how: '/proc state S' },
      { alive: false, unknown: true, how: 'UNKNOWN — /proc unreadable' },
      { alive: false, unknown: true, how: 'UNKNOWN — /proc unreadable' },
      { alive: false, unknown: true, how: 'UNKNOWN — /proc unreadable' },
      { alive: false, unknown: true, how: 'UNKNOWN — /proc unreadable' },
      { alive: false, unknown: true, how: 'UNKNOWN — /proc unreadable' },
    ]
    const unreadable = reap(4242, 900000, { probe: () => reads.shift(), kill: () => {}, settle: () => {} })
    expect(unreadable).toMatch(/state could not be read/)
  })
})

describe('labelFor', () => {
  // THE PRINTED LABEL AND THE PRINTED REASON MUST AGREE. They did not: a run that
  // was both unreadable and badly baselined printed INCONCLUSIVE beside a reason
  // that said liveness was unknown, because the CLI inferred its own precedence.
  it('gives each outcome its own name, in the reading\'s own order', () => {
    expect(labelFor({ escaped: true, dead: false })).toBe('ESCAPED')
    expect(labelFor({ dead: true, unmeasurable: true })).toBe('DIED')
    expect(labelFor({ unknownLiveness: true, unmeasurable: true })).toBe('UNKNOWN')
    expect(labelFor({ unmeasurable: true })).toBe('INCONCLUSIVE')
    expect(labelFor({})).toBe('STALLED')
  })

  it('agrees with the reason readOutcome gave, for every shape of run', () => {
    const cases = [
      [{ shape: 'files', alive: true, ...healthy }, 'ESCAPED', /still working/],
      [{ shape: 'pipes', alive: false, ...healthy, lastLine: 'raised: EPIPE' }, 'DIED', /pipe whose reader/],
      [{ shape: 'files', alive: false, unknownLiveness: true, ...healthy }, 'UNKNOWN', /liveness could not be established/],
      [
        { shape: 'files', alive: true, startedObserving: 0, killedAt: 0, observedUntil: WINDOW, beatTimes: [100, 2000] },
        'INCONCLUSIVE',
        /measures nothing/,
      ],
      [
        { shape: 'files', alive: true, ...healthy, beatTimes: [...BASELINE, ...beatsEvery(BEAT_MS, BEAT_MS, 800)] },
        'STALLED',
        /silent for/,
      ],
    ]
    for (const [input, label, reason] of cases) {
      const out = readOutcome(input)
      expect(labelFor(out), JSON.stringify(input.shape + ' ' + out.why)).toBe(label)
      expect(out.why).toMatch(reason)
    }
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
      startedObserving: -1600,
      beatTimes: escaped ? [...BASELINE, ...beatsEvery(BEAT_MS)] : BASELINE,
      lastLine: 'raised: EPIPE',
    })

  it('proves the cause only when the two shapes DIFFER', () => {
    const proved = verdict([outcome('pipes', false), outcome('files', true)])
    expect(proved.ok).toBe(true)
    expect(proved.note).toMatch(/the pipe is the binding/)
  })

  it('refuses a pipes death that did not record EPIPE — an unexplained death names no cause', () => {
    // The pipes worker dying of anything unrelated (OOM, a crash, an operator)
    // beside an escaped files worker would otherwise still yield "the pipe is
    // the binding" — a verdict built on a death readOutcome itself says it
    // cannot explain.
    const unexplained = readOutcome({
      shape: 'pipes',
      alive: false,
      beatsBefore: 9,
      killedAt: KILL,
      observedUntil: WINDOW,
      startedObserving: -1600,
      beatTimes: BASELINE,
      lastLine: 'beat 17',
    })
    expect(unexplained.dead).toBe(true)
    expect(unexplained.pipeCause).toBe(false)
    const refused = verdict([unexplained, outcome('files', true)])
    expect(refused.ok).toBe(false)
    expect(refused.note).toMatch(/cannot be attributed to the pipe/)
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

  it('a pipes worker NOT PROVEN DEAD proves nothing, however escaped the files worker is', () => {
    const escapedFiles = outcome('files', true)
    // An unreadable liveness probe: not escaped, but not a corpse either.
    const unknown = readOutcome({ shape: 'pipes', alive: false, unknownLiveness: true, beatsBefore: 9, killedAt: KILL, observedUntil: WINDOW, startedObserving: -1600, beatTimes: BASELINE })
    expect(unknown.escaped).toBe(false)
    expect(unknown.dead).toBe(false)
    expect(verdict([unknown, escapedFiles]).ok).toBe(false)
    // A live pipes worker that merely stalled: alive, so not the dead half.
    const stalled = readOutcome({ shape: 'pipes', alive: true, beatsBefore: 9, killedAt: KILL, observedUntil: WINDOW, startedObserving: -1600, beatTimes: BASELINE })
    expect(stalled.escaped).toBe(false)
    expect(stalled.dead).toBe(false)
    expect(verdict([stalled, escapedFiles]).ok).toBe(false)
    // The affirmative pair still proves the cause.
    expect(verdict([outcome('pipes', false), escapedFiles]).ok).toBe(true)
  })
})

describe('runDrill — the real processes, the real kill', () => {
  it('pipes dies of the pipe, files escapes, identities captured, nothing left running', async () => {
    const result = await runDrill()
    const detail = JSON.stringify(result, null, 2)
    const by = Object.fromEntries(result.outcomes.map((o) => [o.shape, o]))
    for (const shape of SHAPES) {
      // The pid and its spawn-time identity were really captured — the probes
      // above prove an uncaptured identity blocks the verdict, so a green run
      // must have read both.
      expect(by[shape]?.pid, detail).toBeGreaterThan(1)
      expect(by[shape]?.identityCaptured, detail).toBe(true)
      // Cleanup left nothing it has to report: no survivor, no failed signal,
      // no unreadable state (reap's contract — undefined means nothing left).
      expect(by[shape]?.leftAlone, detail).toBeUndefined()
    }
    // The measured mechanism itself: the same SIGKILL of the parent's group,
    // and only stdio differing — the pipes child died OF THE PIPE (its own log
    // recorded the EPIPE the closed reader raised), the files child survived
    // and kept working.
    expect(by.pipes.dead, detail).toBe(true)
    expect(by.pipes.pipeCause, detail).toBe(true)
    expect(by.pipes.why, detail).toMatch(/pipe whose reader went with the parent/)
    expect(by.files.escaped, detail).toBe(true)
    expect(result.ok, detail).toBe(true)
    expect(result.note).toMatch(/the pipe is the binding/)
  }, 60_000)
})
