// SUCCESSOR RECONCILIATION'S DECISIONS (point 834, step 8): every lane reading
// of M28, completion only by remote evidence (M37), refill only after a clean
// reconciliation (M29), the four publication outcomes with ABANDONED concluded
// ONLY from an unmoved ref, the daemon-pair table applied idempotently, and
// corrupt registries quarantined rather than repaired (M41).
import { describe, it, expect } from 'vitest'
import { LANDING_STAGES, landingAllowsBoundary, landingCrashDecision } from './batch-landing-core.mjs'
import {
  LANE_READINGS,
  LANE_STALL_MS,
  classifyLane,
  daemonPairResolution,
  landingRecovery,
  mayRefill,
  registryVerdict,
  resolvePublicationIntent,
} from './batch-reconcile-core.mjs'

const OID_A = 'a'.repeat(40)
const OID_B = 'b'.repeat(40)

const runningRecord = (state = 'running') => ({ batchId: 'b', pointId: 'p', attemptId: 'a1', state: { state, at: 1000 } })
const liveWorker = { live: true, pid: 100, startedAt: 5000 }
const lease = { batchId: 'b', pointId: 'p', attemptId: 'a1', leaseId: 'L1', holder: { pid: 100, pidStartedAt: 5000 }, expiresAt: 999_999 }

describe('classifyLane (M28)', () => {
  it('names exactly the six readings', () => {
    expect(LANE_READINGS).toEqual(['running', 'completed', 'stalled', 'missing', 'divergent', 'orphaned'])
  })

  it('running: live worker, fresh heartbeat', () => {
    const res = classifyLane({ record: runningRecord(), workerProbe: liveWorker, lease, heartbeatAt: 90_000, now: 100_000, worktreeExists: true })
    expect(res.reading).toBe('running')
  })

  it('stalled: the process lives but the heartbeat went silent — an alert, not a free slot', () => {
    const res = classifyLane({ record: runningRecord(), workerProbe: liveWorker, lease, heartbeatAt: 100_000 - LANE_STALL_MS - 1, now: 100_000, worktreeExists: true })
    expect(res).toMatchObject({ reading: 'stalled', alert: true })
  })

  it('quarantines a live lane whose remote moved past history it never produced — and only on that verdict', () => {
    const args = { record: runningRecord(), workerProbe: liveWorker, lease, heartbeatAt: 99_000, now: 100_000, worktreeExists: true, localSha: OID_A, remoteSha: OID_B }
    expect(classifyLane({ ...args, remoteInLocal: false })).toMatchObject({ reading: 'divergent', quarantine: true })
    // Local ahead by a push interval reads running and clean.
    expect(classifyLane({ ...args, remoteInLocal: true })).toEqual({ reading: 'running', reason: 'live worker, fresh heartbeat' })
    // A differing tip the probe could not place is an ALERT, never a pass.
    expect(classifyLane({ ...args, remoteInLocal: null })).toMatchObject({ reading: 'running', alert: true })
  })

  it('a recycled pid is not a live worker: the lease holder decides', () => {
    const stranger = { live: true, pid: 100, startedAt: 99_999 }
    const res = classifyLane({ record: runningRecord(), workerProbe: stranger, lease, heartbeatAt: 90_000, now: 100_000 })
    expect(['missing', 'divergent']).toContain(res.reading)
  })

  it('completed: only when the recorded terminal commit is VISIBLE on the remote (M37)', () => {
    const good = classifyLane({ record: runningRecord('ready-for-review'), recordedSha: OID_A, remoteSha: OID_A })
    expect(good.reading).toBe('completed')
    const bad = classifyLane({ record: runningRecord('ready-for-review'), recordedSha: OID_A, remoteSha: OID_B })
    expect(bad).toMatchObject({ reading: 'divergent', quarantine: true })
  })

  it('missing: a dead worker that left nothing findable quarantines; one with a branch alerts', () => {
    const nothing = classifyLane({ record: runningRecord(), workerProbe: { live: false }, worktreeExists: false })
    expect(nothing).toMatchObject({ reading: 'missing', quarantine: true })
    const withBranch = classifyLane({ record: runningRecord(), workerProbe: { live: false }, worktreeExists: true, localSha: OID_A, remoteSha: OID_A, recordedSha: OID_A })
    expect(withBranch).toMatchObject({ reading: 'missing', alert: true })
  })

  it('divergent: the branch moved past the record while no worker lives', () => {
    const res = classifyLane({ record: runningRecord(), workerProbe: { live: false }, worktreeExists: true, recordedSha: OID_A, remoteSha: OID_B })
    expect(res).toMatchObject({ reading: 'divergent', quarantine: true })
  })

  it('orphaned: evidence with no readable record', () => {
    expect(classifyLane({ record: null })).toMatchObject({ reading: 'orphaned', quarantine: true })
    expect(classifyLane({ record: { state: {} } })).toMatchObject({ reading: 'orphaned' })
  })

  it('failed and cancelled complete without remote claims; landed completes only with its remote proof (M37)', () => {
    for (const state of ['failed', 'cancelled']) {
      expect(classifyLane({ record: runningRecord(state) }).reading).toBe('completed')
    }
    expect(classifyLane({ record: runningRecord('landed'), recordedSha: OID_A, remoteSha: OID_A }).reading).toBe('completed')
    // A landed claim the remote does not show — moved tip, missing branch or a
    // record with nothing recorded — quarantines instead of completing.
    expect(classifyLane({ record: runningRecord('landed'), recordedSha: OID_A, remoteSha: OID_B })).toMatchObject({ reading: 'divergent', quarantine: true })
    expect(classifyLane({ record: runningRecord('landed'), recordedSha: OID_A, remoteSha: null })).toMatchObject({ reading: 'divergent', quarantine: true })
    expect(classifyLane({ record: runningRecord('landed') })).toMatchObject({ reading: 'divergent', quarantine: true })
  })

  it('a LIVE worker contradicting a terminal or reviewable record quarantines, never completes', () => {
    for (const state of ['ready-for-review', 'landed', 'failed', 'cancelled']) {
      const res = classifyLane({ record: runningRecord(state), workerProbe: liveWorker, lease, recordedSha: OID_A, remoteSha: OID_A })
      expect(res, state).toMatchObject({ reading: 'divergent', quarantine: true })
    }
  })
})

describe('mayRefill (M29)', () => {
  it('refills only after a clean reconciliation', () => {
    expect(mayRefill({ lanes: [{ reading: 'running' }, { reading: 'completed' }] }).ok).toBe(true)
    const held = mayRefill({ lanes: [{ reading: 'running' }, { reading: 'missing', quarantine: true }] })
    expect(held.ok).toBe(false)
    expect(mayRefill({ lanes: [{ reading: 'stalled', alert: true }] }).ok).toBe(false)
  })
})

describe('resolvePublicationIntent — the one ordered procedure', () => {
  const intent = { publicationId: 'pub-1', moves: [{ ref: 'refs/heads/feat/x', beforeOid: OID_A, afterOid: OID_B }] }
  const probe = (over) => ({ 'refs/heads/feat/x': { refAt: OID_A, afterIsAncestor: false, trailerFound: false, ...over } })

  it('LANDED: the after-oid is an ancestor, through any number of later publications', () => {
    expect(resolvePublicationIntent({ intent, refProbes: probe({ afterIsAncestor: true, refAt: OID_B }) }).outcome).toBe('LANDED')
  })

  it('LANDED-REWRITTEN: the trailer survives a rewrite, and is never read as clean', () => {
    const res = resolvePublicationIntent({ intent, refProbes: probe({ trailerFound: true, refAt: OID_B }) })
    expect(res.outcome).toBe('LANDED-REWRITTEN')
    expect(res.quarantine).toBe(false)
  })

  it('ABANDONED only from an UNMOVED ref', () => {
    expect(resolvePublicationIntent({ intent, refProbes: probe({}) }).outcome).toBe('ABANDONED')
  })

  it('UNKNOWN and quarantined when the ref moved without explanation — the corrected third outcome', () => {
    // History containing the before-oid does NOT rescue this: a rewrite that
    // lost its trailer and an unrelated successor leave the same evidence.
    const res = resolvePublicationIntent({ intent, refProbes: probe({ refAt: OID_B }) })
    expect(res).toMatchObject({ outcome: 'UNKNOWN', quarantine: true })
  })

  it('UNKNOWN when the probe is missing or unreadable: not probed is not absent', () => {
    expect(resolvePublicationIntent({ intent, refProbes: {} })).toMatchObject({ outcome: 'UNKNOWN', quarantine: true })
    expect(resolvePublicationIntent({ intent: null })).toMatchObject({ outcome: 'UNKNOWN', quarantine: true })
  })

  it('a created-ref intent is ABANDONED only while the ref still does not exist', () => {
    const create = { publicationId: 'pub-2', moves: [{ ref: 'refs/hoa/coordinator', beforeOid: null, afterOid: OID_B }] }
    const absent = { 'refs/hoa/coordinator': { refAt: null, afterIsAncestor: null, trailerFound: false } }
    expect(resolvePublicationIntent({ intent: create, refProbes: absent }).outcome).toBe('ABANDONED')
    const appeared = { 'refs/hoa/coordinator': { refAt: OID_A, afterIsAncestor: false, trailerFound: false } }
    expect(resolvePublicationIntent({ intent: create, refProbes: appeared }).outcome).toBe('UNKNOWN')
  })
})

describe('daemonPairResolution — the table, applied', () => {
  const record = { pid: 10, pidStartedAt: 5000, generation: 3 }

  it('resolves each reading to its idempotent action', () => {
    expect(daemonPairResolution({}).action).toBe('none')
    expect(daemonPairResolution({ record, probe: { live: true, pid: 10, startedAt: 5000 } }).action).toBe('write-copy-from-record')
    expect(daemonPairResolution({ record, probe: { live: false } }).action).toBe('reconcile-workers-then-release-record')
    expect(daemonPairResolution({ record, copy: { pid: 10, pidStartedAt: 5000, generation: 3 }, probe: { live: false } }).action).toBe('reconcile-workers-then-release-record-and-clear-copy')
    expect(daemonPairResolution({ copy: { pid: 10, pidStartedAt: 5000, generation: 3 } }).action).toBe('clear-copy')
  })

  it('the impossible row refuses and names the operator, never resolves', () => {
    const res = daemonPairResolution({ record, copy: { pid: 10, pidStartedAt: 5000, generation: 9 } })
    expect(res).toMatchObject({ action: 'refuse-and-alert', operator: true })
  })
})

describe('registryVerdict (M41)', () => {
  it('accepts journal-backed registries, with or without a snapshot', () => {
    expect(registryVerdict({ journalVerdict: 'ok', snapshotVerdict: 'ok' })).toMatchObject({ ok: true, source: 'snapshot-and-journal' })
    expect(registryVerdict({ journalVerdict: 'ok', snapshotVerdict: 'missing' })).toMatchObject({ ok: true, source: 'journal-only' })
  })

  it('quarantines corruption instead of repairing it', () => {
    expect(registryVerdict({ journalVerdict: 'corrupt', snapshotVerdict: 'ok' })).toMatchObject({ ok: false, source: 'reconstruction' })
    expect(registryVerdict({ journalVerdict: 'ok', snapshotVerdict: 'corrupt' })).toMatchObject({ ok: false, source: 'journal-only' })
    expect(registryVerdict({}).ok).toBe(false)
  })
})

describe('the landing slice of step 9', () => {
  it('orders the stages with merge as the one published act', () => {
    expect(LANDING_STAGES.indexOf('merge')).toBeGreaterThan(LANDING_STAGES.indexOf('picture-webgl2'))
    expect(LANDING_STAGES[LANDING_STAGES.length - 1]).toBe('landed')
  })

  it('repeats unproven judgment, resolves the merge against the remote, resumes proven bookkeeping', () => {
    expect(landingCrashDecision({ stage: 'diff-review' }).action).toBe('restart')
    expect(landingCrashDecision({ stage: 'picture-webgpu' }).action).toBe('restart')
    expect(landingCrashDecision({ stage: 'merge' }).action).toBe('resolve-merge-against-remote')
    expect(landingCrashDecision({ stage: 'bookkeeping' }).action).toBe('resume-bookkeeping')
    expect(landingCrashDecision({ stage: 'landed' }).action).toBe('done')
    expect(landingCrashDecision({ stage: 'nonsense' }).ok).toBe(false)
    expect(landingRecovery({ stage: 'merge' }).action).toBe('resolve-merge-against-remote')
  })

  it('plans boundaries only outside a landing (M34)', () => {
    expect(landingAllowsBoundary({ stage: null }).ok).toBe(true)
    expect(landingAllowsBoundary({ stage: 'landed' }).ok).toBe(true)
    expect(landingAllowsBoundary({ stage: 'gates' }).ok).toBe(false)
  })
})
