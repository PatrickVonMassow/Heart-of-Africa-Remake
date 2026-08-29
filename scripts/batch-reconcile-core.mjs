// SUCCESSOR RECONCILIATION — step 8 of the "Ordered work" in
// docs/handover-architecture.md (work-order point 834, the front stage of 676;
// union M26-M29, M41). Pure: scripts/batch-reconcile.mjs gathers the evidence
// and this module decides, so every case runs on the Vitest layer.
//
// THE STANCE IS M41's: reconstruct only provable facts, quarantine the
// uncertain, and never declare a point complete because a record says so.
// Reconciliation is IDEMPOTENT — every resolution is a write toward the
// record's own truth, so running it twice changes nothing.
import { classifyDaemonPair, sameProcess } from './batch-schema-core.mjs'
import { landingCrashDecision } from './batch-landing-core.mjs'

// ---------------------------------------------------------------------------
// 1. LANE CLASSIFICATION (M28)
// ---------------------------------------------------------------------------

export const LANE_READINGS = Object.freeze(['running', 'completed', 'stalled', 'missing', 'divergent', 'orphaned'])

/** How silent a live worker's heartbeat may be before the lane reads stalled.
 *  Mirrors the adoption probe's ceiling. */
export const LANE_STALL_MS = 10 * 60 * 1000

/** One recorded lane against its probes, BEFORE any refill (M28):
 *    record        the attempt row from the snapshot (state, identities)
 *    workerProbe   { live, pid, startedAt } for the lease holder, if any
 *    lease         the daemon-held lease for this attempt, if any
 *    heartbeatAt   last heartbeat (ms) or null
 *    worktreeExists  the recorded worktree is on disk
 *    localSha / remoteSha   branch tips, null when unreadable
 *    remoteInLocal  ancestry verdict for a DIFFERING remote tip: true when the
 *                   remote tip is contained in the local history (a push
 *                   interval away — normal), false when the remote carries
 *                   history this lane never produced, null when unprobed
 *    remoteProbeFailed  the remote listing itself failed (network, auth) —
 *                   remoteSha null then hides possible divergence, so every
 *                   non-quarantined reading carries an alert
 *    recordedSha   the last pushed SHA the record claims, or null
 *    landedOnTarget  for a `landed` record: whether the LANDING TARGET's
 *                   history contains the recorded sha (true/false), or null
 *                   when unprobed. The worker branch proves nothing here —
 *                   landing merges to the target and deletes the branch, so a
 *                   merely pushed candidate must not satisfy a landed claim.
 *
 *  `completed` requires M37's whole condition — a terminal-commit claim VISIBLE
 *  on the remote — and is never concluded from the record alone. The clock and
 *  the lease FAIL CLOSED: liveness, heartbeat freshness and lease validity are
 *  judgments about time, and without a usable `now` — or past the lease's
 *  expiry — a live process is never read as a cleanly running lane. */
export function classifyLane({ record = null, workerProbe = null, lease = null, heartbeatAt = null, worktreeExists = false, localSha = null, remoteSha = null, remoteInLocal = null, remoteProbeFailed = false, recordedSha = null, landedOnTarget = null, now = null } = {}) {
  const verdict = classifyLaneInner({ record, workerProbe, lease, heartbeatAt, worktreeExists, localSha, remoteSha, remoteInLocal, recordedSha, landedOnTarget, now })
  if (remoteProbeFailed && !verdict.quarantine) {
    return { ...verdict, alert: true, reason: `${verdict.reason}; the remote probe failed, so divergence cannot be excluded` }
  }
  return verdict
}

function classifyLaneInner({ record, workerProbe, lease, heartbeatAt, worktreeExists, localSha, remoteSha, remoteInLocal, recordedSha, landedOnTarget, now }) {
  if (!record?.state?.state) {
    return { reading: 'orphaned', reason: 'evidence with no readable record: work nothing accounts for', quarantine: true }
  }
  const state = record.state.state
  const clockOk = Number.isFinite(now) && now > 0
  const workerLive = workerProbe?.live === true && (!lease || sameProcess(lease.holder, { pid: workerProbe.pid, pidStartedAt: workerProbe.startedAt }))

  // A LIVE worker under a terminal or reviewable record is a contradiction:
  // whatever wrote that state believed the process gone, so nothing here may
  // read the lane as free while the process still runs.
  if (['ready-for-review', 'landed', 'failed', 'cancelled'].includes(state) && workerLive) {
    return { reading: 'divergent', reason: `a live worker contradicts the recorded state ${state}`, quarantine: true }
  }
  if (state === 'ready-for-review') {
    if (recordedSha && remoteSha && remoteSha === recordedSha) {
      return { reading: 'completed', reason: 'the terminal commit is visible on the remote (M37)' }
    }
    return { reading: 'divergent', reason: 'the record claims reviewable work the remote does not show', quarantine: true }
  }
  if (state === 'landed') {
    // M37 in full: LANDED is a claim about the LANDING TARGET and completes
    // only when the target's history contains the recorded commit. The worker
    // branch's tip is no proof either way — a merely pushed candidate matches
    // it without ever landing, and a genuine merge deletes the branch.
    if (recordedSha && landedOnTarget === true) {
      return { reading: 'completed', reason: 'the landed claim is contained in the landing target (M37)' }
    }
    if (landedOnTarget === false) {
      return { reading: 'divergent', reason: 'the record claims landed work the landing target does not contain (M37)', quarantine: true }
    }
    return { reading: 'divergent', reason: 'the landed claim could not be verified against the landing target (M37)', quarantine: true }
  }
  if (['failed', 'cancelled'].includes(state)) {
    // These claim no remote success, so with the worker proven not-live there
    // is nothing left to verify.
    return { reading: 'completed', reason: `terminal state ${state}; nothing to adopt` }
  }
  if (workerProbe?.live === true && !lease) {
    // A live process with NO lease is authority without evidence: nothing
    // binds the pid to this lane, and nothing bounds what it may write.
    return { reading: 'divergent', reason: 'a live process holds no lease for this lane; authority without evidence', quarantine: true }
  }
  if (workerLive) {
    if (!Number.isFinite(lease.expiresAt)) {
      return { reading: 'divergent', reason: 'the lease carries no readable expiry; a live worker under a malformed lease is unbounded authority', quarantine: true }
    }
    if (!clockOk) {
      return { reading: 'stalled', reason: 'no usable clock to judge the lease or the heartbeat; a live worker is never cleanly running on unusable time', alert: true }
    }
    if (now > lease.expiresAt) {
      return { reading: 'divergent', reason: 'the worker process lives past its lease expiry; it may be operating outside its fence', quarantine: true }
    }
    if (Number.isFinite(heartbeatAt) && now - heartbeatAt <= LANE_STALL_MS) {
      // A live worker whose LOCAL tip ran ahead of the remote is normal — a
      // push interval away, the remote tip still in its history. A remote that
      // carries history this lane never produced is not: someone else moved
      // the branch under a live writer. The verdict is the gatherer's ANCESTRY
      // probe, and a differing tip it could not place stays an alert.
      if (localSha && remoteSha && localSha !== remoteSha) {
        if (remoteInLocal === false) {
          return { reading: 'divergent', reason: 'the remote moved past history this lane ever produced, under a live worker', quarantine: true }
        }
        if (remoteInLocal !== true) {
          return { reading: 'running', reason: 'live worker, fresh heartbeat; the differing remote tip could not be placed in the local history', alert: true }
        }
      }
      return { reading: 'running', reason: 'live worker, fresh heartbeat' }
    }
    return { reading: 'stalled', reason: 'the worker process lives but its heartbeat is silent', alert: true }
  }
  if (!worktreeExists && !localSha && !remoteSha) {
    return { reading: 'missing', reason: 'no process, no worktree, no branch: the run left nothing findable', quarantine: true }
  }
  if (recordedSha && remoteSha && remoteSha !== recordedSha) {
    return { reading: 'divergent', reason: 'the branch moved past the last recorded push while no worker lives', quarantine: true }
  }
  return { reading: 'missing', reason: 'the recorded worker is dead; its branch and worktree await adoption or cancellation', alert: true }
}

/** M29: refill only AFTER reconciliation — nothing unresolved, nothing red. */
export function mayRefill({ lanes = [] } = {}) {
  const unresolved = lanes.filter((l) => l.quarantine || l.alert)
  if (unresolved.length) {
    return { ok: false, reason: `refill waits: ${unresolved.length} lane(s) are quarantined or alerting`, unresolved }
  }
  return { ok: true }
}

/** The successor proves it is on the other side of the committed boundary.
 * A journalled daemon seal with no marker is marker deletion, never "no
 * boundary"; an equal fence is the old coordinator, never a successor. */
export function successorBoundaryVerdict({ marker = null, batchId = null, lock = null, sealedFence = null } = {}) {
  if (!marker) {
    if (Number.isInteger(sealedFence) && sealedFence > 0) {
      return { ok: false, quarantine: true, reason: `boundary marker deletion: daemon state records sealed fence ${sealedFence} but no marker stands` }
    }
    // No seal means no planned boundary ever committed. This is the crash path
    // point 834 proves: the new lock fence plus full lane reconciliation is the
    // authority, and inventing a marker requirement here would make the worker
    // survive its parent only to become permanently unadoptable.
    if (lock?.sessionId && Number.isInteger(lock.fence) && lock.fence > 0) {
      return { ok: true, mode: 'crash-recovery', markerFence: null, successorFence: lock.fence, requestId: null }
    }
    return { ok: false, quarantine: true, reason: 'no committed boundary marker or live successor lock identifies the takeover' }
  }
  if (marker.kind !== 'durable-batch-boundary' || marker.phase !== 'committed' || marker.batchId !== batchId || !Number.isInteger(marker.fence)) {
    return { ok: false, quarantine: true, reason: 'the durable boundary marker is malformed or belongs to another batch' }
  }
  if (!lock?.sessionId || !Number.isInteger(lock.fence) || lock.fence <= marker.fence) {
    return { ok: false, quarantine: true, reason: `the successor lock fence must be strictly above boundary fence ${marker.fence}` }
  }
  if (sealedFence !== marker.fence) {
    return { ok: false, quarantine: true, reason: `the daemon seal (${String(sealedFence)}) does not match boundary fence ${marker.fence}` }
  }
  return { ok: true, markerFence: marker.fence, successorFence: lock.fence, requestId: marker.requestId }
}

// ---------------------------------------------------------------------------
// 2. THE UNVERIFIED PUBLICATION TAIL (mechanism 2, with the corrected third
//    outcome: ABANDONED only from an UNMOVED ref)
// ---------------------------------------------------------------------------

/** One unverified publishing intent against what the remote actually says, in
 *  the ONE ordered procedure of the architecture:
 *    1. after-oid an ancestor of the ref      -> LANDED
 *    2. publication id found as a trailer     -> LANDED-REWRITTEN
 *    3. ref still exactly at the before-oid   -> ABANDONED
 *    4. anything else                          -> UNKNOWN, quarantined —
 *       a rewrite that lost its trailer and an unrelated successor leave the
 *       same evidence, and "history contains the before-oid" decides nothing.
 *
 *  `refProbe` per moved ref:
 *    refAt              the oid the ref carries now (null: ref absent)
 *    afterIsAncestor    `git merge-base --is-ancestor <after> <ref>` verdict
 *    trailerFound       the publication id appears as a commit trailer in the
 *                       ref's history
 *  Probes are AFFIRMATIVE: an unprobed or errored value is not false, it is
 *  unknown — and unknown quarantines. */
export function resolvePublicationIntent({ intent = null, refProbes = {} } = {}) {
  if (!intent?.publicationId || !Array.isArray(intent.moves) || !intent.moves.length) {
    return { outcome: 'UNKNOWN', quarantine: true, reason: 'the intent is unreadable; it may have published' }
  }
  const outcomes = intent.moves.map((move) => {
    const probe = refProbes[move.ref]
    if (!probe || typeof probe !== 'object') {
      return { ref: move.ref, outcome: 'UNKNOWN', reason: 'the ref was not probed; not probed is not absent' }
    }
    if (probe.afterIsAncestor === true) return { ref: move.ref, outcome: 'LANDED', reason: 'the after-oid is an ancestor of the ref' }
    if (probe.trailerFound === true) {
      return { ref: move.ref, outcome: 'LANDED-REWRITTEN', reason: 'the publication id survives as a trailer; nobody may read this as a clean landing' }
    }
    const beforeMatches = move.beforeOid === null ? probe.refAt === null : probe.refAt === move.beforeOid
    if ((probe.afterIsAncestor === false || (probe.afterIsAncestor === null && probe.refAt === null)) && probe.trailerFound === false && beforeMatches) {
      return { ref: move.ref, outcome: 'ABANDONED', reason: 'the ref never moved from the expected before-oid' }
    }
    return {
      ref: move.ref,
      outcome: 'UNKNOWN',
      reason: 'the ref moved in a way this attempt cannot explain; a trailer-losing rewrite and an unrelated successor look identical',
    }
  })
  // COLLAPSING BY PRIORITY WOULD HIDE A PARTIAL PUBLICATION: one ref landed
  // and another abandoned is not "landed", it is an intent that half-executed
  // and needs an operator. Only uniform verdicts collapse cleanly; any UNKNOWN
  // keeps the whole intent unknown, and a landed/abandoned mix quarantines as
  // PARTIAL instead of letting the strongest ref speak for the weakest.
  const kinds = new Set(outcomes.map((m) => m.outcome))
  let worst
  if (kinds.has('UNKNOWN')) worst = 'UNKNOWN'
  else if ((kinds.has('LANDED') || kinds.has('LANDED-REWRITTEN')) && kinds.has('ABANDONED')) worst = 'PARTIAL'
  else if (kinds.has('LANDED-REWRITTEN')) worst = 'LANDED-REWRITTEN'
  else worst = kinds.has('LANDED') ? 'LANDED' : 'ABANDONED'
  return { outcome: worst, quarantine: worst === 'UNKNOWN' || worst === 'PARTIAL', publicationId: intent.publicationId, moves: outcomes }
}

// ---------------------------------------------------------------------------
// 3. THE DAEMON PAIR, RESOLVED (mechanism 2's table, applied)
// ---------------------------------------------------------------------------

/** Turns the pair table's reading into the idempotent action the successor
 *  performs. Every action is a write toward the record's own truth, and the
 *  impossible row acts by REFUSING — an operator act, never an automatic one. */
export function daemonGenerationOrder({ entries = [], record = null, copy = null } = {}) {
  if (!record || !copy || record.generation === copy.generation) return null
  const startSeqs = (identity) =>
    entries
      .filter(
        (entry) =>
          !entry.quarantine &&
          entry.kind === 'daemon-lifecycle' &&
          entry.event === 'start' &&
          entry.record?.generation === identity.generation &&
          sameProcess(entry.record, identity),
      )
      .map((entry) => entry.seq)
      .filter(Number.isSafeInteger)
  const recordStarts = startSeqs(record)
  const copyStarts = startSeqs(copy)
  // A duplicated or absent lifecycle identity is not ordering evidence. The
  // pair table keeps differing random generations ambiguous in that case.
  if (recordStarts.length !== 1 || copyStarts.length !== 1) return null
  if (copyStarts[0] < recordStarts[0]) return 'copy-before-record'
  if (recordStarts[0] < copyStarts[0]) return 'record-before-copy'
  return null
}

export function daemonPairResolution({ record = null, copy = null, probe = null, generationOrder = null } = {}) {
  // Two probe shapes exist in this repository: batch-singleton's probePid answers
  // `startedAt`, the pair table compares `pidStartedAt`. Normalised HERE so a
  // caller cannot silently feed the table a probe it reads as "not asked".
  const normalized = probe ? { live: probe.live, pid: probe.pid, pidStartedAt: probe.pidStartedAt ?? probe.startedAt ?? null } : null
  const classified = classifyDaemonPair({ record, copy, probe: normalized, generationOrder })
  const actions = {
    'no-daemon': { action: 'none' },
    healthy: { action: 'none' },
    transitioning: { action: 'refuse-and-alert', operator: true },
    unknown: { action: 'refuse-and-alert', operator: true },
    unadopted: { action: 'write-copy-from-record' },
    'cold-record': { action: 'reconcile-workers-then-release-record' },
    'stale-copy': { action: 'reconcile-workers-then-release-record-and-clear-copy' },
    'superseded-copy': { action: 'write-copy-from-record' },
    'orphaned-copy': { action: 'clear-copy' },
    'impossible-copy': { action: 'refuse-and-alert', operator: true },
    'ambiguous-generations': { action: 'refuse-and-alert', operator: true },
  }
  return { ...classified, ...actions[classified.reading] }
}

// ---------------------------------------------------------------------------
// 4. THE WHOLE STARTUP READING (M26): corrupt evidence quarantines
// ---------------------------------------------------------------------------

/** The registry verdicts a successor can meet and what each permits. A corrupt
 *  journal never becomes state: provable facts are rebuilt from the work order,
 *  worktrees, logs and pushed branches (M41) — that rebuilding is the caller's
 *  gathering — and every lane it cannot prove arrives here quarantined. */
export function registryVerdict({ journalVerdict = null, snapshotVerdict = null } = {}) {
  if (journalVerdict === 'ok' && (snapshotVerdict === 'ok' || snapshotVerdict === 'missing')) {
    return { ok: true, source: snapshotVerdict === 'ok' ? 'snapshot-and-journal' : 'journal-only' }
  }
  if (journalVerdict === 'corrupt') {
    return { ok: false, source: 'reconstruction', reason: 'the journal fails its checksums: only provable facts count, uncertain points are quarantined, and minting is refused (M41)' }
  }
  if (snapshotVerdict === 'corrupt') {
    return { ok: false, source: 'journal-only', reason: 'the snapshot is corrupt; it is quarantined and the journal replayed in its place' }
  }
  return { ok: false, source: 'reconstruction', reason: 'no readable registry; reconstruct only provable facts and quarantine the rest' }
}

/** A crashed landing found at startup, decided by step 9's rule. Exposed here so
 *  the successor has ONE reconciliation entry point. */
export function landingRecovery({ stage = null } = {}) {
  return landingCrashDecision({ stage })
}

/** GREEN MEANS RESOLVED, nothing less: quarantined journal entries, alerting
 *  lanes (a stalled worker IS an alert), quarantined publications, a refused
 *  refill, a failed apply — and a PAIR ACTION THAT REMAINS TO BE DONE. A
 *  required resolution (write-copy, clear-copy, release) that was not applied
 *  successfully is unresolved reconciliation, so a run without `--apply` is
 *  red whenever the pair needs anything: automation reading this exit code
 *  must never activate over an explicitly unresolved daemon pair. */
export function reconcileExitRed(report) {
  return (
    !report?.registry?.ok ||
    (report.quarantined?.length ?? 0) > 0 ||
    (report.lanes ?? []).some((l) => l.quarantine || l.alert) ||
    (report.publications ?? []).some((p) => p.quarantine) ||
    (report.pair?.action !== 'none' && report.applied?.ok !== true) ||
    !report.refill?.ok ||
    report.applied?.ok === false
  )
}
