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
    const { grantedAt, ...ungranted } = lease
    expect(leaseAllowsWrite({ lease: ungranted, holder, leaseId: 'L1', now: 20_000 }).verdict).toBe('fenced')
    const inverted = { ...lease, expiresAt: lease.grantedAt - 1 }
    expect(leaseAllowsWrite({ lease: inverted, holder, leaseId: 'L1', now: lease.grantedAt }).verdict).toBe('fenced')
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

  it('refuses relative paths outright', () => {
    expect(claimWorktree({ claims: {}, worktree: 'wt/a', attempt }).ok).toBe(false)
    expect(releaseWorktree({ claims: { '/wt/a': attempt }, worktree: 'wt/a', attempt })).toMatchObject({ ok: true, released: false })
  })

  it('fails closed on an unreadable claim record', () => {
    const res = claimWorktree({ claims: { '/wt/a': {} }, worktree: '/wt/a', attempt })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/uncertain fails closed/)
  })

  it('releases only for the claiming attempt', () => {
    const { claims } = claimWorktree({ claims: {}, worktree: '/wt/a', attempt })
    expect(releaseWorktree({ claims, worktree: '/wt/a', attempt: { ...attempt, attemptId: 'a2' } }).ok).toBe(false)
    const released = releaseWorktree({ claims, worktree: '/wt/a', attempt })
    expect(released.ok).toBe(true)
    expect(released.claims).toEqual({})
  })
})
