// THE WORKER CONTRACT'S PUSH FENCE (point 834, steps 3/4): the wrapper cannot
// intercept pushes its runner performs itself, so the pre-push hook must run
// the lease gate for EVERY `git push` from the worktree — no lease, a revoked
// lease and a re-granted lease id all refuse at git level, and only the
// standing lease of the recorded holder lets a push through.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attemptPaths, checkpointAcknowledgment, installPrePushHook, leaseGateVerdict, pushBranchCheckpoint, writeFileNoFollow } from './detached-agent.mjs'

let sandbox, originDir, worktree, attemptDir, paths

const holder = { pid: process.pid, pidStartedAt: 123_456 }
const lease = (over = {}) => ({
  batchId: 'b',
  pointId: 'p',
  attemptId: 'a1',
  leaseId: 'L1',
  holder,
  grantedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  ...over,
})

const git = (args, cwd) =>
  execFileSync('git', args, { windowsHide: true,
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  }).trim()

const tryPush = () => {
  try {
    git(['push', 'origin', 'feat/x'], worktree)
    return { ok: true, err: '' }
  } catch (error) {
    return { ok: false, err: `${error.stderr ?? ''}${error.stdout ?? ''}` }
  }
}

const commitSomething = (text) => {
  writeFileSync(join(worktree, 'work.txt'), `${text}\n`)
  git(['add', '.'], worktree)
  git(['commit', '-q', '-m', text], worktree)
}

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'push-fence-'))
  originDir = join(sandbox, 'origin.git')
  worktree = join(sandbox, 'wt')
  attemptDir = join(sandbox, 'attempt')
  paths = attemptPaths(attemptDir)
  execFileSync('git', ['init', '-q', '--bare', originDir], { windowsHide: true })
  execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { windowsHide: true, cwd: originDir })
  execFileSync('git', ['clone', '-q', originDir, worktree], { windowsHide: true })
  git(['checkout', '-q', '-b', 'feat/x'], worktree)
  commitSomething('seed')
  const installed = installPrePushHook({ worktree, attemptDir, leaseId: 'L1', holder })
  expect(installed).toBe(true)
})

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true })
})

describe('the pre-push lease gate — pushes the wrapper never sees are still fenced', () => {
  it('refuses a push with no lease on disk', () => {
    const res = tryPush()
    expect(res.ok).toBe(false)
    expect(res.err).toMatch(/pre-push refused/)
  })

  it('lets the standing holder push, and refuses again once the lease is revoked', () => {
    writeFileSync(paths.leasePath, `${JSON.stringify({ lease: lease() })}\n`)
    expect(tryPush().ok).toBe(true)
    // The daemon revokes by writing lease: null — from that moment every push
    // from this worktree is refused, whoever performs it.
    writeFileSync(paths.leasePath, `${JSON.stringify({ lease: null, revokedAt: Date.now() })}\n`)
    commitSomething('after revocation')
    const res = tryPush()
    expect(res.ok).toBe(false)
    expect(res.err).toMatch(/pre-push refused/)
  })

  it('refuses a re-granted lease id and an expired term', () => {
    writeFileSync(paths.leasePath, `${JSON.stringify({ lease: lease({ leaseId: 'L2' }) })}\n`)
    expect(tryPush().ok).toBe(false)
    writeFileSync(paths.leasePath, `${JSON.stringify({ lease: lease({ expiresAt: Date.now() - 1 }) })}\n`)
    expect(tryPush().ok).toBe(false)
  })

  it('leaseGateVerdict fails closed on a gate invoked without its arguments', () => {
    expect(leaseGateVerdict({}).verdict).toBe('fenced')
    expect(leaseGateVerdict(null).verdict).toBe('fenced')
  })
})

describe('the gate is PER WORKTREE — linked worktrees of one repository keep separate hooks', () => {
  it('installing a second attempt in a linked worktree does not replace the first attempt\'s hook', () => {
    // Plain `git config core.hooksPath` writes the SHARED repository config, so
    // every new attempt would replace every other attempt's gate: a stale
    // worker pushing through the newest attempt's lease, legitimate older
    // attempts spuriously fenced. The per-worktree config is what pins each
    // gate to the checkout it fences.
    const linkedA = join(sandbox, 'linked-a')
    const linkedB = join(sandbox, 'linked-b')
    git(['worktree', 'add', '-q', '-b', 'feat/link-a', linkedA], worktree)
    git(['worktree', 'add', '-q', '-b', 'feat/link-b', linkedB], worktree)
    const dirA = join(sandbox, 'attempt-link-a')
    const dirB = join(sandbox, 'attempt-link-b')
    expect(installPrePushHook({ worktree: linkedA, attemptDir: dirA, leaseId: 'LA', holder })).toBe(true)
    expect(installPrePushHook({ worktree: linkedB, attemptDir: dirB, leaseId: 'LB', holder })).toBe(true)
    // Each worktree's EFFECTIVE hooks path is its own attempt's gate, and
    // installing B did not move A's.
    expect(git(['config', 'core.hooksPath'], linkedA)).toBe(join(dirA, 'hooks'))
    expect(git(['config', 'core.hooksPath'], linkedB)).toBe(join(dirB, 'hooks'))
    // The original standalone worktree keeps ITS gate too.
    expect(git(['config', 'core.hooksPath'], worktree)).toBe(join(attemptDir, 'hooks'))
  })
})

describe('writeFileNoFollow — the heartbeat write refuses planted links', () => {
  it('overwrites a regular file in place but refuses a symlink target', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nofollow-'))
    try {
      const real = join(dir, 'heartbeat')
      writeFileNoFollow(real, '1\n')
      writeFileNoFollow(real, '2\n')
      expect(readFileSync(real, 'utf8')).toBe('2\n')
      const target = join(dir, 'elsewhere')
      writeFileSync(target, 'untouched\n')
      const link = join(dir, 'link-heartbeat')
      execFileSync('ln', ['-s', target, link], { windowsHide: true })
      expect(() => writeFileNoFollow(link, 'redirected\n')).toThrow()
      expect(readFileSync(target, 'utf8')).toBe('untouched\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('checkpoint acknowledgment — runner and wrapper pushes may race', () => {
  const fixture = () => {
    const dir = mkdtempSync(join(tmpdir(), 'checkpoint-race-'))
    const remote = join(dir, 'origin.git')
    const worktree = join(dir, 'wt')
    execFileSync('git', ['init', '-q', '--bare', remote], { windowsHide: true })
    execFileSync('git', ['clone', '-q', remote, worktree], { windowsHide: true })
    git(['checkout', '-q', '-b', 'feat/race'], worktree)
    writeFileSync(join(worktree, 'work.txt'), 'seed\n')
    git(['add', '.'], worktree)
    git(['commit', '-q', '-m', 'seed'], worktree)
    git(['push', '-q', 'origin', 'feat/race'], worktree)
    writeFileSync(join(worktree, 'work.txt'), 'checkpoint\n')
    git(['add', '.'], worktree)
    git(['commit', '-q', '-m', 'checkpoint'], worktree)
    const head = git(['rev-parse', 'HEAD'], worktree)
    const runGit = (args, cwd) => {
      const res = spawnSync('git', args, { windowsHide: true, cwd, encoding: 'utf8' })
      return { ok: res.status === 0, out: (res.stdout || '').trim(), err: (res.stderr || '').trim() }
    }
    return { dir, remote, worktree, head, runGit }
  }

  it('reports complete when the runner advances and pushes after the wrapper observes but before its CAS', () => {
    const f = fixture()
    try {
      let gates = 0
      let raced = false
      const runGit = (args, cwd) => {
        if (args[0] === 'push' && !raced) {
          raced = true
          // Make a runner commit whose parent is the wrapper's captured head,
          // without moving the wrapper checkout's HEAD, then land it first.
          const runnerHead = git(['commit-tree', `${f.head}^{tree}`, '-p', f.head, '-m', 'runner advance'], f.worktree)
          git(['push', '-q', 'origin', `${runnerHead}:refs/heads/feat/race`], f.worktree)
        }
        return f.runGit(args, cwd)
      }
      const answer = checkpointAcknowledgment({
        requestId: 'race-complete',
        branch: 'feat/race',
        worktree: f.worktree,
        mayPush: () => {
          gates += 1
          return { verdict: 'write' }
        },
        runGit,
        now: () => 123,
      })
      expect(raced).toBe(true)
      expect(gates).toBe(2) // initial observation and fenced re-observation
      expect(answer).toEqual({
        fenced: false,
        ack: { requestId: 'race-complete', at: 123, sha: f.head, pushedOk: true, dirty: false, aheadOfPush: false },
      })
      expect(git(['merge-base', '--is-ancestor', f.head, 'refs/remotes/origin/feat/race'], f.worktree)).toBe('')
    } finally {
      rmSync(f.dir, { recursive: true, force: true })
    }
  })

  it('reports incomplete when a rejected push leaves the local head genuinely unpushed', () => {
    const f = fixture()
    try {
      let rejected = false
      const answer = checkpointAcknowledgment({
        requestId: 'still-local',
        branch: 'feat/race',
        worktree: f.worktree,
        mayPush: () => ({ verdict: 'write' }),
        runGit: (args, cwd) => {
          if (args[0] === 'push' && !rejected) {
            rejected = true
            return { ok: false, out: '', err: 'simulated CAS rejection' }
          }
          return f.runGit(args, cwd)
        },
        now: () => 456,
      })
      expect(answer).toEqual({
        fenced: false,
        ack: { requestId: 'still-local', at: 456, sha: f.head, pushedOk: false, dirty: false, aheadOfPush: false },
      })
      expect(git(['rev-parse', 'refs/heads/feat/race'], f.remote)).not.toBe(f.head)
    } finally {
      rmSync(f.dir, { recursive: true, force: true })
    }
  })

  it('fences when the remote moves to a history unrelated to the local checkpoint', () => {
    const f = fixture()
    try {
      let raced = false
      const result = pushBranchCheckpoint({
        branch: 'feat/race',
        worktree: f.worktree,
        mayPush: () => ({ verdict: 'write' }),
        runGit: (args, cwd) => {
          if (args[0] === 'push' && !raced) {
            raced = true
            const parent = git(['rev-parse', `${f.head}^`], f.worktree)
            const divergent = git(['commit-tree', `${parent}^{tree}`, '-p', parent, '-m', 'successor history'], f.worktree)
            git(['push', '-q', '--force', 'origin', `${divergent}:refs/heads/feat/race`], f.worktree)
          }
          return f.runGit(args, cwd)
        },
      })
      expect(result).toMatchObject({ ok: false, fenced: true, sha: f.head })
      expect(result.why).toMatch(/outside the local checkpoint history/)
    } finally {
      rmSync(f.dir, { recursive: true, force: true })
    }
  })
})
