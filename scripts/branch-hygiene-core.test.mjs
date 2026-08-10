// Decision sweep of the branch-hygiene Stop-hook guard: the three shapes a
// merged branch survives in (local, remote, worktree), every carve-out that
// keeps it off healthy work, and the fail-open on an unreadable git state — the
// case that decides whether a guard bug can trap the session.
import { describe, it, expect } from 'vitest'
import {
  assessBranchHygiene,
  formatBranchHygiene,
  isBaselineCheckout,
  normBranch,
  stubBranchTree,
  DEFAULT_GRACE_MS,
} from './branch-hygiene-core.mjs'

const NOW = 1_700_000_000_000
const OLD = NOW - 4 * 60 * 60 * 1000 // four hours: well past any grace
const ROOT = 'C:/repo'

const base = (over = {}) => ({
  now: NOW,
  repoRoot: ROOT,
  worktrees: [{ path: ROOT, branch: 'refs/heads/main', locked: false, tipAt: OLD }],
  ...over,
})

describe('assessBranchHygiene — what blocks', () => {
  it('blocks on a merged LOCAL branch that outlived its merge', () => {
    const r = assessBranchHygiene(base({ localMerged: [{ name: 'feat/12-x', tipAt: OLD }] }))
    expect(r.block).toBe(true)
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]).toMatchObject({ kind: 'local', name: 'feat/12-x' })
    expect(r.findings[0].command).toBe('git branch -d feat/12-x')
  })

  it('blocks on a merged REMOTE branch and names the delete-on-origin command', () => {
    const r = assessBranchHygiene(base({ remoteMerged: [{ name: 'origin/feat/12-x', tipAt: OLD }] }))
    expect(r.block).toBe(true)
    expect(r.findings[0]).toMatchObject({ kind: 'remote', name: 'origin/feat/12-x' })
    expect(r.findings[0].command).toBe('git push origin --delete feat/12-x')
  })

  it('blocks on a WORKTREE sitting on a merged branch, and names the safe cleanup script', () => {
    const r = assessBranchHygiene(
      base({
        localMerged: [{ name: 'feat/12-x', tipAt: OLD }],
        worktrees: [
          { path: ROOT, branch: 'refs/heads/main', locked: false, tipAt: OLD },
          { path: `${ROOT}/.claude/worktrees/agent-1`, branch: 'refs/heads/feat/12-x', locked: false, tipAt: OLD },
        ],
      }),
    )
    expect(r.block).toBe(true)
    // The worktree comes FIRST: git refuses to delete a branch a tree holds.
    expect(r.findings.map((f) => f.kind)).toEqual(['worktree', 'local'])
    expect(r.findings[0].command).toContain('scripts/worktree-cleanup.mjs')
  })

  it('blocks on a DETACHED leftover worktree whose HEAD is already in main', () => {
    const r = assessBranchHygiene(
      base({
        worktrees: [
          { path: ROOT, branch: 'refs/heads/main', locked: false, tipAt: OLD },
          { path: `${ROOT}/.claude/worktrees/agent-2`, branch: null, locked: false, tipAt: OLD, mergedHead: true },
        ],
      }),
    )
    expect(r.block).toBe(true)
    expect(r.findings[0].kind).toBe('worktree')
  })

  it('reports every survivor at once rather than one per turn', () => {
    const r = assessBranchHygiene(
      base({
        localMerged: [
          { name: 'feat/a', tipAt: OLD },
          { name: 'feat/b', tipAt: OLD },
        ],
        remoteMerged: [{ name: 'origin/feat/a', tipAt: OLD }],
      }),
    )
    expect(r.findings).toHaveLength(3)
  })
})

describe('assessBranchHygiene — what never blocks', () => {
  it('an UNMERGED branch is not debris — it is simply not in the merged lists', () => {
    const r = assessBranchHygiene(base({ localMerged: [], remoteMerged: [] }))
    expect(r.block).toBe(false)
    expect(r.reason).toBe('clean')
  })

  it('origin/board carries its own commit, so it never reaches the merged list', () => {
    // The containment test IS the rule: board is not contained in main, so the
    // guard needs no name exception for the board's publishing lane.
    const r = assessBranchHygiene(base({ remoteMerged: [{ name: 'origin/main', tipAt: OLD }] }))
    expect(r.block).toBe(false)
  })

  it('main itself never blocks, local or remote', () => {
    const r = assessBranchHygiene(
      base({ localMerged: [{ name: 'main', tipAt: OLD }], remoteMerged: [{ name: 'origin/main', tipAt: OLD }] }),
    )
    expect(r.block).toBe(false)
  })

  it('a branch inside the grace never blocks — the merging session is still finishing with it', () => {
    const r = assessBranchHygiene(
      base({ localMerged: [{ name: 'feat/12-x', tipAt: NOW - DEFAULT_GRACE_MS + 1000 }] }),
    )
    expect(r.block).toBe(false)
  })

  it('past the grace the same branch blocks', () => {
    const r = assessBranchHygiene(
      base({ localMerged: [{ name: 'feat/12-x', tipAt: NOW - DEFAULT_GRACE_MS - 1000 }] }),
    )
    expect(r.block).toBe(true)
  })

  it('the grace is calibratable', () => {
    const inputs = base({ localMerged: [{ name: 'feat/12-x', tipAt: NOW - 30 * 60 * 1000 }] })
    expect(assessBranchHygiene(inputs).block).toBe(true)
    expect(assessBranchHygiene({ ...inputs, graceMs: 60 * 60 * 1000 }).block).toBe(false)
  })

  it('a branch a LIVE session declared in flight never blocks', () => {
    const r = assessBranchHygiene(
      base({ localMerged: [{ name: 'feat/12-x', tipAt: OLD }], inFlightBranches: ['refs/heads/feat/12-x'] }),
    )
    expect(r.block).toBe(false)
  })

  it('a declared in-flight branch also protects its remote twin', () => {
    const r = assessBranchHygiene(
      base({ remoteMerged: [{ name: 'origin/feat/12-x', tipAt: OLD }], inFlightBranches: ['feat/12-x'] }),
    )
    expect(r.block).toBe(false)
  })

  it('a LOCKED worktree is a living agent tree — neither it nor its branch is touched', () => {
    const r = assessBranchHygiene(
      base({
        localMerged: [{ name: 'feat/12-x', tipAt: OLD }],
        worktrees: [
          { path: ROOT, branch: 'refs/heads/main', locked: false, tipAt: OLD },
          { path: `${ROOT}/.claude/worktrees/agent-1`, branch: 'refs/heads/feat/12-x', locked: true, tipAt: OLD },
        ],
      }),
    )
    expect(r.block).toBe(false)
  })

  it('a declared in-flight worktree PATH protects its branch too', () => {
    const r = assessBranchHygiene(
      base({
        localMerged: [{ name: 'feat/12-x', tipAt: OLD }],
        worktrees: [
          { path: ROOT, branch: 'refs/heads/main', locked: false, tipAt: OLD },
          { path: `${ROOT}/.claude/worktrees/agent-1`, branch: 'refs/heads/feat/12-x', locked: false, tipAt: OLD },
        ],
        inFlightPaths: [`${ROOT}\\.claude\\worktrees\\agent-1`],
      }),
    )
    expect(r.block).toBe(false)
  })

  it('the repo root worktree is the session own checkout, never a finding', () => {
    const r = assessBranchHygiene(base({ worktrees: [{ path: ROOT, branch: null, tipAt: OLD, mergedHead: true }] }))
    expect(r.block).toBe(false)
  })

  it('the checkout the guard itself runs from is never proposed for removal', () => {
    // The guard commonly runs FROM an agent worktree, where its own root is not
    // the main tree's — it must not offer to delete the ground it stands on.
    const own = `${ROOT}/.claude/worktrees/agent-self`
    const r = assessBranchHygiene(
      base({
        ownPath: own,
        localMerged: [{ name: 'feat/self', tipAt: OLD }],
        worktrees: [
          { path: ROOT, branch: 'refs/heads/main', locked: false, tipAt: OLD },
          { path: own, branch: 'refs/heads/feat/self', locked: false, tipAt: OLD },
        ],
      }),
    )
    expect(r.block).toBe(false)
  })

  it('the verify-baseline checkouts under local/ are sha-keyed caches, not branches', () => {
    const r = assessBranchHygiene(
      base({
        worktrees: [
          { path: ROOT, branch: 'refs/heads/main', locked: false, tipAt: OLD },
          { path: `${ROOT}/local/verify-baseline/abc123`, branch: null, tipAt: OLD, mergedHead: true },
        ],
      }),
    )
    expect(r.block).toBe(false)
  })

  it('an unreadable git state ALLOWS the stop — the guard fails open', () => {
    const r = assessBranchHygiene({ readable: false, localMerged: [{ name: 'feat/x', tipAt: OLD }] })
    expect(r.block).toBe(false)
    expect(r.reason).toBe('git-unreadable')
  })

  it('is total on garbage input', () => {
    expect(() => assessBranchHygiene()).not.toThrow()
    expect(assessBranchHygiene({ localMerged: null, worktrees: 'x', remoteMerged: 7 }).block).toBe(false)
  })
})

describe('helpers', () => {
  it('normBranch folds the spellings that mean the same ref, but keeps origin/', () => {
    expect(normBranch('refs/heads/Feat/X')).toBe('feat/x')
    expect(normBranch('heads/feat/x')).toBe('feat/x')
    expect(normBranch('feat/x@{0}')).toBe('feat/x')
    expect(normBranch('origin/feat/x')).toBe('origin/feat/x')
  })

  it('isBaselineCheckout recognises the local/ cache regardless of separators', () => {
    expect(isBaselineCheckout('C:\\repo\\local\\verify-baseline\\a', 'C:/repo')).toBe(true)
    expect(isBaselineCheckout('C:/repo/.claude/worktrees/a', 'C:/repo')).toBe(false)
  })

  it('the block message names every finding with its removal command', () => {
    const msg = formatBranchHygiene([{ kind: 'local', name: 'feat/x', ageMs: 3_600_000, command: 'git branch -d feat/x' }])
    expect(msg).toContain('feat/x')
    expect(msg).toContain('git branch -d feat/x')
    expect(msg).toContain('§6')
    expect(formatBranchHygiene([])).toBe('')
  })
})

// --- A freshly cut branch stands ON main's tip and is not debris ------------------

describe('assessBranchHygiene — a branch on main\'s own tip', () => {
  const TIP = 'a'.repeat(40)
  const old = Date.now() - 6 * 60 * 60 * 1000

  it('does not report a local branch whose tip IS main\'s tip, however old that commit is', () => {
    const r = assessBranchHygiene({
      readable: true,
      repoRoot: '/repo',
      localMerged: [{ name: 'feat/999-just-cut', tipAt: old, tipSha: TIP }],
      mainTip: TIP,
    })
    expect(r.block).toBe(false)
    expect(r.findings).toEqual([])
  })

  it('does not propose cleaning a worktree that sits on that same tip', () => {
    const r = assessBranchHygiene({
      readable: true,
      repoRoot: '/repo',
      localMerged: [{ name: 'feat/999-just-cut', tipAt: old, tipSha: TIP }],
      worktrees: [
        { path: '/repo', branch: 'main', tipAt: old, tipSha: TIP },
        { path: '/repo/.claude/worktrees/agent-x', branch: 'feat/999-just-cut', tipAt: old, tipSha: TIP },
      ],
      mainTip: TIP,
    })
    expect(r.findings).toEqual([])
  })

  it('still reports REAL debris — a merged branch whose tip is behind main', () => {
    const r = assessBranchHygiene({
      readable: true,
      repoRoot: '/repo',
      localMerged: [{ name: 'feat/111-done', tipAt: old, tipSha: 'b'.repeat(40) }],
      mainTip: TIP,
    })
    expect(r.block).toBe(true)
    expect(r.findings.map((f) => f.name)).toEqual(['feat/111-done'])
  })

  it('exempts the REMOTE ref too — the workflow pushes a branch the moment it is cut', () => {
    const r = assessBranchHygiene({
      readable: true,
      repoRoot: '/repo',
      remoteMerged: [{ name: 'origin/feat/999-just-cut', tipAt: old, tipSha: TIP }],
      mainTip: TIP,
    })
    expect(r.block).toBe(false)
    expect(r.findings).toEqual([])
  })

  it('still reports a REMOTE branch whose tip is behind main', () => {
    const r = assessBranchHygiene({
      readable: true,
      repoRoot: '/repo',
      remoteMerged: [{ name: 'origin/feat/111-done', tipAt: old, tipSha: 'b'.repeat(40) }],
      mainTip: TIP,
    })
    expect(r.block).toBe(true)
    expect(r.findings.map((f) => f.name)).toEqual(['origin/feat/111-done'])
  })

  it('without a known main tip it behaves exactly as before — the exemption cannot swallow the sweep', () => {
    const r = assessBranchHygiene({
      readable: true,
      repoRoot: '/repo',
      localMerged: [{ name: 'feat/111-done', tipAt: old, tipSha: TIP }],
      mainTip: null,
    })
    expect(r.block).toBe(true)
  })
})

describe("the setup branch an agent worktree is cut with (point 613)", () => {
  const ID = 'agent-af3912c7e49224502'
  const STUB = `worktree-${ID}`
  const TREE = `${ROOT}/.claude/worktrees/${ID}`
  const MAIN_TIP = 'a'.repeat(40)
  // Deliberately BEHIND main: the stub sits on the commit main had when the
  // tree was cut, so the on-main-tip exemption has already expired. That is the
  // exact state that produced a finding on every turn of a healthy delegation.
  const STALE = { tipAt: OLD, tipSha: 'b'.repeat(40) }

  // The real shape: the agent switched to its feat branch seconds after the cut,
  // so the tree holds THAT branch and the stub is checked out nowhere.
  const withTree = (over = {}) =>
    assessBranchHygiene({
      readable: true,
      now: NOW,
      repoRoot: ROOT,
      mainTip: MAIN_TIP,
      worktrees: [
        { path: ROOT, branch: 'refs/heads/main', tipAt: OLD, tipSha: MAIN_TIP },
        { path: TREE, branch: 'refs/heads/feat/613-x', locked: true, tipAt: OLD, tipSha: 'c'.repeat(40) },
      ],
      ...over,
    })

  it('a stub whose worktree still exists yields NO finding', () => {
    const r = withTree({ localMerged: [{ name: STUB, ...STALE }] })
    expect(r.block).toBe(false)
    expect(r.findings).toEqual([])
  })

  it('the same stub with the worktree GONE is still debris', () => {
    const r = assessBranchHygiene({
      readable: true,
      now: NOW,
      repoRoot: ROOT,
      mainTip: MAIN_TIP,
      worktrees: [{ path: ROOT, branch: 'refs/heads/main', tipAt: OLD, tipSha: MAIN_TIP }],
      localMerged: [{ name: STUB, ...STALE }],
    })
    expect(r.block).toBe(true)
    expect(r.findings).toHaveLength(1)
    expect(r.findings[0]).toMatchObject({ kind: 'local', name: STUB, command: `git branch -d ${STUB}` })
  })

  it('an ordinary merged feature branch is unaffected by the carve-out', () => {
    const r = withTree({ localMerged: [{ name: 'feat/12-done', ...STALE }] })
    expect(r.block).toBe(true)
    expect(r.findings.map((f) => f.name)).toEqual(['feat/12-done'])
  })

  it('the remote twin of a stub is exempt while the tree stands, and reported once it is gone', () => {
    const held = withTree({ remoteMerged: [{ name: `origin/${STUB}`, ...STALE }] })
    expect(held.findings).toEqual([])

    const gone = assessBranchHygiene({
      readable: true,
      now: NOW,
      repoRoot: ROOT,
      mainTip: MAIN_TIP,
      worktrees: [{ path: ROOT, branch: 'refs/heads/main', tipAt: OLD, tipSha: MAIN_TIP }],
      remoteMerged: [{ name: `origin/${STUB}`, ...STALE }],
    })
    expect(gone.findings.map((f) => f.name)).toEqual([`origin/${STUB}`])
  })

  it('the tree it names is the one that protects it — another agent tree does not', () => {
    const r = withTree({
      localMerged: [{ name: 'worktree-agent-someoneelse', ...STALE }],
    })
    expect(r.findings.map((f) => f.name)).toEqual(['worktree-agent-someoneelse'])
  })

  it('a stub still checked out by its own tree stays protected the way it always was', () => {
    const r = assessBranchHygiene({
      readable: true,
      now: NOW,
      repoRoot: ROOT,
      mainTip: MAIN_TIP,
      worktrees: [
        { path: ROOT, branch: 'refs/heads/main', tipAt: OLD, tipSha: MAIN_TIP },
        { path: TREE, branch: `refs/heads/${STUB}`, locked: true, ...STALE },
      ],
      localMerged: [{ name: STUB, ...STALE }],
    })
    expect(r.findings).toEqual([])
  })

  it('stubBranchTree names the tree, and nothing else', () => {
    expect(stubBranchTree(STUB)).toBe(ID)
    expect(stubBranchTree(`refs/heads/${STUB}`)).toBe(ID)
    expect(stubBranchTree(`origin/${STUB}`)).toBe(ID)
    expect(stubBranchTree('feat/613-worktree-stub')).toBe(null)
    expect(stubBranchTree('worktree-agent-')).toBe(null)
    expect(stubBranchTree('main')).toBe(null)
    expect(stubBranchTree(null)).toBe(null)
  })
})
