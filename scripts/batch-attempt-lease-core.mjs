// THE ATTEMPT LEASE — step 4 of the "Ordered work" in docs/handover-architecture.md
// (work-order point 834, the front stage of 676; union M39/M40).
//
// Pure like the schema layer: the daemon holds these leases and persists them
// through the state store, but WHO may write a branch is decided here, from
// arguments alone. The name is deliberate: scripts/batch-lease-core.mjs already
// exists and fences lockless MAIN writers — an unrelated, older mechanism — so
// this file is the ATTEMPT lease and never touches that one.
//
// WHAT A LEASE PREVENTS (M39): two processes writing one attempt's branch or one
// worktree. A lease is granted to a PROCESS IDENTITY — pid AND pid start time,
// never a bare pid — held per attempt, renewed by its holder, and expired loudly.
// WHAT A STALE HOLDER MUST DO (M40): verify its lease before every checkpoint and
// push, and on refusal STOP, leaving the branch intact for inspection. The refusal
// here is the local half; the remote half is the credential lease on
// refs/hoa/coordinator (batch-schema-core.mjs, publicationPush), which is a check
// that IS the push. Both halves fail closed.
import { sameAttempt, sameProcess } from './batch-schema-core.mjs'

/** How long a granted lease holds without renewal. Generous against load stalls —
 *  a worker that cannot renew for five minutes is a worker whose machine is in
 *  real trouble — and irrelevant to safety: expiry never frees an AMBIGUOUS lease
 *  (M38); it alerts, and restart happens only after death is proven. */
export const ATTEMPT_LEASE_TTL_MS = 5 * 60 * 1000

function usableLease(lease) {
  return Boolean(
    lease &&
      typeof lease.leaseId === 'string' &&
      lease.leaseId &&
      lease.holder &&
      Number.isInteger(lease.holder.pid) &&
      lease.holder.pid > 0 &&
      Number.isFinite(lease.holder.pidStartedAt) &&
      Number.isFinite(lease.expiresAt) &&
      sameAttempt(lease, lease),
  )
}

/** Grants or renews the lease for one attempt. The decision is against the ONE
 *  existing lease for that attempt (the daemon indexes by attempt):
 *    - no existing lease → grant;
 *    - the same process renewing BEFORE expiry → extend, same leaseId;
 *    - the same process after expiry → the lease LAPSED: the renewal is refused
 *      with an alert, and the holder continues only via a re-grant under a new
 *      lease id — persisting a silent extension would blind expiredLeaseAlerts;
 *    - a DIFFERENT process while the lease is unexpired → refuse: duplicate writer;
 *    - a different process after expiry → STILL refuse, with `stale-holder`: expiry
 *      alone never proves death (M38/M39), so the caller must present
 *      `holderProvenDead: true` — an affirmative verdict from the pid-and-start-time
 *      probe — before the attempt may be re-granted, and then only as a NEW lease id.
 *  A recycled pid presenting the dead holder's number is caught by sameProcess:
 *  the start time does not match, so it is a different process like any other. */
export function grantAttemptLease({ existing = null, attempt = {}, holder = {}, now = 0, ttlMs = ATTEMPT_LEASE_TTL_MS, leaseId = null, holderProvenDead = false } = {}) {
  if (!attempt.batchId || !attempt.pointId || !attempt.attemptId) {
    return { ok: false, reason: 'a lease names its batch, point and attempt' }
  }
  if (!Number.isInteger(holder.pid) || holder.pid < 1 || !Number.isFinite(holder.pidStartedAt)) {
    return { ok: false, reason: 'a lease holder is a process identity: pid and pid start time' }
  }
  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return { ok: false, reason: 'a lease needs a usable clock and ttl' }
  }
  if (existing) {
    if (!usableLease(existing)) {
      // An unreadable lease is UNCERTAIN ownership, and uncertain fails closed
      // (M39) — never "broken, therefore free".
      return { ok: false, reason: 'the existing lease is unreadable; ownership is uncertain and uncertain fails closed' }
    }
    if (!sameAttempt(existing, attempt)) {
      return { ok: false, reason: 'the existing lease belongs to another attempt; the daemon indexed it wrong' }
    }
    if (sameProcess(existing.holder, holder)) {
      if (now <= existing.expiresAt) {
        return { ok: true, renewed: true, lease: Object.freeze({ ...existing, expiresAt: now + ttlMs }) }
      }
      // A LAPSED lease never extends silently (M38): once the renewal persisted,
      // expiredLeaseAlerts could no longer observe the lapse. The lapse is
      // alerted HERE, the stale renewal is refused, and the same process — alive
      // by construction, it is asking — continues only under a NEW lease id the
      // daemon records as a re-grant, never as a resurrection.
      if (typeof leaseId !== 'string' || !leaseId || leaseId === existing.leaseId) {
        return {
          ok: false,
          verdict: 'lapsed',
          reason: 'the lease lapsed before this renewal; a lapse alerts and re-grants under a new lease id, it never extends silently (M38)',
          alert: `attempt lease ${existing.leaseId} expired ${now - existing.expiresAt}ms ago while its holder pid ${existing.holder.pid} still lives`,
        }
      }
      return {
        ok: true,
        renewed: false,
        lapsed: true,
        alert: `attempt lease ${existing.leaseId} lapsed ${now - existing.expiresAt}ms before its holder pid ${holder.pid} returned; re-granted as a new lease`,
        lease: Object.freeze({
          batchId: attempt.batchId,
          pointId: attempt.pointId,
          attemptId: attempt.attemptId,
          leaseId,
          holder: Object.freeze({ pid: holder.pid, pidStartedAt: holder.pidStartedAt }),
          grantedAt: now,
          expiresAt: now + ttlMs,
        }),
      }
    }
    if (now <= existing.expiresAt) {
      return { ok: false, reason: `duplicate writer: the lease is held by pid ${existing.holder.pid} until ${existing.expiresAt}` }
    }
    if (holderProvenDead !== true) {
      return {
        ok: false,
        verdict: 'stale-holder',
        reason: 'the lease has expired but its holder is not proven dead; expiry alerts, it does not free (M38)',
      }
    }
  }
  if (typeof leaseId !== 'string' || !leaseId) return { ok: false, reason: 'a grant mints a fresh lease id; none was supplied' }
  if (existing && leaseId === existing.leaseId) {
    return { ok: false, reason: 'a re-grant after death is a NEW lease id, never a resurrection of the old one' }
  }
  return {
    ok: true,
    renewed: false,
    lease: Object.freeze({
      batchId: attempt.batchId,
      pointId: attempt.pointId,
      attemptId: attempt.attemptId,
      leaseId,
      holder: Object.freeze({ pid: holder.pid, pidStartedAt: holder.pidStartedAt }),
      grantedAt: now,
      expiresAt: now + ttlMs,
    }),
  }
}

/** The check a worker runs BEFORE every checkpoint and push (M40). Anything but a
 *  full affirmative match is `fenced`, and a fenced worker STOPS and leaves its
 *  branch intact — the reasons differ so the operator learns what happened, the
 *  verdict never does. */
export function leaseAllowsWrite({ lease = null, holder = {}, leaseId = null, now = 0 } = {}) {
  if (!usableLease(lease)) return { verdict: 'fenced', reason: 'no usable lease; ownership is uncertain and uncertain fails closed' }
  if (typeof leaseId !== 'string' || !leaseId || leaseId !== lease.leaseId) {
    return { verdict: 'fenced', reason: 'the lease id presented is not the lease that stands; this attempt was re-granted' }
  }
  if (!sameProcess(lease.holder, holder)) {
    return { verdict: 'fenced', reason: 'the lease is held by another process identity; a recycled pid does not inherit it' }
  }
  if (now > lease.expiresAt) {
    return { verdict: 'fenced', reason: 'the lease has expired; renew through the daemon before writing, or stop' }
  }
  return { verdict: 'write', lease }
}

/** Expiry is LOUD (M18/M38): every expired lease is an alert naming its attempt,
 *  never merely an unblocked slot. The daemon raises these; it frees nothing. */
export function expiredLeaseAlerts({ leases = [], now = 0 } = {}) {
  return leases
    .filter((l) => usableLease(l) && now > l.expiresAt)
    .map((l) => ({
      batchId: l.batchId,
      pointId: l.pointId,
      attemptId: l.attemptId,
      alert: `attempt lease expired ${now - l.expiresAt}ms ago and its holder pid ${l.holder.pid} is not proven dead`,
    }))
}

/** One worktree, one attempt — the fail-closed worktree lock of M39. `claims` maps
 *  worktree path to the attempt that holds it; a claim by a second attempt is
 *  refused while the first is not RELEASED — expiry does not release, death alone
 *  does not release, only the daemon's explicit release after reconciliation does. */
export function claimWorktree({ claims = {}, worktree = null, attempt = {} } = {}) {
  if (typeof worktree !== 'string' || !worktree) return { ok: false, reason: 'a claim names its worktree' }
  if (!attempt.batchId || !attempt.pointId || !attempt.attemptId) return { ok: false, reason: 'a claim names its attempt' }
  if (!Object.hasOwn(claims, worktree)) {
    return { ok: true, claims: Object.freeze({ ...claims, [worktree]: { batchId: attempt.batchId, pointId: attempt.pointId, attemptId: attempt.attemptId } }) }
  }
  const holder = claims[worktree]
  if (sameAttempt(holder, attempt)) return { ok: true, claims, alreadyHeld: true }
  if (!holder || !holder.batchId || !holder.pointId || !holder.attemptId) {
    return { ok: false, reason: 'the worktree claim on record is unreadable; ownership is uncertain and uncertain fails closed' }
  }
  return { ok: false, reason: `the worktree is claimed by attempt ${holder.attemptId}; two attempts never share one worktree` }
}

export function releaseWorktree({ claims = {}, worktree = null, attempt = {} } = {}) {
  if (!Object.hasOwn(claims, worktree)) return { ok: true, claims, released: false }
  if (!sameAttempt(claims[worktree], attempt)) {
    return { ok: false, reason: 'only the claiming attempt releases its worktree; reconciliation releases for the dead' }
  }
  const next = { ...claims }
  delete next[worktree]
  return { ok: true, claims: Object.freeze(next), released: true }
}
