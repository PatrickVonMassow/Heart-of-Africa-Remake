// The pure half of the detached firewall rebuild: mode parsing, the state
// classification `--status` reports from, and the watchdog's deadline
// arithmetic. No case here touches a real firewall — the privileged half is
// deliberately not exercised, which is why the decisions live in pure functions
// at all.
//
// The load-bearing property under test is the FAIL DIRECTION: the gate's command
// set may only ever OPEN. A flush or a DROP policy sneaking in here would turn
// the recovery path into a second way to seal the container.
import { describe, it, expect } from 'vitest'
import {
  GATE_COMMANDS,
  GATE_DELETES,
  PHASES,
  STALE_MS,
  WATCHDOG_MS,
  classifyState,
  formatStatus,
  parseArgs,
  runInFlight,
  watchdogDue,
} from './firewall-rebuild.mjs'

describe('parseArgs', () => {
  it('defaults to the plan — an empty argv must change nothing', () => {
    expect(parseArgs([]).mode).toBe('plan')
    expect(parseArgs(['--verbose']).mode).toBe('plan')
  })
  it('recognises every mode', () => {
    expect(parseArgs(['--run']).mode).toBe('run')
    expect(parseArgs(['--status']).mode).toBe('status')
    expect(parseArgs(['--open']).mode).toBe('open')
    expect(parseArgs(['--supervise']).mode).toBe('supervise')
  })
  it('lets the internal supervise mode win, so a relaunch cannot recurse into --run', () => {
    expect(parseArgs(['--run', '--supervise']).mode).toBe('supervise')
  })
  it('reads --watchdog-ms and --force, and ignores nonsense values', () => {
    expect(parseArgs(['--run', '--watchdog-ms', '5000']).watchdogMs).toBe(5000)
    expect(parseArgs(['--run', '--watchdog-ms', 'soon']).watchdogMs).toBe(WATCHDOG_MS)
    expect(parseArgs(['--run', '--watchdog-ms', '-5']).watchdogMs).toBe(WATCHDOG_MS)
    expect(parseArgs(['--run']).watchdogMs).toBe(WATCHDOG_MS)
    expect(parseArgs(['--run', '--force']).force).toBe(true)
    expect(parseArgs(['--run']).force).toBe(false)
  })
})

describe('the gate only ever opens', () => {
  it('sets every default policy to ACCEPT', () => {
    expect(GATE_COMMANDS).toEqual([
      ['iptables', '-P', 'OUTPUT', 'ACCEPT'],
      ['iptables', '-P', 'INPUT', 'ACCEPT'],
      ['iptables', '-P', 'FORWARD', 'ACCEPT'],
    ])
  })
  it('never flushes, destroys or sets a DROP/REJECT policy', () => {
    for (const cmd of [...GATE_COMMANDS, ...GATE_DELETES]) {
      const line = cmd.join(' ')
      expect(line).not.toMatch(/\s-F\b/)
      expect(line).not.toMatch(/\s-X\b/)
      expect(line).not.toMatch(/\bdestroy\b/)
      expect(line).not.toMatch(/-P\s+\w+\s+(DROP|REJECT)/)
    }
  })
  it('strips blanket blocks by DELETING them, so a still-running rebuild keeps its own rules', () => {
    expect(GATE_DELETES.every((c) => c.includes('-D'))).toBe(true)
    // the exact rule init-firewall.sh appends last is covered verbatim
    expect(GATE_DELETES).toContainEqual([
      'iptables',
      '-D',
      'OUTPUT',
      '-j',
      'REJECT',
      '--reject-with',
      'icmp-admin-prohibited',
    ])
  })
})

describe('classifyState', () => {
  const now = 1_000_000_000
  it('calls a missing, empty or malformed record idle', () => {
    for (const s of [null, undefined, {}, 'nope', 42, { phase: 'nonsense' }]) {
      expect(classifyState(s, now).phase).toBe('idle')
    }
  })
  it('reports a fresh running record as running', () => {
    const c = classifyState({ phase: 'running', updatedAt: now - 5000 }, now)
    expect(c.phase).toBe('running')
    expect(c.stale).toBe(false)
    expect(c.ageMs).toBe(5000)
  })
  it('marks a record past the stale bar — a dead supervisor writes nothing more', () => {
    const c = classifyState({ phase: 'running', updatedAt: now - STALE_MS - 1 }, now)
    expect(c.phase).toBe('running')
    expect(c.stale).toBe(true)
  })
  it('never reports a negative age when a clock jumped backwards', () => {
    expect(classifyState({ phase: 'ok', updatedAt: now + 60_000 }, now).ageMs).toBe(0)
  })
  it('carries ok, failed and watchdog-opened through', () => {
    for (const phase of ['ok', 'failed', 'watchdog-opened']) {
      expect(classifyState({ phase, updatedAt: now }, now).phase).toBe(phase)
    }
  })
})

describe('runInFlight', () => {
  const now = 2_000_000
  it('is true only for a fresh running record', () => {
    expect(runInFlight({ phase: 'running', updatedAt: now - 1000 }, now)).toBe(true)
    expect(runInFlight({ phase: 'running', updatedAt: now - STALE_MS - 1 }, now)).toBe(false)
    expect(runInFlight({ phase: 'ok', updatedAt: now }, now)).toBe(false)
    expect(runInFlight({ phase: 'failed', updatedAt: now }, now)).toBe(false)
    expect(runInFlight(null, now)).toBe(false)
  })
})

describe('watchdogDue', () => {
  it('does not fire before the deadline', () => {
    expect(watchdogDue({ phase: 'running', startedAt: 0, now: WATCHDOG_MS - 1 })).toBe(false)
  })
  it('fires exactly at the deadline and after it', () => {
    expect(watchdogDue({ phase: 'running', startedAt: 0, now: WATCHDOG_MS })).toBe(true)
    expect(watchdogDue({ phase: 'running', startedAt: 0, now: WATCHDOG_MS * 3 })).toBe(true)
  })
  it('never fires on a run that already succeeded', () => {
    expect(watchdogDue({ phase: 'ok', startedAt: 0, now: WATCHDOG_MS * 10 })).toBe(false)
  })
  it('fires only once — an already-opened gate is not re-opened on the next tick', () => {
    expect(watchdogDue({ phase: 'watchdog-opened', startedAt: 0, now: WATCHDOG_MS * 10 })).toBe(false)
  })
  it('still fires on a failed run whose recovery is owed', () => {
    expect(watchdogDue({ phase: 'failed', startedAt: 0, now: WATCHDOG_MS })).toBe(true)
  })
  it('honours a custom deadline and a missing startedAt', () => {
    expect(watchdogDue({ phase: 'running', startedAt: 0, now: 500, watchdogMs: 400 })).toBe(true)
    expect(watchdogDue({ now: 10, watchdogMs: 5 })).toBe(true)
    expect(watchdogDue({})).toBe(true) // no startedAt: the epoch is long past — recover, don't wait
  })
})

describe('formatStatus', () => {
  const now = 5_000_000
  it('says so plainly when there is no run on record', () => {
    expect(formatStatus(null, now)).toMatch(/no run on record/)
  })
  it('reports a live run as running', () => {
    expect(formatStatus({ phase: 'running', updatedAt: now - 3000 }, now)).toMatch(/RUNNING for 3s/)
  })
  it('reports an abandoned run and says the container is reachable', () => {
    const text = formatStatus({ phase: 'running', updatedAt: now - STALE_MS - 1 }, now)
    expect(text).toMatch(/never reported back/)
    expect(text).toMatch(/reachable/)
  })
  it('reports success as the firewall being up', () => {
    expect(formatStatus({ phase: 'ok', updatedAt: now }, now)).toMatch(/SUCCEEDED/)
  })
  it('shouts that the firewall is OFF after a failure or a watchdog trip', () => {
    const failed = formatStatus({ phase: 'failed', exitCode: 1, updatedAt: now }, now)
    expect(failed).toMatch(/FAILED/)
    expect(failed).toMatch(/FIREWALL IS OFF/)
    const tripped = formatStatus({ phase: 'watchdog-opened', updatedAt: now }, now)
    expect(tripped).toMatch(/WATCHDOG/)
    expect(tripped).toMatch(/FIREWALL IS OFF/)
  })
  it('never throws on a malformed record', () => {
    expect(() => formatStatus({ phase: 'running' })).not.toThrow()
    expect(() => formatStatus(undefined)).not.toThrow()
  })
})

describe('constants', () => {
  it('knows every phase formatStatus handles', () => {
    for (const phase of PHASES) expect(formatStatus({ phase, updatedAt: Date.now() })).not.toMatch(/unknown state/)
  })
  it('keeps the watchdog well under a session-length wait but over a healthy run', () => {
    expect(WATCHDOG_MS).toBeGreaterThan(60_000)
    expect(WATCHDOG_MS).toBeLessThan(STALE_MS)
  })
})
