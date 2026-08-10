// THE OWNERSHIP VERDICT (point 612) — the pure sweep the point asks for: "the
// idle verdict from declared work, last state change and the window, including
// the boundary cases at exactly the window and with in-flight work declared".
//
// The two properties the measurement of 10.08.2026 forced (main-session note,
// carried in the findings carrier as "A handed-over lock whose pid is still alive
// never spawns a successor"):
//   1. an explicit handover OUTRANKS every liveness heuristic, at any grace age;
//   2. pid liveness may not stand in for SESSION liveness — one claude process
//      hosts every session of a window, so "that pid still exists" answers a
//      question nobody asked.
import { describe, it, expect } from 'vitest'
import { LEASE_MS, DECLARED_WAIT_LEASE_MS } from './batch-lease-core.mjs'
import {
  IDLE_WINDOW_MS,
  effectiveLeaseUntil,
  idleVerdict,
  lockDeclaresWait,
  ownershipVerdict,
  workedSinceClaim,
} from './batch-ownership-core.mjs'

const NOW = 1_800_000_000_000
const live = { pid: 939, identifiable: true, live: true }
const dead = { pid: 939, identifiable: true, live: false }

/** A lock as `acquire` writes it, with whatever the case needs on top. */
const lock = (over = {}) => ({
  v: 2,
  sessionId: 's1',
  kind: 'session',
  startedAt: NOW - 60_000,
  claimedAt: NOW - 60_000,
  acquiredAt: NOW - 60_000,
  leaseUntil: NOW - 60_000 + LEASE_MS,
  pid: 939,
  pidStartedAt: NOW - 86_400_000,
  ...over,
})

/** A lock whose session HAS completed tool calls since claiming. */
const working = (over = {}) => lock({ acquiredAt: NOW - 3_600_000, ...over })

describe('effectiveLeaseUntil — the ONE place ownership\'s end is computed', () => {
  it('reads the lock\'s own lease, and an implicit one where none was written', () => {
    expect(effectiveLeaseUntil(lock({ leaseUntil: NOW + 1000 }), { now: NOW })).toBe(NOW + 1000)
    const legacy = { claimedAt: NOW - 1000 }
    expect(effectiveLeaseUntil(legacy, { now: NOW })).toBe(NOW - 1000 + LEASE_MS)
  })

  it('says nothing about a lock that carries no usable timestamp', () => {
    expect(effectiveLeaseUntil(null, { now: NOW })).toBeNull()
    expect(effectiveLeaseUntil({}, { now: NOW })).toBeNull()
  })

  it('is the seam point 517 extends — it takes the evidence today and ignores it', () => {
    // The signature is the contract: an extension lands INSIDE this function, so
    // the idle rule below and a lease extension can never become two arithmetics
    // on one number (point 614's cross-point ruling).
    const l = lock({ leaseUntil: NOW + 1000 })
    expect(effectiveLeaseUntil(l, { now: NOW, evidence: { advancing: true, at: NOW } })).toBe(
      effectiveLeaseUntil(l, { now: NOW }),
    )
  })
})

describe('workedSinceClaim — has the owner done anything at all?', () => {
  it('is false while claimedAt still equals acquiredAt, and true after one call', () => {
    expect(workedSinceClaim(lock())).toBe(false)
    expect(workedSinceClaim(lock({ claimedAt: NOW - 59_000 }))).toBe(true)
  })

  it('is NULL — never false — for a lock too old to carry acquiredAt', () => {
    // Unknown may not dispossess anybody: that is what makes this need no migration.
    expect(workedSinceClaim({ claimedAt: NOW })).toBeNull()
    expect(workedSinceClaim(null)).toBeNull()
  })
})

describe('lockDeclaresWait — a declaration every reader can see', () => {
  it('honours a running declared wait and lets an expired one go', () => {
    expect(lockDeclaresWait(lock({ declaredWait: { at: NOW - 1000, until: NOW + 1000 } }), NOW)).toBe(true)
    expect(lockDeclaresWait(lock({ declaredWait: { at: NOW - 2000, until: NOW - 1 } }), NOW)).toBe(false)
    expect(lockDeclaresWait(lock(), NOW)).toBe(false)
    expect(lockDeclaresWait(lock({ declaredWait: 'yes' }), NOW)).toBe(false)
  })
})

describe('the idle verdict', () => {
  const idle = (over = {}) =>
    idleVerdict({ now: NOW, lastStateChangeAt: NOW - 10 * 60_000, workedSinceClaim: false, ...over })

  it('EXACTLY at the window is still ownership; one millisecond past it is not', () => {
    expect(idle({ lastStateChangeAt: NOW - IDLE_WINDOW_MS }).idle).toBe(false)
    expect(idle({ lastStateChangeAt: NOW - IDLE_WINDOW_MS - 1 }).idle).toBe(true)
  })

  it('DECLARED in-flight work takes the owner out of the rule at any age', () => {
    expect(idle({ lastStateChangeAt: NOW - 10 * 60 * 60_000, workDeclared: true }).idle).toBe(false)
    expect(idle({ workDeclared: true }).reason).toBe('work-declared')
  })

  it('takes NO "is it advancing?" signal at all — only a moment the owner wrote', () => {
    // 612's refinement: the launcher's `advancing` verdict is partly worktree
    // MTIMES (`worktree … active 1 min ago (working files|git metadata)`), so a
    // leaked dev server or a file watcher would keep a dead-idle owner alive for
    // up to the takeover override. The window may only ever be moved by a
    // timestamp, and only by one the OWNER wrote.
    expect(idleVerdict.length).toBeLessThanOrEqual(1) // one options bag, no positional escape hatch
    expect(idle({ evidenceAdvancing: true }).idle).toBe(true) // an unknown key decides nothing
    expect(idle({ lastStateChangeAt: NOW - 1000 }).idle).toBe(false)
  })

  it('a session that HAS completed a tool call since claiming is never idle here', () => {
    // The bound on a working session is the lease, not this window: a single tool
    // call legitimately runs past five minutes about once in a hundred, and the
    // LARGE regression is one call of 30-40 min. Dispossessing those would be the
    // 24.07.2026 double-spawn as an everyday event.
    expect(idle({ workedSinceClaim: true }).idle).toBe(false)
    expect(idle({ workedSinceClaim: true }).reason).toBe('has-worked')
    expect(idle({ workedSinceClaim: null }).idle).toBe(false)
  })

  it('stands down for a paused batch, like every guard here', () => {
    expect(idle({ paused: true }).idle).toBe(false)
    expect(idle({ paused: true }).reason).toBe('batch-paused')
  })

  it('an unreadable clock or window never dispossesses anybody', () => {
    expect(idle({ now: null }).idle).toBe(false)
    expect(idle({ lastStateChangeAt: undefined }).idle).toBe(false)
    expect(idle({ idleWindowMs: 0 }).idle).toBe(false)
    expect(idleVerdict().idle).toBe(false)
  })
})

describe('the ownership verdict — property 1: a handover outranks every heuristic', () => {
  const handed = (over = {}) => lock({ handedOver: true, handedOverAt: NOW - 1000, ...over })

  it('frees a handed-over lock with a LIVE pid and a FRESH heartbeat, at once', () => {
    const v = ownershipVerdict({
      lock: handed({ claimedAt: NOW - 500 }), // heartbeat fresher than the mark
      now: NOW,
      corroboration: live,
    })
    expect(v).toMatchObject({ settled: true, owns: false, reason: 'handed-over' })
  })

  it('frees it at ANY grace age — a minute after the mark and an hour after it', () => {
    for (const age of [0, 1000, 60_000, 15 * 60_000, 60 * 60_000]) {
      const v = ownershipVerdict({ lock: handed({ handedOverAt: NOW - age }), now: NOW, corroboration: live })
      expect(v.owns, `age ${age}`).toBe(false)
      expect(v.reason).toBe('handed-over')
    }
  })

  it('THE MEASURED INCIDENT: a later claimedAt does not un-mark it', () => {
    // 10.08.2026: HANDOVER at 13:57, then ticks at 14:01/14:16/14:31 all logged
    // `skip: owner alive (pid-alive; heartbeat 5..20 min old, pid 939)`. The old
    // rule required `claimedAt <= handedOverAt`, and any later write of the lock
    // breaks that without deleting the flag.
    const v = ownershipVerdict({
      lock: handed({ handedOverAt: NOW - 34 * 60_000, claimedAt: NOW - 5 * 60_000 }),
      now: NOW,
      corroboration: live,
    })
    expect(v.owns).toBe(false)
    expect(v.reason).toBe('handed-over')
  })

  it('a half-written or forged mark still frees nothing', () => {
    for (const bad of [{ handedOver: true }, { handedOver: 'yes', handedOverAt: NOW }, { handedOver: false }]) {
      const v = ownershipVerdict({ lock: working({ ...bad, claimedAt: NOW - 1000 }), now: NOW, corroboration: live })
      expect(v.reason).not.toBe('handed-over')
    }
  })
})

describe('the ownership verdict — property 2: a live pid is not a live session', () => {
  it('a session that took the lock and never ran anything loses it, live pid and all', () => {
    // The 14:11 → 14:32 half of the same incident: an unattended window took the
    // free lock at session start and sat there. Its pid is alive — it is the
    // window's own claude process, which hosts every session of that window.
    const v = ownershipVerdict({ lock: lock({ claimedAt: NOW - 21 * 60_000, acquiredAt: NOW - 21 * 60_000 }), now: NOW, corroboration: live })
    expect(v).toMatchObject({ settled: true, owns: false, reason: 'idle' })
    expect(v.detail).toMatch(/not completed one tool call/)
    expect(v.detail).toMatch(/Nothing is killed/)
  })

  it('…and it keeps the batch the moment it does anything at all', () => {
    const v = ownershipVerdict({ lock: working({ claimedAt: NOW - 21 * 60_000 }), now: NOW, corroboration: live })
    expect(v.settled).toBe(false) // handed on to the pid branches: an ordinary owner
  })

  it('an ownerActivityAt may EXTEND ownership, never shorten it, and mtimes are not one', () => {
    const idleLock = lock({ claimedAt: NOW - 21 * 60_000, acquiredAt: NOW - 21 * 60_000 })
    // A commit this session made a minute ago is owner-attributable and holds it.
    expect(ownershipVerdict({ lock: idleLock, now: NOW, corroboration: live, ownerActivityAt: NOW - 60_000 }).reason).not.toBe('idle')
    // An OLDER stamp than the heartbeat cannot shorten the window.
    const fresh = lock({ claimedAt: NOW - 1000, acquiredAt: NOW - 1000 })
    expect(ownershipVerdict({ lock: fresh, now: NOW, corroboration: live, ownerActivityAt: NOW - 10 * 60_000 })).toMatchObject({
      owns: true,
      reason: 'fresh-heartbeat',
    })
    // And the launcher's own `advancing` — which is partly worktree mtimes — is
    // never consulted: a work object with nothing DECLARED changes nothing.
    expect(
      ownershipVerdict({
        lock: idleLock,
        now: NOW,
        corroboration: live,
        work: { declared: false, advancing: true, corroboratedBy: 'log', summary: 'worktree active 1 min ago' },
      }).reason,
    ).toBe('idle')
  })

  it('a DECLARED wait on the lock survives the window without a heartbeat', () => {
    const v = ownershipVerdict({
      lock: lock({ claimedAt: NOW - 100 * 60_000, acquiredAt: NOW - 100 * 60_000, leaseUntil: NOW + DECLARED_WAIT_LEASE_MS, declaredWait: { at: NOW - 100 * 60_000, until: NOW + DECLARED_WAIT_LEASE_MS } }),
      now: NOW,
      corroboration: live,
    })
    expect(v.owns).not.toBe(false)
  })

  it('the idle rule stands down for a paused batch', () => {
    const idleLock = lock({ claimedAt: NOW - 21 * 60_000, acquiredAt: NOW - 21 * 60_000 })
    expect(ownershipVerdict({ lock: idleLock, now: NOW, corroboration: live, paused: true }).reason).not.toBe('idle')
  })

  it('a wider window is honoured — the value is calibratable, not carved in', () => {
    // Widened past the silence, the SAME window is what "fresh heartbeat" means:
    // the two are one rule read from its two sides, not two thresholds that drift.
    const idleLock = lock({ claimedAt: NOW - 21 * 60_000, acquiredAt: NOW - 21 * 60_000 })
    expect(ownershipVerdict({ lock: idleLock, now: NOW, corroboration: live, idleWindowMs: 30 * 60_000 })).toMatchObject(
      { owns: true, reason: 'fresh-heartbeat' },
    )
  })
})

describe('the ownership verdict — the order of authority is preserved', () => {
  it('no usable lock is nobody\'s batch', () => {
    for (const bad of [null, undefined, {}, { claimedAt: 'soon' }]) {
      expect(ownershipVerdict({ lock: bad, now: NOW })).toMatchObject({ settled: true, owns: false, reason: 'no-lock' })
    }
  })

  it('a state change inside the window proves life without any probe', () => {
    const v = ownershipVerdict({ lock: lock({ claimedAt: NOW - 1000 }), now: NOW, corroboration: dead })
    expect(v).toMatchObject({ settled: true, owns: true, reason: 'fresh-heartbeat' })
  })

  it('a heartbeat from before this boot cannot have a living writer', () => {
    const v = ownershipVerdict({
      lock: working({ claimedAt: NOW - 30 * 60_000 }),
      now: NOW,
      bootTime: NOW - 10 * 60_000,
      corroboration: live,
    })
    expect(v).toMatchObject({ settled: true, owns: false, reason: 'heartbeat-predates-boot' })
  })

  it('an expired lease still reports as the LEASE, with point 556\'s corroboration', () => {
    const stale = working({ claimedAt: NOW - 90 * 60_000, leaseUntil: NOW - 30 * 60_000 })
    expect(ownershipVerdict({ lock: stale, now: NOW, corroboration: dead })).toMatchObject({
      owns: false,
      reason: 'lease-expired',
    })
    // …and a live owner whose declared work has PRODUCED something keeps it.
    const kept = ownershipVerdict({
      lock: stale,
      now: NOW,
      corroboration: live,
      work: { declared: true, advancing: true, corroboratedBy: 'git', summary: 'a commit 2 min ago' },
    })
    expect(kept).toMatchObject({ owns: true, reason: 'lease-expired-owner-working' })
  })
})
