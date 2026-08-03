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
  classifyDaemonRecord,
  launcherRemedy,
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
