// THE TORN STATES A KILL LEAVES BEHIND (point 443) — the filesystem half.
//
// Point 442 made the repair run BEFORE the successor rather than after the
// damage. This is the other direction: what the doctor is able to see at all. A
// session killed mid-action leaves more behind than a half merge — a lock file no
// git process holds, a worktree git no longer knows, a headless browser eating a
// core for the rest of a fortnight, a truncated work order, a lock reserving the
// batch for a process that is gone, a board the phone reader sees standing still.
//
// THE PRINCIPLE (docs/batch-autonomy.md): every critical action is a transaction
// with an idempotent cleanup step, and that step runs at every start BEFORE any
// work — never "the session remembers to".
//
// The DECISIONS are pure in scripts/batch-doctor-core.mjs (`planRemediation`);
// this module gathers the facts and executes the plan. Everything here takes its
// repository root and its `git` runner as a PARAMETER, so the Vitest layer drives
// each state on a throwaway repository rather than on this one
// (scripts/batch-doctor-states.test.mjs).
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { normPath } from './worktree-cleanup-core.mjs'
import { cleanupWorktree } from './worktree-cleanup.mjs'
import { strayProcesses, STRAY_KIND } from './verify/machine-load-core.mjs'
import { MANDATE_MAX_AGE_MS, mandateMarkerVerdict } from './batch-doctor-core.mjs'

/** A git runner bound to one checkout. Injectable everywhere below. */
export const gitIn =
  (cwd) =>
  (args, opts = {}) =>
    execFileSync('git', args, {
      windowsHide: true,
      cwd,
      encoding: 'utf8',
      timeout: opts.timeout ?? 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    }).trim()

// ---------------------------------------------------------------------------
// (a) STALE GIT LOCKS — a killed commit or push
// ---------------------------------------------------------------------------
//
// `index.lock` is git's write mutex; `refs/**/*.lock` and `packed-refs.lock` are
// what a killed push leaves. None of them is cleaned up by the process that dies,
// and while one lies there EVERY git write is refused — including the doctor's own
// repairs, which is why this action is planned first.
//
// AGE IS THE PROOF, and it is generous. A live `git commit` holds the index lock
// for well under a second; ten minutes is beyond any honest hold and short enough
// that an unattended run is not blocked for an hour. A lock younger than that is
// left alone: taking one from a running git corrupts the very thing this repairs.

export const GIT_LOCK_STALE_MS = 10 * 60 * 1000

/** The lock files a killed git leaves, with their age. Never throws. */
export function findStaleGitLocks({ gitDir, now = Date.now(), staleMs = GIT_LOCK_STALE_MS } = {}) {
  const root = gitDir ? resolve(gitDir) : null
  if (!root || !existsSync(root)) return []
  const candidates = [join(root, 'index.lock'), join(root, 'packed-refs.lock'), ...walkLocks(join(root, 'refs'))]
  const out = []
  for (const path of candidates) {
    let age
    try {
      age = now - statSync(path).mtimeMs
    } catch {
      continue // gone between the listing and the stat: nothing to repair
    }
    if (age >= staleMs) out.push({ path, ageMs: age })
  }
  return out
}

function walkLocks(dir) {
  const out = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) out.push(...walkLocks(full))
    else if (e.name.endsWith('.lock')) out.push(full)
  }
  return out
}

/** Remove them. IDEMPOTENT: a path already gone is a silent success. */
export function clearStaleGitLocks(locks = []) {
  const removed = []
  for (const l of locks) {
    const path = typeof l === 'string' ? l : l?.path
    if (!path) continue
    try {
      rmSync(path, { force: true })
      removed.push(path)
    } catch {
      /* held by something after all — the caller reports the remaining finding */
    }
  }
  return removed
}

// ---------------------------------------------------------------------------
// (b) WORKTREES — half-registered, and directories git no longer knows
// ---------------------------------------------------------------------------
//
// Six were lying around on 30.07.2026, four of them from the previous night. They
// come in two shapes and only one of them is bookkeeping:
//   - git lists a worktree whose DIRECTORY is gone  → `git worktree prune`, safe.
//   - a directory under .claude/worktrees/ that git does NOT list → a real
//     deletion, and it goes through scripts/worktree-cleanup.mjs, which detaches
//     the node_modules junction first (without that order the removal takes the
//     MAIN tree's dependencies with it — measured twice on 29.07.2026).
//
// AN IDLE WINDOW GUARDS THE SECOND. A delegated agent's worktree IS registered, so
// it can never be an orphan — but a registration that has not landed yet, or a
// tree being created right now, would be. A directory written within the last hour
// is therefore left alone; the debris this clears is by definition older.

export const WORKTREE_IDLE_MS = 60 * 60 * 1000

/** Every path `git worktree list` knows, main checkout first. [] when git fails. */
export function listWorktreePaths(git) {
  try {
    return git(['worktree', 'list', '--porcelain'])
      .split(/\r?\n/)
      .filter((l) => l.startsWith('worktree '))
      .map((l) => l.slice(9).trim())
  } catch {
    return []
  }
}

/** Both spellings of a path — git and the filesystem disagree about Windows
 *  short names and junctions, and a registered worktree read as an orphan would
 *  be DELETED. Absent evidence, the literal path is the only spelling. */
function bothSpellings(p) {
  const out = [normPath(p)]
  try {
    out.push(normPath(realpathSync.native ? realpathSync.native(p) : realpathSync(p)))
  } catch {
    /* the path may not exist — its literal spelling is still an answer */
  }
  return out
}

/** `{ pruneNeeded, orphanDirs }` — the two shapes above. Never throws. */
export function findWorktreeTrouble({ repo, git, now = Date.now(), idleMs = WORKTREE_IDLE_MS } = {}) {
  const listed = listWorktreePaths(git)
  const pruneNeeded = listed.slice(1).some((p) => !existsSync(p))
  const known = new Set(listed.flatMap(bothSpellings))
  const dir = join(repo, '.claude', 'worktrees')
  const orphanDirs = []
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return { pruneNeeded, orphanDirs }
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const full = join(dir, e.name)
    if (bothSpellings(full).some((s) => known.has(s))) continue
    let age
    try {
      age = now - statSync(full).mtimeMs
    } catch {
      continue
    }
    if (age >= idleMs) orphanDirs.push(full)
  }
  return { pruneNeeded, orphanDirs }
}

/** Bookkeeping only. IDEMPOTENT by git's own definition. */
export function pruneWorktrees(git) {
  git(['worktree', 'prune'])
}

/** Remove the orphans through the ONE safe remover. IDEMPOTENT: a directory
 *  already gone leaves only git's record to prune, which `cleanupWorktree`
 *  handles and reports as such. */
export function removeOrphanWorktrees(dirs = [], { git } = {}) {
  const removed = []
  for (const d of dirs) {
    const result = cleanupWorktree(d, { git })
    if (result.ok) removed.push(d)
  }
  return removed
}

// ---------------------------------------------------------------------------
// (c) ORPHANED VERIFICATION PROCESSES
// ---------------------------------------------------------------------------
//
// An aborted verify run leaves a headless browser and a dev server behind. They
// hold the ports the next run needs and eat CPU for the rest of the absence — the
// same class that cost four unit-test timeouts on 28.07.2026, only unattended.
//
// MATCHED BY COMMAND LINE, NEVER BY NAME. `classifyProcess` (verify/machine-load-
// core.mjs) is the shared matcher, and `fromThisRepo` narrows it to leftovers of
// THIS checkout: a stranger's chrome is neither ours to kill nor usually the
// cause. The sweep is additionally gated on there being no live session that could
// own them — that condition lives in the pure planner.

/** What a verification leaves running. A build or a vitest run is deliberately
 *  absent: those are short-lived and a gate may legitimately be running one. */
export const KILLABLE_STRAY_KINDS = new Set([STRAY_KIND.verifyRun, STRAY_KIND.browser, STRAY_KIND.devServer])

/**
 * The leftovers of this checkout's aborted verification. `processes` is the
 * `{ pid, ppid, name, cmd }` table (injectable — the tests hand one in rather
 * than reading the machine).
 */
export function findStrayVerifyProcesses({ processes = [], pid = process.pid, repoMarker = '' } = {}) {
  return strayProcesses({ processes, pid, repoMarker })
    .filter((s) => s.fromThisRepo && KILLABLE_STRAY_KINDS.has(s.kind))
    .map((s) => ({ pid: s.pid, kind: s.kind, cmd: s.cmd }))
}

/** Kill them. IDEMPOTENT: a pid already gone throws and is counted as done. */
export function killStrayProcesses(strays = [], { kill = (p) => process.kill(p) } = {}) {
  const killed = []
  for (const s of strays) {
    const pid = typeof s === 'number' ? s : s?.pid
    if (!Number.isFinite(pid) || pid <= 0) continue
    try {
      kill(pid)
    } catch {
      /* already gone — the state this action exists to reach */
    }
    killed.push(pid)
  }
  return killed
}

// ---------------------------------------------------------------------------
// (d) A TRUNCATED WORK ORDER
// ---------------------------------------------------------------------------
//
// `tasksParses` has detected this since the doctor was written, and nothing
// repaired it — yet TASKS.md is VERSIONED, so HEAD holds the last good copy. The
// damaged bytes are kept aside under .claude/ before the restore: this must never
// be the mechanism that silently throws away a real edit, and a house rule of this
// repository is precisely never to `git checkout` over uncommitted work.

/** The doctor's parse rule, shared so the wrapper and the repair cannot drift.
 *  A file with no checkboxes at all still parses — the format alarm is about
 *  checkboxes that no longer read as points. */
export function tasksTextParses(text) {
  if (typeof text !== 'string') return false
  const sawCheckbox = /^- \[/m.test(text)
  return !sawCheckbox || /^- \[[ x]\] \d+\./m.test(text)
}

/** Does HEAD carry a parseable TASKS.md? False when git cannot answer. */
export function tasksRecoverableFromHead({ git } = {}) {
  try {
    return tasksTextParses(git(['show', 'HEAD:TASKS.md']))
  } catch {
    return false
  }
}

/**
 * Restore it, keeping the damaged bytes. Returns `{ restored, backup }`.
 * IDEMPOTENT: a working copy that already parses is left untouched and reports
 * `restored: false`, so a second run neither rewrites the file nor writes a
 * second backup.
 */
export function restoreTasksFromHead({ repo, git, now = Date.now() } = {}) {
  const path = join(repo, 'TASKS.md')
  let current = null
  try {
    current = readFileSync(path, 'utf8')
  } catch {
    /* missing entirely — the restore below is still the repair */
  }
  if (current !== null && tasksTextParses(current)) return { restored: false, backup: null }
  const good = git(['show', 'HEAD:TASKS.md'])
  if (!tasksTextParses(good)) return { restored: false, backup: null }
  let backup = null
  if (current !== null) {
    const dir = join(repo, '.claude')
    mkdirSync(dir, { recursive: true })
    backup = join(dir, `tasks-damaged-${new Date(now).toISOString().replace(/[:.]/g, '-')}.md`)
    writeFileSync(backup, current)
  }
  // `git show` + write, never `git checkout -- TASKS.md`: the index stays exactly
  // as the interrupted session left it, and nothing else is touched.
  writeFileSync(path, good.endsWith('\n') ? good : `${good}\n`)
  return { restored: true, backup }
}

// ---------------------------------------------------------------------------
// (e) A STALE PENDING-SPAWN LOCK
// ---------------------------------------------------------------------------
//
// The launcher wins a `pending-spawn` lock, spawns, and the spawned session
// converts that lock to itself. A session killed in between leaves the lock
// standing, and from then on every tick reads the batch as reserved and spawns
// nothing — the batch stands still for as long as nobody looks.
//
// TWO PROOFS, NOT ONE: past its own stale window AND the recorded process gone.
// The window alone would race a slow but healthy spawn.

export const PENDING_LOCK_STALE_MS = 10 * 60 * 1000

/** `{ sessionId, ageMs, pid }` for a stale pending-spawn lock, else null. */
export function findStalePendingSpawn({ lockPath, now = Date.now(), staleMs = PENDING_LOCK_STALE_MS, probe } = {}) {
  let lock
  try {
    lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  } catch {
    return null
  }
  if (!lock || lock.kind !== 'pending-spawn' || typeof lock.claimedAt !== 'number') return null
  const ageMs = now - lock.claimedAt
  if (ageMs < staleMs) return null
  const pid = Number.isFinite(lock.spawnedPid) ? lock.spawnedPid : Number.isFinite(lock.pid) ? lock.pid : null
  // No pid recorded at all: the age is the only bound such a lock ever had, and it
  // is past it. A pid that still exists means the spawn is merely slow.
  if (pid !== null && probe && probe(pid)?.exists === true) return null
  return { sessionId: String(lock.sessionId ?? 'unknown'), ageMs, pid }
}

/** Remove it. IDEMPOTENT: an absent lock is a silent success. */
export function clearStalePendingSpawn({ lockPath } = {}) {
  rmSync(lockPath, { force: true })
  return true
}

// ---------------------------------------------------------------------------
// (f) A HALF-PUBLISHED BOARD
// ---------------------------------------------------------------------------
//
// The board is the ONE thing the user can see while away, and a publish that died
// between the local edit and the push leaves it standing still with nothing saying
// so. The detection is deliberately LOCAL — no network, no fetch in a launcher
// tick: `board-publish.mjs` records the sha256 of the bytes it published
// (`pagesPublishedHash`) and persists a failure (`publishFailed`), so a local file
// whose hash differs from the recorded one IS the half-published state.

const sha256 = (text) => createHash('sha256').update(Buffer.from(text)).digest('hex')

/** `{ reason }` when the published board is behind the local one, else null. */
export function findBoardBehind({ repo } = {}) {
  let state
  try {
    state = JSON.parse(readFileSync(join(repo, '.claude', 'dashboard-state.json'), 'utf8'))
  } catch {
    return null // no state at all: nothing has ever been published from here
  }
  const boardPath = resolve(repo, state?.dashboardPath ?? '.batch-dashboard.html')
  let local
  try {
    local = readFileSync(boardPath, 'utf8')
  } catch {
    return null // no board file: not this repair's business
  }
  if (state?.publishFailed?.reason) return { reason: `the last publish FAILED — ${state.publishFailed.reason}` }
  const published = state?.pagesPublishedHash ?? state?.publishedHash ?? null
  if (!published) return { reason: 'no publish has ever been recorded for this board' }
  if (published !== sha256(local)) return { reason: 'the local board differs from the bytes last published' }
  return null
}

/** Re-run the transport. IDEMPOTENT: publishing an already-published board is a
 *  no-op push of identical bytes. */
export function republishBoard({ repo, run = defaultRun } = {}) {
  run(process.execPath, [join(repo, 'scripts', 'board-publish.mjs')], repo)
  return true
}

const defaultRun = (exe, args, cwd) =>
  execFileSync(exe, args, { windowsHide: true, cwd, encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] })

// ---------------------------------------------------------------------------
// (h) THE MANDATE MARKER — one-shot, expiring, and cleared by a clean tick
// ---------------------------------------------------------------------------
//
// The launcher's doctor verdict, left for the session it spawns seconds later so
// that the common case costs nothing. The rule is pure in batch-doctor-core.mjs
// (`mandateMarkerVerdict`); these three lines are the wiring that carried it
// untested until point 443.

/** Read AND DELETE the marker, readable or not. The deletion happens BEFORE the
 *  parse: a corrupt marker used to throw past it and be re-parsed at every
 *  session start for ever. One-shot means one-shot. */
export function consumeMandateMarker({ path, now = Date.now(), maxAgeMs = MANDATE_MAX_AGE_MS } = {}) {
  let raw = null
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return mandateMarkerVerdict({ raw: null, now, maxAgeMs })
  }
  rmSync(path, { force: true })
  return mandateMarkerVerdict({ raw, now, maxAgeMs })
}

/** What the launcher leaves behind when the tree it checked was not clean.
 *  Written atomically (tmp + rename), so a reader can never see half a marker. */
export function writeMandateMarker({ path, at = Date.now(), code = null, reason = '' } = {}) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, `${JSON.stringify({ at, code, reason }, null, 2)}\n`)
  renameSync(tmp, path)
  return path
}

/** What a CLEAN tick does, so a marker from a failed earlier tick can never hand
 *  a healthy successor a false "repo not clean". IDEMPOTENT. */
export function clearMandateMarker({ path } = {}) {
  rmSync(path, { force: true })
  return true
}
