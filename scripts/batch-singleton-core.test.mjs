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
  progressGuardDecision,
  acquire,
  heartbeat,
  release,
  readOwnerLock,
  heldByOtherLiveOwner,
  convertPendingSpawn,
  markHandover,
  withdrawHandover,
  touchHandover,
  clearOwnBoundary,
  wedgeNotifyDecision,
  wedgeOwnerKey,
  wedgeStage,
  wedgeAction,
  wedgeTakeover,
  verdictRepeat,
  VERDICT_REPEAT_ESCALATE_AT,
  isOwnSpawn,
  silenceStage,
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
  WEDGED_MS,
  PARALLEL_FRESH_MS,
  HANDOVER_GRACE_MS,
  WEDGE_NOTIFY_MS,
  LAUNCHER_TICK_MS,
  WORK_STALL_TICKS,
  WORK_STALL_MS,
  WORK_DECLARATION_TOLERANCE_MS,
  SPAWN_IDENTITY_TOLERANCE_MS,
} from './batch-singleton.mjs'
import { LAUNCHER_WORK_MAX_AGE_MS } from './batch-in-flight-core.mjs'

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

  it('wedged: pid alive but heartbeat hours old → alive AND flagged (never silently replaced)', () => {
    const a = assessOwner(lock({ claimedAt: NOW - WEDGED_MS - 60_000 }), { now: NOW, bootTime: BOOT, probe: aliveProbe })
    expect(a.alive).toBe(true)
    expect(a.wedged).toBe(true)
    expect(spawnDecision(a)).toBe('skip-wedged')
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

  // --- PROGRESS, NOT AGE (point 402) ----------------------------------------
  // Four sessions were killed in one afternoon for doing exactly what they were
  // told to do: delegate a point and wait for it. The runtime shot them at ten
  // minutes; the launcher could not tell the corpse from the worker either, since
  // age was the only thing it measured. These pin the input that replaced the
  // clock — what the owner DECLARED it is waiting on, already probed.
  const advancing = { declared: true, advancing: true, declaredAt: NOW - 60_000, summary: 'branch feat/402-x — tip 3 min old' }
  const stale = NOW - WORK_STALL_MS - 60_000
  // The honest stall shape: the declaration is the owner's LAST WORD, so its own
  // PostToolUse heartbeat lands a second after it and nothing follows.
  const frozenAfter = (heartbeat) => ({
    declared: true,
    advancing: false,
    declaredAt: heartbeat - 1000,
    summary: 'branch feat/402-x — no commit for 41 min',
  })
  const frozen = frozenAfter(stale)

  it('a stale heartbeat whose declared agent still COMMITS reads alive, never wedged', () => {
    const a = assessOwner(lock({ claimedAt: stale }), { now: NOW, bootTime: BOOT, probe: aliveProbe, work: advancing })
    expect(a).toMatchObject({ alive: true, wedged: false, reason: 'work-advancing' })
    expect(spawnDecision(a)).toBe('skip-alive')
  })

  it('…however long it takes: even past the four-hour valve, moving work is alive', () => {
    const a = assessOwner(lock({ claimedAt: NOW - WEDGED_MS - 60_000 }), {
      now: NOW,
      bootTime: BOOT,
      probe: aliveProbe,
      work: advancing,
    })
    expect(a).toMatchObject({ alive: true, wedged: false, reason: 'work-advancing' })
  })

  it('THE ONLY BOUND LEFT: the same silence with every probe quiet is WEDGED after the stall window', () => {
    const a = assessOwner(lock({ claimedAt: stale }), { now: NOW, bootTime: BOOT, probe: aliveProbe, work: frozen })
    expect(a).toMatchObject({ alive: true, wedged: true, reason: 'work-stalled' })
    expect(spawnDecision(a)).toBe('skip-wedged')
    expect(WORK_STALL_MS).toBe(WORK_STALL_TICKS * LAUNCHER_TICK_MS)
    // THE LADDER IS MONOTONE IN SEVERITY (point 433): the 45-minute wedge licenses
    // only the non-destructive lock take, this bound licenses REAPING the
    // launcher's own spawn — so the destructive verdict is deliberately the slower
    // one. Before 433 the relation was the other way round, against a four-hour
    // valve that never rescued anything.
    expect(WEDGED_MS).toBeLessThan(WORK_STALL_MS)
  })

  it('THE STALL BOUND CLEARS THE LONGEST LEGITIMATE SILENCE (four-eyes finding 1.1 (ii))', () => {
    // The heartbeat is PostToolUse, so ONE long tool call starves it. The verdict
    // this bound feeds can end in a KILL, so it keeps the 2x headroom over the
    // longest legitimate silence this repository documents (~40 min) — measured
    // against the transcripts in point 433, the longest undeclared unattended tool
    // call is 27.8 min and the p99.9 is 10 min, so the headroom is real.
    expect(WORK_STALL_MS).toBeGreaterThanOrEqual(60 * 60_000)
    expect(WORK_STALL_MS).toBeGreaterThanOrEqual(2 * 40 * 60_000)
  })

  it('inside the stall window the REASON stays pre-402 — a declaration never invents a stall', () => {
    const heartbeat = NOW - WORK_STALL_MS + 60_000
    const a = assessOwner(lock({ claimedAt: heartbeat }), {
      now: NOW,
      bootTime: BOOT,
      probe: aliveProbe,
      work: frozenAfter(heartbeat),
    })
    // `wedged` is true here since point 433 — 89 minutes is far past the 45-minute
    // threshold — but the REASON is what this pins: `pid-alive`, not `work-stalled`,
    // so the declaration bought the launcher no licence to reap.
    expect(a).toMatchObject({ alive: true, wedged: true, reason: 'pid-alive' })
    expect(wedgeAction({ assessment: a, lock: lock({ claimedAt: heartbeat }) }).kill).toBe(false)
  })

  it('BELOW the wedge threshold nothing is flagged at all — a 40-minute tool call is normal', () => {
    const heartbeat = NOW - 40 * 60_000
    const a = assessOwner(lock({ claimedAt: heartbeat }), {
      now: NOW,
      bootTime: BOOT,
      probe: aliveProbe,
      work: frozenAfter(heartbeat),
    })
    expect(a).toMatchObject({ alive: true, wedged: false, reason: 'pid-alive' })
    expect(spawnDecision(a)).toBe('skip-alive')
  })

  // --- THE DECLARATION MUST BE THE OWNER'S LAST WORD (finding 1.1 (i)) -------
  it('A HEARTBEAT NEWER THAN THE DECLARATION IS NOT A STALL — the replayed near-kill', () => {
    // Reproduced end to end by the four-eyes review: a session declares a wait,
    // the agent finishes, the session merges and starts `npm run test:large`
    // WITHOUT clearing the declaration (nothing forces a clear), and the next
    // launcher tick sees a stale heartbeat beside a still-current declaration
    // whose evidence has gone quiet. Reading that as `work-stalled` reaps a
    // session in the middle of a LARGE regression.
    const declaredAt = NOW - 43 * 60_000 // still current: inside IN_FLIGHT_MAX_AGE_MS
    const heartbeat = declaredAt + 12 * 60_000 // the merge, AFTER the declaration
    const leftoverPaperwork = {
      declared: true,
      advancing: false,
      declaredAt,
      summary: 'branch feat/402-x — no commit for 43 min',
    }
    const a = assessOwner(lock({ claimedAt: heartbeat }), {
      now: NOW, // 31 min of legitimate silence since the heartbeat
      bootTime: BOOT,
      probe: aliveProbe,
      work: leftoverPaperwork,
    })
    expect(a).toMatchObject({ alive: true, wedged: false, reason: 'pid-alive' })
    expect(spawnDecision(a)).toBe('skip-alive')
    // …and the four-hour valve is all such leftover paperwork may ever license.
    const muchLater = assessOwner(lock({ claimedAt: heartbeat }), {
      now: heartbeat + WEDGED_MS + 60_000,
      bootTime: BOOT,
      probe: aliveProbe,
      work: leftoverPaperwork,
    })
    expect(muchLater).toMatchObject({ alive: true, wedged: true, reason: 'pid-alive' })
  })

  it('the tolerance is exactly the declare command’s own heartbeat, not a window to work in', () => {
    const at = (declaredAt) =>
      assessOwner(lock({ claimedAt: stale }), {
        now: NOW,
        bootTime: BOOT,
        probe: aliveProbe,
        work: { declared: true, advancing: false, declaredAt, summary: 'quiet' },
      })
    // The heartbeat may lag the declaration by the whole tolerance and no more.
    expect(at(stale - WORK_DECLARATION_TOLERANCE_MS).reason).toBe('work-stalled')
    expect(at(stale - WORK_DECLARATION_TOLERANCE_MS - 1).reason).toBe('pid-alive')
  })

  it('a declaration with no timestamp can never license a stall', () => {
    const a = assessOwner(lock({ claimedAt: stale }), {
      now: NOW,
      bootTime: BOOT,
      probe: aliveProbe,
      work: { declared: true, advancing: false, declaredAt: null, summary: 'quiet' },
    })
    // Past the 45-minute threshold this is wedged either way; what is pinned is the
    // REASON — an undatable declaration never upgrades it to the reapable one.
    expect(a).toMatchObject({ alive: true, wedged: true, reason: 'pid-alive' })
  })

  it('A DEAD PID STAYS DEAD whatever the evidence says', () => {
    const a = assessOwner(lock({ claimedAt: stale }), { now: NOW, bootTime: BOOT, probe: deadProbe, work: advancing })
    expect(a).toMatchObject({ alive: false, reason: 'pid-dead' })
    // …and so does a REUSED one, and a heartbeat from before the boot.
    const reused = assessOwner(lock({ claimedAt: stale }), {
      now: NOW,
      bootTime: BOOT,
      probe: { exists: true, startedAt: NOW - 10_000 },
      work: advancing,
    })
    expect(reused).toMatchObject({ alive: false, reason: 'pid-reused' })
    const preboot = assessOwner(lock({ claimedAt: BOOT - 60_000 }), {
      now: NOW,
      bootTime: BOOT,
      probe: aliveProbe,
      work: advancing,
    })
    expect(preboot).toMatchObject({ alive: false, reason: 'heartbeat-predates-boot' })
  })

  it('a declaration no probe can answer is no evidence — it neither saves nor is required to', () => {
    // `assessOwnerWork` reports that shape as declared-but-not-advancing, which is
    // exactly a stall: unanswerable is treated as no evidence, never as proof.
    const unanswerable = {
      declared: true,
      advancing: false,
      declaredAt: stale - 1000,
      summary: 'vibes (the agent is surely fine) — unknown-kind',
    }
    expect(assessOwner(lock({ claimedAt: stale }), { now: NOW, bootTime: BOOT, probe: aliveProbe, work: unanswerable }))
      .toMatchObject({ wedged: true, reason: 'work-stalled' })
  })

  it('NO declaration → the plain clock verdict, never the reapable one', () => {
    const none = { declared: false, advancing: false, summary: '' }
    for (const work of [null, undefined, none]) {
      const a = assessOwner(lock({ claimedAt: stale }), { now: NOW, bootTime: BOOT, probe: aliveProbe, work })
      expect(a).toMatchObject({ alive: true, wedged: true, reason: 'pid-alive' })
    }
  })

  it('a stale declaration proves progress but cannot tighten the bound (declared false, advancing true)', () => {
    const agedButMoving = { declared: false, advancing: true, summary: 'branch feat/402-x — tip 2 min old' }
    expect(assessOwner(lock({ claimedAt: stale }), { now: NOW, bootTime: BOOT, probe: aliveProbe, work: agedButMoving }))
      .toMatchObject({ alive: true, wedged: false, reason: 'work-advancing' })
  })

  it('a LEGACY lock (no pid) is likewise kept alive by moving work', () => {
    const legacy = { sessionId: 's', claimedAt: NOW - LEGACY_STALE_MS - 60_000 }
    expect(assessOwner(legacy, { now: NOW, bootTime: BOOT, probe: null }).reason).toBe('legacy-stale')
    expect(assessOwner(legacy, { now: NOW, bootTime: BOOT, probe: null, work: advancing })).toMatchObject({
      alive: true,
      reason: 'work-advancing',
    })
  })

  it('a CRASH and a WEDGE still hold the lock — only a taken boundary hands it over', () => {
    const crashed = assessOwner(lock({ claimedAt: NOW - 30 * 60_000 }), { now: NOW, bootTime: BOOT, probe: aliveProbe })
    expect(crashed.alive).toBe(true)
    const wedged = assessOwner(lock({ claimedAt: NOW - WEDGED_MS - 60_000 }), {
      now: NOW,
      bootTime: BOOT,
      probe: aliveProbe,
    })
    expect(wedged.alive).toBe(true)
    expect(spawnDecision(wedged)).toBe('skip-wedged')
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
describe('wedgeNotifyDecision (point 388 (c): diagnose AND report, once per silence and stage)', () => {
  const lock = { sessionId: 'owner-1', pid: 4242, claimedAt: 1000 }
  const at = (ageMs) => {
    const stage = wedgeStage(ageMs)
    return { stage, ownerKey: wedgeOwnerKey(lock, stage ?? '') }
  }

  it('reports an alive owner past the threshold', () => {
    expect(wedgeNotifyDecision({ alive: true, ...at(WEDGE_NOTIFY_MS) }).notify).toBe(true)
  })

  it('stays quiet below the threshold — an ordinary long tool call is not a wedge', () => {
    const d = wedgeNotifyDecision({ alive: true, ...at(WEDGE_NOTIFY_MS - 60_000) })
    expect(d.notify).toBe(false)
    expect(d.reason).toBe('below-threshold')
  })

  it('does not repeat itself for the same silence, tick after tick', () => {
    const now = at(WEDGE_NOTIFY_MS + 60_000)
    const d = wedgeNotifyDecision({ alive: true, ...now, lastNotifiedKey: now.ownerKey })
    expect(d.notify).toBe(false)
    expect(d.reason).toBe('already-notified')
  })

  it('ESCALATES when the same silence deepens into a wedge — the incident was "nobody looked"', () => {
    const silent = at(WEDGE_NOTIFY_MS + 60_000)
    const wedged = at(WEDGED_MS + 60_000)
    expect(silent.stage).toBe('silent')
    expect(wedged.stage).toBe('wedged')
    const d = wedgeNotifyDecision({ alive: true, ...wedged, lastNotifiedKey: silent.ownerKey })
    expect(d.notify).toBe(true)
    expect(d.reason).toBe('wedged-owner')
    // …and then falls silent again for that stage.
    expect(wedgeNotifyDecision({ alive: true, ...wedged, lastNotifiedKey: wedged.ownerKey }).notify).toBe(false)
  })

  it('reports a SECOND stall of the same session — the key carries the heartbeat it fell silent at', () => {
    const first = wedgeOwnerKey(lock, 'silent')
    const second = wedgeOwnerKey({ ...lock, claimedAt: 9_000_000 }, 'silent')
    expect(first).not.toBe(second)
    expect(
      wedgeNotifyDecision({ alive: true, stage: 'silent', ownerKey: second, lastNotifiedKey: first }).notify,
    ).toBe(true)
  })

  it('says nothing about a dead owner (the launcher simply takes over) or a nameless lock', () => {
    expect(wedgeNotifyDecision({ alive: false, ...at(9 * 3600_000) }).notify).toBe(false)
    expect(wedgeNotifyDecision({ alive: true, stage: 'wedged', ownerKey: '' }).notify).toBe(false)
    expect(wedgeOwnerKey(null)).toBe('')
    expect(wedgeStage('a while')).toBe(null)
  })

  it('the notify stage arrives exactly ONE launcher tick before the launcher acts (point 433)', () => {
    // It used to demand two hours' headroom over the longest legitimate silence,
    // against a four-hour wedge. With the wedge at 45 minutes a hard 90 would sit
    // ABOVE it and the first stage would be unreachable, so the threshold is now
    // DERIVED: one tick of warning, then the take. A legitimately long run is
    // protected by its declaration (`silenceStage` suppresses this stage while work
    // advances), not by a bigger number — and 30 min is still 3x the measured p99.9
    // of a single tool call (10 min, point 433's transcript sweep).
    expect(WEDGE_NOTIFY_MS).toBe(WEDGED_MS - LAUNCHER_TICK_MS)
    expect(WEDGE_NOTIFY_MS).toBeLessThan(WEDGED_MS)
    expect(WEDGE_NOTIFY_MS).toBeGreaterThanOrEqual(3 * 10 * 60_000)
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

// ---------------------------------------------------------------------------
// WHAT A WEDGE EARNS (point 402 (d)). Two kinds reach the launcher and they are
// not the same finding: a `work-stalled` verdict is positive evidence that
// nothing is moving, while the four-hour valve is still only a clock reading. The
// rule that binds both is older than either: the launcher only ever kills a
// process it spawned itself.
describe('wedgeAction (the launcher’s consequence for a wedged owner)', () => {
  const stalled = { alive: true, wedged: true, reason: 'work-stalled' }
  const aged = { alive: true, wedged: true, reason: 'pid-alive' }
  const SPAWNED_AT = NOW - 3 * 60 * 60_000
  // The identity of the process the launcher actually started: pid AND start time.
  const ours = { assessment: stalled, lock: { pid: 900 }, lastSpawnPid: 900, lastSpawnAt: SPAWNED_AT, probe: { exists: true, startedAt: SPAWNED_AT + 400 } }

  it('a stall in the launcher’s OWN spawn → urgent signal, reap, take over', () => {
    expect(wedgeAction(ours)).toMatchObject({
      stalled: true,
      own: true,
      notify: 'urgent',
      kill: true,
      takeover: true,
    })
  })

  it('THE OWN-SPAWN CONDITION IS GONE: a hand-started owner is reaped and taken over too', () => {
    // THE REASON THE NIGHT OF 30.07.2026 WAS LOST (point 433). The owner had been
    // started by hand, so `own` was false, and the whole verdict fell through to a
    // log line the launcher printed nine times over two hours. The authority
    // existed; it was merely too narrow.
    expect(wedgeAction({ ...ours, lock: { pid: 901 } })).toMatchObject({
      stalled: true,
      own: false,
      notify: 'urgent',
      kill: true,
      takeover: true,
    })
    // A recycled pid or an unverifiable start time no longer withholds the reap
    // either — they only change what `own` REPORTS, i.e. how the message reads.
    expect(wedgeAction({ ...ours, probe: { exists: true, startedAt: NOW - 20 * 60_000 } })).toMatchObject({
      own: false,
      kill: true,
      takeover: true,
    })
    expect(wedgeAction({ ...ours, probe: null }).kill).toBe(true)
    expect(wedgeAction({ ...ours, lastSpawnAt: 0 }).kill).toBe(true)
  })

  it('THE CLOCK VERDICT ALONE NEVER KILLS — it may only dispossess', () => {
    // The plain `pid-alive` wedge is a clock reading, and at 45 minutes a silent
    // owner may still be inside something long. It loses the LOCK (`wedgeTakeover`)
    // and keeps its process; only the positive `work-stalled` finding ends one.
    expect(wedgeAction({ ...ours, assessment: aged })).toMatchObject({
      stalled: false,
      notify: null,
      kill: false,
      takeover: false,
    })
    expect(wedgeAction({ ...ours, assessment: aged, lock: { pid: 901 } })).toMatchObject({
      kill: false,
      takeover: false,
    })
  })

  it('a lock without a pid is never reapable — there is nothing to reap', () => {
    expect(wedgeAction({ ...ours, lock: {} }).kill).toBe(false)
    expect(wedgeAction({ ...ours, lock: { pid: 0 }, lastSpawnPid: 0 }).kill).toBe(false)
    expect(wedgeAction({}).kill).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// A VERDICT WITHOUT A CONSEQUENCE IS A COMMENT (point 433)
// ---------------------------------------------------------------------------
describe('wedgeTakeover (the launcher may take the batch from a wedged owner)', () => {
  const owner = { sessionId: '10a2d2e0', pid: 33572, claimedAt: NOW - 251 * 60_000 }
  const wedgedByClock = { alive: true, wedged: true, reason: 'pid-alive' }

  it('THE INCIDENT: a pid-alive owner silent past the threshold → TAKE, not a log line', () => {
    const a = assessOwner(owner, { now: NOW, bootTime: BOOT, probe: aliveProbe })
    expect(a).toMatchObject({ alive: true, wedged: true, reason: 'pid-alive' })
    expect(spawnDecision(a)).toBe('skip-wedged')
    expect(wedgeTakeover({ assessment: a, lock: owner })).toEqual({ take: true, reason: 'pid-alive' })
  })

  it('a hand-started owner is taken over exactly the same — whoever started it', () => {
    // No `own` input reaches this decision at all, which is the point.
    expect(wedgeTakeover({ assessment: wedgedByClock, lock: owner }).take).toBe(true)
  })

  it('a FRESH heartbeat still yields skip — nothing is taken from a working session', () => {
    const fresh = assessOwner({ ...owner, claimedAt: NOW - 60_000 }, { now: NOW, bootTime: BOOT, probe: aliveProbe })
    expect(spawnDecision(fresh)).toBe('skip-alive')
    expect(wedgeTakeover({ assessment: fresh, lock: owner })).toEqual({ take: false, reason: 'below-threshold' })
  })

  it('a silence just under the threshold yields nothing either', () => {
    const almost = assessOwner({ ...owner, claimedAt: NOW - (WEDGED_MS - 60_000) }, { now: NOW, bootTime: BOOT, probe: aliveProbe })
    expect(almost.wedged).toBe(false)
    expect(wedgeTakeover({ assessment: almost, lock: owner }).take).toBe(false)
  })

  it("a DEAD pid keeps today's path — the ordinary spawn decision frees that lock", () => {
    const dead = assessOwner(owner, { now: NOW, bootTime: BOOT, probe: deadProbe })
    expect(spawnDecision(dead)).toBe('spawn')
    expect(wedgeTakeover({ assessment: dead, lock: owner })).toEqual({ take: false, reason: 'not-alive' })
  })

  it('ADVANCING declared work is never dispossessed, however long the silence', () => {
    const advancing = { declared: true, advancing: true, declaredAt: NOW - 60_000, summary: 'branch feat/x — tip 3 min old' }
    const a = assessOwner({ ...owner, claimedAt: NOW - 9 * 3600_000 }, { now: NOW, bootTime: BOOT, probe: aliveProbe, work: advancing })
    expect(a).toMatchObject({ alive: true, wedged: false, reason: 'work-advancing' })
    expect(wedgeTakeover({ assessment: a, lock: owner, work: advancing }).take).toBe(false)
    // Belt and braces: even handed a wedged assessment, advancing work refuses.
    expect(wedgeTakeover({ assessment: wedgedByClock, lock: owner, work: advancing })).toEqual({
      take: false,
      reason: 'work-advancing',
    })
  })

  it("A DECLARATION'S EXPIRY ALONE NEVER TRIGGERS A TAKE — no long verification is shot in the back", () => {
    // The launcher honours a declaration for four hours (LAUNCHER_WORK_MAX_AGE_MS),
    // and that window is written out rather than borrowed from WEDGED_MS precisely
    // so this can hold: an aged-out declaration flips `advancing` to false, and if
    // that alone licensed a take, every long verification would lose the batch the
    // moment its paperwork expired. The take needs the POSITIVE evidence of silence.
    const expired = { declared: false, advancing: false, summary: '' }
    const freshHeartbeat = assessOwner({ ...owner, claimedAt: NOW - 60_000 }, { now: NOW, bootTime: BOOT, probe: aliveProbe, work: expired })
    expect(freshHeartbeat.wedged).toBe(false)
    expect(wedgeTakeover({ assessment: freshHeartbeat, lock: owner, work: expired }).take).toBe(false)
    // And the window itself must not have been coupled to the wedge threshold.
    expect(LAUNCHER_WORK_MAX_AGE_MS).toBeGreaterThan(WEDGED_MS)
    expect(LAUNCHER_WORK_MAX_AGE_MS).toBeGreaterThan(WORK_STALL_MS)
  })

  it('a nameless or missing lock is never taken', () => {
    expect(wedgeTakeover({ assessment: wedgedByClock, lock: null }).take).toBe(false)
    expect(wedgeTakeover({ assessment: wedgedByClock, lock: { pid: 1 } })).toEqual({ take: false, reason: 'no-owner' })
    expect(wedgeTakeover({ assessment: wedgedByClock, lock: { sessionId: '' } }).take).toBe(false)
    expect(wedgeTakeover()).toEqual({ take: false, reason: 'no-owner' })
  })
})

describe('verdictRepeat (repetition is the signal, point 433 (c))', () => {
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
describe('silenceStage (a declaration is evidence, not an exemption)', () => {
  it('suppresses the first stage while the declared work advances', () => {
    expect(silenceStage({ ageMs: WEDGE_NOTIFY_MS + 60_000, advancing: true })).toBe(null)
    expect(silenceStage({ ageMs: WEDGE_NOTIFY_MS + 60_000, advancing: false })).toBe('silent')
  })

  it('REPORTS THE HOURS-LONG STAGE REGARDLESS (finding 1.2)', () => {
    // Otherwise an eternally-fresh piece of evidence — the repo root as a
    // worktree, `main` as a branch — silences BOTH the wedge verdict and this
    // notification, leaving the owner less observed than with no declaration.
    expect(silenceStage({ ageMs: WEDGED_MS + 60_000, advancing: true })).toBe('wedged')
    expect(silenceStage({ ageMs: WEDGED_MS + 60_000, advancing: false })).toBe('wedged')
  })

  it('below the notify threshold nothing is reported either way', () => {
    for (const advancing of [true, false]) expect(silenceStage({ ageMs: 60_000, advancing })).toBe(null)
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

  // --- THE ONE CASE IN WHICH A LIVE LOCK MAY BE TAKEN (point 433) -------------
  describe('takeWedged — the launcher dispossesses a wedged owner, atomically', () => {
    /** A live pid whose heartbeat is `silentMs` old. */
    const wedgedOwner = (silentMs) =>
      writeFileSync(lockPath, JSON.stringify({ sessionId: 'wedged', claimedAt: Date.now() - silentMs, pid: 999999 }))

    it('WITHOUT the flag a wedged owner keeps its lock — nothing changed by default', () => {
      wedgedOwner(WEDGED_MS + 60_000)
      expect(acquire('launcher', opts())).toBe('held')
      expect(readOwnerLock(lockPath).sessionId).toBe('wedged')
    })

    it('WITH the flag the launcher takes it, and the new lock records why', () => {
      wedgedOwner(WEDGED_MS + 60_000)
      const res = acquire('launcher', opts({ takeWedged: true, extra: { takenFromWedged: { sessionId: 'wedged' } } }))
      expect(res).toBe('acquired')
      const lock = readOwnerLock(lockPath)
      expect(lock.sessionId).toBe('launcher')
      expect(lock.takenFromWedged).toEqual({ sessionId: 'wedged' })
    })

    it('the flag does NOT widen anything else: a merely silent owner keeps its lock', () => {
      wedgedOwner(WEDGED_MS - 60_000)
      expect(acquire('launcher', opts({ takeWedged: true }))).toBe('held')
      expect(readOwnerLock(lockPath).sessionId).toBe('wedged')
    })

    it('TWO LAUNCHERS CANNOT BOTH ACT — the second loses cleanly', () => {
      wedgedOwner(WEDGED_MS + 60_000)
      expect(acquire('launcher-a', opts({ takeWedged: true }))).toBe('acquired')
      // The second arrives after the first took it: the new lock is FRESH, so it is
      // not wedged and the flag buys nothing.
      expect(acquire('launcher-b', opts({ takeWedged: true }))).toBe('held')
      expect(readOwnerLock(lockPath).sessionId).toBe('launcher-a')
    })

    it('an owner that came back to life in the race window keeps its lock', () => {
      wedgedOwner(WEDGED_MS + 60_000)
      // The recheck INSIDE the reap mutex is what must see the fresh heartbeat, so
      // the probe stays alive and only the lock file moves on.
      let calls = 0
      const probePidFn = () => {
        calls += 1
        if (calls === 1) wedgedOwner(1000) // heartbeat written between the two reads
        return aliveProbe
      }
      expect(acquire('launcher', opts({ takeWedged: true, probePidFn }))).toBe('held')
      expect(readOwnerLock(lockPath).sessionId).toBe('wedged')
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
    acquire('s1', opts())
    markHandover('s1', { lockPath, point: 388 })
    expect(withdrawHandover('s2', { lockPath })).toBe(false)
    expect(readOwnerLock(lockPath).handedOver).toBe(true)
    expect(withdrawHandover('s1', { lockPath })).toBe(true)
    expect(readOwnerLock(lockPath).handedOver).toBeUndefined()
    expect(withdrawHandover('s1', { lockPath })).toBe(false) // nothing left to withdraw
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
    acquire('s1', opts())
    markHandover('s1', { lockPath, point: 388 })
    writeFileSync(markerPath, JSON.stringify({ v: 1, sessionId: 's1', point: 388, at: Date.now() }))
    expect(withdrawHandover('s1', { lockPath })).toBe(true)
    expect(existsSync(markerPath)).toBe(false)
    // A marker recorded and then followed by real work goes too, handover or not.
    writeFileSync(markerPath, JSON.stringify({ v: 1, sessionId: 's1', point: 388, at: Date.now() }))
    expect(withdrawHandover('s1', { lockPath })).toBe(false) // no flag left to withdraw
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
    acquire('s1', opts())
    markHandover('s1', { lockPath, point: 388 })
    expect(withdrawHandover('s1', { lockPath })).toBe(true)
    const log = join(dir, 'boundary.log')
    expect(existsSync(log)).toBe(true)
    expect(readFileSync(log, 'utf8')).toMatch(/WITHDRAWN point 388 by s1/)
    // The line the live batch found in ITS log: it must be impossible for this
    // suite to produce it there.
    expect(resolve(log)).not.toBe(resolve(BOUNDARY_LOG_PATH))
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
    expect(readdirSync(dir).sort()).toEqual(['batch-lock.json', 'batch-lock.json.tmp-4242'])
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
              { timeout: 30000 },
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
    // NOT strictly greater since point 433: the wedge threshold came down to the
    // legacy-stale bound, so 45 minutes of silence now costs the batch lock whether
    // or not the lock records a pid. Tighter than the legacy bound would be wrong —
    // a pid is evidence of life a bare timestamp is not.
    expect(WEDGED_MS).toBeGreaterThanOrEqual(LEGACY_STALE_MS)
  })
})
