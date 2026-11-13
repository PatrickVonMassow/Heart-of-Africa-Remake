// The branches step against a real repository and a real bare origin (point 1513).
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { checkedOutBranches, mainHeldBranch, runBranchesStep } from './housekeeping-branches.mjs'

const DAY = 24 * 60 * 60 * 1000
const roots = []
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })))

const OLD = new Date(Date.now() - 30 * DAY).toISOString()
const git = (cwd, args, date) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, ...(date ? { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } : {}) },
  })
const runGit = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })

/** Commit `text` into `file` on a new branch off main, dated `date`; back to main. */
function branchWith(repo, name, file, text, date) {
  git(repo, ['checkout', '-q', '-b', name, 'main'])
  writeFileSync(join(repo, file), text)
  git(repo, ['add', file])
  git(repo, ['commit', '-q', '-m', name], date)
  git(repo, ['checkout', '-q', 'main'])
}

function scene() {
  const dir = mkdtempSync(join(tmpdir(), 'hk-branches-'))
  roots.push(dir)
  const origin = join(dir, 'origin.git')
  const repo = join(dir, 'repo')
  git(dir, ['init', '-q', '--bare', '--initial-branch=main', origin])
  git(dir, ['init', '-q', '--initial-branch=main', repo])
  git(repo, ['config', 'user.email', 't@example.com'])
  git(repo, ['config', 'user.name', 'T'])
  git(repo, ['remote', 'add', 'origin', origin])
  writeFileSync(join(repo, 'a.txt'), 'a\n')
  git(repo, ['add', '.'])
  git(repo, ['commit', '-q', '-m', 'first'], OLD)
  // Contained: main carries the same content by another commit, then edits it on.
  branchWith(repo, 'rescue/doctor-old', 'b.txt', 'rescued\n', OLD)
  branchWith(repo, 'claude/cloud-done', 'c.txt', 'cloud\n', OLD)
  writeFileSync(join(repo, 'b.txt'), 'rescued\n')
  writeFileSync(join(repo, 'c.txt'), 'cloud\n')
  git(repo, ['add', '.'])
  git(repo, ['commit', '-q', '-m', 'main takes both'])
  writeFileSync(join(repo, 'b.txt'), 'rescued\nmore\n')
  git(repo, ['commit', '-q', '-am', 'main edits on'])
  branchWith(repo, 'rescue/doctor-lost', 'd.txt', 'only here\n', OLD)
  branchWith(repo, 'rescue/doctor-young', 'b.txt', 'rescued\n')
  branchWith(repo, 'rescue/doctor-busy', 'c.txt', 'cloud\nbusy\n', OLD)
  git(repo, ['worktree', 'add', '-q', join(dir, 'wt'), 'rescue/doctor-busy'])
  git(repo, ['push', '-q', 'origin', 'main', 'rescue/doctor-old', 'claude/cloud-done', 'rescue/doctor-lost'])
  return { repo, origin }
}

const heads = (cwd) => git(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter(Boolean).sort()
const archiveText = ['# Archive', '- [x] 12. Cloud work', '  ran on claude/cloud-done', ''].join('\n')
const workOrder = { ok: true, open: new Set(), closed: new Set([12]) }

function run(repo, dryRun) {
  const lines = []
  const failures = []
  const result = runBranchesStep({
    runGit,
    repoRoot: repo,
    now: Date.now(),
    dryRun,
    workOrder,
    archiveText,
    readWorktrees: () => git(repo, ['worktree', 'list', '--porcelain']),
    emit: (l) => lines.push(l),
    fail: (kind, detail) => failures.push({ kind, detail }),
  })
  return { result, lines, failures }
}

describe('the branches step (point 1513)', () => {
  it('reads containment from real merges: carried, missing, removed, reordered', () => {
    const { repo } = scene()
    const sha = (n) => git(repo, ['rev-parse', n]).trim()
    expect(mainHeldBranch(runGit, repo, sha('rescue/doctor-old'))).toBe(true)
    expect(mainHeldBranch(runGit, repo, sha('rescue/doctor-lost'))).toBe(false)
    // Removal only: main still has the line the branch removed.
    git(repo, ['checkout', '-q', '-b', 'rescue/doctor-removes', 'main'])
    git(repo, ['rm', '-q', 'a.txt'])
    git(repo, ['commit', '-q', '-m', 'remove'])
    // A line `++ counter;` shows as `+++ counter;` in a patch.
    git(repo, ['checkout', '-q', '-b', 'rescue/doctor-plus', 'main'])
    writeFileSync(join(repo, 'a.txt'), 'a\n++ counter;\n')
    git(repo, ['commit', '-q', '-am', 'plus'])
    // Same lines, other order.
    git(repo, ['checkout', '-q', '-b', 'rescue/doctor-order', 'main'])
    writeFileSync(join(repo, 'b.txt'), 'more\nrescued\n')
    git(repo, ['commit', '-q', '-am', 'order'])
    git(repo, ['checkout', '-q', 'main'])
    for (const n of ['rescue/doctor-removes', 'rescue/doctor-plus', 'rescue/doctor-order']) {
      expect(mainHeldBranch(runGit, repo, sha(n)), n).toBe(false)
    }
    expect(mainHeldBranch(runGit, repo, 'no-such-ref')).toBe(null)
  })

  it('reads only main\'s own snapshots, never a side branch merged in', () => {
    const { repo } = scene()
    writeFileSync(join(repo, 'f.txt'), 'top\nmid\nbottom\n')
    git(repo, ['add', 'f.txt'])
    git(repo, ['commit', '-q', '-m', 'fork'])
    const fork = git(repo, ['rev-parse', 'main']).trim()
    // Main gains line L; the rescue branch removes it again.
    writeFileSync(join(repo, 'f.txt'), 'top\nL\nmid\nbottom\n')
    git(repo, ['commit', '-q', '-am', 'main adds L'])
    git(repo, ['checkout', '-q', '-b', 'rescue/doctor-drops-l', 'main'])
    writeFileSync(join(repo, 'f.txt'), 'top\nmid\nbottom\n')
    git(repo, ['commit', '-q', '-am', 'drop L'])
    // A side branch from before L edits the same file elsewhere; main merges it and keeps L.
    git(repo, ['checkout', '-q', '-b', 'side', fork])
    writeFileSync(join(repo, 'f.txt'), 'top\nmid\nbottom\nside\n')
    git(repo, ['commit', '-q', '-am', 'side'])
    git(repo, ['checkout', '-q', 'main'])
    git(repo, ['merge', '-q', '--no-edit', 'side'])
    expect(git(repo, ['show', 'main:f.txt'])).toBe('top\nL\nmid\nbottom\nside\n')
    expect(mainHeldBranch(runGit, repo, git(repo, ['rev-parse', 'rescue/doctor-drops-l']).trim())).toBe(false)
  })

  it('a dry run plans exactly the old contained branches and deletes nothing', () => {
    const { repo, origin } = scene()
    const before = { local: heads(repo), origin: heads(origin) }
    const { result, lines, failures } = run(repo, true)
    expect(failures).toEqual([])
    expect(result).toBe('planned')
    const planned = lines.filter((l) => l.outcome === 'would-delete').map((l) => l.path).sort()
    expect(planned).toEqual([
      'origin:refs/heads/claude/cloud-done',
      'origin:refs/heads/rescue/doctor-old',
      'refs/heads/claude/cloud-done',
      'refs/heads/rescue/doctor-old',
    ])
    expect({ local: heads(repo), origin: heads(origin) }).toEqual(before)
  })

  it('deletes them locally and on origin, and keeps lost, young and checked-out branches', () => {
    const { repo, origin } = scene()
    const { result, lines, failures } = run(repo, false)
    expect(failures).toEqual([])
    expect(result).toBe('done')
    expect(heads(repo)).toEqual(['main', 'rescue/doctor-busy', 'rescue/doctor-lost', 'rescue/doctor-young'])
    expect(heads(origin)).toEqual(['main', 'rescue/doctor-lost'])
    const kept = Object.fromEntries(lines.filter((l) => l.outcome === 'kept').map((l) => [l.path, l.reason]))
    expect(kept['refs/heads/rescue/doctor-busy']).toBe('checked out in a worktree')
    expect(kept['refs/heads/rescue/doctor-lost']).toBe('content missing from main')
    expect(kept['refs/heads/rescue/doctor-young']).toBe('young')
  })

  it('leaves an origin branch that moved after it was judged (lease)', () => {
    const { repo, origin } = scene()
    let pushed = false
    const racing = (args, cwd) => {
      if (args[0] === 'push' && !pushed) {
        pushed = true
        // Another clone moves the branch between the judgement and the push.
        git(repo, ['checkout', '-q', 'rescue/doctor-old'])
        writeFileSync(join(repo, 'e.txt'), 'new work\n')
        git(repo, ['add', 'e.txt'])
        git(repo, ['commit', '-q', '-m', 'late'])
        git(repo, ['push', '-q', 'origin', 'rescue/doctor-old'])
        git(repo, ['checkout', '-q', 'main'])
      }
      return runGit(args, cwd)
    }
    const failures = []
    runBranchesStep({
      runGit: racing,
      repoRoot: repo,
      now: Date.now(),
      dryRun: false,
      workOrder,
      archiveText,
      readWorktrees: () => git(repo, ['worktree', 'list', '--porcelain']),
      emit: () => {},
      fail: (kind, detail) => failures.push({ kind, detail }),
    })
    expect(heads(origin)).toContain('rescue/doctor-old')
    expect(failures.map((f) => f.kind)).toContain('branch-delete-failed')
  })

  it('keeps a branch a worktree checks out between the judgement and the deletion', () => {
    const { repo } = scene()
    let reads = 0
    const lines = []
    runBranchesStep({
      runGit,
      repoRoot: repo,
      now: Date.now(),
      dryRun: false,
      workOrder,
      archiveText,
      readWorktrees: () => {
        if (++reads === 2) git(repo, ['worktree', 'add', '-q', `${repo}-late`, 'rescue/doctor-old'])
        return git(repo, ['worktree', 'list', '--porcelain'])
      },
      emit: (l) => lines.push(l),
      fail: () => {},
    })
    expect(heads(repo)).toContain('rescue/doctor-old')
    expect(lines.find((l) => l.path === 'refs/heads/rescue/doctor-old')?.reason).toBe('checked out in a worktree')
  })

  it('reads the push result by the exact ref, not a prefix', () => {
    const old = String(Math.floor((Date.now() - 30 * DAY) / 1000))
    const fake = (args) => {
      if (args[0] === 'for-each-ref') return { status: 0, stdout: '' }
      if (args[0] === 'ls-remote')
        return { status: 0, stdout: `${'a'.repeat(40)}\trefs/heads/rescue/doctor-a\n${'b'.repeat(40)}\trefs/heads/rescue/doctor-a-b\n` }
      if (args[0] === 'log') return { status: 0, stdout: `${old}\n` }
      if (args[0] === 'push')
        return { status: 1, stdout: '-\t:refs/heads/rescue/doctor-a-b\t[deleted]\n!\t:refs/heads/rescue/doctor-a\t[rejected] (stale info)\nDone\n' }
      return { status: 128, stdout: '' }
    }
    const lines = []
    runBranchesStep({ runGit: fake, repoRoot: '/', now: Date.now(), dryRun: false, readWorktrees: () => 'worktree /x\nbare\n', contained: () => true, emit: (l) => lines.push(l), fail: () => {} })
    const outcome = Object.fromEntries(lines.map((l) => [l.path, l.outcome]))
    expect(outcome).toEqual({ 'origin:refs/heads/rescue/doctor-a': 'failed', 'origin:refs/heads/rescue/doctor-a-b': 'deleted' })
  })

  it('an unreadable or malformed worktree list skips the step', () => {
    const incomplete = `worktree /repo\nHEAD ${'a'.repeat(40)}\n`
    for (const readWorktrees of [() => null, () => '', () => 'garbage\n', () => incomplete, () => 'worktree /x\nbare\ndetached\n', () => `${incomplete}detached\nbranch refs/heads/a\n`, () => `worktree /x\nbare\nHEAD ${'a'.repeat(40)}\n`, () => `worktree /x\nHEAD ${'a'.repeat(40)}\nbare\n`, () => { throw new Error('x') }]) {
      const failures = []
      const r = runBranchesStep({ runGit, repoRoot: '/', now: 0, readWorktrees, emit: () => {}, fail: (k) => failures.push(k) })
      expect(r).toBe('skipped')
      expect(failures).toEqual(['branches-worktrees-unreadable'])
    }
    const head = `HEAD ${'a'.repeat(40)}`
    expect(checkedOutBranches(`worktree /x\n${head}\nbranch refs/heads/rescue/doctor-a\n`)).toEqual(new Set(['rescue/doctor-a']))
    expect(checkedOutBranches(`worktree /x\n${head}\ndetached\nlocked\n\nworktree /y\nbare\n`)).toEqual(new Set())
  })
})
