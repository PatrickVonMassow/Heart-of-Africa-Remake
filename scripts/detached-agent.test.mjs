// THE WORKER CONTRACT'S PUSH FENCE (point 834, steps 3/4): the wrapper cannot
// intercept pushes its runner performs itself, so the pre-push hook must run
// the lease gate for EVERY `git push` from the worktree — no lease, a revoked
// lease and a re-granted lease id all refuse at git level, and only the
// standing lease of the recorded holder lets a push through.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { attemptPaths, installPrePushHook, leaseGateVerdict, writeFileNoFollow } from './detached-agent.mjs'

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
