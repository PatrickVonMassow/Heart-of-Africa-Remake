// WHICH WORKTREE MAY THE LANDING DELETE? PURE (point 629).
//
// WHY THIS FILE EXISTS. On 11.08.2026 the landing of point 608 ran
// `land-point.mjs` through its `cleanup` step and the worktree of the agent
// still working on point 590 (`.claude/worktrees/agent-a46632fd8f7f4bbce`)
// disappeared underneath it. From that moment every shell call of that agent was
// refused with "the isolation worktree appears to have been removed", and its
// finished, tested, UNCOMMITTED work — six answered review findings, 89 green
// cases, a recorded reviewer verdict — was gone. Only what it had already pushed
// survived. This is the one failure class that destroys work already done, and it
// fires precisely when the batch is at its most productive: a landing running
// beside a live pool.
//
// THE STANCE, AND IT IS DELIBERATELY ASYMMETRIC. A wrong RETENTION leaves debris
// that `branch-hygiene-guard` names and one command removes. A wrong REMOVAL
// destroys work nothing can rebuild. So a worktree is removed only when BOTH
// halves are PROVEN:
//   OWNERSHIP — it is checked out on the very branch being landed. Anything the
//     landing cannot tie to its own point is left alone, and an agent worktree
//     whose ownership cannot be established at all is REPORTED by name rather
//     than removed.
//   DEATH — no agent still holds it (git's own worktree LOCK, which the isolation
//     harness sets while an agent works and releases when it exits), it holds no
//     uncommitted changes, and nothing was written into it since the landing
//     began. Every one of those must be KNOWN: a probe that could not answer
//     leaves the worktree standing, exactly as an unprovable ownership does.
//
// The liveness evidence is the same kind `scripts/batch-in-flight.mjs` already
// collects for the batch (a holder process, the freshness of a checkout's working
// files); this module only decides on it, and takes it as plain data so the
// decision is testable without a filesystem.
//
// KEEPING A WORKTREE KEEPS ITS BRANCH. git refuses to delete a branch a worktree
// has checked out, and a live agent still pushes to its remote branch — so a kept
// worktree suppresses both branch deletions, with the reason stated, instead of
// letting them fail as "debris".

import { insideRoot, normPath } from './worktree-cleanup-core.mjs'

/** Where the isolation harness puts an agent worktree, relative to the main
 *  checkout. A worktree anywhere else was not created by a delegation. */
export const AGENT_WORKTREE_DIR = '.claude/worktrees'

/**
 * What the landing decided about one worktree.
 *   remove   — proven to belong to the landed point, and proven dead
 *   foreign  — proven NOT to belong to it (another branch, another purpose)
 *   live     — it belongs, but something is still working in it
 *   unproven — it might belong and nothing settles it; reported, never removed
 */
export const DISPOSITION = Object.freeze({
  remove: 'remove',
  foreign: 'foreign',
  live: 'live',
  unproven: 'unproven',
})

/** The dispositions the landing must SAY OUT LOUD. `foreign` is the ordinary
 *  case — every other point's worktree is foreign to this landing — and naming
 *  each one would bury the two that matter. */
export const REPORTED = Object.freeze([DISPOSITION.live, DISPOSITION.unproven])

const str = (v) => String(v ?? '').trim()

/** Is this path one of the isolation harness's agent worktrees? */
export function isAgentWorktree(path, mainRoot) {
  const root = normPath(mainRoot)
  if (!root) return false
  return insideRoot(path, `${root}/${AGENT_WORKTREE_DIR}`)
}

/**
 * JUDGE ONE WORKTREE. PURE.
 *
 * Inputs:
 *   worktree  { path, branch, locked }  as `git worktree list --porcelain` reports
 *             it — `branch` empty for a detached HEAD, `locked` the lock reason
 *             (git prints the holder there; the isolation harness writes
 *             "claude agent agent-<id> (pid … start …)") or null when unlocked.
 *   branch    the branch being landed
 *   mainRoot  the main checkout
 *   evidence  { exists, dirty, activeAt, holderAlive } for that path, or null when
 *             none was collected:
 *               exists      — does the directory still exist? (false is fine: only
 *                             git's record is then pruned)
 *               dirty       — does it hold uncommitted or untracked changes?
 *               activeAt    — epoch ms a working file in it was last written
 *               holderAlive — is the process named in the lock still running?
 *                             REPORTED ONLY; a stale lock still keeps the tree,
 *                             because a lock nobody released is not proof that
 *                             nobody is there.
 *             `null` for any of them means "could not be established", which never
 *             counts as established.
 *   since     epoch ms the landing began; a file written after it means someone is
 *             working in the tree right now.
 *
 * Returns { path, disposition, reason }.
 */
export function judgeCleanupTarget({ worktree, branch, mainRoot, evidence = null, since = null } = {}) {
  const path = str(worktree?.path)
  const want = str(branch)
  const has = str(worktree?.branch)
  const agent = isAgentWorktree(path, mainRoot)
  const at = (disposition, reason) => ({ path, disposition, reason })

  if (!path) return at(DISPOSITION.unproven, 'git named a worktree without a path')
  if (normPath(path) === normPath(mainRoot)) return at(DISPOSITION.foreign, 'the MAIN checkout')

  // ── OWNERSHIP ──────────────────────────────────────────────────────────────
  if (!want) return at(DISPOSITION.unproven, 'the landing named no branch, so nothing can be tied to it')
  if (!has) {
    // A detached agent worktree is the shape that cannot be judged: it may be the
    // landed point's own tree mid-rebase, or another agent's. Say so.
    return agent
      ? at(DISPOSITION.unproven, `an agent worktree with a detached HEAD — nothing proves it belongs to ${want}`)
      : at(DISPOSITION.foreign, 'a detached worktree outside the agent directory')
  }
  if (has !== want) return at(DISPOSITION.foreign, `checked out on ${has}, not on ${want}`)
  if (!agent) {
    // The branch matches, but the landing did not create this tree, so removing it
    // is not cleanup — it is deleting someone's checkout.
    return at(DISPOSITION.unproven, `on ${want}, but outside ${AGENT_WORKTREE_DIR}/ — the landing did not create it`)
  }

  // ── DEATH ──────────────────────────────────────────────────────────────────
  if (!evidence || typeof evidence !== 'object') {
    return at(DISPOSITION.unproven, 'no liveness evidence was collected for it')
  }
  if (evidence.exists === false) {
    return at(DISPOSITION.remove, "the directory is already gone — only git's record is pruned")
  }
  if (evidence.exists !== true) return at(DISPOSITION.unproven, 'whether it still exists could not be established')

  const lock = str(worktree?.locked)
  if (lock) {
    const holder = evidence.holderAlive === false ? ' (its process is gone — `git worktree unlock` it once you are sure)' : ''
    return at(DISPOSITION.live, `git-locked by ${lock}${holder}`)
  }
  if (evidence.dirty === true) {
    return at(DISPOSITION.live, 'it holds uncommitted changes — the one state nothing can rescue')
  }
  if (evidence.dirty !== false) return at(DISPOSITION.unproven, 'git could not report whether it holds uncommitted work')

  const activeAt = Number(evidence.activeAt)
  if (Number.isFinite(activeAt) && Number.isFinite(Number(since)) && activeAt > Number(since)) {
    return at(DISPOSITION.live, `a working file was written ${Math.max(1, Math.round((activeAt - Number(since)) / 1000))}s after the landing began`)
  }
  return at(DISPOSITION.remove, `on ${want}, unlocked, clean and quiet`)
}

/**
 * THE WHOLE CLEANUP DECISION. PURE.
 *
 * Returns:
 *   remove       [path]                       — what may be deleted, in list order
 *   kept         [{ path, disposition, reason }] — everything else, `foreign` included
 *   reported     [{ path, disposition, reason }] — the subset the landing must print
 *   branch       { delete: boolean, reason }   — whether the local/remote branch
 *                                                deletions may run at all
 */
export function selectCleanupTargets({ worktrees = [], branch, mainRoot, evidence = {}, since = null } = {}) {
  const list = Array.isArray(worktrees) ? worktrees : []
  const by = evidence && typeof evidence === 'object' ? evidence : {}
  const verdicts = list.map((w) =>
    judgeCleanupTarget({ worktree: w, branch, mainRoot, evidence: by[str(w?.path)] ?? null, since }),
  )

  const remove = verdicts.filter((v) => v.disposition === DISPOSITION.remove).map((v) => v.path)
  const kept = verdicts.filter((v) => v.disposition !== DISPOSITION.remove)
  const reported = kept.filter((v) => REPORTED.includes(v.disposition))

  // A worktree that KEEPS the landed branch checked out keeps the branch too:
  // git refuses `branch -d` on it, and deleting the remote would break the pushes
  // of whatever is still working there.
  const holdsBranch = list
    .map((w, i) => ({ w, v: verdicts[i] }))
    .filter(({ w, v }) => str(w?.branch) === str(branch) && v.disposition !== DISPOSITION.remove)
  return {
    remove,
    kept,
    reported,
    branch: holdsBranch.length
      ? {
          delete: false,
          reason: `${holdsBranch[0].v.path} still has ${str(branch)} checked out and was kept (${holdsBranch[0].v.reason})`,
        }
      : { delete: true, reason: '' },
  }
}

/** The lines the landing prints about what it did NOT remove. Empty when there is
 *  nothing to say — silence then means "everything was proven, nothing was left". */
export function formatCleanupNotes(selection) {
  const reported = selection?.reported ?? []
  const lines = reported.map((r) => `  KEPT ${r.path} — ${r.reason}`)
  if (selection?.branch && selection.branch.delete === false) {
    lines.push(`  KEPT branch — ${selection.branch.reason}`)
  }
  return lines.length ? ['land-point: the cleanup left these standing, on purpose:', ...lines] : []
}
