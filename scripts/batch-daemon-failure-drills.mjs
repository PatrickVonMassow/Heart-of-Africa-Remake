// The bounded failure matrix for ordered-work step 12. Each scenario exercises
// the production decision that must fail closed; the parent-death scenario in
// batch-daemon-drill.mjs remains the full real-process takeover drill.
import { classifyLane, registryVerdict, successorBoundaryVerdict } from './batch-reconcile-core.mjs'
import { daemonCheckpointVerdict, checkpointBarrierVerdict, createCheckpointBarrier } from './batch-checkpoint-core.mjs'
import { validateMutation } from './batch-schema-core.mjs'
import { agreementVerdict } from './batch-adoption-core.mjs'
import { classifyDaemonPair } from './batch-schema-core.mjs'

const NOW = 10_000
const sha = 'a'.repeat(40)
const check = (name, ok, detail) => ({ name, ok: ok === true, detail })

export const FAILURE_DRILL_SCENARIOS = Object.freeze([
  'normal-handover', 'worker-crash', 'stall', 'push-failure', 'dirty-worktree',
  'marker-deletion', 'daemon-restart', 'corrupt-snapshot', 'pid-reuse',
  'duplicate-coordinator', 'remote-outage', 'checkpoint-timeout',
])

export function runFailureDrill(scenario) {
  let checks = []
  if (scenario === 'normal-handover') {
    const verdict = successorBoundaryVerdict({ marker: { kind: 'durable-batch-boundary', phase: 'committed', batchId: 'b', fence: 7, requestId: 'r' }, batchId: 'b', lock: { sessionId: 'successor', fence: 8 }, sealedFence: 7 })
    checks = [check('a strictly newer coordinator adopts the sealed handover', verdict.ok, verdict.reason)]
  } else if (scenario === 'worker-crash') {
    const verdict = classifyLane({ record: { state: { state: 'running' } }, workerProbe: { live: false }, lease: { holder: { pid: 1, pidStartedAt: 1 } }, worktreeExists: true, localSha: sha, remoteSha: sha, recordedSha: sha, now: NOW })
    checks = [check('a crashed worker is not counted running or freed silently', verdict.reading === 'missing' && verdict.alert === true, verdict.reason)]
  } else if (scenario === 'stall') {
    const verdict = classifyLane({ record: { state: { state: 'running' } }, workerProbe: { live: true, pid: 1, startedAt: 1 }, lease: { holder: { pid: 1, pidStartedAt: 1 }, expiresAt: NOW + 1000 }, heartbeatAt: -1_000_000, worktreeExists: true, now: NOW })
    checks = [check('a live worker with a silent heartbeat is stalled and alerting', verdict.reading === 'stalled' && verdict.alert === true, verdict.reason)]
  } else if (scenario === 'push-failure') {
    const verdict = daemonCheckpointVerdict({ requestId: 'cp', answers: [{ attemptId: 'a', acknowledged: true, transferable: false, pushedOk: false, dirty: false, sha }] })
    checks = [check('checkpoint push failure blocks transfer with recovery choices', !verdict.ok && verdict.blocked?.[0]?.choices?.length === 3, verdict.blocked?.[0]?.reason)]
  } else if (scenario === 'dirty-worktree') {
    const verdict = daemonCheckpointVerdict({ requestId: 'cp', answers: [{ attemptId: 'a', acknowledged: true, transferable: false, pushedOk: true, dirty: true, sha }] })
    checks = [check('dirty terminal worktree blocks transfer', !verdict.ok && verdict.blocked?.[0]?.reason === 'dirty worktree', verdict.blocked?.[0]?.reason)]
  } else if (scenario === 'marker-deletion') {
    const verdict = successorBoundaryVerdict({ marker: null, batchId: 'b', lock: { sessionId: 'successor', fence: 8 }, sealedFence: 7 })
    checks = [check('a deleted boundary marker is quarantined from the daemon seal', !verdict.ok && verdict.quarantine === true && /marker deletion/.test(verdict.reason), verdict.reason)]
  } else if (scenario === 'daemon-restart') {
    const record = { pid: 10, pidStartedAt: 1, generation: 'generation-a', state: 'running' }
    const verdict = classifyDaemonPair({ record, copy: record, probe: { live: false, pid: 10, pidStartedAt: 1 } })
    checks = [check('a dead daemon record becomes cold reconciliation evidence', ['cold-record', 'stale-copy'].includes(verdict.reading), verdict.reason ?? verdict.reading)]
  } else if (scenario === 'corrupt-snapshot') {
    const verdict = registryVerdict({ journalVerdict: 'ok', snapshotVerdict: 'corrupt' })
    checks = [check('a corrupt snapshot is quarantined and journal replay is required', !verdict.ok && verdict.source === 'journal-only', verdict.reason)]
  } else if (scenario === 'pid-reuse') {
    const verdict = agreementVerdict({ durable: { batchId: 'b', pointId: 'p', attemptId: 'a', pid: 10, pidStartedAt: 1, transferable: true }, probes: { workerProbe: { live: true, pid: 10, startedAt: 5000 }, heartbeatAt: NOW, logAdvancedAt: NOW, launcherOwned: true, checkpointSha: sha, remoteSha: sha, remoteHasCheckpoint: true }, now: NOW })
    checks = [check('a recycled PID never satisfies stable worker identity', verdict.verdict === 'expired' && verdict.alerts.some((alert) => /recycled pid/.test(alert)), verdict.alerts?.join('; '))]
  } else if (scenario === 'duplicate-coordinator') {
    const lock = { sessionId: 'new', fence: 8, pid: 1, pidStartedAt: 1, leaseUntil: NOW + 1000 }
    const probe = { live: true, pid: 1, startedAt: 1 }
    const oldSession = validateMutation({ presented: { sessionId: 'old', fence: 7 }, lock, probe, now: NOW })
    const oldFence = validateMutation({ presented: { sessionId: 'new', fence: 7 }, lock, probe, now: NOW })
    checks = [check('duplicate coordinator identity is fenced', !oldSession.ok && !oldFence.ok, `${oldSession.reason}; ${oldFence.reason}`)]
  } else if (scenario === 'remote-outage') {
    const verdict = classifyLane({ record: { state: { state: 'running' } }, workerProbe: { live: true, pid: 1, startedAt: 1 }, lease: { holder: { pid: 1, pidStartedAt: 1 }, expiresAt: NOW + 1000 }, heartbeatAt: NOW, worktreeExists: true, localSha: sha, remoteSha: null, remoteProbeFailed: true, now: NOW })
    checks = [check('remote outage leaves the lane alerting and blocks refill', verdict.alert === true && /remote probe failed/.test(verdict.reason), verdict.reason)]
  } else if (scenario === 'checkpoint-timeout') {
    const barrier = createCheckpointBarrier({ requestId: 'cp', lanes: ['a'], requestedAt: 1, timeoutMs: 10, fence: 7 }).barrier
    const verdict = checkpointBarrierVerdict(barrier, { now: 12 })
    checks = [check('checkpoint timeout names the lane and wait/cancel/drain', !verdict.ok && verdict.blocked?.[0]?.attemptId === 'a' && verdict.blocked[0].choices?.length === 3, verdict.blocked?.[0]?.reason)]
  } else {
    return { ok: false, scenario, reason: `unknown scenario: ${String(scenario)}` }
  }
  return { ok: checks.every((item) => item.ok), scenario, checks }
}
