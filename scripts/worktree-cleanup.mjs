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
  judgeLockRelease,
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
 * WHERE GIT KEEPS THE LOCK OF ONE WORKTREE — `<admin gitdir>/locked`, the layout
 * `gitrepository-layout(5)` documents and `git worktree lock/unlock` writes and
 * unlinks. Resolved from the tree's own `.git` file, so it must be taken while the
 * tree is still THERE (the caller takes it at acquisition, not at release).
 *
 * null when the admin directory cannot be resolved; every caller then falls back
 * to git's own commands, which is wider but never wrong.
 */
export function cleanupLockFile(target) {
  try {
    const link = readIdentity(target).gitLink
    return link ? join(link, 'locked') : null
  } catch {
    return null
  }
}

/**
 * THE LOCK REASON, VERBATIM — '' when there is no lock, null when it could not be
 * read.
 *
 * READ FROM THE FILE, NOT FROM THE PORCELAIN (fifth review, finding 1). Measured
 * 11.08.2026 on git 2.39.5: `git worktree lock --reason` stores the reason exactly
 * as given, plus one newline, while `git worktree list --porcelain` TRIMS it before
 * printing. So a foreign lock padded with whitespace is INDISTINGUISHABLE from ours
 * through the porcelain and distinct in the file — and the file is what git itself
 * consults. Only git's own terminating newline is removed here; nothing else is
 * normalised, because normalising is what made a stranger's lock look like ours.
 */
export function readLockReason(file) {
  if (!file) return null
  try {
    return readFileSync(file, 'utf8').replace(/\n$/, '')
  } catch (e) {
    return e && (e.code === 'ENOENT' || e.code === 'ENOTDIR') ? '' : null
  }
}

/**
 * RELEASE ONLY OUR OWN LOCK — as narrow as git allows (fifth review, finding 3).
 *
 * THE COMPARE AND THE RELEASE ARE STILL TWO ACTS, and no primitive exists that
 * would make them one: `git worktree unlock` clears whatever lock is in place
 * without naming it, and neither git nor POSIX offers a compare-and-unlink. What
 * IS in this command's power is the WIDTH of the gap, and that is what changed:
 * the reason is read from git's lock file and the file is unlinked immediately
 * after — two syscalls in this process — where it used to be a `git worktree list
 * --porcelain` subprocess followed by a `git worktree unlock` subprocess, each
 * costing tens of milliseconds on a repository with several worktrees.
 *
 * THE RESIDUAL, STATED: a third party that clears our lock and installs its own
 * BETWEEN those two syscalls still loses its lock to this unlink. It is not
 * closed, it is roughly three orders of magnitude narrower, and the fallback path
 * below — used only when the admin directory could not be resolved — keeps the
 * old, wider window and says so.
 *
 * Returns the note to print, '' when there is nothing to say.
 */
export function releaseCleanupLock(target, { file = null, ours = '', git: runGit = git } = {}) {
  if (!String(ours ?? '')) return ''
  if (file) {
    const verdict = judgeLockRelease({ held: readLockReason(file), ours })
    if (!verdict.release) return verdict.note
    try {
      unlinkSync(file)
      return ''
    } catch (e) {
      return e && e.code === 'ENOENT' ? '' : `our own lock could not be released: ${`${(e && e.message) || e}`.split('\n')[0]}`
    }
  }
  // FALLBACK — git's own commands, with the wide window this exists to narrow.
  let held
  try {
    held = worktreeEntry(target, runGit)?.locked ?? ''
  } catch {
    held = null
  }
  const verdict = judgeLockRelease({ held, ours })
  if (!verdict.release) return verdict.note
  try {
    runGit(['worktree', 'unlock', target])
    return ''
  } catch (e) {
    return `our own lock could not be released: ${`${(e && (e.stderr || e.message)) || e}`.split('\n')[0]}`
  }
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
 * Returns { locked, reason, note, file } — `locked: false` means refuse, and
 * `file` is git's lock file for that tree, resolved while the tree still stands so
 * the release can find it afterwards.
 */
export function takeCleanupLock(target, { git: runGit = git, probe = probePid, reason = null, file = undefined } = {}) {
  const mine = reason ?? cleanupLockReason()
  // Resolved BEFORE anything is deleted, and carried out to the caller: after the
  // tree is gone there is no `.git` left to resolve it from.
  const lockFile = file === undefined ? cleanupLockFile(target) : file
  const tryLock = () => {
    try {
      runGit(['worktree', 'lock', '--reason', mine, target])
      return null
    } catch (e) {
      return `${(e && (e.stderr || e.message)) || e}`.split('\n')[0]
    }
  }
  const first = tryLock()
  if (!first) return { locked: true, reason: mine, note: '', file: lockFile }

  // WHAT IS IN THE WAY IS READ FROM GIT'S OWN LOCK FILE, VERBATIM (finding 1).
  // The porcelain trims the reason, which would let a padded copy of our signature
  // pass as ours and become breakable; the file carries what was actually written.
  // A reason we cannot read that way is a lock we cannot judge, and an unjudgeable
  // lock is never broken.
  const held = lockFile ? readLockReason(lockFile) : null
  if (!held) {
    const shown = String(worktreeEntry(target, runGit)?.locked ?? '').trim()
    return {
      locked: false,
      reason: mine,
      file: lockFile,
      note: shown
        ? `a lock is in place (${shown}) and its reason could not be read from git's own lock file, so it is left alone`
        : `the tree could not be locked: ${first}`,
    }
  }
  const verdict = staleLockVerdict({ reason: held, probe: probe(parseCleanupLock(held).pid) })
  if (!verdict.recoverable) return { locked: false, reason: mine, file: lockFile, note: `${verdict.why}` }
  try {
    runGit(['worktree', 'unlock', target])
  } catch (e) {
    return { locked: false, reason: mine, file: lockFile, note: `a dead lock could not be cleared: ${(e && e.message) || e}` }
  }
  const second = tryLock()
  // A second failure means somebody took it in between — theirs, and it stays.
  if (second) {
    return { locked: false, reason: mine, file: lockFile, note: `the lock was taken again while a dead one was cleared: ${second}` }
  }

  // AND CONFIRM THE LOCK IN PLACE IS OURS (fifth review). Two cleanups meeting the
  // same stale lock both read it before either cleared it, so both can reach this
  // line; `git worktree unlock` names no lock, so the loser cleared the winner's.
  // Whoever ends up NOT holding its own lock discovers it here — at the one moment
  // the discovery is free, before anything has been verified or deleted. Read from
  // the file for the same reason as above: a padded copy of ours is not ours.
  const nowHeld = lockFile ? readLockReason(lockFile) : String(worktreeEntry(target, runGit)?.locked ?? '')
  if (nowHeld !== mine) {
    return {
      locked: false,
      reason: mine,
      file: lockFile,
      note: `another cleanup won the race for that tree — the lock in place is ${nowHeld || 'gone'}, not ours`,
    }
  }
  return { locked: true, reason: mine, note: `cleared a dead lock — ${verdict.why}`, file: lockFile }
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
  let ourLockFile = null
  let lockNote = ''
  if (wants && exists && !dry) {
    const taken = takeCleanupLock(target, { git: runGit, probe })
    if (!taken.locked) return refuse(`could-not-take-the-lock: ${taken.note}`)
    weLocked = true
    ourLock = taken.reason
    // Taken while the tree still stands: after the removal nothing can resolve it.
    ourLockFile = taken.file ?? null
    lockNote = taken.note
  }
  // RELEASE ONLY THE LOCK WE TOOK — `releaseCleanupLock` holds the rule and the
  // residual. It happens: two cleanups meeting one stale lock both read it before
  // either cleared it, so the loser can end up releasing the winner's lock while
  // the winner is still verifying. The winner then refuses (its own
  // `matchesExpectation` sees a foreign reason, or none at all), and THAT refusal
  // must not take a third party's lock with it. Whatever is left standing is SAID,
  // because a lock nobody released is a wedge somebody has to see.
  let unlockNote = ''
  const tryUnlock = () => {
    if (!weLocked) return
    unlockNote = releaseCleanupLock(target, { file: ourLockFile, ours: ourLock, git: runGit })
  }
  const unlockOnRefusal = (reason) => {
    tryUnlock()
    return refuse(`${reason}${unlockNote ? ` [${unlockNote}]` : ''}`)
  }

  // A THROW MUST NOT LEAVE THE LOCK BEHIND. Every probe below catches its own
  // failures, so this is the belt for the one nobody predicted: without it an
  // unexpected exception would wedge the tree exactly the way a crash does, which
  // is the failure this whole lock had to be made recoverable for.
  try {
    if (wants && exists) {
      const listed = worktreeEntry(target, runGit)
      // WHERE WE HOLD A LOCK, THE FILE IS THE AUTHORITY ON WHAT IS IN PLACE. The
      // porcelain trims a lock reason (measured), so a padded copy of our own would
      // read back as ours; git's lock file carries it verbatim. `null` — the file
      // could not be read at all — is not an answer, and an unproven exclusion
      // refuses like every other unproven fact here.
      const fromFile = weLocked && ourLockFile
      const heldRaw = fromFile ? readLockReason(ourLockFile) : null
      if (fromFile && heldRaw === null) {
        return unlockOnRefusal("changed-under-cleanup: the lock this cleanup took could not be read back from git's own lock file")
      }
      const match = matchesExpectation({
        expected,
        // Without a resolvable lock file the porcelain is all there is — wider, and
        // the same fallback `releaseCleanupLock` keeps.
        entry: listed && fromFile ? { ...listed, locked: heldRaw } : listed,
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
    // UNLOCK BEFORE PRUNING, or the record outlives the tree FOREVER. `git
    // worktree prune` SKIPS a locked worktree, and `removeTreeSafely` falls back
    // to a plain delete whenever git's own removal refuses — so a fallback path
    // would leave a deleted directory with a locked administrative record that no
    // prune can ever clear. Where git's removal succeeded the lock went with it
    // and this call simply fails, which is why it ignores its own error.
    tryUnlock()
    if (!dry) tryPrune(runGit)
    const stub = removeStubBranch(target, { dry, git: runGit })
    const notes = [lockNote, unlockNote].filter(Boolean).join('; ')
    return { ok: true, verdict, detached, stub, ...(notes ? { lockNote: notes } : {}) }
  } catch (e) {
    tryUnlock()
    throw e
  }
}

function tryPrune(runGit = git) {
  try {
    runGit(['worktree', 'prune'])
  } catch {
    /* pruning is bookkeeping; a failure here never means the tree survived */
  }
}

/**
 * THE COMMAND LINE — `<path> [--dry] [--expect <json>]`. PURE, and separate from
 * the block below BECAUSE it was wrong: `indexOf` answers -1 for an absent
 * `--expect`, so an unguarded `i !== expectAt + 1` excluded index 0 — the PATH —
 * and every plain `worktree-cleanup.mjs <path>` refused with "no path was given".
 * The landing's own cleanup step is that plain call, so it failed the first time
 * it ran. Inline argument parsing is what hid it; this is testable.
 *
 * Returns `{ target, dry, expected, error }` — `error` set means refuse.
 */
export function parseCleanupArgs(argv = []) {
  const args = Array.isArray(argv) ? argv.map(String) : []
  const dry = args.includes('--dry')
  const expectAt = args.indexOf('--expect')
  let expected = null
  if (expectAt >= 0) {
    try {
      expected = JSON.parse(args[expectAt + 1] ?? '')
    } catch {
      return { target: '', dry, expected: null, error: '--expect needs the caller\'s identity record as JSON' }
    }
  }
  // The value AFTER `--expect` is the only non-flag argument that is not the path,
  // and it is skipped only when `--expect` is actually there.
  const valueAt = expectAt >= 0 ? expectAt + 1 : -1
  const target = args.filter((a, i) => !a.startsWith('--') && i !== valueAt)[0] ?? ''
  return { target, dry, expected, error: target ? '' : 'no path was given' }
}

if (isMainModule(import.meta.url)) {
  const { target, dry, expected, error } = parseCleanupArgs(process.argv.slice(2))
  if (error) {
    console.error(`worktree-cleanup: ${error}`)
    process.exit(2)
  }
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
