// THE ATTEMPT LEASE — step 4 of the "Ordered work" in docs/handover-architecture.md
// (work-order point 893, the front stage of 676; union M39/M40).
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
import { normalize } from 'node:path'
import { sameAttempt, sameProcess } from './batch-schema-core.mjs'

/** How long a granted lease holds without renewal. Generous against load stalls —
 *  a worker that cannot renew for five minutes is a worker whose machine is in
 *  real trouble — and irrelevant to safety: expiry never frees an AMBIGUOUS lease
 *  (M38); it alerts, and restart happens only after death is proven. */
export const ATTEMPT_LEASE_TTL_MS = 5 * 60 * 1000

/** THE THREE-PART ATTEMPT IDENTITY, AS NAMES. Presence alone accepted an OBJECT as
 *  an id: the identity a lease or a claim record carries was then an ALIAS into the
 *  caller's own object, and freezing — shallow by construction — sealed the record
 *  around a value its caller could still rewrite, so ownership evidence stayed
 *  mutable through a reference this module never saw (cross-vendor review of point
 *  893). It also made equality accidental, because `===` compares two such ids by
 *  reference rather than by name. An id is a name, and a name is a non-empty string;
 *  the record built from it is a FRESH one, so nothing this module hands out shares
 *  an object with what it was given. */
function attemptIdentity(attempt) {
  if (!attempt || typeof attempt !== 'object') return null
  // READ ONCE, THEN JUDGE THE COPY. Validating the caller's object and building the
  // result from a SECOND read is a check on one value and a decision on another.
  const identity = { batchId: attempt.batchId, pointId: attempt.pointId, attemptId: attempt.attemptId }
  const named = (v) => typeof v === 'string' && v !== ''
  if (!named(identity.batchId) || !named(identity.pointId) || !named(identity.attemptId)) return null
  return identity
}

/** THE RECORDS THIS MODULE DECIDES ON ARE READ EXACTLY ONCE, into a snapshot of
 *  plain values, and every guard and every comparison after that reads the SNAPSHOT.
 *  Re-reading a caller's object after validating it decides on a value the guard
 *  never saw: an accessor-backed field answers a valid name to the check and a
 *  shared object to the comparison that follows, so both guards pass while the
 *  comparison matches by reference and frees a claim this module cannot read
 *  (cross-vendor review of point 893). A persisted record has no accessors, but not
 *  every record this module is handed comes from JSON — and the rule costs one copy.
 *  A snapshot that cannot be taken is `null`: unreadable ownership, as everywhere. */
function snapshotHolder(holder) {
  if (!holder || typeof holder !== 'object') return null
  return { pid: holder.pid, pidStartedAt: holder.pidStartedAt }
}

function snapshotLease(lease) {
  if (!lease || typeof lease !== 'object') return null
  // THE READING IS TAKEN WHETHER OR NOT IT IS USABLE, and `usableLease` judges the
  // COPY. Returning null for a malformed lease left its caller with nothing to name
  // it by, so the sweep read the caller's record a second time and a flipping getter
  // attributed the alert to another attempt (cross-vendor review of point 893). What
  // comes back is plain data, so every later read of it is the same value.
  const snapshot = {
    batchId: lease.batchId,
    pointId: lease.pointId,
    attemptId: lease.attemptId,
    leaseId: lease.leaseId,
    holder: snapshotHolder(lease.holder),
    grantedAt: lease.grantedAt,
    expiresAt: lease.expiresAt,
  }
  // An OMITTED renewal stays omitted: `renewedAt: undefined` is a renewal the
  // usability check would have to treat as present-but-unreadable. It is READ ONCE
  // like every other field — testing `lease.renewedAt` and then assigning it again
  // let a getter show a late renewal to the test and an earlier one to the record
  // the clock fence is dated by (cross-vendor review of point 893).
  const renewedAt = lease.renewedAt
  if (renewedAt !== undefined) snapshot.renewedAt = renewedAt
  return snapshot
}

function usableLease(lease) {
  return Boolean(
    lease &&
      typeof lease.leaseId === 'string' &&
      lease.leaseId &&
      lease.holder &&
      Number.isInteger(lease.holder.pid) &&
      lease.holder.pid > 0 &&
      Number.isFinite(lease.holder.pidStartedAt) &&
      // BOTH ENDS OF THE VALIDITY WINDOW, not just the far one. A lease without
      // a grant time cannot be checked against a rolled-back clock at all, and
      // a window that ends before it begins is not a window (cross-vendor review
      // of point 834). Ownership this module cannot date is uncertain ownership.
      Number.isFinite(lease.grantedAt) &&
      Number.isFinite(lease.expiresAt) &&
      lease.expiresAt >= lease.grantedAt &&
      // A renewal stamps its own moment; if one is recorded it must be readable
      // and no earlier than the grant, or the rollback fence below rests on a
      // number this module cannot trust.
      (lease.renewedAt === undefined || (Number.isFinite(lease.renewedAt) && lease.renewedAt >= lease.grantedAt)) &&
      // A persisted lease whose identity is not three names is ownership this
      // module cannot read, exactly like one it cannot date.
      Boolean(attemptIdentity(lease)),
  )
}

/** Every lease this module hands out is sealed DOWN TO ITS IDENTITY. Freezing the
 *  envelope alone left `holder` a plain reference: the renewal spread copied the
 *  one a JSON-restored lease carries — the daemon's persisted state, and the normal
 *  case — so the holder of a returned lease could rewrite whose process owns it and
 *  leaseAllowsWrite then authorised the substituted identity (cross-vendor review of
 *  point 893). The identity is a FRESH frozen record, so no reference anyone already
 *  holds reaches into a lease this module has handed out. */
function sealedLease(lease) {
  return Object.freeze({ ...lease, holder: Object.freeze({ ...lease.holder }) })
}

/** The moment before which a clock is ROLLED BACK for this lease. A renewal keeps
 *  the original grantedAt — that is the lease's identity — so a jump back to a
 *  moment after the grant but before the last renewal used to read as a merely
 *  early clock. The fence is dated at the last evidence the lease has of the
 *  clock's position (cross-vendor review of point 893). */
function clockFloor(lease) {
  return Number.isFinite(lease.renewedAt) ? lease.renewedAt : lease.grantedAt
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
 *      `holderProvenDead: { pid, pidStartedAt }` — the IDENTITY the pid-and-start-time
 *      probe found dead, which must be the holder's own — before the attempt may be
 *      re-granted, and then only as a NEW lease id.
 *  A recycled pid presenting the dead holder's number is caught by sameProcess:
 *  the start time does not match, so it is a different process like any other. */
// NO DEFAULT CLOCK. `now = 0` made an OMITTED clock look like a usable one at the
// epoch: the finiteness guard below passed, and every lease was granted and dated
// in 1970 (cross-vendor review of point 834). A missing clock is missing evidence
// here exactly as it is everywhere else in this file.
export function grantAttemptLease({ existing = null, attempt = {}, holder = {}, now, ttlMs = ATTEMPT_LEASE_TTL_MS, leaseId = null, holderProvenDead = false } = {}) {
  const identity = attemptIdentity(attempt)
  if (!identity) {
    return { ok: false, reason: 'a lease names its batch, point and attempt, each of them a non-empty string' }
  }
  const holderSnapshot = snapshotHolder(holder)
  if (!holderSnapshot || !Number.isInteger(holderSnapshot.pid) || holderSnapshot.pid < 1 || !Number.isFinite(holderSnapshot.pidStartedAt)) {
    return { ok: false, reason: 'a lease holder is a process identity: pid and pid start time' }
  }
  if (!Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    return { ok: false, reason: 'a lease needs a usable clock and ttl' }
  }
  // FINITE INPUTS DO NOT MAKE A FINITE WINDOW: two finite extremes overflow to
  // `expiresAt: Infinity`, and the core answered ok with a lease usableLease
  // itself rejects, fencing the holder on the lease it had just been granted
  // (cross-vendor review of point 893). The end of the term is computed once,
  // here, for every path that mints or extends one — a term that does not end is
  // not a term this module hands out.
  const expiresAt = now + ttlMs
  if (!Number.isFinite(expiresAt)) {
    return { ok: false, reason: 'the lease term does not end at a finite moment; a lease this module could not use is never minted' }
  }
  // ABSENCE IS null OR AN OMITTED FIELD — NOTHING ELSE. `if (existing)` let a
  // persisted `false`, `0`, `''` or `NaN` skip validation entirely and fall
  // through to the fresh grant, so unreadable ownership was interpreted as no
  // ownership (cross-vendor review of point 893). Every other value is a lease
  // this module must read, and failing to read it fails closed.
  const existingLease = existing === null || existing === undefined ? null : snapshotLease(existing)
  if (existing !== null && existing !== undefined) {
    if (!usableLease(existingLease)) {
      // An unreadable lease is UNCERTAIN ownership, and uncertain fails closed
      // (M39) — never "broken, therefore free".
      return { ok: false, reason: 'the existing lease is unreadable; ownership is uncertain and uncertain fails closed' }
    }
    if (!sameAttempt(existingLease, identity)) {
      return { ok: false, reason: 'the existing lease belongs to another attempt; the daemon indexed it wrong' }
    }
    // A CLOCK BEFORE THE LEASE'S OWN LAST EVIDENCE IS NOT EARLINESS, IT IS
    // ROLLBACK, and no decision below — renewal, lapse, duplicate writer, adoption
    // — can be made on a clock that cannot judge expiry. It fences here, before
    // the branches, so a rollback can never buy a silent extension.
    if (now < clockFloor(existingLease)) {
      return { ok: false, reason: `the clock is ${clockFloor(existingLease) - now}ms before this lease's last renewal — a rolled-back clock cannot judge expiry` }
    }
    if (sameProcess(existingLease.holder, holderSnapshot)) {
      if (now <= existingLease.expiresAt) {
        return { ok: true, renewed: true, lease: sealedLease({ ...existingLease, renewedAt: now, expiresAt }) }
      }
      // A LAPSED lease never extends silently (M38): once the renewal persisted,
      // expiredLeaseAlerts could no longer observe the lapse. The lapse is
      // alerted HERE, the stale renewal is refused, and the same process — alive
      // by construction, it is asking — continues only under a NEW lease id the
      // daemon records as a re-grant, never as a resurrection.
      if (typeof leaseId !== 'string' || !leaseId || leaseId === existingLease.leaseId) {
        return {
          ok: false,
          verdict: 'lapsed',
          reason: 'the lease lapsed before this renewal; a lapse alerts and re-grants under a new lease id, it never extends silently (M38)',
          alert: `attempt lease ${existingLease.leaseId} expired ${now - existingLease.expiresAt}ms ago while its holder pid ${existingLease.holder.pid} still lives`,
        }
      }
      return {
        ok: true,
        renewed: false,
        lapsed: true,
        alert: `attempt lease ${existingLease.leaseId} lapsed ${now - existingLease.expiresAt}ms before its holder pid ${holderSnapshot.pid} returned; re-granted as a new lease`,
        lease: sealedLease({
          ...identity,
          leaseId,
          holder: holderSnapshot,
          grantedAt: now,
          expiresAt,
        }),
      }
    }
    if (now <= existingLease.expiresAt) {
      return { ok: false, reason: `duplicate writer: the lease is held by pid ${existingLease.holder.pid} until ${existingLease.expiresAt}` }
    }
    // A DEATH VERDICT IS BOUND TO THE IDENTITY IT WAS REACHED ABOUT. A bare
    // `true` was a verdict about SOME process, and the gate applied it to this
    // lease's holder, so any death anywhere freed an expired lease anywhere
    // (cross-vendor review of point 893). The caller now presents the pid AND
    // pid start time it probed, and sameProcess decides — so a recycled pid,
    // proven dead under the holder's number, still frees nothing.
    const deathVerdict = holderProvenDead && typeof holderProvenDead === 'object' ? snapshotHolder(holderProvenDead) : null
    if (!deathVerdict) {
      return {
        ok: false,
        verdict: 'stale-holder',
        reason:
          holderProvenDead === false || holderProvenDead === null || holderProvenDead === undefined
            ? 'the lease has expired but its holder is not proven dead; expiry alerts, it does not free (M38)'
            : 'the death verdict names no process identity; an unbound verdict proves nothing and frees nothing (M39)',
      }
    }
    if (!sameProcess(existingLease.holder, deathVerdict)) {
      return {
        ok: false,
        verdict: 'stale-holder',
        reason: `the death verdict is about pid ${deathVerdict.pid}, not this lease's holder pid ${existingLease.holder.pid}; a verdict frees only the identity it was reached about`,
      }
    }
  }
  if (typeof leaseId !== 'string' || !leaseId) return { ok: false, reason: 'a grant mints a fresh lease id; none was supplied' }
  if (existingLease && leaseId === existingLease.leaseId) {
    return { ok: false, reason: 'a re-grant after death is a NEW lease id, never a resurrection of the old one' }
  }
  return {
    ok: true,
    renewed: false,
    lease: sealedLease({
      ...identity,
      leaseId,
      holder: holderSnapshot,
      grantedAt: now,
      expiresAt,
    }),
  }
}

/** The check a worker runs BEFORE every checkpoint and push (M40). Anything but a
 *  full affirmative match is `fenced`, and a fenced worker STOPS and leaves its
 *  branch intact — the reasons differ so the operator learns what happened, the
 *  verdict never does. */
export function leaseAllowsWrite({ lease = null, holder = {}, leaseId = null, now } = {}) {
  // The clock is part of the evidence: without a finite `now` the expiry
  // comparison below is vacuously false and an expired lease would answer
  // `write`. Missing evidence fences, like every other uncertainty here.
  if (!Number.isFinite(now)) return { verdict: 'fenced', reason: 'no finite current time was supplied; expiry cannot be judged and uncertain fails closed' }
  const held = snapshotLease(lease)
  if (!usableLease(held)) return { verdict: 'fenced', reason: 'no usable lease; ownership is uncertain and uncertain fails closed' }
  if (typeof leaseId !== 'string' || !leaseId || leaseId !== held.leaseId) {
    return { verdict: 'fenced', reason: 'the lease id presented is not the lease that stands; this attempt was re-granted' }
  }
  if (!sameProcess(held.holder, snapshotHolder(holder))) {
    return { verdict: 'fenced', reason: 'the lease is held by another process identity; a recycled pid does not inherit it' }
  }
  // A CLOCK BEFORE THE LEASE'S LAST EVIDENCE IS NOT EARLINESS, IT IS ROLLBACK, and
  // a rolled-back clock makes every expiry comparison below meaningless — the lease
  // would read valid for as long as the rollback lasts, which is precisely the
  // window a fenced worker must not write in.
  if (now < clockFloor(held)) {
    return { verdict: 'fenced', reason: `the clock is ${clockFloor(held) - now}ms before this lease's last renewal — a rolled-back clock cannot judge expiry` }
  }
  if (now > held.expiresAt) {
    return { verdict: 'fenced', reason: 'the lease has expired; renew through the daemon before writing, or stop' }
  }
  // The evidence a passed check hands back is sealed too: a `write` verdict must
  // not carry a record anything downstream can rewrite.
  return { verdict: 'write', lease: sealedLease(held) }
}

/** Expiry is LOUD (M18/M38): every expired lease is an alert naming its attempt,
 *  never merely an unblocked slot. The daemon raises these; it frees nothing.
 *  A MALFORMED lease is louder still, not quieter: it is durable ownership this
 *  module can no longer read, and silently skipping it would hide exactly the
 *  uncertainty the rest of this file fails closed on. The same goes for a clock
 *  this function cannot use — with no finite `now`, every lease is reported as
 *  unjudgeable rather than silently fresh. */
export function expiredLeaseAlerts({ leases = [], now } = {}) {
  const UNNAMED = { batchId: null, pointId: null, attemptId: null }
  // An attempt is NAMED in an alert only by what reads as a name; a malformed lease
  // is reported, and reporting it must not hand an object into a message.
  const named = (v) => (typeof v === 'string' && v ? v : null)
  // A COLLECTION THIS FUNCTION CANNOT READ IS AN ALERT, NOT A CRASH. `leases.map`
  // threw on any persisted value that is not an array, and a sweep that throws
  // raises no alert for ANY lease — precisely the silence this function must never
  // answer. Absence is null or an omitted field, as it is everywhere else here.
  if (leases === null || leases === undefined) return []
  if (!Array.isArray(leases)) {
    return [{ ...UNNAMED, alert: 'the persisted attempt leases are unreadable; ownership is uncertain and it is quarantined, not skipped' }]
  }
  return leases.flatMap((raw) => {
    // ONE READING PER LEASE, AND A READING THAT THROWS IS ITS OWN ALERT. The
    // malformed path reached back through the failed snapshot to name the attempt,
    // so a getter that succeeded once and threw on the second call took the WHOLE
    // sweep down — and a sweep that throws raises no alert for any lease, which is
    // the silence this function exists to prevent (cross-vendor review of point 893).
    let lease = null
    let name = UNNAMED
    try {
      lease = snapshotLease(raw)
      name = { batchId: named(lease?.batchId), pointId: named(lease?.pointId), attemptId: named(lease?.attemptId) }
    } catch {
      return [{ ...UNNAMED, alert: 'a persisted attempt lease could not be read at all; its ownership is uncertain and it is quarantined, not skipped' }]
    }
    if (!Number.isFinite(now)) {
      return [{ ...name, alert: 'no finite current time was supplied; this lease cannot be judged and stands unverified' }]
    }
    const l = lease
    if (!usableLease(l)) {
      return [{ ...name, alert: 'a persisted attempt lease is malformed; its ownership is uncertain and it is quarantined, not skipped' }]
    }
    // A CLOCK BEHIND THE LEASE'S LAST EVIDENCE IS THE ONE STATE THIS FUNCTION MUST
    // NOT REPORT AS FRESH. `now <= expiresAt` holds for the whole length of a
    // rollback, so a rolled-back clock silenced the alert on exactly the state
    // every other decision here fences (cross-vendor review of point 893). An
    // unusable clock is an alert here as it is a refusal everywhere else.
    if (now < clockFloor(l)) {
      return [{ ...name, alert: `the clock is ${clockFloor(l) - now}ms before this lease's last renewal — a rolled-back clock cannot judge expiry` }]
    }
    if (now <= l.expiresAt) return []
    return [{ ...name, alert: `attempt lease expired ${now - l.expiresAt}ms ago and its holder pid ${l.holder.pid} is not proven dead` }]
  })
}

/** The KEY a worktree is claimed under: absolute, lexically normalised, trailing
 *  separators stripped — `/wt/a/.`, `/wt//a` and `/wt/a/` all key as `/wt/a`, so
 *  a raw-string alias cannot defeat the one-worktree/one-attempt invariant.
 *  SYMLINK aliases cannot be resolved purely: the daemon realpath-resolves every
 *  path BEFORE presenting it here (canonicalWorktree in batch-daemon.mjs), and
 *  that resolution is pinned by its own test. */
export function worktreeClaimKey(worktree) {
  if (typeof worktree !== 'string' || !worktree.startsWith('/')) {
    return { ok: false, reason: 'a worktree claim needs an absolute path' }
  }
  // normalize resolves every `.` and `..` segment of an absolute path (the
  // root's parent is the root), so the key can no longer carry either.
  let key = normalize(worktree)
  while (key.length > 1 && key.endsWith('/')) key = key.slice(0, -1)
  return { ok: true, key }
}

/** The claims map a caller presents, or a refusal. Absence is null or an omitted
 *  field — exactly as it is for a lease — and every other unreadable value is
 *  uncertain ownership. `Object.hasOwn` answers false on a primitive, so a
 *  persisted `false`, `0`, `''` or `NaN` fell through to the fresh-claim path and
 *  the worktree was handed out as if nothing held it, while a persisted string was
 *  spread into a map of its own characters and a null map threw (hostile re-read of
 *  point 893, the class the review closed for the existing lease). */
function readClaims(claims) {
  if (claims === null || claims === undefined) return { ok: true, claims: {} }
  if (typeof claims !== 'object' || Array.isArray(claims)) {
    return { ok: false, reason: 'the worktree claims on record are unreadable; ownership is uncertain and uncertain fails closed' }
  }
  // A STORED KEY IS ITSELF A CANONICAL WORKTREE KEY. Canonicalising only the
  // REQUESTED path left the alias open from the other side: a map keyed `/wt/a/`
  // answered `hasOwn('/wt/a')` with false, so a second attempt was granted the
  // worktree the first one holds and the map came back carrying both spellings —
  // one worktree, two attempts, which is the single invariant this function exists
  // for (cross-vendor review of point 893). Only this module writes these keys, and
  // it writes them canonical, so any other spelling is corrupted or hand-edited
  // ownership: unreadable, and unreadable fails closed rather than being tidied
  // into a key nobody persisted.
  // AND THE MAP IS READ HERE, ONCE, INTO PLAIN RECORDS. Every decision below — the
  // occupancy test, the identity comparison, the map that is handed back — used to
  // reach through to the caller's own records, so an accessor could show a valid
  // name to the guard and another value to the comparison or to the sealing that
  // followed (cross-vendor review of point 893). A record is copied field by field
  // and NOT tidied: an unreadable one stays exactly as unreadable as it was, so the
  // collision path still fails closed on it. A record whose own reading THROWS is
  // the loudest kind of unreadable and is answered as such, never as a crash.
  const read = {}
  try {
    for (const [key, record] of Object.entries(claims)) {
      const keyed = worktreeClaimKey(key)
      if (!keyed.ok || keyed.key !== key) {
        return {
          ok: false,
          reason: `the worktree claims on record carry the non-canonical key ${JSON.stringify(key)}; which attempt holds a worktree is then uncertain, and uncertain fails closed`,
        }
      }
      read[key] = record && typeof record === 'object' ? { ...record } : record
    }
  } catch {
    return { ok: false, reason: 'the worktree claims on record could not be read at all; ownership is uncertain and uncertain fails closed' }
  }
  return { ok: true, claims: read }
}

/** Every claims map this module hands out is sealed DOWN TO ITS RECORDS, and the
 *  records are fresh copies. A frozen map around writable records, or a map handed
 *  straight back to its caller, is ownership evidence its holder can rewrite: the
 *  idempotent claim and the no-op release returned the caller's own map, and the
 *  successful release froze a new map around the records it had been given
 *  (cross-vendor review of point 893, the class behind its findings 1 and 2). A
 *  record this module cannot read passes through untouched, so the collision path
 *  still fails closed on it rather than seeing a tidied copy. */
function sealedClaims(claims) {
  // fromEntries and not `sealed[key] = …`: a persisted map carrying a `__proto__`
  // key — JSON.parse makes it an OWN property — would set the new map's PROTOTYPE
  // instead of storing the entry, so the map handed out silently lost a key and
  // carried a claim record as its prototype.
  return Object.freeze(
    Object.fromEntries(
      Object.entries(claims).map(([key, record]) => [key, record && typeof record === 'object' ? Object.freeze({ ...record }) : record]),
    ),
  )
}

/** One worktree, one attempt — the fail-closed worktree lock of M39. `claims` maps
 *  the CANONICAL worktree key to the attempt that holds it; a claim by a second
 *  attempt is refused while the first is not RELEASED — expiry does not release,
 *  death alone does not release, only the daemon's explicit release after
 *  reconciliation does. The claim RECORD is frozen with the map: a frozen map
 *  around a writable record let a holder relabel ownership, after which another
 *  attempt read as the holder (cross-vendor review of point 893). */
export function claimWorktree({ claims = {}, worktree = null, attempt = {} } = {}) {
  const read = readClaims(claims)
  if (!read.ok) return { ok: false, reason: read.reason }
  claims = read.claims
  const keyed = worktreeClaimKey(worktree)
  if (!keyed.ok) return { ok: false, reason: keyed.reason }
  const identity = attemptIdentity(attempt)
  if (!identity) return { ok: false, reason: 'a claim names its attempt, each part of it a non-empty string' }
  if (!Object.hasOwn(claims, keyed.key)) {
    return { ok: true, claims: sealedClaims({ ...claims, [keyed.key]: identity }) }
  }
  const holder = attemptIdentity(claims[keyed.key])
  if (!holder) {
    return { ok: false, reason: 'the worktree claim on record is unreadable; ownership is uncertain and uncertain fails closed' }
  }
  if (sameAttempt(holder, identity)) return { ok: true, claims: sealedClaims(claims), alreadyHeld: true }
  return { ok: false, reason: `the worktree is claimed by attempt ${holder.attemptId}; two attempts never share one worktree` }
}

export function releaseWorktree({ claims = {}, worktree = null, attempt = {} } = {}) {
  // A release out of a map this module cannot read is a freeing action taken on
  // unknown ownership, so it refuses here exactly as the claim does.
  const read = readClaims(claims)
  if (!read.ok) return { ok: false, reason: read.reason }
  claims = read.claims
  // BOTH IDENTITIES ARE READ BEFORE THEY ARE COMPARED, as the claim reads them.
  // sameAttempt compares with ===, so a stored record and a request carrying the
  // SAME object as an id matched by reference: a claim this module cannot read was
  // released by whoever held that object, and the worktree it had guarded was free
  // for the next attempt (cross-vendor review of point 893). Unreadable ownership
  // fails closed on the freeing side too — that is the side where it lets a second
  // attempt in.
  const identity = attemptIdentity(attempt)
  if (!identity) return { ok: false, reason: 'a release names its attempt, each part of it a non-empty string' }
  const keyed = worktreeClaimKey(worktree)
  // An unkeyable path can never be a stored key, so there is nothing to release.
  if (!keyed.ok || !Object.hasOwn(claims, keyed.key)) return { ok: true, claims: sealedClaims(claims), released: false }
  const holder = attemptIdentity(claims[keyed.key])
  if (!holder) {
    return { ok: false, reason: 'the worktree claim on record is unreadable; ownership is uncertain and uncertain fails closed' }
  }
  if (!sameAttempt(holder, identity)) {
    return { ok: false, reason: 'only the claiming attempt releases its worktree; reconciliation releases for the dead' }
  }
  const next = { ...claims }
  delete next[keyed.key]
  return { ok: true, claims: sealedClaims(next), released: true }
}
