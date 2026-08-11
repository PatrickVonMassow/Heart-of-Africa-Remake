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
  CLEANUP_LOCK_LEGACY,
  formatCleanupLock,
  matchesExpectation,
  parseCleanupLock,
  staleLockVerdict,
  REFUSALS,
} from './worktree-cleanup-core.mjs'
import { cleanupWorktree, detachLinks, pathExists, readIdentity, parseCleanupArgs } from './worktree-cleanup.mjs'

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
//
// A BRANCH NAME IS NOT AN IDENTITY (second review, finding 1): branch + unlocked +
// clean also describes a DIFFERENT checkout standing at the same path, so the
// expectation carries the head, the admin gitdir and the `.git` file's inode.
describe('matchesExpectation — pure', () => {
  const entry = { path: '/repo/.claude/worktrees/agent-a', branch: 'feat/608-x', head: 'abc123', locked: null }
  const actual = { gitLink: '/repo/.git/worktrees/agent-a', ino: 4711, dev: 66, gitMtime: 900, gitBirth: 880, activeAt: 1000 }
  const expected = {
    branch: 'feat/608-x',
    head: 'abc123',
    gitLink: '/repo/.git/worktrees/agent-a',
    ino: 4711,
    dev: 66,
    gitMtime: 900,
    gitBirth: 880,
    notWrittenAfter: 5000,
  }
  const ask = (over = {}) => matchesExpectation({ expected, entry, actual, dirty: false, ...over })

  it('passes the very checkout the caller selected', () => {
    expect(ask()).toMatchObject({ ok: true })
  })

  it('changes nothing when the caller expects nothing — orphan removal has no branch to compare', () => {
    expect(matchesExpectation({ entry: null, dirty: null }).ok).toBe(true)
    expect(matchesExpectation({ expected: { branch: '  ' }, entry: null }).ok).toBe(true)
  })

  it('refuses a path git no longer lists', () => {
    const r = ask({ entry: null })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/no longer lists/)
  })

  it('refuses a checkout that moved to another branch, or detached', () => {
    expect(ask({ entry: { ...entry, branch: 'feat/590-y' } }).ok).toBe(false)
    expect(ask({ entry: { ...entry, branch: '' } }).ok).toBe(false)
  })

  it('refuses a checkout locked by anyone else, and accepts only our OWN lock', () => {
    const locked = { ...entry, locked: 'claude agent (pid 7)' }
    expect(ask({ entry: locked }).reason).toMatch(/git-locked/)
    expect(ask({ entry: { ...entry, locked: 'ours' }, ownLock: 'ours' }).ok).toBe(true)
    expect(ask({ entry: locked, ownLock: 'ours' }).ok).toBe(false)
  })

  it('REFUSES when the lock we took is GONE — an empty lock is not "unlocked, fine"', () => {
    // Fifth review, finding 2: only a NON-EMPTY foreign lock used to refuse, so a
    // concurrent recovery that cleared our lock and paused before retaking it left
    // NO lock at all — and the verification read that as a pass and deleted
    // without any exclusion.
    for (const locked of [null, undefined, '']) {
      const r = ask({ entry: { ...entry, locked }, ownLock: 'ours' })
      expect(r.ok, String(locked)).toBe(false)
      expect(r.reason).toMatch(/lock this cleanup took is GONE/)
    }
  })

  it('REFUSES a lock that is merely a padded copy of ours — the comparison is verbatim', () => {
    const ours = formatCleanupLock({ pid: 4711, startedAt: 1000 })
    expect(ask({ entry: { ...entry, locked: ours }, ownLock: ours }).ok).toBe(true)
    for (const locked of [` ${ours}`, `${ours} `, '   ']) {
      const r = ask({ entry: { ...entry, locked }, ownLock: ours })
      expect(r.ok, locked).toBe(false)
      expect(r.reason).toMatch(/git-locked/)
    }
  })

  it('without a lock of our own an unlocked tree still passes — the orphan contract is untouched', () => {
    expect(ask({ entry: { ...entry, locked: null } }).ok).toBe(true)
    expect(ask({ entry: { ...entry, locked: '   ' } }).ok).toBe(true)
  })

  it('refuses a checkout whose HEAD moved — the containment proof was taken on that sha', () => {
    const r = ask({ entry: { ...entry, head: 'def456' } })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/head changed/)
  })

  it('refuses a checkout that is no longer the same linked worktree', () => {
    expect(ask({ actual: { ...actual, gitLink: '/elsewhere/.git/worktrees/agent-a' } }).ok).toBe(false)
  })

  it('refuses a REPLACEMENT at the same path — same branch, same admin record, new .git file', () => {
    // The case a branch name cannot see, and the one measured on a real repo:
    // remove + add at the same path reuses the record name and never the inode.
    const r = ask({ actual: { ...actual, ino: 4712 } })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/REPLACED/)
  })

  it('refuses when a carried field cannot be re-read at all', () => {
    expect(ask({ actual: { ...actual, gitLink: null } }).ok).toBe(false)
    expect(ask({ entry: { ...entry, head: '' }, actual: { ...actual, head: null } }).ok).toBe(false)
    expect(ask({ actual: { ...actual, activeAt: null } }).ok).toBe(false)
  })

  it('REFUSES when no file identity was carried at all — no proof is not permission', () => {
    // Third review, finding A: this comparison used to SKIP itself when nothing
    // was carried and fall through to ok, and the old test pinned that pass. An
    // absent proof refuses, and the refusal names what was missing so a platform
    // that genuinely cannot supply it gets an answer it can act on.
    const r = matchesExpectation({
      expected: { ...expected, ino: 0, dev: 0, gitMtime: 0, gitBirth: 0 },
      entry,
      actual: { ...actual, ino: 0, dev: 0, gitMtime: 0, gitBirth: 0 },
      dirty: false,
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/carried NO file identity/)
  })

  it('REFUSES when a carried identity field cannot be re-read, naming which', () => {
    const r = ask({ actual: { ...actual, gitMtime: 0 } })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/could not be re-read \(gitMtime\)/)
  })

  it('names which identity proofs actually held', () => {
    expect(ask().reason).toMatch(/same \.git file \(ino, dev, gitMtime, gitBirth\)/)
    // A platform that gives only some of them proves only those, and says so.
    const partial = { ...expected, ino: 0, dev: 0 }
    const r = matchesExpectation({ expected: partial, entry, actual: { ...actual, ino: 0, dev: 0 }, dirty: false })
    expect(r.ok).toBe(true)
    expect(r.reason).toMatch(/same \.git file \(gitMtime, gitBirth\)/)
  })

  it('catches a replacement that got the SAME inode back — the write time cannot be reused', () => {
    // Measured on a real repository: a filesystem hands a freed inode straight
    // back, so remove+add at one path often reproduces the number exactly.
    const r = ask({ actual: { ...actual, gitMtime: 901 } })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/REPLACED/)
  })

  it('treats EVERY identity field the same — each one alone refuses when it differs', () => {
    // What the code now claims about `gitBirth` (fourth review, finding B): it is
    // one more field beside device, inode and mtime, NOT an unforgeable stamp. So
    // it is asserted the way the other three are, and no case here rests on it
    // being genuine — a conjunction can only refuse more, never less.
    for (const field of ['ino', 'dev', 'gitMtime', 'gitBirth']) {
      const r = ask({ actual: { ...actual, [field]: Number(actual[field]) + 1 } })
      expect(r.ok, `${field} must refuse when it differs`).toBe(false)
      expect(r.reason).toMatch(/REPLACED/)
    }
  })

  it('a genuine birth time is not required — the other three still decide without it', () => {
    // The platform case Node documents: no birthtime support, so the field is 0.
    const noBirth = { ...expected, gitBirth: 0 }
    const same = matchesExpectation({ expected: noBirth, entry, actual: { ...actual, gitBirth: 0 }, dirty: false })
    expect(same.ok).toBe(true)
    expect(same.reason).toMatch(/same \.git file \(ino, dev, gitMtime\)/)
    const moved = matchesExpectation({
      expected: noBirth,
      entry,
      actual: { ...actual, gitBirth: 0, gitMtime: 901 },
      dirty: false,
    })
    expect(moved.ok).toBe(false)
  })

  it('refuses a tree written into after the caller took its freshness proof', () => {
    const r = ask({ actual: { ...actual, activeAt: 9000 } })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/written into/)
  })

  it('refuses on uncommitted work, and on a dirtiness that could not be read', () => {
    expect(ask({ dirty: true }).ok).toBe(false)
    expect(ask({ dirty: null }).ok).toBe(false)
  })
})

// A LOCK THAT NAMES ONLY ITSELF WEDGES THE TREE FOREVER (third review, finding B).
// The asymmetry these cases enforce: a stale lock is annoying and a human can
// clear it; breaking a LIVE one destroys work. So only OUR lock, whose holder is
// PROVABLY gone, is ever recovered.
describe('staleLockVerdict — may a lock in the way be broken?', () => {
  const ours = formatCleanupLock({ pid: 4711, startedAt: 1000 })

  it('signs the lock with the RUN, not just the command name', () => {
    expect(ours).toMatch(/pid 4711 start 1000/)
    expect(parseCleanupLock(ours)).toEqual({ ours: true, pid: 4711, startedAt: 1000 })
  })

  it('round-trips its own signature, so writer and reader cannot drift apart', () => {
    for (const pid of [1, 4711, 999_999]) {
      expect(parseCleanupLock(formatCleanupLock({ pid, startedAt: pid * 3 }))).toEqual({
        ours: true,
        pid,
        startedAt: pid * 3,
      })
    }
  })

  it('NEVER breaks a foreign lock — that is an agent still holding its tree', () => {
    const r = staleLockVerdict({ reason: 'claude agent agent-x (pid 4711 start 1000)', probe: { exists: false } })
    expect(r.recoverable).toBe(false)
    expect(r.why).toMatch(/not this command's/)
    expect(parseCleanupLock('claude agent agent-x (pid 1 start 2)').ours).toBe(false)
  })

  it('NEVER claims a lock that merely BEGINS with our name — the whole signature must match', () => {
    // Fourth review, finding A: a `startsWith` test claimed these as ours, and a
    // foreign lock that parses as ours becomes breakable the moment its pid is
    // absent — the one rule the asymmetry says is never bent.
    const collisions = [
      'worktree-cleanup-helper (pid 4711 start 1000)',
      'worktree-cleanup2 verifying and deleting (pid 4711 start 1000)',
      'worktree-cleanup verifying and deleting (pid 4711 start 1000) — and then something else',
      'worktree-cleanup verifying and deleting',
      'worktree-cleanupverifying and deleting (pid 4711 start 1000)',
    ]
    for (const reason of collisions) {
      expect(parseCleanupLock(reason).ours, reason).toBe(false)
      expect(staleLockVerdict({ reason, probe: { exists: false, startedAt: null } }).recoverable, reason).toBe(false)
    }
  })

  it('NEVER claims a PADDED copy of its signature — the parser normalises nothing', () => {
    // Fifth review, finding 1. The parser TRIMMED before matching, which widened
    // the anchored signature: a foreign lock padded with whitespace read as ours
    // and became breakable the moment its pid was absent. The padding is real
    // where it matters — git stores a lock reason VERBATIM in `<gitdir>/locked`
    // (measured, git 2.39.5), which is the file the callers read.
    const padded = [
      ' worktree-cleanup verifying and deleting (pid 999999 start 1) ',
      'worktree-cleanup verifying and deleting (pid 999999 start 1) ',
      '\tworktree-cleanup verifying and deleting (pid 999999 start 1)',
      'worktree-cleanup verifying and deleting (pid 999999 start 1)\n',
      `  ${CLEANUP_LOCK_LEGACY}  `,
    ]
    for (const reason of padded) {
      expect(parseCleanupLock(reason).ours, reason).toBe(false)
      // …and therefore NEVER recoverable, however dead the pid it names looks.
      const r = staleLockVerdict({ reason, probe: { exists: false, startedAt: null } })
      expect(r.recoverable, reason).toBe(false)
      expect(r.why).toMatch(/not this command's/)
    }
  })

  it('a lock of OURS that recorded no start time is recoverable once its pid is GONE', () => {
    // Fifth review, finding 4: `cleanupLockReason` writes `start 0` whenever the
    // process-start probe cannot answer, and refusing every zero-start lock wedged
    // that worktree for good after a crash — the failure the run identity exists
    // to prevent, coming back through its own fallback.
    const zero = formatCleanupLock({ pid: 4711 })
    expect(zero).toMatch(/pid 4711 start 0/)
    expect(parseCleanupLock(zero)).toEqual({ ours: true, pid: 4711, startedAt: 0 })

    const gone = staleLockVerdict({ reason: zero, probe: { exists: false, startedAt: null } })
    expect(gone.recoverable).toBe(true)
    expect(gone.why).toMatch(/no start time/)
  })

  it('KEEPS a zero-start lock while ANY process holds that pid — a recycled one cannot be told apart', () => {
    const zero = formatCleanupLock({ pid: 4711, startedAt: 0 })
    for (const probe of [{ exists: true, startedAt: 1000 }, { exists: true, startedAt: null }]) {
      const r = staleLockVerdict({ reason: zero, probe })
      expect(r.recoverable).toBe(false)
      expect(r.why).toMatch(/recycled pid cannot be told/)
    }
    // And an unjudgeable probe keeps it too, exactly like every other lock.
    for (const probe of [null, {}, { exists: 'maybe' }]) {
      expect(staleLockVerdict({ reason: zero, probe }).recoverable).toBe(false)
    }
  })

  it('a lock naming NO pid at all stays a by-hand job, start time or not', () => {
    for (const reason of [formatCleanupLock({}), formatCleanupLock({ pid: 0, startedAt: 1000 })]) {
      const r = staleLockVerdict({ reason, probe: { exists: false, startedAt: null } })
      expect(r.recoverable, reason).toBe(false)
      expect(r.why).toMatch(/names no run/)
    }
  })

  it('still recognises the one legacy spelling it wrote, only to say how to clear it', () => {
    const legacy = staleLockVerdict({ reason: CLEANUP_LOCK_LEGACY, probe: { exists: false } })
    expect(parseCleanupLock(CLEANUP_LOCK_LEGACY)).toEqual({ ours: true, pid: 0, startedAt: 0 })
    expect(legacy.recoverable).toBe(false)
    expect(legacy.why).toMatch(/by hand/)
  })

  it('breaks OUR lock when its process is gone', () => {
    const r = staleLockVerdict({ reason: ours, probe: { exists: false, startedAt: null } })
    expect(r.recoverable).toBe(true)
    expect(r.why).toMatch(/pid 4711\) is gone/)
  })

  it('breaks OUR lock when the pid was recycled by a different process', () => {
    const r = staleLockVerdict({ reason: ours, probe: { exists: true, startedAt: 999_000 } })
    expect(r.recoverable).toBe(true)
    expect(r.why).toMatch(/recycled/)
  })

  it('KEEPS our lock while its holder is still running', () => {
    const r = staleLockVerdict({ reason: ours, probe: { exists: true, startedAt: 1000 } })
    expect(r.recoverable).toBe(false)
    expect(r.why).toMatch(/still running/)
  })

  it('KEEPS every lock it cannot judge — wedge over destruction', () => {
    for (const probe of [null, {}, { exists: true, startedAt: null }]) {
      expect(staleLockVerdict({ reason: ours, probe }).recoverable).toBe(false)
    }
    expect(staleLockVerdict({ reason: '' }).recoverable).toBe(false)
  })
})

describe('--expect, on a THROWAWAY repository', () => {
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

  const gitOf = (args, cwd) => run(args, cwd)
  /** What the caller would carry, read off the real tree. */
  const expectationNow = () => {
    const identity = readIdentity(worktree)
    return {
      branch: 'feat/608-x',
      head: run(['rev-parse', 'HEAD'], worktree).trim(),
      gitLink: identity.gitLink,
      ino: identity.ino,
      dev: identity.dev,
      gitMtime: identity.gitMtime,
      gitBirth: identity.gitBirth,
      notWrittenAfter: Date.now() + 60_000,
    }
  }
  const cleanup = (opts) => cleanupWorktree(worktree, { git: gitOf, ...opts })

  it('removes the tree when the expectation still holds, leaving no record and no lock', () => {
    expect(cleanup({ expected: expectationNow() }).ok).toBe(true)
    expect(existsSync(worktree)).toBe(false)
    // The record must go WITH the tree. `git worktree prune` SKIPS a locked
    // worktree, so a lock still standing here would outlive the directory and no
    // prune could ever clear it — the same wedge by another road.
    const listed = run(['worktree', 'list', '--porcelain'])
    expect(listed).not.toContain(worktree)
    expect(listed).not.toContain('locked')
  })

  it("REFUSES a tree that was locked between the caller's check and this command", () => {
    const expected = expectationNow()
    run(['worktree', 'lock', '--reason', 'claude agent agent-x (pid 999999 start 1)', worktree])
    const r = cleanup({ expected })
    expect(r.ok).toBe(false)
    // The lock ACQUISITION is what fails here, which is the exclusion working:
    // a tree somebody else holds cannot even be taken, let alone deleted.
    expect(r.verdict.reason).toMatch(/could-not-take-the-lock|changed-under-cleanup/)
    expect(existsSync(worktree)).toBe(true) // the whole point: it is still standing
  })

  it('REFUSES a tree carrying uncommitted work, and leaves no lock of ours behind', () => {
    const expected = expectationNow()
    writeFileSync(join(worktree, 'in-progress.txt'), 'the state nothing can rescue')
    expect(cleanup({ expected }).ok).toBe(false)
    expect(existsSync(join(worktree, 'in-progress.txt'))).toBe(true)
    expect(run(['worktree', 'list', '--porcelain']).includes('locked')).toBe(false)
  })

  it('REFUSES a tree that moved to another branch', () => {
    const expected = expectationNow()
    run(['checkout', '-q', '-b', 'feat/590-y'], worktree)
    expect(cleanup({ expected }).ok).toBe(false)
    expect(existsSync(worktree)).toBe(true)
  })

  it('REFUSES a tree whose HEAD moved on since the caller looked', () => {
    const expected = expectationNow()
    writeFileSync(join(worktree, 'more.txt'), 'work')
    run(['add', '-A'], worktree)
    run(['commit', '-qm', 'a commit the caller never saw'], worktree)
    expect(cleanup({ expected }).ok).toBe(false)
    expect(existsSync(worktree)).toBe(true)
  })

  it('REFUSES a REPLACEMENT checkout standing at the same path on the same branch', () => {
    const expected = expectationNow()
    run(['worktree', 'remove', '--force', worktree])
    run(['worktree', 'add', '-q', '-B', 'feat/608-x', worktree])
    const r = cleanup({ expected })
    expect(r.ok).toBe(false)
    expect(r.verdict.reason).toMatch(/REPLACED/)
    expect(existsSync(worktree)).toBe(true)
  })

  it('still removes a dirty tree when NO expectation is given — the old contract is untouched', () => {
    writeFileSync(join(worktree, 'leftovers.txt'), 'what a finished agent leaves')
    expect(cleanup({}).ok).toBe(true)
    expect(existsSync(worktree)).toBe(false)
  })

  it('refuses a path whose existence cannot be established, rather than calling it gone', () => {
    // A stat that fails for any reason other than absence is not absence (second
    // review, finding 4). `pathExists` is the tri-state probe that decides it.
    expect(pathExists(worktree)).toBe(true)
    expect(pathExists(join(worktree, 'nothing-here'))).toBe(false)
  })

  it('RECOVERS its own lock left behind by a crashed run — the tree is not wedged', () => {
    // Third review, finding B: a process killed between `worktree lock` and the
    // unlink used to make the worktree permanently un-cleanable.
    const expected = expectationNow()
    run(['worktree', 'lock', '--reason', formatCleanupLock({ pid: 999_999, startedAt: 1 }), worktree])
    const r = cleanupWorktree(worktree, {
      git: gitOf,
      expected,
      probe: () => ({ exists: false, startedAt: null }), // the crashed run is gone
    })
    expect(r.ok).toBe(true)
    expect(r.lockNote).toMatch(/cleared a dead lock/)
    expect(existsSync(worktree)).toBe(false)
  })

  it('does NOT recover its own lock while that run is still alive', () => {
    const expected = expectationNow()
    run(['worktree', 'lock', '--reason', formatCleanupLock({ pid: 4711, startedAt: 1000 }), worktree])
    const r = cleanupWorktree(worktree, {
      git: gitOf,
      expected,
      probe: () => ({ exists: true, startedAt: 1000 }),
    })
    expect(r.ok).toBe(false)
    expect(r.verdict.reason).toMatch(/still running/)
    expect(existsSync(worktree)).toBe(true)
  })

  it('a refusal NEVER releases a lock that is no longer ours', () => {
    // THE RACE THIS PINS (fifth review). Two cleanups meet one stale lock, both
    // read it before either clears it, so the loser's `worktree unlock` — which
    // names no lock — clears the WINNER's. The winner then refuses, because its
    // own verification sees a reason that is not its own. That refusal must not
    // take the third party's lock with it on the way out.
    const expected = expectationNow()
    const foreign = 'claude agent agent-later (pid 424242 start 7)'
    let swapped = false
    const r = cleanupWorktree(worktree, {
      git: (args, cwd) => {
        const out = run(args, cwd)
        // We take our lock — and the instant we hold it, the loser of the race
        // clears it (its `unlock` names no lock) and somebody else takes the tree.
        if (!swapped && args[0] === 'worktree' && args[1] === 'lock') {
          swapped = true
          run(['worktree', 'unlock', worktree])
          run(['worktree', 'lock', '--reason', foreign, worktree])
        }
        return out
      },
      expected,
    })
    expect(r.ok).toBe(false)
    expect(r.verdict.reason).toMatch(/git-locked/) // our verification saw a stranger's lock
    expect(r.verdict.reason).toMatch(/LEFT ALONE/) // and said it did not touch it
    // And the other party's lock is STILL THERE, untouched.
    expect(run(['worktree', 'list', '--porcelain'])).toContain(foreign)
    expect(existsSync(worktree)).toBe(true)
  })

  it('REFUSES to delete once our lock has been cleared and NOTHING took its place', () => {
    // Fifth review, finding 2, on a real repository: the competing party clears
    // our lock and pauses before retaking it, so the verification runs with no
    // exclusion at all. The empty interval was never exercised because every race
    // case installed the competing lock immediately.
    const expected = expectationNow()
    let cleared = false
    const r = cleanupWorktree(worktree, {
      git: (args, cwd) => {
        const out = run(args, cwd)
        if (!cleared && args[0] === 'worktree' && args[1] === 'lock') {
          cleared = true
          run(['worktree', 'unlock', worktree]) // and nothing takes it: no lock at all
        }
        return out
      },
      expected,
    })
    expect(cleared).toBe(true)
    expect(r.ok).toBe(false)
    expect(r.verdict.reason).toMatch(/lock this cleanup took is GONE/)
    expect(existsSync(worktree)).toBe(true)
  })

  it('a cleanup that LOSES the race discovers it before verifying anything', () => {
    const expected = expectationNow()
    const stale = formatCleanupLock({ pid: 999_999, startedAt: 1 })
    run(['worktree', 'lock', '--reason', stale, worktree])
    const foreign = 'claude agent agent-later (pid 424242 start 7)'
    const r = cleanupWorktree(worktree, {
      git: (args, cwd) => {
        const out = run(args, cwd)
        // The moment we clear the dead lock, the winner takes the tree.
        if (args[0] === 'worktree' && args[1] === 'unlock') run(['worktree', 'lock', '--reason', foreign, worktree])
        return out
      },
      expected,
      probe: () => ({ exists: false, startedAt: null }), // the stale holder is gone
    })
    expect(r.ok).toBe(false)
    expect(r.verdict.reason).toMatch(/could-not-take-the-lock/)
    expect(run(['worktree', 'list', '--porcelain'])).toContain(foreign)
    expect(existsSync(worktree)).toBe(true)
  })

  it('does NOT recover a FOREIGN lock, however dead its holder looks', () => {
    const expected = expectationNow()
    run(['worktree', 'lock', '--reason', 'claude agent agent-x (pid 999999 start 1)', worktree])
    const r = cleanupWorktree(worktree, {
      git: gitOf,
      expected,
      probe: () => ({ exists: false, startedAt: null }),
    })
    expect(r.ok).toBe(false)
    expect(r.verdict.reason).toMatch(/not this command's/)
    expect(existsSync(worktree)).toBe(true)
  })
})

// THE PLAIN CALL IS THE ONE THE LANDING MAKES, and it was the one that broke.
// `indexOf` answers -1 for an absent `--expect`, so the unguarded skip of
// `expectAt + 1` threw away argument 0 — the path — and `land-point.mjs`'s
// cleanup step refused with "no path was given" the first time it ran.
describe('the cleanup command line (parseCleanupArgs)', () => {
  it('takes the path from a plain call, which is what the landing makes', () => {
    const got = parseCleanupArgs(['/tmp/agent-1'])
    expect(got.target).toBe('/tmp/agent-1')
    expect(got.error).toBe('')
    expect(got.dry).toBe(false)
    expect(got.expected).toBe(null)
  })

  it('takes the path whatever order the flags come in', () => {
    expect(parseCleanupArgs(['--dry', '/tmp/agent-2']).target).toBe('/tmp/agent-2')
    expect(parseCleanupArgs(['/tmp/agent-3', '--dry']).target).toBe('/tmp/agent-3')
    expect(parseCleanupArgs(['--dry', '/tmp/agent-4']).dry).toBe(true)
  })

  it('skips the value after --expect without swallowing the path', () => {
    const record = '{"branch":"feat/x","head":"abc"}'
    const got = parseCleanupArgs(['/tmp/agent-5', '--expect', record])
    expect(got.target).toBe('/tmp/agent-5')
    expect(got.expected).toEqual({ branch: 'feat/x', head: 'abc' })

    const flagFirst = parseCleanupArgs(['--expect', record, '/tmp/agent-6'])
    expect(flagFirst.target).toBe('/tmp/agent-6')
    expect(flagFirst.expected).toEqual({ branch: 'feat/x', head: 'abc' })
  })

  it('refuses rather than guesses when there is no path or the record is unreadable', () => {
    expect(parseCleanupArgs([]).error).toMatch(/no path/)
    expect(parseCleanupArgs(['--dry']).error).toMatch(/no path/)
    expect(parseCleanupArgs(['/tmp/agent-7', '--expect', 'not json']).error).toMatch(/identity record/)
  })
})
