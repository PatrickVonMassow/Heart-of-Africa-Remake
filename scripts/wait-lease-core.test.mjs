import { describe, expect, it } from 'vitest'
import {
  HUNG_EXPECTATION_FACTOR,
  LEASE_SETTLE_MS,
  WAIT_EXPECTATION_FLOOR_MS,
  WAIT_LEASE_CAP_MS,
  acquireWaitLease,
  concurrentWaitAlarm,
  leaseIsLive,
  normaliseRegistry,
  releaseWaitLease,
  runIdFromLog,
  waitThresholds,
  waitTimeoutDecision,
} from './wait-lease-core.mjs'

const T0 = 1_800_000_000_000
const alive = () => true
const dead = () => false

const lease = (over = {}) => ({
  sessionId: 'owner',
  runId: '2026-09-03T00-10-00-000-large',
  pid: 4242,
  startedAt: T0,
  subject: 'verify large',
  ...over,
})

const registryOf = (...leases) => ({ v: 1, leases })

describe('runIdFromLog (union entry U13)', () => {
  it('reduces a log path and its record path to one identity', () => {
    expect(runIdFromLog('local/verify-logs/2026-09-03T00-10-00-000-large.log')).toBe('2026-09-03T00-10-00-000-large')
    expect(runIdFromLog('/abs/local/verify-logs/2026-09-03T00-10-00-000-large.log.run.json'))
      .toBe('2026-09-03T00-10-00-000-large')
  })

  it('refuses an empty token rather than inventing one', () => {
    expect(runIdFromLog('')).toBeNull()
    expect(runIdFromLog(null)).toBeNull()
    expect(runIdFromLog('   ')).toBeNull()
  })
})

describe('normaliseRegistry', () => {
  it('drops entries that can neither be attached to nor killed', () => {
    const { leases } = normaliseRegistry(registryOf(lease(), { sessionId: 'owner' }, lease({ pid: 0 })))
    expect(leases).toHaveLength(1)
    expect(leases[0].pid).toBe(4242)
  })

  it('keeps one lease per identity even if the file carries duplicates', () => {
    const { leases } = normaliseRegistry(registryOf(lease(), lease({ pid: 99 })))
    expect(leases).toHaveLength(1)
    expect(leases[0].pid).toBe(4242)
  })
})

describe('leaseIsLive', () => {
  it('releases the lease of a writer that is gone', () => {
    const verdict = leaseIsLive(normaliseRegistry(registryOf(lease())).leases[0], {
      now: T0 + LEASE_SETTLE_MS + 1,
      probePid: dead,
    })
    expect(verdict).toEqual({ live: false, reason: 'writer-gone' })
  })

  it('keeps a lease alive while the probe cannot see', () => {
    const verdict = leaseIsLive(normaliseRegistry(registryOf(lease())).leases[0], {
      now: T0 + 60_000,
      probePid: () => null,
    })
    expect(verdict.live).toBe(true)
    expect(verdict.reason).toBe('writer-unknown')
  })

  it('releases the lease of a run that has reached a terminal status', () => {
    const verdict = leaseIsLive(normaliseRegistry(registryOf(lease())).leases[0], {
      now: T0 + 60_000,
      probePid: alive,
      runTerminal: () => true,
    })
    expect(verdict).toEqual({ live: false, reason: 'run-terminal' })
  })
})

describe('acquireWaitLease (union entry U11)', () => {
  it('attaches to the existing receipt instead of spawning a second waiter', () => {
    const before = registryOf(lease())
    const decision = acquireWaitLease({
      registry: before,
      request: lease({ pid: 5555 }),
      now: T0 + 600_000,
      probePid: alive,
    })
    expect(decision.verdict).toBe('attach')
    expect(decision.terminate).toEqual([])
    expect(decision.lease.pid).toBe(4242)
    expect(decision.registry.leases).toHaveLength(1)
  })

  it('replaces and names for termination a wait the session has moved on from', () => {
    const decision = acquireWaitLease({
      registry: registryOf(lease()),
      request: lease({ runId: '2026-09-03T00-40-00-000-docs', pid: 7777, startedAt: T0 + 600_000 }),
      now: T0 + 600_000,
      probePid: alive,
    })
    expect(decision.verdict).toBe('replace')
    expect(decision.terminate).toEqual([
      { pid: 4242, pidStartedAt: null, runId: '2026-09-03T00-10-00-000-large', sessionId: 'owner' },
    ])
    expect(decision.registry.leases.map((l) => l.pid)).toEqual([7777])
  })

  it('leaves another session its own wait', () => {
    const decision = acquireWaitLease({
      registry: registryOf(lease({ sessionId: 'other' })),
      request: lease({ pid: 7777 }),
      now: T0 + 60_000,
      probePid: alive,
    })
    expect(decision.verdict).toBe('acquire')
    expect(decision.terminate).toEqual([])
    expect(decision.registry.leases.map((l) => l.sessionId)).toEqual(['other', 'owner'])
  })

  it('reaps a dead writer first, so a stale lease never blocks a real wait', () => {
    const decision = acquireWaitLease({
      registry: registryOf(lease({ pid: 1761118 })),
      request: lease({ runId: '2026-09-03T00-40-00-000-docs', pid: 7777, startedAt: T0 + 600_000 }),
      now: T0 + 600_000,
      probePid: dead,
    })
    expect(decision.verdict).toBe('acquire')
    expect(decision.released.map((r) => r.reason)).toEqual(['writer-gone'])
  })

  it('refuses a request that carries no identity', () => {
    const decision = acquireWaitLease({ registry: registryOf(), request: { sessionId: 'owner' } })
    expect(decision.verdict).toBe('invalid')
    expect(decision.registry.leases).toEqual([])
  })

  it('yields one owner and one cleanup when ten waiters acquire in sequence', () => {
    // The incident's shape: ten wake-ups, ten spawns. Each acquire is applied to
    // the registry the previous one produced, exactly as ten real processes
    // would see it.
    let registry = registryOf()
    const terminated = []
    for (let i = 0; i < 10; i += 1) {
      const decision = acquireWaitLease({
        registry,
        request: lease({ pid: 5000 + i, startedAt: T0 + i * 600_000 }),
        now: T0 + i * 600_000,
        probePid: alive,
      })
      terminated.push(...decision.terminate)
      registry = decision.registry
      if (i > 0) expect(decision.verdict).toBe('attach')
    }
    expect(registry.leases).toHaveLength(1)
    expect(registry.leases[0].pid).toBe(5000)
    expect(terminated).toEqual([])
  })
})

describe('releaseWaitLease', () => {
  it('removes exactly the named lease', () => {
    const result = releaseWaitLease({
      registry: registryOf(lease(), lease({ sessionId: 'other', pid: 9 })),
      sessionId: 'owner',
      runId: '2026-09-03T00-10-00-000-large',
      now: T0 + 60_000,
      probePid: alive,
    })
    expect(result.found).toBe(true)
    expect(result.registry.leases.map((l) => l.sessionId)).toEqual(['other'])
  })

  it('reports an absent lease rather than failing', () => {
    const result = releaseWaitLease({ registry: registryOf(), sessionId: 'owner', runId: 'x' })
    expect(result.found).toBe(false)
  })
})

describe('concurrentWaitAlarm (union entry U11)', () => {
  it('raises the alarm the incident could not see', () => {
    const leases = Array.from({ length: 10 }, (_, i) => lease({ runId: `run-${i}`, pid: 5000 + i }))
    const alarm = concurrentWaitAlarm({ registry: registryOf(...leases), now: T0 + 60_000, probePid: alive })
    expect(alarm.alarm).toBe(true)
    expect(alarm.offenders[0]).toMatchObject({ sessionId: 'owner', count: 10 })
  })

  it('stays quiet for one wait per session', () => {
    const alarm = concurrentWaitAlarm({
      registry: registryOf(lease(), lease({ sessionId: 'other', runId: 'run-b', pid: 6 })),
      now: T0 + 60_000,
      probePid: alive,
    })
    expect(alarm).toEqual({ alarm: false, offenders: [] })
  })

  it('does not count dead watchers, only live ones', () => {
    const leases = Array.from({ length: 3 }, (_, i) => lease({ runId: `run-${i}`, pid: 5000 + i }))
    const alarm = concurrentWaitAlarm({
      registry: registryOf(...leases),
      now: T0 + LEASE_SETTLE_MS + 1,
      probePid: dead,
    })
    expect(alarm.alarm).toBe(false)
  })
})

describe('waitThresholds (union entry U12)', () => {
  it('derives both marks from the run estimate', () => {
    const { deadlineAt, hungAt, expectationMs } = waitThresholds({ startedAt: T0, expectedRuntimeMs: 20 * 60_000 })
    expect(expectationMs).toBe(20 * 60_000)
    expect(deadlineAt).toBe(T0 + 20 * 60_000)
    expect(hungAt).toBe(T0 + 20 * 60_000 * HUNG_EXPECTATION_FACTOR)
  })

  it('applies the floor when nothing has been measured', () => {
    const { deadlineAt } = waitThresholds({ startedAt: T0, expectedRuntimeMs: 0 })
    expect(deadlineAt).toBe(T0 + WAIT_EXPECTATION_FLOOR_MS)
  })

  it('caps an absurd estimate, so no wait can buy unlimited silence', () => {
    const { deadlineAt, hungAt } = waitThresholds({ startedAt: T0, expectedRuntimeMs: 99 * 60 * 60_000 })
    expect(deadlineAt).toBe(T0 + WAIT_LEASE_CAP_MS)
    expect(hungAt).toBe(T0 + WAIT_LEASE_CAP_MS)
  })
})

describe('waitTimeoutDecision (union entry U12)', () => {
  const bounded = () => {
    const { deadlineAt, hungAt } = waitThresholds({ startedAt: T0, expectedRuntimeMs: 20 * 60_000 })
    return lease({ deadlineAt, hungAt })
  }

  it('says nothing while the run is inside its estimate', () => {
    const decision = waitTimeoutDecision({ lease: bounded(), now: T0 + 60_000 })
    expect(decision.state).toBe('running')
    expect(decision.events).toEqual([])
    expect(decision.recovery).toBeNull()
  })

  it('journals one overdue event at the deadline and no recovery yet', () => {
    const decision = waitTimeoutDecision({ lease: bounded(), now: T0 + 21 * 60_000 })
    expect(decision.state).toBe('overdue')
    expect(decision.events.map((e) => e.cause)).toEqual(['wait-deadline-crossed'])
    expect(decision.recovery).toBeNull()
    expect(decision.lease.timeoutReportedAt).toBe(T0 + 21 * 60_000)
  })

  it('asks for recovery exactly once at the hung mark', () => {
    const first = waitTimeoutDecision({ lease: bounded(), now: T0 + 51 * 60_000 })
    expect(first.state).toBe('hung')
    expect(first.recovery).toMatchObject({ reason: 'verification-wait-hung', runId: bounded().runId })
    const second = waitTimeoutDecision({ lease: first.lease, now: T0 + 52 * 60_000 })
    expect(second.state).toBe('hung')
    expect(second.events).toEqual([])
    expect(second.recovery).toBeNull()
  })

  it('reports an unknown lease instead of guessing a state', () => {
    expect(waitTimeoutDecision({ lease: { sessionId: 'owner' } })).toEqual({
      state: 'unknown', events: [], recovery: null, lease: null,
    })
  })
})
