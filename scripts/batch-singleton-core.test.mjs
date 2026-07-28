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
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
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
  wedgeNotifyDecision,
  wedgeOwnerKey,
  DEAD_CONFIRM_MS,
  LEGACY_STALE_MS,
  WEDGED_MS,
  PARALLEL_FRESH_MS,
  HANDOVER_GRACE_MS,
  WEDGE_NOTIFY_MS,
} from './batch-singleton.mjs'

const NOW = 1_784_900_000_000
const BOOT = NOW - 12 * 3600 * 1000 // machine booted 12 h ago
const aliveProbe = { exists: true, startedAt: null }
const deadProbe = { exists: false, startedAt: null }

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
describe('wedgeNotifyDecision (point 388 (c): diagnose AND report, once per silence)', () => {
  const key = 'owner-1#4242#1000'

  it('reports an alive owner past the threshold', () => {
    expect(wedgeNotifyDecision({ alive: true, ageMs: WEDGE_NOTIFY_MS, ownerKey: key }).notify).toBe(true)
  })

  it('stays quiet below the threshold — a long verify run is not a wedge', () => {
    const d = wedgeNotifyDecision({ alive: true, ageMs: 40 * 60_000, ownerKey: key })
    expect(d.notify).toBe(false)
    expect(d.reason).toBe('below-threshold')
  })

  it('does not repeat itself for the same silence, tick after tick', () => {
    const d = wedgeNotifyDecision({ alive: true, ageMs: 5 * 3600_000, ownerKey: key, lastNotifiedKey: key })
    expect(d.notify).toBe(false)
    expect(d.reason).toBe('already-notified')
  })

  it('but reports a SECOND stall of the same session — the key carries the heartbeat it fell silent at', () => {
    const first = wedgeOwnerKey({ sessionId: 'owner-1', pid: 4242, claimedAt: 1000 })
    const second = wedgeOwnerKey({ sessionId: 'owner-1', pid: 4242, claimedAt: 9_000_000 })
    expect(first).not.toBe(second)
    expect(wedgeNotifyDecision({ alive: true, ageMs: 5 * 3600_000, ownerKey: second, lastNotifiedKey: first }).notify).toBe(true)
  })

  it('says nothing about a dead owner (the launcher simply takes over) or a nameless lock', () => {
    expect(wedgeNotifyDecision({ alive: false, ageMs: 9 * 3600_000, ownerKey: key }).notify).toBe(false)
    expect(wedgeNotifyDecision({ alive: true, ageMs: 9 * 3600_000, ownerKey: '' }).notify).toBe(false)
    expect(wedgeOwnerKey(null)).toBe('')
  })

  it('the calibratable threshold clears the longest legitimate silence (a LARGE regression, ~40 min)', () => {
    expect(WEDGE_NOTIFY_MS).toBeGreaterThan(60 * 60 * 1000)
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
    ...over,
  })

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
    expect(markHandover('s2', { lockPath })).toBe(false)
    expect(readOwnerLock(lockPath).handedOver).toBeUndefined()
    expect(markHandover('s1', { lockPath, point: 388, now: before + 1000 })).toBe(true)
    const lock = readOwnerLock(lockPath)
    expect(lock.handedOver).toBe(true)
    expect(lock.handedOverAt).toBe(before + 1000)
    expect(lock.handoverPoint).toBe(388)
    expect(lock.claimedAt).toBe(before) // the heartbeat is NOT bumped
    expect(lock.sessionId).toBe('s1') // and it is not a release
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

  it('heldByOtherLiveOwner: true for a foreign live lock, false for mine/free/dead', () => {
    expect(heldByOtherLiveOwner('sX', { lockPath })).toBe(false) // free
    acquire('s1', opts())
    expect(heldByOtherLiveOwner('s1', { lockPath, probePidFn: () => aliveProbe })).toBe(false) // mine
    expect(heldByOtherLiveOwner('s2', { lockPath, probePidFn: () => aliveProbe })).toBe(true) // foreign + live
    writeFileSync(
      lockPath,
      JSON.stringify({ sessionId: 'dead', claimedAt: Date.now() - 30 * 60_000, pid: 999999 }),
    )
    expect(heldByOtherLiveOwner('s2', { lockPath, probePidFn: () => deadProbe })).toBe(false) // foreign but dead
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
    expect(WEDGED_MS).toBeGreaterThan(LEGACY_STALE_MS)
  })
})
