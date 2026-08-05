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
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import {
  GATE_COMMANDS,
  GATE_DELETES,
  PHASES,
  SELF_PATH,
  STALE_MS,
  SUPERVISOR_SIGNALS,
  WATCHDOG_MS,
  classifyState,
  createReopener,
  formatStatus,
  installRecovery,
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

// The recovery call used to LATCH: once per process, then silence. Two ways
// that bit, and both are the failure this script exists to prevent:
//   * the watchdog fires at 4 min on a slow run, the run then fails between
//     init-firewall.sh's DROP policies (line 139) and its allowlist ACCEPT
//     (line 148) — and the reopen that was owed there was a no-op. SEALED.
//   * the likelier one: the rebuild's own verification fails after the ruleset
//     is fully in place, the reopen is swallowed, and `--status` reports "the
//     gate was re-opened, THE FIREWALL IS OFF" over a firewall that is in fact
//     fully restrictive — a false status in the complacent direction.
describe('the recovery call is unlatched', () => {
  const spy = () => {
    const calls = []
    const reopen = createReopener({ open: () => (calls.push('open'), []), record: (line) => calls.push(line) })
    return { calls, reopen }
  }

  it('opens the gate AGAIN on a second call — the once-per-process latch is gone', () => {
    const { calls, reopen } = spy()
    reopen('no success within 240s') // the watchdog
    reopen('the rebuild exited 1') // the failure that follows it
    reopen('supervisor exited without a successful rebuild') // and the exit path
    expect(calls.filter((c) => c === 'open')).toHaveLength(3)
  })

  it('logs a reason with every open, so the log shows each recovery and not just the first', () => {
    const { calls, reopen } = spy()
    reopen('no success within 240s')
    reopen('the rebuild exited 1')
    const lines = calls.filter((c) => c !== 'open')
    expect(lines).toHaveLength(2)
    for (const line of lines) expect(line).toMatch(/THE FIREWALL IS OFF/)
    expect(lines[1]).toContain('the rebuild exited 1')
  })

  it('returns what the gate reported, and never throws on a gate that failed', () => {
    const reopen = createReopener({ open: () => [{ cmd: 'iptables -P OUTPUT ACCEPT', ok: false }], record: () => {} })
    expect(reopen('why')).toEqual([{ cmd: 'iptables -P OUTPUT ACCEPT', ok: false }])
  })
})

// `process.on('exit')` does not fire on a signal. A `pkill -f node`, a container
// stop or an OOM kill of the process group therefore left the child dead
// mid-flush and the gate SHUT — with the supervisor gone, nothing was left to
// re-open it.
describe('installRecovery wires every way out of the supervisor', () => {
  const wire = ({ done = false } = {}) => {
    const handlers = new Map()
    const reopened = []
    const exits = []
    const signalled = []
    installRecovery({
      on: (event, handler) => handlers.set(event, handler),
      exit: (code) => exits.push(code),
      reopen: (why) => reopened.push(why),
      isDone: () => done,
      onSignal: (sig) => signalled.push(sig),
    })
    return { handlers, reopened, exits, signalled }
  }

  it('registers SIGTERM, SIGINT and SIGHUP beside the plain exit', () => {
    const { handlers } = wire()
    expect([...handlers.keys()].sort()).toEqual(['SIGHUP', 'SIGINT', 'SIGTERM', 'exit'])
    expect(SUPERVISOR_SIGNALS).toEqual(['SIGTERM', 'SIGINT', 'SIGHUP'])
  })

  it('opens the gate and exits 0 on each signal, naming which one', () => {
    for (const signal of SUPERVISOR_SIGNALS) {
      const { handlers, reopened, exits, signalled } = wire()
      handlers.get(signal)()
      expect(reopened).toHaveLength(1)
      expect(reopened[0]).toContain(signal)
      expect(signalled).toEqual([signal])
      // exit(0): the supervisor is the rescue, not a status reporter — a
      // non-zero exit here would only make a killed run look like a failure.
      expect(exits).toEqual([0])
    }
  })

  it('still opens the gate on a plain exit', () => {
    const { handlers, reopened } = wire()
    handlers.get('exit')()
    expect(reopened).toEqual(['supervisor exited without a successful rebuild'])
  })

  it('leaves a SUCCESSFUL rebuild sealed — the gate is only forced open when it is owed', () => {
    const { handlers, reopened, exits, signalled } = wire({ done: true })
    handlers.get('exit')()
    handlers.get('SIGTERM')()
    expect(reopened).toEqual([])
    expect(signalled).toEqual([])
    expect(exits).toEqual([0]) // the signal still terminates, it just seals nothing open
  })

  it('opens the gate on a signal that arrives AFTER the watchdog already opened it', () => {
    // The composed shape of the bug: watchdog, then a kill. With the latch in
    // place the second call did nothing at all.
    const opens = []
    const reopen = createReopener({ open: () => (opens.push('open'), []), record: () => {} })
    const handlers = new Map()
    installRecovery({
      on: (e, h) => handlers.set(e, h),
      exit: () => {},
      reopen,
      isDone: () => false,
    })
    reopen('no success within 240s')
    handlers.get('SIGTERM')()
    handlers.get('exit')()
    expect(opens).toHaveLength(3)
  })
})

// `new URL(import.meta.url).pathname` hands back a PERCENT-ENCODED path, so a
// repo under `/work space/` relaunched a file that does not exist — and the
// relaunch is the supervisor, i.e. the half that is supposed to be the recovery.
describe('SELF_PATH — the file the detached supervisor is relaunched from', () => {
  it('is an absolute path to this very script, and it exists', () => {
    expect(isAbsolute(SELF_PATH)).toBe(true)
    expect(SELF_PATH.replace(/\\/g, '/')).toMatch(/\/scripts\/firewall-rebuild\.mjs$/)
    expect(existsSync(SELF_PATH)).toBe(true)
  })
  it('carries no percent-encoding', () => {
    expect(SELF_PATH).not.toMatch(/%[0-9A-Fa-f]{2}/)
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
  // `--open` and the launcher's rescue path wrote no state at all, so the next
  // `--status` answered "no run on record" — a silence that reads like "nothing
  // happened here" over a firewall that is OFF.
  it('reports a bare unseal as an OPEN gate, not as an absence of runs', () => {
    const text = formatStatus({ phase: 'gate-open', gateOpenReason: 'manual --open', updatedAt: now - 2000 }, now)
    expect(text).not.toMatch(/no run on record/)
    expect(text).toMatch(/FIREWALL IS OFF/)
    expect(text).toMatch(/manual --open/)
    expect(text).toMatch(/--run/) // it must leave a way back to a restrictive firewall
  })
  it('reports an unseal whose reason was not recorded without inventing one', () => {
    const text = formatStatus({ phase: 'gate-open', updatedAt: now }, now)
    expect(text).toMatch(/FIREWALL IS OFF/)
    expect(text).not.toMatch(/undefined|\(\)/)
  })

  it('never throws on a malformed record', () => {
    expect(() => formatStatus({ phase: 'running' })).not.toThrow()
    expect(() => formatStatus(undefined)).not.toThrow()
    expect(() => formatStatus({ phase: 'gate-open' })).not.toThrow()
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
