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
 *   ino/dev/gitMtime/gitBirth — the identity of that `.git` file: a device, an
 *              inode and two timestamps. The inode alone is not enough (a
 *              filesystem hands a freed one straight back), and `gitBirth` is one
 *              more field rather than an unforgeable stamp — see the comment at
 *              the comparison itself for exactly what it is worth.
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

  // THE EXCLUSION MUST STILL BE IN PLACE — AN EMPTY LOCK IS A REFUSAL, NOT A PASS
  // (fifth review, finding 2). This used to reject only a NON-EMPTY foreign lock,
  // so the one state where the caller holds NOTHING slipped through as "unlocked,
  // fine": a concurrent stale-lock recovery clears our lock and pauses before
  // retaking it, and the deletion then proceeds with no exclusion at all. git
  // offers no way to HOLD exclusion across that gap — `worktree unlock` names no
  // lock, so a third party can always clear ours — but the deletion path closes
  // regardless: where `ownLock` says we took a lock, exactly that reason must be
  // in place, and its absence refuses as loudly as a stranger's.
  const lock = String(entry.locked ?? '')
  const own = String(ownLock ?? '')
  if (own) {
    if (!lock) {
      return {
        ok: false,
        reason:
          'the lock this cleanup took is GONE — something cleared it, so the exclusion this verification runs under no longer holds',
      }
    }
    if (lock !== own) return { ok: false, reason: `it is git-locked: ${lock}` }
  } else if (lock.trim()) {
    return { ok: false, reason: `it is git-locked: ${lock.trim()}` }
  }

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
  // THE `.git` FILE'S IDENTITY — device, inode, and two timestamps.
  //
  // The inode ALONE is not enough, and that is measured rather than assumed
  // (11.08.2026): a worktree removed and re-added at the same path frequently gets
  // the inode straight back, because the filesystem had just freed it. Git writes
  // that one-line file when it creates the tree and never touches it again, so its
  // write time distinguishes one creation from the next.
  //
  // WHAT `gitBirth` IS ACTUALLY WORTH — one more field, not an unforgeable stamp
  // (fourth review, finding B). It reads `birthtimeMs`, and Node's own contract is
  // weaker than it sounds: a filesystem without birthtime support may return the
  // ctime instead, the precision is platform-specific, and on Darwin and FreeBSD
  // `utimes` CAN move it. So it is carried as a fourth field beside device, inode
  // and mtime — where the platform keeps a real birth time it is an independent
  // creation stamp, and where it does not it duplicates another field and adds
  // nothing. Either way it can only ever make this check REFUSE more (the fields
  // are a conjunction), never less, which is why carrying it is safe without the
  // platform guaranteeing anything.
  //
  // AN ABSENT IDENTITY REFUSES (third review, finding A). This comparison used to
  // skip itself when nothing was carried and fall through to `ok: true` — the very
  // fail-open this point exists to remove, sitting in the one check that is meant
  // to prove the tree is the tree that was selected. No proof means refusal, and
  // the refusal NAMES what was unavailable so a platform that genuinely cannot
  // supply it gets an answer it can act on rather than a silent pass.
  //
  // THE RESIDUAL, STATED. These are (device, inode, two timestamps) and nothing
  // stronger: POSIX exposes no file GENERATION number through Node, so a
  // filesystem that hands back the same inode AND reproduces both timestamps to
  // the nanosecond would defeat them. That is the honest bound; it sits behind the
  // branch, HEAD and admin-record checks above and behind the lock this command
  // holds while it asks.
  const IDENTITY = ['ino', 'dev', 'gitMtime', 'gitBirth']
  const carried = IDENTITY.map((k) => Number(want[k] ?? 0))
  const found = IDENTITY.map((k) => Number(got[k] ?? 0))
  const held = IDENTITY.filter((_, i) => carried[i])
  if (!held.length) {
    return {
      ok: false,
      reason:
        'the caller carried NO file identity (no inode, device or creation time), so nothing here can tell this ' +
        'checkout from a replacement standing at the same path',
    }
  }
  const unreadable = IDENTITY.filter((k, i) => carried[i] && !found[i])
  if (unreadable.length) {
    return { ok: false, reason: `the file identity could not be re-read (${unreadable.join(', ')})` }
  }
  if (IDENTITY.some((_, i) => carried[i] && found[i] !== carried[i])) {
    return { ok: false, reason: 'the checkout at that path was REPLACED (its .git is a different file)' }
  }
  const identity = `same .git file (${held.join(', ')})`

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

// ── The lock this command holds, and how a crashed one is recovered ──────────
//
// A LOCK THAT NAMES ONLY ITSELF WEDGES THE TREE FOREVER (third review, finding B,
// and it was introduced by the fix for finding 2). Kill the process between
// `git worktree lock` and the unlink and the lock survives; every later cleanup
// then fails to acquire it and refuses, and no automation can ever remove that
// worktree again. The orderly refusal path unlocks — process death is not an
// orderly refusal.
//
// So the reason names the RUN, not the command: pid AND process start time, the
// same identity shape the batch lock uses, because a pid alone is recycled within
// hours on a busy machine and would let a stranger's process pass as the holder.
//
// THE ASYMMETRY DECIDES EVERY UNCERTAIN CASE. A stale lock is a WEDGE — annoying,
// visible, fixable by a human, and it destroys nothing. Breaking a LIVE lock
// destroys work. So only a lock this command itself wrote, whose holder is
// PROVABLY gone, is ever recovered; a foreign lock, an unparseable one, and one
// whose holder cannot be judged all stay exactly where they are and are reported.

/**
 * How this command signs the worktree lock it holds while verifying and deleting.
 * `pid`/`start` make it a RUN rather than a command name.
 *
 * THE WHOLE SIGNATURE IS MATCHED, NEVER A PREFIX (fourth review, finding A). A
 * `startsWith('worktree-cleanup')` test claimed `worktree-cleanup-helper (pid …)`
 * as ours, and a foreign lock that parses as ours becomes BREAKABLE the moment
 * its pid is absent — which is precisely the rule the asymmetry above says is
 * never bent. The writer and the reader are built from ONE template so they
 * cannot drift apart.
 */
export const CLEANUP_LOCK_BODY = 'worktree-cleanup verifying and deleting'

/** The one lock spelling this command has ever written before it carried a run
 *  identity. Recognised so its message can say how to clear it — never
 *  recoverable, because it names no process. */
export const CLEANUP_LOCK_LEGACY = 'worktree-cleanup: verifying and deleting'

const CLEANUP_LOCK_SIGNATURE = new RegExp(`^${CLEANUP_LOCK_BODY} \\(pid (\\d+) start (-?\\d+)\\)$`)

export const formatCleanupLock = ({ pid, startedAt } = {}) =>
  `${CLEANUP_LOCK_BODY} (pid ${Number(pid) || 0} start ${Number(startedAt) || 0})`

/**
 * `{ ours, pid, startedAt }` for a lock reason — `ours: false` for anything this
 * command did not write, which is never recovered. PURE.
 *
 * THE REASON IS MATCHED VERBATIM (fifth review, finding 1). This used to TRIM
 * before matching, which WIDENED the anchored signature the formatter writes: a
 * foreign lock padded with whitespace — `" worktree-cleanup verifying and deleting
 * (pid 999999 start 1) "` — then read as OURS, and a foreign lock that parses as
 * ours becomes BREAKABLE the moment its pid is absent. That is the one rule the
 * asymmetry above never bends, so the reader now matches exactly what the writer
 * emits and normalises nothing.
 *
 * THE PADDING IS REAL, measured 11.08.2026 (git 2.39.5): `git worktree lock
 * --reason` stores the reason VERBATIM in `<admin gitdir>/locked` (the file is the
 * reason plus one newline), while `git worktree list --porcelain` TRIMS it before
 * printing. Git's own trim is unavoidable, which is exactly why the callers of this
 * parser read the lock FILE rather than the porcelain — see `readLockReason` in
 * `worktree-cleanup.mjs`.
 */
export function parseCleanupLock(reason) {
  const text = String(reason ?? '')
  const m = CLEANUP_LOCK_SIGNATURE.exec(text)
  if (m) return { ours: true, pid: Number(m[1]), startedAt: Number(m[2]) }
  return { ours: text === CLEANUP_LOCK_LEGACY, pid: 0, startedAt: 0 }
}

/**
 * MAY A LOCK IN THE WAY BE BROKEN? PURE.
 *
 * `probe` is `{ exists, startedAt }` for the pid named in the lock — the same
 * shape `probePid` answers — or null when nothing probed it.
 *
 * Returns { recoverable, why }. `recoverable: true` only where the holder is
 * PROVABLY gone: the process no longer exists, or a process with that pid exists
 * whose start time is not the recorded one, which means the pid was recycled and
 * the original holder is dead. Everything else keeps the lock.
 *
 * A LOCK OF OURS THAT RECORDS NO START TIME IS RECOVERABLE BY A NARROWER RULE
 * (fifth review, finding 4). `cleanupLockReason` writes `start 0` whenever the
 * process-start probe cannot answer, and refusing every zero-start lock made a
 * crash while holding one WEDGE that worktree for good — the very failure the run
 * identity was added to end, reintroduced through its own fallback. So a
 * zero-start lock OF OURS is recoverable on the one piece of evidence that still
 * carries: the pid is PROVABLY ABSENT. It is never recovered while a process with
 * that pid exists, because without a start time a recycled pid cannot be told from
 * the original holder — that half stays wedged, visibly, and a human clears it.
 * A lock naming no pid at all (the legacy spelling) stays by-hand as before.
 */
export function staleLockVerdict({ reason, probe = null, tolerance = 5000 } = {}) {
  const text = String(reason ?? '')
  if (!text.trim()) return { recoverable: false, why: 'there is no lock reason to judge' }
  const lock = parseCleanupLock(text)
  if (!lock.ours) return { recoverable: false, why: `the lock is not this command's: ${text}` }
  if (!lock.pid) {
    return { recoverable: false, why: `this command's lock names no run (${text}) — remove it by hand once you are sure` }
  }
  if (!probe || typeof probe.exists !== 'boolean') {
    return { recoverable: false, why: `the holder of ${text} could not be judged` }
  }
  if (!lock.startedAt) {
    return probe.exists === false
      ? { recoverable: true, why: `its holder (pid ${lock.pid}) is gone — the lock recorded no start time, so an absent pid is the only thing that clears it` }
      : {
          recoverable: false,
          why: `pid ${lock.pid} exists and this lock recorded no start time, so a recycled pid cannot be told from its holder — clear it by hand once you are sure`,
        }
  }
  if (probe.exists === false) return { recoverable: true, why: `its holder (pid ${lock.pid}) is gone` }
  if (typeof probe.startedAt !== 'number') {
    return { recoverable: false, why: `pid ${lock.pid} exists and its start time could not be read` }
  }
  if (Math.abs(probe.startedAt - lock.startedAt) > tolerance) {
    return { recoverable: true, why: `pid ${lock.pid} was recycled by another process — the holder is gone` }
  }
  return { recoverable: false, why: `its holder (pid ${lock.pid}) is still running` }
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
