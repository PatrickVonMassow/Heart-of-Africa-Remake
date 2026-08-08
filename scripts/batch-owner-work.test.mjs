// THE SHARED CORROBORATION GATHERER (four-eyes review of point 556, confirmed
// finding 2). What is provable without a repository is the GATE: nothing is
// gathered unless the lock is in a state where corroboration could change
// `assessOwner`'s answer, so the git probes stay off every hook's hot path — and
// the gatherer never throws, because three of its four callers are hooks.
import { describe, it, expect } from 'vitest'
import { corroborationNeeded, gatherOwnerWork } from './batch-owner-work.mjs'
import { LEASE_MS, DECLARED_WAIT_LEASE_MS } from './batch-lease-core.mjs'

const T0 = 1_800_000_000_000
const lock = (over = {}) => ({ sessionId: 's1', claimedAt: T0, pid: 4242, leaseUntil: T0 + LEASE_MS, ...over })

describe('corroborationNeeded — the gate that keeps the probes off the hot path', () => {
  it('says NO while the lease simply runs — the arithmetic decides alone', () => {
    expect(corroborationNeeded(lock(), { now: T0 + 10 * 60_000 })).toBe(false)
  })

  it('says YES once the lease has run out — that is the branch that reads work', () => {
    expect(corroborationNeeded(lock(), { now: T0 + LEASE_MS + 1 })).toBe(true)
  })

  it('says YES inside the stretch a declared wait bought beyond an ordinary window', () => {
    const until = T0 + DECLARED_WAIT_LEASE_MS
    const declared = lock({ leaseUntil: until, declaredWait: { at: T0, until } })
    expect(corroborationNeeded(declared, { now: T0 + 10 * 60_000 })).toBe(false)
    expect(corroborationNeeded(declared, { now: T0 + LEASE_MS + 60_000 })).toBe(true)
  })

  it('is total on junk — no lock, no object, nothing to ask about', () => {
    expect(corroborationNeeded(null, { now: T0 })).toBe(false)
    expect(corroborationNeeded('nonsense', { now: T0 })).toBe(false)
    expect(corroborationNeeded(undefined)).toBe(false)
  })
})

describe('gatherOwnerWork — null where nothing needs asking, never a throw', () => {
  it('returns null while the lease runs, so a hook pays one file read at most', () => {
    expect(gatherOwnerWork(lock(), { now: T0 + 10 * 60_000 })).toBe(null)
  })

  it('returns null rather than throwing on a lock it cannot reason about', () => {
    expect(gatherOwnerWork(null, { now: T0 })).toBe(null)
    expect(() => gatherOwnerWork(lock(), { now: T0 + LEASE_MS + 1 })).not.toThrow()
  })
})
