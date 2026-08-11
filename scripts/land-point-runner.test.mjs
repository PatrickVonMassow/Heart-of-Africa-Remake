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
import {
  cleanupEvidence,
  deleteLandedBranch,
  listWorktrees,
  localBranchExists,
  reproveOne,
  runCommand,
  selectCleanup,
} from './land-point.mjs'
import { DISPOSITION, branchDeletionBlocker, judgeCleanupTarget } from './land-cleanup-core.mjs'

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

  it('keeps a tree holding uncommitted work, against a real repository', () => {
    // The property that matters: uncommitted work is the one state nothing can
    // rescue, so a tree holding it is never removed. `land-cleanup-core` pins the
    // pure rule; this asks a REAL git the same question.
    //
    // IT USED TO ASK A DIFFERENT ONE, AND THAT IS WHY IT BROKE. The case rewrote a
    // tracked file with IDENTICAL content and asserted the tree was kept, on the
    // premise that the file is then "stat-dirty" and reported as modified. It is
    // not: git compares the CONTENT once the stat differs and reports the file
    // clean — `--no-optional-locks` only stops it writing the refreshed index back.
    // The case passed here and failed on the CI runner (11.08.2026, runs
    // 31517313867 and 31518095810), and forcing the mtime did not save it, because
    // the premise was wrong rather than the timing. So it now writes DIFFERENT
    // content, which is genuinely uncommitted work, and asserts the precondition
    // rather than trusting it.
    const { root, own } = scene()
    writeFileSync(join(own, 'a.txt'), 'work that was never committed\n')
    expect(git(['status', '--porcelain'], own).trim()).not.toBe('')

    const sel = select(root)
    expect(sel.remove).not.toContain(own)
  })
})

describe('the branch deletion is a SEQUENCE, not two independent commands', () => {
  const SHA = '1234567890abcdef1234567890abcdef12345678'
  /** A git that records every call, answers rev-parse, and fails what it is told to. */
  const recorder = (failing = [], { sha = SHA, error = 'git said no' } = {}) => {
    const calls = []
    const run = (args) => {
      calls.push(args.join(' '))
      if (failing.some((f) => args.join(' ').includes(f))) throw new Error(error)
      return args[0] === 'rev-parse' ? sha : ''
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
    expect(calls.some((c) => c.includes('push origin'))).toBe(false)
    expect(r.problems.join('\n')).toMatch(/remote branch: NOT deleted/)
  })

  it('deletes the remote only after the local one succeeded, under a LEASE on the merged sha', () => {
    // Sixth review, finding 3: a plain `--delete` is unconditional, so anything
    // pushed to the branch between the snapshot and the command was deleted with
    // it. `--force-with-lease=<ref>:<sha>` makes the deletion a compare-and-swap at
    // the server — measured against a throwaway remote: a stale lease is rejected
    // and the branch survives.
    const { calls, run } = recorder()
    expect(deleteLandedBranch({ branch: 'feat/608-x', git: run })).toMatchObject({ local: 'ok', remote: 'ok', sha: SHA })
    expect(calls).toEqual([
      'rev-parse --verify --quiet refs/heads/feat/608-x',
      'branch -d feat/608-x',
      `push origin --force-with-lease=refs/heads/feat/608-x:${SHA} --delete feat/608-x`,
    ])
    // The sha is READ BEFORE the local deletion — afterwards the ref is gone and no
    // lease could be formed at all.
    expect(calls.indexOf('rev-parse --verify --quiet refs/heads/feat/608-x')).toBeLessThan(calls.indexOf('branch -d feat/608-x'))
  })

  it('SKIPS the remote when the branch\'s commit could not be read — no lease, no deletion', () => {
    const { calls, run } = recorder([], { sha: '' })
    const r = deleteLandedBranch({ branch: 'feat/608-x', git: run })
    expect(r).toMatchObject({ local: 'ok', remote: 'skipped' })
    expect(r.note).toMatch(/could not be made conditional/)
    expect(calls.some((c) => c.includes('push origin'))).toBe(false)
  })

  it('names a REJECTED lease for what it is — somebody pushed to that branch', () => {
    const { run } = recorder(['push origin'], { error: '! [rejected] (delete) -> feat/608-x (stale info)' })
    const r = deleteLandedBranch({ branch: 'feat/608-x', git: run })
    expect(r).toMatchObject({ local: 'ok', remote: 'failed' })
    expect(r.problems.join('\n')).toMatch(/has moved off 12345678 since the landing merged it/)
    expect(r.problems.join('\n')).toMatch(/left standing on purpose/)
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

  it('SKIPS the remote when the state changed between the two commands', () => {
    // Whole-branch review, finding 6: the two deletions are two commands, and a
    // live tree that recreates the local branch after `branch -d` — or one that
    // appears in that instant — would keep its local branch and lose its remote.
    const { calls, run } = recorder()
    const r = deleteLandedBranch({
      branch: 'feat/608-x',
      git: run,
      recheck: () => 'the local branch exists again',
    })
    expect(r).toMatchObject({ local: 'ok', remote: 'skipped', problems: [] })
    expect(r.note).toMatch(/remote branch feat\/608-x was NOT deleted/)
    expect(calls).toEqual(['rev-parse --verify --quiet refs/heads/feat/608-x', 'branch -d feat/608-x'])
  })

  it('a recheck that THROWS blocks the remote too — an unanswerable question is not permission', () => {
    const { calls, run } = recorder()
    const r = deleteLandedBranch({
      branch: 'feat/608-x',
      git: run,
      recheck: () => {
        throw new Error('git is unreachable')
      },
    })
    expect(r).toMatchObject({ local: 'ok', remote: 'skipped' })
    expect(r.note).toMatch(/could not be re-read/)
    expect(calls).toEqual(['rev-parse --verify --quiet refs/heads/feat/608-x', 'branch -d feat/608-x'])
  })

  it('runs the recheck AFTER the local deletion and before the remote one, and deletes when it is clear', () => {
    const { calls, run } = recorder()
    const r = deleteLandedBranch({
      branch: 'feat/608-x',
      git: run,
      recheck: () => {
        calls.push('recheck')
        return ''
      },
    })
    expect(r).toMatchObject({ local: 'ok', remote: 'ok' })
    expect(calls).toEqual([
      'rev-parse --verify --quiet refs/heads/feat/608-x',
      'branch -d feat/608-x',
      'recheck',
      `push origin --force-with-lease=refs/heads/feat/608-x:${SHA} --delete feat/608-x`,
    ])
  })

  it('never asks the recheck when the deletion was blocked outright', () => {
    let asked = false
    const { run } = recorder()
    deleteLandedBranch({
      branch: 'feat/608-x',
      blocked: 'a worktree was kept',
      git: run,
      recheck: () => {
        asked = true
        return ''
      },
    })
    expect(asked).toBe(false)
  })
})

// THE CAPABILITY THE REMOTE DELETION NOW RESTS ON, measured rather than assumed:
// git's `--force-with-lease` makes a DELETION a compare-and-swap at the server. If
// a future git ever stopped honouring it on a delete, this fails here rather than
// silently taking a branch somebody pushed to (sixth review, finding 3).
describe('the remote deletion is a compare-and-swap, against a real remote', () => {
  /** A repo whose landed branch is merged into main and pushed to a bare remote. */
  function remoteScene() {
    const root = mkdtempSync(join(tmpdir(), 'land-remote-'))
    roots.push(root)
    const remote = join(root, 'remote.git')
    const work = join(root, 'work')
    git(['init', '-q', '--bare', remote], root)
    git(['init', '-q', '--initial-branch=main', 'work'], root)
    git(['config', 'user.email', 't@example.com'], work)
    git(['config', 'user.name', 'T'], work)
    writeFileSync(join(work, 'a.txt'), 'a\n')
    git(['add', '.'], work)
    git(['commit', '-q', '-m', 'first'], work)
    git(['remote', 'add', 'origin', remote], work)
    git(['checkout', '-q', '-b', 'feat/608-x'], work)
    writeFileSync(join(work, 'b.txt'), 'b\n')
    git(['add', '.'], work)
    git(['commit', '-q', '-m', 'the point'], work)
    git(['push', '-q', 'origin', 'feat/608-x'], work)
    git(['checkout', '-q', 'main'], work)
    git(['merge', '-q', '--no-ff', '-m', 'land it', 'feat/608-x'], work)
    const run = (args) => git(args, work)
    const remoteHeads = () => git(['for-each-ref', '--format=%(refname)', 'refs/heads'], remote)
    return { root, work, remote, run, remoteHeads }
  }

  it('deletes the remote branch when the lease still names what was merged', () => {
    const { run, remoteHeads } = remoteScene()
    const r = deleteLandedBranch({ branch: 'feat/608-x', git: run })
    expect(r).toMatchObject({ local: 'ok', remote: 'ok' })
    expect(r.sha).toMatch(/^[0-9a-f]{40}$/)
    expect(remoteHeads()).not.toContain('feat/608-x')
  })

  it('REFUSES to delete a remote branch somebody pushed to since the landing merged it', () => {
    const { work, run, remoteHeads } = remoteScene()
    // An agent commits and pushes to its branch after the landing took its snapshot.
    git(['checkout', '-q', '-b', 'late'], work)
    writeFileSync(join(work, 'c.txt'), 'work the landing never took\n')
    git(['add', '.'], work)
    git(['commit', '-q', '-m', 'pushed after the merge'], work)
    git(['push', '-q', '--force', 'origin', 'late:feat/608-x'], work)
    git(['checkout', '-q', 'main'], work)

    const r = deleteLandedBranch({ branch: 'feat/608-x', git: run })
    expect(r).toMatchObject({ local: 'ok', remote: 'failed' })
    expect(r.problems.join('\n')).toMatch(/has moved off/)
    // The branch — and the commit only it points at — is STILL on the remote.
    expect(remoteHeads()).toContain('feat/608-x')
  })
})

describe('the branch blocker is read at the moment of deletion, not from the plan', () => {
  it('a worktree that appears AFTER the selection blocks BOTH branch deletions', () => {
    // The plan is taken minutes before the deletion. A checkout that appears in
    // between — DETACHED above all, which reports no branch at all — was invisible
    // to it, and the branch went out from under it.
    const { root, own } = scene()
    const planned = select(root)
    expect(branchDeletionBlocker({ selection: planned })).toBe('')

    // A manual checkout appears, detached on the landed branch's commit.
    const late = join(root, 'local', 'rebasing')
    mkdirSync(join(root, 'local'), { recursive: true })
    git(['worktree', 'add', '-q', '--detach', late, 'feat/608-x'], root)

    const now = select(root)
    expect(branchDeletionBlocker({ selection: now })).toMatch(/rebasing/)
    // …while the landed point's OWN dead tree is still removable: the branch is
    // what is kept, not the cleanup.
    expect(now.remove).toEqual([own])
  })

  it('reads the local branch back, and an unanswerable question reads as PRESENT', () => {
    const { root } = scene()
    expect(localBranchExists('feat/608-x', { cwd: root })).toBe(true)
    expect(localBranchExists('feat/there-is-no-such-branch', { cwd: root })).toBe(false)
    // Not a repository at all: git fails with something other than exit 1, and the
    // answer is "present", which BLOCKS the remote deletion.
    expect(localBranchExists('feat/608-x', { cwd: tmpdir() })).toBe(true)
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
