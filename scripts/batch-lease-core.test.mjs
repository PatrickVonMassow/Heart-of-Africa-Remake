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
  DECLARED_WAIT_LEASE_MS,
  TAKEOVER_OVERRIDE_MAX_MS,
  leaseTakeoverDecision,
  inDeclaredWaitWindow,
  declaredWaitStale,
  dispossessionNotice,
  mainWritingAction,
  mainWriteFenceDecision,
} from './batch-lease-core.mjs'
import { LAUNCHER_WORK_MAX_AGE_MS } from './batch-in-flight-core.mjs'

const T0 = 1_800_000_000_000
const lockAt = (t, extra = {}) => ({ sessionId: 's-owner', claimedAt: t, pid: 4242, ...extra })
const at = (mins) => mins * 60_000

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
    expect(fenceStatus({ fenceState: c, sessionId: 's1' })).toEqual({ current: 3, held: 3, stale: false, takeover: null })
    expect(fenceStatus({ fenceState: c, sessionId: 's2' })).toEqual({ current: 3, held: 2, stale: true, takeover: null })
  })

  it('a session that never held a fence is NEVER stale', () => {
    // The gate must not be able to fire on an attended window that has nothing
    // to do with the batch — over-blocking cost this project ~30 turns once.
    const state = grantedFenceState({ fenceState: null, sessionId: 's-owner', fence: 4, now: T0 })
    expect(fenceStatus({ fenceState: state, sessionId: 'a-user-window' })).toEqual({
      current: 4,
      held: null,
      stale: false,
      takeover: null,
    })
    expect(fenceStatus({ fenceState: null, sessionId: 's-owner' }).stale).toBe(false)
    expect(fenceStatus({ fenceState: { fence: 'x', holders: 'y' }, sessionId: 's-owner' }).stale).toBe(false)
  })

  it('normalises a torn file instead of trusting it', () => {
    const n = normaliseFence({ fence: -3, holder: 7, holders: [{ sessionId: 'a' }, { fence: 2 }, null, { sessionId: 'b', fence: 2 }] })
    expect(n).toEqual({ fence: 0, holder: '', holders: [{ sessionId: 'b', fence: 2, at: 0 }], lastTakeover: null })
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

  it('§8 chokepoint: the LANDING CHAIN is refused too — it does all four in one call', () => {
    // Point 594 wrapped merge + tick + archive move + board publish + branch
    // deletion in one command. Every one of those is a family this chokepoint
    // guards, and NONE of them is visible inside the process. A convenience
    // command that let a dispossessed session do in one call what it is refused
    // in six would not be a convenience — it would be the hole.
    for (const command of [
      'node scripts/land-point.mjs 594',
      'node scripts/land-point.mjs 594 --serial',
      'cd /repo && node scripts/land-point.mjs 594',
    ]) {
      expect(call({ toolName: 'Bash', command })).toMatchObject({ block: true, kind: 'git-main' })
    }
    expect(fenceGuardedAction({ toolName: 'Bash', command: 'node scripts/land-point.mjs 594' }).what).toMatch(
      /landing chain/,
    )
  })

  it('§8 chokepoint: the landing chain stays allowed for the CURRENT-fence session, and READING it always', () => {
    // The same asymmetry the rest of the chokepoint keeps: it gates the ACTION,
    // never the ability to find out what the action is.
    expect(fenceDecision({ fenceState: stale, sessionId: 's-new', toolName: 'Bash', command: 'node scripts/land-point.mjs 594' }).block).toBe(false)
    expect(fenceGuardedAction({ toolName: 'Read', filePath: 'scripts/land-point.mjs' })).toBe(null)
    // A --dry run is still the command; the gate does not parse intent out of flags.
    expect(call({ toolName: 'Bash', command: 'node scripts/land-point.mjs 594 --dry' }).block).toBe(true)
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

  it('§8 chokepoint: a MultiEdit of the guarded files is the write it is, not a read', () => {
    // Point 542, four-eyes round 3 (Sol): `MultiEdit` was added to the write-tool
    // set here without a case of its own, which is the same hole the round found
    // twice already — a write tool a set forgets passes silently the day the
    // harness gains it. The asymmetry the whole chokepoint keeps still holds:
    // the ACTION is refused, never the READ that would tell the session why.
    expect(fenceGuardedAction({ toolName: 'MultiEdit', filePath: 'TASKS.md' })).toMatchObject({ kind: 'tasks' })
    expect(fenceGuardedAction({ toolName: 'MultiEdit', filePath: 'docs/tasks-archive.md' })).toMatchObject({
      kind: 'tasks',
    })
    expect(fenceGuardedAction({ toolName: 'MultiEdit', filePath: '.claude/dashboard-state.json' })).toMatchObject({
      kind: 'dashboard-state',
    })
    expect(call({ toolName: 'MultiEdit', filePath: 'TASKS.md' })).toMatchObject({ block: true, kind: 'tasks' })
    // and the current-fence owner keeps doing all of it
    expect(fenceDecision({ fenceState: stale, sessionId: 's-new', toolName: 'MultiEdit', filePath: 'TASKS.md' }).block).toBe(false)
    // a path alone is still not an action
    expect(fenceGuardedAction({ toolName: 'Read', filePath: 'TASKS.md' })).toBe(null)
    expect(fenceGuardedAction({ toolName: 'MultiEdit', filePath: 'src/world/world.ts' })).toBe(null)
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

  // ── A WRAPPER MUST NOT HIDE A GUARDED ACTION ──────────────────────────────
  // Four-eyes review of point 473 (30.07.2026): judging the command HEAD fixed
  // the false denials at the idle-claim gate, but the old whole-string regexes
  // had seen THROUGH `bash -c`, `eval` and `$( … )` by accident — and here that
  // accident was load-bearing. A dispossessed session could otherwise move
  // shared history through any shell wrapper. Nothing pinned this before, so
  // all three could regress silently.
  it('sees a guarded action through a shell wrapper (`bash -c`, `pwsh -Command`, `sh -c`)', () => {
    expect(call({ toolName: 'Bash', command: 'bash -c "git push origin main"' })).toMatchObject({
      block: true,
      kind: 'git-main',
    })
    expect(call({ toolName: 'PowerShell', command: 'pwsh -Command "git push"' })).toMatchObject({
      block: true,
      kind: 'git-main',
    })
    expect(call({ toolName: 'Bash', command: 'sh -c "git merge --no-ff feat/x"' })).toMatchObject({
      block: true,
      kind: 'git-main',
    })
    expect(call({ toolName: 'Bash', command: 'sh -c "node scripts/board-publish.mjs --now"' })).toMatchObject({
      block: true,
      kind: 'board-publish',
    })
    expect(call({ toolName: 'Bash', command: 'bash -c "node scripts/focus.mjs confirm"' })).toMatchObject({
      block: true,
      kind: 'dashboard-state',
    })
    expect(call({ toolName: 'Bash', command: 'bash -c "echo x >> TASKS.md"' })).toMatchObject({
      block: true,
      kind: 'tasks',
    })
  })

  it('sees a guarded action through `eval`, `$( … )` and backticks', () => {
    const bt = String.fromCharCode(96)
    expect(call({ toolName: 'Bash', command: 'eval "git push"' })).toMatchObject({ block: true, kind: 'git-main' })
    expect(call({ toolName: 'Bash', command: 'echo $(git push)' })).toMatchObject({ block: true, kind: 'git-main' })
    expect(call({ toolName: 'Bash', command: `echo ${bt}git push${bt}` })).toMatchObject({
      block: true,
      kind: 'git-main',
    })
    expect(call({ toolName: 'Bash', command: 'echo $(node scripts/board-publish.mjs)' })).toMatchObject({
      block: true,
      kind: 'board-publish',
    })
  })

  // A WRAPPER'S OWN FLAGS ARE NOT THE PROGRAM (four-eyes round 2, 31.07.2026).
  // `sudo -u me git push` classified as the program `-u` and went through — a
  // regression against the old whole-string regex, and nothing pinned it,
  // "which is exactly how they were missed".
  it("steps over a wrapper's flags, flag VALUES and positionals to find the program", () => {
    for (const command of [
      'sudo -u me git push',
      'env -i git push',
      'env -u FOO git push',
      'nice -n 5 git push',
      'xargs -n1 git push', // attached value
      'xargs -I{} bash -c "git push"', // attached value + nested shell
      'time -p git push',
      'timeout 60 bash -c "git push"', // a positional of its own
      'timeout -k 5 60 bash -c "git push"',
      'sudo -u me env -i nice -n 5 git push', // stacked wrappers
    ]) {
      expect(call({ toolName: 'Bash', command }), command).toMatchObject({ block: true, kind: 'git-main' })
    }
  })

  it('reads a COMBINED short-flag cluster and an attached payload as the command flag', () => {
    for (const command of ['bash -lc "git push"', 'bash -ec "git push"', 'bash -c"git push"', 'sh -lc "git merge x"']) {
      expect(call({ toolName: 'Bash', command }), command).toMatchObject({ block: true, kind: 'git-main' })
    }
  })

  it('FAILS CLOSED past the unwrapping depth — not looking is no licence', () => {
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const nest = (n) => {
      let cmd = 'git push'
      for (let k = 0; k < n; k++) cmd = `bash -c "${esc(cmd)}"`
      return cmd
    }
    expect(call({ toolName: 'Bash', command: nest(6) })).toMatchObject({ block: true, kind: 'git-main' })
    // Past the cap the classifier stops reading — the fence refuses anyway.
    expect(call({ toolName: 'Bash', command: nest(9) })).toMatchObject({ block: true, kind: 'nested' })
    expect(call({ toolName: 'Bash', command: nest(9) }).reason).toContain('wrapped deeper')
  })

  it('a wrapper around a READ is still a read, and a deep nesting cannot hang it', () => {
    for (const command of [
      'bash -c "git status --short"',
      'bash -c "git log --merges"',
      'sh -c "node scripts/point-brief.mjs 473"',
      "grep -c '$(git push)' notes.md", // single-quoted: inert in a real shell too
      'grep "\\$(git push)" notes.md', // escaped inside double quotes: inert too
      'grep -n "eval" docs/notes.md',
      'sudo git log',
      'env -i git status',
      'timeout 5 bash -c "echo ok"',
      'xargs -n1 grep foo',
      'nice -n 5 git log',
      'time -p git status',
      'sudo -u me git diff',
    ]) {
      expect(call({ toolName: 'Bash', command }), command).toMatchObject({ block: false })
    }
    const deep = 'bash -c "bash -c \'bash -c \\"git push\\"\'"'
    expect(() => call({ toolName: 'Bash', command: deep })).not.toThrow()
    expect(call({ toolName: 'Bash', command: deep }).block).toBe(true)
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

describe('the main-write ownership fence', () => {
  const decide = (over = {}) =>
    mainWriteFenceDecision({ branch: 'main', toolName: 'Bash', command: 'git commit -m x', ...over })

  it('refuses a main-writing action from a session that holds no lock, in words', () => {
    const decision = decide({ ownsBatchLock: false })
    expect(decision).toMatchObject({ block: true, registerWriter: false })
    expect(decision.reason).toContain('MAIN WRITE REFUSED')
    expect(decision.reason).toContain('holds no batch lock')
    expect(decision.reason).toContain('Nothing was acquired silently')
    expect(decision.reason).toContain('batch-claim.mjs')
  })

  it('allows and registers an owner before its main write', () => {
    expect(decide({ ownsBatchLock: true })).toEqual({ block: false, registerWriter: true, reason: '' })
  })

  it('stands down for a paused batch and an isolated worktree', () => {
    expect(decide({ paused: true })).toEqual({ block: false, registerWriter: false, reason: '' })
    expect(decide({ worktree: true })).toEqual({ block: false, registerWriter: false, reason: '' })
  })

  it('does not conscript reads or mutations on a feature branch', () => {
    expect(decide({ branch: 'feat/x' })).toEqual({ block: false, registerWriter: false, reason: '' })
    expect(decide({ toolName: 'Bash', command: 'git status --short' })).toEqual({
      block: false,
      registerWriter: false,
      reason: '',
    })
    expect(mainWritingAction({ toolName: 'Edit' }).writes).toBe(true)
  })

  it('allows build and test gates that only write ignored outputs', () => {
    for (const command of [
      'npm run build',
      'npm run lint',
      'npm run test:unit',
      'npm test',
      'npx vitest run scripts/batch-lease-core.test.mjs',
      'timeout 30 npm run test:unit 2>&1',
      'bash -lc "npm run build"',
    ]) {
      expect(mainWritingAction({ toolName: 'Bash', command }), command).toEqual({ writes: false, what: '' })
      expect(decide({ ownsBatchLock: false, command }), command).toEqual({
        block: false,
        registerWriter: false,
        reason: '',
      })
    }
  })

  it('still refuses tracked-state operations and gate output redirected to a checkout file', () => {
    for (const command of [
      'git commit -m x',
      'git push',
      'node scripts/land-point.mjs 795 --model "Opus 5"',
      'npm run build > build-report.txt',
      'bash -lc "git commit -m x"',
    ]) {
      expect(mainWritingAction({ toolName: 'Bash', command }).writes, command).toBe(true)
      expect(decide({ ownsBatchLock: false, command }).block, command).toBe(true)
    }
    expect(mainWritingAction({ toolName: 'Bash', command: 'npm run build > /dev/null' }).writes).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// POINT 556 — an expired lease alone no longer dispossesses a LIVE owner.
//
// MEASURED 08.08.2026, 05:45Z: `LEASE EXPIRED: 5551713b… (pid 4048953) has not
// renewed for 63 min — taking the batch` was logged while that owner was alive,
// mid-verification, with its delegated agent's worktree active — and the tick
// printed BOTH corroborating signals in the same breath. Four earlier ticks had
// skipped on exactly those signals at 5, 9, 18 and 33 minutes of heartbeat age;
// only the lease branch overrode them. Two sessions then shared one repository.
describe('the takeover — an expired lease is necessary, not sufficient (point 556)', () => {

  // NOTE ON THE NUMBERS: `leaseAgeMs` is time past the lease's OWN end, not the
  // heartbeat age the launcher logs. The incident's owner was silent 63 min but
  // its lease — renewed at the start of the blocking call — was only 3 min out.
  it('expired lease + LIVE pid + ADVANCING work → SKIP, naming the lease age it overrode', () => {
    const d = leaseTakeoverDecision({
      leaseAgeMs: at(3),
      pid: 4048953,
      pidIdentifiable: true,
      pidLive: true,
      workAdvancing: true,
      workJudgedOn: 'git',
      workSummary: 'active 2 min ago (working files)',
    })
    expect(d.take).toBe(false)
    expect(d.reason).toBe('live-owner-working')
    // The skip must SAY what the arithmetic wanted, or the next incident is as
    // invisible in the log as this one was.
    expect(d.why).toContain('3 min out')
    expect(d.why).toContain('4048953')
    expect(d.why).toContain('active 2 min ago (working files)')
  })

  it('expired lease + DEAD pid → TAKEOVER (the recovery the lease exists for is untouched)', () => {
    const d = leaseTakeoverDecision({ leaseAgeMs: at(63), pid: 4048953, pidIdentifiable: true, pidLive: false, workAdvancing: true, workJudgedOn: 'git' })
    expect(d).toMatchObject({ take: true, reason: 'pid-dead' })
  })

  it('expired lease + UNIDENTIFIABLE owner process → TAKEOVER', () => {
    // A lock with no pid at all: nothing can be asked about the process, and
    // "we could not ask" is never a reason to leave the batch stranded.
    const d = leaseTakeoverDecision({ leaseAgeMs: at(90), pid: null, pidIdentifiable: false, pidLive: false, workAdvancing: true, workJudgedOn: 'git' })
    expect(d).toMatchObject({ take: true, reason: 'pid-unidentifiable' })
  })

  it('expired lease + live pid + STALE declared work → TAKEOVER', () => {
    // A wedged process breathes. The pid may corroborate evidence of work; it may
    // never stand in for it.
    const d = leaseTakeoverDecision({ leaseAgeMs: at(63), pid: 77, pidIdentifiable: true, pidLive: true, workAdvancing: false })
    expect(d).toMatchObject({ take: true, reason: 'work-not-advancing' })
  })

  it('expired lease + live pid + NOTHING declared → TAKEOVER (silence is not a claim)', () => {
    expect(leaseTakeoverDecision({ leaseAgeMs: at(120), pid: 77, pidIdentifiable: true, pidLive: true }).take).toBe(true)
  })

  it('is total on junk input and defaults toward taking a batch nobody can vouch for', () => {
    expect(leaseTakeoverDecision().take).toBe(true)
    expect(leaseTakeoverDecision({ leaseAgeMs: 'soon' }).why).toContain('an expired lease')
  })
})

// POINT 556, second clause — a call that blocks past the lease keeps the batch,
// because the declared wait bought the window IN ADVANCE. The alternative on
// offer (renew at call start as well as at completion) cannot do this: a renewal
// buys exactly one LEASE_MS however often it fires, and the call at issue is one
// that never completes.
describe('the declared wait — how a call blocking for HOURS renews (point 556)', () => {
  const declared = (t0, until) => ({ sessionId: 's-owner', claimedAt: t0, pid: 42, leaseUntil: until, declaredWait: { at: t0, until } })

  it('the extension window is pinned to the launcher’s own declaration window', () => {
    // Longer would keep the batch on paperwork the launcher no longer reads;
    // shorter would expire a wait the launcher still believes in.
    expect(DECLARED_WAIT_LEASE_MS).toBe(LAUNCHER_WORK_MAX_AGE_MS)
    expect(DECLARED_WAIT_LEASE_MS).toBeGreaterThan(LEASE_MS)
  })

  it('a call blocking PAST the ordinary lease is still covered — three hours in', () => {
    const lock = declared(T0, T0 + DECLARED_WAIT_LEASE_MS)
    expect(leaseExpired(lock, { now: T0 + LEASE_MS + 1 })).toBe(false)
    expect(leaseExpired(lock, { now: T0 + 3 * 60 * 60_000 })).toBe(false)
    // …and it is NOT eternal: past the declared window the arithmetic resumes.
    expect(leaseExpired(lock, { now: T0 + DECLARED_WAIT_LEASE_MS + 1 })).toBe(true)
  })

  it('a renewal never CLOBBERS the extension backwards', () => {
    // renewedLock writes now + LEASE_MS unconditionally, so the rate limit is what
    // keeps a 4-hour extension from being shortened to 60 minutes by a tool call.
    const lock = declared(T0, T0 + DECLARED_WAIT_LEASE_MS)
    expect(shouldRenewLease({ lock, now: T0 + at(10) })).toBe(false)
  })

  it('the extension lasts only while its OWN evidence advances', () => {
    const lock = declared(T0, T0 + DECLARED_WAIT_LEASE_MS)
    const beyondOrdinary = T0 + LEASE_MS + at(30)
    expect(inDeclaredWaitWindow(lock, { now: beyondOrdinary })).toBe(true)
    expect(declaredWaitStale(lock, { now: beyondOrdinary, workDeclared: true, workAdvancing: true })).toBe(false)
    expect(declaredWaitStale(lock, { now: beyondOrdinary, workDeclared: true, workAdvancing: false })).toBe(true)
    // A reader WITHOUT the evidence never ends it — only the launcher has it.
    expect(declaredWaitStale(lock, { now: beyondOrdinary, workDeclared: true })).toBe(false)
    // Inside the stretch an ordinary lease would have covered anyway, there is
    // nothing conditional to end.
    expect(declaredWaitStale(lock, { now: T0 + at(30), workDeclared: true, workAdvancing: false })).toBe(false)
  })

  it('a wait that is OVER stops being conditional — the trap this clause avoids', () => {
    // Without the `workDeclared` requirement this function reintroduces point
    // 556's own bug one step later: the agent finishes, the session starts a
    // 40-minute regression inside ONE call, its lease is still the four-hour
    // extension so no renewal is due, and with no declaration left the work reads
    // "not advancing" — the launcher would take the batch mid-regression.
    const lock = declared(T0, T0 + DECLARED_WAIT_LEASE_MS)
    const beyondOrdinary = T0 + LEASE_MS + at(30)
    expect(declaredWaitStale(lock, { now: beyondOrdinary, workDeclared: false, workAdvancing: false })).toBe(false)
    expect(leaseExpired(lock, { now: beyondOrdinary })).toBe(false)
  })

  it('is total on a lock with no extension, junk or none at all', () => {
    expect(inDeclaredWaitWindow(null, { now: T0 })).toBe(false)
    expect(inDeclaredWaitWindow({ declaredWait: 'soon' }, { now: T0 })).toBe(false)
    expect(inDeclaredWaitWindow(lockAt(T0), { now: T0 + LEASE_MS * 5 })).toBe(false)
    expect(declaredWaitStale(lockAt(T0), { now: T0, workAdvancing: false })).toBe(false)
  })
})

// POINT 556, third clause — the fenced-out owner LEARNS, at its next hook.
describe('the dispossession notice — the fenced session is told, and why', () => {
  const taken = {
    fence: 8,
    holder: 's-new',
    holders: [{ sessionId: 's-owner', fence: 7 }, { sessionId: 's-new', fence: 8 }],
    lastTakeover: { from: 's-owner', fence: 8, reason: 'a lease 63 min out and pid 4048953 is gone', at: T0 },
  }

  it('tells the dispossessed session what happened and what it may still do', () => {
    const n = dispossessionNotice({ fenceState: taken, sessionId: 's-owner' })
    expect(n.notify).toBe(true)
    expect(n.fence).toBe(8)
    expect(n.context).toContain('pid 4048953 is gone')
    // It had a verification worth handing over — so it is told to commit and say so.
    expect(n.context).toContain('COMMIT')
    expect(n.context).toContain('batch-claim.mjs')
  })

  it('a grant records the takeover, and a grant that took the batch from NOBODY does not', () => {
    const after = grantedFenceState({ fenceState: { fence: 7, holders: [{ sessionId: 's-owner', fence: 7 }] }, sessionId: 's-new', fence: 8, now: T0, takeover: { from: 's-owner', reason: 'pid dead' } })
    expect(after.lastTakeover).toMatchObject({ from: 's-owner', fence: 8, reason: 'pid dead' })
    // A free-lock acquisition leaves the standing record alone rather than
    // erasing it before its owner was ever told.
    const free = grantedFenceState({ fenceState: after, sessionId: 's-third', fence: 9, now: T0 + 1 })
    expect(free.lastTakeover).toMatchObject({ from: 's-owner' })
    // …and a session never records a takeover FROM ITSELF.
    expect(grantedFenceState({ fenceState: {}, sessionId: 's-a', fence: 1, now: T0, takeover: { from: 's-a' } }).lastTakeover).toBeUndefined()
  })

  it('speaks ONCE per fence number — injected context is paid for on every later request', () => {
    expect(dispossessionNotice({ fenceState: taken, sessionId: 's-owner', announcedFence: 8 }).notify).toBe(false)
    // A LATER takeover of the same session speaks again.
    expect(dispossessionNotice({ fenceState: { ...taken, fence: 9 }, sessionId: 's-owner', announcedFence: 8 }).notify).toBe(true)
  })

  it('stands down for a paused batch, the current owner and a session that never held a fence', () => {
    expect(dispossessionNotice({ fenceState: taken, sessionId: 's-owner', paused: true }).notify).toBe(false)
    expect(dispossessionNotice({ fenceState: taken, sessionId: 's-new' }).notify).toBe(false)
    expect(dispossessionNotice({ fenceState: taken, sessionId: 's-stranger' }).notify).toBe(false)
  })

  it('the reason is surfaced only to the session it names, and only while stale', () => {
    expect(fenceStatus({ fenceState: taken, sessionId: 's-owner' }).takeover).toMatchObject({ from: 's-owner' })
    expect(fenceStatus({ fenceState: taken, sessionId: 's-new' }).takeover).toBe(null)
    // The refusal at the chokepoint carries it too, so a denied merge says why.
    const denied = fenceDecision({ fenceState: taken, sessionId: 's-owner', toolName: 'Bash', command: 'git push' })
    expect(denied.reason).toContain('pid 4048953 is gone')
  })

  it('is total on junk input — it fails silent, never loud', () => {
    expect(dispossessionNotice()).toEqual({ notify: false, fence: 0, context: '' })
    expect(dispossessionNotice({ fenceState: 'x', sessionId: 4 }).notify).toBe(false)
    expect(normaliseFence({ lastTakeover: { from: 5 } }).lastTakeover).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// THE MIRROR-IMAGE FAILURE, closed by the four-eyes review of point 556
// (confirmed finding 1): the fix must not hand a WEDGED-but-alive owner the
// batch for ever. Before 556 that state resolved inside the hour.
describe('the takeover — the override is corroborated by OUTPUT and it is bounded', () => {
  const base = { leaseAgeMs: at(3), pid: 4048953, pidIdentifiable: true, pidLive: true, workAdvancing: true }

  it('a BREATHING declared pid corroborates nothing — a wedged owner is still taken over', () => {
    // `assessOwnerWork.advancing` is true if ANY answerable item checks out, and a
    // `--pid` item checks out for merely EXISTING. That is this module's own "a
    // live process (nothing produced) — the weakest".
    const d = leaseTakeoverDecision({ ...base, workJudgedOn: 'process' })
    expect(d).toMatchObject({ take: true, reason: 'work-breathing-only' })
    expect(leaseTakeoverDecision({ ...base, workJudgedOn: 'none' }).take).toBe(true)
    // …and the default, when nobody said what the advance rested on.
    expect(leaseTakeoverDecision({ ...base }).take).toBe(true)
  })

  it('PRODUCED output does corroborate — a commit, a written file, or a log still being written', () => {
    expect(leaseTakeoverDecision({ ...base, workJudgedOn: 'git' }).take).toBe(false)
    // `log` is the weakest of the three but it IS output: it is what a background
    // `npm test` declares, and refusing it would break the honest long run.
    expect(leaseTakeoverDecision({ ...base, workJudgedOn: 'log' }).take).toBe(false)
  })

  it('BOUNDS the override — advancing work may not outvote the arithmetic for ever', () => {
    const within = leaseTakeoverDecision({ ...base, leaseAgeMs: TAKEOVER_OVERRIDE_MAX_MS, workJudgedOn: 'git' })
    expect(within.take).toBe(false)
    const past = leaseTakeoverDecision({ ...base, leaseAgeMs: TAKEOVER_OVERRIDE_MAX_MS + 1, workJudgedOn: 'git' })
    expect(past).toMatchObject({ take: true, reason: 'override-expired' })
    // The ladder stays monotone: renew < lease < the override cap's total.
    expect(LEASE_RENEW_INTERVAL_MS).toBeLessThan(LEASE_MS)
    expect(TAKEOVER_OVERRIDE_MAX_MS).toBeLessThanOrEqual(LEASE_MS)
  })
})
