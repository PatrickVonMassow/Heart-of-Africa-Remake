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
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import {
  IN_FLIGHT_MAX_AGE_MS,
  LAUNCHER_WORK_MAX_AGE_MS,
  LOG_FRESH_MS,
  LOG_OVERRIDES_QUIET_GIT_MS,
  RESPAWN_GRACE_MS,
  WORK_FRESH_MS,
  agentOutputVerdict,
  assessInFlight,
  assessOwnerWork,
  checkEvidence,
  combineWorktreeStamps,
  porcelainPaths,
  worktreeStamp,
  describeInFlight,
  evidenceVerdict,
  respawnDecision,
  selfReferentialEvidence,
  slotReasonDecision,
  declaredAgentCount,
  filesNamedIn,
  openPointSpecs,
  independentOpenPoints,
  slotsRemedy,
  statusVerdict,
  closingFreezeActive,
  declarationShields,
  POOL_CAP,
} from './batch-in-flight-core.mjs'
import {
  assessOwner,
  progressGuardDecision,
  statePathsFor,
  probePid,
  LOCK_PATH,
  IN_FLIGHT_PATH,
  PID_START_TOLERANCE_MS,
} from './batch-singleton.mjs'
import { LEASE_MS } from './batch-lease-core.mjs'
import {
  absPath,
  gatherInFlight,
  maxAgeMs,
  readDeclaration,
  resolveRefName,
  writeDeclaration,
  clearDeclaration,
  worktreeBranch,
  worktreeActiveAt,
  worktreeFilesActiveAt,
  runningBranchFiles,
} from './batch-in-flight.mjs'

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
// THE PROBE MEASURES THE AGENT'S WORK, NOT ITS GIT COMMANDS (point 434 (5b))
// ---------------------------------------------------------------------------
// Measured live on 30.07.2026: a worktree read "quiet for 21 min" to the
// declaration while its agent was mid-edit, because the probe stat'd four GIT
// paths and an agent writing source files runs no git command. The contamination
// ran the other way too — a reader's own `git status` refreshed the index and
// reset the clock, so the observer's look became the evidence.
describe('the worktree stamp reads BOTH sources and says which one answered', () => {
  const wt = { kind: 'worktree', path: '/tmp/w' }

  it('30.07.2026: git metadata old but WORKING FILES fresh reads alive, and names them', () => {
    const probe = () => combineWorktreeStamps({ gitAt: NOW - 21 * 60 * 1000, filesAt: NOW - 60_000 })
    const item = checkEvidence(wt, { now: NOW, worktreeActiveAt: probe })
    expect(item.ok).toBe(true)
    expect(item.detail).toContain('active 1 min ago')
    expect(item.detail).toContain('working files')
    // …and the whole declaration therefore judges on the work's own output.
    expect(evidenceVerdict([item])).toMatchObject({ judgedOn: 'git', outputFresh: true })
  })

  it('BOTH old still reads quiet, and the detail names the newest source', () => {
    const probe = () =>
      combineWorktreeStamps({ gitAt: NOW - WORK_FRESH_MS - 1, filesAt: NOW - 40 * 60 * 1000 })
    const item = checkEvidence(wt, { now: NOW, worktreeActiveAt: probe })
    expect(item.ok).toBe(false)
    expect(item.detail).toContain('quiet for')
    expect(item.detail).toContain('newest: git metadata')
  })

  it('a stamp that cannot be read at all is still `worktree-gone`, never a guess', () => {
    expect(checkEvidence(wt, { now: NOW, worktreeActiveAt: () => combineWorktreeStamps({}) })).toMatchObject({
      ok: false,
      detail: 'worktree-gone',
    })
    // A bare number keeps its old meaning exactly — including its unnamed detail.
    expect(checkEvidence(wt, { now: NOW, worktreeActiveAt: () => NOW - 60_000 }).detail).toBe('active 1 min ago')
  })

  it('combineWorktreeStamps takes the newest, and a tie goes to the files a reader cannot fake', () => {
    expect(combineWorktreeStamps({ gitAt: 5, filesAt: 9 })).toEqual({ at: 9, source: 'working files' })
    expect(combineWorktreeStamps({ gitAt: 9, filesAt: 5 })).toEqual({ at: 9, source: 'git metadata' })
    expect(combineWorktreeStamps({ gitAt: 7, filesAt: 7 })).toEqual({ at: 7, source: 'working files' })
    expect(combineWorktreeStamps({ gitAt: 7 })).toEqual({ at: 7, source: 'git metadata' })
    expect(combineWorktreeStamps({ filesAt: 7 })).toEqual({ at: 7, source: 'working files' })
    expect(combineWorktreeStamps({ gitAt: null, filesAt: NaN })).toBe(null)
    expect(combineWorktreeStamps()).toBe(null)
  })

  it('worktreeStamp accepts both shapes and refuses everything else', () => {
    expect(worktreeStamp(12)).toEqual({ at: 12, source: null })
    expect(worktreeStamp({ at: 12, source: 'working files' })).toEqual({ at: 12, source: 'working files' })
    expect(worktreeStamp({ at: 12 })).toEqual({ at: 12, source: null })
    for (const bad of [null, undefined, 'x', {}, { at: 'x' }, { at: NaN }, Infinity]) {
      expect(worktreeStamp(bad), String(bad)).toBe(null)
    }
  })

  it('--agent-check keeps its meaning, and names the working files when they carry it', () => {
    const alive = agentOutputVerdict({
      worktreeAt: combineWorktreeStamps({ gitAt: NOW - 21 * 60 * 1000, filesAt: NOW - 60_000 }),
      now: NOW,
    })
    expect(alive).toMatchObject({ verdict: 'alive', judgedOn: 'git' })
    expect(alive.detail).toContain('working files')
    // A branch tip that is newer than the worktree still decides, and is not
    // mislabelled with the worktree's source.
    const byBranch = agentOutputVerdict({
      worktreeAt: combineWorktreeStamps({ gitAt: NOW - 60 * 60 * 1000, filesAt: NOW - 50 * 60 * 1000 }),
      branchTipAt: NOW - 60_000,
      now: NOW,
    })
    expect(byBranch).toMatchObject({ verdict: 'alive', judgedOn: 'git' })
    expect(byBranch.detail).not.toContain('working files')
    // Both quiet: still quiet — the respawn permission is unchanged.
    const quiet = agentOutputVerdict({
      worktreeAt: combineWorktreeStamps({ gitAt: NOW - 90 * 60 * 1000, filesAt: NOW - 80 * 60 * 1000 }),
      now: NOW,
    })
    expect(quiet).toMatchObject({ verdict: 'quiet', judgedOn: 'git' })
    expect(quiet.detail).toContain('newest: working files')
    expect(respawnDecision({ output: quiet }).respawn).toBe(true)
    expect(respawnDecision({ output: alive }).respawn).toBe(false)
    // A bare number still answers exactly as it did.
    expect(agentOutputVerdict({ worktreeAt: NOW - 60_000, now: NOW })).toMatchObject({ verdict: 'alive' })
    expect(agentOutputVerdict({ worktreeAt: null, now: NOW })).toMatchObject({ verdict: 'unmeasurable' })
  })

  it('porcelainPaths reads NUL records, skips the rename SOURCE and honours the limit', () => {
    const rec = (...parts) => `${parts.join('\0')}\0`
    expect(porcelainPaths(rec(' M src/a.ts', '?? src/b with space.ts'))).toEqual([
      'src/a.ts',
      'src/b with space.ts',
    ])
    // A rename record is followed by the path the file no longer has — skip it.
    expect(porcelainPaths(rec('R  new.ts', 'old.ts', ' M kept.ts'))).toEqual(['new.ts', 'kept.ts'])
    expect(porcelainPaths(rec('C  copy.ts', 'orig.ts'))).toEqual(['copy.ts'])
    expect(porcelainPaths(rec(' M a', ' M b', ' M c'), { limit: 2 })).toEqual(['a', 'b'])
    // `-z` is unquoted and unescaped, so a legal path with an edge space survives
    // verbatim — trimming it would make its stat miss (four-eyes review, finding 6).
    expect(porcelainPaths(rec('?? odd name .ts', '?? tab\tname.ts'))).toEqual(['odd name .ts', 'tab\tname.ts'])
    for (const junk of ['', null, undefined, '\0\0', 'XY']) expect(porcelainPaths(junk), String(junk)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
describe('worktreeActiveAt against a REAL checkout (its own temp repo, never this one)', () => {
  // The repo is built with the AMBIENT config neutralised: a machine with a global
  // `commit.gpgsign`, a global `core.hooksPath` or an `init.templateDir` carrying
  // hooks would otherwise fail or HANG these commits (four-eyes review, finding 4).
  // `status.showUntrackedFiles=no` is neutralised the same way — the probe states
  // the flag itself, and this keeps the test honest about that.
  const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }
  const git = (dir, ...args) =>
    execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', ...args], {
      windowsHide: true,
      cwd: dir,
      env: gitEnv,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

  const seedRepo = (dir) => {
    git(dir, 'init', '-b', 'main')
    writeFileSync(join(dir, 'a.txt'), 'first\n')
    git(dir, 'add', 'a.txt')
    git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'x')
  }

  const backdate = (dir, ageMs) => {
    const when = new Date(Date.now() - ageMs)
    for (const p of ['.git', '.git/index', '.git/HEAD', '.git/COMMIT_EDITMSG']) {
      try {
        utimesSync(join(dir, p), when, when)
      } catch {
        /* COMMIT_EDITMSG may not exist — the other three carry the stamp */
      }
    }
  }

  it('an agent EDITING with no git command reads alive, on the working files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-wt-probe-'))
    try {
      seedRepo(dir)
      // The git metadata is 30 minutes old; the agent has just written a file.
      backdate(dir, 30 * 60 * 1000)
      writeFileSync(join(dir, 'a.txt'), 'mid-edit\n')

      const stamp = worktreeActiveAt(dir)
      expect(stamp).toBeTruthy()
      expect(stamp.source).toBe('working files')
      expect(Date.now() - stamp.at).toBeLessThan(60_000)
      // What the declaration then says about it — the 30.07 verdict, corrected.
      expect(checkEvidence({ kind: 'worktree', path: dir }, { now: Date.now(), worktreeActiveAt }).ok).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a NEW, not-yet-added file counts too — that is the mid-edit case itself', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-wt-untracked-'))
    try {
      seedRepo(dir)
      backdate(dir, 30 * 60 * 1000)
      // An agent writing a brand-new source file has not run `git add` either. The
      // probe states `--untracked-files=all`, so an ambient
      // `status.showUntrackedFiles=no` cannot blind it (four-eyes review, finding 5).
      git(dir, 'config', 'status.showUntrackedFiles', 'no')
      writeFileSync(join(dir, 'brand-new.ts'), 'export const x = 1\n')

      const stamp = worktreeActiveAt(dir)
      expect(stamp.source).toBe('working files')
      expect(Date.now() - stamp.at).toBeLessThan(60_000)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('…and inside a brand-NEW directory, which `-unormal` would have collapsed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-wt-newdir-'))
    try {
      seedRepo(dir)
      // The agent creates a new module directory, then works INSIDE it. Under
      // `-unormal` git reports only `?? newthing/`, and a DIRECTORY's mtime does
      // not move when an existing child is rewritten — so the twenty minutes of
      // editing would read `quiet` all over again (four-eyes re-check,
      // SHOULD-FIX 1). This case fails under `-unormal` and passes under `-uall`.
      mkdirSync(join(dir, 'newthing'))
      writeFileSync(join(dir, 'newthing', 'one.ts'), 'export const a = 1\n')
      backdate(dir, 30 * 60 * 1000)
      const old = new Date(Date.now() - 30 * 60 * 1000)
      utimesSync(join(dir, 'newthing'), old, old)
      // Only the FILE is fresh; its directory still carries the old stamp.
      writeFileSync(join(dir, 'newthing', 'one.ts'), 'export const a = 2\n')
      expect(Date.now() - statSync(join(dir, 'newthing')).mtimeMs).toBeGreaterThan(20 * 60 * 1000)

      const stamp = worktreeActiveAt(dir)
      expect(stamp.source).toBe('working files')
      expect(Date.now() - stamp.at).toBeLessThan(60_000)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a clean, long-idle checkout still reads quiet — on the git metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-wt-idle-'))
    try {
      seedRepo(dir)
      backdate(dir, 40 * 60 * 1000)

      const stamp = worktreeActiveAt(dir)
      expect(stamp.source).toBe('git metadata')
      const item = checkEvidence({ kind: 'worktree', path: dir }, { now: Date.now(), worktreeActiveAt })
      expect(item.ok).toBe(false)
      expect(item.detail).toContain('newest: git metadata')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('LOOKING AT IT IS NOT EVIDENCE: the probe does not refresh the index it reads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-wt-clean-'))
    try {
      seedRepo(dir)
      backdate(dir, 30 * 60 * 1000)
      const before = statSync(join(dir, '.git', 'index')).mtimeMs

      worktreeActiveAt(dir)
      worktreeActiveAt(dir)

      expect(statSync(join(dir, '.git', 'index')).mtimeMs).toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('answers null for a path that is not a checkout at all', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-wt-none-'))
    try {
      expect(worktreeActiveAt(dir)).toBe(null)
      expect(worktreeActiveAt('')).toBe(null)
      expect(worktreeFilesActiveAt(dir)).toBe(null)
      expect(worktreeFilesActiveAt('')).toBe(null)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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

  it('BLOCKS past the maximum age where nothing is producing OUTPUT', () => {
    // A pid and a log are assertion-shaped: they can look alive indefinitely
    // without anything being produced, so the clock still bounds them.
    const noOutput = { evidence: [{ kind: 'pid', pid: RUN_PID, startedAt: RUN_STARTED, label: 'test:large' }] }
    const a = assess({ ...noOutput, at: NOW - IN_FLIGHT_MAX_AGE_MS - 1 })
    expect(a.live).toBe(false)
    expect(a.reason).toBe('expired')
    expect(a.judgedOn).toBe('process')
    // …and the boundary of the window itself still holds (no off-by-one gap).
    expect(assess({ ...noOutput, at: NOW - IN_FLIGHT_MAX_AGE_MS }).live).toBe(true)
  })

  it('29.07.2026: a declaration whose OUTPUT still moves does NOT age out', () => {
    // The incident (point 434 (6b)): at 19:51 the declaration read
    // `live:false, expired` while its agent had been building for 63 minutes and
    // was mid-merge. Nothing refreshes a declaration while the work runs, so the
    // clock was measuring the paperwork rather than the work.
    const a = assess({ at: NOW - 63 * 60 * 1000 })
    expect(a).toMatchObject({ live: true, reason: 'live', judgedOn: 'git' })
    // …and it still ends by itself the moment the output goes quiet: no clock to
    // feed, no background refresher that could die silently. Inside the age
    // window the reason is the evidence, past it the clock — never live either
    // way, which is the property that matters.
    expect(assess({ at: NOW - 5 * 60 * 1000 }, { refTipAt: () => NOW - WORK_FRESH_MS - 1 })).toMatchObject({
      live: false,
      reason: 'evidence-gone',
    })
    expect(assess({ at: NOW - 63 * 60 * 1000 }, { refTipAt: () => NOW - WORK_FRESH_MS - 1 }).live).toBe(false)
  })

  it('honours a caller-supplied maximum age (the calibratable knob)', () => {
    const short = assessInFlight({
      declaration: declaration({
        at: NOW - 10 * 60 * 1000,
        evidence: [{ kind: 'pid', pid: RUN_PID, startedAt: RUN_STARTED, label: 'test:large' }],
      }),
      sid: SID,
      now: NOW,
      maxAgeMs: 5 * 60 * 1000,
      ...probes(),
    })
    expect(short).toMatchObject({ live: false, reason: 'expired' })
  })

  it('30.07.2026: a SILENT LOG beside moving git output is not death', () => {
    // The incident (point 434 (5)): a bundle agent's log had been silent for 59
    // minutes, this function answered `evidence-gone: silent for 59 min`, and the
    // agent was declared dead and replaced — while its worktree had committed
    // four minutes earlier. The successor rebuilt two finished points.
    const withLog = declaration({
      evidence: [
        { kind: 'worktree', path: '/w/agent-bundle', label: 'bundle agent' },
        { kind: 'log', path: '/w/agent-bundle.log', label: 'its transcript' },
      ],
    })
    const a = assessInFlight({
      declaration: withLog,
      sid: SID,
      now: NOW,
      ...probes({ worktreeActiveAt: () => NOW - 4 * 60 * 1000, mtimeOf: () => NOW - 59 * 60 * 1000 }),
    })
    expect(a).toMatchObject({ live: true, reason: 'live', judgedOn: 'git' })
    expect(a.ignored.join(' ')).toContain('silent for 59 min')
    // The verdict SAYS what it rests on — the mistake was invisible because
    // "evidence-gone" never named the source that had answered.
    expect(describeInFlight(a, withLog)).toContain('judged on the work’s own output — a commit or a written file')
    expect(describeInFlight(a, withLog)).toContain('NOT counted as dead')
  })

  it('a silent log is forgiven ONLY beside live output — never on its own', () => {
    const logOnly = declaration({ evidence: [{ kind: 'log', path: '/w/run.log' }] })
    expect(
      assessInFlight({ declaration: logOnly, sid: SID, now: NOW, ...probes({ mtimeOf: () => NOW - 59 * 60 * 1000 }) }),
    ).toMatchObject({ live: false, reason: 'evidence-gone', judgedOn: 'none' })
    // …and a quiet WORKTREE beside a fresh log still blocks: output is the
    // primary evidence in both directions.
    const both = declaration({
      evidence: [
        { kind: 'worktree', path: '/w/a' },
        { kind: 'log', path: '/w/a.log' },
      ],
    })
    expect(
      assessInFlight({
        declaration: both,
        sid: SID,
        now: NOW,
        ...probes({ worktreeActiveAt: () => NOW - WORK_FRESH_MS - 1, mtimeOf: () => NOW - 1000 }),
      }),
    ).toMatchObject({ live: false, reason: 'evidence-gone' })
  })

  it('INDEPENDENCE: it decides on the evidence alone, every other layer stale or absent', () => {
    // No lock, no launcher, no claim, no heartbeat, and a declaration older than
    // every clock in this family — nothing but the probes. The layer still acts.
    const only = declaration({ at: NOW - 6 * 60 * 60 * 1000, evidence: [{ kind: 'branch', ref: 'feat/434-x' }] })
    expect(assessInFlight({ declaration: only, sid: SID, now: NOW, ...probes() })).toMatchObject({
      live: true,
      judgedOn: 'git',
    })
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
// POINT 434 (5): the costlier verdict — may a delegated agent be REPLACED? On
// 30.07.2026 that was answered from a transcript log while the agent's worktree
// had committed four minutes earlier, and the successor rebuilt two finished
// points. Every case below is written from that night.
describe('agentOutputVerdict / respawnDecision — an agent is judged by what it produces', () => {
  const verdict = (over) => agentOutputVerdict({ now: NOW, ...over })

  it('30.07.2026: a worktree that committed four minutes ago REFUSES the respawn', () => {
    const v = verdict({ worktreeAt: NOW - 4 * 60 * 1000, logAt: NOW - 59 * 60 * 1000 })
    expect(v).toMatchObject({ verdict: 'alive', judgedOn: 'git' })
    expect(respawnDecision({ output: v })).toMatchObject({ respawn: false, reason: 'agent-alive' })
  })

  it('…and so does a branch tip that moved a minute before the spawn', () => {
    // The re-check immediately before spawning is the point: the branch tip moved
    // one minute before the replacement was started, and nobody looked again.
    const v = verdict({ branchTipAt: NOW - 60 * 1000 })
    expect(respawnDecision({ output: v }).respawn).toBe(false)
  })

  it('permits the respawn only where git output COULD be measured and stood still', () => {
    const v = verdict({ worktreeAt: NOW - RESPAWN_GRACE_MS - 1, branchTipAt: NOW - RESPAWN_GRACE_MS - 1 })
    expect(v.verdict).toBe('quiet')
    expect(respawnDecision({ output: v })).toMatchObject({ respawn: true, reason: 'output-quiet', judgedOn: 'git' })
    // The window's own edge holds: at exactly the grace it is still alive.
    expect(verdict({ worktreeAt: NOW - RESPAWN_GRACE_MS }).verdict).toBe('alive')
  })

  it('a SILENT LOG alone never permits it — and neither does an unmeasurable agent', () => {
    const silent = verdict({ logAt: NOW - 59 * 60 * 1000 })
    expect(silent.verdict).toBe('unmeasurable')
    expect(respawnDecision({ output: silent })).toMatchObject({ respawn: false, reason: 'output-unmeasurable' })
    expect(respawnDecision({})).toMatchObject({ respawn: false, reason: 'output-unmeasurable' })
    expect(respawnDecision({ output: verdict({}) }).respawn).toBe(false)
  })

  it('a FRESH log with quiet git still refuses — silence is the only thing that proves nothing', () => {
    const v = verdict({ worktreeAt: NOW - RESPAWN_GRACE_MS - 1, logAt: NOW - 60 * 1000 })
    expect(v).toMatchObject({ verdict: 'alive', judgedOn: 'log' })
    expect(respawnDecision({ output: v }).respawn).toBe(false)
  })

  it('…but a printing loop cannot make an agent UNREPLACEABLE (four-eyes finding 4)', () => {
    // A fresh log refuses the respawn, and must not refuse it forever: an agent
    // wedged printing while its output stands still would otherwise be
    // replaceable only by hand — a standstill of the kind this point ends.
    const wedged = verdict({ worktreeAt: NOW - LOG_OVERRIDES_QUIET_GIT_MS - 1, logAt: NOW - 60 * 1000 })
    expect(wedged).toMatchObject({ verdict: 'quiet', judgedOn: 'git' })
    expect(respawnDecision({ output: wedged }).respawn).toBe(true)
    // Just inside the bound the log still holds, so thinking aloud for a while
    // is never punished.
    expect(verdict({ worktreeAt: NOW - LOG_OVERRIDES_QUIET_GIT_MS, logAt: NOW - 60 * 1000 }).verdict).toBe('alive')
    expect(LOG_OVERRIDES_QUIET_GIT_MS).toBeGreaterThan(RESPAWN_GRACE_MS)
  })

  it('is wider than the WAIT window, because the two mistakes cost differently', () => {
    // Ending a wait too early costs one command; killing a live agent costs
    // everything it built and is then rebuilt a second time.
    expect(RESPAWN_GRACE_MS).toBeGreaterThan(WORK_FRESH_MS)
  })

  it('INDEPENDENCE: it needs no lock, no declaration and no launcher — only the stamps', () => {
    expect(verdict({ worktreeAt: NOW - 1000 }).verdict).toBe('alive')
    expect(agentOutputVerdict({ now: NOW, worktreeAt: 'kürzlich' }).verdict).toBe('unmeasurable')
  })
})

// ---------------------------------------------------------------------------
describe('evidenceVerdict — the verdict names the source it rests on', () => {
  const item = (kind, ok) => ({ ok, kind, describe: `${kind} x`, detail: ok ? 'fresh' : 'quiet' })

  it('ranks output above a process and a process above a log', () => {
    expect(evidenceVerdict([item('log', true), item('branch', true)]).judgedOn).toBe('git')
    expect(evidenceVerdict([item('log', true), item('pid', true)]).judgedOn).toBe('process')
    expect(evidenceVerdict([item('log', true)]).judgedOn).toBe('log')
    expect(evidenceVerdict([item('log', false)]).judgedOn).toBe('none')
    expect(evidenceVerdict().judgedOn).toBe('none')
  })

  it('separates what is fresh from what is silent, for the report', () => {
    const v = evidenceVerdict([item('worktree', true), item('log', false)])
    expect(v.outputFresh).toBe(true)
    expect(v.fresh).toHaveLength(1)
    expect(v.silent).toEqual(['log x — quiet'])
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
// THE REAL PIPELINE, NOW THAT THE VERDICT IS A LEASE (point 434).
//
// This block used to prove `work-stalled` was REACHABLE: it had been dead code in
// production while every hand-crafted test above it stayed green, because those
// tests fed `assessOwner` a `work` shape `assessOwnerWork` could never produce.
// That verdict is gone, and with it `WORK_STALL_MS`, `WEDGED_MS` and the
// `lastWord` tolerance the whole reachability argument turned on.
//
// The block keeps its VALUE by keeping its METHOD: it refuses hand-crafted `work`
// objects, builds ONE frozen declaration and ONE lock whose heartbeat is the
// declare command's own PostToolUse, and drives the real pair minute by minute
// across five hours, exactly as the launcher ticks. What it pins now is the
// inversion point 434 made — the declaration still REPORTS what the owner waits
// on, and decides nothing; the lease decides. Three cases here were left
// asserting `reason === 'work-stalled'`, a string no implementation can emit any
// more and therefore trivially true on any code at all; they are repurposed
// rather than deleted, because a vacuous green is worse than no test.
describe('assessOwnerWork → assessOwner: the declaration reports, the lease decides', () => {
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

  /** One launcher tick, driven end to end. No `work` object is ever hand-written,
   *  and none is passed to `assessOwner` — it no longer takes one (point 434). */
  const tick = (minute, { lockOver = {}, probes = dead, ...over } = {}) => {
    const now = T0 + minute * 60_000
    const l = lock(lockOver)
    const work = assessOwnerWork({ declaration: frozen, lock: l, now, ...probes, ...over })
    return { work, verdict: assessOwner(l, { now, bootTime: BOOT, probe: ownerProbe }) }
  }
  /** Every minute of the first five hours at which the owner reads NOT ALIVE. */
  const notAliveMinutes = (opts = {}) => {
    const out = []
    for (let m = 0; m <= 300; m++) if (tick(m, opts).verdict.alive === false) out.push(m)
    return out
  }

  it('THE WINDOW SURVIVES THE VERDICT: the launcher asks about a declaration with its OWN window', () => {
    // What this case used to prove — that asking with the GUARD's window silently
    // disabled the stall verdict — is unprovable now, because the verdict is gone;
    // asserting "never stalled" would pass on any code. The SURVIVING property is
    // the one `LAUNCHER_WORK_MAX_AGE_MS` still exists for: how long a declaration
    // stays readable AS a declaration, which is what the launcher reports from.
    const at = 60 // minutes after the freeze — inside the launcher's window, past the guard's
    expect(LAUNCHER_WORK_MAX_AGE_MS).toBeGreaterThan(IN_FLIGHT_MAX_AGE_MS)
    expect(at * 60_000).toBeGreaterThan(IN_FLIGHT_MAX_AGE_MS)
    expect(at * 60_000).toBeLessThan(LAUNCHER_WORK_MAX_AGE_MS)
    expect(tick(at).work.declared, 'the launcher can still SAY what the owner waited on').toBe(true)
    expect(tick(at, { maxAgeMs: IN_FLIGHT_MAX_AGE_MS }).work.declared).toBe(false)
  })

  it('AN ADVANCING DECLARATION NO LONGER HOLDS THE BATCH — the lease does', () => {
    // The deliberate inversion. The agent keeps committing all five hours, so the
    // declaration reads advancing at every tick; that used to make the owner
    // immune at any age. Now it is evidence for the REPORT and nothing more, and
    // an owner that never renewed loses the batch exactly on the lease.
    const advancing = (m) => ({ ...dead, refTipAt: () => T0 + m * 60_000 - 60_000 })
    const late = 300
    expect(tick(late, { probes: advancing(late) }).work.advancing).toBe(true)
    expect(tick(late, { probes: advancing(late) }).verdict).toMatchObject({ alive: false, reason: 'lease-expired' })
    // …and the ONE sanctioned way to keep it: say so in advance, by writing a
    // longer lease (`extendLease`). Then the same wait is untouched at any age.
    const held = tick(late, { probes: advancing(late), lockOver: { leaseUntil: T0 + 360 * 60_000 } })
    expect(held.verdict).toMatchObject({ alive: true, reason: 'pid-alive' })
  })

  it('THE FREEZE IS STILL CAUGHT, and by arithmetic rather than three agreeing constants', () => {
    // What the demolished pipeline needed 91 minutes and three constants to
    // conclude, the lease concludes on its own clock — and this pins WHEN, so a
    // future widening of the window fails here rather than silently on a night.
    const caught = notAliveMinutes()
    expect(caught.length).toBeGreaterThan(0)
    expect(caught[0] * 60_000).toBeGreaterThan(LEASE_MS - 2 * 60_000)
    expect(caught[0] * 60_000).toBeLessThanOrEqual(LEASE_MS + 60_000)
    expect(tick(caught[0]).verdict.reason).toBe('lease-expired')
  })

  it('and no lease may revive a DEAD process, whatever the paperwork says', () => {
    const now = T0 + 120 * 60_000
    // `leaseUntil` so the LEASE does not decide first (point 434): the assertion
    // below is about the pid, and only the pid.
    const l = lock({ leaseUntil: now + 60 * 60_000 })
    const work = assessOwnerWork({ declaration: frozen, lock: l, now, ...dead, refTipAt: () => now - 60_000 })
    expect(work.advancing).toBe(true)
    const v = assessOwner(l, { now, bootTime: BOOT, probe: { exists: false, startedAt: null } })
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

  it('…and every OTHER spelling of the same two refs (second review, finding B)', () => {
    // All four were declared LIVE by the reviewer, all four slipped through, and
    // all four then probed eternally fresh. `@` is git's own alias for HEAD;
    // `heads/…` is the half-qualified form the `refs/` strip never reached; and
    // `…@{0}` is a revision expression that git will not even give a symbolic
    // name to, so no resolver can catch it and this string rule must.
    for (const ref of ['@', 'heads/main', 'main@{0}', 'refs/heads/main@{1}', 'MAIN', 'origin/MAIN']) {
      expect(
        selfReferentialEvidence({ evidence: [{ kind: 'branch', ref }], repoRoot: ROOT }),
        ref,
      ).toHaveLength(1)
    }
    // The own-branch rule normalises the same way, whichever side is spelled long.
    expect(
      selfReferentialEvidence({
        evidence: [{ kind: 'branch', ref: 'heads/feat/402-x' }],
        repoRoot: ROOT,
        currentBranch: 'feat/402-x',
      }),
    ).toHaveLength(1)
  })

  it('…but a real agent branch that merely BEGINS with those letters is untouched', () => {
    // The strips are anchored, so nothing legitimate is swallowed by them.
    for (const ref of ['feat/main-menu', 'heads-up/402', 'origin-mirror/feat/x', 'mainline/402']) {
      expect(
        selfReferentialEvidence({ evidence: [{ kind: 'branch', ref }], repoRoot: ROOT, currentBranch: 'main' }),
        ref,
      ).toEqual([])
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

// ---------------------------------------------------------------------------
// WHAT IS STORED IS WHAT THE LAUNCHER WILL PROBE (second four-eyes review,
// 28.07.2026, finding B). The refusal above can only compare NAMES, and the CLI
// used to hand it whatever was typed: a raw path that `normPath` cleans up but
// never RESOLVES, and a raw ref whose spelling only git can settle. The reviewer
// drove `--worktree .` from the repo root, `<root>/.`, `<root>/../hoa`,
// `--branch @` and `--branch heads/main` live — all five slipped past the refusal
// and then probed eternally fresh, which is worse than declaring nothing at all
// (a declaration also suppresses the launcher's silent-owner report).
describe('the CLI records RESOLVED evidence, not what was typed', () => {
  it('absPath resolves a relative path against the cwd — the launcher probes from elsewhere', () => {
    expect(absPath('.')).toBe(resolve('.'))
    expect(absPath('./scripts/..')).toBe(resolve('.'))
    expect(absPath('../hoa/..')).toBe(resolve('..'))
    const abs = resolve('scripts')
    expect(absPath(abs)).toBe(abs)
    // An empty value stays empty, so it keeps failing as "no path" rather than
    // quietly becoming the working directory.
    expect(absPath('')).toBe('')
    expect(absPath(undefined)).toBe('')
  })

  it('…so every spelling of the repo root IS recognised as the repo root', () => {
    const root = resolve(REPO_ROOT)
    for (const typed of [root, `${root}/.`, `${root}/../${basename(root)}`, `${root}/scripts/..`]) {
      const found = selfReferentialEvidence({
        evidence: [{ kind: 'worktree', path: absPath(typed) }],
        repoRoot: REPO_ROOT,
      })
      expect(found, typed).toHaveLength(1)
    }
  })

  it('resolveRefName asks GIT what a ref names, so an alias cannot hide behind a spelling', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-ref-'))
    const git = (...args) =>
      execFileSync('git', args, { windowsHide: true, cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    try {
      git('init', '-b', 'main')
      git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-m', 'x')
      const at = (ref) => resolveRefName(ref, { cwd: dir })
      // The two live bypasses, resolved to names the refusal already knows.
      expect(at('@')).toBe(at('HEAD'))
      expect(at('heads/main')).toBe('refs/heads/main')
      expect(at('main')).toBe('refs/heads/main')
      // …and refused once resolved, which is what the CLI now stores.
      for (const typed of ['@', 'heads/main', 'main']) {
        expect(
          selfReferentialEvidence({ evidence: [{ kind: 'branch', ref: at(typed) ?? typed }], repoRoot: REPO_ROOT }),
          typed,
        ).toHaveLength(1)
      }
      // Unresolvable input answers null rather than guessing — the caller then
      // keeps what was typed, where the string rules in normRef still apply and
      // the up-front evidence check fails it as a branch that is not there.
      expect(at('no-such-ref')).toBe(null)
      expect(at('main@{0}')).toBe(null) // a revision expression has no symbolic name
      expect(at('')).toBe(null)
      // Never hand git something it reads as an option (`--help` opens a pager).
      expect(at('--help')).toBe(null)
      expect(at('-v')).toBe(null)
      // A real agent branch resolves and is NOT refused.
      git('branch', 'feat/403-x')
      expect(at('feat/403-x')).toBe('refs/heads/feat/403-x')
      expect(
        selfReferentialEvidence({ evidence: [{ kind: 'branch', ref: at('feat/403-x') }], repoRoot: REPO_ROOT }),
      ).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// ---------------------------------------------------------------------------
// THE POOL RUNS AT ITS CAP, OR SAYS WHY NOT (point 427)
// ---------------------------------------------------------------------------
// The user asked it plainly while one agent built and two slots stood empty. Nothing
// was broken: the wait declaration is enforced, the idle guard is satisfied, and the
// cap is an UPPER bound that nothing checked from below. Measured that day: one
// agent, two free slots, ninety minutes, a queue full of independent points.
//
// The failure side here is a NAG, so every state in which the empty slots are
// genuinely unusable must answer "no reason needed" on its own.

describe('declaredAgentCount — count what can be SEEN, not what is typed', () => {
  it('one agent declaring its worktree AND its branch is one agent', () => {
    expect(
      declaredAgentCount([
        { kind: 'worktree', path: '/repo/.claude/worktrees/agent-a1' },
        { kind: 'branch', ref: 'refs/heads/feat/427-x' },
      ]),
    ).toBe(1)
  })

  it('three worktrees are three agents, however the branches are declared', () => {
    expect(
      declaredAgentCount([
        { kind: 'worktree', path: '/repo/wt/a1' },
        { kind: 'worktree', path: '/repo/wt/a2' },
        { kind: 'worktree', path: '/repo/wt/a3' },
        { kind: 'branch', ref: 'refs/heads/feat/x' },
      ]),
    ).toBe(3)
  })

  it('duplicates collapse, and a pid or a log is not an agent', () => {
    expect(declaredAgentCount([{ kind: 'worktree', path: '/wt/A1' }, { kind: 'worktree', path: '/wt/a1' }])).toBe(1)
    expect(declaredAgentCount([{ kind: 'pid', pid: 1 }, { kind: 'log', path: '/tmp/x.log' }])).toBe(0)
    expect(declaredAgentCount([])).toBe(0)
    expect(declaredAgentCount()).toBe(0)
    expect(declaredAgentCount('nonsense')).toBe(0)
  })
})

describe('filesNamedIn / openPointSpecs — what a queued point says it touches', () => {
  it('reads the repository paths out of a spec, case-folded the way git is compared', () => {
    const files = filesNamedIn('Fix `scripts/batch-doctor.mjs` and src/ui/Hud.tsx; docs/batch-autonomy.md too.')
    expect(files).toContain('scripts/batch-doctor.mjs')
    expect(files).toContain('src/ui/hud.tsx') // folded, so a Windows path compares equal
    expect(files).toContain('docs/batch-autonomy.md')
  })

  it('reads the root-level documents the work order names bare', () => {
    expect(filesNamedIn('update CLAUDE.md §6 and design.md')).toEqual(expect.arrayContaining(['claude.md', 'design.md']))
  })

  it('names nothing when the spec names nothing', () => {
    expect(filesNamedIn('Decide whether the mechanic is worth building at all.')).toEqual([])
    expect(filesNamedIn('')).toEqual([])
    expect(filesNamedIn()).toEqual([])
  })

  it('splits the work order into its OPEN points, DEFERRED and ticked excluded', () => {
    const tasks = [
      '- [ ] 500. FIRST POINT touching scripts/a.mjs',
      '  and also src/ui/B.tsx',
      '- [x] 501. A closed point touching scripts/closed.mjs',
      '- [ ] 502. DEFERRED — waiting on the user, scripts/c.mjs',
      '- [ ] 503. THIRD POINT touching docs/d.md',
    ].join('\n')
    const specs = openPointSpecs(tasks)
    expect(specs.map((s) => s.point)).toEqual([500, 503])
    expect(specs[0].files).toEqual(expect.arrayContaining(['scripts/a.mjs', 'src/ui/b.tsx']))
    expect(specs[1].files).toEqual(['docs/d.md'])
  })

  it('an empty work order yields no points', () => {
    expect(openPointSpecs('')).toEqual([])
    expect(openPointSpecs()).toEqual([])
  })

  it('carries a point waiting on the user, but FLAGGED (point 450)', () => {
    const tasks = [
      '- [ ] 500. FIRST POINT touching scripts/a.mjs AWAITING-USER(2026-07-29; needs a ruling)',
      '  and also src/ui/B.tsx',
      '- [ ] 503. THIRD POINT touching docs/d.md',
      '- [ ] 504. ANSWERED POINT touching docs/e.md USER-ANSWERED(2026-08-07)',
    ].join('\n')
    const specs = openPointSpecs(tasks)
    expect(specs.map((s) => s.point)).toEqual([500, 503, 504])
    expect(specs.map((s) => s.gated)).toEqual([true, false, false])
    // …and the gated one is never a candidate for a free pool slot, while the
    // answered one is workable again.
    expect(independentOpenPoints({ points: specs, runningFiles: [] }).map((s) => s.point)).toEqual([503, 504])
  })
})

describe('independentOpenPoints — a candidate must be provably independent', () => {
  const running = ['scripts/batch-singleton.mjs', 'docs/batch-autonomy.md']

  it('a point touching none of the running files is a candidate', () => {
    expect(
      independentOpenPoints({ points: [{ point: 1, files: ['src/world/world.ts'] }], runningFiles: running }),
    ).toHaveLength(1)
  })

  it('a point touching ONE running file is not', () => {
    expect(
      independentOpenPoints({
        points: [{ point: 1, files: ['src/world/world.ts', 'scripts/batch-singleton.mjs'] }],
        runningFiles: running,
      }),
    ).toEqual([])
  })

  it('a DIRECTORY overlap counts — a point on scripts/ collides with a file in it', () => {
    expect(independentOpenPoints({ points: [{ point: 1, files: ['scripts'] }], runningFiles: running })).toEqual([])
  })

  it('A POINT THAT NAMES NOTHING IS NEVER A CANDIDATE — unknown must not nag', () => {
    expect(independentOpenPoints({ points: [{ point: 1, files: [] }], runningFiles: running })).toEqual([])
    expect(independentOpenPoints({ points: [{ point: 1 }], runningFiles: running })).toEqual([])
    expect(independentOpenPoints()).toEqual([])
  })
})

describe('slotReasonDecision — the cap is a target, and the demand is narrow', () => {
  const independent = [{ point: 500, files: ['src/world/world.ts'] }]
  const running = ['scripts/batch-singleton.mjs']

  it('THE MEASURED STATE: one agent, free slots, an independent point → a reason is DEMANDED', () => {
    const d = slotReasonDecision({ agents: 1, openPoints: independent, runningFiles: running })
    expect(d).toMatchObject({ needsReason: true, agents: 1, slotsFree: POOL_CAP - 1, why: 'idle-slots' })
    expect(d.candidates.map((c) => c.point)).toEqual([500])
  })

  it('the SAME state WITH a reason passes', () => {
    expect(
      slotReasonDecision({
        agents: 1,
        openPoints: independent,
        runningFiles: running,
        reason: 'the queue\'s next points all rewrite the same guard the running agent is rebuilding',
      }),
    ).toMatchObject({ needsReason: false, why: 'reason-given' })
    // Whitespace is not a reason.
    expect(slotReasonDecision({ agents: 1, openPoints: independent, runningFiles: running, reason: '   ' }).needsReason).toBe(
      true,
    )
  })

  it('a FULL pool passes with no reason at all', () => {
    expect(
      slotReasonDecision({ agents: POOL_CAP, openPoints: independent, runningFiles: running }),
    ).toMatchObject({ needsReason: false, slotsFree: 0, why: 'at-cap' })
    // …and over the cap is not negative slots.
    expect(slotReasonDecision({ agents: POOL_CAP + 2, openPoints: independent, runningFiles: running }).slotsFree).toBe(0)
  })

  it('a queue whose open points ALL touch the running branch passes', () => {
    expect(
      slotReasonDecision({
        agents: 1,
        openPoints: [{ point: 500, files: ['scripts/batch-singleton.mjs'] }, { point: 501, files: [] }],
        runningFiles: running,
      }),
    ).toMatchObject({ needsReason: false, why: 'queue-overlaps' })
  })

  it('an EMPTY queue passes — there is nothing to commission', () => {
    expect(slotReasonDecision({ agents: 1, openPoints: [], runningFiles: running })).toMatchObject({
      needsReason: false,
      why: 'queue-overlaps',
    })
  })

  it('a queue whose remaining points ALL wait on the user passes, and says so (point 450)', () => {
    expect(
      slotReasonDecision({
        agents: 1,
        openPoints: [
          { point: 500, files: ['src/world/world.ts'], gated: true },
          { point: 501, files: ['docs/x.md'], gated: true },
        ],
        runningFiles: running,
      }),
    ).toMatchObject({ needsReason: false, why: 'queue-user-gated', candidates: [] })
  })

  it('but a MIXED queue still reports the overlap it really has', () => {
    expect(
      slotReasonDecision({
        agents: 1,
        openPoints: [
          { point: 500, files: ['scripts/batch-singleton.mjs'] },
          { point: 501, files: ['docs/x.md'], gated: true },
        ],
        runningFiles: running,
      }),
    ).toMatchObject({ needsReason: false, why: 'queue-overlaps' })
  })

  it('and ONE workable point beside the gated ones still demands a reason', () => {
    expect(
      slotReasonDecision({
        agents: 1,
        openPoints: [
          { point: 500, files: ['src/world/world.ts'], gated: true },
          { point: 501, files: ['src/ui/Hud.tsx'] },
        ],
        runningFiles: running,
      }),
    ).toMatchObject({ needsReason: true, why: 'idle-slots', candidates: [{ point: 501 }] })
  })

  it('a PAUSED batch and a recorded CLOSING FREEZE both pass', () => {
    expect(
      slotReasonDecision({ agents: 1, openPoints: independent, runningFiles: running, paused: true }),
    ).toMatchObject({ needsReason: false, why: 'paused' })
    expect(
      slotReasonDecision({ agents: 1, openPoints: independent, runningFiles: running, closingFreeze: true }),
    ).toMatchObject({ needsReason: false, why: 'closing-freeze' })
  })

  it('a junk cap or agent count falls back rather than demanding on nonsense', () => {
    expect(slotReasonDecision({ agents: NaN, openPoints: independent, runningFiles: running }).slotsFree).toBe(POOL_CAP)
    expect(slotReasonDecision({ agents: 1, openPoints: independent, runningFiles: running, cap: 0 }).slotsFree).toBe(
      POOL_CAP - 1,
    )
    expect(() => slotReasonDecision()).not.toThrow()
    expect(slotReasonDecision().needsReason).toBe(false)
  })
})

describe('the running-file set comes from the worktree too, not only from a --branch', () => {
  // WITHOUT THIS THE WHOLE SLOT CHECK GOES DARK in the commonest shape there is: an
  // agent declared with `--worktree` alone names no ref, so the running-file set came
  // back empty — and an empty set is deliberately read as "the overlap question
  // cannot be answered", which never demands anything. A worktree knows its branch.
  it('derives the branch from a real worktree and diffs it against main', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-slots-'))
    try {
      const git = (...args) =>
        execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
          windowsHide: true,
          cwd: dir,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
      git('init', '-q', '-b', 'main', '.')
      writeFileSync(join(dir, 'seed.txt'), 'seed\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'seed')
      git('checkout', '-q', '-b', 'feat/500-x')
      mkdirSync(join(dir, 'scripts'), { recursive: true })
      writeFileSync(join(dir, 'scripts', 'thing.mjs'), 'export const a = 1\n')
      git('add', '-A')
      git('commit', '-q', '-m', 'the agent commits')
      git('checkout', '-q', 'main')

      expect(worktreeBranch(dir, { cwd: dir })).toBe('refs/heads/main')
      // The agent's own branch, named directly, is what the diff is taken of.
      expect(runningBranchFiles([{ kind: 'branch', ref: 'refs/heads/feat/500-x' }], { cwd: dir })).toEqual([
        'scripts/thing.mjs',
      ])
      // …and a worktree checked out on that branch answers the same, with no --branch.
      git('checkout', '-q', 'feat/500-x')
      expect(worktreeBranch(dir, { cwd: dir })).toBe('refs/heads/feat/500-x')
      expect(runningBranchFiles([{ kind: 'worktree', path: dir }], { cwd: dir })).toEqual(['scripts/thing.mjs'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a gone worktree, a detached HEAD or a non-repo answers null and contributes nothing', () => {
    const gone = join(tmpdir(), 'hoa-slots-does-not-exist-427')
    expect(worktreeBranch(gone)).toBe(null)
    expect(runningBranchFiles([{ kind: 'worktree', path: gone }])).toEqual([])
    expect(runningBranchFiles([{ kind: 'pid', pid: 1 }])).toEqual([])
    expect(runningBranchFiles([])).toEqual([])
    expect(runningBranchFiles()).toEqual([])
  })
})

describe('slotsRemedy — the block must name BOTH honest answers', () => {
  const slots = { agents: 1, slotsFree: 2, candidates: [{ point: 500 }, { point: 501 }] }

  it('names commissioning another point AND stating why the queue is unsuitable', () => {
    const text = slotsRemedy({ slots })
    expect(text).toMatch(/COMMISSION another point/)
    expect(text).toMatch(/STATE what\s+makes the queue's next points unsuitable/)
    expect(text).toContain('--slots-free')
    expect(text).toContain('feat/<point>-<slug>')
  })

  it('names the numbers and the candidate points, so the reader need not go looking', () => {
    const text = slotsRemedy({ slots })
    expect(text).toContain('1 agent(s) running')
    expect(text).toContain(`2 of ${POOL_CAP} slots FREE`)
    expect(text).toContain('500, 501')
  })

  it('lists the states that need no reason at all — it must not read as a nag', () => {
    const text = slotsRemedy({ slots })
    expect(text).toMatch(/paused batch, a recorded closing freeze and a full pool need no reason/)
  })

  it('survives an empty or absent slot report', () => {
    expect(() => slotsRemedy()).not.toThrow()
    expect(slotsRemedy()).toContain('see the work order')
    expect(slotsRemedy({ slots: { candidates: [null, {}] } })).toContain('see the work order')
  })
})

describe('progressGuardDecision — the wait is allowed once the slots are accounted for', () => {
  const waiting = {
    sid: 's1',
    paused: false,
    openCount: 5,
    formatSuspect: false,
    ownership: 'mine',
    unhandledAlert: false,
    inFlight: true,
  }

  it('a declared, live wait with accounted slots still allows the stop', () => {
    expect(progressGuardDecision(waiting)).toBe('allow-in-flight')
    expect(progressGuardDecision({ ...waiting, slotsNeedReason: false })).toBe('allow-in-flight')
  })

  it('…and BLOCKS while the free slots are unexplained', () => {
    expect(progressGuardDecision({ ...waiting, slotsNeedReason: true })).toBe('block-slots-free')
  })

  it('the new verdict never overrides the ones that outrank the wait', () => {
    expect(progressGuardDecision({ ...waiting, slotsNeedReason: true, paused: true })).toBe('allow')
    expect(progressGuardDecision({ ...waiting, slotsNeedReason: true, unhandledAlert: true })).toBe('block-remediate')
    expect(progressGuardDecision({ ...waiting, slotsNeedReason: true, ownership: 'held' })).toBe('stand-down')
    expect(
      progressGuardDecision({ ...waiting, slotsNeedReason: true, boundary: { valid: true, point: 427 }, launcher: 'armed' }),
    ).toBe('allow-boundary')
    expect(progressGuardDecision({ ...waiting, slotsNeedReason: true, claim: 'release' })).toBe('allow-release')
  })

  it('with nothing in flight the slot question never arises', () => {
    expect(progressGuardDecision({ ...waiting, inFlight: false, slotsNeedReason: true })).toBe('block-continue')
  })
})

describe('closingFreezeActive — the freeze must be recognisable WITHOUT a file nobody writes', () => {
  const HEAD = 'a'.repeat(40)
  const state = (commit, steps) => ({ commit, steps })
  const step = { evidence: 'LARGE regression green on both backends' }

  it('a closing checklist recorded for the CURRENT head IS a freeze', () => {
    expect(closingFreezeActive({ closingState: state(HEAD, { 'large-regression': step }), head: HEAD })).toEqual({
      active: true,
      why: 'closing-state-for-head',
    })
  })

  it('…and one recorded for a DIFFERENT commit is not — a closing is per-commit', () => {
    expect(
      closingFreezeActive({ closingState: state('b'.repeat(40), { 'large-regression': step }), head: HEAD }).active,
    ).toBe(false)
  })

  it('the hand-placed marker still counts, whatever the state says', () => {
    expect(closingFreezeActive({ marker: true }).why).toBe('freeze-marker')
    expect(closingFreezeActive({ marker: true, closingState: null, head: '' }).active).toBe(true)
  })

  it('a blank tick is not a recorded step, so it is not a freeze', () => {
    expect(closingFreezeActive({ closingState: state(HEAD, { 'large-regression': { evidence: '  ' } }), head: HEAD }).active).toBe(
      false,
    )
    expect(closingFreezeActive({ closingState: state(HEAD, {}), head: HEAD }).active).toBe(false)
  })

  it('nothing readable answers NO freeze — a failed read must not silence the nudge', () => {
    expect(closingFreezeActive().active).toBe(false)
    expect(closingFreezeActive({ closingState: null, head: HEAD }).active).toBe(false)
    expect(closingFreezeActive({ closingState: 'garbage', head: HEAD }).active).toBe(false)
    expect(closingFreezeActive({ closingState: state(HEAD, { 'large-regression': step }), head: '' }).active).toBe(false)
  })
})

describe('statusVerdict — `--status` must not promise a stop the hook then blocks', () => {
  const declaration = { at: 1, waitingOn: 'an agent building 500', evidence: [{ kind: 'branch', ref: 'feat/500-x' }] }

  it('THE TRAP: live evidence AND unexplained free slots reads BLOCKED, not allowed', () => {
    // The old print keyed on `live` alone. This is the exact state point 427 added,
    // and calling it ALLOWED would send the session into the block it just checked.
    expect(statusVerdict({ declaration, live: true, slots: { needsReason: true } })).toEqual({
      verdict: 'blocked',
      why: 'slots-free',
    })
  })

  it('a live wait with accounted slots is allowed, however the slots were accounted for', () => {
    for (const slots of [null, undefined, { needsReason: false, why: 'at-cap' }, { why: 'reason-given' }]) {
      expect(statusVerdict({ declaration, live: true, slots }), String(slots?.why)).toEqual({
        verdict: 'allowed',
        why: 'live',
      })
    }
  })

  it('nothing declared is its own verdict — not a block', () => {
    expect(statusVerdict({ declaration: null, live: false, reason: 'no-declaration' }).verdict).toBe('none')
    expect(statusVerdict().verdict).toBe('none')
  })

  it('a declaration that is not live keeps reporting the reason it failed on', () => {
    expect(statusVerdict({ declaration, live: false, reason: 'evidence-gone' })).toEqual({
      verdict: 'blocked',
      why: 'evidence-gone',
    })
    // A missing reason still says BLOCKED rather than inventing an allowance.
    expect(statusVerdict({ declaration, live: false })).toEqual({ verdict: 'blocked', why: 'not-live' })
    // …and only a literal `true` is live: a truthy string must not open the gate.
    expect(statusVerdict({ declaration, live: 'yes' }).verdict).toBe('blocked')
  })

  it('agrees with the guard on every combination — one truth, two readers', () => {
    const guard = (inFlight, slotsNeedReason) =>
      progressGuardDecision({
        sid: 's1',
        paused: false,
        openCount: 5,
        formatSuspect: false,
        ownership: 'mine',
        unhandledAlert: false,
        inFlight,
        slotsNeedReason,
      })
    for (const needsReason of [false, true]) {
      const status = statusVerdict({ declaration, live: true, slots: { needsReason } })
      const allowed = guard(true, needsReason).startsWith('allow')
      expect(status.verdict === 'allowed', `needsReason=${needsReason}`).toBe(allowed)
    }
  })
})

// The branch sweep read the declaration RAW — no age, no liveness — while the
// expiry lived in a consumer it never called, so a dead session's declaration
// shielded its branch and worktree from the sweep for ever (point 437 G).
describe('declarationShields — the expiry the branch sweep now applies too', () => {
  const NOW = 1_800_000_000_000
  const decl = (ageMs) => ({ at: NOW - ageMs, evidence: [{ kind: 'branch', ref: 'feat/x' }] })

  it('shields a fresh declaration', () => {
    const v = declarationShields({ declaration: decl(60_000), now: NOW })
    expect(v).toMatchObject({ shields: true, reason: 'live' })
    expect(v.ageMs).toBe(60_000)
  })

  it('stops shielding once it is older than the wait side would accept', () => {
    expect(declarationShields({ declaration: decl(IN_FLIGHT_MAX_AGE_MS + 1), now: NOW })).toMatchObject({
      shields: false,
      reason: 'expired',
    })
  })

  it('uses the SAME bound as the wait side, exactly on the boundary', () => {
    expect(declarationShields({ declaration: decl(IN_FLIGHT_MAX_AGE_MS), now: NOW }).shields).toBe(true)
  })

  it('honours a calibrated bound', () => {
    expect(declarationShields({ declaration: decl(120_000), now: NOW, maxAgeMs: 60_000 }).shields).toBe(false)
  })

  it('shields on a stamp from the future rather than reasoning about a broken clock', () => {
    expect(declarationShields({ declaration: decl(-60_000), now: NOW })).toMatchObject({
      shields: true,
      reason: 'clock-skew',
    })
  })

  it('shields whatever it cannot read — an unreadable file is not proof the work ended', () => {
    expect(declarationShields({ declaration: null, now: NOW }).shields).toBe(true)
    expect(declarationShields({ declaration: {}, now: NOW })).toMatchObject({ shields: true, reason: 'no-timestamp' })
    expect(declarationShields({ declaration: { at: 'soon' }, now: NOW }).shields).toBe(true)
    expect(declarationShields().shields).toBe(true)
  })
})
