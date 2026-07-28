// TAKING THE BATCH BACK INTO THE WINDOW THE USER IS SITTING AT (point 395),
// pinned. The mechanism has exactly one job — give the returning user a door back
// into the batch — and two ways to fail, so every case below is written from a
// failure side first:
//
//   TOO EAGER: a stale claim file hands the batch to a window that was closed
//   hours ago; a dead or pid-reused claimant moves it; the owner drops the lock
//   mid-merge or with a delegated agent still building; two windows are both told
//   the batch is coming to them.
//   TOO TIMID: with nobody holding the lock the claim still waits; the owner's own
//   claim (its session id renamed by a compaction) reads as a stranger's and it
//   releases the batch to itself; a claim changes anything at all for a session
//   that does not own the batch, or for a paused one.
//
// And, as everywhere in this family, nothing here may touch the repository's
// .claude/ (batch-singleton finding 3): every state file is derived from the
// caller's lock path.
import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  CLAIM_MAX_AGE_MS,
  GIT_STATE_UNVERIFIABLE,
  assessClaim,
  claimWriteDecision,
  describeClaim,
  releaseDecision,
  reservationDecision,
} from './batch-claim-core.mjs'
import {
  acquire,
  classifyParallel,
  progressGuardDecision,
  probePid,
  statePathsFor,
  LOCK_PATH,
  CLAIM_PATH,
  PID_START_TOLERANCE_MS,
} from './batch-singleton.mjs'
import {
  clearClaim,
  gatherClaim,
  gitOperationInProgress,
  handBackToClaimant,
  markClaimReleased,
  maxAgeMs,
  readClaim,
  writeClaim,
} from './batch-claim.mjs'

const NOW = 1_785_200_000_000
const OWNER = 'session-night'
const CLAIMANT = 'session-window'
const CLAIMANT_PID = 7331
const CLAIMANT_STARTED = NOW - 4 * 3600 * 1000
const OWNER_PID = 4242
const OWNER_STARTED = NOW - 8 * 3600 * 1000

const aliveClaimant = () => ({ exists: true, startedAt: CLAIMANT_STARTED })
const deadClaimant = () => ({ exists: false, startedAt: null })

const claimOf = (over = {}) => ({
  v: 1,
  sessionId: CLAIMANT,
  pid: CLAIMANT_PID,
  pidStartedAt: CLAIMANT_STARTED,
  at: NOW - 2 * 60 * 1000,
  why: 'I am back',
  ...over,
})

/** How the OWNER's Stop hook asks: its own lock supplies the process identity, so
 *  a compaction-renamed owner still recognises its own claim. */
const asOwner = (claim, over = {}) =>
  assessClaim({
    claim,
    sid: OWNER,
    ancestor: { pid: OWNER_PID, startedAt: OWNER_STARTED },
    ownerSid: OWNER,
    now: NOW,
    probePid: aliveClaimant,
    ...over,
  })

// ---------------------------------------------------------------------------
describe('assessClaim — a claim only ever moves the batch when it is provably live', () => {
  it('HONOURS a fresh claim by a live session other than the owner', () => {
    const a = asOwner(claimOf())
    expect(a).toMatchObject({ honour: true, mine: false, reason: 'honour', claimantSid: CLAIMANT })
    expect(a.ageMs).toBe(2 * 60 * 1000)
  })

  it('IGNORES an expired claim — a window closed hours ago must never hand the batch on', () => {
    const a = asOwner(claimOf({ at: NOW - CLAIM_MAX_AGE_MS - 1 }))
    expect(a).toMatchObject({ honour: false, reason: 'expired', claimantSid: CLAIMANT })
    // …and it is exactly a boundary, not a fuzzy window.
    expect(asOwner(claimOf({ at: NOW - CLAIM_MAX_AGE_MS })).honour).toBe(true)
  })

  it('honours a shorter calibrated maximum age when one is given', () => {
    const claim = claimOf({ at: NOW - 10 * 60 * 1000 })
    expect(asOwner(claim).honour).toBe(true)
    expect(asOwner(claim, { maxAgeMs: 5 * 60 * 1000 })).toMatchObject({ honour: false, reason: 'expired' })
  })

  it('IGNORES a claim by a DEAD session', () => {
    expect(asOwner(claimOf(), { probePid: deadClaimant })).toMatchObject({
      honour: false,
      reason: 'claimant-dead',
    })
  })

  it('IGNORES a claim whose pid the OS has handed to somebody else', () => {
    const stranger = () => ({ exists: true, startedAt: CLAIMANT_STARTED + PID_START_TOLERANCE_MS + 1 })
    expect(asOwner(claimOf(), { probePid: stranger })).toMatchObject({
      honour: false,
      reason: 'claimant-pid-reused',
    })
    // Within the tolerance it is still the same process.
    const same = () => ({ exists: true, startedAt: CLAIMANT_STARTED + PID_START_TOLERANCE_MS })
    expect(asOwner(claimOf(), { probePid: same }).honour).toBe(true)
  })

  it('IGNORES a claim that cannot be pinned to a process at all', () => {
    expect(asOwner(claimOf({ pid: null })).reason).toBe('claimant-unidentified')
    expect(asOwner(claimOf({ pidStartedAt: undefined })).reason).toBe('claimant-no-start-time')
    expect(asOwner(claimOf(), { probePid: () => ({ exists: true, startedAt: null }) }).reason).toBe(
      'claimant-start-time-unverifiable',
    )
  })

  it('IGNORES nonsense rather than guessing at it', () => {
    expect(assessClaim({ claim: null, now: NOW }).reason).toBe('no-claim')
    expect(assessClaim({ claim: {}, now: NOW }).reason).toBe('malformed')
    expect(assessClaim({ claim: claimOf({ sessionId: '' }), now: NOW }).reason).toBe('malformed')
    expect(assessClaim({ claim: claimOf({ at: 'soon' }), now: NOW }).reason).toBe('malformed')
    // A stamp from the future is a clock nobody can reason about → ignore.
    expect(asOwner(claimOf({ at: NOW + 60_000 })).reason).toBe('clock-skew')
  })

  it('never lets the OWNER release the batch to itself', () => {
    // By session id…
    expect(asOwner(claimOf({ sessionId: OWNER })).reason).toBe('own-claim')
    // …and by PROCESS, which is the case a context compaction produces: the id on
    // the claim is the one this very window had before it was renamed.
    const compacted = claimOf({ sessionId: 'session-night-before-compaction', pid: OWNER_PID, pidStartedAt: OWNER_STARTED })
    expect(asOwner(compacted)).toMatchObject({ honour: false, mine: true, reason: 'own-claim' })
  })

  it('ignores a claim recorded by whoever now holds the lock', () => {
    const a = assessClaim({ claim: claimOf(), sid: 'someone-else', ownerSid: CLAIMANT, now: NOW, probePid: aliveClaimant })
    expect(a).toMatchObject({ honour: false, reason: 'claimant-is-owner' })
  })

  it('reports a release stamp so the claiming window can see the batch is waiting for it', () => {
    const a = asOwner(claimOf({ releasedAt: NOW - 30_000 }))
    expect(a).toMatchObject({ honour: true, releasedAt: NOW - 30_000 })
    expect(describeClaim(a)).toContain('already released for it')
    expect(describeClaim(null)).toBe('no claim')
  })
})

// ---------------------------------------------------------------------------
describe('releaseDecision — the owner releases only at a CLEAN moment', () => {
  const honoured = { honour: true, reason: 'honour', claimantSid: CLAIMANT, ageMs: 60_000, releasedAt: null }

  it('releases when nothing is in flight and no git operation is half-done', () => {
    expect(releaseDecision({ assessment: honoured })).toEqual({ verdict: 'release', reason: 'clean' })
  })

  it('does NOT release while declared work is provably still running', () => {
    expect(releaseDecision({ assessment: honoured, inFlightLive: true })).toEqual({
      verdict: 'wait',
      reason: 'work-in-flight',
    })
  })

  it('does NOT release mid-merge, mid-rebase or on an unresolved conflict', () => {
    for (const op of ['merge', 'rebase', 'cherry-pick', 'unresolved-conflict']) {
      expect(releaseDecision({ assessment: honoured, gitOperation: op })).toEqual({
        verdict: 'wait',
        reason: `git-${op}`,
      })
    }
  })

  // The probe has THREE answers, and the third one is why this case exists: a git
  // call that timed out under load says nothing about the checkout. Collapsing it
  // into "clean" released the batch mid-merge on exactly the busy machine that
  // produced the timeout.
  it('does NOT release when the git state could not be read at all', () => {
    expect(releaseDecision({ assessment: honoured, gitOperation: GIT_STATE_UNVERIFIABLE })).toEqual({
      verdict: 'wait',
      reason: 'git-state-unverifiable',
    })
    // …and it is distinguishable from a named operation, not folded into `git-…`.
    expect(releaseDecision({ assessment: honoured, gitOperation: 'merge' }).reason).toBe('git-merge')
    // The timid direction cannot strand anything: without an honoured claim there
    // is nothing to hold on to in the first place.
    expect(
      releaseDecision({ assessment: { honour: false, reason: 'expired' }, gitOperation: GIT_STATE_UNVERIFIABLE }),
    ).toEqual({ verdict: 'none', reason: 'expired' })
  })

  it('the live probe answers the unverifiable sentinel rather than "clean" when git cannot run', () => {
    // A directory that is not a repository at all makes every probe fail — the
    // same shape a timeout produces, and the one that used to read as all-clear.
    const dir = mkdtempSync(join(tmpdir(), 'hoa-claim-nogit-'))
    try {
      expect(gitOperationInProgress({ cwd: join(dir, 'does-not-exist') })).toBe(GIT_STATE_UNVERIFIABLE)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    // And a REAL checkout is readable — whatever it happens to be doing, the probe
    // reaches a verdict rather than the sentinel. (Not pinned to null: a suite run
    // during a conflicted merge would then fail for being correct.)
    expect(gitOperationInProgress({ cwd: REPO_ROOT })).not.toBe(GIT_STATE_UNVERIFIABLE)
  })

  it('reads only an exact true as "in flight" — a truthy stray must not hold the batch forever', () => {
    for (const v of ['yes', 1, {}, []]) {
      expect(releaseDecision({ assessment: honoured, inFlightLive: v }).verdict).toBe('release')
    }
    // …and an empty git answer is not an operation.
    expect(releaseDecision({ assessment: honoured, gitOperation: '  ' }).verdict).toBe('release')
  })

  it('does nothing at all without an honoured claim', () => {
    expect(releaseDecision({ assessment: null })).toEqual({ verdict: 'none', reason: 'no-claim' })
    expect(releaseDecision({ assessment: { honour: false, reason: 'expired' } })).toEqual({
      verdict: 'none',
      reason: 'expired',
    })
  })
})

// ---------------------------------------------------------------------------
// The counterpart to the release, and the reason it does not turn into churn.
// Once the owner lets go, the lock lies FREE until the claiming window runs its
// next command — and any other window that reaches an acquire in that gap takes
// it, sees the claim that freed it, judges the moment clean and releases again:
// repeated "handed back" messages and RELEASED spam in the boundary log. Every
// site that acquires asks this first.
describe('reservationDecision — a free lock still belongs to the window that claimed it', () => {
  const honoured = { honour: true, mine: false, reason: 'honour', claimantSid: CLAIMANT, ageMs: 60_000 }

  it('reserves the free lock against a THIRD window while a claim is honoured', () => {
    expect(reservationDecision({ assessment: honoured })).toEqual({
      acquire: false,
      reason: 'reserved',
      claimantSid: CLAIMANT,
    })
  })

  it('lets the CLAIMANT ITSELF acquire — freeing the lock for it is the whole point', () => {
    // assessClaim answers `mine` (never `honour`) for one's own claim, so the
    // window the batch is waiting for passes the very gate that holds others off.
    const own = assessClaim({
      claim: claimOf(),
      sid: CLAIMANT,
      ancestor: { pid: CLAIMANT_PID, startedAt: CLAIMANT_STARTED },
      now: NOW,
      probePid: aliveClaimant,
    })
    expect(own).toMatchObject({ honour: false, mine: true })
    expect(reservationDecision({ assessment: own })).toMatchObject({ acquire: true, reason: 'own-claim' })
  })

  it('reserves NOTHING without a claim, or on one that no longer holds', () => {
    expect(reservationDecision({})).toMatchObject({ acquire: true, reason: 'no-claim' })
    expect(reservationDecision({ assessment: null }).acquire).toBe(true)
    for (const reason of ['expired', 'claimant-dead', 'claimant-pid-reused', 'malformed', 'clock-skew']) {
      expect(reservationDecision({ assessment: { honour: false, reason } })).toMatchObject({ acquire: true, reason })
    }
  })

  it('never reads a stray value as a reservation', () => {
    for (const v of ['yes', 1, {}, []]) {
      expect(reservationDecision({ assessment: { honour: v } }).acquire).toBe(true)
    }
  })

  it('the three doors ask ONE question: the guard, the resume hook and the launcher', () => {
    // The gate the wrappers run, spelled out on the real assessment they compute —
    // an honoured foreign claim closes every door, the claimant's own closes none.
    const foreign = gatherAssessment(OWNER)
    const own = gatherAssessment(CLAIMANT)
    expect(reservationDecision({ assessment: foreign }).acquire).toBe(false)
    expect(foreign.honour).toBe(true) // what batch-autostart reads at its spawn gate
    expect(reservationDecision({ assessment: own }).acquire).toBe(true)
    expect(own.honour).toBe(false)
  })

  /** What the wrappers gather: a live claim on disk, judged by the asking session,
   *  through the real path (temp lock dir, real pid, real probe). The asking
   *  session's own process identity is injected rather than walked — the walk is a
   *  PowerShell round trip and the claimant here is this very process. */
  function gatherAssessment(askingSid) {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-claim-reserve-'))
    const lockPath = join(dir, 'batch-lock.json')
    try {
      const self = probePid(process.pid)
      writeClaim(
        { v: 1, sessionId: CLAIMANT, pid: process.pid, pidStartedAt: self.startedAt, at: Date.now() },
        statePathsFor(lockPath).claimPath,
      )
      const ancestor = askingSid === CLAIMANT ? { pid: process.pid, startedAt: self.startedAt } : { pid: -1, startedAt: 0 }
      return gatherClaim(askingSid, { lockPath, ownerLock: null, ancestor })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

// ---------------------------------------------------------------------------
describe('claimWriteDecision — exactly one window is ever told the batch is coming', () => {
  const live = { existing: claimOf(), now: NOW, probePid: aliveClaimant }

  it('REFUSES a second claim while a first one is live', () => {
    const d = claimWriteDecision({ ...live, sid: 'session-other-window' })
    expect(d).toMatchObject({ action: 'refuse', reason: 'claimed-by-other', claimantSid: CLAIMANT })
  })

  it('lets the claiming window re-state its own claim', () => {
    expect(claimWriteDecision({ ...live, sid: CLAIMANT })).toMatchObject({ action: 'refresh', reason: 'own-claim' })
  })

  it('writes over a claim that no longer holds — expired, dead, or none at all', () => {
    expect(claimWriteDecision({ ...live, sid: 'session-other', existing: null }).action).toBe('write')
    expect(
      claimWriteDecision({ ...live, sid: 'session-other', existing: claimOf({ at: NOW - CLAIM_MAX_AGE_MS - 1 }) }),
    ).toMatchObject({ action: 'write', reason: 'expired' })
    expect(claimWriteDecision({ ...live, sid: 'session-other', probePid: deadClaimant })).toMatchObject({
      action: 'write',
      reason: 'claimant-dead',
    })
  })

  it('refuses to record a claim for a session that cannot name itself', () => {
    expect(claimWriteDecision({ ...live, sid: '' })).toMatchObject({ action: 'refuse', reason: 'no-session-id' })
  })
})

// ---------------------------------------------------------------------------
// The property the whole apparatus rests on: a claim is a REQUEST. Ownership is
// still gained only through the atomic acquire, so even two claims that both
// somehow got recorded cannot produce two drivers.
describe('two competing claims resolve to exactly ONE owner', () => {
  it('the atomic acquire admits one winner and stands the other down', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-claim-race-'))
    const lockPath = join(dir, 'batch-lock.json')
    try {
      const first = acquire('window-a', { lockPath, pid: process.pid, pidStartedAt: NOW, sweep: false })
      const second = acquire('window-b', { lockPath, pid: process.pid, pidStartedAt: NOW, sweep: false })
      expect(first).toBe('acquired')
      expect(second).toBe('held')
      expect(JSON.parse(readFileSync(lockPath, 'utf8')).sessionId).toBe('window-a')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('and with NO owner at all the claim is satisfied at once — there is nobody to wait for', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-claim-free-'))
    const lockPath = join(dir, 'batch-lock.json')
    try {
      expect(existsSync(lockPath)).toBe(false)
      expect(acquire(CLAIMANT, { lockPath, pid: process.pid, pidStartedAt: NOW, sweep: false })).toBe('acquired')
      // No claim file was ever needed for it.
      expect(existsSync(statePathsFor(lockPath).claimPath)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
describe('progressGuardDecision — what a claim does at the owner’s turn end', () => {
  const base = {
    sid: OWNER,
    paused: false,
    openCount: 3,
    formatSuspect: false,
    ownership: 'mine',
    unhandledAlert: false,
  }

  it('RELEASES at a clean moment, ahead of a valid point boundary', () => {
    expect(progressGuardDecision({ ...base, claim: 'release' })).toBe('allow-release')
    // The boundary hands the batch to the LAUNCHER; the claim hands it to the
    // user's own window, and where both apply the user wins.
    expect(
      progressGuardDecision({ ...base, claim: 'release', boundary: { valid: true, point: 395 }, launcher: 'armed' }),
    ).toBe('allow-release')
  })

  it('keeps working while the claim is only WAITING — nothing is cut in half', () => {
    expect(progressGuardDecision({ ...base, claim: 'wait' })).toBe('block-continue')
    expect(progressGuardDecision({ ...base, claim: 'wait', inFlight: true })).toBe('allow-in-flight')
    expect(progressGuardDecision({ ...base, claim: 'wait', boundaryDue: 395 })).toBe('block-take-boundary')
    expect(
      progressGuardDecision({ ...base, claim: 'wait', boundary: { valid: true, point: 395 }, launcher: 'armed' }),
    ).toBe('allow-boundary')
  })

  it('changes NOTHING without a claim — every existing verdict stands', () => {
    expect(progressGuardDecision({ ...base })).toBe('block-continue')
    expect(progressGuardDecision({ ...base, claim: 'none' })).toBe('block-continue')
    expect(progressGuardDecision({ ...base, inFlight: true })).toBe('allow-in-flight')
  })

  it('STANDS DOWN for a non-owner and for a paused batch, claim or no claim', () => {
    expect(progressGuardDecision({ ...base, claim: 'release', ownership: 'held' })).toBe('stand-down')
    expect(progressGuardDecision({ ...base, claim: 'release', sid: '' })).toBe('stand-down')
    expect(progressGuardDecision({ ...base, claim: 'release', paused: true })).toBe('allow')
    expect(progressGuardDecision({ ...base, claim: 'release', openCount: 0 })).toBe('allow')
  })

  it('still remediates a genuine parallel session before handing anything anywhere', () => {
    expect(progressGuardDecision({ ...base, claim: 'release', unhandledAlert: true })).toBe('block-remediate')
  })

  it('never reads a stray value as a release', () => {
    for (const v of ['releases', true, 1, {}, null, undefined]) {
      expect(progressGuardDecision({ ...base, claim: v })).toBe('block-continue')
    }
  })
})

// ---------------------------------------------------------------------------
// The claiming window is a second live top-level session BY DESIGN. Flagging it
// would raise a parallel-session alert, and that block demands the doctor before
// any further batch work — which is the one thing the handover never gets past.
describe('classifyParallel — an announced claimant is not a rogue second session', () => {
  const inputs = {
    sessionsSeen: { [OWNER]: NOW - 3600_000, [CLAIMANT]: NOW - 600_000 },
    activity: { [OWNER]: NOW - 1000, [CLAIMANT]: NOW - 2000 },
    ownerSid: OWNER,
    now: NOW,
  }

  it('flags an unannounced second session exactly as before', () => {
    expect(classifyParallel(inputs).map((p) => p.sid)).toEqual([CLAIMANT])
  })

  it('does not flag the session that claimed the batch openly', () => {
    expect(classifyParallel({ ...inputs, exclude: [CLAIMANT] })).toEqual([])
    // …and an empty or junk exclusion changes nothing.
    expect(classifyParallel({ ...inputs, exclude: [] }).map((p) => p.sid)).toEqual([CLAIMANT])
    expect(classifyParallel({ ...inputs, exclude: ['', null] }).map((p) => p.sid)).toEqual([CLAIMANT])
  })
})

// ---------------------------------------------------------------------------
// The stamp on a claim says "the batch was freed for you, come and take it". A
// session that did not free anything must not say it: `release` answers false
// whenever the lock does not name the caller — already released, taken over, or
// gone — and the stamp used to be written regardless.
describe('handBackToClaimant — the claim is stamped only where a release really happened', () => {
  const withState = (fn) => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-claim-handback-'))
    const lockPath = join(dir, 'batch-lock.json')
    const claimPath = statePathsFor(lockPath).claimPath
    try {
      writeClaim(claimOf(), claimPath)
      return fn({ lockPath, claimPath })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('releases the lock it owns and stamps the claim', () => {
    withState(({ lockPath, claimPath }) => {
      expect(acquire(OWNER, { lockPath, pid: process.pid, pidStartedAt: NOW, sweep: false })).toBe('acquired')
      expect(handBackToClaimant(OWNER, readClaim(claimPath), { lockPath, now: 555 })).toEqual({
        released: true,
        stamped: true,
      })
      expect(existsSync(lockPath)).toBe(false)
      expect(readClaim(claimPath)).toMatchObject({ releasedAt: 555, releasedBy: OWNER })
    })
  })

  it('stamps NOTHING when the lock names somebody else — no release, no promise', () => {
    withState(({ lockPath, claimPath }) => {
      acquire('some-other-session', { lockPath, pid: process.pid, pidStartedAt: NOW, sweep: false })
      expect(handBackToClaimant(OWNER, readClaim(claimPath), { lockPath, now: 555 })).toEqual({
        released: false,
        stamped: false,
      })
      // The other session's lock is untouched, and the claim still reads as
      // PENDING rather than as one that is waiting to be picked up.
      expect(JSON.parse(readFileSync(lockPath, 'utf8')).sessionId).toBe('some-other-session')
      expect(readClaim(claimPath).releasedAt).toBe(undefined)
      expect(describeClaim(asOwner(readClaim(claimPath)))).not.toContain('already released')
    })
  })

  it('stamps NOTHING when there is no lock left to release', () => {
    withState(({ lockPath, claimPath }) => {
      expect(existsSync(lockPath)).toBe(false)
      expect(handBackToClaimant(OWNER, readClaim(claimPath), { lockPath })).toEqual({
        released: false,
        stamped: false,
      })
      expect(readClaim(claimPath).releasedAt).toBe(undefined)
    })
  })
})

// ---------------------------------------------------------------------------
// FINDING 3 (28.07.2026) applied to the new state file: the claim is a SIBLING of
// the lock, so a test that redirects the lock can never reach the live batch.
describe('the claim file is derived from the caller’s lock path', () => {
  it('is a sibling of the given lock and never the repo default', () => {
    const base = join(tmpdir(), 'hoa-claim-paths')
    const p = statePathsFor(join(base, 'batch-lock.json'))
    expect(resolve(p.claimPath)).toBe(resolve(base, basename(p.claimPath)))
    expect(resolve(p.claimPath).startsWith(resolve(REPO_ROOT))).toBe(false)
    expect(p.claimPath).not.toBe(CLAIM_PATH)
    expect(statePathsFor(LOCK_PATH).claimPath).toBe(CLAIM_PATH)
  })

  it('reads and writes ONLY inside the given base dir — the repo .claude/ is untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-claim-'))
    const lockPath = join(dir, 'batch-lock.json')
    const path = statePathsFor(lockPath).claimPath
    const repoBefore = existsSync(CLAIM_PATH) ? readFileSync(CLAIM_PATH, 'utf8') : null
    try {
      // A REAL probe of this very process, start time included — the round trip
      // exercises the identity check as well as the paths.
      const self = probePid(process.pid)
      writeClaim({ v: 1, sessionId: CLAIMANT, pid: process.pid, pidStartedAt: self.startedAt, at: Date.now() }, path)
      expect(readClaim(path)).toMatchObject({ sessionId: CLAIMANT })
      // Asked by a DIFFERENT session (the night owner): this process is alive, so
      // the claim is honoured and the owner must release.
      expect(gatherClaim(OWNER, { lockPath, ownerLock: null })).toMatchObject({ honour: true, claimantSid: CLAIMANT })
      // Asked by the claimant itself: its own claim, never a reason to release.
      expect(gatherClaim(CLAIMANT, { lockPath, ownerLock: null })).toMatchObject({ honour: false, mine: true })
      expect(markClaimReleased(readClaim(path), { path, now: 123, by: OWNER })).toBe(true)
      expect(readClaim(path)).toMatchObject({ releasedAt: 123, releasedBy: OWNER })
      clearClaim(path)
      expect(readClaim(path)).toBe(null)
      expect(gatherClaim(OWNER, { lockPath, ownerLock: null })).toMatchObject({ honour: false, reason: 'no-claim' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    const repoAfter = existsSync(CLAIM_PATH) ? readFileSync(CLAIM_PATH, 'utf8') : null
    expect(repoAfter).toBe(repoBefore)
  })

  // Not cosmetic. batch-doctor repairs a suspect tree with `git stash push -u`,
  // which sweeps up UNTRACKED files — so a claim the repository does not ignore is
  // silently stashed away mid-handover, exactly at the moment the user is trying
  // to take the batch back. Every sibling state file is ignored; this one must be
  // too, with the same `.tmp-*` pattern the atomic write leaves behind.
  it('is ignored by the repository like every sibling state file', () => {
    const ignore = readFileSync(resolve(REPO_ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim())
    for (const entry of [
      '.claude/batch-claim.json',
      '.claude/batch-claim.json.tmp-*',
      // the siblings, so a rewrite of the block cannot quietly drop the family
      '.claude/batch-lock.json',
      '.claude/batch-boundary.json',
      '.claude/batch-in-flight.json',
    ]) {
      expect(ignore, `${entry} must be in .gitignore`).toContain(entry)
    }
  })

  it('takes the maximum age from the environment when one is set', () => {
    expect(maxAgeMs({})).toBe(CLAIM_MAX_AGE_MS)
    expect(maxAgeMs({ HOA_CLAIM_MAX_MIN: '10' })).toBe(10 * 60 * 1000)
    expect(maxAgeMs({ HOA_CLAIM_MAX_MIN: 'nonsense' })).toBe(CLAIM_MAX_AGE_MS)
    expect(maxAgeMs({ HOA_CLAIM_MAX_MIN: '-5' })).toBe(CLAIM_MAX_AGE_MS)
  })
})
