// Hard-singleton sweep (scripts/batch-singleton.mjs): the five mandated
// scenarios of the 24.07.2026 user order, pinned as regression witnesses —
//   (1) two racing starters against the atomic acquire → exactly one wins
//       (REAL child processes, real 'wx'/mkdir semantics);
//   (2) a live owner with a fresh heartbeat → a starter (incl. the post-reboot
//       autostart path) refuses;
//   (3) a genuinely dead owner (stale heartbeat + dead pid) → takeover allowed;
//   (4) the EXACT incident: reboot night, a live re-claimed session with a
//       fresh heartbeat → the autostart must NOT spawn; and its true root
//       cause: a stale heartbeat with a LIVE pid (mid-long-tool-call) is ALIVE;
//   (5) a non-owner session at the batch-progress-guard → stands down.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync, renameSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { REPO_ROOT } from './repo-paths.mjs'
import { WRITE_RETRY_DELAYS_MS } from './atomic-write.mjs'
import {
  assessOwner,
  spawnDecision,
  classifyParallel,
  isProbeSessionId,
  PROBE_SESSION_PREFIX,
  progressGuardDecision,
  acquire,
  heartbeat,
  release,
  readOwnerLock,
  heldByOtherLiveOwner,
  convertPendingSpawn,
  markHandover,
  withdrawHandover,
  withdrawalIsCausal,
  HANDOVER_SETTLE_MS,
  touchHandover,
  clearOwnBoundary,
  ownerStateKey,
  verdictRepeat,
  VERDICT_REPEAT_ESCALATE_AT,
  isOwnSpawn,
  renewLease,
  extendLease,
  readFence,
  grantFence,
  sweepableTmpFiles,
  resolveOwnership,
  ourClaudeProcess,
  statePathsFor,
  LOCK_PATH,
  BOUNDARY_LOG_PATH,
  BOUNDARY_MARKER_PATH,
  IN_FLIGHT_PATH,
  SESSIONS_SEEN_PATH,
  SESSION_ACTIVITY_PATH,
  PARALLEL_ALERT_PATH,
  DOCTOR_STATE_PATH,
  ANCESTOR_CACHE_PATH,
  DEAD_CONFIRM_MS,
  LEGACY_STALE_MS,
  PARALLEL_FRESH_MS,
  HANDOVER_GRACE_MS,
  LAUNCHER_TICK_MS,
  SPAWN_IDENTITY_TOLERANCE_MS,
} from './batch-singleton.mjs'
import { LEASE_MS, LEASE_RENEW_INTERVAL_MS } from './batch-lease-core.mjs'

const NOW = 1_784_900_000_000
const BOOT = NOW - 12 * 3600 * 1000 // machine booted 12 h ago
const aliveProbe = { exists: true, startedAt: null }
const deadProbe = { exists: false, startedAt: null }

// ---------------------------------------------------------------------------
// FINDING 3 (28.07.2026): the unit suite was writing "WITHDRAWN point 388 by s1"
// into the REAL .claude/boundary.log — `s1` is this file's test session id. The
// pre-push gate runs this suite on every push, so a test run could withdraw a
// boundary a live session had taken. Every state file must therefore be derived
// from the caller's lock path, so redirecting the lock redirects all of them.
describe('statePathsFor — a redirected lock never reaches the repo .claude/', () => {
  const inside = (p) => !resolve(p).startsWith(resolve(REPO_ROOT))

  it('derives EVERY state file from the given lock path, all outside the repo', () => {
    const base = join(tmpdir(), 'hoa-paths-test')
    const p = statePathsFor(join(base, 'batch-lock.json'))
    expect(Object.keys(p).length).toBeGreaterThanOrEqual(8)
    for (const [key, value] of Object.entries(p)) {
      expect([key, resolve(value)]).toEqual([key, resolve(base, basename(value))])
      expect(inside(value)).toBe(true) // NOT under the repository
    }
  })

  it('none of the redirected paths equals a repo default', () => {
    const defaults = [
      LOCK_PATH,
      BOUNDARY_LOG_PATH,
      BOUNDARY_MARKER_PATH,
      IN_FLIGHT_PATH,
      SESSIONS_SEEN_PATH,
      SESSION_ACTIVITY_PATH,
      PARALLEL_ALERT_PATH,
      DOCTOR_STATE_PATH,
      ANCESTOR_CACHE_PATH,
    ]
    const redirected = Object.values(statePathsFor(join(tmpdir(), 'hoa-paths-test', 'batch-lock.json')))
    for (const d of defaults) expect(redirected).not.toContain(d)
    // …and the repo defaults are themselves one consistent family, so a new
    // state file added to statePathsFor gets its default for free.
    expect(Object.values(statePathsFor(LOCK_PATH))).toEqual(expect.arrayContaining(defaults))
  })
})

// ---------------------------------------------------------------------------
describe('assessOwner (liveness = heartbeat AND real pid, never age alone)', () => {
  const lock = (over = {}) => ({
    sessionId: 'owner-1',
    claimedAt: NOW - 60_000,
    pid: 4242,
    pidStartedAt: NOW - 3600_000,
    ...over,
  })

  it('fresh heartbeat → alive, no pid probe needed (even a dead pid within the grace)', () => {
    expect(assessOwner(lock(), { now: NOW, bootTime: BOOT, probe: deadProbe }).alive).toBe(true)
  })

  it('THE INCIDENT ROOT CAUSE: stale heartbeat (24 min) but LIVE pid → ALIVE (a long tool call starves the heartbeat, not the process)', () => {
    const a = assessOwner(lock({ claimedAt: NOW - 24 * 60_000 }), {
      now: NOW,
      bootTime: BOOT,
      probe: { exists: true, startedAt: NOW - 3600_000 },
    })
    expect(a.alive).toBe(true)
    expect(a.reason).toBe('pid-alive')
  })

  it('scenario 3: stale heartbeat + dead pid → provably dead', () => {
    const a = assessOwner(lock({ claimedAt: NOW - 24 * 60_000 }), { now: NOW, bootTime: BOOT, probe: deadProbe })
    expect(a.alive).toBe(false)
    expect(a.reason).toBe('pid-dead')
  })

  it('pid reuse (start time differs) → dead', () => {
    const a = assessOwner(lock({ claimedAt: NOW - 24 * 60_000, pidStartedAt: NOW - 3600_000 }), {
      now: NOW,
      bootTime: BOOT,
      probe: { exists: true, startedAt: NOW - 10_000 },
    })
    expect(a.alive).toBe(false)
    expect(a.reason).toBe('pid-reused')
  })

  it('heartbeat predating the boot → dead (no claude survives a reboot) …', () => {
    const a = assessOwner(lock({ claimedAt: BOOT - 60_000 }), { now: NOW, bootTime: BOOT, probe: aliveProbe })
    expect(a.alive).toBe(false)
    expect(a.reason).toBe('heartbeat-predates-boot')
  })

  it('… but scenario 4: REBOOT ALONE IS NOT DEATH — a fresh post-boot heartbeat (re-claimed live session) is alive', () => {
    // The lock was re-claimed after the reboot: heartbeat is fresh and post-boot.
    const a = assessOwner(lock({ claimedAt: NOW - 2 * 60_000 }), { now: NOW, bootTime: NOW - 10 * 60_000, probe: aliveProbe })
    expect(a.alive).toBe(true)
  })

  it('legacy lock (no pid): generous age bound decides', () => {
    const legacy = { sessionId: 's', claimedAt: NOW - LEGACY_STALE_MS + 60_000 }
    expect(assessOwner(legacy, { now: NOW, bootTime: BOOT, probe: null }).alive).toBe(true)
    const stale = { sessionId: 's', claimedAt: NOW - LEGACY_STALE_MS - 60_000 }
    expect(assessOwner(stale, { now: NOW, bootTime: BOOT, probe: null }).alive).toBe(false)
  })

  it('THE LOST NIGHT (point 434): pid alive but the LEASE ran out → NOT alive, and the successor may start', () => {
    // 29./30.07.2026: the owner fell silent at 21:50 and still held the batch at
    // 04:19. Its process was alive the whole time, so every age-based verdict read
    // "alive" and the one authority that could act was fenced off by a condition.
    // The lease removes the condition: the owner stopped saying it was there.
    const a = assessOwner(lock({ claimedAt: NOW - LEASE_MS - 60_000, leaseUntil: NOW - 60_000 }), {
      now: NOW,
      bootTime: BOOT,
      probe: aliveProbe,
    })
    expect(a.alive).toBe(false)
    expect(a.reason).toBe('lease-expired')
    expect(spawnDecision(a)).toBe('spawn')
  })

  it('a RENEWED lease keeps the owner through a call far longer than the heartbeat cadence', () => {
    // The inverse failure and the more expensive one: a LARGE regression running
    // for 40 minutes inside ONE tool call writes no heartbeat, and must not be
    // shot in the back (docs/batch-resilience.md §5).
    const a = assessOwner(lock({ claimedAt: NOW - 40 * 60_000, leaseUntil: NOW + 20 * 60_000 }), {
      now: NOW,
      bootTime: BOOT,
      probe: aliveProbe,
    })
    expect(a).toMatchObject({ alive: true, reason: 'pid-alive' })
    expect(spawnDecision(a)).toBe('skip-alive')
  })

  it('NEEDS NO MIGRATION: a lock written before the lease existed carries an implicit one', () => {
    // The session that merges this code holds exactly such a lock and must keep
    // working; nothing may depend on a step somebody has to remember.
    const legacyShape = lock({ claimedAt: NOW - LEASE_MS + 60_000 })
    expect(assessOwner(legacyShape, { now: NOW, bootTime: BOOT, probe: aliveProbe })).toMatchObject({
      alive: true,
      reason: 'pid-alive',
    })
    const overdue = lock({ claimedAt: NOW - LEASE_MS - 60_000 })
    expect(assessOwner(overdue, { now: NOW, bootTime: BOOT, probe: aliveProbe }).reason).toBe('lease-expired')
  })

  it('THE VERDICT IS SINGULAR NOW: no `wedged` flag, no third spawn outcome', () => {
    // docs/batch-resilience.md §6 — three overlapping liveness verdicts must not
    // coexist. `WORK_STALL_*`, the wedgeAction/isOwnSpawn takeover construction,
    // the two-stage silence report and the WEDGED_MS valve are gone with this.
    const expired = assessOwner(lock({ claimedAt: NOW - LEASE_MS - 60_000 }), {
      now: NOW,
      bootTime: BOOT,
      probe: aliveProbe,
    })
    expect(expired.wedged).toBeUndefined()
    expect(['spawn', 'skip-alive']).toContain(spawnDecision(expired))
  })

  it('no lock → dead (free to claim)', () => {
    expect(assessOwner(null, { now: NOW, bootTime: BOOT, probe: null }).alive).toBe(false)
  })

  // --- THE HANDOVER (point 388) ---------------------------------------------
  // The night of 28.07.2026: the turn ended at a permitted boundary, the process
  // lived on, the lock stayed held and the launcher skipped 21 ticks. A handover
  // is the ONE case where a live pid does not mean a live owner — and it must
  // never widen into the age heuristic that caused the e9407cae incident.
  const handed = (over = {}) =>
    lock({ claimedAt: NOW - 60_000, handedOver: true, handedOverAt: NOW - 60_000 + 1, ...over })

  it('a handed-over lock whose process has ALREADY exited is free at once', () => {
    const a = assessOwner(handed(), { now: NOW, bootTime: BOOT, probe: deadProbe })
    expect(a.alive).toBe(false)
    expect(a.reason).toBe('handed-over')
    expect(spawnDecision(a)).toBe('spawn')
  })

  it('a handed-over lock with a LIVE process waits out the grace, then frees', () => {
    const at = NOW - HANDOVER_GRACE_MS + 60_000 // handed over, grace not yet elapsed
    const inGrace = assessOwner(handed({ claimedAt: at - 1, handedOverAt: at }), {
      now: NOW,
      bootTime: BOOT,
      probe: aliveProbe,
    })
    expect(inGrace.alive).toBe(true)
    expect(inGrace.reason).toBe('handover-grace')
    expect(spawnDecision(inGrace)).toBe('skip-alive')

    const past = NOW - HANDOVER_GRACE_MS - 1000
    const elapsed = assessOwner(handed({ claimedAt: past - 1, handedOverAt: past }), {
      now: NOW,
      bootTime: BOOT,
      probe: aliveProbe,
    })
    expect(elapsed.alive).toBe(false)
    expect(elapsed.reason).toBe('handed-over')
  })

  it('THE SAFETY INVARIANT: a session that kept working WITHDRAWS its own handover', () => {
    // A later Stop hook in the chain blocked the turn end, the session carried on
    // and its PostToolUse heartbeat stamped claimedAt past the handover. The lock
    // must read ALIVE again — no successor may be spawned beside a working session.
    const at = NOW - 30 * 60_000
    const a = assessOwner(handed({ handedOverAt: at, claimedAt: at + 1000 }), {
      now: NOW,
      bootTime: BOOT,
      probe: aliveProbe,
    })
    expect(a.alive).toBe(true)
    expect(a.reason).toBe('pid-alive')
    expect(spawnDecision(a)).toBe('skip-alive')
  })

  it('a half-written or forged handover flag alone frees nothing', () => {
    for (const bad of [{ handedOver: true, handedOverAt: undefined }, { handedOver: 'yes' }, { handedOver: false }]) {
      const a = assessOwner(lock({ claimedAt: NOW - 30 * 60_000, ...bad }), {
        now: NOW,
        bootTime: BOOT,
        probe: aliveProbe,
      })
      expect(a.alive).toBe(true)
    }
  })

  // --- WHAT REPLACED "PROGRESS, NOT AGE" (point 434) -------------------------
  // Point 402 taught this function to read the owner's DECLARED work, so a
  // session waiting on a delegated agent would not be judged by a clock it could
  // not feed. It worked, and it was still one inference too many: the declaration
  // could be leftover paperwork, it needed a tolerance, a stall bound and a
  // last-word test, and on the night of 29./30.07.2026 all of it agreed with the
  // other two verdicts that a seven-hour standstill was a live owner.
  // The lease says the same thing without inferring anything — a long wait keeps
  // the batch by WRITING a longer leaseUntil (`extendLease`), which the reader
  // only compares. These pin that the inference is gone and cannot come back.

  it('IGNORES a declaration entirely — no evidence may extend ownership any more', () => {
    const eternallyFresh = { declared: true, advancing: true, declaredAt: NOW, summary: 'an agent, allegedly' }
    const a = assessOwner(lock({ claimedAt: NOW - LEASE_MS - 60_000 }), {
      now: NOW,
      bootTime: BOOT,
      probe: aliveProbe,
      work: eternallyFresh,
    })
    expect(a).toMatchObject({ alive: false, reason: 'lease-expired' })
  })

  it('a long wait keeps the batch the ONE sanctioned way: a longer lease', () => {
    const declaredLong = lock({ claimedAt: NOW - LEASE_MS - 60_000, leaseUntil: NOW + 3 * 3600_000 })
    expect(assessOwner(declaredLong, { now: NOW, bootTime: BOOT, probe: aliveProbe })).toMatchObject({
      alive: true,
      reason: 'pid-alive',
    })
  })

  it('what no lease may ever do: revive a DEAD process', () => {
    const immortalLease = lock({ claimedAt: NOW - 30 * 60_000, leaseUntil: NOW + 10 * 3600_000 })
    expect(assessOwner(immortalLease, { now: NOW, bootTime: BOOT, probe: deadProbe }).reason).toBe('pid-dead')
    const preBoot = lock({ claimedAt: BOOT - 60_000, leaseUntil: NOW + 10 * 3600_000 })
    expect(assessOwner(preBoot, { now: NOW, bootTime: BOOT, probe: aliveProbe }).reason).toBe('heartbeat-predates-boot')
  })

  it('a CRASH still holds the lock until the lease runs out — only a taken boundary hands it over early', () => {
    const crashed = assessOwner(lock({ claimedAt: NOW - 30 * 60_000 }), { now: NOW, bootTime: BOOT, probe: aliveProbe })
    expect(crashed.alive).toBe(true)
    expect(spawnDecision(crashed)).toBe('skip-alive')
  })
})

// ---------------------------------------------------------------------------
// A context compaction mints a NEW session id while the lock keeps the old one.
// The PROCESS is the stable identity — a compaction happens inside one
// claude.exe — so ownership may resolve on it. What it may NEVER do is widen
// into "any live process owns it": a genuinely second window has its own claude
// process, and detecting it is what the singleton is for.
describe('resolveOwnership — identity on the process, never on liveness alone', () => {
  const lock = (over = {}) => ({ sessionId: 'old-id', claimedAt: NOW, pid: 4242, pidStartedAt: NOW - 3600_000, ...over })
  const ours = { pid: 4242, startedAt: NOW - 3600_000 }

  it('the SAME pid and start time under a NEW session id is ours, and asks to be restamped', () => {
    const r = resolveOwnership({ lock: lock(), sessionId: 'new-id', ancestor: ours })
    expect(r).toEqual({ mine: true, via: 'process', restamp: true })
  })

  it('a DIFFERENT pid is NOT ours — that is a second window, and it must stay visible', () => {
    const r = resolveOwnership({ lock: lock(), sessionId: 'new-id', ancestor: { pid: 9999, startedAt: NOW - 3600_000 } })
    expect(r.mine).toBe(false)
    expect(r.via).toBe('other-process')
  })

  it('a STALE pidStartedAt (the pid was reused) is NOT ours', () => {
    const r = resolveOwnership({ lock: lock(), sessionId: 'new-id', ancestor: { pid: 4242, startedAt: NOW - 5000 } })
    expect(r.mine).toBe(false)
    expect(r.via).toBe('pid-reused')
  })

  it('the matching id still decides first, and costs no walk', () => {
    expect(resolveOwnership({ lock: lock(), sessionId: 'old-id', ancestor: null })).toEqual({
      mine: true,
      via: 'session-id',
      restamp: false,
    })
  })

  it('where the platform cannot tell us, the answer is NO — the id decides exactly as before', () => {
    expect(resolveOwnership({ lock: lock(), sessionId: 'new-id', ancestor: null }).via).toBe('process-unknown')
    expect(resolveOwnership({ lock: lock({ pid: null }), sessionId: 'new-id', ancestor: ours }).via).toBe(
      'lock-without-pid',
    )
    expect(resolveOwnership({ lock: lock({ pidStartedAt: null }), sessionId: 'new-id', ancestor: ours }).via).toBe(
      'start-time-unknown',
    )
    expect(resolveOwnership({ lock: lock(), sessionId: 'new-id', ancestor: { pid: 4242, startedAt: null } }).via).toBe(
      'start-time-unknown',
    )
    expect(resolveOwnership({ lock: lock(), sessionId: '', ancestor: ours }).mine).toBe(false)
    expect(resolveOwnership({ lock: null, sessionId: 'new-id', ancestor: ours }).mine).toBe(false)
  })

  it("a launcher's pending-spawn lock is never claimed this way", () => {
    expect(resolveOwnership({ lock: lock({ kind: 'pending-spawn' }), sessionId: 'new-id', ancestor: ours }).via).toBe(
      'pending-spawn',
    )
  })
})

// ---------------------------------------------------------------------------
describe('spawnDecision (scenario 2 + 4: the launcher path)', () => {
  it('live owner, fresh heartbeat → skip (no spawn)', () => {
    const a = assessOwner({ sessionId: 's', claimedAt: NOW - 60_000, pid: 1, pidStartedAt: null }, { now: NOW, bootTime: BOOT, probe: aliveProbe })
    expect(spawnDecision(a)).toBe('skip-alive')
  })

  it('THE EXACT 24.07 BUG REPLAY: heartbeat 24 min stale, owner process alive → skip (the old 12-min window spawned here)', () => {
    const a = assessOwner({ sessionId: 'f8c46e2f', claimedAt: NOW - 24 * 60_000, pid: 4242, pidStartedAt: null }, { now: NOW, bootTime: BOOT, probe: aliveProbe })
    expect(spawnDecision(a)).toBe('skip-alive')
  })

  it('post-reboot with a fresh re-claimed heartbeat → skip (reboot is NOT sufficient)', () => {
    const a = assessOwner({ sessionId: 're-claimed', claimedAt: NOW - 60_000, pid: 777, pidStartedAt: null }, { now: NOW, bootTime: NOW - 5 * 60_000, probe: aliveProbe })
    expect(spawnDecision(a)).toBe('skip-alive')
  })

  it('post-reboot, owner never came back (pre-boot heartbeat, dead pid) → spawn', () => {
    const a = assessOwner({ sessionId: 'gone', claimedAt: NOW - 60 * 60_000, pid: 4242, pidStartedAt: null }, { now: NOW, bootTime: NOW - 30 * 60_000, probe: deadProbe })
    expect(spawnDecision(a)).toBe('spawn')
  })
})

describe('verdictRepeat (repetition is the signal, point 433 (c))', () => {
  it('ownerStateKey identifies ONE owner at ONE heartbeat, and moves when it moves', () => {
    // The key must hold still across the launcher's 15-minute ticks while nobody
    // works — otherwise "the same verdict twice" can never be observed — and it
    // must change as soon as the owner does something, so a later episode of the
    // same session counts from its own start.
    const lock = { sessionId: 's1', pid: 33572, claimedAt: 9 }
    expect(ownerStateKey(lock)).toBe('s1#33572#9')
    expect(ownerStateKey(lock)).toBe(ownerStateKey({ ...lock }))
    expect(ownerStateKey({ ...lock, claimedAt: 10 })).not.toBe(ownerStateKey(lock))
    expect(ownerStateKey(lock, 'expired')).toBe('s1#33572#9#expired')
    expect(ownerStateKey({ ...lock, pid: undefined })).toBe('s1#nopid#9')
    for (const bad of [null, {}, { sessionId: 's' }, { claimedAt: 1 }]) expect(ownerStateKey(bad)).toBe('')
  })

  it('the first reading is logged and escalates nothing', () => {
    expect(verdictRepeat({ key: 'pid-alive#s1#33572#9', lastKey: '' })).toEqual({
      key: 'pid-alive#s1#33572#9',
      repeats: 1,
      escalate: false,
      suppressLog: false,
    })
  })

  it('THE SAME STATE TWICE ESCALATES rather than repeating the verdict', () => {
    const key = 'pid-alive#s1#33572#9'
    const second = verdictRepeat({ key, lastKey: key, repeats: 1 })
    expect(second).toMatchObject({ repeats: 2, escalate: true, suppressLog: false })
    expect(VERDICT_REPEAT_ESCALATE_AT).toBe(2)
  })

  it('and then falls silent — nine identical lines is what the incident cost', () => {
    const key = 'pid-alive#s1#33572#9'
    let repeats = 1
    const escalations = []
    for (let tick = 2; tick <= 9; tick += 1) {
      const r = verdictRepeat({ key, lastKey: key, repeats })
      repeats = r.repeats
      if (r.escalate) escalations.push(r.repeats)
      if (r.repeats > VERDICT_REPEAT_ESCALATE_AT) expect(r.suppressLog).toBe(true)
    }
    expect(escalations).toEqual([2]) // exactly once, never once per tick
    expect(repeats).toBe(9)
  })

  it('a CHANGED verdict starts over — a new silence is news again', () => {
    expect(verdictRepeat({ key: 'work-stalled#s1#33572#9', lastKey: 'pid-alive#s1#33572#9', repeats: 7 })).toMatchObject({
      repeats: 1,
      escalate: false,
      suppressLog: false,
    })
  })

  it('a missing key decides nothing (fail-open)', () => {
    expect(verdictRepeat({ key: '', lastKey: 'x', repeats: 5 })).toEqual({ key: '', repeats: 0, escalate: false, suppressLog: false })
    expect(verdictRepeat()).toMatchObject({ escalate: false })
    // A corrupt counter cannot make the escalation fire twice or never.
    expect(verdictRepeat({ key: 'k', lastKey: 'k', repeats: -3 }).repeats).toBe(1)
    expect(verdictRepeat({ key: 'k', lastKey: 'k', repeats: NaN }).repeats).toBe(1)
  })
})

// ---------------------------------------------------------------------------
describe('isOwnSpawn (a pid is not an identity)', () => {
  const AT = NOW - 90 * 60_000
  const ok = { pid: 900, probe: { exists: true, startedAt: AT + 500 }, lastSpawnPid: 900, lastSpawnAt: AT }

  it('matches the recorded spawn when pid AND start time agree', () => {
    expect(isOwnSpawn(ok)).toBe(true)
    expect(isOwnSpawn({ ...ok, probe: { exists: true, startedAt: AT - SPAWN_IDENTITY_TOLERANCE_MS } })).toBe(true)
  })

  it('refuses a different pid, a start time outside the tolerance, and a dead process', () => {
    expect(isOwnSpawn({ ...ok, pid: 901 })).toBe(false)
    expect(isOwnSpawn({ ...ok, probe: { exists: true, startedAt: AT + SPAWN_IDENTITY_TOLERANCE_MS + 1 } })).toBe(false)
    expect(isOwnSpawn({ ...ok, probe: { exists: false, startedAt: null } })).toBe(false)
  })

  it('refuses everything unverifiable — an unknown identity is never a licence to kill', () => {
    expect(isOwnSpawn({ ...ok, probe: { exists: true, startedAt: null } })).toBe(false)
    expect(isOwnSpawn({ ...ok, probe: null })).toBe(false)
    expect(isOwnSpawn({ ...ok, lastSpawnAt: 0 })).toBe(false)
    expect(isOwnSpawn({ ...ok, lastSpawnPid: 0 })).toBe(false)
    expect(isOwnSpawn({ ...ok, pid: 0 })).toBe(false)
    expect(isOwnSpawn()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// THE LEASE AND THE FENCE, ON THE REAL FILESYSTEM (point 434). The pure rules are
// swept in batch-lease-core.test.mjs; what only real files can show is that the
// renewal is owner-guarded and rate-limited, that the fence file is written where
// the acquisition happens, and that it SURVIVES the lock being deleted.
describe('renewLease / grantFence (the I/O half)', () => {
  let dir, lockPath, fencePath
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hoa-lease-'))
    lockPath = join(dir, 'batch-lock.json')
    fencePath = statePathsFor(lockPath).fencePath
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const opts = (over = {}) => ({ lockPath, fencePath, pid: process.pid, pidStartedAt: NOW, bootTime: 0, probePidFn: () => aliveProbe, findAncestorFn: () => null, ...over })
  const lockOf = () => JSON.parse(readFileSync(lockPath, 'utf8'))

  it('the fence file lives beside the lock and is derived from it', () => {
    expect(basename(fencePath)).toBe('batch-fence.json')
    expect(statePathsFor(lockPath).fencePath).toBe(fencePath)
  })

  it('an acquisition takes a fence number, and the number is on BOTH the lock and the file', () => {
    expect(acquire('s1', opts())).toBe('acquired')
    expect(lockOf().fence).toBe(1)
    const fence = readFence({ fencePath })
    expect(fence).toMatchObject({ fence: 1, holder: 's1' })
    expect(lockOf().leaseUntil).toBeGreaterThan(Date.now())
  })

  /** The lock of a session that fell silent: heartbeat AND lease both run out.
   *  (A FRESH heartbeat with an expired lease is a contradictory state — the
   *  PostToolUse stamp is younger than the PreToolUse renewal that precedes it —
   *  and `assessOwner` deliberately keeps such an owner: never dispossess a
   *  session that demonstrably just worked.) */
  const goSilent = (over = {}) =>
    writeFileSync(
      lockPath,
      JSON.stringify({ ...lockOf(), claimedAt: Date.now() - LEASE_MS - 60_000, leaseUntil: Date.now() - 60_000, ...over }),
    )

  it('THE FENCE FILE SURVIVES THE LOCK — that is why it is not IN the lock', () => {
    acquire('s1', opts())
    // A takeover deletes the lock file; the fence must not go with it.
    goSilent()
    expect(acquire('s2', opts())).toBe('acquired')
    expect(existsSync(fencePath)).toBe(true)
    const fence = readFence({ fencePath })
    expect(fence.fence).toBe(2)
    expect(fence.holder).toBe('s2')
    expect(fence.holders.map((h) => h.sessionId).sort()).toEqual(['s1', 's2'])
  })

  it('a DELETED fence file is re-seeded from the outgoing lock, never from 1', () => {
    acquire('s1', opts())
    goSilent({ fence: 9 })
    rmSync(fencePath, { force: true })
    expect(acquire('s2', opts())).toBe('acquired')
    expect(readFence({ fencePath }).fence).toBe(10)
  })

  it('renewLease writes only for the owner, and only once per interval', () => {
    acquire('s1', opts())
    const first = lockOf().leaseUntil
    // Fresh lease → nothing to do (the lock is a hot-path file).
    expect(renewLease('s1', { lockPath, fencePath }).reason).toBe('still-fresh')
    expect(lockOf().leaseUntil).toBe(first)
    // Past the interval → renewed, and the lease moves forward.
    const later = Date.now() + LEASE_RENEW_INTERVAL_MS + 60_000
    expect(renewLease('s1', { lockPath, fencePath, now: later }).renewed).toBe(true)
    expect(lockOf().leaseUntil).toBe(later + LEASE_MS)
    // A stranger renews nothing.
    expect(renewLease('s2', { lockPath, fencePath, now: later + 60_000 }).reason).toBe('not-owner')
  })

  it('a renewal under a STALE fence is refused on the real files too', () => {
    acquire('s1', opts())
    // Somebody else took the batch: the mark moved past s1's grant.
    grantFence('s2', { fencePath })
    const later = Date.now() + LEASE_RENEW_INTERVAL_MS + 60_000
    expect(renewLease('s1', { lockPath, fencePath, now: later }).reason).toBe('fence-stale')
  })

  it('renewLease never touches claimedAt — a taken handover survives it', () => {
    acquire('s1', opts())
    const at = Date.now()
    writeFileSync(lockPath, JSON.stringify({ ...lockOf(), claimedAt: at, handedOver: true, handedOverAt: at }))
    renewLease('s1', { lockPath, fencePath, now: at + LEASE_RENEW_INTERVAL_MS + 60_000 })
    expect(lockOf().claimedAt).toBe(at)
    expect(lockOf().handedOver).toBe(true)
  })

  it('extendLease is the ONE way a long wait keeps the batch, and only forwards', () => {
    acquire('s1', opts())
    const target = Date.now() + 3 * 3600_000
    expect(extendLease('s1', target, { lockPath })).toBe(true)
    expect(lockOf().leaseUntil).toBe(target)
    expect(extendLease('s1', target - 60_000, { lockPath })).toBe(false) // never backwards
    expect(extendLease('s2', target + 60_000, { lockPath })).toBe(false) // never a stranger
  })

  it('INDEPENDENCE + fail-open: no fence file, no lock, junk input — nothing throws, nothing blocks', () => {
    expect(readFence({ fencePath })).toEqual({ fence: 0, holder: '', holders: [] })
    expect(renewLease('s1', { lockPath, fencePath }).renewed).toBe(false)
    expect(extendLease('s1', Date.now(), { lockPath })).toBe(false)
    writeFileSync(fencePath, '{ torn')
    expect(readFence({ fencePath })).toEqual({ fence: 0, holder: '', holders: [] })
    expect(acquire('s1', opts())).toBe('acquired') // a torn fence never fails an acquisition
  })
})

// ---------------------------------------------------------------------------
describe('acquire (atomic test-and-set on the real filesystem)', () => {
  let dir, lockPath
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hoa-singleton-'))
    lockPath = join(dir, 'batch-lock.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const opts = (over = {}) => ({
    lockPath,
    pid: process.pid,
    pidStartedAt: NOW,
    bootTime: 0,
    probePidFn: () => aliveProbe,
    // No REAL ancestor walk unless a test is about ancestry: it is a PowerShell
    // round trip, and an un-injected one costs ~0.7 s per temp directory.
    findAncestorFn: () => null,
    ...over,
  })
  /** heldByOtherLiveOwner with the ancestor walk stubbed out (see above). */
  const heldByOther = (sid, over = {}) => heldByOtherLiveOwner(sid, { lockPath, findAncestorFn: () => null, ...over })

  it('free lock → acquired, and the lock names the session + pid', () => {
    expect(acquire('s1', opts())).toBe('acquired')
    const lock = readOwnerLock(lockPath)
    expect(lock.sessionId).toBe('s1')
    expect(lock.pid).toBe(process.pid)
  })

  it('same session again → mine (heartbeat refreshed)', () => {
    acquire('s1', opts())
    expect(acquire('s1', opts())).toBe('mine')
  })

  it('scenario 2: held by a live owner → held (no takeover, ever)', () => {
    acquire('s1', opts())
    expect(acquire('s2', opts())).toBe('held')
    expect(readOwnerLock(lockPath).sessionId).toBe('s1')
  })

  it('scenario 3: dead owner (stale + dead pid) → takeover', () => {
    writeFileSync(lockPath, JSON.stringify({ sessionId: 'dead', claimedAt: Date.now() - 30 * 60_000, pid: 999999 }))
    expect(acquire('s2', opts({ probePidFn: () => deadProbe }))).toBe('acquired')
    expect(readOwnerLock(lockPath).sessionId).toBe('s2')
  })

  it('a corrupt but FRESH lock file is never reaped (mid-write protection)', () => {
    writeFileSync(lockPath, '{ torn')
    expect(acquire('s2', opts())).toBe('held')
  })

  // --- A LIVE LOCK WHOSE LEASE RAN OUT (point 434) ---------------------------
  // This used to need a `takeWedged` flag the caller had to ask for, having first
  // proved wedgedness with a second mechanism. It needs nothing now: an expired
  // lease reads as not-alive at the ordinary door, and the atomicity argument is
  // unchanged — the recheck inside the reap mutex still decides.
  describe('an expired lease is taken through the ordinary door', () => {
    /** A live pid whose lease ran out `agoMs` ago. */
    const expiredOwner = (agoMs) =>
      writeFileSync(
        lockPath,
        JSON.stringify({
          sessionId: 'stalled',
          claimedAt: Date.now() - LEASE_MS - agoMs,
          leaseUntil: Date.now() - agoMs,
          pid: 999999,
        }),
      )

    it('THE LOST NIGHT: a live-but-silent owner loses the batch, and the new lock records why', () => {
      expiredOwner(60_000)
      const res = acquire('launcher', opts({ extra: { takenFromExpiredLease: { sessionId: 'stalled' } } }))
      expect(res).toBe('acquired')
      const lock = readOwnerLock(lockPath)
      expect(lock.sessionId).toBe('launcher')
      expect(lock.takenFromExpiredLease).toEqual({ sessionId: 'stalled' })
    })

    it('a lease still running keeps the owner — no flag, no exception, no widening', () => {
      writeFileSync(
        lockPath,
        JSON.stringify({
          sessionId: 'working',
          claimedAt: Date.now() - 40 * 60_000,
          leaseUntil: Date.now() + 15 * 60_000,
          pid: 999999,
        }),
      )
      expect(acquire('launcher', opts())).toBe('held')
      expect(readOwnerLock(lockPath).sessionId).toBe('working')
    })

    it('TWO STARTERS CANNOT BOTH ACT — the second loses cleanly', () => {
      expiredOwner(60_000)
      expect(acquire('launcher-a', opts())).toBe('acquired')
      expect(acquire('launcher-b', opts())).toBe('held')
      expect(readOwnerLock(lockPath).sessionId).toBe('launcher-a')
    })

    it('an owner that RENEWED in the race window keeps its lock', () => {
      expiredOwner(60_000)
      // The recheck INSIDE the reap mutex is what must see the renewal, so the probe
      // stays alive and only the lock file moves on.
      let calls = 0
      const probePidFn = () => {
        calls += 1
        if (calls === 1) {
          writeFileSync(
            lockPath,
            JSON.stringify({
              sessionId: 'stalled',
              claimedAt: Date.now() - 1000,
              leaseUntil: Date.now() + LEASE_MS,
              pid: 999999,
            }),
          )
        }
        return aliveProbe
      }
      expect(acquire('launcher', opts({ probePidFn }))).toBe('held')
      expect(readOwnerLock(lockPath).sessionId).toBe('stalled')
    })
  })

  it('missing session id → held (never acquire namelessly)', () => {
    expect(acquire('', opts())).toBe('held')
  })

  it('release only by the owner', () => {
    acquire('s1', opts())
    expect(release('s2', lockPath)).toBe(false)
    expect(readOwnerLock(lockPath)).not.toBeNull()
    expect(release('s1', lockPath)).toBe(true)
    expect(readOwnerLock(lockPath)).toBeNull()
  })

  it('heartbeat refreshes only the owner and never claims', () => {
    acquire('s1', opts())
    const before = readOwnerLock(lockPath).claimedAt
    expect(heartbeat('s2', { lockPath, now: before + 5000, skipBackfill: true })).toBe(false)
    expect(readOwnerLock(lockPath).claimedAt).toBe(before)
    expect(heartbeat('s1', { lockPath, now: before + 5000, skipBackfill: true })).toBe(true)
    expect(readOwnerLock(lockPath).claimedAt).toBe(before + 5000)
  })

  it('convertPendingSpawn binds only a pending lock to the matching spawned pid (or a one-shot authorization)', () => {
    // A live SESSION lock is never converted.
    acquire('s1', opts())
    expect(convertPendingSpawn('spawned', { lockPath, pid: 555, authorized: true })).toBe(false)
    rmSync(lockPath)
    // A pending-spawn lock converts for the matching claude pid.
    acquire('launcher-1', opts({ kind: 'pending-spawn', extra: { spawnedPid: 555 } }))
    expect(convertPendingSpawn('spawned', { lockPath, pid: 556 })).toBe(false) // wrong pid, no auth
    expect(convertPendingSpawn('spawned', { lockPath, pid: 555 })).toBe(true)
    const lock = readOwnerLock(lockPath)
    expect(lock.sessionId).toBe('spawned')
    expect(lock.kind).toBe('session')
  })

  it('markHandover: only the owner may hand over, and it does not touch the heartbeat', () => {
    acquire('s1', opts())
    const before = readOwnerLock(lockPath).claimedAt
    expect(markHandover('s2', { lockPath })).toMatchObject({ handed: false, reason: 'not-owner' })
    expect(readOwnerLock(lockPath).handedOver).toBeUndefined()
    expect(markHandover('s1', { lockPath, point: 388, now: before + 1000 })).toMatchObject({
      handed: true,
      reason: 'ok',
    })
    const lock = readOwnerLock(lockPath)
    expect(lock.handedOver).toBe(true)
    expect(lock.handedOverAt).toBe(before + 1000)
    expect(lock.handoverPoint).toBe(388)
    expect(lock.claimedAt).toBe(before) // the heartbeat is NOT bumped
    expect(lock.sessionId).toBe('s1') // and it is not a release
  })

  // --- FINDING 1 (28.07.2026): the lock write that kept failing ---------------
  // `EPERM: operation not permitted, rename batch-lock.json.tmp-9904 ->
  // batch-lock.json` — three times at a boundary stop. It threw out of
  // markHandover into the guard's fail-open catch, the marker had already been
  // consumed and the batch was never passed on. markHandover must REPORT.
  const eperm = () => {
    throw Object.assign(new Error('EPERM: operation not permitted, rename'), { code: 'EPERM' })
  }
  const noWait = { delays: [1, 1], sleep: () => {}, write: () => {}, remove: () => {} }

  it('a persistent EPERM on the rename is REPORTED, never thrown', () => {
    acquire('s1', opts())
    const res = markHandover('s1', { lockPath, point: 388, ...noWait, rename: eperm })
    expect(res.handed).toBe(false)
    expect(res.reason).toBe('write-failed')
    expect(String(res.error?.code)).toBe('EPERM')
    expect(readOwnerLock(lockPath).handedOver).toBeUndefined() // and the lock is untouched
  })

  it('markHandover is the ONE place the propagating write is turned into data', () => {
    // Everywhere else the error must escape (point 340): a heartbeat that did not
    // land may never read as one that did. Here the caller has to allow the stop
    // AND tell the session the truth about it, so the throw is caught once.
    acquire('s1', opts())
    expect(() => heartbeat('s1', { lockPath, skipBackfill: true, ...noWait, rename: eperm })).toThrow(/EPERM/)
    expect(markHandover('s1', { lockPath, point: 388, ...noWait, rename: eperm }).handed).toBe(false)
  })

  it('a heartbeat WITHDRAWS the handover — working is proof the session is not finished', () => {
    acquire('s1', opts())
    markHandover('s1', { lockPath, point: 388 })
    heartbeat('s1', { lockPath, now: Date.now() + 5000, skipBackfill: true })
    const lock = readOwnerLock(lockPath)
    expect(lock.handedOver).toBeUndefined()
    expect(lock.handedOverAt).toBeUndefined()
    expect(lock.handoverPoint).toBeUndefined()
  })

  it('withdrawHandover: the owner takes it back before a long tool call; a stranger cannot', () => {
    const at = Date.now()
    // `settled` is one settle window past the handover (point 396): a withdrawal must
    // be caused by work AFTER it, and these calls are the "real work" case.
    const settled = { lockPath, now: at + HANDOVER_SETTLE_MS + 1 }
    acquire('s1', opts())
    markHandover('s1', { lockPath, point: 388, now: at })
    expect(withdrawHandover('s2', settled)).toBe(false)
    expect(readOwnerLock(lockPath).handedOver).toBe(true)
    expect(withdrawHandover('s1', settled)).toBe(true)
    expect(readOwnerLock(lockPath).handedOver).toBeUndefined()
    expect(withdrawHandover('s1', settled)).toBe(false) // nothing left to withdraw
  })

  // --- FINDING 2: what a taken boundary survives ------------------------------
  it('closing work CARRIES the handover forward instead of withdrawing it', () => {
    acquire('s1', opts())
    const at = Date.now()
    markHandover('s1', { lockPath, point: 388, now: at })
    // The PostToolUse heartbeat after a dashboard republish: the session is
    // finishing, not carrying on. `claimedAt <= handedOverAt` must still hold.
    expect(heartbeat('s1', { lockPath, now: at + 5000, skipBackfill: true, preserveHandover: true })).toBe(true)
    const lock = readOwnerLock(lockPath)
    expect(lock.handedOver).toBe(true)
    expect(lock.handedOverAt).toBe(at + 5000)
    expect(lock.claimedAt).toBeLessThanOrEqual(lock.handedOverAt)
    expect(assessOwner(lock, { now: at + 6000, bootTime: BOOT, probe: deadProbe }).reason).toBe('handed-over')
  })

  it('…and ordinary work still withdraws it — the safety invariant is untouched', () => {
    acquire('s1', opts())
    markHandover('s1', { lockPath, point: 388 })
    heartbeat('s1', { lockPath, now: Date.now() + 5000, skipBackfill: true, preserveHandover: false })
    expect(readOwnerLock(lockPath).handedOver).toBeUndefined()
  })

  it('touchHandover keeps the grace rolling through a long closing call, but throttles the write', () => {
    acquire('s1', opts())
    const at = Date.now()
    markHandover('s1', { lockPath, point: 388, now: at })
    expect(touchHandover('s1', { lockPath, now: at + 1000 })).toBe(false) // too soon to bother
    expect(touchHandover('s1', { lockPath, now: at + 90_000 })).toBe(true)
    expect(readOwnerLock(lockPath).handedOverAt).toBe(at + 90_000)
    expect(touchHandover('s2', { lockPath, now: at + 200_000 })).toBe(false) // not the owner
  })

  it('touchHandover invents nothing: with no handover there is nothing to carry', () => {
    acquire('s1', opts())
    expect(touchHandover('s1', { lockPath })).toBe(false)
    expect(readOwnerLock(lockPath).handedOver).toBeUndefined()
  })

  it('the withdrawal takes the MARKER with it — that is what ends a boundary now', () => {
    const markerPath = join(dir, 'batch-boundary.json')
    const at = Date.now()
    const settled = { lockPath, now: at + HANDOVER_SETTLE_MS + 1 }
    acquire('s1', opts())
    markHandover('s1', { lockPath, point: 388, now: at })
    writeFileSync(markerPath, JSON.stringify({ v: 1, sessionId: 's1', point: 388, at }))
    expect(withdrawHandover('s1', settled)).toBe(true)
    expect(existsSync(markerPath)).toBe(false)
    // A marker recorded and then followed by real work goes too, handover or not.
    writeFileSync(markerPath, JSON.stringify({ v: 1, sessionId: 's1', point: 388, at }))
    expect(withdrawHandover('s1', settled)).toBe(false) // no flag left to withdraw
    expect(existsSync(markerPath)).toBe(false) // …and the marker is gone all the same
  })

  it('clearOwnBoundary retires only THIS session\'s marker at SessionEnd', () => {
    const markerPath = join(dir, 'batch-boundary.json')
    writeFileSync(markerPath, JSON.stringify({ v: 1, sessionId: 's1', point: 388, at: Date.now() }))
    expect(clearOwnBoundary('s2', { boundaryPath: markerPath })).toBe(false)
    expect(existsSync(markerPath)).toBe(true)
    expect(clearOwnBoundary('s1', { boundaryPath: markerPath })).toBe(true)
    expect(existsSync(markerPath)).toBe(false)
    expect(clearOwnBoundary('s1', { boundaryPath: markerPath })).toBe(false) // nothing there
  })

  it('a STRANGER can neither withdraw the handover nor delete the marker', () => {
    const markerPath = join(dir, 'batch-boundary.json')
    acquire('s1', opts())
    markHandover('s1', { lockPath, point: 388 })
    writeFileSync(markerPath, JSON.stringify({ v: 1, sessionId: 's1', point: 388, at: Date.now() }))
    expect(withdrawHandover('s2', { lockPath })).toBe(false)
    expect(existsSync(markerPath)).toBe(true)
    expect(readOwnerLock(lockPath).handedOver).toBe(true)
  })

  it('FINDING 3: the withdrawal is logged BESIDE the redirected lock, never in the repo', () => {
    const at = Date.now()
    acquire('s1', opts())
    markHandover('s1', { lockPath, point: 388, now: at })
    expect(withdrawHandover('s1', { lockPath, now: at + HANDOVER_SETTLE_MS + 1 })).toBe(true)
    const log = join(dir, 'boundary.log')
    expect(existsSync(log)).toBe(true)
    expect(readFileSync(log, 'utf8')).toMatch(/WITHDRAWN point 388 by s1/)
    // The line the live batch found in ITS log: it must be impossible for this
    // suite to produce it there.
    expect(resolve(log)).not.toBe(resolve(BOUNDARY_LOG_PATH))
  })

  // --- SAY IT (point 426 (b)) -------------------------------------------------
  // The MARKER removal was silent. A pager on a closing line deleted it, the next
  // Stop hook demanded the boundary again, and no record named the cause.
  it('THE MARKER WITHDRAWAL IS LOGGED, and the line carries the triggering call', () => {
    const markerPath = join(dir, 'batch-boundary.json')
    const log = join(dir, 'boundary.log')
    const at = Date.now()
    acquire('s1', opts())
    writeFileSync(markerPath, JSON.stringify({ v: 1, sessionId: 's1', point: 426, at }))
    // No handover flag at all — exactly the silent case: the marker goes, and that
    // is the whole event.
    expect(
      withdrawHandover('s1', { lockPath, now: at + HANDOVER_SETTLE_MS + 1, trigger: 'Bash: npm test | tail -2' }),
    ).toBe(false)
    expect(existsSync(markerPath)).toBe(false)
    const text = readFileSync(log, 'utf8')
    expect(text).toMatch(/MARKER WITHDRAWN for point 426 by s1/)
    expect(text).toContain('triggered by Bash: npm test | tail -2')
    expect(resolve(log)).not.toBe(resolve(BOUNDARY_LOG_PATH))
  })

  it('an unrecorded trigger still produces a line — a silent removal is the bug', () => {
    const markerPath = join(dir, 'batch-boundary.json')
    const at = Date.now()
    acquire('s1', opts())
    writeFileSync(markerPath, JSON.stringify({ v: 1, sessionId: 's1', at }))
    withdrawHandover('s1', { lockPath, now: at + HANDOVER_SETTLE_MS + 1 })
    const text = readFileSync(join(dir, 'boundary.log'), 'utf8')
    expect(text).toMatch(/MARKER WITHDRAWN for point \? by s1/)
    expect(text).toContain('an unrecorded call')
  })

  it('NO marker means NO line — the log records events, not every tool call', () => {
    acquire('s1', opts())
    withdrawHandover('s1', { lockPath, trigger: 'Bash: npm test' })
    expect(existsSync(join(dir, 'boundary.log'))).toBe(false)
  })

  it('a STRANGER writes no withdrawal line either', () => {
    const markerPath = join(dir, 'batch-boundary.json')
    acquire('s1', opts())
    writeFileSync(markerPath, JSON.stringify({ v: 1, sessionId: 's1', point: 426, at: Date.now() }))
    expect(withdrawHandover('s2', { lockPath, trigger: 'Bash: npm test' })).toBe(false)
    expect(existsSync(markerPath)).toBe(true)
    expect(existsSync(join(dir, 'boundary.log'))).toBe(false)
  })

  // --- A HANDOVER IS NOT UN-TAKEN BY THE CALL THAT CAME BEFORE IT (point 396) --
  // Two of ten boundary attempts on the morning of 28.07.2026 were cancelled 117 ms
  // and 154 ms after being written. No session works again in 117 ms; the Stop chain
  // had written the handover while the LAST tool call's PostToolUse heartbeat was
  // still in flight.
  describe('the settle window and the call timestamp', () => {
    const markerPath = () => join(dir, 'batch-boundary.json')
    const takeBoundary = (at) => {
      acquire('s1', opts())
      markHandover('s1', { lockPath, point: 396, now: at })
      writeFileSync(markerPath(), JSON.stringify({ v: 1, sessionId: 's1', point: 396, at }))
    }

    it('THE INCIDENT: a heartbeat 117 ms after the handover leaves flag AND marker alone', () => {
      const at = NOW
      takeBoundary(at)
      expect(heartbeat('s1', { lockPath, now: at + 117, skipBackfill: true })).toBe(true)
      const lock = readOwnerLock(lockPath)
      expect(lock.handedOver).toBe(true)
      expect(lock.handoverPoint).toBe(396)
      expect(lock.claimedAt).toBe(at + 117) // the heartbeat itself still lands
      expect(withdrawHandover('s1', { lockPath, now: at + 154 })).toBe(false)
      expect(existsSync(markerPath())).toBe(true)
    })

    it('A CALL DATED BEFORE THE HANDOVER never withdraws, however late it arrives', () => {
      const at = NOW
      takeBoundary(at)
      // The hook belongs to the turn's last tool call — its own timestamp predates
      // the handover even though it is processed a minute later.
      expect(heartbeat('s1', { lockPath, now: at + 60_000, callAt: at - 5000, skipBackfill: true })).toBe(true)
      expect(readOwnerLock(lockPath).handedOver).toBe(true)
      expect(withdrawHandover('s1', { lockPath, now: at + 60_000, callAt: at - 5000 })).toBe(false)
      expect(existsSync(markerPath())).toBe(true)
    })

    it('…AND WORK AFTER IT STILL WITHDRAWS, marker included — this is not "ignore withdrawals"', () => {
      const at = NOW
      takeBoundary(at)
      expect(heartbeat('s1', { lockPath, now: at + HANDOVER_SETTLE_MS + 1, skipBackfill: true })).toBe(true)
      const lock = readOwnerLock(lockPath)
      expect(lock.handedOver).toBeUndefined()
      expect(lock.handoverPoint).toBeUndefined()
      // …and the explicit withdrawal takes the marker with it.
      takeBoundary(at)
      expect(withdrawHandover('s1', { lockPath, now: at + HANDOVER_SETTLE_MS + 1 })).toBe(true)
      expect(existsSync(markerPath())).toBe(false)
    })

    it('a call timestamp AFTER the handover withdraws inside the settle window too', () => {
      const at = NOW
      takeBoundary(at)
      // Evidence beats the heuristic: the call provably happened after the handover.
      expect(withdrawHandover('s1', { lockPath, now: at + 200, callAt: at + 100 })).toBe(true)
      expect(existsSync(markerPath())).toBe(false)
    })

    it('the point-388 closing-set rule is unchanged by either', () => {
      const at = NOW
      takeBoundary(at)
      // Closing work carries the handover FORWARD, well past the settle window.
      expect(heartbeat('s1', { lockPath, now: at + 60_000, preserveHandover: true, skipBackfill: true })).toBe(true)
      const lock = readOwnerLock(lockPath)
      expect(lock.handedOver).toBe(true)
      expect(lock.handedOverAt).toBe(at + 60_000)
      expect(lock.handoverPoint).toBe(396)
    })

    it('a late hook does NOT touch handedOverAt forward — a stream of them cannot keep it alive', () => {
      const at = NOW
      takeBoundary(at)
      for (let i = 1; i <= 3; i += 1) heartbeat('s1', { lockPath, now: at + i, skipBackfill: true })
      expect(readOwnerLock(lockPath).handedOverAt).toBe(at)
      // …so real work one settle window after the HANDOVER still withdraws.
      expect(heartbeat('s1', { lockPath, now: at + HANDOVER_SETTLE_MS, skipBackfill: true })).toBe(true)
      expect(readOwnerLock(lockPath).handedOver).toBeUndefined()
    })

    it('a NON-OWNER still cannot withdraw anything, settled or not', () => {
      const at = NOW
      takeBoundary(at)
      expect(withdrawHandover('s2', { lockPath, now: at + 60_000 })).toBe(false)
      expect(readOwnerLock(lockPath).handedOver).toBe(true)
      expect(existsSync(markerPath())).toBe(true)
    })

    it('withdrawalIsCausal is pure and errs toward withdrawing when it knows nothing', () => {
      expect(withdrawalIsCausal({ handedOverAt: NOW, now: NOW + 117 })).toBe(false)
      expect(withdrawalIsCausal({ handedOverAt: NOW, now: NOW + HANDOVER_SETTLE_MS })).toBe(true)
      expect(withdrawalIsCausal({ handedOverAt: NOW, callAt: NOW - 1 })).toBe(false)
      expect(withdrawalIsCausal({ handedOverAt: NOW, callAt: NOW + 1 })).toBe(true)
      // No handover recorded at all → nothing to protect.
      expect(withdrawalIsCausal({ handedOverAt: null, now: NOW })).toBe(true)
      expect(withdrawalIsCausal({ handedOverAt: 'soon', now: NOW })).toBe(true)
      expect(withdrawalIsCausal({})).toBe(true)
      expect(withdrawalIsCausal()).toBe(true)
      // A junk call timestamp falls back to the window rather than deciding on it.
      expect(withdrawalIsCausal({ handedOverAt: NOW, callAt: 0, now: NOW + 117 })).toBe(false)
      expect(withdrawalIsCausal({ handedOverAt: NOW, callAt: 'now', now: NOW + 117 })).toBe(false)
      expect(HANDOVER_SETTLE_MS).toBeGreaterThan(154) // both cancelled attempts fall inside it
    })

    it('the MARKER alone is protected too — its own timestamp counts', () => {
      // A marker recorded without a lock flag (the shape the pager bug produced) is
      // guarded by its own `at`, so a late hook cannot delete it either.
      acquire('s1', opts())
      writeFileSync(markerPath(), JSON.stringify({ v: 1, sessionId: 's1', point: 396, at: NOW }))
      expect(withdrawHandover('s1', { lockPath, now: NOW + 117 })).toBe(false)
      expect(existsSync(markerPath())).toBe(true)
      expect(withdrawHandover('s1', { lockPath, now: NOW + HANDOVER_SETTLE_MS })).toBe(false) // no flag to withdraw
      expect(existsSync(markerPath())).toBe(false) // …but the marker did go
    })
  })

  it('after the successor claims, the old session can neither heartbeat nor withdraw', () => {
    acquire('s1', opts())
    markHandover('s1', { lockPath, point: 388 })
    // The launcher reaps the handed-over lock and the successor owns it.
    rmSync(lockPath)
    acquire('successor', opts())
    expect(withdrawHandover('s1', { lockPath })).toBe(false)
    expect(heartbeat('s1', { lockPath, skipBackfill: true })).toBe(false)
    expect(readOwnerLock(lockPath).sessionId).toBe('successor')
    expect(acquire('s1', opts({ probePidFn: () => aliveProbe }))).toBe('held') // → stand-down
  })

  it('a compacted session keeps its lock and RESTAMPS it, so the next check is cheap', () => {
    acquire('before-compaction', opts())
    const before = readOwnerLock(lockPath)
    const sameProcess = () => ({ pid: before.pid, startedAt: before.pidStartedAt })
    // Every ownership-gated guard would stand down on the new id alone.
    expect(heldByOther('after-compaction', { processIdentity: false })).toBe(true)
    // With the process as identity it is ours, and the lock says so afterwards.
    expect(
      heldByOther('after-compaction', {
        findAncestorFn: sameProcess,
        ancestorCachePath: join(dir, 'session-process.json'),
      }),
    ).toBe(false)
    const lock = readOwnerLock(lockPath)
    expect(lock.sessionId).toBe('after-compaction')
    expect(lock.sessionIdBefore).toBe('before-compaction')
    expect(lock.claimedAt).toBe(before.claimedAt) // the restamp is not work
    expect(acquire('after-compaction', opts())).toBe('mine') // …and the id path suffices now
  })

  it('a SECOND WINDOW is still a second window — its own claude process gives it away', () => {
    acquire('s1', opts())
    const otherProcess = () => ({ pid: process.pid + 1, startedAt: NOW })
    expect(
      heldByOther('intruder', {
        findAncestorFn: otherProcess,
        probePidFn: () => aliveProbe,
        ancestorCachePath: join(dir, 'session-process.json'),
      }),
    ).toBe(true)
    expect(readOwnerLock(lockPath).sessionId).toBe('s1') // untouched
    expect(acquire('intruder', opts({ findAncestorFn: otherProcess }))).toBe('held')
  })

  it('a CLAIMED pid buys no ownership — only an established ancestry does', () => {
    // opts.pid is the identity a caller wants RECORDED. Reading it as proof of
    // ancestry would let any second session name itself the owner: both sessions
    // here pass the same pid, and the second must still be held off.
    acquire('s1', opts())
    expect(acquire('s2', opts())).toBe('held')
    expect(readOwnerLock(lockPath).sessionId).toBe('s1')
  })

  it('ourClaudeProcess memoises the walk, and re-validates a cached pid', () => {
    const ancestorCachePath = join(dir, 'session-process.json')
    let walks = 0
    const walk = () => {
      walks++
      return { pid: process.pid, startedAt: NOW }
    }
    expect(ourClaudeProcess('sid', { ancestorCachePath, findAncestorFn: walk })).toMatchObject({ pid: process.pid })
    expect(ourClaudeProcess('sid', { ancestorCachePath, findAncestorFn: walk })).toMatchObject({ pid: process.pid })
    expect(walks).toBe(1)
    // A cached pid that is no longer alive is not trusted — walk again.
    ourClaudeProcess('sid', { ancestorCachePath, findAncestorFn: walk, probePidFn: () => deadProbe })
    expect(walks).toBe(2)
    // A failed walk is remembered too, so it is not retried on every call…
    let failed = 0
    const fail = () => {
      failed++
      return null
    }
    expect(ourClaudeProcess('sid2', { ancestorCachePath, findAncestorFn: fail })).toBe(null)
    expect(ourClaudeProcess('sid2', { ancestorCachePath, findAncestorFn: fail })).toBe(null)
    expect(failed).toBe(1)
    // …but not forever.
    expect(ourClaudeProcess('sid2', { ancestorCachePath, findAncestorFn: fail, retryMs: 0 })).toBe(null)
    expect(failed).toBe(2)
  })

  it('a PROBE gets the same answer and leaves no record behind (point 434 (8))', () => {
    const ancestorCachePath = join(dir, 'session-process-probe.json')
    const walk = () => ({ pid: process.pid, startedAt: NOW })
    expect(ourClaudeProcess('preflight-test', { ancestorCachePath, findAncestorFn: walk })).toMatchObject({
      pid: process.pid,
    })
    // Nothing written: a synthetic id must not accrete in real state as a session.
    expect(existsSync(ancestorCachePath)).toBe(false)
    // A real id is still memoised, so the walk is still paid for only once.
    expect(ourClaudeProcess('sid3', { ancestorCachePath, findAncestorFn: walk })).toMatchObject({ pid: process.pid })
    expect(existsSync(ancestorCachePath)).toBe(true)
    expect(Object.keys(JSON.parse(readFileSync(ancestorCachePath, 'utf8')))).toEqual(['sid3'])
  })

  it('heldByOtherLiveOwner: true for a foreign live lock, false for mine/free/dead', () => {
    expect(heldByOther('sX')).toBe(false) // free
    acquire('s1', opts())
    expect(heldByOther('s1', { probePidFn: () => aliveProbe })).toBe(false) // mine
    expect(heldByOther('s2', { probePidFn: () => aliveProbe })).toBe(true) // foreign + live
    writeFileSync(
      lockPath,
      JSON.stringify({ sessionId: 'dead', claimedAt: Date.now() - 30 * 60_000, pid: 999999 }),
    )
    expect(heldByOther('s2', { probePidFn: () => deadProbe })).toBe(false) // foreign but dead
  })
})

// ---------------------------------------------------------------------------
// POINT 340: the lock heartbeat must not lose its write to a transient rename
// failure. EVIDENCE: fourteen orphaned `.claude/batch-lock.json.tmp-<pid>` files
// accreted between 19:36 and 20:52 on 25.07.2026, one per failed write, while
// `claimedAt` stayed at its OLD value and reported nothing — and liveness is
// decided on exactly that timestamp.
describe('the lock write: retried, atomic, propagating, and swept up after (point 340)', () => {
  let dir, lockPath
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hoa-lockwrite-'))
    lockPath = join(dir, 'batch-lock.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const tmpLeftovers = () => readdirSync(dir).filter((f) => f.includes('.tmp-'))
  const flakyRename = (failures) => {
    let calls = 0
    return {
      calls: () => calls,
      rename: (from, to) => {
        calls++
        if (calls <= failures) throw Object.assign(new Error('EPERM: sharing violation'), { code: 'EPERM' })
        renameSync(from, to)
      },
    }
  }

  it('a rename that fails twice and then succeeds still writes the lock, and leaves NO tmp behind', () => {
    acquire('s1', { lockPath, pid: 1, pidStartedAt: NOW, bootTime: 0, probePidFn: () => aliveProbe })
    const flaky = flakyRename(2)
    const at = Date.now() + 5000
    expect(heartbeat('s1', { lockPath, now: at, skipBackfill: true, sleep: () => {}, rename: flaky.rename })).toBe(true)
    expect(readOwnerLock(lockPath).claimedAt).toBe(at)
    expect(flaky.calls()).toBe(3)
    expect(tmpLeftovers()).toEqual([])
  })

  it('a rename that fails EVERY attempt throws and STILL leaves no tmp behind', () => {
    acquire('s1', { lockPath, pid: 1, pidStartedAt: NOW, bootTime: 0, probePidFn: () => aliveProbe })
    const before = readOwnerLock(lockPath).claimedAt
    const flaky = flakyRename(99)
    expect(() =>
      heartbeat('s1', { lockPath, now: before + 5000, skipBackfill: true, sleep: () => {}, rename: flaky.rename }),
    ).toThrow(/EPERM/)
    expect(readOwnerLock(lockPath).claimedAt).toBe(before) // the old value, honestly unchanged
    expect(tmpLeftovers()).toEqual([])
  })

  it('the retry is BOUNDED — no unbounded loop against a permanently held file', () => {
    acquire('s1', { lockPath, pid: 1, pidStartedAt: NOW, bootTime: 0, probePidFn: () => aliveProbe })
    const flaky = flakyRename(99)
    expect(() => heartbeat('s1', { lockPath, skipBackfill: true, sleep: () => {}, rename: flaky.rename })).toThrow()
    expect(flaky.calls()).toBe(WRITE_RETRY_DELAYS_MS.length + 1)
  })

  it('the write stays ATOMIC: a reader never sees a half-written lock', () => {
    // The content only ever appears via a rename of a fully written temp file —
    // no in-place truncate, which is what would let a concurrent reader catch it.
    acquire('s1', { lockPath, pid: 1, pidStartedAt: NOW, bootTime: 0, probePidFn: () => aliveProbe })
    const seen = []
    heartbeat('s1', {
      lockPath,
      skipBackfill: true,
      sleep: () => {},
      rename: (from, to) => {
        seen.push(JSON.parse(readFileSync(from, 'utf8')).sessionId) // complete before the swap
        renameSync(from, to)
      },
    })
    expect(seen).toEqual(['s1'])
  })

  // --- (b) the sweep ---------------------------------------------------------
  describe('sweepableTmpFiles — only a dead pid AND a settled file', () => {
    const NOW_T = 1_785_100_000_000
    const dead = (pid) => ({ exists: pid !== 7777 })
    const call = (entries) =>
      sweepableTmpFiles({ entries, lockName: 'batch-lock.json', now: NOW_T, probe: dead, staleMs: 60_000 })

    it('takes an orphan whose pid is dead and which has settled', () => {
      expect(call([{ name: 'batch-lock.json.tmp-7777', mtimeMs: NOW_T - 600_000 }])).toEqual([
        'batch-lock.json.tmp-7777',
      ])
    })

    it('spares one whose pid is ALIVE — a process mid-write keeps its tmp', () => {
      expect(call([{ name: 'batch-lock.json.tmp-4242', mtimeMs: NOW_T - 600_000 }])).toEqual([])
    })

    it('spares a JUST-WRITTEN tmp even from a dead pid — it may still be in flight', () => {
      expect(call([{ name: 'batch-lock.json.tmp-7777', mtimeMs: NOW_T - 1000 }])).toEqual([])
    })

    it('recognises both name shapes and touches nothing else in the directory', () => {
      const entries = [
        { name: 'batch-lock.json.tmp-7777', mtimeMs: NOW_T - 600_000 },
        { name: 'batch-lock.json.tmp-7777-3', mtimeMs: NOW_T - 600_000 }, // per-attempt name
        { name: 'batch-lock.json', mtimeMs: NOW_T - 600_000 },
        { name: 'boundary.log', mtimeMs: NOW_T - 600_000 },
        { name: 'other-lock.json.tmp-7777', mtimeMs: NOW_T - 600_000 },
        { name: 'batch-lock.json.tmp-notapid', mtimeMs: NOW_T - 600_000 },
      ]
      expect(call(entries)).toEqual(['batch-lock.json.tmp-7777', 'batch-lock.json.tmp-7777-3'])
    })
  })

  it('acquire sweeps exactly the dead orphan out of a seeded directory', () => {
    const old = Date.now() - 10 * 60_000
    writeFileSync(join(dir, 'batch-lock.json.tmp-7777'), '{}') // dead writer
    writeFileSync(join(dir, 'batch-lock.json.tmp-4242'), '{}') // live writer
    utimesSync(join(dir, 'batch-lock.json.tmp-7777'), old / 1000, old / 1000)
    utimesSync(join(dir, 'batch-lock.json.tmp-4242'), old / 1000, old / 1000)
    acquire('s1', {
      lockPath,
      pid: 1,
      pidStartedAt: NOW,
      bootTime: 0,
      probePidFn: (pid) => ({ exists: pid !== 7777, startedAt: null }),
    })
    // `batch-fence.json` is written by the acquisition itself (point 434) and is
    // NEVER swept: it is the one record that outlives the lock.
    expect(readdirSync(dir).sort()).toEqual(['batch-fence.json', 'batch-lock.json', 'batch-lock.json.tmp-4242'])
  })
})

// ---------------------------------------------------------------------------
describe('scenario 1: two racing starters → exactly one wins (real processes)', () => {
  // Vitest serves modules through its own URL scheme, so import.meta.url is not
  // a file: URL here — resolve the worker from the repo root instead.
  const worker = join(process.cwd(), 'scripts', 'batch-singleton-race-worker.mjs')

  const race = (lockPath, sids, deadPid) =>
    Promise.all(
      sids.map(
        (sid) =>
          new Promise((res, rej) => {
            execFile(
              process.execPath,
              [worker, lockPath, sid, ...(deadPid ? [String(deadPid)] : [])],
              { windowsHide: true, timeout: 30000 },
              (err, stdout) => (err ? rej(err) : res(stdout.trim())),
            )
          }),
      ),
    )

  it('six concurrent starters on a FREE lock → exactly one "acquired"', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-race-'))
    const lockPath = join(dir, 'batch-lock.json')
    try {
      const results = await race(lockPath, ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'])
      expect(results.filter((r) => r === 'acquired')).toHaveLength(1)
      expect(readOwnerLock(lockPath)).not.toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60000)

  it('six concurrent starters on a DEAD owner → exactly one takeover, the rest stand down', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-race-dead-'))
    const lockPath = join(dir, 'batch-lock.json')
    const deadPid = 987654
    writeFileSync(
      lockPath,
      JSON.stringify({ sessionId: 'dead-owner', claimedAt: Date.now() - 60 * 60_000, pid: deadPid }),
    )
    try {
      const results = await race(lockPath, ['t1', 't2', 't3', 't4', 't5', 't6'], deadPid)
      expect(results.filter((r) => r === 'acquired')).toHaveLength(1)
      const lock = readOwnerLock(lockPath)
      expect(lock).not.toBeNull()
      expect(lock.sessionId).not.toBe('dead-owner')
      expect(existsSync(`${lockPath}.reaping`)).toBe(false) // mutex released
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60000)
})

// ---------------------------------------------------------------------------
describe('classifyParallel (active detector, subagent-safe)', () => {
  it('a genuine second top-level session with fresh activity is detected', () => {
    const parallel = classifyParallel({
      sessionsSeen: { owner: NOW - 3600_000, intruder: NOW - 600_000 },
      activity: { owner: NOW - 1000, intruder: NOW - 30_000 },
      ownerSid: 'owner',
      now: NOW,
    })
    expect(parallel.map((p) => p.sid)).toEqual(['intruder'])
  })

  it("the owner's own subagents/worktree agents are NOT flagged (no SessionStart record)", () => {
    const parallel = classifyParallel({
      sessionsSeen: { owner: NOW - 3600_000 }, // subagent sids never appear here
      activity: { owner: NOW - 1000, 'subagent-1': NOW - 5_000, 'subagent-2': NOW - 2_000 },
      ownerSid: 'owner',
      now: NOW,
    })
    expect(parallel).toEqual([])
  })

  it('stale activity is not a live parallel session', () => {
    const parallel = classifyParallel({
      sessionsSeen: { owner: NOW - 3600_000, old: NOW - 3600_000 },
      activity: { owner: NOW - 1000, old: NOW - PARALLEL_FRESH_MS - 60_000 },
      ownerSid: 'owner',
      now: NOW,
    })
    expect(parallel).toEqual([])
  })

  it('the owner alone → nothing detected', () => {
    const parallel = classifyParallel({
      sessionsSeen: { owner: NOW - 3600_000 },
      activity: { owner: NOW - 1000 },
      ownerSid: 'owner',
      now: NOW,
    })
    expect(parallel).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// A PROBE OF OUR OWN MAY NOT TRIP THE ALARM (point 434 (8))
// ---------------------------------------------------------------------------
// The launcher logged `PARALLEL SESSIONS DETECTED: owner=preflight-test plus
// <real session>` sixteen times across four nights. Cause: the guard preflight's
// real-repo test runs every guard's gather() under the synthetic id
// `preflight-test`, and the batch-progress-guard's gather ACQUIRES the lock with
// the id it is handed — so a Vitest run became the owner of the batch, and every
// real session then read as a second driver. That alert means "stop everything".
describe('a preflight identity is not a session', () => {
  const REAL = '10a2d2e0-b1c8-4dbd-aec6-56eb221a8eee'
  const OTHER = '830a6878-915f-4838-92fc-4af7859c4758'

  it('the four nights: a preflight in flight yields NO parallel-session verdict', () => {
    expect(
      classifyParallel({
        sessionsSeen: { [REAL]: NOW - 3600_000 },
        activity: { [REAL]: NOW - 30_000 },
        ownerSid: 'preflight-test',
        now: NOW,
      }),
    ).toEqual([])
  })

  it('…while TWO REAL sessions still do — the detector keeps its teeth', () => {
    expect(
      classifyParallel({
        sessionsSeen: { [REAL]: NOW - 3600_000, [OTHER]: NOW - 600_000 },
        activity: { [REAL]: NOW - 1000, [OTHER]: NOW - 30_000 },
        ownerSid: REAL,
        now: NOW,
      }).map((p) => p.sid),
    ).toEqual([OTHER])
  })

  it('a probe with fresh activity is never flagged as the second driver either', () => {
    expect(
      classifyParallel({
        sessionsSeen: { [REAL]: NOW - 3600_000, 'preflight-test': NOW - 600_000 },
        activity: { [REAL]: NOW - 1000, 'preflight-test': NOW - 1000 },
        ownerSid: REAL,
        now: NOW,
      }),
    ).toEqual([])
  })

  it('acquire REFUSES a probe the lock, and writes none — the alarm has no source left', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-probe-lock-'))
    const lockPath = join(dir, 'batch-lock.json')
    try {
      // The exact call the preflight's real-repo test makes, with the lock FREE.
      expect(acquire('preflight-test', { lockPath })).toBe('probe')
      expect(existsSync(lockPath)).toBe(false)
      expect(readOwnerLock(lockPath)).toBe(null)
      // A probe never owns, so it never drives the batch either.
      expect(progressGuardDecision({ sid: 'preflight-test', paused: false, openCount: 5, ownership: 'probe' })).toBe(
        'stand-down',
      )
      // A REAL session id still acquires exactly as before.
      expect(acquire(REAL, { lockPath })).toBe('acquired')
      expect(readOwnerLock(lockPath)?.sessionId).toBe(REAL)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('only the reserved namespace counts — a real session id is a UUID', () => {
    for (const sid of ['preflight-test', 'preflight-', 'PREFLIGHT-anything', '  preflight-x  ']) {
      expect(isProbeSessionId(sid), sid).toBe(true)
    }
    for (const sid of [REAL, OTHER, 'launcher-abc', 'preflight', 'x-preflight-y', '', null, undefined, 42]) {
      expect(isProbeSessionId(sid), String(sid)).toBe(false)
    }
    expect(PROBE_SESSION_PREFIX).toBe('preflight-')
  })
})

// ---------------------------------------------------------------------------
describe('scenario 5: progressGuardDecision — a non-owner stands down', () => {
  const base = { sid: 's1', paused: false, openCount: 5, formatSuspect: false, ownership: 'mine', unhandledAlert: false }

  it('non-owner (lock held elsewhere) → stand-down, never conscripted', () => {
    expect(progressGuardDecision({ ...base, ownership: 'held' })).toBe('stand-down')
    expect(progressGuardDecision({ ...base, ownership: 'lost-race' })).toBe('stand-down')
    expect(progressGuardDecision({ ...base, ownership: 'none' })).toBe('stand-down')
  })

  it('missing session id → stand-down (ownership unprovable)', () => {
    expect(progressGuardDecision({ ...base, sid: '' })).toBe('stand-down')
  })

  it('owner with open points → block-continue (the anti-idle push)', () => {
    expect(progressGuardDecision(base)).toBe('block-continue')
    expect(progressGuardDecision({ ...base, ownership: 'acquired' })).toBe('block-continue')
  })

  it('owner + unhandled parallel alert → block-remediate (verify before more batch work)', () => {
    expect(progressGuardDecision({ ...base, unhandledAlert: true })).toBe('block-remediate')
  })

  it('paused / batch complete → allow', () => {
    expect(progressGuardDecision({ ...base, paused: true })).toBe('allow')
    expect(progressGuardDecision({ ...base, openCount: 0 })).toBe('allow')
  })

  it('unparseable TASKS.md → block-format (never silently "complete")', () => {
    expect(progressGuardDecision({ ...base, openCount: 0, formatSuspect: true })).toBe('block-format')
  })
})

// ---------------------------------------------------------------------------
describe('constants sanity', () => {
  it('the takeover grace is well above the heartbeat cadence and DEAD_CONFIRM < LEGACY_STALE', () => {
    expect(DEAD_CONFIRM_MS).toBeGreaterThanOrEqual(5 * 60 * 1000)
    expect(LEGACY_STALE_MS).toBeGreaterThan(DEAD_CONFIRM_MS)
  })

  it('THE LADDER IS MONOTONE (point 434): renew < lease < the external watcher', () => {
    // Each rung must be able to act before the next one is reached, or a layer is
    // decoration. The renewal interval bounds how stale a lease may be when a long
    // call starts; the lease bounds how long a standstill can hold the batch; and
    // the GitHub-Actions watchdog (STALL_MINUTES 120, off this machine) is the
    // backstop, judging repository OUTPUT rather than a heartbeat — the signal the
    // local layer read wrongly all night.
    expect(LEASE_RENEW_INTERVAL_MS).toBeLessThan(LEASE_MS)
    expect(LEASE_MS - LEASE_RENEW_INTERVAL_MS).toBeGreaterThan(40 * 60_000) // the LARGE regression
    expect(LEASE_MS).toBeLessThan(120 * 60_000) // the external watcher's window
    expect(LEASE_MS).toBeGreaterThan(LAUNCHER_TICK_MS) // a tick can never outrun the lease
  })
})
