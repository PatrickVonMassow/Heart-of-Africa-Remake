// THE LANDING'S CLEANUP SELECTOR — the rule that must never delete a live or a
// foreign worktree again (point 629).
//
// THE POSTURE THESE CASES ENFORCE: every fact must be POSITIVELY established. The
// first version let an unreadable freshness probe fall through to `remove` AND
// pinned that in a test, which is why the cross-vendor review called it the same
// failure class the point exists to prevent. So each probe is asked here in its
// `null` shape too, and `null` must always mean KEEP AND REPORT.
import { describe, expect, it } from 'vitest'
import {
  AGENT_WORKTREE_DIR,
  DISPOSITION,
  GIT_WORKTREE_ADMIN_DIR,
  formatCleanupNotes,
  isAgentWorktree,
  isLinkedWorktreeOf,
  judgeCleanupTarget,
  reproveRemoval,
  selectCleanupTargets,
} from './land-cleanup-core.mjs'

const ROOT = '/repo'
const wt = (id, branch, locked = null) => ({
  path: `${ROOT}/${AGENT_WORKTREE_DIR}/agent-${id}`,
  branch,
  locked,
})
/** Everything a worktree needs to answer for, in the "provably dead" shape. */
const linkOf = (id) => `${ROOT}/${GIT_WORKTREE_ADMIN_DIR}/agent-${id}`
const deadFor = (id) => ({
  exists: true,
  linkedTo: linkOf(id),
  headMerged: true,
  dirty: false,
  activeAt: 1000,
  holderAlive: null,
})
const NOW = 5000

/** The landed point's own, finished worktree. */
const OWN = wt('608a', 'feat/608-board-order')
const OWN_DEAD = deadFor('608a')
/** The worktree of the agent that was still working on point 590. */
const OTHER = wt('a46632fd8f7f4bbce', 'feat/590-queue-rank', 'claude agent agent-a46632fd8f7f4bbce (pid 4711 start 1)')

describe('the incident: landing 608 beside a live agent on 590', () => {
  const scene = {
    worktrees: [{ path: ROOT, branch: 'main' }, OWN, OTHER],
    branch: 'feat/608-board-order',
    mainRoot: ROOT,
    since: NOW,
    evidence: {
      [OWN.path]: OWN_DEAD,
      [OTHER.path]: { ...deadFor('a46632fd8f7f4bbce'), dirty: true, activeAt: NOW + 60_000, holderAlive: true },
    },
  }

  it("removes exactly the landed point's dead worktree — never the foreign one", () => {
    const sel = selectCleanupTargets(scene)
    expect(sel.remove).toEqual([OWN.path])
  })

  it("never names the other agent's tree as removable, whatever the evidence says", () => {
    for (const evidence of [{ [OTHER.path]: deadFor('a46632fd8f7f4bbce') }, { [OTHER.path]: null }, {}]) {
      const sel = selectCleanupTargets({ ...scene, evidence: { [OWN.path]: OWN_DEAD, ...evidence } })
      expect(sel.remove).not.toContain(OTHER.path)
    }
  })

  it('leaves the MAIN checkout alone even when it is on the landed branch', () => {
    const sel = selectCleanupTargets({
      ...scene,
      worktrees: [{ path: ROOT, branch: 'feat/608-board-order' }],
      evidence: { [ROOT]: OWN_DEAD },
    })
    expect(sel.remove).toEqual([])
    expect(sel.kept[0].disposition).toBe(DISPOSITION.foreign)
  })
})

describe('ownership must be PROVEN', () => {
  const base = { branch: 'feat/608-x', mainRoot: ROOT, since: NOW }

  it('a worktree on another branch is foreign, and foreign is not reported as a problem', () => {
    const v = judgeCleanupTarget({ ...base, worktree: wt('b', 'feat/590-y'), evidence: deadFor('b') })
    expect(v.disposition).toBe(DISPOSITION.foreign)
    expect(formatCleanupNotes(selectCleanupTargets({ ...base, worktrees: [wt('b', 'feat/590-y')] }))).toEqual([])
  })

  it('an agent worktree with a detached HEAD is REPORTED, not removed — AND keeps the branch', () => {
    const tree = wt('c', '')
    const v = judgeCleanupTarget({ ...base, worktree: tree, evidence: deadFor('c') })
    expect(v.disposition).toBe(DISPOSITION.unproven)
    expect(v.reason).toMatch(/detached/)
    // Review finding 4: a tree detached mid-rebase reports no branch, and the
    // branch it is standing on was deleted underneath it.
    const sel = selectCleanupTargets({ ...base, worktrees: [tree], evidence: { [tree.path]: deadFor('c') } })
    expect(sel.remove).toEqual([])
    expect(sel.branch.delete).toBe(false)
    expect(formatCleanupNotes(sel).join('\n')).toContain(tree.path)
  })

  it('a checkout on the landed branch outside the agent directory is REPORTED, not removed', () => {
    const v = judgeCleanupTarget({
      ...base,
      worktree: { path: `${ROOT}/local/somebody-else`, branch: 'feat/608-x' },
      evidence: deadFor('x'),
    })
    expect(v.disposition).toBe(DISPOSITION.unproven)
    expect(v.reason).toContain(AGENT_WORKTREE_DIR)
  })

  it('a NESTED checkout under the agent directory is not an agent worktree', () => {
    // Review finding 3: every DESCENDANT used to qualify.
    const nested = { path: `${ROOT}/${AGENT_WORKTREE_DIR}/agent-a/nested`, branch: 'feat/608-x' }
    expect(judgeCleanupTarget({ ...base, worktree: nested, evidence: deadFor('a') }).disposition).toBe(
      DISPOSITION.unproven,
    )
  })

  it('a directory in the isolation folder that git never registered is REPORTED, not removed', () => {
    const tree = wt('d', 'feat/608-x')
    for (const linkedTo of [null, '/somewhere/else/.git', `${ROOT}/.git`]) {
      const v = judgeCleanupTarget({ ...base, worktree: tree, evidence: { ...deadFor('d'), linkedTo } })
      expect(v.disposition).toBe(DISPOSITION.unproven)
    }
  })

  it("keeps a tree whose HEAD the landing did not take — that is work, not debris", () => {
    const tree = wt('e', 'feat/608-x')
    const v = judgeCleanupTarget({ ...base, worktree: tree, evidence: { ...deadFor('e'), headMerged: false } })
    expect(v.disposition).toBe(DISPOSITION.live)
    expect(v.reason).toMatch(/not contained in what was merged/)
  })

  it('a landing without a branch name proves nothing about anything', () => {
    const v = judgeCleanupTarget({ ...base, branch: '', worktree: wt('f', 'feat/608-x'), evidence: deadFor('f') })
    expect(v.disposition).toBe(DISPOSITION.unproven)
  })

  it('a worktree without a path is reported rather than acted on', () => {
    expect(judgeCleanupTarget({ ...base, worktree: {}, evidence: deadFor('g') }).disposition).toBe(
      DISPOSITION.unproven,
    )
  })
})

describe('death must be PROVEN too — and every probe that cannot answer KEEPS', () => {
  const base = { branch: 'feat/608-x', mainRoot: ROOT, since: NOW }
  const own = (locked = null) => wt('own', 'feat/608-x', locked)
  const evidence = (over = {}) => ({ ...deadFor('own'), ...over })

  it('a git-locked worktree is alive — an agent still holds it', () => {
    const v = judgeCleanupTarget({ ...base, worktree: own('claude agent agent-own (pid 7 start 1)'), evidence: evidence() })
    expect(v.disposition).toBe(DISPOSITION.live)
    expect(v.reason).toContain('pid 7')
  })

  it('a lock whose process is gone still keeps the tree, and says so', () => {
    const v = judgeCleanupTarget({
      ...base,
      worktree: own('claude agent agent-own (pid 7 start 1)'),
      evidence: evidence({ holderAlive: false }),
    })
    expect(v.disposition).toBe(DISPOSITION.live)
    expect(v.reason).toMatch(/unlock/)
  })

  it('uncommitted changes keep the tree — that is the state nothing can rescue', () => {
    expect(judgeCleanupTarget({ ...base, worktree: own(), evidence: evidence({ dirty: true }) }).disposition).toBe(
      DISPOSITION.live,
    )
  })

  it('a file written after the landing began keeps the tree', () => {
    const v = judgeCleanupTarget({ ...base, worktree: own(), evidence: evidence({ activeAt: NOW + 30_000 }) })
    expect(v.disposition).toBe(DISPOSITION.live)
    expect(v.reason).toMatch(/after the landing began/)
  })

  it('an UNREADABLE freshness probe KEEPS AND REPORTS — it must never fall through to remove', () => {
    // The regression the review caught: `Number(null)` is 0, 0 is finite, and the
    // rule then returned `remove` on a probe that answered nothing.
    for (const activeAt of [null, undefined, NaN, 'soon', {}]) {
      const v = judgeCleanupTarget({ ...base, worktree: own(), evidence: evidence({ activeAt }) })
      expect(v.disposition).toBe(DISPOSITION.unproven)
      expect(v.reason).toMatch(/could not be established/)
    }
  })

  it('a landing that cannot say when it began keeps the tree', () => {
    for (const since of [null, undefined, NaN]) {
      expect(judgeCleanupTarget({ ...base, since, worktree: own(), evidence: evidence() }).disposition).toBe(
        DISPOSITION.unproven,
      )
    }
  })

  it('EVERY unreadable probe keeps the tree', () => {
    const cases = [
      null,
      { exists: null },
      evidence({ exists: null }),
      evidence({ linkedTo: null }),
      evidence({ headMerged: null }),
      evidence({ dirty: null }),
      evidence({ activeAt: null }),
    ]
    for (const ev of cases) {
      expect(judgeCleanupTarget({ ...base, worktree: own(), evidence: ev }).disposition).toBe(DISPOSITION.unproven)
    }
  })

  it('a directory git still lists but the filesystem no longer has is removable — the record is pruned', () => {
    const v = judgeCleanupTarget({ ...base, worktree: own(), evidence: { exists: false } })
    expect(v.disposition).toBe(DISPOSITION.remove)
  })

  it('harness-made, merged, unlocked, clean and quiet is the ONLY way to remove', () => {
    expect(judgeCleanupTarget({ ...base, worktree: own(), evidence: evidence() }).disposition).toBe(DISPOSITION.remove)
  })
})

describe('a kept worktree keeps its branch', () => {
  const base = { branch: 'feat/608-x', mainRoot: ROOT, since: NOW }

  it('suppresses both branch deletions while a tree still has the branch checked out', () => {
    const live = wt('own', 'feat/608-x', 'claude agent agent-own (pid 7 start 1)')
    const sel = selectCleanupTargets({ ...base, worktrees: [live], evidence: { [live.path]: deadFor('own') } })
    expect(sel.branch.delete).toBe(false)
    expect(sel.branch.reason).toContain(live.path)
    expect(formatCleanupNotes(sel).join('\n')).toContain('KEPT branch')
  })

  it('deletes the branch once every tree on it was removed', () => {
    const own = wt('own', 'feat/608-x')
    const sel = selectCleanupTargets({
      ...base,
      worktrees: [own, wt('x', 'feat/590-y')],
      evidence: { [own.path]: deadFor('own') },
    })
    expect(sel.remove).toEqual([own.path])
    expect(sel.branch.delete).toBe(true)
  })

  it('deletes the branch when no worktree has it at all', () => {
    expect(selectCleanupTargets({ ...base, worktrees: [] }).branch.delete).toBe(true)
  })

  it('finds EVERY dead tree on the branch, not the first — a restarted agent leaves two', () => {
    const a = wt('a', 'feat/608-x')
    const b = wt('b', 'feat/608-x')
    const sel = selectCleanupTargets({
      ...base,
      worktrees: [a, b],
      evidence: { [a.path]: deadFor('a'), [b.path]: deadFor('b') },
    })
    expect(sel.remove).toEqual([a.path, b.path])
    expect(sel.branch.delete).toBe(true)
  })

  it('keeps the branch when ONE of two trees on it is still alive', () => {
    const a = wt('a', 'feat/608-x')
    const b = wt('b', 'feat/608-x', 'claude agent agent-b (pid 7 start 1)')
    const sel = selectCleanupTargets({
      ...base,
      worktrees: [a, b],
      evidence: { [a.path]: deadFor('a'), [b.path]: deadFor('b') },
    })
    expect(sel.remove).toEqual([a.path])
    expect(sel.branch.delete).toBe(false)
  })
})

describe('the re-proof at the moment of deletion (review finding 2)', () => {
  const base = { mainRoot: ROOT, since: NOW }
  const own = wt('own', 'feat/608-x')
  const expected = { branch: 'feat/608-x' }

  it('passes when the tree in front of it is still the tree that was selected', () => {
    const r = reproveRemoval({ ...base, path: own.path, expected, worktree: own, evidence: deadFor('own') })
    expect(r.ok).toBe(true)
  })

  it('refuses a tree that was LOCKED between the selection and the deletion', () => {
    const locked = { ...own, locked: 'claude agent agent-own (pid 7 start 1)' }
    const r = reproveRemoval({ ...base, path: own.path, expected, worktree: locked, evidence: deadFor('own') })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/changed under the landing/)
  })

  it('refuses a tree that was WRITTEN INTO between the selection and the deletion', () => {
    const r = reproveRemoval({
      ...base,
      path: own.path,
      expected,
      worktree: own,
      evidence: { ...deadFor('own'), activeAt: NOW + 5_000 },
    })
    expect(r.ok).toBe(false)
  })

  it('refuses a path whose checkout was REPLACED by one on another branch', () => {
    const swapped = { ...own, branch: 'feat/590-y' }
    const r = reproveRemoval({ ...base, path: own.path, expected, worktree: swapped, evidence: deadFor('own') })
    expect(r.ok).toBe(false)
  })

  it('refuses when git no longer lists the path at all — that is not licence to delete it', () => {
    const r = reproveRemoval({ ...base, path: own.path, expected, worktree: null, evidence: deadFor('own') })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/no longer lists/)
  })

  it('refuses when no expectation was carried to the deletion step', () => {
    expect(reproveRemoval({ ...base, path: own.path, worktree: own, evidence: deadFor('own') }).ok).toBe(false)
    expect(reproveRemoval({}).ok).toBe(false)
  })

  it('the selection HANDS a real IDENTITY over, not just a branch name', () => {
    // Second review, finding 1: branch + unlocked + clean also describes a
    // DIFFERENT checkout standing at the same path.
    const tree = { ...own, head: 'abc123' }
    const ev = { ...deadFor('own'), ino: 4711, dev: 66, gitMtime: 900 }
    const sel = selectCleanupTargets({
      worktrees: [tree],
      branch: 'feat/608-x',
      mainRoot: ROOT,
      since: NOW,
      evidence: { [tree.path]: ev },
    })
    expect(sel.expected[tree.path]).toEqual({
      branch: 'feat/608-x',
      head: 'abc123',
      gitLink: linkOf('own'),
      ino: 4711,
      dev: 66,
      gitMtime: 900,
      notWrittenAfter: NOW,
    })
  })
})

describe('robustness of the inputs', () => {
  it('survives junk', () => {
    expect(selectCleanupTargets().remove).toEqual([])
    expect(selectCleanupTargets({ worktrees: null, branch: null, evidence: null }).remove).toEqual([])
    expect(selectCleanupTargets({ worktrees: [null, {}], branch: 'feat/1-x', mainRoot: ROOT }).remove).toEqual([])
  })

  it('knows an agent worktree from any other path', () => {
    expect(isAgentWorktree(`${ROOT}/${AGENT_WORKTREE_DIR}/agent-a`, ROOT)).toBe(true)
    expect(isAgentWorktree(`${ROOT}/${AGENT_WORKTREE_DIR}/agent-a/nested`, ROOT)).toBe(false)
    expect(isAgentWorktree(`${ROOT}/${AGENT_WORKTREE_DIR}/not-an-agent`, ROOT)).toBe(false)
    expect(isAgentWorktree(`${ROOT}/local/x`, ROOT)).toBe(false)
    expect(isAgentWorktree(ROOT, ROOT)).toBe(false)
    expect(isAgentWorktree(`${ROOT}/${AGENT_WORKTREE_DIR}`, ROOT)).toBe(false)
    // Windows separators and case are how git and the shell disagree; both resolve.
    expect(isAgentWorktree('C:\\repo\\.claude\\worktrees\\agent-a', 'C:/Repo')).toBe(true)
  })

  it("knows git's own record of a linked worktree from anything else", () => {
    expect(isLinkedWorktreeOf(`${ROOT}/${GIT_WORKTREE_ADMIN_DIR}/agent-a`, ROOT)).toBe(true)
    // git dedupes a colliding record name; that is still its own record.
    expect(isLinkedWorktreeOf(`${ROOT}/${GIT_WORKTREE_ADMIN_DIR}/agent-a1`, ROOT)).toBe(true)
    expect(isLinkedWorktreeOf(`${ROOT}/.git`, ROOT)).toBe(false)
    expect(isLinkedWorktreeOf('/elsewhere/.git/worktrees/agent-a', ROOT)).toBe(false)
    expect(isLinkedWorktreeOf(null, ROOT)).toBe(false)
    expect(isLinkedWorktreeOf(`${ROOT}/${GIT_WORKTREE_ADMIN_DIR}/agent-a`, '')).toBe(false)
  })
})
