// THE TORN STATES A KILL LEAVES BEHIND (point 443) — each one detected AND
// repaired on a THROWAWAY repository, and each repair run TWICE.
//
// Idempotence is the property that matters here, because the principle these
// states serve is "every critical action is a transaction with an idempotent
// cleanup step, and that step runs at every start BEFORE any work". A cleanup
// that is only safe the first time is not a cleanup a launcher may run at every
// tick — so every case below repairs, re-detects (which must find nothing) and
// repairs a second time (which must not throw and must change nothing).
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  GIT_LOCK_STALE_MS,
  KILLABLE_STRAY_KINDS,
  PENDING_LOCK_STALE_MS,
  WORKTREE_IDLE_MS,
  clearMandateMarker,
  clearStaleGitLocks,
  clearStalePendingSpawn,
  consumeMandateMarker,
  findBoardBehind,
  findStaleGitLocks,
  findStalePendingSpawn,
  findStrayVerifyProcesses,
  findWorktreeTrouble,
  gitIn,
  killStrayProcesses,
  listWorktreePaths,
  pruneWorktrees,
  removeOrphanWorktrees,
  republishBoard,
  restoreTasksFromHead,
  tasksRecoverableFromHead,
  tasksTextParses,
  writeMandateMarker,
} from './batch-doctor-states.mjs'

const NOW = 1_800_000_000_000
let tmp
let repo
let git

/** Backdate a path so an age-gated check reads it as old. */
const backdate = (path, ageMs) => {
  const t = new Date(NOW - ageMs)
  utimesSync(path, t, t)
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'hoa-doctor-states-'))
  repo = join(tmp, 'main')
  mkdirSync(join(repo, '.claude'), { recursive: true })
  git = gitIn(repo)
  git(['init', '-q', '-b', 'main'])
  git(['config', 'user.email', 'test@example.invalid'])
  git(['config', 'user.name', 'test'])
  writeFileSync(join(repo, 'TASKS.md'), '# Work order\n\n- [x] 1. done\n- [ ] 2. open\n')
  git(['add', '-A'])
  git(['commit', '-qm', 'init'])
})

afterEach(() => {
  try {
    rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    /* Windows may still hold a handle; the temp directory is disposable */
  }
})

const gitDir = () => join(repo, '.git')

// ---------------------------------------------------------------------------
// (a) stale .git locks
// ---------------------------------------------------------------------------
describe('(a) stale git locks from a killed commit or push', () => {
  it('DETECTS index.lock, a ref lock and packed-refs.lock — and leaves a FRESH one alone', () => {
    const index = join(gitDir(), 'index.lock')
    const ref = join(gitDir(), 'refs', 'heads', 'main.lock')
    const packed = join(gitDir(), 'packed-refs.lock')
    const fresh = join(gitDir(), 'refs', 'heads', 'busy.lock')
    mkdirSync(join(gitDir(), 'refs', 'heads'), { recursive: true })
    for (const p of [index, ref, packed, fresh]) writeFileSync(p, '')
    for (const p of [index, ref, packed]) backdate(p, GIT_LOCK_STALE_MS + 60_000)
    backdate(fresh, 1000) // a git process holding it RIGHT NOW

    const found = findStaleGitLocks({ gitDir: gitDir(), now: NOW })
    expect(found.map((f) => f.path).sort()).toEqual([index, packed, ref].sort())
    expect(found.map((f) => f.path)).not.toContain(fresh)
  })

  it('REPAIRS them, and the repair is IDEMPOTENT', () => {
    const index = join(gitDir(), 'index.lock')
    writeFileSync(index, '')
    backdate(index, GIT_LOCK_STALE_MS * 2)
    const first = findStaleGitLocks({ gitDir: gitDir(), now: NOW })
    expect(clearStaleGitLocks(first)).toEqual([index])
    expect(existsSync(index)).toBe(false)

    // Second run: nothing left to find, and repairing nothing does not throw.
    expect(findStaleGitLocks({ gitDir: gitDir(), now: NOW })).toEqual([])
    expect(() => clearStaleGitLocks(first)).not.toThrow()
    expect(existsSync(index)).toBe(false)
  })

  it('a git write SUCCEEDS again once the lock is cleared — the point of clearing it', () => {
    const index = join(gitDir(), 'index.lock')
    writeFileSync(index, '')
    backdate(index, GIT_LOCK_STALE_MS * 2)
    writeFileSync(join(repo, 'b.txt'), 'b')
    expect(() => git(['add', '-A'])).toThrow()
    clearStaleGitLocks(findStaleGitLocks({ gitDir: gitDir(), now: NOW }))
    expect(() => git(['add', '-A'])).not.toThrow()
  })

  it('says nothing about a repository with no locks at all, and never throws on a missing git dir', () => {
    expect(findStaleGitLocks({ gitDir: gitDir(), now: NOW })).toEqual([])
    expect(findStaleGitLocks({ gitDir: join(tmp, 'nowhere') })).toEqual([])
    expect(findStaleGitLocks()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// (b) worktrees: half-registered, and directories git no longer knows
// ---------------------------------------------------------------------------
describe('(b) worktrees git no longer knows', () => {
  it('DETECTS a registration whose directory is gone → prune, and the prune clears it', () => {
    const wt = join(tmp, 'gone')
    git(['worktree', 'add', '-q', '-b', 'feat/gone', wt])
    rmSync(wt, { recursive: true, force: true })
    expect(findWorktreeTrouble({ repo, git, now: NOW }).pruneNeeded).toBe(true)

    pruneWorktrees(git)
    expect(findWorktreeTrouble({ repo, git, now: NOW }).pruneNeeded).toBe(false)
    // IDEMPOTENT: git's own prune is a no-op on an already-pruned repository.
    expect(() => pruneWorktrees(git)).not.toThrow()
    expect(findWorktreeTrouble({ repo, git, now: NOW }).pruneNeeded).toBe(false)
  })

  it('DETECTS an idle orphan directory under .claude/worktrees/ — and spares a fresh one', () => {
    const orphan = join(repo, '.claude', 'worktrees', 'agent-dead')
    const fresh = join(repo, '.claude', 'worktrees', 'agent-being-created')
    mkdirSync(orphan, { recursive: true })
    mkdirSync(fresh, { recursive: true })
    writeFileSync(join(orphan, 'leftover.txt'), 'what four of six were on 30.07.2026')
    backdate(orphan, WORKTREE_IDLE_MS * 2)
    backdate(fresh, 1000)

    const found = findWorktreeTrouble({ repo, git, now: NOW })
    expect(found.orphanDirs).toEqual([orphan])
  })

  it('never calls a REGISTERED worktree an orphan, even under .claude/worktrees/', () => {
    const live = join(repo, '.claude', 'worktrees', 'agent-live')
    git(['worktree', 'add', '-q', '-b', 'feat/live', live])
    backdate(live, WORKTREE_IDLE_MS * 2)
    expect(listWorktreePaths(git).length).toBe(2)
    expect(findWorktreeTrouble({ repo, git, now: NOW }).orphanDirs).toEqual([])
  })

  it('REPAIRS the orphan through the safe remover, and the repair is IDEMPOTENT', () => {
    const orphan = join(repo, '.claude', 'worktrees', 'agent-dead')
    mkdirSync(orphan, { recursive: true })
    writeFileSync(join(orphan, 'leftover.txt'), 'x')
    backdate(orphan, WORKTREE_IDLE_MS * 2)

    expect(removeOrphanWorktrees([orphan], { git })).toEqual([orphan])
    expect(existsSync(orphan)).toBe(false)
    // The MAIN tree is untouched — the whole reason the removal goes through
    // scripts/worktree-cleanup.mjs rather than an rm -rf.
    expect(existsSync(join(repo, 'TASKS.md'))).toBe(true)

    expect(findWorktreeTrouble({ repo, git, now: NOW }).orphanDirs).toEqual([])
    expect(() => removeOrphanWorktrees([orphan], { git })).not.toThrow()
    expect(existsSync(join(repo, 'TASKS.md'))).toBe(true)
  })

  it('reports nothing on a clean repository', () => {
    expect(findWorktreeTrouble({ repo, git, now: NOW })).toEqual({ pruneNeeded: false, orphanDirs: [] })
  })
})

// ---------------------------------------------------------------------------
// (c) orphaned processes of an aborted verification
// ---------------------------------------------------------------------------
describe('(c) leftover processes of an aborted verification', () => {
  const table = (marker) => [
    { pid: 1, ppid: 0, name: 'system', cmd: '' },
    { pid: 100, ppid: 1, name: 'node.exe', cmd: `node ${marker}/scripts/verify/flow.mjs` },
    { pid: 101, ppid: 1, name: 'chrome.exe', cmd: `chrome --headless=new --user-data-dir=${marker}/.playwright` },
    { pid: 102, ppid: 1, name: 'node.exe', cmd: `node ${marker}/node_modules/vite/bin/vite.js dev` },
    // NOT ours: a stranger's headless browser, matched by command line and rejected
    // by the repo marker rather than by its name.
    { pid: 200, ppid: 1, name: 'chrome.exe', cmd: 'chrome --headless=new --user-data-dir=C:/other/repo/.playwright' },
    // Ours, but not a verification leftover: a build is short-lived and a gate may
    // legitimately be running one.
    { pid: 201, ppid: 1, name: 'node.exe', cmd: `node ${marker}/node_modules/typescript/bin/tsc --noEmit` },
    // The reader's own process tree must never be reported as its own leftover.
    { pid: 300, ppid: 0, name: 'node.exe', cmd: `node ${marker}/scripts/batch-doctor.mjs` },
    { pid: 301, ppid: 300, name: 'chrome.exe', cmd: `chrome --headless=new ${marker}/x` },
  ]

  it('DETECTS this checkout’s verify/browser/dev-server leftovers by COMMAND LINE, never by name', () => {
    const marker = repo.replace(/\\/g, '/').toLowerCase()
    const found = findStrayVerifyProcesses({ processes: table(marker), pid: 300, repoMarker: marker })
    expect(found.map((s) => s.pid).sort((a, b) => a - b)).toEqual([100, 101, 102])
    for (const s of found) expect(KILLABLE_STRAY_KINDS.has(s.kind)).toBe(true)
  })

  it('REPAIRS by ending them, and the repair is IDEMPOTENT', () => {
    const marker = repo.replace(/\\/g, '/').toLowerCase()
    const found = findStrayVerifyProcesses({ processes: table(marker), pid: 300, repoMarker: marker })
    const killed = []
    expect(killStrayProcesses(found, { kill: (p) => killed.push(p) }).sort((a, b) => a - b)).toEqual([100, 101, 102])
    expect(killed.sort((a, b) => a - b)).toEqual([100, 101, 102])

    // Second run: the table no longer holds them, so nothing is planned — and a
    // kill of an already-gone pid (which throws ESRCH) is tolerated, not fatal.
    const after = table(marker).filter((p) => ![100, 101, 102].includes(p.pid))
    expect(findStrayVerifyProcesses({ processes: after, pid: 300, repoMarker: marker })).toEqual([])
    expect(() =>
      killStrayProcesses(found, {
        kill: () => {
          throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' })
        },
      }),
    ).not.toThrow()
  })

  it('finds nothing in an empty or unreadable process table', () => {
    expect(findStrayVerifyProcesses({ processes: [], pid: 1, repoMarker: 'x' })).toEqual([])
    expect(findStrayVerifyProcesses()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// (d) a truncated TASKS.md
// ---------------------------------------------------------------------------
describe('(d) a truncated work order', () => {
  // Truncated mid-checkbox: the alarm is a checkbox line that no longer reads as
  // a point, so the fixture must leave NO intact one behind it.
  const TRUNCATED = '# Work order\n\n- ['

  it('DETECTS the damage and that HEAD can repair it', () => {
    writeFileSync(join(repo, 'TASKS.md'), TRUNCATED)
    expect(tasksTextParses(TRUNCATED)).toBe(false)
    expect(tasksRecoverableFromHead({ git })).toBe(true)
  })

  it('REPAIRS from HEAD, KEEPS the damaged bytes, and is IDEMPOTENT', () => {
    writeFileSync(join(repo, 'TASKS.md'), TRUNCATED)
    const first = restoreTasksFromHead({ repo, git, now: NOW })
    expect(first.restored).toBe(true)
    expect(readFileSync(join(repo, 'TASKS.md'), 'utf8')).toMatch(/- \[ \] 2\. open/)
    expect(readFileSync(first.backup, 'utf8')).toBe(TRUNCATED)

    // Second run: the working copy parses, so nothing is rewritten and NO second
    // backup is dropped beside the first.
    const second = restoreTasksFromHead({ repo, git, now: NOW + 1000 })
    expect(second).toEqual({ restored: false, backup: null })
    const backups = readdirSync(join(repo, '.claude')).filter((n) => n.startsWith('tasks-damaged-'))
    expect(backups).toHaveLength(1)
  })

  it('restores a work order that was DELETED outright, with no backup to keep', () => {
    rmSync(join(repo, 'TASKS.md'), { force: true })
    const r = restoreTasksFromHead({ repo, git, now: NOW })
    expect(r).toEqual({ restored: true, backup: null })
    expect(readFileSync(join(repo, 'TASKS.md'), 'utf8')).toMatch(/- \[ \] 2\. open/)
  })

  it('refuses when HEAD is broken too — restoring one broken file over another is no repair', () => {
    writeFileSync(join(repo, 'TASKS.md'), TRUNCATED)
    git(['add', '-A'])
    git(['commit', '-qm', 'the damage was committed'])
    expect(tasksRecoverableFromHead({ git })).toBe(false)
    expect(restoreTasksFromHead({ repo, git, now: NOW })).toEqual({ restored: false, backup: null })
    expect(readFileSync(join(repo, 'TASKS.md'), 'utf8')).toBe(TRUNCATED)
  })

  it('a file with no checkboxes at all still parses — the alarm is about mangled ones', () => {
    expect(tasksTextParses('# Work order\n\nnothing here yet\n')).toBe(true)
    expect(tasksTextParses(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// (e) a stale pending-spawn lock
// ---------------------------------------------------------------------------
describe('(e) a pending-spawn lock nobody converted', () => {
  const lockPath = () => join(repo, '.claude', 'batch-lock.json')
  const writeLock = (patch) =>
    writeFileSync(lockPath(), JSON.stringify({ sessionId: 'launcher-abc', kind: 'pending-spawn', claimedAt: NOW - PENDING_LOCK_STALE_MS * 2, spawnedPid: 4242, ...patch }))
  const gone = () => ({ exists: false, startedAt: null })
  const alive = () => ({ exists: true, startedAt: NOW })

  it('DETECTS it only with BOTH proofs: past the stale window AND the process gone', () => {
    writeLock({})
    expect(findStalePendingSpawn({ lockPath: lockPath(), now: NOW, probe: gone })).toMatchObject({ sessionId: 'launcher-abc', pid: 4242 })
    // Still running: a slow but healthy spawn, not debris.
    expect(findStalePendingSpawn({ lockPath: lockPath(), now: NOW, probe: alive })).toBeNull()
    // Fresh: inside its own window.
    writeLock({ claimedAt: NOW - 1000 })
    expect(findStalePendingSpawn({ lockPath: lockPath(), now: NOW, probe: gone })).toBeNull()
  })

  it('never touches a real session lock, nor a missing/corrupt one', () => {
    writeFileSync(lockPath(), JSON.stringify({ sessionId: 's', kind: 'session', claimedAt: NOW - PENDING_LOCK_STALE_MS * 5, pid: 1 }))
    expect(findStalePendingSpawn({ lockPath: lockPath(), now: NOW, probe: gone })).toBeNull()
    rmSync(lockPath(), { force: true })
    expect(findStalePendingSpawn({ lockPath: lockPath(), now: NOW, probe: gone })).toBeNull()
    writeFileSync(lockPath(), 'not json at all')
    expect(findStalePendingSpawn({ lockPath: lockPath(), now: NOW, probe: gone })).toBeNull()
  })

  it('REPAIRS by removing it, and the repair is IDEMPOTENT', () => {
    writeLock({})
    clearStalePendingSpawn({ lockPath: lockPath() })
    expect(existsSync(lockPath())).toBe(false)
    expect(findStalePendingSpawn({ lockPath: lockPath(), now: NOW, probe: gone })).toBeNull()
    expect(() => clearStalePendingSpawn({ lockPath: lockPath() })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// (f) a half-published board
// ---------------------------------------------------------------------------
describe('(f) a board whose publish never landed', () => {
  const sha = (t) => createHash('sha256').update(Buffer.from(t)).digest('hex')
  const statePath = () => join(repo, '.claude', 'dashboard-state.json')
  const boardPath = () => join(repo, '.batch-dashboard.html')
  const setUp = (html, state) => {
    writeFileSync(boardPath(), html)
    writeFileSync(statePath(), JSON.stringify(state))
  }

  it('DETECTS a local board that differs from the bytes last published', () => {
    setUp('<html>new</html>', { pagesPublishedHash: sha('<html>old</html>') })
    expect(findBoardBehind({ repo })?.reason).toMatch(/differs from the bytes last published/)
  })

  it('DETECTS a publish that FAILED, and a board that was never published at all', () => {
    setUp('<html>x</html>', { pagesPublishedHash: sha('<html>x</html>'), publishFailed: { at: NOW, reason: 'the push was rejected' } })
    expect(findBoardBehind({ repo })?.reason).toMatch(/the push was rejected/)
    setUp('<html>x</html>', {})
    expect(findBoardBehind({ repo })?.reason).toMatch(/ever been recorded/)
  })

  it('is SILENT when the published bytes match, and when there is no board or no state', () => {
    setUp('<html>same</html>', { pagesPublishedHash: sha('<html>same</html>') })
    expect(findBoardBehind({ repo })).toBeNull()
    rmSync(boardPath(), { force: true })
    expect(findBoardBehind({ repo })).toBeNull()
    rmSync(statePath(), { force: true })
    expect(findBoardBehind({ repo })).toBeNull()
  })

  it('REPAIRS by re-running the transport, and the repair is IDEMPOTENT', () => {
    setUp('<html>new</html>', { pagesPublishedHash: sha('<html>old</html>') })
    const calls = []
    const run = (exe, args, cwd) => {
      calls.push({ exe, args, cwd })
      // What a successful publish records: the hash of the bytes that went out.
      writeFileSync(statePath(), JSON.stringify({ pagesPublishedHash: sha(readFileSync(boardPath(), 'utf8')) }))
    }
    republishBoard({ repo, run })
    expect(calls).toHaveLength(1)
    expect(calls[0].args[0]).toBe(join(repo, 'scripts', 'board-publish.mjs'))

    // Second run: nothing is behind any more, so nothing is planned — and a
    // republish anyway is a no-op push of identical bytes.
    expect(findBoardBehind({ repo })).toBeNull()
    republishBoard({ repo, run })
    expect(findBoardBehind({ repo })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// (h) the mandate marker: one-shot, expiring, and cleared by a clean tick
// ---------------------------------------------------------------------------
describe('(h) the mandate marker the launcher hands to its successor', () => {
  const marker = () => join(repo, '.claude', 'repo-mandate.json')

  it('ONE-SHOT: the first reader gets the mandate and the marker is gone', () => {
    writeMandateMarker({ path: marker(), at: NOW, code: 2, reason: 'findings-remain' })
    expect(consumeMandateMarker({ path: marker(), now: NOW + 1000 })).toEqual({ verdict: 'mandate', ran: true, code: 2 })
    expect(existsSync(marker())).toBe(false)
    expect(consumeMandateMarker({ path: marker(), now: NOW + 2000 })).toEqual({ verdict: 'none', ran: false, code: null })
  })

  it('ONE-SHOT even when the marker is CORRUPT — it used to be re-parsed for ever', () => {
    writeFileSync(marker(), '{ this is not json')
    expect(consumeMandateMarker({ path: marker(), now: NOW })).toEqual({ verdict: 'none', ran: false, code: null })
    expect(existsSync(marker())).toBe(false)
  })

  it('EXPIRES: a marker older than its window describes a tree that has since been worked in', () => {
    writeMandateMarker({ path: marker(), at: NOW - 16 * 60 * 1000, code: 1 })
    expect(consumeMandateMarker({ path: marker(), now: NOW }).verdict).toBe('none')
    expect(existsSync(marker())).toBe(false)
    // Inside the window it still binds.
    writeMandateMarker({ path: marker(), at: NOW - 60 * 1000, code: 1 })
    expect(consumeMandateMarker({ path: marker(), now: NOW }).verdict).toBe('mandate')
  })

  it('NO FALSE MANDATE: a clean tick clears what a failed tick left, and clearing is IDEMPOTENT', () => {
    writeMandateMarker({ path: marker(), at: NOW, code: 1, reason: 'unclean-not-repaired' })
    clearMandateMarker({ path: marker() })
    expect(existsSync(marker())).toBe(false)
    expect(consumeMandateMarker({ path: marker(), now: NOW }).verdict).toBe('none')
    expect(() => clearMandateMarker({ path: marker() })).not.toThrow()
  })

  it('a recorded exit 0 is CLEAN, not a mandate — the launcher writes one either way', () => {
    writeMandateMarker({ path: marker(), at: NOW, code: 0 })
    expect(consumeMandateMarker({ path: marker(), now: NOW })).toEqual({ verdict: 'clean', ran: true, code: 0 })
  })

  it('writes atomically — a reader can never see half a marker', () => {
    writeMandateMarker({ path: marker(), at: NOW, code: 1 })
    expect(existsSync(`${marker()}.tmp`)).toBe(false)
    expect(JSON.parse(readFileSync(marker(), 'utf8')).at).toBe(NOW)
  })
})

// ---------------------------------------------------------------------------
// The whole point, in one drill: three states at once, repaired in one pass.
// ---------------------------------------------------------------------------
describe('several torn states at once (the shape point 449 drills)', () => {
  it('detects and repairs a stale lock, an orphan worktree and a truncated work order together', () => {
    const index = join(repo, '.git', 'index.lock')
    writeFileSync(index, '')
    backdate(index, GIT_LOCK_STALE_MS * 2)
    const orphan = join(repo, '.claude', 'worktrees', 'agent-killed')
    mkdirSync(orphan, { recursive: true })
    backdate(orphan, WORKTREE_IDLE_MS * 2)
    writeFileSync(join(repo, 'TASKS.md'), '# Work order\n\n- [')

    const locks = findStaleGitLocks({ gitDir: join(repo, '.git'), now: NOW })
    const wt = findWorktreeTrouble({ repo, git, now: NOW })
    expect(locks).toHaveLength(1)
    expect(wt.orphanDirs).toEqual([orphan])
    expect(tasksRecoverableFromHead({ git })).toBe(true)

    clearStaleGitLocks(locks)
    removeOrphanWorktrees(wt.orphanDirs, { git })
    restoreTasksFromHead({ repo, git, now: NOW })

    expect(findStaleGitLocks({ gitDir: join(repo, '.git'), now: NOW })).toEqual([])
    expect(findWorktreeTrouble({ repo, git, now: NOW })).toEqual({ pruneNeeded: false, orphanDirs: [] })
    expect(tasksTextParses(readFileSync(join(repo, 'TASKS.md'), 'utf8'))).toBe(true)
  })
})

// A guard against a silent regression of the runner itself: these cases only mean
// something if a real `git` is reachable.
describe('the harness', () => {
  it('runs against a real git', () => {
    expect(execFileSync('git', ['--version'], { encoding: 'utf8', windowsHide: true })).toMatch(/git version/)
  })
})
