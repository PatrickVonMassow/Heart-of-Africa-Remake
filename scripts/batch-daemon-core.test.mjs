// THE DAEMON'S DECISIONS (point 834, step 3): the global cap counts stalled
// workers, spawn commands come from the adapter table and never from a request,
// retention prunes bulk but never audit, control answers only its owner, the
// readiness wait honours only its own nonce, and a standing record — live or
// cold — refuses a second daemon.
import { describe, it, expect } from 'vitest'
import { POOL_CAP } from './batch-in-flight-core.mjs'
import {
  DAEMON_POOL_CAP,
  DRAIN_STEPS,
  RETAIN_BULK_MS,
  SLOT_OCCUPYING_STATES,
  WORKER_ADAPTERS,
  activeAttemptCount,
  buildDaemonRecord,
  controlAuthorized,
  mayCreateDaemonRecord,
  mayStartAttempt,
  mintLaunchNonce,
  readinessSatisfied,
  retentionDecision,
  transitionDaemonRecord,
  unknownStateAttempts,
  workerSpawnPlan,
} from './batch-daemon-core.mjs'

const at = (state) => ({ state: { state } })

describe('the global cap (M9)', () => {
  it('mirrors the pool cap the session side already enforces', () => {
    expect(DAEMON_POOL_CAP).toBe(POOL_CAP)
  })

  it('counts running, checkpointing and stalled as occupied; terminal and queued as free', () => {
    expect(SLOT_OCCUPYING_STATES).toEqual(['running', 'checkpointing', 'stalled'])
    const attempts = [at('running'), at('checkpointing'), at('stalled'), at('queued'), at('landed'), at('failed')]
    expect(activeAttemptCount(attempts)).toBe(3)
    expect(mayStartAttempt({ attempts }).ok).toBe(false)
    expect(mayStartAttempt({ attempts: attempts.slice(1) }).ok).toBe(true)
  })

  it('an unknown or corrupt state OCCUPIES its slot — fail closed, and surfaced by name', () => {
    // A record whose state this module cannot read may still be a live
    // authoring process; excluding it from the count would permit a fourth.
    const attempts = [at('running'), at('checkpointing'), { state: { state: 'wedged?' } }]
    expect(activeAttemptCount(attempts)).toBe(3)
    const refused = mayStartAttempt({ attempts })
    expect(refused.ok).toBe(false)
    expect(refused.reason).toMatch(/unreadable states/)
    expect(unknownStateAttempts(attempts)).toHaveLength(1)
    // Missing state entirely is the same uncertainty.
    expect(activeAttemptCount([{}, at('queued')])).toBe(1)
  })
})

describe('workerSpawnPlan — commands from the table, data as data', () => {
  const good = {
    adapter: 'stub',
    pointId: '834',
    branch: 'feat/834-x',
    worktree: '/wt/a',
    attemptDir: '/state/attempts/a1',
    leaseId: 'L1',
  }

  it('builds the detached-agent argv for a known adapter', () => {
    const plan = workerSpawnPlan(good)
    expect(plan.ok).toBe(true)
    expect(plan.args[0]).toBe('scripts/detached-agent.mjs')
    expect(plan.args).toContain('--runner')
    expect(plan.args).toContain('stub')
    expect(Object.keys(WORKER_ADAPTERS)).toEqual(['sol', 'stub'])
  })

  it('refuses an unknown adapter and every request-shaped injection', () => {
    expect(workerSpawnPlan({ ...good, adapter: 'rm -rf' }).ok).toBe(false)
    // Prototype entries are not adapters: a bare table index would answer
    // these with inherited functions and emit '--runner undefined'.
    for (const inherited of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      const res = workerSpawnPlan({ ...good, adapter: inherited })
      expect(res.ok, inherited).toBe(false)
      expect(res.reason, inherited).toMatch(/unknown adapter/)
    }
    expect(workerSpawnPlan({ ...good, pointId: '834; rm' }).ok).toBe(false)
    expect(workerSpawnPlan({ ...good, branch: '--upload-pack=/x' }).ok).toBe(false)
    expect(workerSpawnPlan({ ...good, branch: 'a..b' }).ok).toBe(false)
    expect(workerSpawnPlan({ ...good, worktree: 'relative/path' }).ok).toBe(false)
    expect(workerSpawnPlan({ ...good, leaseId: '../L1' }).ok).toBe(false)
  })
})

describe('retention — audit forever, bulk for a term', () => {
  it('keeps everything for young or non-terminal attempts and for failed ones always', () => {
    const young = { state: { state: 'landed', at: 1000 } }
    expect(retentionDecision({ attempt: young, now: 2000 })).toMatchObject({ keepRecord: true, pruneLog: false, pruneWorktree: false })
    const failed = { state: { state: 'failed', at: 0 } }
    expect(retentionDecision({ attempt: failed, now: RETAIN_BULK_MS * 10 })).toMatchObject({ pruneLog: false, pruneWorktree: false })
    const running = { state: { state: 'running', at: 0 } }
    expect(retentionDecision({ attempt: running, now: RETAIN_BULK_MS * 10 })).toMatchObject({ pruneLog: false })
  })

  it('prunes log and worktree — never the record — for aged landed AND aged cancelled', () => {
    for (const state of ['landed', 'cancelled']) {
      const aged = { state: { state, at: 0 } }
      expect(retentionDecision({ attempt: aged, now: RETAIN_BULK_MS + 1 })).toEqual({ keepRecord: true, pruneLog: true, pruneWorktree: true })
    }
  })

  it('keeps everything when the state carries no usable timestamp', () => {
    expect(retentionDecision({ attempt: { state: { state: 'landed' } }, now: RETAIN_BULK_MS * 10 }).pruneLog).toBe(false)
  })

  it('keeps everything on an unusable clock or interval — pruning is destructive', () => {
    const aged = { state: { state: 'landed', at: 0 } }
    for (const args of [
      { attempt: aged, now: NaN },
      { attempt: aged, now: Infinity },
      { attempt: aged },
      { attempt: aged, now: RETAIN_BULK_MS + 1, retainMs: NaN },
      { attempt: aged, now: RETAIN_BULK_MS + 1, retainMs: 0 },
    ]) {
      expect(retentionDecision(args), JSON.stringify(args)).toEqual({ keepRecord: true, pruneLog: false, pruneWorktree: false })
    }
  })
})

describe('control authorization', () => {
  it('accepts exactly the daemon uid and refuses foreign or unestablished peers', () => {
    expect(controlAuthorized({ peerUid: 1000, daemonUid: 1000 }).ok).toBe(true)
    expect(controlAuthorized({ peerUid: 1001, daemonUid: 1000 }).ok).toBe(false)
    expect(controlAuthorized({ peerUid: null, daemonUid: 1000 }).ok).toBe(false)
    expect(controlAuthorized({ peerUid: 1000 }).ok).toBe(false)
  })
})

describe('the daemon record and its readiness nonce', () => {
  const fields = { pid: 10, pidStartedAt: 5000, generation: 'gen-12345678', fence: 7, launchNonce: 'n'.repeat(32), startedAt: 1000, state: 'starting' }

  it('builds a complete record and refuses an incomplete or malformed one', () => {
    const built = buildDaemonRecord(fields)
    expect(built.ok).toBe(true)
    expect(built.record.v).toBe(1)
    expect(buildDaemonRecord({ ...fields, fence: undefined }).ok).toBe(false)
    expect(buildDaemonRecord({ ...fields, generation: 'short' }).ok).toBe(false)
    expect(buildDaemonRecord({ ...fields, pid: 0 }).ok).toBe(false)
    expect(buildDaemonRecord({ ...fields, state: 'unknown' }).ok).toBe(false)
  })

  it('moves forward through the lifecycle and never returns to running', () => {
    const starting = buildDaemonRecord(fields).record
    const running = transitionDaemonRecord(starting, 'running')
    expect(running).toMatchObject({ ok: true, record: { state: 'running' } })
    const stopping = transitionDaemonRecord(running.record, 'stopping')
    expect(stopping).toMatchObject({ ok: true, record: { state: 'stopping' } })
    expect(transitionDaemonRecord(stopping.record, 'running').ok).toBe(false)
    expect(transitionDaemonRecord(starting, 'stopping').ok).toBe(false)
  })

  it('mints distinct nonces and satisfies readiness only on its own', () => {
    const nonce = mintLaunchNonce()
    expect(nonce).not.toBe(mintLaunchNonce())
    const record = transitionDaemonRecord(buildDaemonRecord({ ...fields, launchNonce: nonce }).record, 'running').record
    expect(readinessSatisfied({ record, expectedNonce: nonce }).ok).toBe(true)
    expect(readinessSatisfied({ record, expectedNonce: 'other' }).ok).toBe(false)
    expect(readinessSatisfied({ record: null, expectedNonce: nonce }).ok).toBe(false)
    expect(readinessSatisfied({ record }).ok).toBe(false)
  })

  it('does not accept the nonce as a record — cross-vendor review of point 834', () => {
    // The nonce says WHOSE record this is; it does not say that a record is
    // there. Matching on it alone, `{ launchNonce }` and nothing else ended the
    // wait, and the launcher served a daemon whose identity it had never read.
    const nonce = mintLaunchNonce()
    expect(readinessSatisfied({ record: { launchNonce: nonce }, expectedNonce: nonce }).ok).toBe(false)
    const starting = buildDaemonRecord({ ...fields, launchNonce: nonce }).record
    expect(readinessSatisfied({ record: starting, expectedNonce: nonce }).ok).toBe(false)
    const full = transitionDaemonRecord(starting, 'running').record
    for (const field of ['pid', 'pidStartedAt', 'generation', 'fence', 'startedAt', 'state']) {
      const { [field]: _dropped, ...truncated } = full
      expect(readinessSatisfied({ record: truncated, expectedNonce: nonce }).ok, field).toBe(false)
    }
    // A half-written value is refused for the same reason a missing one is.
    expect(readinessSatisfied({ record: { ...full, fence: 0 }, expectedNonce: nonce }).ok).toBe(false)
    expect(readinessSatisfied({ record: { ...full, startedAt: NaN }, expectedNonce: nonce }).ok).toBe(false)
    expect(readinessSatisfied({ record: full, expectedNonce: nonce }).ok).toBe(true)
  })
})

describe('exclusive daemon existence', () => {
  const record = { pid: 10, pidStartedAt: 5000 }

  it('allows creation only where no record stands', () => {
    expect(mayCreateDaemonRecord({}).ok).toBe(true)
  })

  it('refuses beside a live daemon, and beside a cold record without overwriting it', () => {
    const live = mayCreateDaemonRecord({ existing: record, probe: { live: true, pid: 10, startedAt: 5000 } })
    expect(live.ok).toBe(false)
    expect(live.cold).toBeUndefined()
    const cold = mayCreateDaemonRecord({ existing: record, probe: { live: false } })
    expect(cold).toMatchObject({ ok: false, cold: true })
    // A recycled pid — same number, another start time — is a stranger: cold.
    const recycled = mayCreateDaemonRecord({ existing: record, probe: { live: true, pid: 10, startedAt: 999_999 } })
    expect(recycled).toMatchObject({ ok: false, cold: true })
  })
})

describe('drain', () => {
  it('is the ordered rollback of mechanism 2, ending in exit', () => {
    expect(DRAIN_STEPS).toEqual([
      'refuse-new-mutations',
      'finish-in-flight-mutation',
      'cancel-workers-preserving-branches',
      'seal-snapshot',
      'release-identity-record',
      'exit',
    ])
  })
})
