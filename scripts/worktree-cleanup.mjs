// THE ONE WAY AN AGENT WORKTREE IS REMOVED (point 429). The decision logic is
// pure in worktree-cleanup-core.mjs; this module does the filesystem work.
//
//   node scripts/worktree-cleanup.mjs <path>        remove one worktree safely
//   node scripts/worktree-cleanup.mjs <path> --dry  say what it would do
//
// Call this instead of `git worktree remove` and instead of `rm -rf`. Both of
// those follow the `node_modules` junction into the MAIN tree and delete the
// repository's dependencies — measured twice on 29.07.2026. The order here is
// what makes it safe: DETACH every reparse point inside the tree first (the
// link goes, its target does not), then remove the tree, then prune git's
// administrative record.
import { lstatSync, readdirSync, readlinkSync, rmSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { REPO_ROOT } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { judgeTarget, assertInside, shouldDetach, formatRefusal, insideRoot, stubBranchFor } from './worktree-cleanup-core.mjs'

/**
 * lstat as the pure rule wants to see it.
 *
 * Node reports a Windows JUNCTION as `isSymbolicLink() === true` (verified
 * 29.07.2026 against the surviving `node_modules` junction), so the first flag
 * carries the real case. The second is the backstop for the shape that would
 * have made the whole incident invisible — an entry that still reads as a plain
 * DIRECTORY while `readlink` succeeds on it. A door out of the tree that lstat
 * declines to flag is exactly what a recursive delete walks through.
 */
export function describeEntry(path) {
  const st = lstatSync(path)
  const link = st.isSymbolicLink()
  return {
    path,
    isSymbolicLink: link,
    isJunction: !link && st.isDirectory() && readlinkable(path),
    isDirectory: st.isDirectory(),
  }
}

function readlinkable(path) {
  try {
    return typeof readlinkSync(path) === 'string'
  } catch {
    return false
  }
}

/**
 * Remove every link INSIDE `root` without following one. Returns the paths that
 * were detached, so the caller can say what it did.
 *
 * `rmSync` on a junction removes the junction itself on Windows — but only when
 * it is targeted directly, which is precisely what a RECURSIVE delete of the
 * parent does not do. Hence the walk.
 */
export function detachLinks(root, { dry = false } = {}) {
  const detached = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      return // unreadable directory: nothing to detach in it
    }
    for (const name of entries) {
      const full = join(dir, name)
      let info
      try {
        info = describeEntry(full)
      } catch {
        continue
      }
      if (shouldDetach(info)) {
        // The assertion the two incidents did not have: never touch anything
        // that is not strictly inside the tree being removed.
        assertInside(full, root)
        let target = null
        try {
          target = readlinkSync(full)
        } catch {
          /* a link whose target cannot be read is still a link to detach */
        }
        detached.push({ path: full, target })
        if (!dry) {
          // Remove the LINK, never its contents. `rmSync` without `recursive`
          // refuses a real directory and unlinks a junction, which is exactly
          // the distinction wanted; `unlinkSync` covers a file symlink.
          try {
            rmSync(full, { recursive: false, force: true })
          } catch {
            unlinkSync(full)
          }
        }
        continue // NEVER descend through a link
      }
      if (info.isDirectory) walk(full)
    }
  }
  walk(root)
  return detached
}

/**
 * DETACH, THEN REMOVE — the whole fix, in that order.
 *
 * The removal itself is still git's (`git worktree remove --force`), because
 * git also has an administrative record to clear; it is only ever reached once
 * the tree holds no doors out of itself. Measured 29.07.2026 on a throwaway
 * repository: with the junction in place that command deletes the MAIN tree's
 * `node_modules` contents, and with the junction detached first it does not.
 * `rmSync` is the fallback for an ORPHAN git no longer lists, and for a git
 * that refuses.
 *
 * Exported so the Vitest case can drive exactly this path.
 */
export function removeTreeSafely(root, { dry = false, git: runGit = git, registered = false } = {}) {
  const detached = detachLinks(root, { dry })
  if (dry) return detached
  let removed = false
  if (registered) {
    try {
      runGit(['worktree', 'remove', '--force', root])
      removed = true
    } catch {
      /* a dirty or already-half-gone tree: fall through to the plain delete */
    }
  }
  if (!removed) rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  return detached
}

function git(args, cwd = REPO_ROOT) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
}

/** Every path `git worktree list` knows, main checkout first. */
export function listWorktrees(runGit = git) {
  return runGit(['worktree', 'list', '--porcelain'])
    .split(/\r?\n/)
    .filter((l) => l.startsWith('worktree '))
    .map((l) => l.slice(9).trim())
}

/**
 * THE STUB BRANCH GOES WITH THE TREE (point 613).
 *
 * Called only once the worktree is gone and git's record pruned — git holds on
 * to a branch a tree has checked out. `-d`, never `-D`: a stub that somehow
 * carries commits of its own is WORK, and work is not debris; git refusing it
 * is the right answer, reported rather than forced.
 *
 * Returns null when the path names no agent worktree or the branch does not
 * exist, else `{ branch, deleted, reason? }`.
 */
export function removeStubBranch(target, { dry = false, git: runGit = git } = {}) {
  const branch = stubBranchFor(target)
  if (!branch) return null
  try {
    runGit(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])
  } catch {
    return null // no such branch — nothing was left behind
  }
  if (dry) return { branch, deleted: false, reason: 'dry' }
  try {
    runGit(['branch', '-d', branch])
    return { branch, deleted: true }
  } catch (e) {
    return { branch, deleted: false, reason: (e && e.message) || 'git refused the deletion' }
  }
}

/** The whole operation: judge, detach, remove, prune, drop the stub branch.
 *  Returns a report. `git` is injectable so the Vitest case can run it against
 *  a throwaway repository instead of this one. */
export function cleanupWorktree(target, { dry = false, git: runGit = git } = {}) {
  const worktrees = listWorktrees(runGit)
  const verdict = judgeTarget({ target, mainRoot: worktrees[0] ?? REPO_ROOT, worktrees })
  if (!verdict.ok) return { ok: false, verdict, detached: [] }
  if (!existsSync(target)) {
    if (!dry) tryPrune(runGit)
    // The stub outlives a half-finished removal too — that is exactly the state
    // the guard used to find and report.
    const stub = removeStubBranch(target, { dry, git: runGit })
    return { ok: true, verdict, detached: [], stub, note: "already gone — only git's record was pruned" }
  }
  const detached = removeTreeSafely(target, { dry, git: runGit, registered: verdict.reason === 'registered' })
  if (!dry) tryPrune(runGit)
  const stub = removeStubBranch(target, { dry, git: runGit })
  return { ok: true, verdict, detached, stub }
}

function tryPrune(runGit = git) {
  try {
    runGit(['worktree', 'prune'])
  } catch {
    /* pruning is bookkeeping; a failure here never means the tree survived */
  }
}

if (isMainModule(import.meta.url)) {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const target = args.find((a) => !a.startsWith('--'))
  try {
    const result = cleanupWorktree(target, { dry })
    if (!result.ok) {
      console.error(formatRefusal(result.verdict))
      process.exit(2)
    }
    for (const d of result.detached) {
      console.log(`${dry ? 'would detach' : 'detached'} link ${d.path}${d.target ? ` -> ${d.target}` : ''} (target untouched)`)
    }
    console.log(
      result.note ??
        `${dry ? 'would remove' : 'removed'} worktree ${result.verdict.path} (${result.detached.length} link(s) detached first)`,
    )
    if (result.stub) {
      console.log(
        result.stub.deleted
          ? `deleted setup branch ${result.stub.branch} (it belongs to that worktree)`
          : dry
            ? `would delete setup branch ${result.stub.branch}`
            : `setup branch ${result.stub.branch} KEPT — git refused: ${result.stub.reason}`,
      )
    }
    process.exit(0)
  } catch (e) {
    console.error(`worktree-cleanup failed: ${e && e.message}`)
    process.exit(1)
  }
}

export { insideRoot }
