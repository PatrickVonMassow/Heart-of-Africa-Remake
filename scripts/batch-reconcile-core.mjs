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
 *    recordedSha   the last pushed SHA the record claims, or null
 *
 *  `completed` requires M37's whole condition — a terminal-commit claim VISIBLE
 *  on the remote — and is never concluded from the record alone. */
export function classifyLane({ record = null, workerProbe = null, lease = null, heartbeatAt = null, worktreeExists = false, localSha = null, remoteSha = null, recordedSha = null, now = 0 } = {}) {
  if (!record?.state?.state) {
    return { reading: 'orphaned', reason: 'evidence with no readable record: work nothing accounts for', quarantine: true }
  }
  const state = record.state.state
  const workerLive = workerProbe?.live === true && (!lease || sameProcess(lease.holder, { pid: workerProbe.pid, pidStartedAt: workerProbe.startedAt }))

  if (state === 'ready-for-review') {
    if (recordedSha && remoteSha && remoteSha === recordedSha) {
      return { reading: 'completed', reason: 'the terminal commit is visible on the remote (M37)' }
    }
    return { reading: 'divergent', reason: 'the record claims reviewable work the remote does not show', quarantine: true }
  }
  if (['landed', 'failed', 'cancelled'].includes(state)) {
    return { reading: 'completed', reason: `terminal state ${state}; nothing to adopt` }
  }
  if (workerLive) {
    if (Number.isFinite(heartbeatAt) && now - heartbeatAt <= LANE_STALL_MS) {
      // A live worker whose local tip ran ahead of what was ever pushed is
      // normal (a push interval away); a REMOTE ahead of the local one is not.
      if (localSha && remoteSha && localSha !== remoteSha && !worktreeExists) {
        return { reading: 'divergent', reason: 'the branch moved while the worktree is gone', quarantine: true }
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
  const worst = ['UNKNOWN', 'LANDED-REWRITTEN', 'LANDED', 'ABANDONED'].find((o) => outcomes.some((m) => m.outcome === o))
  return { outcome: worst, quarantine: worst === 'UNKNOWN', publicationId: intent.publicationId, moves: outcomes }
}

// ---------------------------------------------------------------------------
// 3. THE DAEMON PAIR, RESOLVED (mechanism 2's table, applied)
// ---------------------------------------------------------------------------

/** Turns the pair table's reading into the idempotent action the successor
 *  performs. Every action is a write toward the record's own truth, and the
 *  impossible row acts by REFUSING — an operator act, never an automatic one. */
export function daemonPairResolution({ record = null, copy = null, probe = null } = {}) {
  // Two probe shapes exist in this repository: batch-singleton's probePid answers
  // `startedAt`, the pair table compares `pidStartedAt`. Normalised HERE so a
  // caller cannot silently feed the table a probe it reads as "not asked".
  const normalized = probe ? { live: probe.live, pid: probe.pid, pidStartedAt: probe.pidStartedAt ?? probe.startedAt ?? null } : null
  const classified = classifyDaemonPair({ record, copy, probe: normalized })
  const actions = {
    'no-daemon': { action: 'none' },
    healthy: { action: 'none' },
    unadopted: { action: 'write-copy-from-record' },
    'cold-record': { action: 'reconcile-workers-then-release-record' },
    'stale-copy': { action: 'reconcile-workers-then-release-record-and-clear-copy' },
    'superseded-copy': { action: 'write-copy-from-record' },
    'orphaned-copy': { action: 'clear-copy' },
    'impossible-copy': { action: 'refuse-and-alert', operator: true },
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
