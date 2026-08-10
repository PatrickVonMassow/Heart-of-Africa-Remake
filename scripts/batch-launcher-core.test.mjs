// The Linux launcher's decision core (point 474, user 03.08.2026), pinned.
//
// The witnesses the point names, and the one direction that must never be
// possible: an ARMED verdict granted by a file that proves nothing. A wrong
// "armed" lets a session end where nothing will restart the batch — the failure
// the whole boundary apparatus exists to prevent — while a wrong "unknown" only
// keeps a session working.
import { describe, it, expect } from 'vitest'
import {
  LAUNCHER_DAEMON_NAME,
  LAUNCHER_PID_TOLERANCE_MS,
  LAUNCHER_RECORD_VERSION,
  LAUNCHER_STALE_TICKS,
  LAUNCHER_TASK_NAME,
  WAKE_MIN_GAP_MS,
  WAKE_POLL_MS,
  classifyDaemonRecord,
  launcherRemedy,
  ownershipSignal,
  releaseSpawnDecision,
} from './batch-launcher-core.mjs'
import { classifyLauncherState } from './batch-boundary-core.mjs'

const NOW = 1_785_000_000_000
const TICK_MS = 15 * 60 * 1000

const record = (over = {}) => ({
  v: LAUNCHER_RECORD_VERSION,
  pid: 4242,
  pidStartedAt: NOW - 60_000,
  startedAt: NOW - 60_000,
  lastTickAt: NOW - 30_000,
  tickMs: TICK_MS,
  ...over,
})
const alive = { exists: true, startedAt: NOW - 60_000 }
const classify = (over = {}, probe = alive, now = NOW) =>
  classifyDaemonRecord({ record: record(over), probe, now, tickMs: TICK_MS })

describe('classifyDaemonRecord — the daemon record decides, and only on evidence', () => {
  it('reads a fresh record with a live pid as ready', () => {
    expect(classify()).toBe('ready')
  })

  it('reads a record whose pid is dead as unknown', () => {
    expect(classify({}, { exists: false, startedAt: null })).toBe('unknown')
  })

  it('reads a record older than the tick interval by the margin as unknown', () => {
    const stale = NOW - TICK_MS * LAUNCHER_STALE_TICKS
    expect(classifyDaemonRecord({
      record: record({ startedAt: stale, lastTickAt: stale }),
      probe: alive,
      now: NOW,
      tickMs: TICK_MS,
    })).toBe('unknown')
    // Just inside the margin is still armed — the margin is a margin, not a cliff
    // one slow tick falls off.
    const fresh = NOW - TICK_MS * LAUNCHER_STALE_TICKS + 1000
    expect(classifyDaemonRecord({
      record: record({ startedAt: fresh, lastTickAt: fresh }),
      probe: alive,
      now: NOW,
      tickMs: TICK_MS,
    })).toBe('ready')
  })

  it('reads a missing record as unknown', () => {
    expect(classifyDaemonRecord({ record: null, probe: null, now: NOW, tickMs: TICK_MS })).toBe('unknown')
    expect(classifyDaemonRecord({ record: 'nonsense', probe: null, now: NOW, tickMs: TICK_MS })).toBe('unknown')
    expect(classifyDaemonRecord()).toBe('unknown')
  })

  it('reads a recycled pid as unknown — a live process is not evidence it is OURS', () => {
    expect(classify({}, { exists: true, startedAt: NOW - 60_000 + LAUNCHER_PID_TOLERANCE_MS + 1 })).toBe('unknown')
    // Within the tolerance it is the same process.
    expect(classify({}, { exists: true, startedAt: NOW - 60_000 + LAUNCHER_PID_TOLERANCE_MS })).toBe('ready')
    // A probe that could not read a start time is not evidence of reuse either.
    expect(classify({}, { exists: true, startedAt: null })).toBe('ready')
  })

  it('refuses a record that names a live pid but no start time to check it against', () => {
    // The recycle check is the ONLY thing standing between "some process with this
    // number is alive" and "our daemon is alive". A record that omits the start time
    // skips it, so a freshly stamped record naming any live pid at all — pid 1 does
    // — would read armed on nothing but its own presence.
    expect(classify({ pidStartedAt: undefined })).toBe('unknown')
    expect(classify({ pidStartedAt: null })).toBe('unknown')
    expect(classify({ pidStartedAt: 'a while ago' })).toBe('unknown')
    expect(classify({ pid: 1, pidStartedAt: undefined }, { exists: true, startedAt: null })).toBe('unknown')
  })

  it('reads a deliberately stopped daemon as disabled, not as unreadable', () => {
    expect(classify({ stopped: true }, { exists: false, startedAt: null })).toBe('disabled')
  })

  it('reads a mid-tick daemon as running', () => {
    expect(classify({ tickInFlight: true })).toBe('running')
  })

  it('refuses a record whose schema it does not know', () => {
    expect(classify({ v: LAUNCHER_RECORD_VERSION + 1 })).toBe('unknown')
    expect(classify({ v: undefined })).toBe('unknown')
  })

  it('refuses a record with no pid, no timestamps or no judgeable interval', () => {
    expect(classify({ pid: 0 })).toBe('unknown')
    expect(classify({ startedAt: 0, lastTickAt: 0 })).toBe('unknown')
    expect(classifyDaemonRecord({
      record: record({ tickMs: 0 }),
      probe: alive,
      now: NOW,
      tickMs: undefined,
    })).toBe('unknown')
  })

  it('speaks the vocabulary the Windows probe already maps', () => {
    // The point of one vocabulary: both hosts feed the SAME classifier, so the
    // guard sees one verdict and no second mapping can drift from this one.
    expect(classifyLauncherState('ready')).toBe('armed')
    expect(classifyLauncherState('running')).toBe('armed')
    expect(classifyLauncherState('disabled')).toBe('disabled')
    expect(classifyLauncherState('unknown')).toBe('unknown')
  })
})

describe('launcherRemedy — both hosts, and who can arm each', () => {
  it('names the Scheduled Task and the user on Windows', () => {
    const r = launcherRemedy('win32')
    expect(r.name).toBe(LAUNCHER_TASK_NAME)
    expect(r.byUser).toBe(true)
    expect(r.command).toContain('Enable-ScheduledTask')
    expect(r.how).toContain('elevated')
  })

  it('names the daemon and the session itself elsewhere', () => {
    for (const platform of ['linux', 'darwin']) {
      const r = launcherRemedy(platform)
      expect(r.name).toBe(LAUNCHER_DAEMON_NAME)
      expect(r.byUser).toBe(false)
      expect(r.command).toBe('node scripts/batch-launcher.mjs --start')
      expect(r.how).toContain('no OS scheduler')
    }
  })
})

// --- THE RELEASE TRIGGERS THE SPAWN (point 612) -------------------------------
// MEASURED 10.08.2026: the outgoing session handed over correctly at 13:20 and
// the lock was released; the launcher ticks every 15 minutes and would not have
// looked before 13:31; at 13:28 an unattended window took the free lock, so the
// 13:31 tick correctly found a live owner and spawned nobody. Every part behaved
// as built and the batch stood still for half an hour. A release is an EVENT.
describe('ownershipSignal — who owns the batch, as one comparable string', () => {
  const held = { sessionId: 's1', claimedAt: 5 }
  const alive = { alive: true, reason: 'pid-alive' }

  it('reads a free lock, a held one and every ownership-ENDING verdict', () => {
    expect(ownershipSignal({ lock: null })).toBe('free')
    expect(ownershipSignal({ lock: undefined })).toBe('free')
    expect(ownershipSignal({ lock: held, assessment: alive })).toBe('held:s1:5')
    // The refinement: a handover is not the only way ownership ends, and the
    // signal must not privilege it — an idle lapse and an expired lease are events
    // of exactly the same kind, or they wait out the quarter-hour tick after all.
    for (const reason of ['handed-over', 'idle', 'lease-expired', 'pid-dead', 'declared-wait-stale']) {
      expect(ownershipSignal({ lock: held, assessment: { alive: false, reason } })).toBe(`ended:${reason}`)
    }
  })

  it('a WITHDRAWN and re-marked handover wakes the launcher a second time', () => {
    // handover → withdrawal → handover again. Each step must differ from the one
    // BEFORE it, or the second release would look like a state that never moved.
    const steps = [
      ownershipSignal({ lock: held, assessment: { alive: false, reason: 'handed-over' } }),
      ownershipSignal({ lock: { ...held, claimedAt: 9 }, assessment: alive }),
      ownershipSignal({ lock: { ...held, claimedAt: 9 }, assessment: { alive: false, reason: 'handed-over' } }),
    ]
    expect(steps[0]).not.toBe(steps[1])
    expect(steps[1]).not.toBe(steps[2])
    for (let i = 1; i < steps.length; i++) {
      expect(releaseSpawnDecision({ now: NOW, previous: steps[i - 1], signal: steps[i] }).wake).toBe(i % 2 === 0)
    }
  })

  it('an unreadable lock or a missing verdict is its own answer, never "free"', () => {
    expect(ownershipSignal({ lock: 'junk' })).toBe('unknown')
    expect(ownershipSignal({ lock: held })).toBe('unknown')
    expect(ownershipSignal()).toBe('free')
  })
})

describe('releaseSpawnDecision — cut the sleep short when ownership ENDS', () => {
  const at = (over = {}) => releaseSpawnDecision({ now: NOW, ...over })

  it('wakes when a held lock becomes free, and on EVERY ownership-ending verdict', () => {
    expect(at({ previous: 'held:s1:5', signal: 'free' }).wake).toBe(true)
    for (const reason of ['handed-over', 'idle', 'lease-expired', 'pid-dead']) {
      expect(at({ previous: 'held:s1:5', signal: `ended:${reason}` }).wake, reason).toBe(true)
    }
    expect(at({ previous: 'held:s1:5', signal: 'ended:idle' }).reason).toMatch(/ownership ENDED \(idle\)/)
  })

  it('does NOT wake on a state that merely PERSISTS — a state is not an event', () => {
    // Without this the whole tick would run every five seconds for as long as
    // nobody owns the batch.
    expect(at({ previous: 'free', signal: 'free' }).wake).toBe(false)
    expect(at({ previous: 'ended:idle', signal: 'ended:idle' }).wake).toBe(false)
  })

  it('does not wake on the first observation of a sleep — the tick just ran', () => {
    expect(at({ previous: null, signal: 'free' }).wake).toBe(false)
  })

  it('does not wake when the lock is TAKEN or merely heartbeats', () => {
    expect(at({ previous: 'free', signal: 'held:s2:9' }).wake).toBe(false)
    expect(at({ previous: 'held:s1:5', signal: 'held:s1:9' }).wake).toBe(false)
    expect(at({ previous: 'held:s1:5', signal: 'unknown' }).wake).toBe(false)
  })

  it('STANDS DOWN for a paused batch, like every mechanism here', () => {
    expect(at({ previous: 'held:s1:5', signal: 'free', paused: true }).wake).toBe(false)
    expect(at({ previous: 'held:s1:5', signal: 'free', paused: true }).reason).toMatch(/paused/)
  })

  it('holds a floor between early ticks, so a tick that cannot spawn cannot spin', () => {
    const opts = { previous: 'held:s1:5', signal: 'free', lastWakeAt: NOW - 5000, minGapMs: 60_000 }
    expect(at(opts).wake).toBe(false)
    expect(at({ ...opts, lastWakeAt: NOW - 60_000 }).wake).toBe(true)
    // A daemon that has never woken early is not held back by the floor at all.
    expect(at({ ...opts, lastWakeAt: 0 }).wake).toBe(true)
  })

  it('is total — junk decides nothing', () => {
    expect(releaseSpawnDecision().wake).toBe(false)
    expect(at({ previous: 'held:s1:5', signal: null }).wake).toBe(false)
    expect(at({ previous: 'held:s1:5', signal: '' }).wake).toBe(false)
  })

  it('the poll and the floor are sane against each other and against the tick', () => {
    expect(WAKE_POLL_MS).toBeGreaterThan(0)
    expect(WAKE_POLL_MS).toBeLessThanOrEqual(15_000) // "within seconds"
    expect(WAKE_MIN_GAP_MS).toBeGreaterThan(WAKE_POLL_MS)
    expect(WAKE_MIN_GAP_MS).toBeLessThan(TICK_MS) // else the fast path is no faster
  })
})
