// THE LANDING'S CLEANUP SELECTOR — the rule that must never delete a live or a
// foreign worktree again (point 629).
import { describe, expect, it } from 'vitest'
import {
  AGENT_WORKTREE_DIR,
  DISPOSITION,
  formatCleanupNotes,
  isAgentWorktree,
  judgeCleanupTarget,
  selectCleanupTargets,
} from './land-cleanup-core.mjs'

const ROOT = '/repo'
const wt = (id, branch, locked = null) => ({
  path: `${ROOT}/${AGENT_WORKTREE_DIR}/agent-${id}`,
  branch,
  locked,
})
const dead = { exists: true, dirty: false, activeAt: 1000, holderAlive: null }
const NOW = 5000

/** The landed point's own, finished worktree. */
const OWN = wt('608a', 'feat/608-board-order')
/** The worktree of the agent that was still working on point 590. */
const OTHER = wt('a46632fd8f7f4bbce', 'feat/590-queue-rank', 'claude agent agent-a46632fd8f7f4bbce (pid 4711 start 1)')

describe('the incident: landing 608 beside a live agent on 590', () => {
  const scene = {
    worktrees: [{ path: ROOT, branch: 'main' }, OWN, OTHER],
    branch: 'feat/608-board-order',
    mainRoot: ROOT,
    since: NOW,
    evidence: {
      [OWN.path]: dead,
      [OTHER.path]: { exists: true, dirty: true, activeAt: NOW + 60_000, holderAlive: true },
    },
  }

  it('removes exactly the landed point\'s dead worktree — never the foreign one', () => {
    const sel = selectCleanupTargets(scene)
    expect(sel.remove).toEqual([OWN.path])
  })

  it('never names the other agent\'s tree as removable, whatever the evidence says', () => {
    for (const evidence of [
      { [OTHER.path]: dead },
      { [OTHER.path]: null },
      {},
    ]) {
      const sel = selectCleanupTargets({ ...scene, evidence: { [OWN.path]: dead, ...evidence } })
      expect(sel.remove).not.toContain(OTHER.path)
    }
  })

  it('leaves the MAIN checkout alone even when it is on the landed branch', () => {
    const sel = selectCleanupTargets({
      ...scene,
      worktrees: [{ path: ROOT, branch: 'feat/608-board-order' }],
      evidence: { [ROOT]: dead },
    })
    expect(sel.remove).toEqual([])
    expect(sel.kept[0].disposition).toBe(DISPOSITION.foreign)
  })
})

describe('ownership must be PROVEN', () => {
  const base = { branch: 'feat/608-x', mainRoot: ROOT, since: NOW }

  it('a worktree on another branch is foreign, and foreign is not reported as a problem', () => {
    const v = judgeCleanupTarget({ ...base, worktree: wt('b', 'feat/590-y'), evidence: dead })
    expect(v.disposition).toBe(DISPOSITION.foreign)
    expect(formatCleanupNotes(selectCleanupTargets({ ...base, worktrees: [wt('b', 'feat/590-y')] }))).toEqual([])
  })

  it('an agent worktree with a detached HEAD is REPORTED, not removed', () => {
    const v = judgeCleanupTarget({ ...base, worktree: wt('c', ''), evidence: dead })
    expect(v.disposition).toBe(DISPOSITION.unproven)
    expect(v.reason).toMatch(/detached/)
    const notes = formatCleanupNotes(selectCleanupTargets({ ...base, worktrees: [wt('c', '')], evidence: { [wt('c', '').path]: dead } }))
    expect(notes.join('\n')).toContain(wt('c', '').path)
  })

  it('a checkout on the landed branch outside the agent directory is REPORTED, not removed', () => {
    const v = judgeCleanupTarget({
      ...base,
      worktree: { path: '/repo/local/somebody-else', branch: 'feat/608-x' },
      evidence: dead,
    })
    expect(v.disposition).toBe(DISPOSITION.unproven)
    expect(v.reason).toContain(AGENT_WORKTREE_DIR)
  })

  it('a landing without a branch name proves nothing about anything', () => {
    const v = judgeCleanupTarget({ ...base, branch: '', worktree: wt('d', 'feat/608-x'), evidence: dead })
    expect(v.disposition).toBe(DISPOSITION.unproven)
  })

  it('a worktree without a path is reported rather than acted on', () => {
    expect(judgeCleanupTarget({ ...base, worktree: {}, evidence: dead }).disposition).toBe(DISPOSITION.unproven)
  })
})

describe('death must be PROVEN too', () => {
  const base = { branch: 'feat/608-x', mainRoot: ROOT, since: NOW }
  const own = (locked = null) => wt('own', 'feat/608-x', locked)

  it('a git-locked worktree is alive — an agent still holds it', () => {
    const v = judgeCleanupTarget({ ...base, worktree: own('claude agent agent-own (pid 7 start 1)'), evidence: dead })
    expect(v.disposition).toBe(DISPOSITION.live)
    expect(v.reason).toContain('pid 7')
  })

  it('a lock whose process is gone still keeps the tree, and says so', () => {
    const v = judgeCleanupTarget({
      ...base,
      worktree: own('claude agent agent-own (pid 7 start 1)'),
      evidence: { ...dead, holderAlive: false },
    })
    expect(v.disposition).toBe(DISPOSITION.live)
    expect(v.reason).toMatch(/unlock/)
  })

  it('uncommitted changes keep the tree — that is the state nothing can rescue', () => {
    const v = judgeCleanupTarget({ ...base, worktree: own(), evidence: { ...dead, dirty: true } })
    expect(v.disposition).toBe(DISPOSITION.live)
  })

  it('a file written after the landing began keeps the tree', () => {
    const v = judgeCleanupTarget({ ...base, worktree: own(), evidence: { ...dead, activeAt: NOW + 30_000 } })
    expect(v.disposition).toBe(DISPOSITION.live)
    expect(v.reason).toMatch(/after the landing began/)
  })

  it('an unreadable probe never counts as dead', () => {
    for (const evidence of [null, { exists: null }, { exists: true, dirty: null }]) {
      expect(judgeCleanupTarget({ ...base, worktree: own(), evidence }).disposition).toBe(DISPOSITION.unproven)
    }
  })

  it('a directory git still lists but the filesystem no longer has is removable — the record is pruned', () => {
    const v = judgeCleanupTarget({ ...base, worktree: own(), evidence: { exists: false } })
    expect(v.disposition).toBe(DISPOSITION.remove)
  })

  it('unlocked, clean and quiet since before the landing is the ONLY way to remove', () => {
    expect(judgeCleanupTarget({ ...base, worktree: own(), evidence: dead }).disposition).toBe(DISPOSITION.remove)
  })

  it('an unknown activeAt does not block the removal — the two strong probes carry it', () => {
    const v = judgeCleanupTarget({ ...base, worktree: own(), evidence: { exists: true, dirty: false, activeAt: null } })
    expect(v.disposition).toBe(DISPOSITION.remove)
  })
})

describe('a kept worktree keeps its branch', () => {
  const base = { branch: 'feat/608-x', mainRoot: ROOT, since: NOW }

  it('suppresses both branch deletions while a tree still has the branch checked out', () => {
    const live = wt('own', 'feat/608-x', 'claude agent agent-own (pid 7 start 1)')
    const sel = selectCleanupTargets({ ...base, worktrees: [live], evidence: { [live.path]: dead } })
    expect(sel.branch.delete).toBe(false)
    expect(sel.branch.reason).toContain(live.path)
    expect(formatCleanupNotes(sel).join('\n')).toContain('KEPT branch')
  })

  it('deletes the branch once every tree on it was removed', () => {
    const own = wt('own', 'feat/608-x')
    const sel = selectCleanupTargets({ ...base, worktrees: [own, wt('x', 'feat/590-y')], evidence: { [own.path]: dead } })
    expect(sel.remove).toEqual([own.path])
    expect(sel.branch.delete).toBe(true)
  })

  it('deletes the branch when no worktree has it at all', () => {
    expect(selectCleanupTargets({ ...base, worktrees: [] }).branch.delete).toBe(true)
  })

  it('finds EVERY dead tree on the branch, not the first — a restarted agent leaves two', () => {
    const a = wt('a', 'feat/608-x')
    const b = wt('b', 'feat/608-x')
    const sel = selectCleanupTargets({ ...base, worktrees: [a, b], evidence: { [a.path]: dead, [b.path]: dead } })
    expect(sel.remove).toEqual([a.path, b.path])
    expect(sel.branch.delete).toBe(true)
  })

  it('keeps the branch when ONE of two trees on it is still alive', () => {
    const a = wt('a', 'feat/608-x')
    const b = wt('b', 'feat/608-x', 'claude agent agent-b (pid 7 start 1)')
    const sel = selectCleanupTargets({ ...base, worktrees: [a, b], evidence: { [a.path]: dead, [b.path]: dead } })
    expect(sel.remove).toEqual([a.path])
    expect(sel.branch.delete).toBe(false)
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
    expect(isAgentWorktree(`${ROOT}/local/x`, ROOT)).toBe(false)
    expect(isAgentWorktree(ROOT, ROOT)).toBe(false)
    expect(isAgentWorktree(`${ROOT}/${AGENT_WORKTREE_DIR}`, ROOT)).toBe(false)
    // Windows separators and case are how git and the shell disagree; both resolve.
    expect(isAgentWorktree(`C:\\repo\\.claude\\worktrees\\agent-a`, 'C:/Repo')).toBe(true)
  })
})
