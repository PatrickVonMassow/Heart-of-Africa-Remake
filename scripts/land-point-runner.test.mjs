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
import { mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, it, expect } from 'vitest'
import { cleanupEvidence, deleteLandedBranch, listWorktrees, reproveOne, runCommand, selectCleanup } from './land-point.mjs'
import { DISPOSITION, judgeCleanupTarget } from './land-cleanup-core.mjs'

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


/** The landing's own question, asked the way `main()` asks it after the merge. */
const select = (root, over = {}) =>
  selectCleanup({ branch: 'feat/608-x', since: Date.now(), mergeTarget: 'main', cwd: root, mainRoot: root, ...over })

describe('the cleanup evidence, against a real checkout', () => {
  it("reads git's lock line, and the pure rule then keeps that worktree", () => {
    const { root, own } = scene()
    git(['worktree', 'lock', '--reason', 'claude agent agent-own (pid 999999 start 1)', own], root)
    const listed = listWorktrees({ cwd: root }).find((w) => w.path === own)
    expect(listed.locked).toContain('claude agent agent-own')

    const sel = select(root)
    expect(sel.remove).toEqual([])
    expect(sel.reported.map((r) => r.disposition)).toContain(DISPOSITION.live)
    expect(sel.branch.delete).toBe(false)
  })

  it("removes the landed point's own quiet worktree — and NEVER the other agent's", () => {
    const { root, own, other } = scene()
    // The other agent is mid-work: an uncommitted file, exactly what was lost.
    writeFileSync(join(other, 'in-progress.txt'), 'not committed yet\n')
    const sel = select(root)
    expect(sel.remove).toEqual([own])
    expect(sel.remove).not.toContain(other)
    // The expectation carries a real identity, read off the real tree.
    expect(sel.expected[own]).toMatchObject({ branch: 'feat/608-x' })
    expect(sel.expected[own].head).toMatch(/^[0-9a-f]{40}$/)
    expect(sel.expected[own].gitLink).toContain('.git/worktrees/agent-own')
    expect(sel.expected[own].gitMtime).toBeGreaterThan(0)
  })

  it('sees uncommitted work in the landed tree itself and keeps it', () => {
    const { root, own } = scene()
    writeFileSync(join(own, 'unpushed.txt'), 'work\n')
    const sel = select(root)
    expect(sel.remove).toEqual([])
    expect(sel.reported[0].reason).toMatch(/uncommitted/)
    expect(sel.branch.delete).toBe(false)
    expect(own).toBeTruthy()
  })

  it('keeps a tree holding a commit the landing did not take', () => {
    const { root, own } = scene()
    writeFileSync(join(own, 'more.txt'), 'more\n')
    git(['add', '.'], own)
    git(['commit', '-q', '-m', 'work the landing has not merged'], own)
    const sel = select(root)
    expect(sel.remove).toEqual([])
    expect(sel.reported[0].reason).toMatch(/not contained in what was merged/)
  })

  it('keeps a directory in the isolation folder that git never registered', () => {
    const { root } = scene()
    // A stray checkout at an agent-shaped path: git lists nothing there, so the
    // landing never selects it — and if it ever did, the record check refuses it.
    const stray = join(root, '.claude', 'worktrees', 'agent-stray')
    mkdirSync(stray, { recursive: true })
    writeFileSync(join(stray, 'x.txt'), 'x\n')
    const ev = cleanupEvidence([{ path: stray, branch: 'feat/608-x', head: '' }], {
      branch: 'feat/608-x',
      mainRoot: root,
      mergeTarget: 'main',
      cwd: root,
    })
    expect(ev[stray].linkedTo).toBeNull()
    expect(select(root).remove).not.toContain(stray)
  })

  it('probes only the plausible candidates, never every checkout in the repository', () => {
    const { root, other } = scene()
    const ev = cleanupEvidence(listWorktrees({ cwd: root }), { branch: 'feat/608-x', mainRoot: root, cwd: root })
    expect(ev[root]).toBeUndefined() // the main checkout is never a candidate
    expect(ev[other]).toBeDefined() // an agent tree is, so it can be judged and named
  })
})

describe('the probe must not become its own evidence', () => {
  it('a SECOND pass still reads the tree as quiet — remove --no-optional-locks and this fails', async () => {
    // THE CLAIM, AND WHY IT TAKES TWO PASSES. `worktreeActiveAt` dates the git
    // metadata, `index` included; a plain `git status` REFRESHES that index and
    // moves its mtime. One pass cannot see it — the freshness is read before the
    // status runs — so the first version of this case would have passed with the
    // flag removed (review finding 7). Production takes the selection at least
    // twice, and it is the SECOND pass that inherits the damage: the first pass's
    // status would have stamped the index, and every tree would then read as
    // "written after the landing began" and never be cleaned up again.
    const { root, own } = scene()
    // Make the index racily stale, which is what provokes the refresh: rewrite a
    // tracked file with identical content so its stat info no longer matches.
    await new Promise((r) => setTimeout(r, 1100))
    writeFileSync(join(own, 'a.txt'), 'a\n')

    // `since` is taken from the FILESYSTEM, not from the clock: a file's mtime
    // carries sub-millisecond precision while `Date.now()` truncates to whole
    // milliseconds, so a wall-clock baseline can land BEFORE the write that
    // precedes it and fail this case for a reason it is not testing. The index
    // rewrite this case is actually about happens later still, during the first
    // pass, so nothing about the discrimination is weakened.
    const since = Math.max(Date.now(), statSync(join(own, 'a.txt')).mtimeMs)
    const trees = listWorktrees({ cwd: root })
    const probe = () => cleanupEvidence(trees, { branch: 'feat/608-x', mainRoot: root, mergeTarget: 'main', cwd: root })
    const first = probe()
    const second = probe()

    // MEASURED against both spellings (11.08.2026): with the flag the index mtime
    // does not move and both passes answer the same instant; without it the first
    // pass's status rewrites the index and the second reads a time AFTER the
    // landing began. Both assertions below go red on its removal.
    expect(second[own].activeAt).toBeTypeOf('number')
    expect(second[own].activeAt).toBeLessThanOrEqual(since)
    expect(second[own].activeAt).toBe(first[own].activeAt)
  })

  it('reads a stat-dirty file conservatively — the safe direction', () => {
    // A tracked file rewritten with IDENTICAL content is stat-dirty, and a status
    // that may not refresh the index reports it as modified. That keeps the tree
    // rather than deleting it, which is the direction this whole rule leans; it is
    // recorded here so a later reader does not take it for a bug.
    const { root, own } = scene()
    writeFileSync(join(own, 'a.txt'), 'a\n')
    const sel = select(root)
    expect(sel.remove).not.toContain(own)
  })
})

describe('the branch deletion is a SEQUENCE, not two independent commands', () => {
  /** A git that records every call and fails the ones it is told to. */
  const recorder = (failing = []) => {
    const calls = []
    const run = (args) => {
      calls.push(args.join(' '))
      if (failing.some((f) => args.join(' ').includes(f))) throw new Error('git said no')
      return ''
    }
    return { calls, run }
  }

  it('NEVER deletes the remote when the local deletion failed', () => {
    // Second review, finding 3. The local `branch -d` fails precisely BECAUSE a
    // worktree still has the branch checked out — and the remote deletion used to
    // run anyway, taking the branch out from under the tree that was kept.
    const { calls, run } = recorder(['branch -d'])
    const r = deleteLandedBranch({ branch: 'feat/608-x', git: run })
    expect(r).toMatchObject({ local: 'failed', remote: 'skipped' })
    expect(calls.some((c) => c.includes('push origin --delete'))).toBe(false)
    expect(r.problems.join('\n')).toMatch(/remote branch: NOT deleted/)
  })

  it('deletes the remote only after the local one succeeded, in that order', () => {
    const { calls, run } = recorder()
    expect(deleteLandedBranch({ branch: 'feat/608-x', git: run })).toMatchObject({ local: 'ok', remote: 'ok' })
    expect(calls).toEqual(['branch -d feat/608-x', 'push origin --delete feat/608-x'])
  })

  it('reports a remote failure without pretending the local one failed too', () => {
    const { run } = recorder(['push origin'])
    const r = deleteLandedBranch({ branch: 'feat/608-x', git: run })
    expect(r).toMatchObject({ local: 'ok', remote: 'failed' })
    expect(r.problems).toHaveLength(1)
  })

  it('touches neither when the branch is blocked', () => {
    const { calls, run } = recorder()
    const r = deleteLandedBranch({ branch: 'feat/608-x', blocked: 'a worktree was kept', git: run })
    expect(r).toMatchObject({ local: 'skipped', remote: 'skipped', problems: [] })
    expect(calls).toEqual([])
  })
})

describe('existence is a tri-state, because absence licenses a removal', () => {
  it('a path that is genuinely absent reads as absent', () => {
    const { root } = scene()
    const gone = join(root, '.claude', 'worktrees', 'agent-never-existed')
    const ev = cleanupEvidence([{ path: gone, branch: 'feat/608-x', head: '' }], {
      branch: 'feat/608-x',
      mainRoot: root,
      mergeTarget: 'main',
      cwd: root,
    })
    expect(ev[gone].exists).toBe(false)
  })

  it('a stat that FAILS for any other reason is not absence — and the tree is kept', () => {
    // Second review, finding 4: `existsSync` cannot tell "not there" from "could
    // not look", and `exists: false` is the one verdict that skips every other
    // proof. A path UNDER a regular file makes the stat fail with ENOTDIR, which
    // IS absence; a permission failure is not, and that is what this pins through
    // the pure rule: only a proven `false` reaches `remove`.
    expect(judgeCleanupTarget({
      worktree: { path: `${'/repo'}/.claude/worktrees/agent-a`, branch: 'feat/1-x' },
      branch: 'feat/1-x',
      mainRoot: '/repo',
      evidence: { exists: null },
      since: Date.now(),
    })).toMatchObject({ disposition: 'unproven' })
  })
})

describe('the re-proof at the moment of deletion', () => {
  it('passes for the tree that was selected', () => {
    const { root, own } = scene()
    const r = reproveOne({
      path: own,
      expected: { branch: 'feat/608-x' },
      since: Date.now(),
      mergeTarget: 'main',
      cwd: root,
      mainRoot: root,
    })
    expect(r.ok).toBe(true)
  })

  it('refuses once the tree is locked after the selection was taken', () => {
    const { root, own } = scene()
    git(['worktree', 'lock', '--reason', 'claude agent agent-own (pid 999999 start 1)', own], root)
    const r = reproveOne({
      path: own,
      expected: { branch: 'feat/608-x' },
      since: Date.now(),
      mergeTarget: 'main',
      cwd: root,
      mainRoot: root,
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/git-locked/)
  })

  it('refuses a path git no longer lists', () => {
    const { root } = scene()
    const r = reproveOne({
      path: join(root, '.claude', 'worktrees', 'agent-vanished'),
      expected: { branch: 'feat/608-x' },
      since: Date.now(),
      mergeTarget: 'main',
      cwd: root,
      mainRoot: root,
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/no longer lists/)
  })
})
