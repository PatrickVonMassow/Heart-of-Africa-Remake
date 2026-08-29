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
 *    remoteHasCheckpoint  true only when the prober VERIFIED the checkpoint is
 *                     reachable from the remote tip (`git merge-base
 *                     --is-ancestor <checkpoint> <tip>`, equality included)
 *
 *  The verdict is `live` only when nothing disagrees. Anything else is
 *  `expired` WITH the alerts that say what stopped agreeing — or `invalid`
 *  when the block or the clock cannot even be judged, which no caller may
 *  read as anything but a refusal.
 *
 *  A `live` verdict carries the LANE it was taken for (`lane: { batchId,
 *  pointId, attemptId }`), because an agreement that names no lane could be
 *  replayed against another declaration. */
export function agreementVerdict({ durable = null, probes = {}, now, maxSilenceMs = AGREEMENT_SILENCE_MS } = {}) {
  const alerts = []
  if (!durable || durable.transferable !== true) {
    return { verdict: 'not-transferable', alerts: ['the declaration carries no transferable durable block'] }
  }
  // A block that claims transferability must survive the same all-or-nothing
  // validation the recording path applies: a persisted fragment naming only a
  // PID and a flag must never be judged on its probes at all.
  const validated = durableBlock(durable)
  if (!validated.ok) return { verdict: 'invalid', alerts: [`the durable block is unusable: ${validated.reason}`] }
  // The clock is EVIDENCE, and missing evidence fails closed: with no finite
  // `now` every staleness comparison is false and arbitrarily old probes would
  // read permanently fresh. The same applies to a silence window that is not a
  // positive number.
  if (!Number.isFinite(now)) return { verdict: 'invalid', alerts: ['no finite current time was supplied, so freshness cannot be judged'] }
  if (!Number.isFinite(maxSilenceMs) || maxSilenceMs <= 0) {
    return { verdict: 'invalid', alerts: ['the silence window is not a positive finite number, so freshness cannot be judged'] }
  }
  const { heartbeatAt, logAdvancedAt, workerProbe, launcherOwned, checkpointSha, remoteSha, remoteHasCheckpoint } = probes

  if (!(workerProbe?.live === true) || !sameProcess({ pid: durable.pid, pidStartedAt: durable.pidStartedAt }, { pid: workerProbe.pid, pidStartedAt: workerProbe.startedAt })) {
    alerts.push(`the declared worker process (pid ${durable.pid}) is not the one running — dead, or a recycled pid`)
  }
  // A probe timestamp AHEAD of the clock is not freshness — it is clock
  // rollback or a corrupt mtime, and evidence that cannot be dated does not
  // agree.
  if (!Number.isFinite(heartbeatAt)) alerts.push('the heartbeat is unreadable')
  else if (heartbeatAt > now) alerts.push(`the heartbeat timestamp is ${heartbeatAt - now}ms in the future — a rolled-back clock or corrupt mtime`)
  else if (now - heartbeatAt > maxSilenceMs) alerts.push(`the heartbeat is ${now - heartbeatAt}ms old`)
  if (!Number.isFinite(logAdvancedAt)) alerts.push('the log is unreadable or has never advanced')
  else if (logAdvancedAt > now) alerts.push(`the log timestamp is ${logAdvancedAt - now}ms in the future — a rolled-back clock or corrupt mtime`)
  else if (now - logAdvancedAt > maxSilenceMs) alerts.push(`the log stopped advancing ${now - logAdvancedAt}ms ago`)
  // AFFIRMATIVE like every probe in this design: only `true` is ownership, and
  // an unprobed launcher is a disagreement, not a pass.
  if (launcherOwned !== true) alerts.push('the launcher does not affirm ownership of this attempt')
  // The checkpoint's agreement is ANCESTRY, affirmatively probed — never string
  // comparison: a prefix match between abbreviated hashes is not identity, and a
  // legitimate descendant tip is not a disagreement. Missing evidence is itself
  // a disagreement: an unpushed or unverified checkpoint must never read live,
  // because a checkpoint the remote cannot prove is a checkpoint that LIED or a
  // push that vanished.
  if (!presentString(checkpointSha)) {
    alerts.push('no acknowledged checkpoint SHA: a lane with nothing pushed to prove does not agree')
  } else if (!presentString(remoteSha)) {
    alerts.push('the remote tip is unreadable, so the last acknowledged checkpoint cannot be verified against it')
  } else if (remoteHasCheckpoint !== true) {
    alerts.push(
      `the last acknowledged checkpoint (${checkpointSha.slice(0, 12)}) is not verified reachable from the remote tip (${remoteSha.slice(0, 12)})`,
    )
  }
  // THE LANE BINDING NAMES THE PROCESS, NOT ONLY THE ATTEMPT. The probes above
  // verify that the declared worker is the one running, but a token carrying only
  // {batchId, pointId, attemptId} forgets WHICH process that was: a replacement
  // holder under the same attempt would be handed over on the dead holder's
  // agreement, unprobed (cross-vendor review of point 834).
  const lane = Object.freeze({
    batchId: durable.batchId,
    pointId: durable.pointId,
    attemptId: durable.attemptId,
    pid: durable.pid,
    pidStartedAt: durable.pidStartedAt,
  })
  if (alerts.length) return { verdict: 'expired', alerts, lane }
  return { verdict: 'live', alerts: [], lane }
}

/** What a boundary asks per lane: a lane is handed on only while its declaration
 *  is transferable AND its agreement says live FOR THIS LANE; everything else
 *  keeps today's drain-before-boundary rule (M48/M61 — durability is per active
 *  lane). The lane binding is not politeness: an agreement without one, or with
 *  another lane's, could be a replay from a different declaration, and that is
 *  a BLOCK, never a hand-over. */
export function laneBoundaryVerdict({ durable = null, agreement = null } = {}) {
  if (!durable) return { verdict: 'drain', reason: 'no durable block: a session-bound lane blocks the boundary until it finishes or stops (M6)' }
  if (durable.transferable !== true) return { verdict: 'drain', reason: 'the lane is declared non-transferable' }
  const validated = durableBlock(durable)
  if (!validated.ok) return { verdict: 'block', reason: `the durable block is unusable and cannot be handed over: ${validated.reason}` }
  if (agreement?.verdict !== 'live') {
    return { verdict: 'block', reason: `the transferable lane does not agree with its probes: ${(agreement?.alerts ?? ['no agreement probe ran']).join('; ')}` }
  }
  const boundTo = agreement.lane
  if (!boundTo || boundTo.batchId !== durable.batchId || boundTo.pointId !== durable.pointId || boundTo.attemptId !== durable.attemptId) {
    return { verdict: 'block', reason: 'the agreement is not bound to this lane — it names no lane or another lane\'s identities, so it proves nothing here' }
  }
  // And to the PROCESS the probes actually saw. Same attempt, different holder is
  // the replay this binding exists to stop.
  if (!sameProcess({ pid: boundTo.pid, pidStartedAt: boundTo.pidStartedAt }, { pid: durable.pid, pidStartedAt: durable.pidStartedAt })) {
    return { verdict: 'block', reason: 'the agreement was taken for another process of this lane — a replacement holder is not covered by the dead holder\'s probes' }
  }
  return { verdict: 'hand-over' }
}
