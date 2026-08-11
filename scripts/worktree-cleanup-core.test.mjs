// The cleanup that must not reach outside its worktree (point 429).
//
// The load-bearing case is `removeTreeSafely`: a throwaway tree carrying a LINK
// that stands in for the dependency directory is removed, and the LINK TARGET
// must still exist afterwards. That is the assertion the two removals of
// 29.07.2026 would have failed — both of them deleted the main tree's
// node_modules through exactly such a link.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync, symlinkSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  judgeTarget,
  insideRoot,
  shouldDetach,
  assertInside,
  formatRefusal,
  stubBranchFor,
  matchesExpectation,
  REFUSALS,
} from './worktree-cleanup-core.mjs'
import { cleanupWorktree, detachLinks } from './worktree-cleanup.mjs'

const ROOT = 'C:/repo'
const WT = `${ROOT}/.claude/worktrees/agent-1`

describe('judgeTarget — what may be removed', () => {
  it('accepts a registered worktree', () => {
    expect(judgeTarget({ target: WT, mainRoot: ROOT, worktrees: [ROOT, WT] })).toMatchObject({
      ok: true,
      reason: 'registered',
    })
  })

  it('REFUSES the main checkout, even though git lists it as a worktree', () => {
    const v = judgeTarget({ target: ROOT, mainRoot: ROOT, worktrees: [ROOT, WT] })
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('main-tree')
  })

  it('REFUSES a path that is not a worktree at all', () => {
    const v = judgeTarget({ target: 'C:/somewhere/else', mainRoot: ROOT, worktrees: [ROOT, WT] })
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('not-a-worktree')
  })

  it('REFUSES a path that CONTAINS the main checkout', () => {
    const v = judgeTarget({ target: 'C:/', mainRoot: ROOT, worktrees: [ROOT] })
    expect(v.ok).toBe(false)
    expect(v.reason).toBe('is-repo-parent')
  })

  it('REFUSES an empty path rather than defaulting to anything', () => {
    expect(judgeTarget({ target: '', mainRoot: ROOT }).reason).toBe('no-path')
    expect(judgeTarget({}).ok).toBe(false)
  })

  it('accepts an ORPHAN left under .claude/worktrees by a half-finished removal', () => {
    const v = judgeTarget({ target: `${ROOT}/.claude/worktrees/agent-dead`, mainRoot: ROOT, worktrees: [ROOT] })
    expect(v).toMatchObject({ ok: true, reason: 'orphan-under-worktrees-dir' })
  })

  it('does not accept an orphan when orphans are disallowed', () => {
    const v = judgeTarget({
      target: `${ROOT}/.claude/worktrees/agent-dead`,
      mainRoot: ROOT,
      worktrees: [ROOT],
      allowOrphan: false,
    })
    expect(v.ok).toBe(false)
  })

  it('is separator- and case-insensitive, the way both git and Windows are', () => {
    expect(judgeTarget({ target: 'C:\\Repo\\.claude\\worktrees\\Agent-1\\', mainRoot: ROOT, worktrees: [ROOT, WT] }).ok).toBe(
      true,
    )
  })

  it('every refusal reason has a sentence', () => {
    for (const key of Object.keys(REFUSALS)) expect(REFUSALS[key]).toBeTruthy()
    expect(formatRefusal({ path: WT, reason: 'main-tree' })).toContain('MAIN checkout')
  })
})

describe('stubBranchFor — the branch an agent worktree is cut with (point 613)', () => {
  it('names the setup branch of an agent worktree, separators either way', () => {
    expect(stubBranchFor(WT)).toBe('worktree-agent-1')
    expect(stubBranchFor('C:\\repo\\.claude\\worktrees\\agent-af39\\')).toBe('worktree-agent-af39')
  })

  it('names NOTHING for a tree that carries no such stub', () => {
    expect(stubBranchFor(`${ROOT}/wt`)).toBe(null)
    expect(stubBranchFor(ROOT)).toBe(null)
    expect(stubBranchFor('')).toBe(null)
    expect(stubBranchFor(null)).toBe(null)
  })
})

describe('insideRoot / assertInside — the check the two incidents lacked', () => {
  it('the root is not inside itself, and a sibling with a shared prefix is not inside either', () => {
    expect(insideRoot(ROOT, ROOT)).toBe(false)
    expect(insideRoot('C:/repo-2/x', ROOT)).toBe(false)
    expect(insideRoot(`${ROOT}/x`, ROOT)).toBe(true)
  })

  it('assertInside THROWS on a path outside the worktree root', () => {
    expect(() => assertInside('C:/repo/node_modules', WT)).toThrow(/not inside the worktree root/)
    expect(() => assertInside(`${WT}/node_modules`, WT)).not.toThrow()
  })
})

describe('shouldDetach', () => {
  it('detaches a symlink and a junction, descends into a plain directory', () => {
    expect(shouldDetach({ isSymbolicLink: true, isDirectory: false })).toBe(true)
    expect(shouldDetach({ isJunction: true, isDirectory: true })).toBe(true)
    expect(shouldDetach({ isSymbolicLink: false, isJunction: false, isDirectory: true })).toBe(false)
    expect(shouldDetach(null)).toBe(false)
  })
})

describe('the incident, replayed on a THROWAWAY repository', () => {
  // Nothing here touches a real worktree — that is how the damage happened
  // twice. Every path below lives under the OS temp directory and is destroyed
  // in afterEach.
  let tmp
  let repo
  let mainDeps
  let worktree
  let probe

  const git = (args, cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true })

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'hoa-wt-cleanup-'))
    repo = join(tmp, 'main')
    mkdirSync(repo, { recursive: true })
    git(['init', '-q', '-b', 'main'])
    git(['config', 'user.email', 'test@example.invalid'])
    git(['config', 'user.name', 'test'])
    writeFileSync(join(repo, 'a.txt'), 'a')
    git(['add', '-A'])
    git(['commit', '-qm', 'init'])

    // The dependency directory the two incidents destroyed.
    mainDeps = join(repo, 'node_modules')
    probe = join(mainDeps, 'typescript', 'bin', 'tsc')
    mkdirSync(join(mainDeps, 'typescript', 'bin'), { recursive: true })
    writeFileSync(probe, 'the dependency that vanished twice')

    worktree = join(tmp, 'wt')
    git(['worktree', 'add', '-q', '-b', 'feat/x', worktree])
    // The harness creates a JUNCTION on Windows (no elevation needed); on POSIX
    // a directory symlink has the identical follow-through behaviour.
    try {
      symlinkSync(mainDeps, join(worktree, 'node_modules'), 'junction')
    } catch {
      symlinkSync(mainDeps, join(worktree, 'node_modules'), 'dir')
    }
    writeFileSync(join(worktree, 'dirty.txt'), 'uncommitted leftovers, like a finished agent leaves')
  })

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch {
      /* a temp directory that will not go is the OS's problem, not the suite's */
    }
  })

  // THE NEGATIVE CONTROL IS PLATFORM-BOUND, and pretending otherwise cost the
  // repository owner eleven "Run failed" mails on 30.07.2026: the incident is a
  // WINDOWS one — git's removal follows a junction and deletes what is on the far
  // side — while on Linux the same command removes the link and leaves the target
  // alone. Asserting the damage everywhere therefore failed every CI run on the
  // hosted Ubuntu runner while the whole suite was green on the machine that
  // wrote it. So the control asserts the damage only where the damage exists, and
  // elsewhere it asserts the platform's OWN behaviour rather than skipping —
  // silence would let a future regression hide behind "not applicable here".
  const REPRODUCES_THE_DAMAGE = process.platform === 'win32'

  it('NEGATIVE CONTROL: the bare `git worktree remove --force` treats the link as its platform does', () => {
    // Without this case the positive one below proves nothing on Windows: node's
    // own rmSync does NOT follow a junction, so a test built on it would stay
    // green with the fix removed. This is the command both 29.07.2026 removals
    // used.
    expect(existsSync(probe)).toBe(true)
    git(['worktree', 'remove', '--force', worktree])
    expect(existsSync(worktree)).toBe(false)
    if (REPRODUCES_THE_DAMAGE) {
      expect(existsSync(probe)).toBe(false) // the damage, reproduced
    } else {
      // Linux/macOS: the link goes, the target stays. The fix is still required —
      // it is what makes the WINDOWS path safe — and the positive case below
      // pins it on every platform.
      expect(existsSync(probe)).toBe(true)
    }
  })

  it('cleanupWorktree removes the worktree and leaves the LINK TARGET intact', () => {
    expect(existsSync(join(worktree, 'node_modules', 'typescript', 'bin', 'tsc'))).toBe(true)

    const result = cleanupWorktree(worktree, { git })

    expect(result.ok).toBe(true)
    expect(existsSync(worktree)).toBe(false)
    expect(result.detached.map((d) => d.path)).toContain(join(worktree, 'node_modules'))
    // THE assertion. The negative control above shows it can fail.
    expect(existsSync(probe)).toBe(true)
    expect(readFileSync(probe, 'utf8')).toContain('vanished twice')
    expect(readdirSync(join(mainDeps, 'typescript'))).toContain('bin')
    // git's own record goes with it.
    expect(git(['worktree', 'list', '--porcelain']).replace(/\\/g, '/')).not.toContain(worktree.replace(/\\/g, '/'))
  })

  it('finds a link nested deeper than the top level', () => {
    mkdirSync(join(worktree, 'packages', 'app'), { recursive: true })
    try {
      symlinkSync(mainDeps, join(worktree, 'packages', 'app', 'node_modules'), 'junction')
    } catch {
      symlinkSync(mainDeps, join(worktree, 'packages', 'app', 'node_modules'), 'dir')
    }
    const result = cleanupWorktree(worktree, { git })
    expect(result.detached).toHaveLength(2)
    expect(existsSync(worktree)).toBe(false)
    expect(existsSync(probe)).toBe(true)
  })

  it('REFUSES the main checkout, and removes nothing', () => {
    const result = cleanupWorktree(repo, { git })
    expect(result.ok).toBe(false)
    expect(result.verdict.reason).toBe('main-tree')
    expect(existsSync(repo)).toBe(true)
    expect(existsSync(worktree)).toBe(true)
  })

  it('REFUSES a path outside the repository, and removes nothing', () => {
    const stranger = join(tmp, 'not-a-worktree')
    mkdirSync(stranger)
    const result = cleanupWorktree(stranger, { git })
    expect(result.ok).toBe(false)
    expect(result.verdict.reason).toBe('not-a-worktree')
    expect(existsSync(stranger)).toBe(true)
  })

  it('--dry touches nothing but still names the links it found', () => {
    const result = cleanupWorktree(worktree, { git, dry: true })
    expect(result.detached).toHaveLength(1)
    expect(existsSync(join(worktree, 'node_modules'))).toBe(true)
    expect(existsSync(worktree)).toBe(true)
    expect(existsSync(probe)).toBe(true)
  })

  // POINT 613: the setup branch git creates with an agent worktree is abandoned
  // seconds later, and once `main` moves it reads as merged debris to
  // branch-hygiene-guard. It is cleaned up HERE, where it is created.
  const addAgentTree = (id, { commit = false } = {}) => {
    const path = join(tmp, id)
    git(['worktree', 'add', '-q', '-b', `worktree-${id}`, path])
    if (commit) {
      writeFileSync(join(path, 'work.txt'), 'a commit the stub actually carries')
      git(['add', '-A'], path)
      git(['commit', '-qm', 'work on the stub'], path)
    }
    return path
  }
  const branches = () =>
    git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
      .split(/\r?\n/)
      .filter(Boolean)

  it('removes the setup branch together with the tree it belongs to', () => {
    const path = addAgentTree('agent-99')
    expect(branches()).toContain('worktree-agent-99')

    const result = cleanupWorktree(path, { git })

    expect(result.ok).toBe(true)
    expect(existsSync(path)).toBe(false)
    expect(result.stub).toMatchObject({ branch: 'worktree-agent-99', deleted: true })
    expect(branches()).not.toContain('worktree-agent-99')
  })

  it('leaves an ordinary worktree branch alone — only the setup stub goes', () => {
    const result = cleanupWorktree(worktree, { git })
    expect(result.stub).toBe(null)
    expect(branches()).toContain('feat/x')
  })

  it('KEEPS a stub that carries commits of its own — `-d`, never `-D`', () => {
    const path = addAgentTree('agent-98', { commit: true })
    const result = cleanupWorktree(path, { git })
    expect(existsSync(path)).toBe(false)
    expect(result.stub).toMatchObject({ branch: 'worktree-agent-98', deleted: false })
    expect(branches()).toContain('worktree-agent-98') // work is not debris
  })

  it('drops the stub of a tree a half-finished removal already took', () => {
    // The state the guard used to find and report: the directory is gone, git's
    // record is stale, and the branch is the only thing left.
    const path = addAgentTree('agent-96')
    rmSync(path, { recursive: true, force: true })

    const result = cleanupWorktree(path, { git })

    expect(result.ok).toBe(true)
    expect(result.note).toContain('already gone')
    expect(result.stub).toMatchObject({ branch: 'worktree-agent-96', deleted: true })
    expect(branches()).not.toContain('worktree-agent-96')
  })

  it('--dry deletes no branch either', () => {
    const path = addAgentTree('agent-97')
    const result = cleanupWorktree(path, { git, dry: true })
    expect(result.stub).toMatchObject({ branch: 'worktree-agent-97', deleted: false })
    expect(branches()).toContain('worktree-agent-97')
    expect(existsSync(path)).toBe(true)
  })

  it('detachLinks alone never descends through a link', () => {
    const detached = detachLinks(worktree)
    expect(detached).toHaveLength(1)
    expect(existsSync(join(worktree, 'node_modules'))).toBe(false)
    expect(existsSync(probe)).toBe(true)
    expect(existsSync(join(worktree, 'dirty.txt'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// THE RE-PROOF INSIDE THE PROCESS THAT DELETES (point 629). The caller checked
// before it spawned this command; between that answer and the removal a worktree
// can be picked up again, and only a check INSIDE this process can see that.
describe('matchesExpectation — pure', () => {
  const entry = { path: '/repo/.claude/worktrees/agent-a', branch: 'feat/608-x', locked: null }

  it('passes an unlocked, clean checkout still on the expected branch', () => {
    expect(matchesExpectation({ expectBranch: 'feat/608-x', entry, dirty: false })).toMatchObject({ ok: true })
  })

  it('changes nothing when the caller expects nothing — orphan removal has no branch to compare', () => {
    expect(matchesExpectation({ entry: null, dirty: null }).ok).toBe(true)
    expect(matchesExpectation({ expectBranch: '  ', entry: null }).ok).toBe(true)
  })

  it('refuses a path git no longer lists', () => {
    const r = matchesExpectation({ expectBranch: 'feat/608-x', entry: null, dirty: false })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/no longer lists/)
  })

  it('refuses a checkout that moved to another branch, or detached', () => {
    const moved = { ...entry, branch: 'feat/590-y' }
    expect(matchesExpectation({ expectBranch: 'feat/608-x', entry: moved, dirty: false }).ok).toBe(false)
    expect(matchesExpectation({ expectBranch: 'feat/608-x', entry: { ...entry, branch: '' }, dirty: false }).ok).toBe(
      false,
    )
  })

  it('refuses a checkout that was locked since', () => {
    const locked = { ...entry, locked: 'claude agent (pid 7)' }
    const r = matchesExpectation({ expectBranch: 'feat/608-x', entry: locked, dirty: false })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/git-locked/)
  })

  it('refuses on uncommitted work, and on a dirtiness that could not be read', () => {
    expect(matchesExpectation({ expectBranch: 'feat/608-x', entry, dirty: true }).ok).toBe(false)
    expect(matchesExpectation({ expectBranch: 'feat/608-x', entry, dirty: null }).ok).toBe(false)
  })
})

describe('--expect-branch, on a THROWAWAY repository', () => {
  let tmp
  let repo
  let worktree
  const run = (args, cwd) => execFileSync('git', args, { cwd: cwd ?? repo, encoding: 'utf8', windowsHide: true })

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'hoa-wt-expect-'))
    repo = join(tmp, 'main')
    mkdirSync(repo, { recursive: true })
    run(['init', '-q', '-b', 'main'])
    run(['config', 'user.email', 'test@example.invalid'])
    run(['config', 'user.name', 'test'])
    writeFileSync(join(repo, 'a.txt'), 'a')
    run(['add', '-A'])
    run(['commit', '-qm', 'init'])
    worktree = join(tmp, 'wt')
    run(['worktree', 'add', '-q', '-b', 'feat/608-x', worktree])
  })

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    } catch {
      /* the OS's problem, not the suite's */
    }
  })

  const cleanup = (opts) => cleanupWorktree(worktree, { git: (args, cwd) => run(args, cwd), ...opts })

  it('removes the tree when the expectation still holds', () => {
    expect(cleanup({ expectBranch: 'feat/608-x' }).ok).toBe(true)
    expect(existsSync(worktree)).toBe(false)
  })

  it("REFUSES a tree that was locked between the caller's check and this command", () => {
    run(['worktree', 'lock', '--reason', 'claude agent agent-x (pid 999999 start 1)', worktree])
    const r = cleanup({ expectBranch: 'feat/608-x' })
    expect(r.ok).toBe(false)
    expect(r.verdict.reason).toMatch(/changed-under-cleanup/)
    expect(existsSync(worktree)).toBe(true) // the whole point: it is still standing
  })

  it('REFUSES a tree carrying uncommitted work', () => {
    writeFileSync(join(worktree, 'in-progress.txt'), 'the state nothing can rescue')
    expect(cleanup({ expectBranch: 'feat/608-x' }).ok).toBe(false)
    expect(existsSync(join(worktree, 'in-progress.txt'))).toBe(true)
  })

  it('REFUSES a tree that moved to another branch', () => {
    run(['checkout', '-q', '-b', 'feat/590-y'], worktree)
    expect(cleanup({ expectBranch: 'feat/608-x' }).ok).toBe(false)
    expect(existsSync(worktree)).toBe(true)
  })

  it('still removes a dirty tree when NO expectation is given — the old contract is untouched', () => {
    writeFileSync(join(worktree, 'leftovers.txt'), 'what a finished agent leaves')
    expect(cleanup({}).ok).toBe(true)
    expect(existsSync(worktree)).toBe(false)
  })
})
