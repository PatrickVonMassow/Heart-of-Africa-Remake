// THE ONE WAY AN AGENT WORKTREE IS REMOVED (point 429). The decision logic is
// pure in worktree-cleanup-core.mjs; this module does the filesystem work.
//
//   node scripts/worktree-cleanup.mjs <path>        remove one worktree safely
//   node scripts/worktree-cleanup.mjs <path> --dry  say what it would do
//   node scripts/worktree-cleanup.mjs <path> --expect '<json>'
//                                                   refuse unless the checkout is
//                                                   STILL the one the caller
//                                                   selected — branch, HEAD, the
//                                                   .git file's identity, nobody
//                                                   else's lock, clean, and not
//                                                   written into since (point 629)
//
// Call this instead of `git worktree remove` and instead of `rm -rf`. Both of
// those follow the `node_modules` junction into the MAIN tree and delete the
// repository's dependencies — measured twice on 29.07.2026. The order here is
// what makes it safe: DETACH every reparse point inside the tree first (the
// link goes, its target does not), then remove the tree, then prune git's
// administrative record.
import { lstatSync, readdirSync, readlinkSync, readFileSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { REPO_ROOT } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import { worktreeActiveAt } from './batch-in-flight.mjs'
import {
  judgeTarget,
  assertInside,
  formatCleanupLock,
  matchesExpectation,
  parseCleanupLock,
  shouldDetach,
  staleLockVerdict,
  formatRefusal,
  insideRoot,
  stubBranchFor,
} from './worktree-cleanup-core.mjs'
import { probePid } from './batch-singleton.mjs'

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
export function removeTreeSafely(root, { dry = false, git: runGit = git, registered = false, weLocked = false } = {}) {
  const detached = detachLinks(root, { dry })
  if (dry) return detached
  let removed = false
  if (registered) {
    try {
      // `--force` twice ONLY where we took the lock ourselves a moment ago (see
      // `cleanupWorktree`): git refuses to remove a locked tree, and the lock in
      // the way is then our own. It is never used to override somebody else's —
      // a foreign lock refuses the removal long before this line.
      runGit(weLocked ? ['worktree', 'remove', '--force', '--force', root] : ['worktree', 'remove', '--force', root])
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

/** What `git worktree list` says about ONE path right now — { path, branch, head,
 *  locked } — or null when it lists nothing there. */
export function worktreeEntry(target, runGit = git) {
  const want = normPathOf(target)
  let cur = null
  for (const line of runGit(['worktree', 'list', '--porcelain']).split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (cur && normPathOf(cur.path) === want) return cur
      cur = { path: line.slice(9).trim(), branch: '', head: '', locked: null }
    } else if (line.startsWith('HEAD ') && cur) {
      cur.head = line.slice(5).trim()
    } else if (line.startsWith('branch ') && cur) {
      cur.branch = line.slice(7).trim().replace(/^refs\/heads\//, '')
    } else if (cur && (line === 'locked' || line.startsWith('locked '))) {
      cur.locked = line.slice(6).trim() || 'a holder that recorded no reason'
    }
  }
  return cur && normPathOf(cur.path) === want ? cur : null
}

const normPathOf = (p) =>
  String(p ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()

/** Does this checkout hold uncommitted or untracked work? null when unreadable.
 *  `--no-optional-locks` so the question does not rewrite the index it asks about;
 *  submodules deliberately NOT ignored — hidden dirty work is what this guards. */
export function checkoutDirty(path, runGit = git) {
  try {
    return runGit(['--no-optional-locks', '-C', path, 'status', '--porcelain']).trim().length > 0
  } catch {
    return null
  }
}

/**
 * DOES THIS PATH EXIST? true / false / null — tri-state, deliberately.
 *
 * `existsSync` answers false for a permission or stat error exactly as it does
 * for genuine absence (second review, finding 4), and "already gone" is a verdict
 * that SKIPS every other proof. Only ENOENT/ENOTDIR is absence; anything else is
 * "could not be established", which keeps the tree like every other unreadable
 * probe in this rule.
 */
export function pathExists(path) {
  try {
    statSync(path)
    return true
  } catch (e) {
    return e && (e.code === 'ENOENT' || e.code === 'ENOTDIR') ? false : null
  }
}

/**
 * THE IDENTITY OF THE CHECKOUT AT THIS PATH, as `matchesExpectation` wants it.
 *
 * `gitLink` is the admin gitdir its `.git` points at; `ino`/`dev` identify that
 * `.git` FILE itself, which is what a same-path replacement cannot reuse (measured
 * 11.08.2026: after `worktree remove` + `worktree add` at the same path the admin
 * gitdir is byte-identical and the inode is not). `activeAt` is the project's own
 * freshness probe, so the caller's "nothing was written after" survives into this
 * process. Every field answers null when it cannot be read, and null refuses.
 */
export function readIdentity(path) {
  const out = { gitLink: null, ino: 0, dev: 0, gitMtime: 0, gitBirth: 0, activeAt: null }
  const dot = join(path, '.git')
  try {
    const st = statSync(dot)
    out.ino = Number(st.ino ?? 0)
    out.dev = Number(st.dev ?? 0)
    out.gitMtime = Number(st.mtimeMs ?? 0)
    out.gitBirth = Number(st.birthtimeMs ?? 0)
    out.gitLink = st.isDirectory() ? dot : (readFileSync(dot, 'utf8').match(/^gitdir:\s*(.+)$/m)?.[1]?.trim() ?? null)
    if (out.gitLink && !st.isDirectory()) out.gitLink = resolve(path, out.gitLink)
  } catch {
    return out
  }
  try {
    const stamp = worktreeActiveAt(path)
    out.activeAt = typeof stamp === 'number' ? stamp : typeof stamp?.at === 'number' ? stamp.at : null
  } catch {
    /* an unreadable freshness answers null, which refuses */
  }
  return out
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

/**
 * THE REASON THIS COMMAND WRITES INTO GIT'S WORKTREE LOCK — naming the RUN.
 *
 * pid AND process start time, so a later run can tell a crashed predecessor's
 * lock from a live one (third review, finding B). Without them a process killed
 * between `worktree lock` and the unlink wedges that worktree permanently: every
 * later cleanup fails to acquire and refuses, forever.
 */
export function cleanupLockReason(pid = process.pid) {
  return formatCleanupLock({ pid, startedAt: probePid(pid)?.startedAt ?? 0 })
}

/**
 * TAKE THE LOCK, RECOVERING ONLY A PROVABLY DEAD ONE OF OUR OWN.
 *
 * The acquisition itself is the exclusion: `git worktree lock` FAILS on a tree
 * somebody already holds. On that failure the lock in the way is judged — and the
 * asymmetry decides every uncertain case, because a stale lock is a WEDGE a human
 * can clear while breaking a live one DESTROYS WORK. A foreign lock (the isolation
 * harness's, an agent's) is NEVER broken; one of ours is broken only where the
 * holder is provably gone.
 *
 * Returns { locked, reason, note } — `locked: false` means refuse.
 */
export function takeCleanupLock(target, { git: runGit = git, probe = probePid, reason = null } = {}) {
  const mine = reason ?? cleanupLockReason()
  const tryLock = () => {
    try {
      runGit(['worktree', 'lock', '--reason', mine, target])
      return null
    } catch (e) {
      return `${(e && (e.stderr || e.message)) || e}`.split('\n')[0]
    }
  }
  const first = tryLock()
  if (!first) return { locked: true, reason: mine, note: '' }

  const entry = worktreeEntry(target, runGit)
  const held = String(entry?.locked ?? '').trim()
  const verdict = staleLockVerdict({ reason: held, probe: probe(parseCleanupLock(held).pid) })
  if (!verdict.recoverable) return { locked: false, reason: mine, note: `${verdict.why}` }
  try {
    runGit(['worktree', 'unlock', target])
  } catch (e) {
    return { locked: false, reason: mine, note: `a dead lock could not be cleared: ${(e && e.message) || e}` }
  }
  const second = tryLock()
  // A second failure means somebody took it in between — theirs, and it stays.
  return second
    ? { locked: false, reason: mine, note: `the lock was taken again while a dead one was cleared: ${second}` }
    : { locked: true, reason: mine, note: `cleared a dead lock — ${verdict.why}` }
}

/**
 * THE LAST RE-PROOF, INSIDE THE PROCESS THAT DELETES (point 629) — AND ITS
 * RESIDUAL WINDOW, WHICH IS NOT CLOSED.
 *
 * WHAT IS CLOSED. git's worktree LOCK is a real mutual-exclusion primitive:
 * `git worktree lock` FAILS on an already-locked tree (measured 11.08.2026 —
 * "fatal: … is already locked"). So this command TAKES the lock first, and only
 * then re-reads the tree. Everything that respects the lock — the isolation
 * harness, which locks a tree while an agent holds it, and every git command that
 * refuses a locked worktree — cannot enter after that point. A tree already held
 * by somebody else fails the acquisition and is refused, so the foreign-lock check
 * and the exclusion are the same atomic act rather than two.
 *
 * WHAT IS NOT, AND MUST NOT BE DESCRIBED AS CLOSED (second review, finding 2).
 * git offers no compare-and-delete: between taking the lock, reading the entry,
 * reading the dirtiness, reading the identity and unlinking the tree, several
 * separate syscalls pass. A writer that does NOT consult the lock — a stray
 * process writing files into the checkout, an editor saving on a timer — is not
 * excluded by any of it. The residual is therefore: a write that (a) ignores git's
 * lock, (b) lands after the last of these reads, and (c) is not visible in them.
 * It is bounded by the few milliseconds between the reads and the unlink, and it
 * is the smallest this design can make it without a primitive git does not have.
 */
export function cleanupWorktree(target, { dry = false, git: runGit = git, expected = null, probe = probePid } = {}) {
  const worktrees = listWorktrees(runGit)
  const verdict = judgeTarget({ target, mainRoot: worktrees[0] ?? REPO_ROOT, worktrees })
  if (!verdict.ok) return { ok: false, verdict, detached: [] }
  const refuse = (reason) => ({ ok: false, verdict: { ...verdict, ok: false, reason }, detached: [] })

  const exists = pathExists(target)
  if (exists === null) return refuse('unreadable-path: whether anything is at that path could not be established')

  const wants = expected && typeof expected === 'object' && String(expected.branch ?? '').trim()
  let weLocked = false
  let ourLock = ''
  let lockNote = ''
  if (wants && exists && !dry) {
    const taken = takeCleanupLock(target, { git: runGit, probe })
    if (!taken.locked) return refuse(`could-not-take-the-lock: ${taken.note}`)
    weLocked = true
    ourLock = taken.reason
    lockNote = taken.note
  }
  const unlockOnRefusal = (reason) => {
    if (weLocked) {
      try {
        runGit(['worktree', 'unlock', target])
      } catch {
        /* the tree stays locked and is reported; that is the safe direction */
      }
    }
    return refuse(reason)
  }

  if (wants && exists) {
    const match = matchesExpectation({
      expected,
      entry: worktreeEntry(target, runGit),
      actual: readIdentity(target),
      dirty: checkoutDirty(target, runGit),
      ownLock: weLocked ? ourLock : '',
    })
    if (!match.ok) return unlockOnRefusal(`changed-under-cleanup: ${match.reason}`)
  }

  if (exists === false) {
    if (!dry) tryPrune(runGit)
    // The stub outlives a half-finished removal too — that is exactly the state
    // the guard used to find and report.
    const stub = removeStubBranch(target, { dry, git: runGit })
    return { ok: true, verdict, detached: [], stub, note: "already gone — only git's record was pruned" }
  }
  const detached = removeTreeSafely(target, {
    dry,
    git: runGit,
    registered: verdict.reason === 'registered',
    weLocked,
  })
  if (!dry) tryPrune(runGit)
  const stub = removeStubBranch(target, { dry, git: runGit })
  return { ok: true, verdict, detached, stub, ...(lockNote ? { lockNote } : {}) }
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
  const expectAt = args.indexOf('--expect')
  let expected = null
  if (expectAt >= 0) {
    try {
      expected = JSON.parse(args[expectAt + 1] ?? '')
    } catch {
      console.error('worktree-cleanup: --expect needs the caller\'s identity record as JSON')
      process.exit(2)
    }
  }
  const target = args.filter((a, i) => !a.startsWith('--') && i !== expectAt + 1)[0]
  try {
    const result = cleanupWorktree(target, { dry, expected })
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
