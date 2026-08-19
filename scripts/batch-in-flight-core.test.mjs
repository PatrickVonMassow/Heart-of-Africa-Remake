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
  pastEtaCards,
  waitEtaRefusal,
  adoptionAssessment,
  assessTransfer,
  markTransferred,
  transferBlockMessage,
  POOL_CAP,
  COMMISSION_RECORD_PATH,
  pointOfBranch,
  normalizeActiveWork,
  unattributableEvidenceAlerts,
  describeBranchAge,
  parseCommissionRecord,
  commissionOverrideFor,
  recordCommissionOverride,
  recordParkedBranch,
  clearParkedBranch,
  commissionRecordReport,
  openBranchSlots,
  branchSlotDecision,
  branchSlotRefusal,
  commissionTarget,
  normaliseTip,
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
  adoptTransferred,
  commandNamesRun,
  gatherHandoverTransfer,
  processCommandOf,
  runRecordFor,
  gatherInFlight,
  gatherSlots,
  openFeatBranches,
  maxAgeMs,
  readDeclaration,
  resolveRefName,
  sealedCommitRefusal,
  selfAdoptionRefusal,
  transferredMutationRefusal,
  writeDeclaration,
  clearDeclaration,
  worktreeBranch,
  worktreeActiveAt,
  worktreeFilesActiveAt,
  runningBranchFiles,
  tagEvidencePoint,
} from './batch-in-flight.mjs'
import { selfCommandLine } from './verify/run-record.mjs'

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

describe('normalizeActiveWork — the board\'s structured point source', () => {
  const openPoints = new Set([697, 700, 711])

  it('combines the focused point with tagged strands and deduplicates repeated evidence', () => {
    const result = normalizeActiveWork({
      focusPoint: 700,
      openPoints,
      declaration: {
        evidence: [
          { kind: 'branch', point: 697, phase: 'authoring' },
          { kind: 'worktree', point: 697, phase: 'counter-read' },
          { kind: 'pid', point: 711, phase: 'verification' },
        ],
      },
    })
    expect(result).toMatchObject({ ok: true, points: [700, 697, 711], focusPoint: 700 })
  })

  it('keeps transfer and landing continuity active but excludes explicit exit phases', () => {
    const result = normalizeActiveWork({
      openPoints,
      declaration: {
        evidence: [
          { point: 697, phase: 'transferred' },
          { point: 700, phase: 'ready-to-land' },
          { point: 711, phase: 'returned' },
        ],
      },
    })
    expect(result).toMatchObject({ ok: true, points: [697, 700] })
  })

  it('does not promote undeclared feat branches into active work', () => {
    expect(normalizeActiveWork({ openPoints, declaration: null, focusPoint: null, openBranches: [
      'feat/697-a', 'feat/700-b', 'feat/711-c', 'feat/1', 'feat/2', 'feat/3', 'feat/4', 'feat/5', 'feat/6',
    ] })).toMatchObject({ ok: true, points: [] })
  })

  it('derives legacy branch and worktree strands without consulting undeclared branches', () => {
    const result = normalizeActiveWork({
      focusPoint: 713,
      openPoints: new Set([713]),
      declaration: {
        evidence: [
          { kind: 'branch', ref: 'refs/heads/feat/713-now-section-derived' },
          { kind: 'worktree', path: '/workspace/hoa/.claude/worktrees/point-713' },
        ],
      },
      worktreeRef: (path) => path.endsWith('/point-713') ? 'refs/heads/feat/713-now-section-derived' : null,
    })
    expect(result).toMatchObject({ ok: true, points: [713], focusPoint: 713, errors: [] })
  })

  it('stamps branch/worktree evidence from its own strand and pid/log evidence from the declared focus', () => {
    expect(tagEvidencePoint({ kind: 'branch', ref: 'feat/697-a' }, { currentPoint: 700 })).toMatchObject({
      point: 697,
      phase: 'authoring',
    })
    expect(tagEvidencePoint({ kind: 'worktree', path: '/w/711' }, {
      currentPoint: 700,
      worktreeRef: 'refs/heads/feat/711-c',
    })).toMatchObject({ point: 711 })
    expect(tagEvidencePoint({ kind: 'log', path: '/w/run.log' }, { currentPoint: 700, phase: 'verification' }))
      .toMatchObject({ point: 700, phase: 'verification' })
  })

  it.each([
    ['unreadable source', { readable: false }],
    ['untagged evidence with no derivable point', { declaration: { evidence: [{ kind: 'branch', ref: 'main' }] } }],
    ['malformed point', { declaration: { evidence: [{ point: 'x' }] } }],
    ['closed point', { declaration: { evidence: [{ point: 699 }] } }],
    ['unknown phase', { declaration: { evidence: [{ point: 697, phase: 'maybe' }] } }],
    ['contradicted checkpoint', { checkpointContradicted: true }],
  ])('returns unknown rather than an empty active set for %s', (_label, over) => {
    const result = normalizeActiveWork({ openPoints, ...over })
    expect(result.ok).toBe(false)
    expect(result.points).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('an EMPTY open-point set is a verified "nothing is open", never a free pass', () => {
    // Sixth cross-review: the old `open.size > 0` guard skipped the membership
    // check entirely when nothing was open, so any declared strand sailed
    // through on the fail-closed publish side.
    const declared = { declaration: { evidence: [{ point: 697 }] } }
    const result = normalizeActiveWork({ openPoints: new Set(), ...declared })
    expect(result).toMatchObject({ ok: false, points: [] })
    expect(result.errors.join(' ')).toContain('not open')
    // …and a numbered focus against the empty set refuses the same way.
    expect(normalizeActiveWork({ openPoints: [], focusPoint: 700 }).ok).toBe(false)
    // The genuinely idle record stays a valid zero.
    expect(normalizeActiveWork({ openPoints: new Set(), declaration: null, focusPoint: null }))
      .toMatchObject({ ok: true, points: [] })
  })
})

describe('unattributableEvidenceAlerts — an adoption never succeeds silently into an empty board', () => {
  it('names every kept item that stays point-less after the migration, with the human way out', () => {
    const alerts = unattributableEvidenceAlerts(
      [
        { kind: 'branch', ref: 'feat/700-x', point: 700 },
        { kind: 'pid', pid: 77 },
        { kind: 'log', path: '/l' },
        { kind: 'worktree', path: '/w/point-713' },
      ],
      { worktreeRef: (p) => (p === '/w/point-713' ? 'refs/heads/feat/713-x' : null) },
    )
    expect(alerts).toHaveLength(2)
    expect(alerts[0]).toContain('pid 77')
    expect(alerts[1]).toContain('log /l')
    for (const alert of alerts) expect(alert).toContain('batch-in-flight.mjs --clear')
  })

  it('stays silent when every item is attributed, and never throws on junk', () => {
    expect(unattributableEvidenceAlerts([{ kind: 'branch', ref: 'feat/700-x', point: 700 }])).toEqual([])
    // Point-carrying pid/log evidence is attributed by the SAME field (seventh
    // cross-review): an implementation that complained about pid/log by KIND,
    // regardless of the recorded point, would block every valid adoption.
    expect(unattributableEvidenceAlerts([
      { kind: 'pid', pid: 77, point: 700 },
      { kind: 'log', path: '/l', point: 697 },
    ])).toEqual([])
    expect(unattributableEvidenceAlerts()).toEqual([])
    expect(unattributableEvidenceAlerts([null, 'x'])).toEqual([])
  })

  it('skips a point-less TERMINAL item, exactly as the read side does', () => {
    // Seventh cross-review: `normalizeActiveWork` returns on a terminal phase
    // BEFORE resolving the point, so this item never refuses the record — an
    // alert here falsely claimed a refusal and recommended the whole clear.
    expect(unattributableEvidenceAlerts([{ kind: 'log', path: '/l', phase: 'landed' }])).toEqual([])
    // The declaration-level phase is the same fallback the read side applies…
    expect(unattributableEvidenceAlerts([{ kind: 'pid', pid: 77 }], { declarationPhase: 'completed' })).toEqual([])
    // …and an item's own phase wins over it, in both directions.
    expect(
      unattributableEvidenceAlerts([{ kind: 'pid', pid: 77, phase: 'verification' }], { declarationPhase: 'landed' }),
    ).toHaveLength(1)
    expect(
      unattributableEvidenceAlerts([{ kind: 'pid', pid: 77, phase: 'returned' }], { declarationPhase: 'authoring' }),
    ).toEqual([])
    // A point-less ACTIVE item still alerts — that one the read side refuses.
    expect(unattributableEvidenceAlerts([{ kind: 'log', path: '/l', phase: 'authoring' }])).toHaveLength(1)
  })
})

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

  // POINT 675 (defeat 2) REVERSED the old rule here: a due boundary is no longer
  // waited out behind a TRANSFERABLE wait — the successor adopts that work.
  // Only work WITHOUT a committed-and-pushed checkpoint still shields the wait.
  it('a DUE boundary is demanded through a TRANSFERABLE wait — the successor adopts the work (point 675)', () => {
    expect(progressGuardDecision({ ...base, inFlight: true, boundaryDue: 388 })).toBe('block-take-boundary')
    expect(progressGuardDecision({ ...base, inFlight: true, inFlightTransferable: true, boundaryDue: 388 })).toBe(
      'block-take-boundary',
    )
  })

  it('NON-transferable work still passes the DUE boundary — ending on it would throw it away', () => {
    expect(progressGuardDecision({ ...base, inFlight: true, inFlightTransferable: false, boundaryDue: 388 })).toBe(
      'allow-in-flight',
    )
    // …and the slots demand still outranks the wait there.
    expect(
      progressGuardDecision({
        ...base,
        inFlight: true,
        inFlightTransferable: false,
        boundaryDue: 388,
        slotsNeedReason: true,
      }),
    ).toBe('block-slots-free')
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
    const d = slotReasonDecision({ agents: 1, openBranches: 1, openPoints: independent, runningFiles: running })
    expect(d).toMatchObject({ needsReason: true, agents: 1, openBranches: 1, slotsFree: POOL_CAP - 1, why: 'idle-slots' })
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
    // Full of AGENTS here, which since point 712 is the separately named state:
    // the occupancy rule counts branches, the agent cap still binds a spawn — and
    // the SLOT count stays the branch count, so a full set of agents that cut no
    // branch reports the branch slots it really left free (Sol, review of 3078d166).
    expect(
      slotReasonDecision({ agents: POOL_CAP, openPoints: independent, runningFiles: running }),
    ).toMatchObject({ needsReason: false, slotsFree: POOL_CAP, openBranches: 0, why: 'agents-at-cap' })
    expect(
      slotReasonDecision({ openBranches: POOL_CAP, openPoints: independent, runningFiles: running }),
    ).toMatchObject({ needsReason: false, slotsFree: 0, why: 'at-cap' })
    // …and over the cap is not negative slots.
    expect(
      slotReasonDecision({ openBranches: POOL_CAP + 2, openPoints: independent, runningFiles: running }).slotsFree,
    ).toBe(0)
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
    expect(
      slotReasonDecision({ agents: 1, openBranches: 1, openPoints: independent, runningFiles: running, cap: 0 }).slotsFree,
    ).toBe(POOL_CAP - 1)
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
  const slots = { agents: 1, openBranches: 1, slotsFree: 2, candidates: [{ point: 500 }, { point: 501 }] }

  it('names commissioning another point AND stating why the queue is unsuitable', () => {
    const text = slotsRemedy({ slots })
    expect(text).toMatch(/COMMISSION another point/)
    expect(text).toMatch(/STATE what\s+makes the queue's next points unsuitable/)
    expect(text).toContain('--slots-free')
    expect(text).toContain('feat/<point>-<slug>')
  })

  it('names the numbers and the candidate points, so the reader need not go looking', () => {
    const text = slotsRemedy({ slots })
    expect(text).toContain('1 open feat/* branch(es)')
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

// Point 661: a declared wait is the session's licence to produce no turn end for
// up to an hour, so the now-card's "~HH:MM" promise must be checked HERE — the
// `now-eta-past` audit only fires at turn ends, and on 12.08.2026 the published
// promise aged 50 minutes deep while every mechanism held green.
describe('a wait is refused while the board promises an end time that has passed (point 661)', () => {
  const board = (meta, { withNowCard = true } = {}) =>
    `<main><h1>B</h1>` +
    `<details class="sect"><summary><h2>Woran ich gerade arbeite</h2></summary>\n` +
    (withNowCard
      ? `<details class="now"><summary><span class="t">388 — T</span><span class="right">` +
        `<span class="meta">${meta}</span></span></summary><div class="body"><p>Stand 14:12 — läuft</p></div></details>\n`
      : '') +
    `</details>` +
    `<details class="sect"><summary><h2>Warteschlange</h2></summary>\n</details>` +
    `<footer>Stand: 12.08.2026 · 1 offene Punkte</footer></main>`

  it('names the card whose ETA is past — point, meta and how far past', () => {
    const past = pastEtaCards({ html: board('10:44 · ~11:15'), nowMinutes: 13 * 60 })
    expect(past).toHaveLength(1)
    expect(past[0]).toMatchObject({ points: [388], meta: '10:44 · ~11:15', minutesPast: 105 })
    const refusal = waitEtaRefusal({ html: board('10:44 · ~11:15'), nowMinutes: 13 * 60 })
    expect(refusal).toContain('388')
    expect(refusal).toContain('10:44 · ~11:15')
    expect(refusal).toContain('~HH:MM')
    expect(refusal).toContain('board-publish')
    expect(refusal).toContain('re-declare')
  })

  it('a future ETA passes', () => {
    expect(pastEtaCards({ html: board('10:44 · ~15:15'), nowMinutes: 13 * 60 })).toEqual([])
    expect(waitEtaRefusal({ html: board('10:44 · ~15:15'), nowMinutes: 13 * 60 })).toBeNull()
  })

  it('keeps the audit grace: only past the grace minutes does the promise count as broken', () => {
    expect(waitEtaRefusal({ html: board('10:44 · ~13:00'), nowMinutes: 13 * 60 + 4 })).toBeNull()
    expect(waitEtaRefusal({ html: board('10:44 · ~13:00'), nowMinutes: 13 * 60 + 6 })).not.toBeNull()
  })

  it('no now-card, or a card without an estimate, passes', () => {
    expect(waitEtaRefusal({ html: board('', { withNowCard: false }), nowMinutes: 13 * 60 })).toBeNull()
    expect(waitEtaRefusal({ html: board('10:44'), nowMinutes: 13 * 60 })).toBeNull()
  })

  it('FAIL-OPEN: an unreadable board or an unavailable clock refuses nothing', () => {
    expect(waitEtaRefusal({ html: null, nowMinutes: 13 * 60 })).toBeNull()
    expect(waitEtaRefusal({ html: undefined, nowMinutes: 13 * 60 })).toBeNull()
    expect(waitEtaRefusal({ html: '<main>not a board</main>', nowMinutes: 13 * 60 })).toBeNull()
    expect(waitEtaRefusal({ html: board('10:44 · ~11:15'), nowMinutes: null })).toBeNull()
    expect(waitEtaRefusal({})).toBeNull()
  })

  it('an estimate across midnight is not falsely past — and a genuinely broken one still is', () => {
    // 23:40 · ~00:30 at 23:50: the end wraps to the next day, 40 min left.
    expect(waitEtaRefusal({ html: board('23:40 · ~00:30'), nowMinutes: 23 * 60 + 50 })).toBeNull()
    // Same card at 00:50, past midnight: 20 min past — refused, on one clock.
    const past = pastEtaCards({ html: board('23:40 · ~00:30'), nowMinutes: 50 })
    expect(past).toHaveLength(1)
    expect(past[0].minutesPast).toBe(20)
  })
})

// ---------------------------------------------------------------------------
// THE TRANSFERABLE ADOPTION RECORD (point 675, defeat 2; merged proposal
// M4/M7/M28–M34). Written from the failure side: what must BLOCK a handover,
// and what a successor must be TOLD rather than silently spared.
// ---------------------------------------------------------------------------
describe('assessTransfer — committed-and-pushed checkpoints decide transferability', () => {
  const pushed = { ref: 'feat/700-x', localSha: 'a'.repeat(40), remoteSha: 'a'.repeat(40) }

  it('a branch whose tip is on origin is transferable, and its checkpoint is recorded', () => {
    const t = assessTransfer({ items: [{ kind: 'branch', describe: 'branch feat/700-x', checkpoint: pushed }] })
    expect(t.transferable).toBe(true)
    expect(t.checkpoints).toEqual([{ ref: 'feat/700-x', sha: 'a'.repeat(40) }])
  })

  it('unpushed commits BLOCK — the successor could not verify or rescue them', () => {
    const t = assessTransfer({
      items: [
        { kind: 'branch', describe: 'branch feat/700-x', checkpoint: { ...pushed, remoteSha: 'b'.repeat(40) } },
      ],
    })
    expect(t.transferable).toBe(false)
    expect(t.blockers[0].why).toContain('unpushed commits')
  })

  it('a never-pushed branch and an unreadable checkpoint both block, by name', () => {
    expect(
      assessTransfer({ items: [{ kind: 'branch', describe: 'b', checkpoint: { ...pushed, remoteSha: null } }] })
        .blockers[0].why,
    ).toContain('never pushed')
    expect(
      assessTransfer({ items: [{ kind: 'worktree', describe: 'w', checkpoint: null }] }).blockers[0].why,
    ).toContain('no committed checkpoint')
  })

  it('a declaration of ONLY pids/logs is non-transferable — nothing a successor could adopt (M29)', () => {
    const t = assessTransfer({
      items: [
        { kind: 'pid', describe: 'pid 123', checkpoint: null },
        { kind: 'log', describe: 'log x.log', checkpoint: null },
      ],
    })
    expect(t.transferable).toBe(false)
    expect(t.blockers[0].why).toContain('only pids/logs')
  })

  it('pid/log evidence RIDES beside a pushed branch without blocking', () => {
    const t = assessTransfer({
      items: [
        { kind: 'branch', describe: 'branch feat/700-x', checkpoint: pushed },
        { kind: 'pid', describe: 'pid 123', checkpoint: null },
      ],
    })
    expect(t.transferable).toBe(true)
  })

  it('an EMPTY declaration blocks nothing — there is nothing to lose', () => {
    expect(assessTransfer({ items: [] }).transferable).toBe(true)
  })

  it('the refusal names every blocker and all four recovery choices (M29)', () => {
    const msg = transferBlockMessage({
      blockers: [{ describe: 'branch feat/700-x', why: 'unpushed commits' }],
    })
    expect(msg).toContain('feat/700-x')
    for (const word of ['CHECKPOINT', 'DRAIN', 'RE-DECLARE', 'ABANDON']) expect(msg).toContain(word)
  })

  // --- A RUNNING VERIFICATION IS TRANSFERABLE (point 700) --------------------
  // The 17.08.2026 defeat: a background suite run (pid + log, no branch) made
  // `--prepare --context` demand a DRAIN, pinning the session past the very
  // mark at which leaving is worth the most. A log whose RUN RECORD can be read
  // is a named, awaitable run, so it is adoptable output — held to the same
  // evidence bar as a branch (Sol review of d0aebb6, finding 2): live or
  // receipted, and covering the HEAD being handed over.
  const HEAD_NOW = 'abc1234'
  const run = {
    recordPath: '/repo/local/verify-logs/x.log.run.json',
    suites: ['world', 'polish'],
    backends: ['webgl'],
    head: 'abc1234',
    pid: 4242,
    alive: true,
    log: 'local/verify-logs/x.log',
    status: 'running',
    hasReceipt: false,
  }
  const logItem = (r) => ({ kind: 'log', describe: 'log x.log', checkpoint: null, run: r })

  it('a LIVE declared run transfers — the handover proceeds instead of demanding a drain', () => {
    const t = assessTransfer({ items: [logItem(run)], headNow: HEAD_NOW })
    expect(t.transferable).toBe(true)
    expect(t.runs).toEqual([run])
  })

  it('a FINISHED run with its receipt transfers too — the verdict is readable now, dead pid or not', () => {
    const finished = { ...run, status: 'finished', alive: false, hasReceipt: true }
    const t = assessTransfer({ items: [logItem(finished)], headNow: HEAD_NOW })
    expect(t.transferable).toBe(true)
    expect(t.runs).toEqual([finished])
  })

  it('a self-declared "finished" WITHOUT its receipt blocks — status never substitutes for the readable verdict', () => {
    const unstamped = { ...run, status: 'finished', alive: false, hasReceipt: false }
    const t = assessTransfer({ items: [logItem(unstamped)], headNow: HEAD_NOW })
    expect(t.transferable).toBe(false)
    expect(t.blockers[0].why).toContain('no receipt')
    // …and an ABSENT hasReceipt field is the same absence of evidence.
    const { hasReceipt: _drop, ...bare } = unstamped
    expect(assessTransfer({ items: [logItem(bare)], headNow: HEAD_NOW }).transferable).toBe(false)
  })

  it('a record still saying "running" over a DEAD pid blocks — the receipt would never arrive', () => {
    const t = assessTransfer({ items: [logItem({ ...run, alive: false })], headNow: HEAD_NOW })
    expect(t.transferable).toBe(false)
    expect(t.blockers[0].why).toContain('receipt that never arrives')
    // …and an UNPROBEABLE pid is unknown, which is not evidence of life either.
    expect(assessTransfer({ items: [logItem({ ...run, alive: null })], headNow: HEAD_NOW }).transferable).toBe(false)
  })

  it('a run of ANOTHER HEAD blocks, naming both commits', () => {
    const t = assessTransfer({ items: [logItem({ ...run, head: 'ffff999' })], headNow: HEAD_NOW })
    expect(t.transferable).toBe(false)
    expect(t.blockers[0].why).toContain('ffff999')
    expect(t.blockers[0].why).toContain(HEAD_NOW)
  })

  it('an UNVERIFIABLE HEAD blocks — established evidence only', () => {
    expect(assessTransfer({ items: [logItem({ ...run, head: null })], headNow: HEAD_NOW }).transferable).toBe(false)
    expect(assessTransfer({ items: [logItem(run)], headNow: null }).transferable).toBe(false)
    // A short recorded head still covers the full sha it abbreviates.
    expect(
      assessTransfer({ items: [logItem(run)], headNow: 'abc1234def5678900000' }).transferable,
    ).toBe(true)
  })

  it('an abbreviation below git\'s meaningful length is NO match — nor is anything non-hex', () => {
    const full = 'abc1234def5678900000'
    // The hole the old prefix test left: a one-character recorded head
    // "covered" any HEAD starting with that character.
    expect(assessTransfer({ items: [logItem({ ...run, head: 'a' })], headNow: full }).transferable).toBe(false)
    // The 6-vs-7 boundary: six hex chars refuse, seven match.
    expect(assessTransfer({ items: [logItem({ ...run, head: 'abc123' })], headNow: full }).transferable).toBe(false)
    expect(assessTransfer({ items: [logItem({ ...run, head: 'abc1234' })], headNow: full }).transferable).toBe(true)
    // Non-hex never abbreviates a sha, whatever its length.
    expect(
      assessTransfer({ items: [logItem({ ...run, head: 'mainline' })], headNow: 'mainline' }).transferable,
    ).toBe(false)
  })

  it('a declared run WITHOUT a record keeps today\'s refusal — a bare log proves nothing', () => {
    const t = assessTransfer({ items: [logItem(null)], headNow: HEAD_NOW })
    expect(t.transferable).toBe(false)
    expect(t.blockers[0].why).toContain('only pids/logs')
  })

  it('a run rides beside a pushed branch, and both are recorded for the successor', () => {
    const t = assessTransfer({
      items: [{ kind: 'branch', describe: 'branch feat/700-x', checkpoint: pushed }, logItem(run)],
      headNow: HEAD_NOW,
    })
    expect(t.transferable).toBe(true)
    expect(t.checkpoints).toHaveLength(1)
    expect(t.runs).toEqual([run])
  })

  it('a run does not excuse an UNPUSHED branch — the branch still blocks by name', () => {
    const t = assessTransfer({
      items: [
        { kind: 'branch', describe: 'branch feat/700-x', checkpoint: { ...pushed, remoteSha: null } },
        logItem(run),
      ],
      headNow: HEAD_NOW,
    })
    expect(t.transferable).toBe(false)
  })

  it('markTransferred carries the runs to the successor, and omits the field when none were declared', () => {
    const declaration = { v: 1, sessionId: 's1', at: 1, waitingOn: 'a run', evidence: [{ kind: 'log', path: 'x.log' }] }
    const withRun = markTransferred({ declaration, bySid: 's1', now: 9, checkpoints: [], runs: [run] })
    expect(withRun.transfer.runs).toEqual([run])
    const withoutRun = markTransferred({ declaration, bySid: 's1', now: 9, checkpoints: [] })
    expect(withoutRun.transfer.runs).toBeUndefined()
  })
})

describe('runRecordFor — the run record beside a declared log, reduced for the transfer', () => {
  // The bare default invocation, as a RECYCLED pid would re-run it. The live
  // wrapper's argv always carries its log path (`--log-file`, by hand or via
  // the default launch's re-exec — Sol round 4).
  const wrapperCmd = 'node /repo/scripts/verify/run-logged.mjs world'
  const liveWrapperCmd = 'node /repo/scripts/verify/run-logged.mjs --log-file local/verify-logs/x.log world'

  const record = {
    suites: ['world'],
    backends: ['webgpu'],
    head: 'abc1234',
    pid: 77,
    log: 'local/verify-logs/x.log',
    cmdline: wrapperCmd,
    status: 'running',
    polls: 3,
    receipt: null,
  }

  it('pairs <log>.run.json, PROBES the pid and keeps only what the successor needs', () => {
    const seen = []
    const r = runRecordFor('/repo/local/verify-logs/x.log', {
      read: (p) => {
        seen.push(p)
        return record
      },
      probe: (pid) => ({ exists: pid === 77, startedAt: null }),
      commandOf: () => liveWrapperCmd,
    })
    expect(seen[0].replace(/\\/g, '/')).toBe('/repo/local/verify-logs/x.log.run.json')
    expect(r).toEqual({
      recordPath: seen[0],
      suites: ['world'],
      backends: ['webgpu'],
      head: 'abc1234',
      pid: 77,
      alive: true,
      log: 'local/verify-logs/x.log',
      status: 'running',
      hasReceipt: false,
    })
  })

  it('a dead pid, a throwing probe and an absent pid read false / null / null — never assumed alive', () => {
    const withProbe = (probe, rec = record) =>
      runRecordFor('/repo/x.log', { read: () => rec, probe, commandOf: () => liveWrapperCmd })
    expect(withProbe(() => ({ exists: false })).alive).toBe(false)
    expect(
      withProbe(() => {
        throw new Error('EPERM')
      }).alive,
    ).toBe(null)
    expect(withProbe(() => ({ exists: true }), { ...record, pid: null }).alive).toBe(null)
  })

  it('a RECYCLED pid — existing, but running something else — is NOT alive; identity, not existence', () => {
    const withCommand = (commandOf, rec = record) =>
      runRecordFor('/repo/x.log', { read: () => rec, probe: () => ({ exists: true, startedAt: null }), commandOf })
    // The stranger process that inherited the wrapper's number.
    expect(withCommand(() => '/usr/bin/chrome --headless=new').alive).toBe(false)
    // A command that merely MENTIONS the wrapper is not the wrapper.
    expect(withCommand(() => 'grep -rn run-logged.mjs docs/').alive).toBe(false)
    // An unreadable command line is UNKNOWN — refused by the bar, never assumed.
    expect(withCommand(() => null).alive).toBe(null)
    // The genuine wrapper: its argv names the record's log — EVERY wrapper's
    // does, because the default launch re-execs itself with `--log-file`.
    expect(
      withCommand(() => 'node /repo/scripts/verify/run-logged.mjs --log-file local/verify-logs/x.log world').alive,
    ).toBe(true)
    // …the DECLARED absolute spelling of the same log counts too.
    expect(withCommand(() => 'node /repo/scripts/verify/run-logged.mjs --log-file /repo/x.log world').alive).toBe(true)
    // A recycled pid re-running the IDENTICAL bare invocation is not this run
    // (Sol round 4): without the log path in argv there is no identity,
    // however verbatim-equal the command line reads against the recorded one.
    expect(withCommand(() => wrapperCmd).alive).toBe(false)
    // The SAME wrapper on ANOTHER run — a recycled pid running run-logged.mjs
    // for a different suite — is not THIS record's process (Sol round 3).
    expect(withCommand(() => 'node /repo/scripts/verify/run-logged.mjs polish').alive).toBe(false)
    // A wrapper on a DIFFERENT log is another run, not this record's.
    expect(
      withCommand(() => 'node /repo/scripts/verify/run-logged.mjs --log-file local/verify-logs/other.log world')
        .alive,
    ).toBe(false)
  })

  it('commandNamesRun demands the record log path in the argv, not just the wrapper name', () => {
    const logs = { logPaths: ['local/verify-logs/x.log'] }
    // The recorded log path standing in the wrapper's argv, in either path
    // style, is the identity.
    expect(
      commandNamesRun('node scripts\\verify\\run-logged.mjs --log-file local\\verify-logs\\x.log world', logs),
    ).toBe(true)
    // The wrapper name ALONE identifies no run — an IDENTICAL bare argv
    // included (Sol round 4: a recycled pid re-running the same default
    // invocation verbatim must not read as this record's run).
    expect(commandNamesRun('node scripts/verify/run-logged.mjs world', logs)).toBe(false)
    expect(commandNamesRun('node run-logged.mjs', { logPaths: [] })).toBe(false)
    // A different program carrying the log path is not the wrapper.
    expect(commandNamesRun('node scripts/verify/run-all.mjs --log-file local/verify-logs/x.log', logs)).toBe(false)
    expect(commandNamesRun('', logs)).toBe(false)
    expect(commandNamesRun(null, logs)).toBe(false)
  })

  it('commandNamesRun demands the path as the --log-file VALUE — a --show reader is not the run (Sol round 5)', () => {
    const logs = { logPaths: ['local/verify-logs/x.log'] }
    // The READER of the recorded log: gate 1 passes (it IS run-logged.mjs),
    // but the path stands behind --show — a process reading the record's log,
    // not the run that writes it. The any-word scan read this as ALIVE.
    expect(commandNamesRun('node scripts/verify/run-logged.mjs --show local/verify-logs/x.log --tail 40', logs)).toBe(
      false,
    )
    // The path as a bare operand is not the run either.
    expect(commandNamesRun('node scripts/verify/run-logged.mjs local/verify-logs/x.log', logs)).toBe(false)
    // The attached spelling is the same value.
    expect(commandNamesRun('node scripts/verify/run-logged.mjs --log-file=local/verify-logs/x.log world', logs)).toBe(
      true,
    )
    // A trailing --log-file with no value names nothing.
    expect(commandNamesRun('node scripts/verify/run-logged.mjs --log-file', logs)).toBe(false)
  })

  it('commandNamesRun compares the path case-sensitively; only the program name folds (Sol round 5)', () => {
    const logs = { logPaths: ['local/verify-logs/x.log'] }
    // POSIX: X.log and x.log are two files — the folded compare conflated two
    // runs into one identity.
    expect(commandNamesRun('node scripts/verify/run-logged.mjs --log-file local/verify-logs/X.log world', logs)).toBe(
      false,
    )
    // The program-name gate still folds: a Windows spelling is the wrapper.
    expect(commandNamesRun('NODE C:/repo/scripts/verify/Run-Logged.mjs --log-file local/verify-logs/x.log', logs)).toBe(
      true,
    )
    // A candidate log path CONTAINING whitespace has no recoverable argv
    // spelling (the /proc reading is space-joined) — it DENIES outright,
    // never a piecewise match.
    expect(
      commandNamesRun('node scripts/verify/run-logged.mjs --log-file "local/verify logs/x.log"', {
        logPaths: ['local/verify logs/x.log'],
      }),
    ).toBe(false)
  })

  it('commandNamesRun judges the INVOKED script — run-logged.mjs as data is not the wrapper', () => {
    // The program word is node, the invoked script unrelated.mjs; the wrapper
    // name and even the log path ride along as arguments (Sol round 3,
    // finding 2).
    expect(
      commandNamesRun('node unrelated.mjs run-logged.mjs local/verify-logs/x.log', {
        logPaths: ['local/verify-logs/x.log'],
      }),
    ).toBe(false)
    // The recorded log path merely MENTIONED by a non-wrapper is not the run.
    expect(
      commandNamesRun('grep -rn local/verify-logs/x.log docs/', { logPaths: ['local/verify-logs/x.log'] }),
    ).toBe(false)
    // The recorded log path standing in the WRAPPER's argv is.
    expect(
      commandNamesRun('node scripts/verify/run-logged.mjs --log-file local/verify-logs/x.log test:small', {
        logPaths: ['local/verify-logs/x.log'],
      }),
    ).toBe(true)
    // The script executed directly still counts as the wrapper.
    expect(
      commandNamesRun('scripts/verify/run-logged.mjs --log-file local/verify-logs/x.log world', {
        logPaths: ['local/verify-logs/x.log'],
      }),
    ).toBe(true)
  })

  it('selfCommandLine and processCommandOf read one process through one lens', () => {
    if (process.platform === 'win32') return // the CIM path needs a real CIM round trip
    expect(selfCommandLine()).toBe(processCommandOf(process.pid))
    expect(selfCommandLine()).toBeTruthy()
  })

  it('reads the receipt off the record itself', () => {
    const done = { ...record, status: 'finished', receipt: { exitCode: 0 } }
    expect(runRecordFor('/repo/x.log', { read: () => done, probe: () => ({ exists: false }) }).hasReceipt).toBe(true)
  })

  it('answers null for a missing or unreadable record, and for an empty path', () => {
    expect(
      runRecordFor('/repo/x.log', {
        read: () => {
          throw new Error('ENOENT')
        },
      }),
    ).toBe(null)
    expect(runRecordFor('/repo/x.log', { read: () => 'not an object', probe: () => ({ exists: false }) })).toBe(null)
    expect(runRecordFor('', { read: () => record })).toBe(null)
  })
})

describe('markTransferred — the adoption record stays probeable (M4/M7)', () => {
  it('keeps the declaration intact and records who, when and which checkpoints', () => {
    const declaration = { v: 1, sessionId: 's1', at: 1, waitingOn: 'agent', evidence: [{ kind: 'branch', ref: 'b' }] }
    const t = markTransferred({ declaration, bySid: 's1', now: 99, checkpoints: [{ ref: 'b', sha: 'x' }] })
    expect(t.evidence).toEqual(declaration.evidence)
    expect(t.transfer).toEqual({ v: 1, by: 's1', at: 99, checkpoints: [{ ref: 'b', sha: 'x' }] })
  })

  it('the transfer is a write, so it migrates: legacy evidence leaves with its point recorded', () => {
    // Sixth cross-review: writing the legacy evidence back unchanged handed
    // the successor a declaration without its once-only migration.
    const declaration = {
      v: 1,
      sessionId: 's1',
      at: 1,
      waitingOn: 'agent',
      evidence: [
        { kind: 'branch', ref: 'feat/700-context-fence' },
        { kind: 'worktree', path: '/w/point-713' },
        { kind: 'log', path: '/l' },
      ],
    }
    const t = markTransferred({
      declaration,
      bySid: 's1',
      now: 9,
      checkpoints: [],
      worktreeRef: (p) => (p === '/w/point-713' ? 'refs/heads/feat/713-now-section-derived' : null),
    })
    expect(t.evidence).toEqual([
      { kind: 'branch', ref: 'feat/700-context-fence', point: 700 },
      { kind: 'worktree', path: '/w/point-713', point: 713 },
      // What resolves to nothing stays byte-identical: nothing is invented.
      { kind: 'log', path: '/l' },
    ])
    expect(declaration.evidence[0]).toEqual({ kind: 'branch', ref: 'feat/700-context-fence' })
  })

  it('a RE-TRANSFER supersedes the old adoption, so the record stays protected (Sol re-review, finding 1)', () => {
    const adoptedOnce = {
      v: 1,
      sessionId: 's2',
      at: 5,
      waitingOn: 'agent',
      evidence: [{ kind: 'branch', ref: 'b' }],
      transfer: { v: 1, by: 's1', at: 2, checkpoints: [] },
      adopted: { from: 's1', at: 3 },
    }
    const again = markTransferred({ declaration: adoptedOnce, bySid: 's2', now: 9, checkpoints: [] })
    expect(again.adopted).toBeUndefined()
    expect(again.transfer.by).toBe('s2')
    // …and the mutation refusal therefore covers the whole second handover too.
    const marker = { v: 2, phase: 'committed', cause: 'point', sessionId: 's2', point: 1, at: 10 }
    expect(transferredMutationRefusal({ declaration: again, marker, now: 11 })).not.toBeNull()
  })
})

describe('sealedCommitRefusal — no NEW wait behind a committed boundary (Sol re-review, finding 2)', () => {
  const sealed = { v: 2, phase: 'committed', cause: 'point', sessionId: SID, point: 675, at: NOW - 1000 }

  it('refuses a fresh --waiting-on for the committing session, naming the way back', () => {
    const msg = sealedCommitRefusal({ marker: sealed, sid: SID, now: NOW })
    expect(msg).toContain('COMMITTED')
    expect(msg).toContain('batch-boundary.mjs --clear')
  })

  it('refuses nothing for a stale, foreign, legacy or absent marker', () => {
    expect(sealedCommitRefusal({ marker: null, sid: SID, now: NOW })).toBeNull()
    expect(sealedCommitRefusal({ marker: { ...sealed, phase: undefined }, sid: SID, now: NOW })).toBeNull()
    expect(sealedCommitRefusal({ marker: sealed, sid: 'someone-else', now: NOW })).toBeNull()
    expect(sealedCommitRefusal({ marker: sealed, sid: '', now: NOW })).toBeNull()
    expect(
      sealedCommitRefusal({ marker: { ...sealed, at: NOW - 2 * 60 * 60 * 1000 }, sid: SID, now: NOW }),
    ).toBeNull()
  })
})

describe('adoptionAssessment — expired or contradictory evidence ALERTS, never silently unblocks (M7)', () => {
  const live = { ok: true, kind: 'branch', describe: 'branch b', detail: 'tip 2 min old' }
  const dead = { ok: false, kind: 'pid', describe: 'pid 42', detail: 'process-gone' }
  const sha = 'c'.repeat(40)

  it('adopts live evidence, DROPS and NAMES what expired', () => {
    const a = adoptionAssessment({ items: [live, dead], checkpointStates: [] })
    expect(a.adopt).toBe(true)
    expect(a.kept).toHaveLength(1)
    expect(a.dropped).toHaveLength(1)
    expect(a.alerts[0]).toContain('pid 42')
  })

  it('REFUSES when nothing survives — with an alert, not silence', () => {
    const a = adoptionAssessment({ items: [dead], checkpointStates: [] })
    expect(a.adopt).toBe(false)
    expect(a.alerts.some((l) => l.includes('NOTHING'))).toBe(true)
  })

  it('a branch REWOUND below its recorded checkpoint contradicts the record and refuses', () => {
    const a = adoptionAssessment({
      items: [live],
      checkpointStates: [{ ref: 'b', recordedSha: sha, localSha: 'd'.repeat(40), ancestor: false }],
    })
    expect(a.adopt).toBe(false)
    expect(a.alerts.some((l) => l.includes('CONTRADICTED'))).toBe(true)
  })

  it('a branch that moved FORWARD from its checkpoint is still the handed-over work', () => {
    const a = adoptionAssessment({
      items: [live],
      checkpointStates: [{ ref: 'b', recordedSha: sha, localSha: 'd'.repeat(40), ancestor: true }],
    })
    expect(a.adopt).toBe(true)
  })

  it('a GONE checkpoint branch refuses loudly', () => {
    const a = adoptionAssessment({
      items: [live],
      checkpointStates: [{ ref: 'b', recordedSha: sha, localSha: null }],
    })
    expect(a.adopt).toBe(false)
    expect(a.alerts.some((l) => l.includes('gone'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// THE TRANSFER'S LIFECYCLE (Sol review of 807c2bf, findings 4 and 6): the
// transfer is session-bound and idempotent, and a transferred record under a
// live committed boundary may not be cleared or overwritten from this side.
// ---------------------------------------------------------------------------
describe('gatherHandoverTransfer — session-bound and idempotent', () => {
  const withTempLock = (fn) => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-transfer-'))
    const lockPath = join(dir, 'batch-lock.json')
    try {
      fn({ lockPath, path: statePathsFor(lockPath).inFlightPath })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('an ALREADY-TRANSFERRED declaration is not re-judged — commit only repeats its summary', () => {
    withTempLock(({ lockPath, path }) => {
      writeDeclaration(
        declaration({ transfer: { v: 1, by: SID, at: 1, checkpoints: [{ ref: 'feat/x', sha: 'a'.repeat(40) }] } }),
        path,
      )
      const t = gatherHandoverTransfer(SID, { lockPath })
      expect(t.blocked).toBe(false)
      expect(t.note).toContain('already awaits adoption')
      expect(t.commit()).toContain('feat/x@aaaaaaaa')
      // Nothing was rewritten: the original transfer stamp survives.
      expect(readDeclaration(path).transfer.at).toBe(1)
    })
  })

  it('a FOREIGN declaration neither blocks this owner nor gets transferred (finding 6)', () => {
    withTempLock(({ lockPath, path }) => {
      writeDeclaration(
        declaration({ sessionId: 'someone-else', evidence: [{ kind: 'branch', ref: 'feat/unpushed' }] }),
        path,
      )
      const t = gatherHandoverTransfer(SID, { lockPath })
      expect(t.blocked).toBe(false)
      expect(t.note).toContain('foreign')
      expect(t.commit).toBeNull()
      expect(readDeclaration(path).transfer).toBeUndefined()
    })
  })

  it('the OWN pid/log-only declaration still blocks with the named recovery choices', () => {
    withTempLock(({ lockPath, path }) => {
      writeDeclaration(declaration({ evidence: [{ kind: 'pid', pid: 1234, startedAt: 1 }] }), path)
      const t = gatherHandoverTransfer(SID, { lockPath })
      expect(t.blocked).toBe(true)
      expect(t.message).toContain('only pids/logs')
      expect(t.message).toContain('CHECKPOINT')
    })
  })

  it('the PREDECESSOR may not adopt its own handover while its committed marker stands (Sol final round)', () => {
    withTempLock(({ lockPath, path }) => {
      writeDeclaration(
        declaration({ transfer: { v: 1, by: SID, at: 1, checkpoints: [] } }),
        path,
      )
      writeFileSync(
        statePathsFor(lockPath).boundaryPath,
        JSON.stringify({ v: 2, phase: 'committed', cause: 'point', sessionId: SID, point: 675, at: Date.now() }),
      )
      const a = adoptTransferred(SID, { lockPath })
      expect(a.adopted).toBe(false)
      expect(a.reason).toBe('own-commit')
      expect(a.alerts[0]).toContain('batch-boundary.mjs --clear')
      // The record itself is untouched — nothing was stamped adopted.
      expect(readDeclaration(path).adopted).toBeUndefined()
    })
  })

  it('…and not once its marker is STALE or GONE either — the transfer stamp names the transferrer', () => {
    // THE OPEN FINDING of the rescue commit: tying the refusal to a FRESH
    // committed marker leaves the defect open twice over — a marker one hour
    // old, and a marker deleted by anything that rewrites the state file. The
    // record's own `transfer.by` is what does not expire.
    for (const marker of [null, { v: 2, phase: 'committed', cause: 'point', sessionId: SID, point: 675, at: 1 }]) {
      withTempLock(({ lockPath, path }) => {
        writeDeclaration(declaration({ transfer: { v: 1, by: SID, at: 1, checkpoints: [] } }), path)
        if (marker) writeFileSync(statePathsFor(lockPath).boundaryPath, JSON.stringify(marker))
        const a = adoptTransferred(SID, { lockPath })
        expect(a.adopted).toBe(false)
        expect(a.reason).toBe('own-transfer')
        expect(a.alerts[0]).toContain('--waiting-on')
        expect(readDeclaration(path).adopted).toBeUndefined()
      })
    }
  })

  it('a SUCCESSOR is not caught by the self-adoption rule', () => {
    withTempLock(({ lockPath, path }) => {
      writeDeclaration(declaration({ transfer: { v: 1, by: SID, at: 1, checkpoints: [] } }), path)
      writeFileSync(
        statePathsFor(lockPath).boundaryPath,
        JSON.stringify({ v: 2, phase: 'committed', cause: 'point', sessionId: SID, point: 675, at: Date.now() }),
      )
      // Its evidence is a dead session's, so the ordinary assessment refuses —
      // but NOT as a self-adoption: the successor is judged on the work, not
      // on who transferred it.
      const a = adoptTransferred('session-successor', { lockPath })
      expect(['own-commit', 'own-transfer']).not.toContain(a.reason)
    })
  })
})

// ---------------------------------------------------------------------------
// THE ADOPTION ITSELF, run for real against the declaration file (seventh
// cross-review): the sixth round's alert stood BESIDE `adopted: true`, so the
// CLI printed ADOPTED and exited 0 while the read side discarded the whole
// record one look later. These cases pin the WRITE path, not the alert helper.
// ---------------------------------------------------------------------------
describe('adoptTransferred — unattributable kept evidence refuses BEFORE the write', () => {
  const withTempLock = (fn) => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-adopt-'))
    const lockPath = join(dir, 'batch-lock.json')
    try {
      fn({ dir, lockPath, path: statePathsFor(lockPath).inFlightPath })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  /** A transferred declaration whose evidence is FRESH log files — the probe
   *  keeps them, so the attribution question is what decides the adoption. */
  const transferred = (evidence) => ({
    v: 1,
    sessionId: 'session-predecessor',
    at: Date.now(),
    waitingOn: 'a delegated agent',
    transfer: { v: 1, by: 'session-predecessor', at: Date.now(), checkpoints: [] },
    evidence,
  })

  it('refuses with the human way out and writes NOTHING while a kept live item resolves to no point', () => {
    withTempLock(({ dir, lockPath, path }) => {
      const log = join(dir, 'agent.log')
      writeFileSync(log, 'still writing')
      const before = transferred([
        { kind: 'log', path: log, point: 700, phase: 'authoring' },
        { kind: 'log', path: log },
      ])
      writeDeclaration(before, path)
      const a = adoptTransferred('session-successor', { lockPath })
      expect(a.adopted).toBe(false)
      expect(a.reason).toBe('unattributable-evidence')
      expect(a.alerts.join(' ')).toContain('batch-in-flight.mjs --clear')
      // The record was NOT rewritten: no adopted stamp, still the
      // predecessor's, its evidence byte-identical.
      const after = readDeclaration(path)
      expect(after.adopted).toBeUndefined()
      expect(after.sessionId).toBe('session-predecessor')
      expect(after.evidence).toEqual(before.evidence)
    })
  })

  it('adopts point-carrying pid/log evidence cleanly — attribution is the recorded field, never the kind', () => {
    // The valid adoption a kind-based complaint would block (finding 3's
    // hostile implementation): the log item carries its point, so it adopts.
    withTempLock(({ dir, lockPath, path }) => {
      const log = join(dir, 'agent.log')
      writeFileSync(log, 'still writing')
      writeDeclaration(transferred([{ kind: 'log', path: log, point: 700, phase: 'authoring' }]), path)
      const a = adoptTransferred('session-successor', { lockPath })
      expect(a).toMatchObject({ adopted: true, reason: 'adopted', kept: 1, dropped: 0 })
      expect(a.alerts).toEqual([])
      const after = readDeclaration(path)
      expect(after.sessionId).toBe('session-successor')
      expect(after.adopted.from).toBe('session-predecessor')
    })
  })

  it('a point-less TERMINAL item never blocks the adoption — the read side skips it the same way', () => {
    withTempLock(({ dir, lockPath, path }) => {
      const log = join(dir, 'agent.log')
      writeFileSync(log, 'still writing')
      writeDeclaration(
        transferred([
          { kind: 'log', path: log, point: 700, phase: 'authoring' },
          { kind: 'log', path: log, phase: 'landed' },
        ]),
        path,
      )
      const a = adoptTransferred('session-successor', { lockPath })
      expect(a).toMatchObject({ adopted: true, reason: 'adopted' })
      expect(readDeclaration(path).sessionId).toBe('session-successor')
    })
  })
})

describe('selfAdoptionRefusal — the transferrer is never the adopter (point 675)', () => {
  const transferred = declaration({ transfer: { v: 1, by: SID, at: 1, checkpoints: [] } })
  const sealed = { v: 2, phase: 'committed', cause: 'point', sessionId: SID, point: 675, at: NOW - 1000 }

  it('names the COMMIT while the marker stands, and the TRANSFER once it does not', () => {
    expect(selfAdoptionRefusal({ declaration: transferred, marker: sealed, sid: SID, now: NOW }).reason).toBe(
      'own-commit',
    )
    expect(selfAdoptionRefusal({ declaration: transferred, marker: null, sid: SID, now: NOW }).reason).toBe(
      'own-transfer',
    )
    expect(
      selfAdoptionRefusal({ declaration: transferred, marker: { ...sealed, at: NOW - 3 * 60 * 60 * 1000 }, sid: SID, now: NOW })
        .reason,
    ).toBe('own-transfer')
  })

  it('lets every other session through, and never fires without a transfer', () => {
    expect(selfAdoptionRefusal({ declaration: transferred, marker: sealed, sid: 'session-successor', now: NOW })).toBeNull()
    expect(selfAdoptionRefusal({ declaration: declaration({}), marker: sealed, sid: SID, now: NOW })).toBeNull()
    expect(selfAdoptionRefusal({ declaration: null, marker: sealed, sid: SID, now: NOW })).toBeNull()
    // A transfer stamped by nobody (an empty `by`) must not swallow every session.
    expect(
      selfAdoptionRefusal({
        declaration: declaration({ transfer: { v: 1, by: '', at: 1, checkpoints: [] } }),
        marker: null,
        sid: SID,
        now: NOW,
      }),
    ).toBeNull()
    // …and neither may a stranger's transfer, once no committed marker stands.
    expect(
      selfAdoptionRefusal({
        declaration: declaration({ transfer: { v: 1, by: 'session-predecessor', at: 1, checkpoints: [] } }),
        marker: null,
        sid: SID,
        now: NOW,
      }),
    ).toBeNull()
  })

  it('under this session\'s OWN fresh commit it refuses whoever transferred — without claiming it did (Sol on fa11223d)', () => {
    // Adoption writes the declaration under this session's identity, which IS
    // declaring a wait — the very thing `sealedCommitRefusal` denies behind a
    // committed marker. So the seal refuses; only the WORDING may not lie.
    for (const by of ['session-predecessor', '']) {
      const r = selfAdoptionRefusal({
        declaration: declaration({ transfer: { v: 1, by, at: 1, checkpoints: [] } }),
        marker: sealed,
        sid: SID,
        now: NOW,
      })
      expect(r.reason).toBe('sealed-commit')
      expect(r.alert).not.toContain('this session COMMITTED the boundary that transferred')
      expect(r.alert).toContain('--clear')
    }
  })
})

describe('transferredMutationRefusal — the adoption record is not this side’s to destroy (finding 4)', () => {
  const transferred = declaration({ transfer: { v: 1, by: SID, at: 1, checkpoints: [] } })
  const sealed = { v: 2, phase: 'committed', cause: 'point', sessionId: SID, point: 675, at: NOW - 1000 }

  it('refuses --clear/--waiting-on while a transferred record sits under a live committed marker', () => {
    const msg = transferredMutationRefusal({ declaration: transferred, marker: sealed, now: NOW })
    expect(msg).toContain('adoption record')
    expect(msg).toContain('--adopt')
    expect(msg).toContain('batch-boundary.mjs --clear')
  })

  it('allows mutation once the marker is gone, stale, or merely legacy', () => {
    expect(transferredMutationRefusal({ declaration: transferred, marker: null, now: NOW })).toBeNull()
    expect(
      transferredMutationRefusal({
        declaration: transferred,
        marker: { ...sealed, at: NOW - 2 * 60 * 60 * 1000 },
        now: NOW,
      }),
    ).toBeNull()
    expect(
      transferredMutationRefusal({ declaration: transferred, marker: { ...sealed, phase: undefined }, now: NOW }),
    ).toBeNull()
  })

  it('allows mutation for an untransferred or already-adopted declaration', () => {
    expect(transferredMutationRefusal({ declaration: declaration({}), marker: sealed, now: NOW })).toBeNull()
    expect(
      transferredMutationRefusal({
        declaration: { ...transferred, adopted: { from: SID, at: NOW } },
        marker: sealed,
        now: NOW,
      }),
    ).toBeNull()
    expect(transferredMutationRefusal({ declaration: null, marker: sealed, now: NOW })).toBeNull()
  })
})

// ---- A SLOT IS NOT FREE UNTIL ITS BRANCH IS GONE (point 712) ---------------

/** The evening the nine branches were counted. */
const AUG17 = Date.parse('2026-08-17T19:41:00.000Z')
const days = (n) => n * 86400000
const hours = (n) => n * 3600000

/** The nine open branches of 17.08.2026, exactly as they were measured. */
const NINE_BRANCHES = [
  { ref: 'feat/336-croc-staging', tipAt: AUG17 - days(13), behind: 1679 },
  { ref: 'feat/686-five-word-lexicon', tipAt: AUG17 - days(4), behind: 81 },
  { ref: 'feat/687-bank-game', tipAt: AUG17 - days(3), behind: 81 },
  { ref: 'feat/687-roam-bound-fixes', tipAt: AUG17 - hours(9), behind: 12 },
  { ref: 'feat/581-settlement-boundary-contrast', tipAt: AUG17 - hours(10), behind: 14 },
  { ref: 'feat/595-598-verification-ladder-brief', tipAt: AUG17 - hours(8), behind: 9 },
  { ref: 'feat/703-board-write-report', tipAt: AUG17 - hours(4), behind: 5 },
  { ref: 'feat/700-context-fence', tipAt: AUG17 - hours(2), behind: 2 },
  { ref: 'feat/711-queue-rank', tipAt: AUG17 - hours(1), behind: 1 },
]

describe('pointOfBranch / describeBranchAge — reading a branch name and an age', () => {
  it('reads the point out of a feat branch in every spelling git prints', () => {
    expect(pointOfBranch('feat/336-croc-staging')).toBe(336)
    expect(pointOfBranch('origin/feat/336-croc-staging')).toBe(336)
    expect(pointOfBranch('refs/heads/feat/712-queue-binds-picker')).toBe(712)
    expect(pointOfBranch('refs/remotes/origin/feat/595-598-verification-ladder-brief')).toBe(595)
  })

  it('answers null for anything that is not a numbered feat branch', () => {
    expect(pointOfBranch('main')).toBeNull()
    expect(pointOfBranch('worktree-agent-a1')).toBeNull()
    expect(pointOfBranch('feat/no-number')).toBeNull()
    expect(pointOfBranch('feat/0-zero')).toBeNull()
    expect(pointOfBranch('')).toBeNull()
    expect(pointOfBranch()).toBeNull()
  })

  it('says days past a day, hours past an hour, and admits when it cannot say', () => {
    expect(describeBranchAge(days(13))).toBe('13 d')
    expect(describeBranchAge(hours(9))).toBe('9 h')
    expect(describeBranchAge(45 * 60000)).toBe('45 min')
    expect(describeBranchAge(NaN)).toBe('age unknown')
    expect(describeBranchAge(null)).toBe('age unknown')
    expect(describeBranchAge(-5)).toBe('age unknown')
  })
})

describe('branchSlotDecision — the pool counts OPEN BRANCHES, not running agents', () => {
  it('marks the entire census unreadable when one requested behind-count fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-open-branches-'))
    const git = (...args) =>
      execFileSync('git', args, { cwd: dir, stdio: 'ignore', windowsHide: true, env: { ...process.env, LC_ALL: 'C' } })
    try {
      git('init', '-b', 'main')
      git('config', 'user.email', 'test@example.invalid')
      git('config', 'user.name', 'Test')
      writeFileSync(join(dir, 'base.txt'), 'base')
      git('add', 'base.txt')
      git('commit', '-m', 'base')
      git('switch', '-c', 'feat/712-test')
      writeFileSync(join(dir, 'work.txt'), 'work')
      git('add', 'work.txt')
      git('commit', '-m', 'work')
      git('switch', 'main')
      const result = openFeatBranches({ cwd: dir, behind: true, behindProbe: () => null })
      expect(result).toEqual({ readable: false, branches: [] })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('REFUSES a further point while the nine of 17.08.2026 stand open', () => {
    const d = branchSlotDecision({ branches: NINE_BRANCHES, point: 697, now: AUG17 })
    expect(d.allowed).toBe(false)
    expect(d.why).toBe('branches-open')
    expect(d.count).toBe(9)
    expect(d.slotsFree).toBe(0)
  })

  it('lists them OLDEST FIRST with age and behind-count, and names LAND and PARK', () => {
    const text = branchSlotRefusal(branchSlotDecision({ branches: NINE_BRANCHES, point: 697, now: AUG17 }))
    expect(text.split('\n').filter((line) => line.startsWith('  · '))).toEqual([
      '  · feat/336-croc-staging — 13 d, 1679 commits behind main',
      '  · feat/686-five-word-lexicon — 4 d, 81 commits behind main',
      '  · feat/687-bank-game — 3 d, 81 commits behind main',
      // Deliberately reversed in the fixture: input puts the 9-hour branch
      // first, so preserving input order fails this assertion.
      '  · feat/581-settlement-boundary-contrast — 10 h, 14 commits behind main',
      '  · feat/687-roam-bound-fixes — 9 h, 12 commits behind main',
      '  · feat/595-598-verification-ladder-brief — 8 h, 9 commits behind main',
      '  · feat/703-board-write-report — 4 h, 5 commits behind main',
      '  · feat/700-context-fence — 2 h, 2 commits behind main',
      '  · feat/711-queue-rank — 1 h, 1 commit behind main',
    ])
    expect(text).toContain('land-point.mjs')
    expect(text).toContain('--park')
    expect(text).toContain('697')
  })

  it('ALLOWS while only two branches stand open', () => {
    const two = NINE_BRANCHES.slice(0, 2)
    expect(branchSlotDecision({ branches: two, point: 697, now: AUG17 })).toMatchObject({
      allowed: true,
      why: 'slots-free',
      count: 2,
      slotsFree: 1,
    })
  })

  it('refuses at exactly the cap — three open branches are three occupied slots', () => {
    expect(branchSlotDecision({ branches: NINE_BRANCHES.slice(0, 3), point: 697, now: AUG17 }).allowed).toBe(false)
  })

  it('does not count a PARKED branch', () => {
    const parked = { 'feat/336-croc-staging': { reason: '1679 behind, superseded', at: '2026-08-17T18:00:00.000Z' } }
    const d = branchSlotDecision({ branches: NINE_BRANCHES.slice(0, 3), parked, point: 697, now: AUG17 })
    expect(d).toMatchObject({ allowed: true, why: 'slots-free', count: 2 })
    expect(d.parkedOut.map((b) => b.ref)).toEqual(['feat/336-croc-staging'])
    expect(d.parkedOut[0].reason).toBe('1679 behind, superseded')
  })

  it('takes a parked branch BACK into the count once it receives a commit', () => {
    const parked = { 'feat/336-croc-staging': { reason: 'superseded', at: '2026-08-17T18:00:00.000Z' } }
    // Its tip (13 days before 17.08.) is OLDER than the park → still parked.
    expect(branchSlotDecision({ branches: NINE_BRANCHES.slice(0, 3), parked, point: 697, now: AUG17 }).count).toBe(2)
    // A commit after the park makes it live work again.
    const moved = [{ ...NINE_BRANCHES[0], tipAt: Date.parse('2026-08-17T18:30:00.000Z') }, ...NINE_BRANCHES.slice(1, 3)]
    expect(branchSlotDecision({ branches: moved, parked, point: 697, now: AUG17 }).count).toBe(3)
  })

  // THE PARK EXPIRES AGAINST THE TIP, not against a clock (Sol, review of
  // 91d88f9a). Git's committer date is whole seconds and a rebase can preserve
  // it, so a timestamp comparison called real movement "still parked".
  describe('a park is measured against the branch TIP', () => {
    const at = '2026-08-17T18:00:00.000Z'
    const parkedAt = (tip) => ({ 'feat/336-croc-staging': { reason: 'superseded', at, tip } })
    const withTip = (tip, extra = {}) => [
      { ...NINE_BRANCHES[0], tip, ...extra },
      ...NINE_BRANCHES.slice(1, 3),
    ]

    it('stays parked while the tip is the one it was parked at', () => {
      expect(branchSlotDecision({ branches: withTip('a1b2c3d4'), parked: parkedAt('a1b2c3d4'), now: AUG17 }).count).toBe(
        2,
      )
    })

    it('returns to the count on a NEW tip, whatever the committer date says', () => {
      // The killing case: a commit in the same second as the park, and one whose
      // committer date was preserved from BEFORE it. Both moved; both count.
      const sameSecond = withTip('99ffee00', { tipAt: Date.parse(at) })
      expect(branchSlotDecision({ branches: sameSecond, parked: parkedAt('a1b2c3d4'), now: AUG17 }).count).toBe(3)
      const backdated = withTip('99ffee00', { tipAt: Date.parse('2026-08-01T10:00:00.000Z') })
      expect(branchSlotDecision({ branches: backdated, parked: parkedAt('a1b2c3d4'), now: AUG17 }).count).toBe(3)
    })

    it('stays parked while the tip cannot be read — an unreadable tip proves no movement', () => {
      const d = branchSlotDecision({ branches: withTip(''), parked: parkedAt('a1b2c3d4'), now: AUG17 })
      expect(d.count).toBe(2)
      // …but NOT silently (fourth review, finding 5): the entry is marked, so
      // the status can say the baseline could not be re-checked.
      expect(d.parkedOut).toHaveLength(1)
      expect(d.parkedOut[0]).toMatchObject({ ref: 'feat/336-croc-staging', tipUnverified: true })
      // A park whose tip WAS read carries no such mark.
      const clean = branchSlotDecision({ branches: withTip('a1b2c3d4'), parked: parkedAt('a1b2c3d4'), now: AUG17 })
      expect(clean.parkedOut[0].tipUnverified).toBeUndefined()
    })

    it('does NOT honour a park with no baseline at all, and says which one', () => {
      const noBaseline = { 'feat/336-croc-staging': { reason: 'superseded', at: 'not a date' } }
      const d = branchSlotDecision({ branches: NINE_BRANCHES.slice(0, 3), parked: noBaseline, point: 697, now: AUG17 })
      expect(d.count).toBe(3)
      expect(d.invalidParks.map((b) => b.ref)).toEqual(['feat/336-croc-staging'])
      expect(commissionRecordReport(parseCommissionRecord(JSON.stringify({ parked: noBaseline })))).toContain(
        'NO BASELINE',
      )
    })

    it('reads a tip only where it is one, and keeps it through the record', () => {
      expect(normaliseTip('A1B2C3D4')).toBe('a1b2c3d4')
      for (const bad of ['', 'zzzz', 'abc', null, 42, 'a'.repeat(65)]) expect(normaliseTip(bad)).toBe('')
      const rec = recordParkedBranch(parseCommissionRecord(''), 'feat/1-a', 'why', { at, tip: 'A1B2C3D4E5' })
      expect(parseCommissionRecord(JSON.stringify(rec)).parked['feat/1-a'].tip).toBe('a1b2c3d4e5')
      expect(commissionRecordReport(rec)).toContain('parked at a1b2c3d4')
      // A hand-edited nonsense tip is dropped, and the clock carries the park.
      const hand = parseCommissionRecord(JSON.stringify({ parked: { 'feat/1-a': { reason: 'why', at, tip: 'nope' } } }))
      expect(hand.parked['feat/1-a'].tip).toBe('')
    })
  })

  // WORK ASSIGNED BACK ONTO A PARKED BRANCH REOCCUPIES ITS SLOT AT THE
  // ASSIGNMENT (fourth review, findings 6 and 11). Counting parked branches
  // into the in-flight set read that assignment as `nothing-opened`, so at a
  // full pool the call passed and occupancy exceeded the cap the moment the
  // branch moved.
  describe('recommissioning a PARKED branch opens a slot again', () => {
    const at = '2026-08-17T18:00:00.000Z'
    const parked = { 'feat/336-croc-staging': { reason: 'superseded', at, tip: 'a1b2c3d4' } }
    const parked336 = { ...NINE_BRANCHES[0], tip: 'a1b2c3d4' }

    it('REFUSES at a full pool — the reassignment is an opening, not nothing', () => {
      // 336 parked, three LIVE branches: the pool is full.
      const branches = [parked336, ...NINE_BRANCHES.slice(1, 4)]
      const d = branchSlotDecision({
        branches,
        parked,
        points: [336],
        refs: ['feat/336-croc-staging'],
        now: AUG17,
      })
      expect(d.count).toBe(3)
      expect(d.adding).toBe(1)
      expect(d.allowed).toBe(false)
    })

    it('ALLOWS with room, counts the branch again, and NAMES the park to clear', () => {
      const branches = [parked336, ...NINE_BRANCHES.slice(1, 3)]
      const d = branchSlotDecision({
        branches,
        parked,
        points: [336],
        refs: ['feat/336-croc-staging'],
        now: AUG17,
      })
      expect(d).toMatchObject({ allowed: true, count: 2, adding: 1 })
      expect(d.reopens).toEqual(['feat/336-croc-staging'])
    })

    it('reads a POINT-only assignment (a spawn) onto a parked branch the same way', () => {
      const branches = [parked336, ...NINE_BRANCHES.slice(1, 4)]
      const d = branchSlotDecision({ branches, parked, points: [336], now: AUG17 })
      expect(d.adding).toBe(1)
      expect(d.allowed).toBe(false)
      expect(d.reopens).toEqual(['feat/336-croc-staging'])
    })

    it('projects every parked branch a point-wide assignment reoccupies', () => {
      const twoParks = {
        ...parked,
        'feat/336-second': { reason: 'alternate', at, tip: 'bb22cc33' },
      }
      const branches = [
        parked336,
        { ...parked336, ref: 'feat/336-second', tip: 'bb22cc33' },
        ...NINE_BRANCHES.slice(1, 3),
      ]
      const d = branchSlotDecision({ branches, parked: twoParks, points: [336], now: AUG17 })
      expect(d).toMatchObject({ count: 2, adding: 2, allowed: false })
      expect(d.reopens).toEqual(['feat/336-croc-staging', 'feat/336-second'])
    })

    it('a point with a LIVE branch beside its parked one is still being finished', () => {
      const parked687 = { 'feat/687-roam-bound-fixes': { reason: 'superseded', at, tip: 'ffee0011' } }
      const branches = [
        NINE_BRANCHES[2], // feat/687-bank-game, live
        { ...NINE_BRANCHES[3], tip: 'ffee0011' }, // feat/687-roam-bound-fixes, parked
        NINE_BRANCHES[1],
      ]
      const d = branchSlotDecision({ branches, parked: parked687, points: [687], now: AUG17 })
      expect(d).toMatchObject({ allowed: true, adding: 0, reopens: [] })
    })
  })

  it('keeps a parked branch parked when its tip date cannot be read', () => {
    const parked = { 'feat/336-croc-staging': { reason: 'superseded', at: '2026-08-17T18:00:00.000Z' } }
    const blind = [{ ref: 'feat/336-croc-staging', tipAt: null, behind: null }, ...NINE_BRANCHES.slice(1, 3)]
    expect(branchSlotDecision({ branches: blind, parked, point: 697, now: AUG17 }).count).toBe(2)
  })

  it('matches a park written in any git spelling of the same branch', () => {
    const parked = { 'origin/feat/336-croc-staging': { reason: 'superseded', at: '2026-08-17T18:00:00.000Z' } }
    expect(branchSlotDecision({ branches: NINE_BRANCHES.slice(0, 3), parked, point: 697, now: AUG17 }).count).toBe(2)
  })

  it('counts one branch once across its local and remote spellings', () => {
    const doubled = NINE_BRANCHES.slice(0, 3).flatMap((b) => [b, { ...b, ref: `origin/${b.ref}` }])
    expect(branchSlotDecision({ branches: doubled, point: 697, now: AUG17 }).count).toBe(3)
  })

  it('counts TWO branches for one point as two — both were real work standing open', () => {
    const both = [NINE_BRANCHES[2], NINE_BRANCHES[3]]
    expect(branchSlotDecision({ branches: both, point: 697, now: AUG17 }).count).toBe(2)
  })

  it('does not count the branch of the point being commissioned — that is finishing, not opening', () => {
    const three = NINE_BRANCHES.slice(0, 3)
    expect(branchSlotDecision({ branches: three, point: 336, now: AUG17 })).toMatchObject({
      allowed: true,
      count: 3,
      adding: 0,
    })
  })

  it('FAILS OPEN when git could not be questioned', () => {
    expect(branchSlotDecision({ branches: NINE_BRANCHES, point: 697, readable: false, now: AUG17 })).toMatchObject({
      allowed: true,
      why: 'branches-unreadable',
    })
  })

  it('keeps existing target branches in occupancy while naming every target', () => {
    const three = NINE_BRANCHES.slice(0, 3) // 336, 686, 687
    // Continuing two existing points adds nothing, but all three live branches
    // still occupy their slots.
    expect(branchSlotDecision({ branches: three, points: [336, 686], now: AUG17 })).toMatchObject({
      allowed: true,
      count: 3,
      adding: 0,
    })
    const d = branchSlotDecision({ branches: three, points: [705, 697], now: AUG17 })
    expect(d.allowed).toBe(false)
    expect(branchSlotRefusal(d)).toContain('opening points 705 and 697 would add 2 more')
  })

  // THE DECISIVE CAPACITY CASE (fourth review, finding 8): TWO occupied slots
  // plus TWO newly opened points. An implementation that ignores the second
  // commissioning computes 2+1 and allows; the real state the call would leave
  // is 4 branches under a cap of 3.
  it('refuses TWO points opened into ONE free slot — judged on the state the call would LEAVE', () => {
    const two = NINE_BRANCHES.slice(0, 2)
    const d = branchSlotDecision({ branches: two, points: [705, 697], now: AUG17 })
    expect(d.count).toBe(2)
    expect(d.adding).toBe(2)
    expect(d.allowed).toBe(false)
    // ONE of the two points alone fits the free slot.
    expect(branchSlotDecision({ branches: two, points: [705], now: AUG17 }).allowed).toBe(true)
    // Here landing ONE suffices (2+2−3), and the refusal says exactly that…
    expect(branchSlotRefusal(d)).toContain('one of them must go')
    // …while at THREE occupied plus two opened, landing one leaves the call
    // refused, and the refusal must demand TWO (finding 7).
    const worse = branchSlotDecision({ branches: NINE_BRANCHES.slice(0, 3), points: [705, 697], now: AUG17 })
    expect(worse.allowed).toBe(false)
    expect(branchSlotRefusal(worse)).toContain('2 of them must go')
  })

  it('tells an oversized empty-pool call to commission fewer targets', () => {
    const d = branchSlotDecision({ branches: [], points: [712, 713, 714, 715], cap: 3, now: AUG17 })
    expect(d).toMatchObject({ count: 0, adding: 4, allowed: false })
    const text = branchSlotRefusal(d)
    expect(text).toContain('THE CALL ITSELF EXCEEDS THE POOL CAP')
    expect(text).toContain('COMMISSION FEWER TARGETS')
    expect(text).toContain('at most 3 branches')
    expect(text).toContain('no existing branch to LAND or PARK')
    expect(text).not.toContain('one of them must go')
  })

  it('names both required remedies when landing every standing branch is not enough', () => {
    const one = [{ ...NINE_BRANCHES[0], tip: 'a1b2c3d4' }]
    const points = [701, 702, 703, 704]
    const refused = branchSlotDecision({ branches: one, points, cap: 3, now: AUG17 })
    expect(refused).toMatchObject({ count: 1, adding: 4, allowed: false })

    const text = branchSlotRefusal(refused)
    expect(text).toContain('feat/336-croc-staging')
    expect(text).toContain('LAND or PARK all 1 standing branch')
    expect(text).toContain('COMMISSION 1 FEWER branch-opening target')
    expect(text).toContain('Neither action alone frees enough slots')

    // Follow the complete remedy: remove the one named branch and one target.
    // Either printed way of removing the standing branch must then allow the
    // remaining three-target call under a cap of three.
    const smallerCall = points.slice(0, 3)
    expect(branchSlotDecision({ branches: [], points: smallerCall, cap: 3, now: AUG17 }).allowed).toBe(true)
    const rec = recordParkedBranch(parseCommissionRecord(''), 'feat/336-croc-staging', 'superseded by 701', {
      at: '2026-08-17T19:00:00.000Z',
      tip: 'a1b2c3d4',
    })
    expect(
      branchSlotDecision({ branches: one, parked: rec.parked, points: smallerCall, cap: 3, now: AUG17 }).allowed,
    ).toBe(true)

    // Prove why BOTH clauses are present: either half by itself remains refused.
    expect(branchSlotDecision({ branches: [], points, cap: 3, now: AUG17 }).allowed).toBe(false)
    expect(branchSlotDecision({ branches: one, points: smallerCall, cap: 3, now: AUG17 }).allowed).toBe(false)
  })

  it('refuses a mixed call that continues one occupied point and opens another at the cap', () => {
    const three = NINE_BRANCHES.slice(0, 3)
    const d = branchSlotDecision({ branches: three, points: [336, 705], now: AUG17 })
    expect(d).toMatchObject({ count: 3, adding: 1, allowed: false, why: 'branches-open' })
  })

  // THE REMEDY, FOLLOWED, LIFTS THE REFUSAL (fourth review, findings 7 and 12):
  // asserting two substrings proved nothing about the remedy being complete or
  // effective, so each named way out is taken here and the decision re-asked.
  it('following the refusal\'s remedy — LAND or PARK — flips the decision to allowed', () => {
    const three = [{ ...NINE_BRANCHES[0], tip: 'a1b2c3d4' }, ...NINE_BRANCHES.slice(1, 3)]
    const refused = branchSlotDecision({ branches: three, point: 705, now: AUG17 })
    expect(refused.allowed).toBe(false)
    const text = branchSlotRefusal(refused)
    // The refusal names the concrete branch to act on (oldest first) and the
    // complete park command shape, reason slot included.
    expect(text).toContain('one of them must go')
    expect(text.indexOf('feat/336-croc-staging')).toBeGreaterThan(-1)
    expect(text).toContain('--reason "<why>"')
    // (a) LAND the oldest: its branch gone, the same call fits.
    expect(branchSlotDecision({ branches: three.slice(1), point: 705, now: AUG17 }).allowed).toBe(true)
    // (b) PARK it exactly as the printed command records it — non-empty reason,
    // tip baseline — and the same call fits too.
    const rec = recordParkedBranch(parseCommissionRecord(''), 'feat/336-croc-staging', 'superseded by 703', {
      at: '2026-08-17T19:00:00.000Z',
      tip: 'a1b2c3d4',
    })
    expect(branchSlotDecision({ branches: three, parked: rec.parked, point: 705, now: AUG17 })).toMatchObject({
      allowed: true,
      count: 2,
    })
    // An EMPTY reason records no park at all, so the refusal stands.
    const silent = recordParkedBranch(parseCommissionRecord(''), 'feat/336-croc-staging', '   ', {
      at: '2026-08-17T19:00:00.000Z',
      tip: 'a1b2c3d4',
    })
    expect(branchSlotDecision({ branches: three, parked: silent.parked, point: 705, now: AUG17 }).allowed).toBe(false)
  })

  // A NAMED REF NARROWS THE EXEMPTION TO ITSELF (Sol, review of 3078d166). 687
  // stood on TWO branches on 17.08.2026; the point-wide exemption excused both
  // of them for a call that was cutting a THIRD.
  it('exempts only the branch a call NAMES, not every branch its point owns', () => {
    const three = NINE_BRANCHES.slice(0, 3) // 336, 686, 687-bank-game
    // Naming the branch that already stands: it is the one being finished.
    expect(
      branchSlotDecision({ branches: three, points: [687], refs: ['feat/687-bank-game'], cap: 3, now: AUG17 }),
    ).toMatchObject({ allowed: true, count: 3, adding: 0 })
    // Naming a branch that does NOT stand: all three keep their slots.
    expect(
      branchSlotDecision({ branches: three, points: [687], refs: ['feat/687-second'], cap: 3, now: AUG17 }),
    ).toMatchObject({ allowed: false, count: 3 })
    // Naming NOTHING keeps the point-wide exemption — the branch is unidentifiable.
    expect(branchSlotDecision({ branches: three, points: [687], cap: 3, now: AUG17 })).toMatchObject({
      allowed: true,
      count: 3,
      adding: 0,
    })
    // A ref for one point does not narrow ANOTHER point's exemption.
    expect(
      branchSlotDecision({ branches: three, points: [687, 686], refs: ['feat/687-second'], cap: 3, now: AUG17 }),
    ).toMatchObject({ count: 3 })
  })

  it('never throws on hostile input, and refuses nothing it cannot see', () => {
    expect(() => branchSlotDecision()).not.toThrow()
    expect(branchSlotDecision().allowed).toBe(true)
    expect(branchSlotDecision({ branches: 'nonsense' }).allowed).toBe(true)
    expect(branchSlotDecision({ branches: [null, {}, { ref: '   ' }] }).count).toBe(0)
    expect(() => branchSlotRefusal()).not.toThrow()
    expect(() => openBranchSlots()).not.toThrow()
  })

  it('caps the listing and says how many it left out', () => {
    const text = branchSlotRefusal(branchSlotDecision({ branches: NINE_BRANCHES, now: AUG17 }), { limit: 3 })
    expect(text).toContain('…and 6 more')
  })
})

describe('the commission record — an override is visible AFTERWARDS, not only when taken', () => {
  it('stores an override with the point and reports the reason back', () => {
    const rec = recordCommissionOverride(parseCommissionRecord(''), 697, 'red on main masks other suites', {
      at: '2026-08-17T19:41:00.000Z',
    })
    expect(commissionOverrideFor(rec, 697)).toBe('red on main masks other suites')
    expect(commissionOverrideFor(rec, 700)).toBe('')
    const text = commissionRecordReport(rec)
    expect(text).toContain('point 697')
    expect(text).toContain('red on main masks other suites')
    expect(text).toContain('2026-08-17T19:41:00.000Z')
  })

  it('refuses to store an EMPTY reason — that is the silence the mechanism forbids', () => {
    const empty = parseCommissionRecord('')
    expect(commissionOverrideFor(recordCommissionOverride(empty, 697, '   '), 697)).toBe('')
    expect(commissionOverrideFor(recordCommissionOverride(empty, 697, null), 697)).toBe('')
    expect(recordParkedBranch(empty, 'feat/336-croc-staging', '').parked).toEqual({})
    expect(recordCommissionOverride(empty, 0, 'why').overrides).toEqual({})
  })

  it('parks and unparks a branch under one spelling', () => {
    let rec = recordParkedBranch(parseCommissionRecord(''), 'origin/feat/336-croc-staging', 'superseded by 703', {
      at: '2026-08-17T19:00:00.000Z',
    })
    expect(Object.keys(rec.parked)).toEqual(['feat/336-croc-staging'])
    expect(commissionRecordReport(rec)).toContain('feat/336-croc-staging — superseded by 703')
    rec = clearParkedBranch(rec, 'refs/heads/feat/336-croc-staging')
    expect(rec.parked).toEqual({})
    expect(commissionRecordReport(rec)).toContain('Parked branches: none.')
  })

  it('round-trips through JSON, and survives a torn file by saying so', () => {
    const rec = recordParkedBranch(recordCommissionOverride(parseCommissionRecord(''), 697, 'why', { at: 'x' }), 'feat/1-a', 'parked')
    expect(parseCommissionRecord(JSON.stringify(rec))).toMatchObject({
      overrides: { 697: { reason: 'why', at: 'x' } },
      parked: { 'feat/1-a': { reason: 'parked', at: '' } },
      torn: false,
    })
    for (const bad of ['{', '[]', 'null', '"text"', '{"overrides":5}']) {
      const parsed = parseCommissionRecord(bad)
      expect(parsed.overrides).toEqual({})
      expect(parsed.parked).toEqual({})
    }
    expect(parseCommissionRecord('{').torn).toBe(true)
    expect(commissionRecordReport(parseCommissionRecord('{'))).toContain(COMMISSION_RECORD_PATH)
    expect(parseCommissionRecord('').torn).toBe(false)
    expect(parseCommissionRecord(null).torn).toBe(false)
    // A well-formed file with a hostile entry keeps only what it can trust.
    expect(parseCommissionRecord('{"overrides":{"x":{"reason":"a"},"7":{"reason":""}},"parked":{"":{"reason":"a"}}}'))
      .toMatchObject({ overrides: {}, parked: {}, torn: false })
  })

  it('never throws on hostile input', () => {
    expect(() => commissionRecordReport()).not.toThrow()
    expect(() => recordCommissionOverride(null, 1, 'a')).not.toThrow()
    expect(() => clearParkedBranch(null, 'feat/1-a')).not.toThrow()
    expect(commissionOverrideFor(null, 1)).toBe('')
  })
})

describe('slotReasonDecision — the target half counts the same occupancy as the refusal', () => {
  const independent = [{ point: 9, files: ['src/a.ts'] }]
  const running = ['src/b.ts']

  it('reads a full pool of OPEN BRANCHES as at-cap, however few agents run', () => {
    expect(
      slotReasonDecision({ agents: 1, openBranches: 9, openPoints: independent, runningFiles: running }),
    ).toMatchObject({ needsReason: false, why: 'at-cap', slotsFree: 0 })
  })

  it('still demands a reason where branches and agents both leave room', () => {
    expect(
      slotReasonDecision({ agents: 1, openBranches: 1, openPoints: independent, runningFiles: running }),
    ).toMatchObject({ needsReason: true, why: 'idle-slots' })
  })

  // REWRITTEN after Sol's review of 91d88f9a: the old case pinned the bare
  // `Math.max` and so pinned a divergence from the branch rule instead of the
  // rule. The two states are DIFFERENT and are now named as such — the branch
  // count is the occupancy point 712 specifies, and a full set of running agents
  // is the concurrent-agent cap of CLAUDE.md §6, which still binds a spawn.
  it('names WHICH cap is full — the branches, or the agents that have not cut one', () => {
    expect(slotReasonDecision({ agents: 0, openBranches: 3, openPoints: independent, runningFiles: running })).toMatchObject(
      { needsReason: false, why: 'at-cap', slotsFree: 0, openBranches: 3 },
    )
    // THE AGENT COUNT NEVER OCCUPIES A BRANCH SLOT (Sol, review of 3078d166):
    // three agents that cut no branch suppress the DEMAND under their own name,
    // and still report the three branch slots that really stand empty. Folding
    // the two into `max()` reported one free slot for a pool with none taken.
    expect(slotReasonDecision({ agents: 3, openBranches: 0, openPoints: independent, runningFiles: running })).toMatchObject(
      { needsReason: false, why: 'agents-at-cap', slotsFree: POOL_CAP, agents: 3, openBranches: 0 },
    )
    // Neither full: the demand stands, and both counts are reported SEPARATELY.
    expect(slotReasonDecision({ agents: 2, openBranches: 1, openPoints: independent, runningFiles: running })).toMatchObject(
      { needsReason: true, why: 'idle-slots', slotsFree: POOL_CAP - 1, agents: 2, openBranches: 1 },
    )
  })

  it('demands NOTHING while the branch count could not be read at all', () => {
    // A git that cannot be questioned reads as zero branches, which is exactly
    // what a repository with no open branch reads as — so the demand would fire
    // on unmeasured occupancy. It stands down instead.
    expect(
      slotReasonDecision({
        agents: 1,
        openBranches: 0,
        branchesReadable: false,
        openPoints: independent,
        runningFiles: running,
      }),
    ).toMatchObject({ needsReason: false, why: 'branches-unreadable' })
    // …but a PAUSE and a freeze still answer first: they are the stronger reason.
    expect(
      slotReasonDecision({ branchesReadable: false, paused: true, openPoints: independent, runningFiles: running }).why,
    ).toBe('paused')
  })

  it('carries a torn commission record into the pure slot decision and report', () => {
    expect(
      slotReasonDecision({
        agents: 1,
        openBranches: 3,
        recordReadable: false,
        openPoints: independent,
        runningFiles: running,
      }),
    ).toMatchObject({ needsReason: false, why: 'record-unreadable' })
    expect(gatherSlots({}, { recordProbe: () => ({ overrides: {}, parked: {}, torn: true }) })).toMatchObject({
      needsReason: false,
      why: 'record-unreadable',
    })
  })

  it('ignores a nonsensical branch count rather than inventing occupancy', () => {
    expect(
      slotReasonDecision({ agents: 1, openBranches: NaN, openPoints: independent, runningFiles: running }).slotsFree,
    ).toBe(POOL_CAP)
    expect(
      slotReasonDecision({ agents: 1, openBranches: -4, openPoints: independent, runningFiles: running }).slotsFree,
    ).toBe(POOL_CAP)
  })
})

// ---- WHICH POINT IS A TOOL CALL OPENING? (point 712) ----------------------
//
// The refusal is worth exactly what this recognition is worth: a call it misreads
// refuses the wrong work, and a call it misses is the silent failure of
// 17.08.2026 all over again. Both directions are written from the failure side.
describe('commissionTarget — the act of opening a point, recognised', () => {
  it('reads the point out of the branch an agent prompt names', () => {
    expect(
      commissionTarget({
        toolName: 'Agent',
        prompt: 'Work in /workspace/hoa/.claude/worktrees/agent-x, branch feat/697-goat-foot is checked out.',
      }),
      // THE PROSE'S OWN BRANCH NAME IS CARRIED (Sol, review of dd7fd78c): without
      // it a spawn naming a SECOND branch for a point in flight kept the
      // point-wide exemption, which is the escape the shell path had just lost.
    ).toEqual({ point: 697, points: [697], refs: ['feat/697-goat-foot'], refsLoose: true, how: 'agent' })
  })

  it('reads a point NAMED in prose when no branch is spelled out, in either language', () => {
    expect(commissionTarget({ toolName: 'Task', prompt: 'Deliver work-order point 697.' })).toEqual({
      point: 697,
      points: [697],
      refs: [],
      refsLoose: true,
      how: 'agent',
    })
    expect(commissionTarget({ toolName: 'Agent', description: 'Punkt 705 umsetzen' })).toEqual({
      point: 705,
      points: [705],
      refs: [],
      refsLoose: true,
      how: 'agent',
    })
  })

  // REWRITTEN after Sol's review of 91d88f9a. The old case blessed
  // `git checkout -b feat/697-a && git branch feat/705-b` as "no target", which
  // made ONE shell call a complete bypass of both refusals — the test pinned the
  // hole rather than the rule. A command is not ambiguous about what it creates.
  it('judges every point a command opens, while declaring multi-point prose ambiguous', () => {
    expect(
      commissionTarget({ toolName: 'Bash', command: 'git checkout -b feat/697-a && git branch feat/705-b' }),
    ).toEqual({ point: 697, points: [697, 705], refs: ['feat/697-a', 'feat/705-b'], refsLoose: false, how: 'branch' })
    // …in every separator a shell offers, and with a worktree beside a cut.
    expect(
      commissionTarget({ toolName: 'Bash', command: 'git branch feat/705-b; git switch -c feat/697-a' }).points,
    ).toEqual([705, 697])
    expect(
      commissionTarget({ toolName: 'Bash', command: 'git worktree add -b feat/711-x t\ngit checkout -b feat/697-a' })
        .points,
    ).toEqual([711, 697])
    // A spawn prompt is free prose, so two branch names are reported rather
    // than guessed into two assignments.
    const prose = commissionTarget({
      toolName: 'Agent',
      prompt: 'work branch feat/697-a and also branch feat/705-b',
    })
    expect(prose).toMatchObject({ point: null, points: [], how: 'ambiguous-prose' })
    expect(prose.ambiguous).toMatchObject({ points: [697, 705], refs: ['feat/697-a', 'feat/705-b'] })
  })

  it('declares mixed negation ambiguous instead of guessing points in or out', () => {
    const t = commissionTarget({ toolName: 'Agent', prompt: 'branch feat/697-a; do not touch feat/705-b' })
    expect(t).toMatchObject({ point: null, points: [], how: 'ambiguous-prose' })
    expect(t.ambiguous).toMatchObject({ points: [697, 705], refs: ['feat/697-a', 'feat/705-b'] })
    expect(t.ambiguous.reasons).toContain('multiple point mentions')
    const post = commissionTarget({ toolName: 'Agent', prompt: 'Punkt 705 nicht beginnen' })
    expect(post).toMatchObject({ point: null, points: [], how: 'ambiguous-prose' })
    expect(post.ambiguous.points).toEqual([705])
    // A negation in another sentence is not attached to the assignment.
    expect(commissionTarget({ toolName: 'Agent', prompt: 'Do not guess. Work point 705' }).points).toEqual([705])
    expect(commissionTarget({ toolName: 'Agent', prompt: 'work point 705 and do not skip the tests' }).how).toBe(
      'ambiguous-prose',
    )
  })

  it('reads the branch off the flag, so a START point and a push are not commissionings', () => {
    expect(
      commissionTarget({ toolName: 'Bash', command: 'git checkout -b feat/697-a origin/feat/705-b' }).points,
    ).toEqual([697])
    expect(
      commissionTarget({ toolName: 'Bash', command: 'git checkout -b feat/697-a && git push -u origin feat/705-b' })
        .points,
    ).toEqual([697])
  })

  it('declares multi-point and dependency prose ambiguous, naming what it saw', () => {
    const two = commissionTarget({ toolName: 'Agent', prompt: 'implement point 712 and point 713' })
    expect(two).toMatchObject({ point: null, points: [], how: 'ambiguous-prose' })
    expect(two.ambiguous.points).toEqual([712, 713])
    const dependency = commissionTarget({ toolName: 'Agent', prompt: 'point 697 depends on point 705' })
    expect(dependency).toMatchObject({ point: null, points: [], how: 'ambiguous-prose' })
    expect(dependency.ambiguous.points).toEqual([697, 705])
  })

  it('does not let a branch mention hide a second prose point', () => {
    const t = commissionTarget({ toolName: 'Agent', prompt: 'branch feat/711-x, which point 400 first asked for' })
    expect(t).toMatchObject({ point: null, points: [], how: 'ambiguous-prose' })
    expect(t.ambiguous).toMatchObject({ points: [711, 400], refs: ['feat/711-x'] })
  })

  it('recognises a branch being CUT, in every spelling, slug or none', () => {
    expect(commissionTarget({ toolName: 'Bash', command: 'git checkout -b feat/697-goat main' })).toEqual({
      point: 697,
      points: [697],
      refs: ['feat/697-goat'],
      refsLoose: false,
      how: 'branch',
    })
    expect(commissionTarget({ toolName: 'Bash', command: 'git switch -c feat/697' })).toEqual({
      point: 697,
      points: [697],
      refs: ['feat/697'],
      refsLoose: false,
      how: 'branch',
    })
    expect(commissionTarget({ toolName: 'Bash', command: 'git branch feat/697-goat main' })).toEqual({
      point: 697,
      points: [697],
      refs: ['feat/697-goat'],
      refsLoose: false,
      how: 'branch',
    })
  })

  // ADDED after Sol's review of 3078d166: the short flags alone were a bypass.
  // `git switch --create feat/697-x` cuts a branch git is perfectly happy with,
  // and the guard answered `none` and exited before either refusal fired. Every
  // spelling git accepts must be a spelling this rule reads.
  it('recognises the LONG and FORCE spellings too — a bypass is a bypass', () => {
    const points = (command) => commissionTarget({ toolName: 'Bash', command }).points
    expect(points('git switch --create feat/697-x')).toEqual([697])
    expect(points('git switch --force-create feat/697-x')).toEqual([697])
    expect(points('git switch -C feat/697-x')).toEqual([697])
    expect(points('git checkout -B feat/697-x main')).toEqual([697])
    // The ORPHAN forms cut a branch with an empty history — still a branch
    // (fourth review, finding 10: the sweep had omitted them).
    expect(points('git checkout --orphan feat/697-x')).toEqual([697])
    expect(points('git switch --orphan feat/697-x')).toEqual([697])
    expect(points('git worktree add -B feat/697-x .claude/worktrees/agent-y')).toEqual([697])
    // `git branch -c/-m <old> <new>` CREATES <new>, and the new name is the last.
    expect(points('git branch -c feat/705-a feat/697-x')).toEqual([697])
    expect(points('git branch --copy feat/705-a feat/697-x')).toEqual([697])
    expect(points('git branch -M feat/697-x')).toEqual([697])
    // `-t`/`--track` CREATE with tracking set up; `--recurse-submodules` is a
    // boolean that must not eat the branch name (fourth review, finding 3).
    expect(points('git branch -t feat/697-x main')).toEqual([697])
    expect(points('git branch --track feat/697-x main')).toEqual([697])
    expect(points('git branch --recurse-submodules feat/697-x main')).toEqual([697])
    // …while the DESTRUCTIVE and read-only forms still open nothing.
    expect(points('git branch -D feat/697-x')).toEqual([])
    expect(points('git branch -d feat/697-x')).toEqual([])
    expect(points('git branch --list feat/697-x')).toEqual([])
    expect(points('git push -u origin feat/697-x')).toEqual([])
    expect(points('git checkout feat/697-x')).toEqual([])
    expect(points('git switch feat/697-x')).toEqual([])
  })

  // A NAME IN QUOTES IS THE SAME NAME (fourth review, finding 2): the `(\S+)`
  // capture kept the shell quoting, `normRef` did not strip it, and the call
  // walked past both refusals as "no target".
  it('reads a QUOTED branch name in every creating spelling', () => {
    const target = (command) => commissionTarget({ toolName: 'Bash', command })
    expect(target("git switch -c 'feat/712-work'")).toMatchObject({ points: [712], refs: ['feat/712-work'] })
    expect(target('git checkout -b "feat/712-work" main')).toMatchObject({ points: [712], refs: ['feat/712-work'] })
    expect(target("git branch 'feat/712-work'")).toMatchObject({ points: [712], refs: ['feat/712-work'] })
    expect(target('git worktree add -b "feat/712-work" .claude/worktrees/agent-z')).toMatchObject({
      points: [712],
      refs: ['feat/712-work'],
    })
  })

  it('recognises a worktree being created on one', () => {
    expect(
      commissionTarget({ toolName: 'Bash', command: 'git worktree add -b feat/697-goat .claude/worktrees/agent-y' }),
    ).toEqual({ point: 697, points: [697], refs: ['feat/697-goat'], refsLoose: false, how: 'worktree' })
    // A tree created ON an existing branch is the same act, named plainly.
    expect(
      commissionTarget({ toolName: 'Bash', command: 'git worktree add .claude/worktrees/agent-y feat/697-goat' }).points,
    ).toEqual([697])
  })

  it('recognises an authoring run as the commissioning it is', () => {
    expect(commissionTarget({ toolName: 'Bash', command: 'node scripts/author-sol.mjs --point 697' })).toEqual({
      point: 697,
      points: [697],
      refs: [],
      refsLoose: false,
      how: 'author',
    })
  })

  it('opens NOTHING on the read-only authoring legs — routing and dry-run', () => {
    expect(commissionTarget({ toolName: 'Bash', command: 'node scripts/author-sol.mjs --routing --point 697' })).toEqual(
      { point: null, points: [], refs: [], refsLoose: false, how: 'none' },
    )
    expect(
      commissionTarget({ toolName: 'Bash', command: 'node scripts/author-sol.mjs --point 697 --dry-run' }).point,
    ).toBeNull()
    // …and a read-only leg beside a real cut does not shield the cut.
    expect(
      commissionTarget({
        toolName: 'Bash',
        command: 'node scripts/author-sol.mjs --routing --point 705 && git checkout -b feat/697-a',
      }).points,
    ).toEqual([697])
  })

  it('opens NOTHING when the call only touches a branch that already exists', () => {
    for (const command of [
      'git checkout feat/697-goat',
      'git push -u origin feat/697-goat',
      'git switch feat/697-goat',
      'git branch -D feat/697-goat',
      'git merge --no-ff feat/697-goat',
      'git log feat/697-goat',
      'node scripts/land-point.mjs 697 --model opus-5',
      'node scripts/point-brief.mjs 697',
    ]) {
      expect(commissionTarget({ toolName: 'Bash', command }).point, command).toBeNull()
    }
  })

  it('judges a COMMAND wherever it arrives — which tools it SEES is the matcher\'s job, not this rule\'s', () => {
    expect(commissionTarget({ toolName: 'PowerShell', command: 'git checkout -b feat/697-x' })).toEqual({
      point: 697,
      points: [697],
      refs: ['feat/697-x'],
      refsLoose: false,
      how: 'branch',
    })
  })

  it('opens nothing on a call that carries no command and no prompt', () => {
    expect(commissionTarget({ toolName: 'Bash', command: '   ' })).toEqual({
      point: null,
      points: [],
      refs: [],
      refsLoose: false,
      how: 'none',
    })
    expect(commissionTarget({ toolName: 'Read', filePath: 'TASKS.md' })).toEqual({
      point: null,
      points: [],
      refs: [],
      refsLoose: false,
      how: 'none',
    })
    expect(commissionTarget()).toEqual({ point: null, points: [], refs: [], refsLoose: false, how: 'none' })
  })

  it('never throws on hostile input', () => {
    expect(() => commissionTarget({ toolName: null, command: null, prompt: null, description: null })).not.toThrow()
    expect(commissionTarget({ toolName: 'Bash', command: 'git checkout -b feat/0-nope' }).point).toBeNull()
    expect(commissionTarget({ toolName: 'Agent', prompt: 'feat/'.repeat(500) }).point).toBeNull()
  })
})
