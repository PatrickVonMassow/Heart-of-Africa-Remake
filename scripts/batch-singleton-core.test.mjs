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
  sweepableTmpFiles,
  statePathsFor,
  LOCK_PATH,
  BOUNDARY_LOG_PATH,
  BOUNDARY_MARKER_PATH,
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
} from './batch-singleton.mjs'

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
describe('wedgeNotifyDecision (point 388 (c): diagnose AND report, once per silence and stage)', () => {
  const lock = { sessionId: 'owner-1', pid: 4242, claimedAt: 1000 }
  const at = (ageMs) => {
    const stage = wedgeStage(ageMs)
    return { stage, ownerKey: wedgeOwnerKey(lock, stage ?? '') }
  }

  it('reports an alive owner past the threshold', () => {
    expect(wedgeNotifyDecision({ alive: true, ...at(WEDGE_NOTIFY_MS) }).notify).toBe(true)
  })

  it('stays quiet below the threshold — a long verify run is not a wedge', () => {
    const d = wedgeNotifyDecision({ alive: true, ...at(40 * 60_000) })
    expect(d.notify).toBe(false)
    expect(d.reason).toBe('below-threshold')
  })

  it('does not repeat itself for the same silence, tick after tick', () => {
    const now = at(2 * 3600_000)
    const d = wedgeNotifyDecision({ alive: true, ...now, lastNotifiedKey: now.ownerKey })
    expect(d.notify).toBe(false)
    expect(d.reason).toBe('already-notified')
  })

  it('ESCALATES when the same silence deepens into a wedge — the incident was "nobody looked"', () => {
    const silent = at(2 * 3600_000)
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

  it('the calibratable threshold clears the longest legitimate silence (a LARGE regression, ~40 min)', () => {
    expect(WEDGE_NOTIFY_MS).toBeGreaterThan(60 * 60 * 1000)
    expect(WEDGE_NOTIFY_MS).toBeLessThan(WEDGED_MS)
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
    const res = markHandover('s1', {
      lockPath,
      point: 388,
      ...noWait,
      rename: eperm,
      writeInPlace: eperm,
    })
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
    expect(WEDGED_MS).toBeGreaterThan(LEGACY_STALE_MS)
  })
})
