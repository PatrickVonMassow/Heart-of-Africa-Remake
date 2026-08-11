// IS THE GATE RUNNER ACTUALLY ASYNCHRONOUS? (point 594, rider c)
//
// This one case exists because everything around it was already green while the
// feature did not work. `gateConcurrency` decided "parallel", the summary printed
// "parallel", `runSteps` scheduled with `Promise.all` — and the gate ran strictly
// one step after the other, because the runner underneath wrapped a SYNCHRONOUS
// `execFileSync` in a `new Promise(...)` executor. The executor body runs the
// moment the promise is constructed, so `map` over it completes each command
// before the next promise exists.
//
// No decision test can catch that, and neither can a scheduler test with a fake
// runner: the defect lives in the runner, and the only property that separates a
// real async runner from a synchronous one is that IT RETURNS BEFORE THE CHILD
// EXITS. So that is what is measured, against a child slow enough that a
// synchronous implementation could not possibly beat the bar.
//
// The margins are deliberately wide (a 400 ms child, a 150 ms bar). Load can only
// make the CHILD slower, which widens the gap rather than narrowing it — the
// failure mode of this test is a machine so loaded that spawning a process takes
// 150 ms, which is not a state any gate verdict would survive anyway.
//
// The second half of this file measures the OTHER property no decision test can
// reach: does the cleanup's evidence gathering read a real git checkout the way
// `land-cleanup-core.mjs` assumes — the lock line, the dirtiness, and above all
// WITHOUT its own look becoming the evidence (point 629).
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, it, expect } from 'vitest'
import { cleanupEvidence, listWorktrees, runCommand, selectCleanup } from './land-point.mjs'
import { DISPOSITION } from './land-cleanup-core.mjs'

/** A child that takes a measurable, deterministic amount of time. */
const slowChild = (ms) => ({ cmd: process.execPath, args: ['-e', `setTimeout(() => {}, ${ms})`], id: 'slow' })

describe('the gate runner', () => {
  it('RETURNS before the child exits — the property execFileSync cannot have', async () => {
    const started = Date.now()
    const pending = runCommand(slowChild(400))
    const returnedAfter = Date.now() - started
    expect(returnedAfter).toBeLessThan(150)

    const result = await pending
    expect(Date.now() - started).toBeGreaterThanOrEqual(350)
    expect(result).toMatchObject({ id: 'slow', ok: true })
  })

  it('overlaps two children instead of adding their durations', async () => {
    const started = Date.now()
    const both = await Promise.all([runCommand(slowChild(400)), runCommand(slowChild(400))])
    const elapsed = Date.now() - started
    expect(both.every((r) => r.ok)).toBe(true)
    // Serial would be >= 800 ms; concurrent is one child plus spawn overhead.
    expect(elapsed).toBeLessThan(700)
  })

  it('reports a failing command instead of throwing, and keeps its last output', async () => {
    const r = await runCommand({
      cmd: process.execPath,
      args: ['-e', 'console.error("boom"); process.exit(3)'],
      id: 'lint',
    })
    expect(r).toMatchObject({ id: 'lint', ok: false })
    expect(r.output).toContain('boom')
  })

  it('reports a command that does not exist rather than crashing the chain', async () => {
    const r = await runCommand({ cmd: 'definitely-not-a-real-binary-594', args: [], id: 'build' })
    expect(r.ok).toBe(false)
  })

  it('truncates a chatty failure to its last lines', async () => {
    const r = await runCommand({
      cmd: process.execPath,
      args: ['-e', 'for (let i = 0; i < 200; i++) console.log("line " + i); process.exit(1)'],
      id: 'unit',
      maxOutputLines: 5,
    })
    expect(r.ok).toBe(false)
    expect(r.output.split('\n').length).toBeLessThanOrEqual(5)
    expect(r.output).toContain('line 199')
  })
})

// ---------------------------------------------------------------------------
// A THROWAWAY REPOSITORY, because this is the half that touches the filesystem.
const roots = []
const git = (args, cwd) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })

/** A repo with `main`, a landed branch and two agent worktrees on it. */
function scene() {
  const root = mkdtempSync(join(tmpdir(), 'land-cleanup-'))
  roots.push(root)
  git(['init', '--initial-branch=main', '-q', '.'], root)
  git(['config', 'user.email', 't@example.com'], root)
  git(['config', 'user.name', 'T'], root)
  writeFileSync(join(root, 'a.txt'), 'a\n')
  git(['add', '.'], root)
  git(['commit', '-q', '-m', 'first'], root)
  mkdirSync(join(root, '.claude', 'worktrees'), { recursive: true })
  const own = join(root, '.claude', 'worktrees', 'agent-own')
  const other = join(root, '.claude', 'worktrees', 'agent-other')
  git(['worktree', 'add', '-q', '-b', 'feat/608-x', own], root)
  git(['worktree', 'add', '-q', '-b', 'feat/590-y', other], root)
  return { root, own, other }
}

afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

describe('the cleanup evidence, against a real checkout', () => {
  it('reads git\'s lock line, and the pure rule then keeps that worktree', () => {
    const { root, own } = scene()
    git(['worktree', 'lock', '--reason', 'claude agent agent-own (pid 999999 start 1)', own], root)
    const listed = listWorktrees({ cwd: root }).find((w) => w.path === own)
    expect(listed.locked).toContain('claude agent agent-own')

    const sel = selectCleanup({ branch: 'feat/608-x', since: Date.now(), cwd: root, mainRoot: root })
    expect(sel.remove).toEqual([])
    expect(sel.reported.map((r) => r.disposition)).toContain(DISPOSITION.live)
    expect(sel.branch.delete).toBe(false)
  })

  it('removes the landed point\'s own quiet worktree — and NEVER the other agent\'s', () => {
    const { root, own, other } = scene()
    // The other agent is mid-work: an uncommitted file, exactly what was lost.
    writeFileSync(join(other, 'in-progress.txt'), 'not committed yet\n')
    const sel = selectCleanup({ branch: 'feat/608-x', since: Date.now(), cwd: root, mainRoot: root })
    expect(sel.remove).toEqual([own])
    expect(sel.remove).not.toContain(other)
  })

  it('sees uncommitted work in the landed tree itself and keeps it', () => {
    const { root, own } = scene()
    writeFileSync(join(own, 'unpushed.txt'), 'work\n')
    const sel = selectCleanup({ branch: 'feat/608-x', since: Date.now(), cwd: root, mainRoot: root })
    expect(sel.remove).toEqual([])
    expect(sel.reported[0].reason).toMatch(/uncommitted/)
  })

  it('does NOT date its own look — the probe must not make every tree read as live', () => {
    // THE BUG THIS PINS: `worktreeActiveAt` reads the git metadata, and a plain
    // `git status` refreshes the index. Probe dirtiness first and every worktree
    // looks "written since the landing began", so nothing is ever cleaned up.
    const { root, own } = scene()
    const since = Date.now()
    const ev = cleanupEvidence(listWorktrees({ cwd: root }), { branch: 'feat/608-x', mainRoot: root })
    expect(ev[own]).toMatchObject({ exists: true, dirty: false })
    expect(ev[own].activeAt === null || ev[own].activeAt <= since).toBe(true)
  })

  it('probes only the plausible candidates, never every checkout in the repository', () => {
    const { root, other } = scene()
    const ev = cleanupEvidence(listWorktrees({ cwd: root }), { branch: 'feat/608-x', mainRoot: root })
    expect(ev[root]).toBeUndefined() // the main checkout is never a candidate
    expect(ev[other]).toBeDefined() // an agent tree is, so it can be judged and named
  })
})
