// DECLARING WORK THAT IS IN FLIGHT (point 388, fifth live finding 28.07.2026),
// pinned. The mechanism has exactly one job — tell WAITING apart from IDLING —
// and exactly one way to fail: letting an idle session through. Every case below
// is therefore written from the failure side first:
//   · a declaration only holds while a PROBE still confirms the work (dead pid,
//     vanished branch, silent log, unknown evidence kind → block);
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
  LOG_FRESH_MS,
  assessInFlight,
  checkEvidence,
  describeInFlight,
} from './batch-in-flight-core.mjs'
import { progressGuardDecision, statePathsFor, LOCK_PATH, IN_FLIGHT_PATH } from './batch-singleton.mjs'
import { gatherInFlight, maxAgeMs, readDeclaration, writeDeclaration, clearDeclaration } from './batch-in-flight.mjs'

const NOW = 1_785_100_000_000
const SID = 'session-owner'
const PID = 4242
const PID_STARTED = NOW - 3_600_000

const alive = () => ({ exists: true, startedAt: null })
const dead = () => ({ exists: false, startedAt: null })

const probes = (over = {}) => ({
  probePid: () => alive(),
  refExists: () => true,
  dirExists: () => true,
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
    { kind: 'pid', pid: 9001, label: 'test:large' },
  ],
  ...over,
})

const assess = (over = {}, probeOver = {}) =>
  assessInFlight({ declaration: declaration(over), sid: SID, now: NOW, ...probes(probeOver) })

// ---------------------------------------------------------------------------
describe('checkEvidence — every kind is answered by a probe, never by the claim', () => {
  it('a pid counts only while the process is really alive', () => {
    expect(checkEvidence({ kind: 'pid', pid: 77 }, { now: NOW, probePid: () => alive() }).ok).toBe(true)
    expect(checkEvidence({ kind: 'pid', pid: 77 }, { now: NOW, probePid: () => dead() })).toMatchObject({
      ok: false,
      detail: 'process-gone',
    })
  })

  it('rejects a pid that is not one, without asking the probe', () => {
    for (const pid of [0, -1, 'x', undefined, null]) {
      expect(
        checkEvidence(
          { kind: 'pid', pid },
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

  it('a branch counts only while the ref resolves', () => {
    expect(checkEvidence({ kind: 'branch', ref: 'feat/1-x' }, { now: NOW, refExists: () => true }).ok).toBe(true)
    expect(checkEvidence({ kind: 'branch', ref: 'feat/1-x' }, { now: NOW, refExists: () => false })).toMatchObject({
      ok: false,
      detail: 'branch-gone',
    })
    expect(checkEvidence({ kind: 'branch', ref: '  ' }, { now: NOW, refExists: () => true }).ok).toBe(false)
  })

  it('a worktree counts only while the directory is there', () => {
    expect(checkEvidence({ kind: 'worktree', path: '/tmp/w' }, { now: NOW, dirExists: () => true }).ok).toBe(true)
    expect(checkEvidence({ kind: 'worktree', path: '/tmp/w' }, { now: NOW, dirExists: () => false })).toMatchObject({
      ok: false,
      detail: 'worktree-gone',
    })
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
    expect(assess({}, { refExists: () => false })).toMatchObject({ live: false, reason: 'evidence-gone' })
  })

  it('BLOCKS when ONE of several declared items has finished — all of it must hold', () => {
    const three = declaration({
      evidence: [
        { kind: 'branch', ref: 'feat/389-a' },
        { kind: 'branch', ref: 'feat/390-b' },
        { kind: 'branch', ref: 'feat/391-c' },
      ],
    })
    const a = assessInFlight({
      declaration: three,
      sid: SID,
      now: NOW,
      ...probes({ refExists: (r) => r !== 'feat/390-b' }),
    })
    expect(a).toMatchObject({ live: false, reason: 'evidence-gone' })
    expect(a.summary).toContain('feat/390-b — branch-gone')
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
      const d = declaration({ at: Date.now(), evidence: [{ kind: 'pid', pid: process.pid, label: 'this test' }] })
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
