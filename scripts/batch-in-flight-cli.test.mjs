// The durable adoption flags are a live CLI contract. Exercise the real argv
// loop against an isolated repository so a bare --transferable cannot skip the
// option that follows it, and assert what is actually persisted.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { reapDeadDeclaration } from './batch-in-flight.mjs'
const CLI = resolve(import.meta.dirname, 'batch-in-flight.mjs')
const OWNER = 'cli-owner'
let root = ''

const inFlightPath = () => join(root, '.claude', 'batch-in-flight.json')
const declaration = () => JSON.parse(readFileSync(inFlightPath(), 'utf8'))
// Every evidence item names its work-order point since point 713 — the board
// derives its now-cards from that mapping — so the fixture declares one; these
// cases are about the durable flags, not about the tagging rule.
const journalPath = () => join(root, 'activity-journal.jsonl')
const runIn = (env, ...args) =>
  spawnSync(process.execPath, [CLI, '--waiting-on', 'durable worker', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOA_REPO_ROOT: root,
      HOA_ALERT_ESCALATION: 'off',
      HOA_ACTIVITY_JOURNAL_PATH: journalPath(),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
const run = (...args) => runIn({}, '--point', '895', ...args)

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'hoa-batch-in-flight-cli-'))
  mkdirSync(join(root, '.claude'), { recursive: true })
  writeFileSync(
    join(root, '.claude', 'batch-lock.json'),
    JSON.stringify({ sessionId: OWNER, claimedAt: Date.now() }),
  )
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('batch-in-flight — durable adoption CLI flags', () => {
  it('records a complete transferable block when the bare flag is last', () => {
    const result = run(
      '--pid', String(process.pid),
      '--durable-batch', 'B1',
      '--durable-point', '895',
      '--durable-attempt', 'A1',
      '--transferable',
    )

    expect(result.status, result.stderr).toBe(0)
    expect(declaration().durable).toEqual({
      batchId: 'B1',
      pointId: '895',
      attemptId: 'A1',
      pid: process.pid,
      pidStartedAt: expect.any(Number),
      transferable: true,
    })
  })

  it('records every following option when the bare flag is in the middle', () => {
    const result = run(
      '--pid', String(process.pid),
      '--durable-batch', 'B2',
      '--transferable',
      '--durable-point', '895',
      '--durable-attempt', 'A2',
    )

    expect(result.status, result.stderr).toBe(0)
    expect(declaration().durable).toEqual({
      batchId: 'B2',
      pointId: '895',
      attemptId: 'A2',
      pid: process.pid,
      pidStartedAt: expect.any(Number),
      transferable: true,
    })
  })

  it('refuses durable identities without process evidence and writes nothing', () => {
    const result = run(
      '--log', join(root, 'worker.log'),
      '--durable-batch', 'B3',
      '--durable-point', '895',
      '--durable-attempt', 'A3',
      '--transferable',
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/a durable adoption record identifies its worker process/)
    expect(result.stderr).toContain('Nothing recorded.')
    expect(existsSync(inFlightPath())).toBe(false)
  })

  it('refuses a partial durable block and names every missing identity', () => {
    const result = run('--pid', String(process.pid), '--durable-batch', 'B4')

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('a durable block is all-or-nothing; missing: pointId, attemptId')
    expect(result.stderr).toContain('Nothing recorded.')
    expect(existsSync(inFlightPath())).toBe(false)
  })

  // Sixth cross-vendor round: the delegated activity event re-derived its point
  // from the ref instead of reading the one the declaration records, so a
  // branch whose name carries no number emitted `point: null` and a name with
  // misleading digits emitted the wrong one.
  it('emits the delegated start under the RECORDED point, not one re-read from the ref', () => {
    // The branch has to be REAL and fresh: the declaration refuses evidence it
    // cannot probe, which is a different rule from the one under test here.
    const git = (...argv) =>
      spawnSync('git', ['-C', root, ...argv], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    git('init', '-q', '--initial-branch=main')
    writeFileSync(join(root, 'work.txt'), 'delegated work\n')
    git('add', 'work.txt')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'work')
    // A branch OTHER than the checkout's own: its own branch is refused as
    // evidence that can never go quiet, which is a different rule again.
    git('branch', 'topic/live')

    const result = runIn({}, '--point', '713', '--branch', 'refs/heads/topic/live')

    expect(result.status, result.stderr).toBe(0)
    expect(declaration().evidence[0]).toMatchObject({ kind: 'branch', point: 713 })
    const events = readFileSync(journalPath(), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    expect(events.length).toBeGreaterThan(0)
    expect(events.at(-1)).toMatchObject({ event: 'delegated-start', point: 713 })
  })

  // Eighth cross-vendor round: a pid item carries the OWNER's focus point, and
  // it used to decide the event's point purely by standing first — while the
  // event fires on the BRANCH the delegate is working on.
  it('names the strand the event fires on, not whichever item stands first', () => {
    const git = (...argv) =>
      spawnSync('git', ['-C', root, ...argv], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    git('init', '-q', '--initial-branch=main')
    writeFileSync(join(root, 'work.txt'), 'delegated work\n')
    git('add', 'work.txt')
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'work')
    git('branch', 'feat/697-strand')

    // The pid takes its point from the OWNER FOCUS, the branch from its own
    // name — the multi-strand shape, which is exactly where the two differ.
    writeFileSync(
      join(root, '.claude', 'current-focus.json'),
      JSON.stringify({ point: 713, note: 'owner strand', setAt: Date.now(), confirmedAt: Date.now() }),
    )
    const result = runIn({}, '--pid', String(process.pid), '--branch', 'refs/heads/feat/697-strand')

    expect(result.status, result.stderr).toBe(0)
    expect(declaration().evidence.map((item) => item.point)).toEqual([713, 697])
    const events = readFileSync(journalPath(), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    expect(events.at(-1)).toMatchObject({ event: 'delegated-start', point: 697 })
  })

  // The finish event is emitted from the declaration as it stands ON DISK, so a
  // legacy or adopted shape is written straight into the file and cleared.
  const finishEventFor = (evidence) => {
    // EXACTLY ONE NEW EVENT PER CALL (ninth round): reading only the last line
    // let a call that emitted NOTHING inherit the previous call's verdict.
    const before = existsSync(journalPath())
      ? readFileSync(journalPath(), 'utf8').split('\n').filter(Boolean).length
      : 0
    writeFileSync(
      inFlightPath(),
      JSON.stringify({
        sessionId: OWNER,
        at: Date.now(),
        waitingOn: 'legacy declaration',
        pid: process.pid,
        evidence,
      }),
    )
    const result = spawnSync(process.execPath, [CLI, '--clear'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOA_REPO_ROOT: root,
        HOA_ALERT_ESCALATION: 'off',
        HOA_ACTIVITY_JOURNAL_PATH: journalPath(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    expect(result.status, result.stderr).toBe(0)
    const events = readFileSync(journalPath(), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
    expect(events.length).toBe(before + 1)
    expect(events.at(-1)).toMatchObject({ event: 'delegated-finish' })
    return events.at(-1)
  }

  // Ninth cross-vendor round: with a strand recorded but UNNUMBERED, the
  // question used to fall through to the next point-bearing item — and a pid
  // carries the OWNER's point, so the delegate's finish event was stamped with
  // the owner's number after all. A declaration written by an older revision,
  // or adopted from one, is exactly that shape.
  it('answers null for an unnumbered strand instead of falling back to the pid point', () => {
    const event = finishEventFor([
      { kind: 'pid', pid: process.pid, point: 713, phase: 'authoring' },
      { kind: 'branch', ref: 'refs/heads/topic/live', point: null, phase: 'authoring' },
    ])

    expect(event.point).toBe(null)
  })

  // …and the same rule between the strands themselves: skipping the unnumbered
  // one until a LATER strand carries a number is the same guess one step over.
  it('answers null when the strands disagree, and their point when they agree', () => {
    expect(
      finishEventFor([
        { kind: 'branch', ref: 'refs/heads/topic/live', point: null, phase: 'authoring' },
        { kind: 'worktree', path: '/w/point-697', point: 697, phase: 'authoring' },
      ]).point,
    ).toBe(null)

    expect(
      finishEventFor([
        { kind: 'branch', ref: 'refs/heads/feat/711-x', point: 711, phase: 'authoring' },
        { kind: 'worktree', path: '/w/point-697', point: 697, phase: 'authoring' },
      ]).point,
    ).toBe(null)

    // The ordinary shape — one branch and its own worktree — is untouched.
    expect(
      finishEventFor([
        { kind: 'branch', ref: 'refs/heads/feat/697-strand', point: 697, phase: 'authoring' },
        { kind: 'worktree', path: '/w/point-697', point: 697, phase: 'authoring' },
      ]).point,
    ).toBe(697)
  })

  it('refuses a declared point that the named branch contradicts, and writes nothing', () => {
    const result = runIn({}, '--point', '713', '--branch', 'refs/heads/feat/999-work')

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/declared point 713 .* names point 999 .* disagree/)
    expect(result.stderr).toContain('Nothing recorded.')
    expect(existsSync(inFlightPath())).toBe(false)
  })

  it('does not call an agent alive after an ordinary git status refreshes only reader metadata', () => {
    const checkout = join(root, 'observed-worktree')
    mkdirSync(checkout)
    const git = (...argv) =>
      spawnSync('git', ['-C', checkout, ...argv], {
        encoding: 'utf8',
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    expect(git('init', '-q', '--initial-branch=main').status).toBe(0)
    writeFileSync(join(checkout, 'work.txt'), 'finished work\n')
    expect(git('add', 'work.txt').status).toBe(0)
    expect(git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'work').status).toBe(0)

    // Recreate the measured failure, not merely its aftermath: the writer stamps
    // are two hours old, then a real read-only status call refreshes the index's
    // stat cache. Touching the tracked file's mtime without changing its bytes
    // makes that refresh deterministic while leaving the checkout clean.
    const old = new Date(Date.now() - 2 * 60 * 60_000)
    for (const rel of ['.git', '.git/index', '.git/HEAD', '.git/COMMIT_EDITMSG']) {
      utimesSync(join(checkout, rel), old, old)
    }
    const current = new Date()
    utimesSync(join(checkout, 'work.txt'), current, current)
    expect(git('status', '--short', '--branch').status).toBe(0)
    expect(Date.now() - statSync(join(checkout, '.git', 'index')).mtimeMs).toBeLessThan(60_000)

    // The real CLI calls worktreeActiveAt itself. Under the old candidate set the
    // refreshed index produced `agent-alive` and exit 1; writer-only metadata
    // measures the old HEAD/COMMIT_EDITMSG and permits replacement instead.
    const result = spawnSync(process.execPath, [CLI, '--agent-check', '--worktree', checkout], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOA_REPO_ROOT: root,
        HOA_ALERT_ESCALATION: 'off',
        HOA_ACTIVITY_JOURNAL_PATH: journalPath(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('"verdict": "quiet"')
    expect(result.stdout).not.toContain('"verdict": "alive"')
  })
})

// --- POINT 1048: THE PAPERWORK OF A DEAD SESSION -----------------------------
describe('a declaration whose writing session is gone', () => {
  it('is cleared before any command reads it, and the clearing is said out loud', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-inflight-reap-'))
    const path = join(dir, 'batch-in-flight.json')
    try {
      // A pid that cannot exist: pid 0 is never a user process, and the shape is
      // otherwise the marker measured live on 04.09.2026 — fresh, evidence-less,
      // and naming a session that had been gone for hours.
      writeFileSync(path, JSON.stringify({
        v: 1, sessionId: 'S-dead', pid: 999_999_999, pidStartedAt: Date.now() - 3_600_000,
        at: Date.now() - 60_000, waitingOn: 'a WebGPU lane that finished long ago', evidence: [],
      }))
      const verdict = reapDeadDeclaration(path, { probe: () => ({ exists: false, startedAt: null }) })
      expect(verdict).toMatchObject({ reaped: true, reason: 'writer-gone' })
      expect(existsSync(path)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('leaves a TRANSFERRED declaration alone — its dead pid is the point of a handover', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-inflight-transfer-'))
    const path = join(dir, 'batch-in-flight.json')
    try {
      writeFileSync(path, JSON.stringify({
        v: 1, sessionId: 'S-gone', pid: 999_999_999, pidStartedAt: Date.now() - 3_600_000,
        at: Date.now() - 60_000, waitingOn: 'a delegated author', evidence: [],
        transfer: { v: 1, by: 'S-gone', at: Date.now() - 30_000, checkpoints: [] },
      }))
      expect(reapDeadDeclaration(path, { probe: () => ({ exists: false, startedAt: null }) }))
        .toMatchObject({ reaped: false, reason: 'transferred' })
      expect(existsSync(path)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('never clears what it cannot judge', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-inflight-unknown-'))
    const path = join(dir, 'batch-in-flight.json')
    try {
      writeFileSync(path, JSON.stringify({ v: 1, sessionId: 'S', at: Date.now(), waitingOn: 'x', evidence: [] }))
      expect(reapDeadDeclaration(path, { probe: () => ({ exists: false, startedAt: null }) }))
        .toMatchObject({ reaped: false, reason: 'no-writer-pid' })
      expect(existsSync(path)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
