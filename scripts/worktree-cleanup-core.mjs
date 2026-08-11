// AN AGENT'S CLEANUP MUST NOT REACH OUTSIDE ITS WORKTREE — the pure half
// (worktree-cleanup.mjs does the filesystem work).
//
// WHY: on 29.07.2026, TWICE in one afternoon, a delegated agent finished, its
// temporary worktree was removed — once with `git worktree remove --force`,
// once with an `rm -rf` after that failed — and `node_modules` in the MAIN tree
// came away with it. The next `npm run build` reported "'tsc' is not
// recognized", the push gate went red on a state that was otherwise fine, and
// the repair each time was a full `npm install`. This is retrospective §3.49
// repeating twice after it was written down, which is the evidence that a
// written lesson without a mechanism does not hold.
//
// WHICH OF THE TWO CAUSES IT IS — measured, not assumed (29.07.2026): a surviving
// agent worktree in this repository carries
//   node_modules  ->  Junction  ->  C:\...\hoa\node_modules
// with 198 entries visible THROUGH it. It is cause (i): the dependency directory
// is a LINK and the recursive delete follows it. Windows junctions are traversed
// by `rm -rf`, by `Remove-Item -Recurse` and by git's own worktree removal, and
// each deletes what it finds on the far side.
//
// SO THE ORDER IS THE FIX: every reparse point inside the tree is DETACHED first
// — the link removed, never its contents — and only then is the tree removed. It
// lives in ONE script the main session calls, because the two damaged runs used
// two different commands, and a rule that has to be re-obeyed per prompt is the
// rule that failed twice already.
//
// WORKTREES ARE NOT THE DEFECT. Parallel agents need worktree isolation
// (CLAUDE.md §6); the removal is what was wrong.

import { resolve, sep } from 'node:path'

/** Compare paths the way Windows and git both will. */
export const normPath = (p) =>
  String(p ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()

/**
 * Is `candidate` STRICTLY inside `root`? The root itself is not inside itself,
 * and `C:/x/repo-2` is not inside `C:/x/repo` — the separator check is what
 * makes the prefix test honest.
 */
export function insideRoot(candidate, root) {
  const c = normPath(candidate)
  const r = normPath(root)
  if (!c || !r) return false
  return c.startsWith(`${r}/`)
}

/** Reasons a removal is refused, so the caller can print one true sentence. */
export const REFUSALS = {
  'no-path': 'no path was given',
  'main-tree': 'that is the MAIN checkout — removing it is never cleanup',
  'outside-repo': 'that path is not inside this repository',
  'not-a-worktree': 'git does not know that path as a worktree, and it is not an orphan under .claude/worktrees/',
  'is-repo-parent': 'that path CONTAINS the main checkout',
}

/**
 * MAY THIS PATH BE REMOVED? PURE.
 *
 * Inputs:
 *   target        the path the caller wants gone
 *   mainRoot      the main checkout (git's first worktree)
 *   worktrees     every path `git worktree list` reports
 *   allowOrphan   also accept a directory under `<mainRoot>/.claude/worktrees/`
 *                 that git no longer lists — those are what a half-finished
 *                 removal leaves behind, and they are exactly what someone
 *                 reaches for `rm -rf` to deal with
 *
 * Returns { ok, path, reason }. Anything not clearly a removable worktree is
 * REFUSED: this runs against a real filesystem, so the two verdicts are not
 * symmetrical — a wrong refusal costs one message, a wrong removal cost two
 * `npm install`s and a red gate.
 */
export function judgeTarget({ target, mainRoot, worktrees = [], allowOrphan = true } = {}) {
  const path = normPath(target)
  const root = normPath(mainRoot)
  if (!path) return { ok: false, path: null, reason: 'no-path' }
  if (!root) return { ok: false, path, reason: 'outside-repo' }
  if (path === root) return { ok: false, path, reason: 'main-tree' }
  if (insideRoot(mainRoot, target)) return { ok: false, path, reason: 'is-repo-parent' }

  const known = (Array.isArray(worktrees) ? worktrees : []).map(normPath)
  if (known.includes(path)) {
    // The main tree is git's first worktree; being listed does not license it.
    return known[0] === path ? { ok: false, path, reason: 'main-tree' } : { ok: true, path, reason: 'registered' }
  }

  if (allowOrphan && insideRoot(path, `${root}/.claude/worktrees`)) {
    return { ok: true, path, reason: 'orphan-under-worktrees-dir' }
  }
  return { ok: false, path, reason: 'not-a-worktree' }
}

/**
 * SHOULD THIS DIRECTORY ENTRY BE DETACHED RATHER THAN DESCENDED INTO? PURE.
 *
 * `lstat`-shaped input, so the rule is testable without a filesystem. A symlink
 * OR a Windows junction (a directory carrying a reparse point) is a door out of
 * the tree; both are unlinked where they stand and never walked through. That
 * one decision is the whole incident.
 */
export function shouldDetach(entry) {
  if (!entry || typeof entry !== 'object') return false
  return entry.isSymbolicLink === true || entry.isJunction === true
}

/**
 * The safety assertion every unlink passes before it happens: the path must lie
 * strictly inside the tree being removed. PURE, and deliberately separate from
 * the walk, because "the walk only produced paths inside the root" is an
 * assumption, and the two incidents were both about an assumption like it.
 */
export function assertInside(path, root) {
  if (!insideRoot(path, root)) {
    throw new Error(
      `worktree-cleanup refuses to touch ${path}: it is not inside the worktree root ${root}. ` +
        'This is the check that the 29.07.2026 removals did not have.',
    )
  }
  return resolve(String(path))
}

/**
 * IS THE TREE IN FRONT OF THE DELETION THE TREE THE CALLER MEANT? PURE (point 629).
 *
 * A caller that knows exactly which tree it selected passes `--expect <json>`, and
 * the removal is refused unless the checkout in front of this command is STILL
 * that tree. This is the last of three re-proofs and the only one inside the
 * process that actually deletes: the landing's selection and its per-path re-check
 * both answer BEFORE this command is spawned.
 *
 * A BRANCH NAME IS NOT AN IDENTITY (second review, finding 1). Branch + unlocked +
 * clean also describes a DIFFERENT checkout that appeared at the same path, and a
 * same-path replacement even reuses git's admin record name — measured 11.08.2026:
 * after `worktree remove` + `worktree add` at the same path, the admin gitdir is
 * byte-identical while the `.git` FILE's inode is not. So the expectation carries:
 *   branch   — what it was checked out on
 *   head     — the commit it stood on. This also carries the containment proof
 *              forward: `headMerged` was established for THIS sha, so an unchanged
 *              head means an unchanged verdict, and a changed one refuses.
 *   gitLink  — the admin gitdir its `.git` pointed at (still a linked worktree of
 *              the same repository)
 *   ino/dev/gitMtime — the identity of that `.git` file. The inode alone is not
 *              enough: a filesystem hands a freed inode straight back, so a
 *              same-path replacement often gets the same number. The write time
 *              does not come back, and git writes that file once.
 *   notWrittenAfter — the instant the caller's freshness proof was taken against
 *
 * Every carried field must be re-read and must MATCH; a field the caller carried
 * and the re-read could not answer refuses, exactly as everywhere else in this
 * rule. `ino`/`dev` are exempt from that one-sidedness only where the platform
 * reports 0 for both, which is its way of saying it has no such number.
 *
 * WITHOUT an expectation nothing changes. `batch-doctor` removes ORPHANS, which by
 * definition have no branch and no registration to compare against; making the
 * check unconditional would refuse the one case that command exists for.
 *
 * `ownLock` is the lock reason the caller set on the tree ITSELF before re-reading
 * (see `cleanupWorktree`): under it, that exact reason is expected and ANY other
 * lock refuses.
 *
 * Returns { ok, reason }.
 */
export function matchesExpectation({ expected, entry, actual = null, dirty, ownLock = '' } = {}) {
  const want = expected && typeof expected === 'object' ? expected : null
  const branch = String(want?.branch ?? '').trim()
  if (!want || !branch) return { ok: true, reason: 'nothing was expected' }
  if (!entry) return { ok: false, reason: 'git no longer lists it as a worktree' }

  const has = String(entry.branch ?? '').trim()
  if (!has) return { ok: false, reason: `expected ${branch}, but it is on a detached HEAD` }
  if (has !== branch) return { ok: false, reason: `expected ${branch}, but it is on ${has}` }

  const lock = String(entry.locked ?? '').trim()
  const own = String(ownLock ?? '').trim()
  if (lock && lock !== own) return { ok: false, reason: `it is git-locked: ${lock}` }

  const got = actual && typeof actual === 'object' ? actual : {}
  const mismatch = (name, wanted, found) => {
    if (wanted === null || wanted === undefined || wanted === '') return null // not carried
    if (found === null || found === undefined || found === '') return `${name} could not be re-read`
    return String(found) === String(wanted) ? null : `${name} changed (${wanted} -> ${found})`
  }
  for (const [name, wanted, found] of [
    ['head', want.head, entry.head ?? got.head],
    ['gitLink', want.gitLink, got.gitLink],
  ]) {
    const bad = mismatch(name, wanted, found)
    if (bad) return { ok: false, reason: bad }
  }
  // THE `.git` FILE'S IDENTITY — inode, device AND the moment it was written.
  //
  // The inode ALONE is not enough, and that is measured rather than assumed
  // (11.08.2026): a worktree removed and re-added at the same path frequently gets
  // the inode back, because the filesystem had just freed it. The write TIME
  // cannot be reused that way — git writes that one-line file when it creates the
  // tree and never touches it again — so the two together identify the file. A
  // platform that reports nothing for all three has no such proof to give, and a
  // check that could not be made is not a check that passed: it is named in the
  // reason so the reader sees which proofs actually held.
  const IDENTITY = ['ino', 'dev', 'gitMtime']
  const carried = IDENTITY.map((k) => Number(want[k] ?? 0))
  const found = IDENTITY.map((k) => Number(got[k] ?? 0))
  let identity = 'no file identity on this platform'
  if (carried.some((v) => v)) {
    if (found.some((v, i) => v !== carried[i])) {
      return { ok: false, reason: 'the checkout at that path was REPLACED (its .git is a different file)' }
    }
    identity = 'same .git file'
  }

  if (dirty === true) return { ok: false, reason: 'it holds uncommitted changes' }
  if (dirty !== false) return { ok: false, reason: 'whether it holds uncommitted work could not be established' }

  const after = Number(want.notWrittenAfter ?? 0)
  if (after) {
    const at = Number(got.activeAt ?? NaN)
    if (!Number.isFinite(at)) return { ok: false, reason: 'when it was last written could not be re-read' }
    if (at > after) return { ok: false, reason: `it was written into ${Math.max(1, Math.round((at - after) / 1000))}s after the caller's proof` }
  }

  return { ok: true, reason: `still on ${branch}, ${identity}, unlocked by anyone else and clean` }
}

/**
 * THE SETUP BRANCH THAT COMES WITH AN AGENT WORKTREE. PURE.
 *
 * Creating the isolated tree `<repo>/.claude/worktrees/agent-<id>` also creates
 * a branch named after it, `worktree-agent-<id>`. The agent switches to its own
 * `feat/<point>-<slug>` within seconds, so that stub is abandoned on whatever
 * `main` pointed at when the tree was cut — and the moment `main` moves it reads
 * as "already contained in origin/main" to branch-hygiene-guard, which then
 * demands its deletion on every turn of a perfectly healthy delegation
 * (measured 10.08.2026: three agents, three findings). The stub belongs to the
 * tree, so it goes WITH the tree instead of being reported where it is found.
 *
 * Returns the branch name for an agent worktree path, or null for anything else
 * — a hand-made worktree carries no such stub and must not have a branch of its
 * own guessed at.
 */
export function stubBranchFor(target) {
  // Deliberately NOT normPath: that lowercases, and a branch name is
  // case-sensitive to git. Only the separators are normalised here.
  const p = String(target ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
  if (!p) return null
  const base = p.slice(p.lastIndexOf('/') + 1)
  return /^agent-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(base) ? `worktree-${base}` : null
}

/** The one line a refusal prints. */
export const formatRefusal = (verdict) =>
  `worktree-cleanup: REFUSED ${verdict?.path ?? '(nothing)'} — ${REFUSALS[verdict?.reason] ?? verdict?.reason}`

export { sep }
