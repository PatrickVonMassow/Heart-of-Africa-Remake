// THE ADOPTION RECORD AND ITS AGREEMENT PROBE — step 4 of the "Ordered work" in
// docs/handover-architecture.md (work-order point 834, the front stage of 676;
// union M17/M18).
//
// M17: the in-flight declaration becomes the ADOPTION RECORD. What is missing
// today is exactly that nothing tells the successor a run is now its own — a
// PID alone cannot, because it can be reused. So a declaration may carry a
// `durable` block naming the stable batch, point and attempt identities, the
// worker's process-start identity, and a `transferable` flag; this module
// decides whether that block is usable, and batch-in-flight.mjs refuses to
// record one that is not.
//
// M18: a transferable declaration must remain probeable across coordinator
// sessions and expire LOUDLY when heartbeat, log advancement, checkpoint SHA
// or launcher ownership stop agreeing. Expiry must ALERT, not merely unblock —
// an adopted run that dies unnoticed is the quiet failure this lane exists to
// remove — so the verdict here always carries its alerts, and "expired with no
// alert" is not a state this function can return.
import { sameProcess } from './batch-schema-core.mjs'

/** How long the heartbeat and the log may sit still before the declaration is
 *  EXPIRED rather than live. Deliberately generous: a worker ticks every few
 *  seconds, so ten minutes of silence is not scheduling jitter. */
export const AGREEMENT_SILENCE_MS = 10 * 60 * 1000

const presentString = (v) => typeof v === 'string' && v.length > 0

/** Validates the `durable` block of a declaration. All-or-nothing: a block that
 *  names half an identity is refused, because a successor adopting by these
 *  fields must never have to guess the other half. */
export function durableBlock({ batchId, pointId, attemptId, pid, pidStartedAt, transferable } = {}) {
  const missing = []
  if (!presentString(batchId)) missing.push('batchId')
  if (!presentString(pointId)) missing.push('pointId')
  if (!presentString(attemptId)) missing.push('attemptId')
  if (!Number.isInteger(pid) || pid < 1) missing.push('pid')
  if (!Number.isFinite(pidStartedAt)) missing.push('pidStartedAt')
  if (missing.length) return { ok: false, reason: `a durable block is all-or-nothing; missing: ${missing.join(', ')}` }
  if (transferable !== true && transferable !== false) {
    return { ok: false, reason: 'transferable is an explicit true or false, never implied' }
  }
  return { ok: true, durable: Object.freeze({ batchId, pointId, attemptId, pid, pidStartedAt, transferable }) }
}

/** M18's agreement, decided from probes a SUCCESSOR can take without the
 *  spawning session: does everything that should move still move, and does
 *  everything that should agree still agree?
 *
 *  `probes` carries what the prober measured:
 *    heartbeatAt      last heartbeat mtime (ms), or null when unreadable
 *    logAdvancedAt    last log growth (ms), or null
 *    workerProbe      { live, pid, startedAt } for the declared worker pid
 *    launcherOwned    true only when the daemon's record names this attempt's
 *                     lease holder — an AFFIRMATIVE verdict, absent when unknown
 *    checkpointSha    the last acknowledged checkpoint SHA, or null
 *    remoteSha        the branch tip on the remote, or null
 *
 *  The verdict is `live` only when nothing disagrees. Anything else is
 *  `expired` WITH the alerts that say what stopped agreeing. */
export function agreementVerdict({ durable = null, probes = {}, now = 0, maxSilenceMs = AGREEMENT_SILENCE_MS } = {}) {
  const alerts = []
  if (!durable || durable.transferable !== true) {
    return { verdict: 'not-transferable', alerts: ['the declaration carries no transferable durable block'] }
  }
  const { heartbeatAt, logAdvancedAt, workerProbe, launcherOwned, checkpointSha, remoteSha } = probes

  if (!(workerProbe?.live === true) || !sameProcess({ pid: durable.pid, pidStartedAt: durable.pidStartedAt }, { pid: workerProbe.pid, pidStartedAt: workerProbe.startedAt })) {
    alerts.push(`the declared worker process (pid ${durable.pid}) is not the one running — dead, or a recycled pid`)
  }
  if (!Number.isFinite(heartbeatAt)) alerts.push('the heartbeat is unreadable')
  else if (now - heartbeatAt > maxSilenceMs) alerts.push(`the heartbeat is ${now - heartbeatAt}ms old`)
  if (!Number.isFinite(logAdvancedAt)) alerts.push('the log is unreadable or has never advanced')
  else if (now - logAdvancedAt > maxSilenceMs) alerts.push(`the log stopped advancing ${now - logAdvancedAt}ms ago`)
  // AFFIRMATIVE like every probe in this design: only `true` is ownership, and
  // an unprobed launcher is a disagreement, not a pass.
  if (launcherOwned !== true) alerts.push('the launcher does not affirm ownership of this attempt')
  // A checkpoint SHA that the remote does not carry is a checkpoint that LIED or
  // a push that vanished; either way the record and the world disagree.
  if (presentString(checkpointSha) && presentString(remoteSha) && checkpointSha !== remoteSha) {
    const agrees = remoteSha.startsWith(checkpointSha) || checkpointSha.startsWith(remoteSha)
    if (!agrees) alerts.push(`the last acknowledged checkpoint (${checkpointSha.slice(0, 12)}) is not the remote tip (${remoteSha.slice(0, 12)})`)
  }
  if (alerts.length) return { verdict: 'expired', alerts }
  return { verdict: 'live', alerts: [] }
}

/** What a boundary asks per lane: a lane is handed on only while its declaration
 *  is transferable AND its agreement says live; everything else keeps today's
 *  drain-before-boundary rule (M48/M61 — durability is per active lane). */
export function laneBoundaryVerdict({ durable = null, agreement = null } = {}) {
  if (!durable) return { verdict: 'drain', reason: 'no durable block: a session-bound lane blocks the boundary until it finishes or stops (M6)' }
  if (durable.transferable !== true) return { verdict: 'drain', reason: 'the lane is declared non-transferable' }
  if (agreement?.verdict !== 'live') {
    return { verdict: 'block', reason: `the transferable lane does not agree with its probes: ${(agreement?.alerts ?? ['no agreement probe ran']).join('; ')}` }
  }
  return { verdict: 'hand-over' }
}
