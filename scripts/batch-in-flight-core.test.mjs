// DECLARING WORK THAT IS IN FLIGHT (point 388, fifth live finding 28.07.2026),
// pinned. The mechanism has exactly one job — tell WAITING apart from IDLING —
// and exactly one way to fail: letting an idle session through. Every case below
// is therefore written from the failure side first:
//   · a declaration only holds while a PROBE still confirms the work is MOVING —
//     EXISTENCE IS NOT EVIDENCE (four-eyes review): a dead or REUSED pid, a
//     branch with no recent commit, a quiet worktree, a silent log and an unknown
//     kind all block. ~94 `feat/*` branches live in this repository, many days
//     old, so "the branch is there" would have been a permanent yes;
//   · it holds only for its OWN session, by the lock's own identity rules;
//   · it EXPIRES, and past that nothing it says matters;
//   · with none declared, the guard behaves exactly as it did before;
//   · and nothing here may touch the repository's .claude/ (finding 3).
import { describe, it, expect } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  IN_FLIGHT_MAX_AGE_MS,
  LAUNCHER_WORK_MAX_AGE_MS,
  LOG_FRESH_MS,
  WORK_FRESH_MS,
  assessInFlight,
  assessOwnerWork,
  checkEvidence,
  describeInFlight,
  selfReferentialEvidence,
} from './batch-in-flight-core.mjs'
import {
  assessOwner,
  progressGuardDecision,
  spawnDecision,
  statePathsFor,
  probePid,
  LOCK_PATH,
  IN_FLIGHT_PATH,
  LAUNCHER_TICK_MS,
  PID_START_TOLERANCE_MS,
  WEDGED_MS,
  WORK_STALL_MS,
} from './batch-singleton.mjs'
import { gatherInFlight, maxAgeMs, readDeclaration, writeDeclaration, clearDeclaration } from './batch-in-flight.mjs'

const NOW = 1_785_100_000_000
const SID = 'session-owner'
const PID = 4242
const PID_STARTED = NOW - 3_600_000
const RUN_PID = 9001
const RUN_STARTED = NOW - 600_000

const alive = () => ({ exists: true, startedAt: RUN_STARTED })
const dead = () => ({ exists: false, startedAt: null })

const probes = (over = {}) => ({
  probePid: () => alive(),
  refTipAt: () => NOW - 60_000,
  worktreeActiveAt: () => NOW - 60_000,
  mtimeOf: () => NOW - 1000,
  ...over,
})

const declaration = (over = {}) => ({
  v: 1,
  sessionId: SID,
  pid: PID,
  pidStartedAt: PID_STARTED,
  at: NOW - 5 * 60 * 1000,
  waitingOn: 'three delegated agents and the browser suite',
  evidence: [
    { kind: 'branch', ref: 'feat/389-a', label: 'agent 389' },
    { kind: 'pid', pid: RUN_PID, startedAt: RUN_STARTED, label: 'test:large' },
  ],
  ...over,
})

const assess = (over = {}, probeOver = {}) =>
  assessInFlight({ declaration: declaration(over), sid: SID, now: NOW, ...probes(probeOver) })

// ---------------------------------------------------------------------------
describe('checkEvidence — every kind is answered by a probe, never by the claim', () => {
  const pidItem = (over = {}) => ({ kind: 'pid', pid: 77, startedAt: RUN_STARTED, ...over })

  it('a pid counts only while the process is really alive', () => {
    expect(checkEvidence(pidItem(), { now: NOW, probePid: () => alive() }).ok).toBe(true)
    expect(checkEvidence(pidItem(), { now: NOW, probePid: () => dead() })).toMatchObject({
      ok: false,
      detail: 'process-gone',
    })
  })

  it('a REUSED pid does not count — the start time is what makes it an identity', () => {
    const reused = () => ({ exists: true, startedAt: RUN_STARTED + PID_START_TOLERANCE_MS + 1 })
    expect(checkEvidence(pidItem(), { now: NOW, probePid: reused })).toMatchObject({
      ok: false,
      detail: 'pid-reused',
    })
    // …while a jitter inside the tolerance is still the same process.
    const jittered = () => ({ exists: true, startedAt: RUN_STARTED + PID_START_TOLERANCE_MS - 1 })
    expect(checkEvidence(pidItem(), { now: NOW, probePid: jittered }).ok).toBe(true)
  })

  it('a pid with no recorded or no probeable start time never counts', () => {
    expect(checkEvidence(pidItem({ startedAt: undefined }), { now: NOW, probePid: () => alive() })).toMatchObject({
      ok: false,
      detail: 'no-start-time',
    })
    expect(
      checkEvidence(pidItem(), { now: NOW, probePid: () => ({ exists: true, startedAt: null }) }),
    ).toMatchObject({ ok: false, detail: 'start-time-unverifiable' })
  })

  it('rejects a pid that is not one, without asking the probe', () => {
    for (const pid of [0, -1, 'x', undefined, null]) {
      expect(
        checkEvidence(
          { kind: 'pid', pid, startedAt: RUN_STARTED },
          {
            now: NOW,
            probePid: () => {
              throw new Error('must not be probed')
            },
          },
        ).ok,
      ).toBe(false)
    }
  })

  it('a branch counts only while its TIP is recent — an old branch that merely exists does not', () => {
    const branch = { kind: 'branch', ref: 'feat/1-x' }
    expect(checkEvidence(branch, { now: NOW, refTipAt: () => NOW - 60_000 }).ok).toBe(true)
    // THE HOLE THE REVIEW FOUND: ~94 branches exist in this repository, many of
    // them days old. Existing is not running.
    expect(
      checkEvidence(branch, { now: NOW, refTipAt: () => NOW - 3 * 24 * 3600 * 1000 }),
    ).toMatchObject({ ok: false, detail: expect.stringContaining('no commit for') })
    expect(checkEvidence(branch, { now: NOW, refTipAt: () => NOW - WORK_FRESH_MS - 1 }).ok).toBe(false)
    expect(checkEvidence(branch, { now: NOW, refTipAt: () => NOW - WORK_FRESH_MS }).ok).toBe(true)
    expect(checkEvidence(branch, { now: NOW, refTipAt: () => null })).toMatchObject({
      ok: false,
      detail: 'branch-gone',
    })
    expect(checkEvidence({ kind: 'branch', ref: '  ' }, { now: NOW, refTipAt: () => NOW }).ok).toBe(false)
  })

  it('a worktree counts only while git ACTIVITY in it is recent, not while the directory sits there', () => {
    const wt = { kind: 'worktree', path: '/tmp/w' }
    expect(checkEvidence(wt, { now: NOW, worktreeActiveAt: () => NOW - 60_000 }).ok).toBe(true)
    expect(checkEvidence(wt, { now: NOW, worktreeActiveAt: () => NOW - WORK_FRESH_MS - 1 })).toMatchObject({
      ok: false,
      detail: expect.stringContaining('quiet for'),
    })
    expect(checkEvidence(wt, { now: NOW, worktreeActiveAt: () => null })).toMatchObject({
      ok: false,
      detail: 'worktree-gone',
    })
  })

  it('lets a per-item window tighten the branch/worktree default too', () => {
    const recent = NOW - 10 * 60 * 1000
    expect(checkEvidence({ kind: 'branch', ref: 'r' }, { now: NOW, refTipAt: () => recent }).ok).toBe(true)
    expect(
      checkEvidence({ kind: 'branch', ref: 'r', freshMs: 60_000 }, { now: NOW, refTipAt: () => recent }).ok,
    ).toBe(false)
  })

  it('a log counts only while it is still being WRITTEN to', () => {
    const fresh = { now: NOW, mtimeOf: () => NOW - 60_000 }
    const stale = { now: NOW, mtimeOf: () => NOW - LOG_FRESH_MS - 1 }
    expect(checkEvidence({ kind: 'log', path: 'a.log' }, fresh).ok).toBe(true)
    expect(checkEvidence({ kind: 'log', path: 'a.log' }, stale).ok).toBe(false)
    expect(checkEvidence({ kind: 'log', path: 'a.log' }, { now: NOW, mtimeOf: () => null })).toMatchObject({
      ok: false,
      detail: 'log-missing',
    })
    // A per-item window may TIGHTEN or widen the default, and is respected.
    expect(checkEvidence({ kind: 'log', path: 'a.log', freshMs: 30_000 }, fresh).ok).toBe(false)
  })

  it('an unknown kind never passes — an unanswerable claim is not evidence', () => {
    expect(checkEvidence({ kind: 'vibes', label: 'it is surely running' }, { now: NOW })).toMatchObject({
      ok: false,
      detail: 'unknown-kind',
    })
    expect(checkEvidence(null, { now: NOW }).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('assessInFlight — a fresh declaration with live evidence, and every way it stops holding', () => {
  it('holds while it is fresh and ALL of its evidence checks out', () => {
    const a = assess()
    expect(a).toMatchObject({ live: true, reason: 'live' })
    expect(a.summary).toContain('branch feat/389-a')
    expect(a.summary).toContain('pid 9001')
    expect(describeInFlight(a, declaration())).toContain('three delegated agents')
  })

  it('BLOCKS past the maximum age, however live the evidence looks', () => {
    const a = assess({ at: NOW - IN_FLIGHT_MAX_AGE_MS - 1 })
    expect(a.live).toBe(false)
    expect(a.reason).toBe('expired')
    // …and the boundary of the window itself still holds (no off-by-one gap).
    expect(assess({ at: NOW - IN_FLIGHT_MAX_AGE_MS }).live).toBe(true)
  })

  it('honours a caller-supplied maximum age (the calibratable knob)', () => {
    const short = assessInFlight({
      declaration: declaration({ at: NOW - 10 * 60 * 1000 }),
      sid: SID,
      now: NOW,
      maxAgeMs: 5 * 60 * 1000,
      ...probes(),
    })
    expect(short).toMatchObject({ live: false, reason: 'expired' })
  })

  it('BLOCKS when a declared background process has died', () => {
    const a = assess({}, { probePid: () => dead() })
    expect(a).toMatchObject({ live: false, reason: 'evidence-gone' })
    expect(a.summary).toContain('process-gone')
  })

  it('BLOCKS when a declared branch is gone', () => {
    expect(assess({}, { refTipAt: () => null })).toMatchObject({ live: false, reason: 'evidence-gone' })
  })

  it('BLOCKS on a branch that still EXISTS but has not been committed to — the review’s one real hole', () => {
    const a = assess({}, { refTipAt: () => NOW - 2 * 24 * 3600 * 1000 })
    expect(a).toMatchObject({ live: false, reason: 'evidence-gone' })
    expect(a.summary).toContain('no commit for')
  })

  it('BLOCKS on a worktree directory that still EXISTS but has gone quiet', () => {
    const a = assessInFlight({
      declaration: declaration({ evidence: [{ kind: 'worktree', path: '/w/agent-1' }] }),
      sid: SID,
      now: NOW,
      ...probes({ worktreeActiveAt: () => NOW - WORK_FRESH_MS - 1 }),
    })
    expect(a).toMatchObject({ live: false, reason: 'evidence-gone' })
    expect(a.summary).toContain('quiet for')
  })

  it('BLOCKS when the declared pid was REUSED by a different process', () => {
    const a = assess({}, { probePid: () => ({ exists: true, startedAt: RUN_STARTED + 60_000 }) })
    expect(a).toMatchObject({ live: false, reason: 'evidence-gone' })
    expect(a.summary).toContain('pid-reused')
  })

  it('BLOCKS when ONE of several declared items has finished — all of it must hold', () => {
    const three = declaration({
      evidence: [
        { kind: 'branch', ref: 'feat/389-a', label: 'agent 389-a' },
        { kind: 'branch', ref: 'feat/390-b', label: 'agent 390-b' },
        { kind: 'branch', ref: 'feat/391-c', label: 'agent 391-c' },
      ],
    })
    const a = assessInFlight({
      declaration: three,
      sid: SID,
      now: NOW,
      // Agent 390 committed last an hour ago: it is done, stuck or gone.
      ...probes({ refTipAt: (r) => (r === 'feat/390-b' ? NOW - 3600_000 : NOW - 60_000) }),
    })
    expect(a).toMatchObject({ live: false, reason: 'evidence-gone' })
    expect(a.summary).toContain('feat/390-b (agent 390-b) — no commit for 60 min')
  })

  it('BLOCKS a declaration with no evidence at all — and one that is not a declaration', () => {
    expect(assess({ evidence: [] })).toMatchObject({ live: false, reason: 'no-evidence' })
    expect(assess({ evidence: 'the agents' })).toMatchObject({ live: false, reason: 'no-evidence' })
    expect(assessInFlight({ declaration: null, sid: SID, now: NOW })).toMatchObject({
      live: false,
      reason: 'no-declaration',
    })
    expect(assessInFlight({ declaration: { sessionId: SID }, sid: SID, now: NOW })).toMatchObject({
      live: false,
      reason: 'malformed',
    })
  })

  it('BLOCKS a declaration stamped in the future — an unreadable clock is not a licence', () => {
    expect(assess({ at: NOW + 60_000 })).toMatchObject({ live: false, reason: 'clock-skew' })
  })
})

// ---------------------------------------------------------------------------
describe('assessInFlight — only the session that wrote it, by the lock’s own identity rules', () => {
  it('IGNORES a declaration written by another session', () => {
    const a = assessInFlight({ declaration: declaration(), sid: 'session-other', now: NOW, ...probes() })
    expect(a.live).toBe(false)
    expect(a.reason).toBe('not-mine:process-unknown')
  })

  it('IGNORES it for a second window — same lock file, a different claude process', () => {
    const a = assessInFlight({
      declaration: declaration(),
      sid: 'session-other',
      ancestor: { pid: 9999, startedAt: PID_STARTED },
      now: NOW,
      ...probes(),
    })
    expect(a).toMatchObject({ live: false, reason: 'not-mine:other-process' })
  })

  it('IGNORES it when the pid was REUSED by a different process', () => {
    const a = assessInFlight({
      declaration: declaration(),
      sid: 'session-other',
      ancestor: { pid: PID, startedAt: PID_STARTED + 10_000 },
      now: NOW,
      ...probes(),
    })
    expect(a).toMatchObject({ live: false, reason: 'not-mine:pid-reused' })
  })

  it('still holds after a COMPACTION renamed the session id under the same process', () => {
    const a = assessInFlight({
      declaration: declaration(),
      sid: 'session-compacted',
      ancestor: { pid: PID, startedAt: PID_STARTED },
      now: NOW,
      ...probes(),
    })
    expect(a).toMatchObject({ live: true, reason: 'live' })
  })
})

// ---------------------------------------------------------------------------
describe('progressGuardDecision — the declaration relaxes the two unsatisfiable blocks and nothing else', () => {
  const base = { sid: SID, paused: false, openCount: 5, formatSuspect: false, ownership: 'mine', unhandledAlert: false }

  it('without a declaration NOTHING changes — the block and the boundary path read exactly as before', () => {
    expect(progressGuardDecision({ ...base })).toBe('block-continue')
    expect(progressGuardDecision({ ...base, inFlight: false })).toBe('block-continue')
    expect(progressGuardDecision({ ...base, boundaryDue: 388 })).toBe('block-take-boundary')
    expect(progressGuardDecision({ ...base, boundary: { valid: true, point: 388 }, launcher: 'armed' })).toBe(
      'allow-boundary',
    )
    expect(progressGuardDecision({ ...base, boundary: { valid: true, point: 388 }, launcher: 'disabled' })).toBe(
      'block-launcher',
    )
  })

  it('ALLOWS the stop while declared work runs — that is the eight-blocks-in-a-row case', () => {
    expect(progressGuardDecision({ ...base, inFlight: true })).toBe('allow-in-flight')
  })

  it('also passes the DUE boundary — ending mid-flight would throw the agents’ work away', () => {
    expect(progressGuardDecision({ ...base, inFlight: true, boundaryDue: 388 })).toBe('allow-in-flight')
  })

  it('never overrides a parallel-session alert — remediation cannot wait on an agent', () => {
    expect(progressGuardDecision({ ...base, inFlight: true, unhandledAlert: true })).toBe('block-remediate')
  })

  it('never overrides a TAKEN boundary or an unarmed launcher', () => {
    const boundary = { valid: true, point: 388 }
    expect(progressGuardDecision({ ...base, inFlight: true, boundary, launcher: 'armed' })).toBe('allow-boundary')
    expect(progressGuardDecision({ ...base, inFlight: true, boundary, launcher: 'disabled' })).toBe('block-launcher')
  })

  it('never conscripts or excuses a session that does not own the batch', () => {
    expect(progressGuardDecision({ ...base, inFlight: true, ownership: 'held' })).toBe('stand-down')
    expect(progressGuardDecision({ ...base, inFlight: true, sid: '' })).toBe('stand-down')
  })

  it('never reads a truthy non-true value as a declaration', () => {
    for (const v of ['yes', 1, {}, []]) {
      expect(progressGuardDecision({ ...base, inFlight: v })).toBe('block-continue')
    }
  })
})

// ---------------------------------------------------------------------------
// FINDING 3 (28.07.2026) applied to the new state file: the marker is a SIBLING
// of the lock, so a test that redirects the lock can never reach the live batch.
describe('the declaration file is derived from the caller’s lock path', () => {
  it('is a sibling of the given lock and never the repo default', () => {
    const base = join(tmpdir(), 'hoa-in-flight-paths')
    const p = statePathsFor(join(base, 'batch-lock.json'))
    expect(resolve(p.inFlightPath)).toBe(resolve(base, basename(p.inFlightPath)))
    expect(resolve(p.inFlightPath).startsWith(resolve(REPO_ROOT))).toBe(false)
    expect(p.inFlightPath).not.toBe(IN_FLIGHT_PATH)
    // …while the repo default itself stays part of the one family.
    expect(statePathsFor(LOCK_PATH).inFlightPath).toBe(IN_FLIGHT_PATH)
  })

  it('reads and writes ONLY inside the given base dir — the repo .claude/ is untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-in-flight-'))
    const lockPath = join(dir, 'batch-lock.json')
    const path = statePathsFor(lockPath).inFlightPath
    const repoBefore = existsSync(IN_FLIGHT_PATH) ? readFileSync(IN_FLIGHT_PATH, 'utf8') : null
    try {
      // A REAL probe of this very process, start time included — the round trip
      // therefore exercises the identity check as well as the paths.
      const self = probePid(process.pid)
      const d = declaration({
        at: Date.now(),
        evidence: [{ kind: 'pid', pid: process.pid, startedAt: self.startedAt, label: 'this test' }],
      })
      writeDeclaration(d, path)
      expect(readDeclaration(path)).toMatchObject({ sessionId: SID })
      // The real gather, real probe: this process is alive, so the wait holds.
      expect(gatherInFlight(SID, { lockPath })).toMatchObject({ live: true, reason: 'live' })
      clearDeclaration(path)
      expect(readDeclaration(path)).toBe(null)
      expect(gatherInFlight(SID, { lockPath })).toMatchObject({ live: false, reason: 'no-declaration' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    const repoAfter = existsSync(IN_FLIGHT_PATH) ? readFileSync(IN_FLIGHT_PATH, 'utf8') : null
    expect(repoAfter).toBe(repoBefore)
  })

  it('takes the maximum age from the environment when one is set', () => {
    expect(maxAgeMs({})).toBe(IN_FLIGHT_MAX_AGE_MS)
    expect(maxAgeMs({ HOA_IN_FLIGHT_MAX_MIN: '20' })).toBe(20 * 60 * 1000)
    expect(maxAgeMs({ HOA_IN_FLIGHT_MAX_MIN: 'nonsense' })).toBe(IN_FLIGHT_MAX_AGE_MS)
    expect(maxAgeMs({ HOA_IN_FLIGHT_MAX_MIN: '-5' })).toBe(IN_FLIGHT_MAX_AGE_MS)
  })
})

// ---------------------------------------------------------------------------
// THE LAUNCHER'S QUESTION, WHICH IS NOT THE GUARD'S (point 402, 28.07.2026).
//
// `assessInFlight` decides whether a session may end its turn, so it demands that
// ALL the declared work still holds. The launcher decides whether a silent owner
// is working or wedged, and for that the right question is whether ANY of it is
// still moving: a session with three agents out and two of them finished is
// plainly alive, and shooting it is what killed four sessions in one afternoon.
describe('assessOwnerWork — is the OWNER’s declared work still advancing?', () => {
  const lock = (over = {}) => ({ sessionId: SID, claimedAt: NOW - 40 * 60_000, pid: PID, pidStartedAt: PID_STARTED, ...over })
  const work = (declOver = {}, probeOver = {}, over = {}) =>
    assessOwnerWork({ declaration: declaration(declOver), lock: lock(), now: NOW, ...probes(probeOver), ...over })

  it('a branch tip that moved inside the window is PROGRESS', () => {
    expect(work()).toMatchObject({ declared: true, advancing: true, reason: 'advancing' })
  })

  it('ONE live piece is enough — a finished agent beside a running one is not a stall', () => {
    // The pid has exited (that agent is done); the branch still commits.
    expect(work({}, { probePid: () => dead() })).toMatchObject({ advancing: true })
    // …whereas the guard, asking its own stricter question, blocks on exactly this.
    expect(assess({}, { probePid: () => dead() })).toMatchObject({ live: false, reason: 'evidence-gone' })
  })

  it('every probe silent → NOT advancing, and the summary names what went quiet', () => {
    const a = work({}, { probePid: () => dead(), refTipAt: () => NOW - 60 * 60_000 })
    expect(a).toMatchObject({ declared: true, advancing: false, reason: 'no-progress' })
    expect(a.summary).toMatch(/no commit for 60 min/)
    expect(a.summary).toMatch(/process-gone/)
  })

  it('work that NO PROBE CAN ANSWER is treated as no evidence, never as proof', () => {
    const a = work({ evidence: [{ kind: 'vibes', label: 'the agent is surely fine' }] })
    expect(a).toMatchObject({ advancing: false, reason: 'unanswerable' })
    // …and an unanswerable item neither blocks nor carries an answerable one: the
    // decision is made on what CAN be checked.
    const mixed = work({ evidence: [{ kind: 'vibes' }, { kind: 'branch', ref: 'feat/389-a' }] })
    expect(mixed).toMatchObject({ advancing: true, reason: 'advancing' })
  })

  it('an empty or malformed declaration says nothing', () => {
    expect(work({ evidence: [] })).toMatchObject({ advancing: false, reason: 'no-evidence' })
    expect(assessOwnerWork({ declaration: null, lock: lock(), now: NOW })).toMatchObject({ reason: 'no-declaration' })
    expect(assessOwnerWork({ declaration: { sessionId: SID }, lock: lock(), now: NOW })).toMatchObject({
      reason: 'no-declaration',
    })
    expect(assessOwnerWork({ declaration: declaration(), lock: null, now: NOW })).toMatchObject({ reason: 'no-lock' })
  })

  it('only the LOCK OWNER’s declaration counts — a stranger’s proves nothing', () => {
    const a = assessOwnerWork({
      declaration: declaration({ sessionId: 'someone-else', pid: 5, pidStartedAt: 1 }),
      lock: lock(),
      now: NOW,
      ...probes(),
    })
    expect(a.advancing).toBe(false)
    expect(a.reason).toMatch(/^not-owners:/)
  })

  it('…but a session id renamed by a COMPACTION still owns it, resolved on the process', () => {
    const a = assessOwnerWork({
      declaration: declaration({ sessionId: 'pre-compaction' }),
      lock: lock({ sessionId: 'post-compaction' }),
      now: NOW,
      ...probes(),
    })
    expect(a).toMatchObject({ advancing: true, declared: true })
  })

  it('AN AGED DECLARATION STILL PROVES PROGRESS, but no longer licenses a stall verdict', () => {
    // The asymmetry is the whole design: evidence recency decides "is it moving"
    // (an agent that is still committing is still building, whatever the
    // paperwork's timestamp says), while only a CURRENT declaration may tighten
    // the wedge bound — a stale one says nothing about what the session is doing
    // now, and it may well be inside one long verification run.
    const old = { at: NOW - LAUNCHER_WORK_MAX_AGE_MS - 60_000 }
    expect(work(old)).toMatchObject({ advancing: true, declared: false })
    expect(work(old, { probePid: () => dead(), refTipAt: () => null })).toMatchObject({
      advancing: false,
      declared: false,
      reason: 'expired',
    })
  })

  it('a declaration from the FUTURE is a clock this cannot reason about → not current', () => {
    expect(work({ at: NOW + 60_000 })).toMatchObject({ declared: false })
  })

  it('the declaration TIMESTAMP is passed through, so the launcher can ask whose last word it was', () => {
    // `assessOwner` needs it for the second question (four-eyes finding 1.1): a
    // heartbeat NEWER than the declaration proves the session went on working
    // after declaring, which makes the declaration leftover paperwork.
    const at = NOW - 7 * 60_000
    expect(work({ at })).toMatchObject({ declaredAt: at })
    expect(work({ at, evidence: [] })).toMatchObject({ declaredAt: at, reason: 'no-evidence' })
    expect(work({ at, evidence: [{ kind: 'vibes' }] })).toMatchObject({ declaredAt: at, reason: 'unanswerable' })
    // Nothing to time-stamp → null, never a fabricated moment.
    expect(assessOwnerWork({ declaration: null, lock: lock(), now: NOW }).declaredAt).toBe(null)
    expect(assessOwnerWork({ declaration: declaration(), lock: null, now: NOW }).declaredAt).toBe(null)
  })
})

// ---------------------------------------------------------------------------
// THE STALL VERDICT MUST BE REACHABLE — AND REACHABLE BY A LAUNCHER THAT ONLY
// LOOKS EVERY FIFTEEN MINUTES (second four-eyes review, 28.07.2026, finding A).
//
// `work-stalled` was DEAD CODE in production, and every unit test above it was
// green, because those tests hand a `work` object straight to `assessOwner` —
// `{ declared: true, declaredAt: heartbeat - 1000 }` at an age of 91 minutes,
// which is a shape `assessOwnerWork` cannot produce. Three constants made it
// impossible: a declaration stopped counting as `declared` at 45 minutes, the
// stall bound needed 90 minutes of heartbeat silence, and `lastWord` demanded the
// heartbeat land within two minutes of the declaration — which pins the two ages
// to the SAME number. It cannot be above 90 and below 45 at once.
//
// So this block refuses hand-crafted `work` objects entirely. It builds ONE frozen
// declaration, ONE lock whose heartbeat is the declare command's own PostToolUse,
// and drives the REAL pipeline — `assessOwnerWork` → `assessOwner` — minute by
// minute across five hours, exactly as the launcher does on each tick.
describe('assessOwnerWork → assessOwner: a totally frozen session really is read as stalled', () => {
  const T0 = NOW - 6 * 60 * 60 * 1000 // the moment everything stopped
  const OWNER_PID = 7777
  const OWNER_STARTED = T0 - 30 * 60_000
  const BOOT = T0 - 24 * 60 * 60 * 1000

  // The declare CLI is itself a tool call, so its PostToolUse heartbeat lands
  // seconds after `declaration.at` and nothing follows it. THIS is what a real
  // stall looks like — and it is the shape the old tests could not express.
  const DECLARED_AT = T0
  const CLAIMED_AT = DECLARED_AT + 5000

  const lock = (over = {}) => ({
    sessionId: SID,
    claimedAt: CLAIMED_AT,
    pid: OWNER_PID,
    pidStartedAt: OWNER_STARTED,
    ...over,
  })
  const ownerProbe = { exists: true, startedAt: OWNER_STARTED }
  const frozen = {
    v: 1,
    sessionId: SID,
    pid: OWNER_PID,
    pidStartedAt: OWNER_STARTED,
    at: DECLARED_AT,
    waitingOn: 'the delegated agent for point 402',
    evidence: [
      { kind: 'branch', ref: 'feat/402-progress-not-age', label: 'the agent' },
      { kind: 'worktree', path: 'C:/repo/.claude/worktrees/agent-402', label: 'the agent' },
    ],
  }
  // Everything the declaration names went quiet three minutes BEFORE the freeze
  // and never moves again. The owner's own process stays alive throughout — that
  // is the whole difficulty: a wedged session looks exactly like a working one.
  const dead = {
    probePid: () => ({ exists: true, startedAt: OWNER_STARTED }),
    refTipAt: () => T0 - 3 * 60_000,
    worktreeActiveAt: () => T0 - 3 * 60_000,
    mtimeOf: () => T0 - 3 * 60_000,
  }

  /** One launcher tick, driven end to end. No `work` object is ever written here. */
  const tick = (minute, { lockOver = {}, probes = dead, ...over } = {}) => {
    const now = T0 + minute * 60_000
    const l = lock(lockOver)
    const work = assessOwnerWork({ declaration: frozen, lock: l, now, ...probes, ...over })
    return { work, verdict: assessOwner(l, { now, bootTime: BOOT, probe: ownerProbe, work }) }
  }
  /** Every minute of the first five hours at which the launcher would say "stalled". */
  const stalledMinutes = (opts = {}) => {
    const out = []
    for (let m = 0; m <= 300; m++) if (tick(m, opts).verdict.reason === 'work-stalled') out.push(m)
    return out
  }

  it('IS REACHABLE AT ALL — the freeze is caught, and near the stall bound, not hours later', () => {
    const hits = stalledMinutes()
    expect(hits.length, 'work-stalled never fires on the real pipeline — the feature is dead code').toBeGreaterThan(0)
    // First fire at the stall bound (the heartbeat trails the declaration by 5 s,
    // so it crosses one minute later), and long before the four-hour valve.
    expect(hits[0]).toBe(Math.round(WORK_STALL_MS / 60_000) + 1)
    expect(hits[0] * 60_000).toBeLessThan(WEDGED_MS)
    const t = tick(hits[0])
    expect(t.verdict).toMatchObject({ alive: true, wedged: true, reason: 'work-stalled' })
    expect(spawnDecision(t.verdict)).toBe('skip-wedged')
    // The launcher can say WHAT froze, not merely that something did.
    expect(t.work.summary).toMatch(/feat\/402-progress-not-age/)
    expect(t.work).toMatchObject({ declared: true, advancing: false, declaredAt: DECLARED_AT })
  })

  it('…AND REACHABLE ON A 15-MINUTE TICK: no phase of the schedule can step over the band', () => {
    // Non-empty is not the same as reachable. `WORK_STALL_MS +
    // WORK_DECLARATION_TOLERANCE_MS` — the minimum that makes the window exist —
    // opens a band barely two minutes wide, and the launcher looks once per
    // LAUNCHER_TICK_MS: seven schedules in eight would miss it and fall through to
    // the four-hour valve, which IS the reported bug. So every possible phase of
    // the tick schedule must hit the band.
    const hits = new Set(stalledMinutes())
    const tickMin = Math.round(LAUNCHER_TICK_MS / 60_000)
    for (let phase = 0; phase < tickMin; phase++) {
      const seen = []
      for (let m = phase; m <= 300; m += tickMin) if (hits.has(m)) seen.push(m)
      expect(seen.length, `a launcher ticking at phase ${phase} min never sees the stall`).toBeGreaterThan(0)
    }
    // Stated as the invariant, so a future narrowing of the window fails here too.
    expect(LAUNCHER_WORK_MAX_AGE_MS - WORK_STALL_MS).toBeGreaterThanOrEqual(2 * LAUNCHER_TICK_MS)
  })

  it('THE REGRESSION WITNESS: asked with the GUARD’s window, the same freeze is never stalled', () => {
    // This is the bug, reproduced. `IN_FLIGHT_MAX_AGE_MS` is the right answer to
    // the guard's question ("may a turn end ride on this?") and the wrong one to
    // the launcher's, and asking it here silently disabled the feature.
    expect(stalledMinutes({ maxAgeMs: IN_FLIGHT_MAX_AGE_MS })).toEqual([])
    expect(LAUNCHER_WORK_MAX_AGE_MS).toBeGreaterThan(IN_FLIGHT_MAX_AGE_MS)
  })

  it('a healthy wait is still never accused, however long the agent takes', () => {
    // Same aging paperwork, but the agent keeps committing: its branch tip is
    // always a minute old, so not one of the five hours' ticks accuses it.
    const reasons = new Set()
    for (let m = 0; m <= 300; m++) {
      const now = T0 + m * 60_000
      reasons.add(tick(m, { probes: { ...dead, refTipAt: () => now - 60_000 } }).verdict.reason)
    }
    expect(reasons).toEqual(new Set(['fresh-heartbeat', 'work-advancing']))
  })

  it('and a heartbeat that POSTDATES the declaration still disarms the verdict entirely', () => {
    // The replayed near-kill: declare, agent finishes, merge, start a LARGE
    // regression without clearing the declaration. `lastWord` — not the age cap —
    // is what protects that session, which is why widening the age cap is safe.
    expect(stalledMinutes({ lockOver: { claimedAt: DECLARED_AT + 12 * 60_000 } })).toEqual([])
  })

  it('and no evidence may revive a DEAD process, whatever the paperwork says', () => {
    const now = T0 + 120 * 60_000
    const l = lock()
    const work = assessOwnerWork({ declaration: frozen, lock: l, now, ...dead, refTipAt: () => now - 60_000 })
    expect(work.advancing).toBe(true)
    const v = assessOwner(l, { now, bootTime: BOOT, probe: { exists: false, startedAt: null }, work })
    expect(v).toMatchObject({ alive: false, reason: 'pid-dead' })
  })
})

// ---------------------------------------------------------------------------
// EVIDENCE THAT CANNOT GO QUIET (four-eyes review 28.07.2026, finding 1.2).
// Recency made existence-only evidence honest, but nothing restricted WHAT may
// be named — and a declaration naming something eternally fresh suppressed BOTH
// the wedge verdict and the silent-owner notification, leaving the session less
// observed than declaring nothing at all.
describe('selfReferentialEvidence (what may never be declared)', () => {
  const ROOT = 'C:/Users/x/repo'

  it('refuses the repo root as a worktree — the session’s own git commands keep it fresh', () => {
    const found = selfReferentialEvidence({
      evidence: [{ kind: 'worktree', path: ROOT }],
      repoRoot: ROOT,
      currentBranch: 'main',
    })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: 'worktree' })
    expect(found[0].why).toMatch(/this checkout itself/)
  })

  it('…however it is spelled: separators, trailing slash and case all normalise', () => {
    for (const path of ['C:\\Users\\x\\repo', 'C:/Users/x/repo/', 'c:/users/X/REPO']) {
      expect(selfReferentialEvidence({ evidence: [{ kind: 'worktree', path }], repoRoot: ROOT })).toHaveLength(1)
    }
  })

  it('refuses main (and HEAD, and origin/main) as a branch ref', () => {
    for (const ref of ['main', 'origin/main', 'refs/heads/main', 'HEAD']) {
      const found = selfReferentialEvidence({ evidence: [{ kind: 'branch', ref }], repoRoot: ROOT })
      expect(found, ref).toHaveLength(1)
      expect(found[0].why).toMatch(/every merge/)
    }
  })

  it('refuses the declaring checkout’s OWN current branch', () => {
    const found = selfReferentialEvidence({
      evidence: [{ kind: 'branch', ref: 'feat/402-progress-not-age' }],
      repoRoot: ROOT,
      currentBranch: 'feat/402-progress-not-age',
    })
    expect(found).toHaveLength(1)
    expect(found[0].why).toMatch(/own current branch/)
  })

  it('ALLOWS what a delegated agent actually touches — the common, correct declaration', () => {
    expect(
      selfReferentialEvidence({
        evidence: [
          { kind: 'branch', ref: 'feat/403-something' },
          { kind: 'worktree', path: `${ROOT}/.claude/worktrees/agent-1` },
          { kind: 'pid', pid: 900 },
          { kind: 'log', path: `${ROOT}/.claude/run.log` },
        ],
        repoRoot: ROOT,
        currentBranch: 'main',
      }),
    ).toEqual([])
  })

  it('an unknown current branch refuses nothing extra, and bad input refuses nothing at all', () => {
    expect(
      selfReferentialEvidence({ evidence: [{ kind: 'branch', ref: 'feat/x' }], repoRoot: ROOT, currentBranch: null }),
    ).toEqual([])
    expect(selfReferentialEvidence()).toEqual([])
    expect(selfReferentialEvidence({ evidence: null })).toEqual([])
    expect(selfReferentialEvidence({ evidence: [{ kind: 'branch', ref: '' }], repoRoot: ROOT })).toEqual([])
  })
})
