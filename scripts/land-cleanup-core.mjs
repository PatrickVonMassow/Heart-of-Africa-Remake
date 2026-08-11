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
// destroys work nothing can rebuild. So EVERY fact below must be POSITIVELY
// established; a probe that could not answer means KEEP AND REPORT, never
// "nothing was in the way". That rule has no exception, because the first
// version of this file had one — an unreadable freshness probe fell through to
// `remove` — and the cross-vendor review named it as the same failure class the
// point exists to prevent.
//
// A worktree is removed only when BOTH halves are proven:
//   OWNERSHIP — it is a DIRECT child of the isolation directory, named the way
//     the harness names one; git's own record says it is a linked worktree OF
//     THIS repository; it is checked out on the very branch being landed; and its
//     HEAD is already CONTAINED in what the landing merged. That last one is the
//     only landing-specific identity that exists — the landing did not create the
//     tree, so what it can prove is that the work in it is the work it just took.
//   DEATH — nothing still holds it (git's own worktree LOCK, which the isolation
//     harness sets while an agent works and releases when it exits), it holds no
//     uncommitted changes, and nothing was written into it since the landing
//     began.
//
// The liveness evidence is the same kind `scripts/batch-in-flight.mjs` already
// collects for the batch; this module only decides on it, and takes it as plain
// data so the decision is testable without a filesystem.
//
// KEEPING A WORKTREE KEEPS ITS BRANCH. git refuses to delete a branch a worktree
// has checked out, and a live agent still pushes to its remote branch. The rule
// is deliberately wider than "a kept tree REPORTS that branch": a tree detached
// mid-rebase reports no branch at all and would have had its branch deleted
// underneath it (review finding 4). ANY tree the landing could not clear keeps
// the branch — local and remote both.

import { insideRoot, normPath } from './worktree-cleanup-core.mjs'

/** Where the isolation harness puts an agent worktree, relative to the main
 *  checkout. A worktree anywhere else was not created by a delegation. */
export const AGENT_WORKTREE_DIR = '.claude/worktrees'

/** Where git keeps the administrative record of a LINKED worktree of this
 *  repository. A checkout whose `.git` does not point in here is some other
 *  repository that merely sits at that path. */
export const GIT_WORKTREE_ADMIN_DIR = '.git/worktrees'

/** The harness's name for an agent worktree directory. Case-sensitive, and
 *  deliberately the same shape `stubBranchFor` recognises. */
const AGENT_DIR_NAME = /^agent-[A-Za-z0-9][A-Za-z0-9._-]*$/

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
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const baseName = (p) => {
  const s = str(p).replace(/\\/g, '/').replace(/\/+$/, '')
  return s.slice(s.lastIndexOf('/') + 1)
}

/**
 * Is this path one of the isolation harness's agent worktrees? PURE.
 *
 * A DIRECT child of `<mainRoot>/.claude/worktrees`, named `agent-<id>`. The first
 * version accepted every DESCENDANT of that directory (review finding 3), which
 * let a checkout nested anywhere below it pass as the harness's own.
 */
export function isAgentWorktree(path, mainRoot) {
  const root = normPath(mainRoot)
  if (!root) return false
  const dir = `${root}/${AGENT_WORKTREE_DIR}`
  if (!insideRoot(path, dir)) return false
  const rest = normPath(path).slice(dir.length + 1)
  return !rest.includes('/') && AGENT_DIR_NAME.test(baseName(path))
}

/**
 * Does git's own record say this is a linked worktree OF THIS repository? PURE.
 *
 * `linkedTo` is what the checkout's `.git` file points at. For a linked worktree
 * that is `<mainRoot>/.git/worktrees/<name>` — git writes it when it creates the
 * tree, which makes it the closest thing to a creation record that exists. A
 * separate clone, a stray copy or a plain directory dropped into the isolation
 * folder has no such record and is refused.
 *
 * The NAME is not compared: git dedupes a colliding record name (`agent-own1`),
 * and refusing on that would reject trees it created itself.
 */
export function isLinkedWorktreeOf(linkedTo, mainRoot) {
  const root = normPath(mainRoot)
  if (!root || !str(linkedTo)) return false
  return insideRoot(linkedTo, `${root}/${GIT_WORKTREE_ADMIN_DIR}`)
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
 *   evidence  what the probes answered for that path, or null when none was
 *             collected. EVERY field is tri-state, and `null` — "could not be
 *             established" — never counts as established:
 *               exists      — does the directory still exist? (false is fine: only
 *                             git's record is then pruned)
 *               linkedTo    — the admin gitdir its `.git` points at (creation record)
 *               headMerged  — is its HEAD already contained in what was merged?
 *               dirty       — does it hold uncommitted or untracked changes?
 *               activeAt    — epoch ms a working file in it was last written
 *               holderAlive — is the process named in the lock still running?
 *                             REPORTED ONLY; a stale lock still keeps the tree,
 *                             because a lock nobody released is not proof that
 *                             nobody is there.
 *   since     epoch ms the landing began; a file written after it means someone is
 *             working in the tree right now. An unreadable `since` decides nothing
 *             and therefore keeps the tree.
 *
 * Returns { path, branch, disposition, reason }.
 */
export function judgeCleanupTarget({ worktree, branch, mainRoot, evidence = null, since = null } = {}) {
  const path = str(worktree?.path)
  const want = str(branch)
  const has = str(worktree?.branch)
  const agent = isAgentWorktree(path, mainRoot)
  const at = (disposition, reason) => ({ path, branch: has, disposition, reason })

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
    // The branch matches, but this is not a tree the isolation harness made, so
    // removing it is not cleanup — it is deleting someone's checkout.
    return at(
      DISPOSITION.unproven,
      `on ${want}, but not a direct \`agent-<id>\` child of ${AGENT_WORKTREE_DIR}/ — the harness did not create it`,
    )
  }

  if (!evidence || typeof evidence !== 'object') {
    return at(DISPOSITION.unproven, 'no evidence was collected for it')
  }
  if (evidence.exists === false) {
    return at(DISPOSITION.remove, "the directory is already gone — only git's record is pruned")
  }
  if (evidence.exists !== true) return at(DISPOSITION.unproven, 'whether it still exists could not be established')

  if (!isLinkedWorktreeOf(evidence.linkedTo, mainRoot)) {
    return at(
      DISPOSITION.unproven,
      str(evidence.linkedTo)
        ? `its .git points at ${str(evidence.linkedTo)}, outside ${GIT_WORKTREE_ADMIN_DIR}/ — git has no record of creating it here`
        : `git's own worktree record for it could not be read`,
    )
  }

  // THE ONLY LANDING-SPECIFIC IDENTITY THERE IS. The landing did not create this
  // tree, so it cannot prove authorship; what it CAN prove is that the commit the
  // tree is standing on is already inside what it just merged. A tree holding
  // anything the landing did not take is a tree with work in it.
  if (evidence.headMerged === false) {
    return at(DISPOSITION.live, 'its HEAD is not contained in what was merged — it holds commits the landing did not take')
  }
  if (evidence.headMerged !== true) {
    return at(DISPOSITION.unproven, 'whether its HEAD is contained in what was merged could not be established')
  }

  // ── DEATH ──────────────────────────────────────────────────────────────────
  const lock = str(worktree?.locked)
  if (lock) {
    const holder =
      evidence.holderAlive === false ? ' (its process is gone — `git worktree unlock` it once you are sure)' : ''
    return at(DISPOSITION.live, `git-locked by ${lock}${holder}`)
  }
  if (evidence.dirty === true) {
    return at(DISPOSITION.live, 'it holds uncommitted changes — the one state nothing can rescue')
  }
  if (evidence.dirty !== false) return at(DISPOSITION.unproven, 'git could not report whether it holds uncommitted work')

  // FRESHNESS IS NOT OPTIONAL. An unreadable `activeAt` (or `since`) used to fall
  // through to `remove`, which is the fail-OPEN the review named: the rule says
  // every liveness fact must be KNOWN, and this is a liveness fact.
  const activeAt = num(evidence.activeAt)
  const start = num(since)
  if (activeAt === null) return at(DISPOSITION.unproven, 'when it was last written could not be established')
  if (start === null) return at(DISPOSITION.unproven, 'the landing could not say when it began, so freshness decides nothing')
  if (activeAt > start) {
    return at(
      DISPOSITION.live,
      `a working file was written ${Math.max(1, Math.round((activeAt - start) / 1000))}s after the landing began`,
    )
  }
  return at(DISPOSITION.remove, `on ${want}, harness-made, merged, unlocked, clean and quiet`)
}

/**
 * THE WHOLE CLEANUP DECISION. PURE.
 *
 * Returns:
 *   remove       [path]                         — what may be deleted, in list order
 *   expected     { [path]: { branch } }          — what the deletion step must
 *                                                  RE-PROVE at the moment it deletes
 *   kept         [{ path, disposition, reason }] — everything else, `foreign` included
 *   reported     [{ path, disposition, reason }] — the subset the landing must print
 *   branch       { delete: boolean, reason }     — whether the local/remote branch
 *                                                  deletions may run at all
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

  // WHAT THE DELETION STEP MUST RE-PROVE. A branch name is not an identity
  // (second review, finding 1): branch + unlocked + clean also describes a
  // DIFFERENT checkout that appeared at the same path. So the record carries the
  // commit it stood on (which carries the containment proof forward — `headMerged`
  // was established for THAT sha), git's admin record, the `.git` file's own
  // inode, and the instant the freshness was proven against.
  const expected = Object.fromEntries(
    list
      .map((w, i) => [w, verdicts[i]])
      .filter(([, v]) => v.disposition === DISPOSITION.remove)
      .map(([w, v]) => {
        const ev = by[str(w?.path)] ?? {}
        return [
          v.path,
          {
            branch: str(branch),
            head: str(w?.head),
            gitLink: str(ev.linkedTo),
            ino: Number(ev.ino ?? 0),
            dev: Number(ev.dev ?? 0),
            gitMtime: Number(ev.gitMtime ?? 0),
            gitBirth: Number(ev.gitBirth ?? 0),
            notWrittenAfter: num(since) ?? 0,
          },
        ]
      }),
  )

  // ANY tree the landing could not clear keeps the branch — not only one that
  // REPORTS that branch. A tree detached mid-rebase reports no branch at all, and
  // requiring an exact report deleted the branch it was standing on (review
  // finding 4). Debris costs one command; that costs the rebase.
  const blocker =
    reported[0] ?? kept.find((v) => str(v.branch) === str(branch)) ?? null
  return {
    remove,
    expected,
    kept,
    reported,
    branch: blocker
      ? {
          delete: false,
          reason: `${blocker.path} was kept (${blocker.reason}) — it may still be standing on ${str(branch)}`,
        }
      : { delete: true, reason: '' },
  }
}

/**
 * THE RE-PROOF AT THE MOMENT OF DELETION. PURE.
 *
 * The selection is a SNAPSHOT: minutes pass between it and the removal, and in
 * that window a worktree can be locked, written into, or replaced at the same
 * path (review finding 2). So the deletion step re-lists and re-probes that ONE
 * path and asks this function whether the tree in front of it is still the tree
 * that was selected. Anything that moved refuses the removal.
 *
 * Returns { ok, reason } — `ok: false` means DO NOT DELETE, and the reason is
 * printed as debris rather than swallowed.
 */
export function reproveRemoval({ path, expected, worktree, evidence, mainRoot, since } = {}) {
  const want = str(expected?.branch)
  if (!want) return { ok: false, reason: 'no expected branch was carried to the deletion step' }
  if (!str(path)) return { ok: false, reason: 'no path' }
  if (!worktree) {
    // git no longer lists it. That is not licence to delete a directory: it is
    // exactly the state in which the path may hold something else entirely.
    return { ok: false, reason: `git no longer lists ${str(path)} as a worktree — it changed under the landing` }
  }
  const verdict = judgeCleanupTarget({ worktree, branch: want, mainRoot, evidence, since })
  return verdict.disposition === DISPOSITION.remove
    ? { ok: true, reason: verdict.reason }
    : { ok: false, reason: `it changed under the landing: ${verdict.reason}` }
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
