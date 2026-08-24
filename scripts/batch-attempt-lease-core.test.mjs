// THE ATTEMPT LEASE'S DECISIONS (point 893, step 4): duplicate writers refused,
// PID reuse caught by start time, expiry loud but never freeing, a fenced worker
// stopped before it writes, and worktree claims that fail closed on uncertainty.
import { describe, it, expect } from 'vitest'
import {
  ATTEMPT_LEASE_TTL_MS,
  claimWorktree,
  expiredLeaseAlerts,
  grantAttemptLease,
  leaseAllowsWrite,
  releaseWorktree,
} from './batch-attempt-lease-core.mjs'

const attempt = { batchId: 'b', pointId: 'p834', attemptId: 'a1' }
const holder = { pid: 100, pidStartedAt: 5000 }
const grant = (over = {}) =>
  grantAttemptLease({ attempt, holder, now: 10_000, leaseId: 'L1', ...over })

describe('grantAttemptLease', () => {
  it('grants a fresh lease and renews for the same process under the same id', () => {
    const first = grant()
    expect(first.ok).toBe(true)
    expect(first.lease.expiresAt).toBe(10_000 + ATTEMPT_LEASE_TTL_MS)
    const renewed = grant({ existing: first.lease, now: 20_000 })
    expect(renewed).toMatchObject({ ok: true, renewed: true })
    expect(renewed.lease.leaseId).toBe('L1')
    expect(renewed.lease.expiresAt).toBe(20_000 + ATTEMPT_LEASE_TTL_MS)
  })

  it('freezes the identity a RENEWED lease carries, not merely the envelope around it', () => {
    // The renewal spread `{ ...existing }`, which copies the REFERENCE to the
    // holder, and freezing the outer object leaves that reference writable. The
    // suite only ever renewed a freshly GRANTED lease, whose holder the grant path
    // had already frozen; a lease restored from JSON — the daemon's persisted
    // state, and the normal case — carries an unfrozen holder, so whoever held the
    // renewal could rewrite whose process owns it and this module believed the
    // rewrite (cross-vendor review of point 893).
    const persisted = JSON.parse(JSON.stringify(grant().lease))
    const renewed = grant({ existing: persisted, now: 20_000 })
    expect(renewed).toMatchObject({ ok: true, renewed: true })
    expect(Object.isFrozen(renewed.lease.holder)).toBe(true)
    const impostor = { pid: 999, pidStartedAt: 7000 }
    try {
      renewed.lease.holder.pid = impostor.pid
      renewed.lease.holder.pidStartedAt = impostor.pidStartedAt
    } catch {
      // A frozen holder throws on assignment under module strict mode — that IS the fix.
    }
    expect(renewed.lease.holder).toEqual(holder)
    expect(leaseAllowsWrite({ lease: renewed.lease, holder: impostor, leaseId: 'L1', now: 20_000 }).verdict).toBe('fenced')
    // Nor may it alias the persisted record it was renewed from.
    persisted.holder.pid = 999
    expect(renewed.lease.holder.pid).toBe(holder.pid)
  })

  it('hands the write verdict a sealed lease rather than the record the caller supplied', () => {
    // `leaseAllowsWrite` returned the very object it was handed, so the evidence a
    // passed check produces carried a rewritable identity for as long as anything
    // downstream held it (cross-vendor review of point 893).
    const persisted = JSON.parse(JSON.stringify(grant().lease))
    const allowed = leaseAllowsWrite({ lease: persisted, holder, leaseId: 'L1', now: 20_000 })
    expect(allowed.verdict).toBe('write')
    expect(Object.isFrozen(allowed.lease)).toBe(true)
    expect(Object.isFrozen(allowed.lease.holder)).toBe(true)
    persisted.holder.pid = 999
    expect(allowed.lease.holder.pid).toBe(holder.pid)
  })

  it('never extends a LAPSED lease silently: the same holder is alerted and re-granted under a new id', () => {
    const first = grant().lease
    const after = 10_000 + ATTEMPT_LEASE_TTL_MS + 1
    // The renewal a holder attempts long after expiry: refused WITH the alert —
    // a persisted extension would blind expiredLeaseAlerts to the lapse.
    const stale = grant({ existing: first, now: after })
    expect(stale).toMatchObject({ ok: false, verdict: 'lapsed' })
    expect(stale.alert).toMatch(/expired .*ms ago/)
    // The same lease id is a resurrection, not a re-grant.
    const resurrection = grant({ existing: first, now: after, leaseId: 'L1' })
    expect(resurrection.ok).toBe(false)
    // Under a NEW id the living holder continues — loudly, marked as lapsed.
    const regrant = grant({ existing: first, now: after, leaseId: 'L2' })
    expect(regrant).toMatchObject({ ok: true, renewed: false, lapsed: true })
    expect(regrant.lease.leaseId).toBe('L2')
    expect(regrant.alert).toMatch(/lapsed/)
  })

  it('refuses a second process while the lease is live — the duplicate writer of M39', () => {
    const first = grant().lease
    const second = grant({ existing: first, holder: { pid: 200, pidStartedAt: 6000 }, now: 20_000, leaseId: 'L2' })
    expect(second.ok).toBe(false)
    expect(second.reason).toMatch(/duplicate writer/)
  })

  it('treats a recycled pid as a different process: same number, other start time', () => {
    const first = grant().lease
    const recycled = grant({ existing: first, holder: { pid: 100, pidStartedAt: 99_000 }, now: 20_000, leaseId: 'L2' })
    expect(recycled.ok).toBe(false)
  })

  it('refuses to re-grant after expiry until death is PROVEN, then only under a new lease id', () => {
    const first = grant().lease
    const after = 10_000 + ATTEMPT_LEASE_TTL_MS + 1
    const unproven = grant({ existing: first, holder: { pid: 200, pidStartedAt: 6000 }, now: after, leaseId: 'L2' })
    expect(unproven).toMatchObject({ ok: false, verdict: 'stale-holder' })
    const resurrection = grant({ existing: first, holder: { pid: 200, pidStartedAt: 6000 }, now: after, leaseId: 'L1', holderProvenDead: holder })
    expect(resurrection.ok).toBe(false)
    expect(resurrection.reason).toMatch(/NEW lease id/)
    const regrant = grant({ existing: first, holder: { pid: 200, pidStartedAt: 6000 }, now: after, leaseId: 'L2', holderProvenDead: holder })
    expect(regrant.ok).toBe(true)
    expect(regrant.lease.leaseId).toBe('L2')
  })

  it('binds a death verdict to the identity that was probed, and refuses an unbound one', () => {
    // A bare `holderProvenDead: true` is a verdict about SOME process; the gate
    // read it as a verdict about THIS holder, so any death anywhere freed an
    // expired lease (cross-vendor review of point 893). The verdict now names the
    // identity it was reached about, and only that identity's lease is adopted.
    const first = grant().lease
    const after = 10_000 + ATTEMPT_LEASE_TTL_MS + 1
    const other = { pid: 200, pidStartedAt: 6000 }
    const unbound = grant({ existing: first, holder: other, now: after, leaseId: 'L2', holderProvenDead: true })
    expect(unbound).toMatchObject({ ok: false, verdict: 'stale-holder' })
    expect(unbound.reason).toMatch(/names no process identity/)
    const wrongPid = grant({ existing: first, holder: other, now: after, leaseId: 'L2', holderProvenDead: { pid: 999, pidStartedAt: 5000 } })
    expect(wrongPid).toMatchObject({ ok: false, verdict: 'stale-holder' })
    // A recycled pid proven dead is a DIFFERENT process from the holder, so its
    // death says nothing about the lease.
    const recycled = grant({ existing: first, holder: other, now: after, leaseId: 'L2', holderProvenDead: { pid: 100, pidStartedAt: 99_000 } })
    expect(recycled).toMatchObject({ ok: false, verdict: 'stale-holder' })
    const bound = grant({ existing: first, holder: other, now: after, leaseId: 'L2', holderProvenDead: { pid: 100, pidStartedAt: 5000 } })
    expect(bound.ok).toBe(true)
    expect(bound.lease.leaseId).toBe('L2')
  })

  it('fences a rolled-back clock at renewal, and dates the fence at the last renewal', () => {
    // The renewal branch asked only `now <= expiresAt`, which a clock BEFORE the
    // grant satisfies as comfortably as one inside the term, so a rollback bought
    // a silent extension (cross-vendor review of point 893).
    const first = grant().lease
    const rolled = grant({ existing: first, now: first.grantedAt - 60_000 })
    expect(rolled.ok).toBe(false)
    expect(rolled.reason).toMatch(/rolled-back clock/)
    // And because a renewal keeps the original grantedAt, a jump back to a moment
    // AFTER the grant but BEFORE the last renewal slipped past the write-side
    // rollback check too. The fence is dated at the last renewal, not the grant.
    const renewed = grant({ existing: first, now: 200_000 })
    expect(renewed).toMatchObject({ ok: true, renewed: true })
    expect(grant({ existing: renewed.lease, now: 20_000 }).reason).toMatch(/rolled-back clock/)
    expect(leaseAllowsWrite({ lease: renewed.lease, holder, leaseId: 'L1', now: 20_000 }).verdict).toBe('fenced')
    expect(leaseAllowsWrite({ lease: renewed.lease, holder, leaseId: 'L1', now: 200_000 }).verdict).toBe('write')
  })

  it('fails closed on an unreadable existing lease instead of treating broken as free', () => {
    const broken = grant({ existing: { leaseId: 'L0' }, leaseId: 'L2' })
    expect(broken.ok).toBe(false)
    expect(broken.reason).toMatch(/uncertain fails closed/)
  })

  it('quarantines a FALSEY persisted lease instead of reading it as no lease at all', () => {
    // `if (existing)` sent `false`, `0`, `''` and `NaN` straight to the fresh-grant
    // path, so a persisted value this module cannot read was interpreted as
    // absence and the attempt was granted to a second process (cross-vendor
    // review of point 893). Unreadable is uncertain, and uncertain fails closed.
    for (const persisted of [false, 0, '', NaN]) {
      const res = grant({ existing: persisted, leaseId: 'L2' })
      expect(res.ok, String(persisted)).toBe(false)
      expect(res.reason, String(persisted)).toMatch(/uncertain fails closed/)
    }
    // Absence is null or an omitted field, and only absence grants.
    expect(grant({ existing: null }).ok).toBe(true)
    expect(grant({ existing: undefined }).ok).toBe(true)
  })

  it('never mints a lease whose term does not end at a finite moment', () => {
    // `now` and `ttlMs` were each checked for finiteness, but their SUM was not,
    // so finite extremes overflowed to `expiresAt: Infinity` and the core
    // answered ok with a lease usableLease itself rejects — a holder would be
    // fenced on the very lease it had just been granted (cross-vendor review of
    // point 893).
    const fresh = grantAttemptLease({ attempt, holder, now: Number.MAX_VALUE, ttlMs: Number.MAX_VALUE, leaseId: 'L1' })
    expect(fresh.ok).toBe(false)
    expect(fresh.reason).toMatch(/finite moment/)
    // The renewal mints the same window and must refuse it for the same reason.
    const wide = { ...attempt, leaseId: 'L1', holder, grantedAt: 0, expiresAt: Number.MAX_VALUE }
    const renewal = grantAttemptLease({ existing: wide, attempt, holder, now: Number.MAX_VALUE, ttlMs: Number.MAX_VALUE, leaseId: 'L1' })
    expect(renewal.ok).toBe(false)
    expect(renewal.reason).toMatch(/finite moment/)
  })

  it('refuses an incomplete attempt, holder or clock', () => {
    expect(grantAttemptLease({ attempt: { batchId: 'b' }, holder, now: 1, leaseId: 'L1' }).ok).toBe(false)
    expect(grantAttemptLease({ attempt, holder: { pid: 100 }, now: 1, leaseId: 'L1' }).ok).toBe(false)
    expect(grantAttemptLease({ attempt, holder, now: NaN, leaseId: 'L1' }).ok).toBe(false)
    expect(grantAttemptLease({ attempt, holder, now: 1 }).ok).toBe(false)
  })

  it('refuses an attempt identity that is not three names, and quarantines a lease carrying one', () => {
    // Presence alone accepted an OBJECT as an id, and freezing is shallow: the
    // identity the returned lease carried was then the CALLER's own object, still
    // writable through the reference it kept, so the sealing this module promises
    // stopped at the envelope. Equality was accidental too — `===` compares such
    // ids by reference, so two attempts naming the same batch read as different
    // ones (cross-vendor review of point 893).
    for (const id of [{ value: 'b' }, ['b'], 1, true, '']) {
      const res = grant({ attempt: { ...attempt, batchId: id } })
      expect(res.ok, JSON.stringify(id)).toBe(false)
      expect(res.reason, JSON.stringify(id)).toMatch(/non-empty string/)
    }
    // The identity a granted lease hands out is a fresh record, not the caller's.
    const mutable = { batchId: 'b', pointId: 'p834', attemptId: 'a1' }
    const lease = grant({ attempt: mutable }).lease
    mutable.attemptId = 'a2'
    expect(lease.attemptId).toBe('a1')
    // And a PERSISTED lease whose identity is not three names is ownership this
    // module cannot read: it fences the writer and the sweep quarantines it.
    const aliased = { ...lease, batchId: { value: 'b' } }
    expect(leaseAllowsWrite({ lease: aliased, holder, leaseId: 'L1', now: 20_000 }).verdict).toBe('fenced')
    expect(expiredLeaseAlerts({ leases: [aliased], now: 20_000 })[0].alert).toMatch(/malformed/)
  })
})

describe('leaseAllowsWrite — the check before every checkpoint and push (M40)', () => {
  const lease = grant().lease

  it('allows the holder with the standing lease id inside its term', () => {
    expect(leaseAllowsWrite({ lease, holder, leaseId: 'L1', now: 20_000 }).verdict).toBe('write')
  })

  it('fences everything else, and a fenced worker stops with its branch intact', () => {
    expect(leaseAllowsWrite({ lease: null, holder, leaseId: 'L1', now: 20_000 }).verdict).toBe('fenced')
    expect(leaseAllowsWrite({ lease, holder, leaseId: 'L2', now: 20_000 }).verdict).toBe('fenced')
    expect(leaseAllowsWrite({ lease, holder: { pid: 100, pidStartedAt: 99_000 }, leaseId: 'L1', now: 20_000 }).verdict).toBe('fenced')
    expect(leaseAllowsWrite({ lease, holder, leaseId: 'L1', now: 10_000 + ATTEMPT_LEASE_TTL_MS + 1 }).verdict).toBe('fenced')
  })

  it('fences on a missing or non-finite clock instead of writing on an expired lease', () => {
    // With no usable `now`, the expiry comparison is vacuously false; an
    // expired lease would otherwise answer `write`.
    for (const now of [undefined, NaN, Infinity, -Infinity]) {
      const res = leaseAllowsWrite({ lease, holder, leaseId: 'L1', now })
      expect(res.verdict, String(now)).toBe('fenced')
      expect(res.reason, String(now)).toMatch(/finite current time/)
    }
  })
})

describe('the clock a lease is judged against — cross-vendor review of point 834', () => {
  it('refuses to grant without a clock instead of dating the lease at the epoch', () => {
    // `now` used to default to 0, so an OMITTED clock passed the finiteness guard
    // and every lease was granted and dated in 1970 — a lease that has been
    // expired since before the batch existed, or, read the other way, evidence
    // nobody supplied.
    const res = grantAttemptLease({ attempt, holder, leaseId: 'L1' })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/usable clock/)
  })

  it('fences a rolled-back clock rather than reading the lease as unexpired', () => {
    // Expiry was judged with `now > expiresAt` alone. A clock BEFORE the grant
    // satisfies that as comfortably as a clock inside the term, so a rollback
    // handed the holder a valid-looking lease for the length of the rollback.
    const lease = grant().lease
    const res = leaseAllowsWrite({ lease, holder, leaseId: 'L1', now: lease.grantedAt - 60_000 })
    expect(res.verdict).toBe('fenced')
    expect(res.reason).toMatch(/rolled-back clock/)
    // The moment of the grant itself is not a rollback.
    expect(leaseAllowsWrite({ lease, holder, leaseId: 'L1', now: lease.grantedAt }).verdict).toBe('write')
  })

  it('fences a persisted lease that carries no grant time, or an impossible window', () => {
    // Without `grantedAt` the rollback check above cannot run at all, so such a
    // lease is unreadable ownership, not a lease missing a decoration.
    const lease = grant().lease
    const { grantedAt: _grantedAt, ...ungranted } = lease
    expect(leaseAllowsWrite({ lease: ungranted, holder, leaseId: 'L1', now: 20_000 }).verdict).toBe('fenced')
    const inverted = { ...lease, expiresAt: lease.grantedAt - 1 }
    expect(leaseAllowsWrite({ lease: inverted, holder, leaseId: 'L1', now: lease.grantedAt }).verdict).toBe('fenced')
  })
})

describe('a record is read once — the accessor class of the cross-vendor review', () => {
  const flipping = (first, second) => {
    let read = 0
    return () => (read++ === 0 ? first : second)
  }

  it('dates the clock fence at the renewal it READ, not at a later reading of it', () => {
    // `if (lease.renewedAt !== undefined) snapshot.renewedAt = lease.renewedAt`
    // read the field twice: a getter showed a late renewal to the test and an
    // earlier one to the record the fence is dated by, so the rolled-back clock
    // this module fences on read as merely early again.
    const late = flipping(30_000, 12_000)
    const persisted = { ...grant().lease, get renewedAt() { return late() } }
    const res = leaseAllowsWrite({ lease: persisted, holder, leaseId: 'L1', now: 15_000 })
    expect(res.verdict).toBe('fenced')
    expect(res.reason).toMatch(/rolled-back clock/)
  })

  it('hands back the ownership it VALIDATED after an idempotent claim', () => {
    // The occupancy test ran on the validated identity while the map handed back
    // was sealed around a SECOND reading of the same record: a1's idempotent claim
    // returned frozen ownership naming a2, and a2 could then release the worktree
    // a1 holds.
    const attemptId = flipping('a1', 'a2')
    const stored = { batchId: 'b', pointId: 'p834', get attemptId() { return attemptId() } }
    const held = claimWorktree({ claims: { '/wt/a': stored }, worktree: '/wt/a', attempt })
    expect(held).toMatchObject({ ok: true, alreadyHeld: true })
    expect(held.claims['/wt/a'].attemptId).toBe('a1')
    expect(releaseWorktree({ claims: held.claims, worktree: '/wt/a', attempt: { ...attempt, attemptId: 'a2' } }).ok).toBe(false)
  })

  it('names a malformed lease by the reading it took, not by a later one', () => {
    // A malformed lease returned no snapshot at all, so the sweep read the caller's
    // record again to name it: a getter answering one attempt to the snapshot and
    // ANOTHER to the alert attributed the quarantine to an attempt that never held
    // the lease — and an alert that names the wrong owner is worse than a silent one.
    const batchId = flipping('b', 'someone-else')
    const malformed = {
      get batchId() { return batchId() },
      pointId: 'p834',
      attemptId: 'aX',
      leaseId: 'LX',
      holder: null,
      grantedAt: 10_000,
      expiresAt: 20_000,
    }
    const alerts = expiredLeaseAlerts({ leases: [malformed], now: 30_000 })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].alert).toMatch(/malformed/)
    expect(alerts[0].batchId).toBe('b')
  })

  it('quarantines a lease whose reading THROWS instead of losing the whole sweep', () => {
    // The sweep read every lease directly, so a record whose own reading throws
    // took the entire sweep down with it — and a sweep that throws raises no alert
    // for ANY lease, which is the silence this function exists to prevent. Such a
    // lease is quarantined without a name, and the leases beside it are still
    // reported.
    const hostile = {
      get batchId() { throw new Error('unreadable') },
      pointId: 'p834',
      attemptId: 'aX',
      leaseId: 'LX',
      holder: null,
      grantedAt: 10_000,
      expiresAt: 20_000,
    }
    const expired = grant().lease
    const alerts = expiredLeaseAlerts({ leases: [hostile, expired], now: 10_000 + ATTEMPT_LEASE_TTL_MS + 500 })
    expect(alerts).toHaveLength(2)
    expect(alerts[0].alert).toMatch(/could not be read at all/)
    expect(alerts[0].attemptId).toBeNull()
    expect(alerts[1].alert).toMatch(/expired/)
    expect(alerts[1].attemptId).toBe('a1')
  })

  it('keeps an unreadable HOLDER distinguishable from an absent one', () => {
    // The holder's reading was taken inside the lease's and its failure collapsed
    // into `holder: null` — indistinguishable from a lease that carries no holder.
    // The sweep then called such a lease MALFORMED, a statement about its content,
    // when the truth is that no reading could be taken at all.
    const unreadableHolder = { ...grant().lease, holder: { get pid() { throw new Error('unreadable') }, pidStartedAt: 5000 } }
    const alerts = expiredLeaseAlerts({ leases: [unreadableHolder], now: 30_000 })
    expect(alerts[0].alert).toMatch(/could not be read at all/)
    // An ABSENT holder stays what it is: a lease this module can read and refuse.
    const noHolder = { ...grant().lease, holder: null }
    expect(expiredLeaseAlerts({ leases: [noHolder], now: 30_000 })[0].alert).toMatch(/malformed/)
    // Both fail closed for the writer, as every unreadable record does.
    expect(leaseAllowsWrite({ lease: unreadableHolder, holder, leaseId: 'L1', now: 15_000 }).verdict).toBe('fenced')
    expect(grantAttemptLease({ existing: unreadableHolder, attempt, holder, now: 15_000, leaseId: 'L2' }).ok).toBe(false)
  })

  it('reads a CALLABLE record like any other reference instead of stepping around it', () => {
    // The isolated readings all tested `typeof x === 'object'`, which a function is
    // not — so a callable holder walked past every one of them while the checks
    // that followed still read its fields: a throwing accessor crashed the sweep
    // and the write check, and numeric fields read as usable through a reference
    // this module had never copied.
    const callable = (fields) => Object.assign(function holderFn() {}, fields)
    const throwing = callable({ pidStartedAt: 5000 })
    Object.defineProperty(throwing, 'pid', { get() { throw new Error('unreadable') } })
    const hostile = { ...grant().lease, holder: throwing }
    expect(expiredLeaseAlerts({ leases: [hostile], now: 30_000 })[0].alert).toMatch(/could not be read at all/)
    expect(leaseAllowsWrite({ lease: hostile, holder, leaseId: 'L1', now: 15_000 }).verdict).toBe('fenced')
    expect(grantAttemptLease({ existing: hostile, attempt, holder, now: 15_000, leaseId: 'L2' }).ok).toBe(false)
    // What a record IS decides nothing; what it says decides everything, and the
    // copy that decides it is plain — the callable never reaches a verdict.
    const readable = { ...grant().lease, holder: callable({ pid: 100, pidStartedAt: 5000 }) }
    const allowed = leaseAllowsWrite({ lease: readable, holder, leaseId: 'L1', now: 15_000 })
    expect(allowed.verdict).toBe('write')
    expect(typeof allowed.lease.holder).toBe('object')
    // And a claim record that is callable is copied, not carried by reference.
    const claimed = claimWorktree({ claims: { '/wt/a': callable({ ...attempt }) }, worktree: '/wt/a', attempt })
    expect(claimed).toMatchObject({ ok: true, alreadyHeld: true })
    expect(typeof claimed.claims['/wt/a']).toBe('object')
  })

  it('refuses rather than THROWS on every path that reads a record', () => {
    // Taking the reading is itself fallible, and a reader that lets the exception
    // out turns a documented refusal into a crash — in the grant and the write
    // check above all, the two paths a worker runs before it writes. Every reader
    // here answers "no reading could be taken", which every caller already treats
    // as unreadable ownership (cross-vendor review of point 893).
    const unreadable = { get batchId() { throw new Error('unreadable') }, pointId: 'p834', attemptId: 'a1', leaseId: 'L1', holder, grantedAt: 10_000, expiresAt: 20_000 }
    const refusal = grantAttemptLease({ existing: unreadable, attempt, holder, now: 15_000, leaseId: 'L2' })
    expect(refusal.ok).toBe(false)
    expect(refusal.reason).toMatch(/uncertain fails closed/)
    expect(leaseAllowsWrite({ lease: unreadable, holder, leaseId: 'L1', now: 15_000 }).verdict).toBe('fenced')
    // The requesting side is read the same way: an attempt or a holder whose own
    // reading throws is a refusal, not an exception out of the grant.
    expect(grant({ attempt: { get batchId() { throw new Error('unreadable') }, pointId: 'p834', attemptId: 'a1' } }).ok).toBe(false)
    expect(grant({ holder: { get pid() { throw new Error('unreadable') }, pidStartedAt: 5000 } }).ok).toBe(false)
    expect(claimWorktree({ claims: {}, worktree: '/wt/a', attempt: { get batchId() { throw new Error('unreadable') }, pointId: 'p', attemptId: 'a' } }).ok).toBe(false)
  })

  it('refuses a claims map it cannot read at all rather than throwing out of the claim', () => {
    const boom = { batchId: 'b', pointId: 'p834', get attemptId() { throw new Error('unreadable') } }
    const res = claimWorktree({ claims: { '/wt/a': boom }, worktree: '/wt/b', attempt })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/could not be read at all/)
    expect(releaseWorktree({ claims: { '/wt/a': boom }, worktree: '/wt/a', attempt }).ok).toBe(false)
  })
})

describe('expiredLeaseAlerts', () => {
  it('alerts per expired lease and stays silent inside the term', () => {
    const lease = grant().lease
    expect(expiredLeaseAlerts({ leases: [lease], now: 20_000 })).toEqual([])
    const alerts = expiredLeaseAlerts({ leases: [lease], now: 10_000 + ATTEMPT_LEASE_TTL_MS + 500 })
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ pointId: 'p834', attemptId: 'a1' })
    expect(alerts[0].alert).toMatch(/not proven dead/)
  })

  it('quarantines a malformed lease with its own alert instead of skipping it', () => {
    const broken = { batchId: 'b', pointId: 'p834', attemptId: 'a9' } // no leaseId, holder, expiry
    const alerts = expiredLeaseAlerts({ leases: [broken], now: 20_000 })
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ pointId: 'p834', attemptId: 'a9' })
    expect(alerts[0].alert).toMatch(/malformed/)
  })

  it('alerts on a clock rolled back behind the lease instead of reading it as fresh', () => {
    // The only answer this function may not give is silence. `now <= expiresAt`
    // was read as FRESH even when `now` sat before the lease's own last evidence
    // of the clock — exactly the state every other decision in this file fences
    // as a rollback. Only non-finite clocks were tested (cross-vendor review of
    // point 893).
    const lease = grant().lease
    const before = expiredLeaseAlerts({ leases: [lease], now: lease.grantedAt - 1 })
    expect(before).toHaveLength(1)
    expect(before[0]).toMatchObject({ pointId: 'p834', attemptId: 'a1' })
    expect(before[0].alert).toMatch(/rolled-back clock/)
    // A renewal keeps the original grantedAt, so the fence is dated at the last
    // renewal here as it is everywhere else.
    const renewed = grant({ existing: lease, now: 200_000 }).lease
    expect(expiredLeaseAlerts({ leases: [renewed], now: 20_000 })[0].alert).toMatch(/rolled-back clock/)
    // The moment of the last renewal itself is not a rollback, and is still fresh.
    expect(expiredLeaseAlerts({ leases: [renewed], now: 200_000 })).toEqual([])
  })

  it('reports an unreadable lease collection instead of throwing the whole sweep away', () => {
    // `leases.map` threw on any persisted value that is not an array, and a sweep
    // that throws raises no alert for ANY lease — the silence this function must
    // never answer. The unreadable collection is an alert like the unreadable
    // lease and the unusable clock (hostile re-read of point 893).
    for (const persisted of [false, 0, '', NaN, 'garbage', { '/wt/a': {} }]) {
      const alerts = expiredLeaseAlerts({ leases: persisted, now: 20_000 })
      expect(alerts, String(persisted)).toHaveLength(1)
      expect(alerts[0].alert, String(persisted)).toMatch(/unreadable/)
    }
    // An unusable clock on top of it must not turn the sweep back into a throw.
    expect(expiredLeaseAlerts({ leases: 'garbage', now: NaN })[0].alert).toMatch(/unreadable/)
    // Absence is null or an omitted field, exactly as it is for a lease.
    expect(expiredLeaseAlerts({ leases: null, now: 20_000 })).toEqual([])
    expect(expiredLeaseAlerts({ now: 20_000 })).toEqual([])
  })

  it('reports every lease as unjudgeable when the clock itself is unusable', () => {
    const lease = grant().lease
    const alerts = expiredLeaseAlerts({ leases: [lease], now: NaN })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].alert).toMatch(/cannot be judged/)
  })
})

describe('worktree claims — one worktree, one attempt, fail closed', () => {
  it('claims once, is idempotent for the holder, and refuses a second attempt', () => {
    const first = claimWorktree({ claims: {}, worktree: '/wt/a', attempt })
    expect(first.ok).toBe(true)
    expect(claimWorktree({ claims: first.claims, worktree: '/wt/a', attempt })).toMatchObject({ ok: true, alreadyHeld: true })
    const second = claimWorktree({ claims: first.claims, worktree: '/wt/a', attempt: { ...attempt, attemptId: 'a2' } })
    expect(second.ok).toBe(false)
    expect(second.reason).toMatch(/never share/)
  })

  it('collides raw-string aliases of one worktree instead of granting both', () => {
    const first = claimWorktree({ claims: {}, worktree: '/wt/a', attempt })
    for (const alias of ['/wt/a/.', '/wt//a', '/wt/a/', '/wt/b/../a']) {
      const aliased = claimWorktree({ claims: first.claims, worktree: alias, attempt: { ...attempt, attemptId: 'a2' } })
      expect(aliased.ok, alias).toBe(false)
      expect(aliased.reason, alias).toMatch(/never share/)
    }
    // The holder itself reaches its claim through any alias, and releases it too.
    expect(claimWorktree({ claims: first.claims, worktree: '/wt/a/.', attempt })).toMatchObject({ ok: true, alreadyHeld: true })
    expect(releaseWorktree({ claims: first.claims, worktree: '/wt/a/', attempt })).toMatchObject({ ok: true, released: true })
  })

  it('collides an alias that is the STORED key rather than the requested one', () => {
    // The canonicalisation ran on the requested path alone, so a map keyed with any
    // other spelling of the same worktree answered `hasOwn` with false: the second
    // attempt was GRANTED the worktree the first one holds, and the map came back
    // carrying both spellings — one worktree, two attempts, the single invariant
    // this function exists for (cross-vendor review of point 893).
    const other = { ...attempt, attemptId: 'a2' }
    for (const stored of ['/wt/a/', '/wt//a', '/wt/a/.', '/wt/b/../a', 'wt/a']) {
      const claims = { [stored]: attempt }
      const claimed = claimWorktree({ claims, worktree: '/wt/a', attempt: other })
      expect(claimed.ok, stored).toBe(false)
      expect(claimed.reason, stored).toMatch(/uncertain fails closed/)
      // The release path reads the same map and must refuse it just as closed —
      // freeing on unknown ownership is the same act from the other side.
      expect(releaseWorktree({ claims, worktree: '/wt/a', attempt }).ok, stored).toBe(false)
    }
  })

  it('refuses a claim whose attempt identity is not three names', () => {
    const res = claimWorktree({ claims: {}, worktree: '/wt/a', attempt: { ...attempt, attemptId: { value: 'a1' } } })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/non-empty string/)
    // A stored record carrying one is unreadable ownership, not a rival claim.
    const aliased = claimWorktree({ claims: { '/wt/a': { ...attempt, attemptId: { value: 'a1' } } }, worktree: '/wt/a', attempt })
    expect(aliased.ok).toBe(false)
    expect(aliased.reason).toMatch(/uncertain fails closed/)
  })

  it('refuses relative paths outright', () => {
    expect(claimWorktree({ claims: {}, worktree: 'wt/a', attempt }).ok).toBe(false)
    expect(releaseWorktree({ claims: { '/wt/a': attempt }, worktree: 'wt/a', attempt })).toMatchObject({ ok: true, released: false })
  })

  it('freezes the claim record it hands out, not only the map around it', () => {
    // The map was frozen and the record inside it was not, so whoever held the
    // returned claims could relabel ownership of a worktree — after which a
    // DIFFERENT attempt read as the holder and could release it. The tests never
    // mutated the record (cross-vendor review of point 893).
    const first = claimWorktree({ claims: {}, worktree: '/wt/a', attempt })
    expect(Object.isFrozen(first.claims['/wt/a'])).toBe(true)
    try {
      first.claims['/wt/a'].attemptId = 'a2'
    } catch {
      // A frozen record throws on assignment under module strict mode — that IS the fix.
    }
    expect(first.claims['/wt/a'].attemptId).toBe('a1')
    expect(releaseWorktree({ claims: first.claims, worktree: '/wt/a', attempt: { ...attempt, attemptId: 'a2' } }).ok).toBe(false)
  })

  it('hands out a frozen map of frozen records on EVERY path, pass-throughs included', () => {
    // The same defect as the record above, in the three return sites the review
    // did not name: the idempotent claim and the no-op release returned the
    // CALLER's map untouched — not frozen at all, so a key could simply be added
    // to it — and the successful release froze the new map while leaving the
    // SURVIVING records the mutable ones it was handed. A persisted map is the
    // normal input, and nothing about it is frozen.
    const held = claimWorktree({ claims: {}, worktree: '/wt/a', attempt }).claims
    const persisted = () => JSON.parse(JSON.stringify(held))

    const idempotent = claimWorktree({ claims: persisted(), worktree: '/wt/a', attempt })
    expect(idempotent).toMatchObject({ ok: true, alreadyHeld: true })
    expect(Object.isFrozen(idempotent.claims)).toBe(true)
    expect(Object.isFrozen(idempotent.claims['/wt/a'])).toBe(true)
    try {
      idempotent.claims['/wt/b'] = { ...attempt, attemptId: 'a2' }
    } catch {
      // A frozen map throws on assignment under module strict mode — that IS the fix.
    }
    expect(Object.hasOwn(idempotent.claims, '/wt/b')).toBe(false)

    // The release that frees nothing hands back a map just as sealed.
    const noop = releaseWorktree({ claims: persisted(), worktree: 'wt/a', attempt })
    expect(noop).toMatchObject({ ok: true, released: false })
    expect(Object.isFrozen(noop.claims)).toBe(true)
    expect(Object.isFrozen(noop.claims['/wt/a'])).toBe(true)

    // A claim for a second worktree must not carry the first record over by reference.
    const carried = claimWorktree({ claims: persisted(), worktree: '/wt/b', attempt: { ...attempt, attemptId: 'a2' } })
    expect(Object.isFrozen(carried.claims['/wt/a'])).toBe(true)

    // And a release seals the claims that survive it.
    const both = JSON.parse(JSON.stringify(carried.claims))
    const released = releaseWorktree({ claims: both, worktree: '/wt/b', attempt: { ...attempt, attemptId: 'a2' } })
    expect(released).toMatchObject({ ok: true, released: true })
    expect(Object.isFrozen(released.claims['/wt/a'])).toBe(true)
    try {
      released.claims['/wt/a'].attemptId = 'a2'
    } catch {
      // As above: the throw is the fix, not the failure.
    }
    expect(releaseWorktree({ claims: released.claims, worktree: '/wt/a', attempt: { ...attempt, attemptId: 'a2' } }).ok).toBe(false)
  })

  it('fails closed on an unreadable claim record', () => {
    const res = claimWorktree({ claims: { '/wt/a': {} }, worktree: '/wt/a', attempt })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/uncertain fails closed/)
  })

  it('quarantines an unreadable claims map instead of reading it as no claims at all', () => {
    // The same class the review closed for the existing LEASE, in the claims map:
    // `Object.hasOwn` answers false on a primitive, so a persisted `false`, `0`,
    // `''` or `NaN` fell through to the fresh-claim path and the worktree was
    // handed out as if nothing held it — and a persisted string was spread into a
    // map of its own characters. Unreadable is uncertain, and uncertain fails
    // closed (hostile re-read of point 893).
    for (const persisted of [false, 0, '', NaN, 'garbage', ['/wt/a']]) {
      const claimed = claimWorktree({ claims: persisted, worktree: '/wt/a', attempt })
      expect(claimed.ok, String(persisted)).toBe(false)
      expect(claimed.reason, String(persisted)).toMatch(/uncertain fails closed/)
      const released = releaseWorktree({ claims: persisted, worktree: '/wt/a', attempt })
      expect(released.ok, String(persisted)).toBe(false)
      expect(released.reason, String(persisted)).toMatch(/uncertain fails closed/)
    }
    // Absence is null or an omitted field, exactly as it is for a lease, and only
    // absence claims. Neither may throw the way a null map used to.
    expect(claimWorktree({ claims: null, worktree: '/wt/a', attempt }).ok).toBe(true)
    expect(claimWorktree({ worktree: '/wt/a', attempt }).ok).toBe(true)
    expect(releaseWorktree({ claims: null, worktree: '/wt/a', attempt })).toMatchObject({ ok: true, released: false })
  })

  it('refuses a map carrying a key no claim can have, __proto__ among them', () => {
    // JSON.parse makes `__proto__` an OWN property, and writing it back with a
    // plain assignment sets the PROTOTYPE instead of storing it — so the map this
    // module handed out silently lost the entry and carried a claim record as its
    // prototype. Since the stored keys are checked for canonicality, such a map
    // never reaches the sealing at all: no claim key can be `__proto__`, a key is
    // an absolute path, and a map keyed by anything else is ownership this module
    // cannot read. It refuses on both paths rather than deciding around the key.
    const poisoned = JSON.parse('{"__proto__": {"batchId": "b", "pointId": "p834", "attemptId": "aX"}, "/wt/a": {"batchId": "b", "pointId": "p834", "attemptId": "a1"}}')
    const claimed = claimWorktree({ claims: poisoned, worktree: '/wt/b', attempt: { ...attempt, attemptId: 'a2' } })
    expect(claimed.ok).toBe(false)
    expect(claimed.reason).toMatch(/__proto__/)
    expect(claimed.claims).toBeUndefined()
    expect(releaseWorktree({ claims: poisoned, worktree: '/wt/a', attempt }).ok).toBe(false)
    // A map this module DID hand out is a plain object with the key as its own
    // entry, so nothing it produces can poison a prototype downstream either.
    const clean = claimWorktree({ claims: { '/wt/a': attempt }, worktree: '/wt/b', attempt: { ...attempt, attemptId: 'a2' } })
    expect(clean.ok).toBe(true)
    expect(Object.getPrototypeOf(clean.claims)).toBe(Object.prototype)
    expect(Object.keys(clean.claims)).toEqual(['/wt/a', '/wt/b'])
  })

  it('refuses to RELEASE a claim it cannot read, even to the object that matches it', () => {
    // The claim path validated both identities; the release path went straight to
    // sameAttempt, which compares with ===. A stored record carrying an OBJECT as
    // an id therefore matched a request presenting that same object, so a claim
    // this module cannot read was freed by whoever held the reference — and the
    // worktree it had guarded stood open for the next attempt. Freeing is the side
    // where uncertainty lets a second attempt in, so it fails closed there too
    // (cross-vendor review of point 893).
    const shared = { value: 'a1' }
    const unreadable = { batchId: 'b', pointId: 'p834', attemptId: shared }
    const res = releaseWorktree({ claims: { '/wt/a': unreadable }, worktree: '/wt/a', attempt: unreadable })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/non-empty string/)
    // And with a readable requester, the unreadable RECORD is what fails closed.
    const stored = releaseWorktree({ claims: { '/wt/a': unreadable }, worktree: '/wt/a', attempt })
    expect(stored.ok).toBe(false)
    expect(stored.reason).toMatch(/uncertain fails closed/)
  })

  it('decides on the identity it VALIDATED, not on a second reading of it', () => {
    // Every guard here validated the caller's object and then compared the object
    // again. An accessor-backed field answers a valid name to the guard and a
    // SHARED OBJECT to the comparison that follows: both identities passed, and
    // `sameAttempt` — which compares with === — matched the two shared references,
    // so a release was performed between two attempts that do not name the same
    // one, and the worktree stood open for the next claim (cross-vendor review of
    // point 893). Reading each field once, into a snapshot every later decision
    // uses, is what closes the class rather than this one instance.
    const shared = { value: 'shared' }
    const flips = (first) => {
      let read = 0
      return { batchId: 'b', pointId: 'p834', get attemptId() { return read++ === 0 ? first : shared } }
    }
    const stored = flips('a1')
    const requester = flips('a2')
    const released = releaseWorktree({ claims: { '/wt/a': stored }, worktree: '/wt/a', attempt: requester })
    expect(released.ok).toBe(false)
    expect(released.reason).toMatch(/only the claiming attempt/)
    // The claim path decides on the snapshot too: a1 still holds the worktree.
    const claimed = claimWorktree({ claims: { '/wt/a': flips('a1') }, worktree: '/wt/a', attempt: flips('a2') })
    expect(claimed.ok).toBe(false)
    expect(claimed.reason).toMatch(/never share/)
    // And so does the lease: a renewal is judged against the name that was read.
    const persisted = { ...grant().lease, get attemptId() { return shared } }
    expect(grantAttemptLease({ existing: persisted, attempt, holder, now: 20_000, leaseId: 'L1' }).ok).toBe(false)
  })

  it('releases only for the claiming attempt', () => {
    const { claims } = claimWorktree({ claims: {}, worktree: '/wt/a', attempt })
    expect(releaseWorktree({ claims, worktree: '/wt/a', attempt: { ...attempt, attemptId: 'a2' } }).ok).toBe(false)
    const released = releaseWorktree({ claims, worktree: '/wt/a', attempt })
    expect(released.ok).toBe(true)
    expect(released.claims).toEqual({})
  })
})
