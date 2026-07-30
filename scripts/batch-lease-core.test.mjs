// THE LEASE AND THE FENCE, SWEPT PURELY (layer 1 of docs/batch-resilience.md).
//
// Every case names the failure of the night of 29./30.07.2026 it would have
// prevented — that night produced nothing between 21:50 and 04:19 while nine
// part-failures chained — and each half carries an INDEPENDENCE case: the layer
// still acts while the OTHER layers' inputs are missing or stale. That night the
// launcher was running perfectly and ticked all night; what failed was the
// conclusion it drew from a heartbeat, so a layer that needs another layer's
// input to act is a layer that can be talked out of acting.
//
// The proof list this suite discharges is docs/batch-resilience.md §8, bullets
// "Lease" and "Chokepoint"; each clause is named in the test that covers it.
import { describe, it, expect } from 'vitest'
import {
  LEASE_MS,
  LEASE_RENEW_INTERVAL_MS,
  FENCE_HOLDER_HISTORY,
  leaseUntilOf,
  leaseExpired,
  shouldRenewLease,
  renewedLock,
  renewalDecision,
  normaliseFence,
  nextFence,
  grantedFenceState,
  fenceHeldBy,
  fenceStatus,
  fenceGuardedAction,
  fenceDecision,
} from './batch-lease-core.mjs'

const T0 = 1_800_000_000_000
const lockAt = (t, extra = {}) => ({ sessionId: 's-owner', claimedAt: t, pid: 4242, ...extra })

describe('the lease — ownership ends by arithmetic', () => {
  it('§8 lease: an EXPIRED lease is takeable by a stranger', () => {
    // THE NIGHT: the owner fell silent at 21:50 and still held the batch at
    // 04:19, because every path to taking it from it carried a condition.
    const lock = lockAt(T0, { leaseUntil: T0 + LEASE_MS })
    expect(leaseExpired(lock, { now: T0 + LEASE_MS + 1 })).toBe(true)
  })

  it('§8 lease: a FRESH lease is not takeable', () => {
    // The inverse failure, and the more expensive one: a running LARGE
    // regression must never lose the batch mid-run (docs/batch-resilience.md §5).
    const lock = lockAt(T0, { leaseUntil: T0 + LEASE_MS })
    expect(leaseExpired(lock, { now: T0 + LEASE_MS })).toBe(false)
    expect(leaseExpired(lock, { now: T0 + LEASE_MS - 1 })).toBe(false)
  })

  it('§8 lease: a PreToolUse renewal covers a call LONGER than the renewal interval', () => {
    // THE NIGHT, mechanised: the heartbeat is PostToolUse, so ONE long call
    // starves it. Renewing BEFORE the call is what makes a 40-minute suite
    // survivable; the guaranteed coverage is LEASE_MS - LEASE_RENEW_INTERVAL_MS.
    const guaranteed = LEASE_MS - LEASE_RENEW_INTERVAL_MS
    expect(guaranteed).toBeGreaterThan(40 * 60 * 1000) // the LARGE browser regression
    expect(guaranteed).toBeGreaterThan(2 * 27.8 * 60 * 1000 - 60_000) // 2x the longest measured call
    // Renewed at T0, then a single 50-minute call: still owned at its end.
    const renewed = renewedLock(lockAt(T0), { now: T0 })
    expect(leaseExpired(renewed, { now: T0 + 50 * 60 * 1000 })).toBe(false)
  })

  it('renews only every LEASE_RENEW_INTERVAL_MS — the lock is a hot-path file', () => {
    // The measured EPERM storm of 28.07.2026: three writes of this one file
    // within milliseconds lost the rename to a real-time scanner five times.
    const lock = lockAt(T0, { leaseUntil: T0 + LEASE_MS })
    expect(shouldRenewLease({ lock, now: T0 + LEASE_RENEW_INTERVAL_MS - 1000 })).toBe(false)
    expect(shouldRenewLease({ lock, now: T0 + LEASE_RENEW_INTERVAL_MS + 1000 })).toBe(true)
  })

  it('needs NO migration: a lock without leaseUntil carries an implicit one', () => {
    // The session that MERGES this code is a live owner whose lock predates the
    // lease. It must keep working, and it must not need a step anyone remembers.
    const legacy = lockAt(T0)
    expect(leaseUntilOf(legacy)).toBe(T0 + LEASE_MS)
    expect(leaseExpired(legacy, { now: T0 + LEASE_MS - 1 })).toBe(false)
    expect(leaseExpired(legacy, { now: T0 + LEASE_MS + 1 })).toBe(true)
    expect(shouldRenewLease({ lock: legacy, now: T0 })).toBe(true) // writes a real one at once
  })

  it('an unreadable lock or clock never expires anybody', () => {
    expect(leaseExpired(null, { now: T0 })).toBe(false)
    expect(leaseExpired({}, { now: T0 })).toBe(false)
    expect(leaseExpired(lockAt(T0), { now: undefined })).toBe(false)
    expect(leaseExpired({ leaseUntil: 'soon' }, { now: T0 })).toBe(false)
    expect(renewedLock(null, { now: T0 })).toBe(null)
  })

  it('renewal does not touch claimedAt — that would withdraw a taken handover', () => {
    const lock = lockAt(T0, { handedOver: true, handedOverAt: T0 })
    const next = renewedLock(lock, { now: T0 + 1000 })
    expect(next.claimedAt).toBe(T0)
    expect(next.handedOver).toBe(true)
    expect(next.leaseUntil).toBe(T0 + 1000 + LEASE_MS)
  })

  it('§8 lease: a renewal under a STALE fence is refused', () => {
    // Otherwise a woken owner would renew its way back into a live lease beside
    // the successor, and the fence would merely have RECORDED the takeover.
    const fenceState = { fence: 7, holder: 's-new', holders: [{ sessionId: 's-owner', fence: 6 }] }
    const d = renewalDecision({ lock: lockAt(T0), sessionId: 's-owner', fenceState, now: T0 + LEASE_MS })
    expect(d).toEqual({ renew: false, reason: 'fence-stale' })
  })

  it('renews for the owner, refuses for a stranger', () => {
    const fenceState = { fence: 6, holder: 's-owner', holders: [{ sessionId: 's-owner', fence: 6 }] }
    expect(renewalDecision({ lock: lockAt(T0), sessionId: 's-owner', fenceState, now: T0 + LEASE_MS }).renew).toBe(true)
    expect(renewalDecision({ lock: lockAt(T0), sessionId: 's-other', fenceState, now: T0 }).reason).toBe('not-owner')
    expect(renewalDecision({ lock: null, sessionId: 's-owner', fenceState, now: T0 }).reason).toBe('no-lock')
  })

  it('INDEPENDENCE: the lease acts with NO fence file, NO declaration and NO launcher state', () => {
    // The lease is arithmetic on the lock alone and needs none of the other
    // layers' inputs — which is the point: on the lost night the declaration had
    // expired, the launcher state was intact and every one of them agreed the
    // owner was alive.
    const lock = lockAt(T0, { leaseUntil: T0 + LEASE_MS })
    expect(leaseExpired(lock, { now: T0 + LEASE_MS + 1 })).toBe(true)
    expect(renewalDecision({ lock, sessionId: 's-owner', fenceState: null, now: T0 + LEASE_MS }).renew).toBe(true)
    expect(renewalDecision({ lock, sessionId: 's-owner', fenceState: 'corrupt', now: T0 + LEASE_MS }).renew).toBe(true)
  })
})

describe('the fence — monotonic, max-wins, in its own file', () => {
  it('§8 lease: a DELETED fence file does not lower the high-water mark', () => {
    // `acquire` deletes the LOCK, which is why the fence may not live there; the
    // lock in turn carries a copy, which is why deleting the FENCE cannot reset
    // the counter and re-admit a dispossessed session's writes.
    expect(nextFence({ fenceState: null, priorFence: 9 })).toBe(10)
    expect(nextFence({ fenceState: { fence: 3 }, priorFence: 9 })).toBe(10)
    expect(nextFence({ fenceState: { fence: 12 }, priorFence: 9 })).toBe(13)
    expect(nextFence({ fenceState: 'not json', priorFence: null })).toBe(1)
  })

  it('a grant can never lower the mark, and remembers a bounded history', () => {
    let state = null
    for (let i = 1; i <= FENCE_HOLDER_HISTORY + 5; i += 1) {
      state = grantedFenceState({ fenceState: state, sessionId: `s${i}`, fence: nextFence({ fenceState: state }), now: T0 + i })
    }
    expect(state.fence).toBe(FENCE_HOLDER_HISTORY + 5)
    expect(state.holders.length).toBe(FENCE_HOLDER_HISTORY)
    expect(fenceHeldBy(state, 's1')).toBe(null) // aged out → reads as "never held" → allowed
    expect(fenceHeldBy(state, `s${FENCE_HOLDER_HISTORY + 5}`)).toBe(FENCE_HOLDER_HISTORY + 5)
    // A stale grant number cannot walk the mark backwards.
    const backwards = grantedFenceState({ fenceState: state, sessionId: 'sX', fence: 2, now: T0 })
    expect(backwards.fence).toBe(FENCE_HOLDER_HISTORY + 5)
  })

  it('one session re-acquiring keeps only its newest grant', () => {
    const a = grantedFenceState({ fenceState: null, sessionId: 's1', fence: 1, now: T0 })
    const b = grantedFenceState({ fenceState: a, sessionId: 's2', fence: 2, now: T0 + 1 })
    const c = grantedFenceState({ fenceState: b, sessionId: 's1', fence: 3, now: T0 + 2 })
    expect(c.holders.filter((h) => h.sessionId === 's1').length).toBe(1)
    expect(fenceStatus({ fenceState: c, sessionId: 's1' })).toEqual({ current: 3, held: 3, stale: false })
    expect(fenceStatus({ fenceState: c, sessionId: 's2' })).toEqual({ current: 3, held: 2, stale: true })
  })

  it('a session that never held a fence is NEVER stale', () => {
    // The gate must not be able to fire on an attended window that has nothing
    // to do with the batch — over-blocking cost this project ~30 turns once.
    const state = grantedFenceState({ fenceState: null, sessionId: 's-owner', fence: 4, now: T0 })
    expect(fenceStatus({ fenceState: state, sessionId: 'a-user-window' })).toEqual({
      current: 4,
      held: null,
      stale: false,
    })
    expect(fenceStatus({ fenceState: null, sessionId: 's-owner' }).stale).toBe(false)
    expect(fenceStatus({ fenceState: { fence: 'x', holders: 'y' }, sessionId: 's-owner' }).stale).toBe(false)
  })

  it('normalises a torn file instead of trusting it', () => {
    const n = normaliseFence({ fence: -3, holder: 7, holders: [{ sessionId: 'a' }, { fence: 2 }, null, { sessionId: 'b', fence: 2 }] })
    expect(n).toEqual({ fence: 0, holder: '', holders: [{ sessionId: 'b', fence: 2, at: 0 }] })
  })
})

describe('the chokepoint — the four paths with no guard of their own', () => {
  const stale = { fence: 8, holder: 's-new', holders: [{ sessionId: 's-old', fence: 7 }, { sessionId: 's-new', fence: 8 }] }
  const call = (over) => fenceDecision({ fenceState: stale, sessionId: 's-old', ...over })

  it('§8 chokepoint: a stale-fence session is refused a PUSH, a TICK, a BOARD PUBLISH and a DASHBOARD-STATE merge', () => {
    // THE NIGHT this protects against: the woken owner still pushes to main.
    // Without the chokepoint the fence would protect only the file that was
    // already protected (docs/batch-resilience.md §3, layer 1).
    expect(call({ toolName: 'Bash', command: 'git push origin HEAD:main' })).toMatchObject({ block: true, kind: 'git-main' })
    expect(call({ toolName: 'Bash', command: 'git merge --no-ff feat/x' })).toMatchObject({ block: true, kind: 'git-main' })
    expect(call({ toolName: 'Edit', filePath: 'TASKS.md' })).toMatchObject({ block: true, kind: 'tasks' })
    expect(call({ toolName: 'Edit', filePath: 'docs/tasks-archive.md' })).toMatchObject({ block: true, kind: 'tasks' })
    expect(call({ toolName: 'Bash', command: 'node scripts/board-publish.mjs' })).toMatchObject({
      block: true,
      kind: 'board-publish',
    })
    expect(call({ toolName: 'Bash', command: 'node scripts/focus.mjs confirm' })).toMatchObject({
      block: true,
      kind: 'dashboard-state',
    })
    expect(call({ toolName: 'Write', filePath: '.claude/dashboard-state.json' })).toMatchObject({
      block: true,
      kind: 'dashboard-state',
    })
  })

  it('names the two fences and the way back in its reason', () => {
    const r = call({ toolName: 'Bash', command: 'git push' })
    expect(r.reason).toContain('held fence 7')
    expect(r.reason).toContain('fence 8')
    expect(r.reason).toContain('batch-claim.mjs')
  })

  it('§8 chokepoint: a CURRENT-fence session is not refused any of them', () => {
    const ok = (over) => fenceDecision({ fenceState: stale, sessionId: 's-new', ...over })
    expect(ok({ toolName: 'Bash', command: 'git push origin main' }).block).toBe(false)
    expect(ok({ toolName: 'Edit', filePath: 'TASKS.md' }).block).toBe(false)
    expect(ok({ toolName: 'Bash', command: 'node scripts/board-publish.mjs' }).block).toBe(false)
    expect(ok({ toolName: 'Write', filePath: '.claude/dashboard-state.json' }).block).toBe(false)
  })

  it('leaves everything OUTSIDE the four families alone, even for a fenced-out session', () => {
    // A gate that can trap the session is worse than the staleness it fixes: a
    // dispossessed session must still be able to read, commit locally and finish
    // its own file work.
    for (const over of [
      { toolName: 'Read', filePath: 'TASKS.md' },
      { toolName: 'Bash', command: 'git commit -m "work"' },
      { toolName: 'Bash', command: 'git log --merges --oneline' },
      { toolName: 'Bash', command: 'git status --short' },
      { toolName: 'Bash', command: 'npm run test:unit' },
      { toolName: 'Edit', filePath: 'src/world/world.ts' },
      { toolName: 'Bash', command: 'node scripts/point-brief.mjs 434' },
      { toolName: 'Grep', command: undefined, filePath: undefined },
      // Point 473 — the SHARED classifier: a guarded name MENTIONED in a read is
      // not that action, and `git log --merges` is not a merge.
      { toolName: 'Bash', command: 'grep -n "board-publish.mjs" docs/batch-autonomy.md' },
      { toolName: 'Bash', command: 'grep -rn "git push" docs' },
      { toolName: 'Bash', command: 'git worktree list' },
      { toolName: 'Bash', command: 'grep -c "TASKS.md" docs/notes.md' },
    ]) {
      expect(call(over), JSON.stringify(over)).toMatchObject({ block: false })
    }
  })

  it('sees the guarded verb in any segment of a chained command', () => {
    expect(call({ toolName: 'Bash', command: 'git fetch && git merge origin/main' }).block).toBe(true)
    expect(call({ toolName: 'PowerShell', command: 'git add -A; git push' }).block).toBe(true)
    expect(call({ toolName: 'Bash', command: 'git -c core.pager=cat push origin main' }).block).toBe(true)
  })

  it('stands down for a PAUSED batch', () => {
    expect(call({ toolName: 'Bash', command: 'git push', paused: true }).block).toBe(false)
  })

  it('INDEPENDENCE: the chokepoint acts with NO lock, NO lease and NO launcher state', () => {
    // The fence file is the only input. That is the point of giving it a file of
    // its own: `acquire` DELETES the lock, so a mark kept there would be lost at
    // the one moment it decides anything.
    expect(call({ toolName: 'Bash', command: 'git push' })).toMatchObject({ block: true })
  })

  it('is total on junk input — the wrapper fails open, and so does the core', () => {
    expect(fenceDecision()).toEqual({ block: false, reason: '', kind: null })
    expect(fenceDecision({ fenceState: 'x', sessionId: 3, toolName: null }).block).toBe(false)
    expect(fenceGuardedAction()).toBe(null)
    expect(fenceGuardedAction({ toolName: 'Bash', command: null })).toBe(null)
  })
})
