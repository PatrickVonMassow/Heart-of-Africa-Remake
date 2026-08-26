// The durable adoption flags are a live CLI contract. Exercise the real argv
// loop against an isolated repository so a bare --transferable cannot skip the
// option that follows it, and assert what is actually persisted.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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
    expect(events.at(-1)).toMatchObject({ point: 713 })
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
    expect(events.at(-1)).toMatchObject({ point: 697 })
  })

  // Ninth cross-vendor round: with a strand recorded but UNNUMBERED, the
  // question used to fall through to the next point-bearing item — and a pid
  // carries the OWNER's point, so the delegate's finish event was stamped with
  // the owner's number after all. A declaration written by an older revision
  // (or adopted from one) is exactly that shape.
  it('answers null for an unnumbered strand instead of falling back to the pid point', () => {
    writeFileSync(
      inFlightPath(),
      JSON.stringify({
        sessionId: OWNER,
        at: Date.now(),
        waitingOn: 'legacy declaration',
        pid: process.pid,
        evidence: [
          { kind: 'pid', pid: process.pid, point: 713, phase: 'authoring' },
          { kind: 'branch', ref: 'refs/heads/topic/live', point: null, phase: 'authoring' },
        ],
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
    expect(events.at(-1)).toMatchObject({ event: 'delegated-finish' })
    expect(events.at(-1).point).toBe(null)
  })

  it('refuses a declared point that the named branch contradicts, and writes nothing', () => {
    const result = runIn({}, '--point', '713', '--branch', 'refs/heads/feat/999-work')

    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/declared point 713 .* names point 999 .* disagree/)
    expect(result.stderr).toContain('Nothing recorded.')
    expect(existsSync(inFlightPath())).toBe(false)
  })
})
