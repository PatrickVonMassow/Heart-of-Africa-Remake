// Where the findings carrier lives, and who owns the batch.
//
// The carrier deliberately sits in the MEMORY directory, not in the repo: a
// session that does not hold the batch lock may not write the working tree,
// and that is exactly the session that loses findings. Memory is writable in
// every state, which is the whole reason this mechanism can bind at all.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'

/** Claude Code's per-project directory name: every non-alphanumeric run in the
 *  project path becomes a dash (`c:/Users/…/hoa` → `c--Users-…-hoa`). */
export function projectSlug(root = REPO_ROOT) {
  return String(root).replace(/[^A-Za-z0-9]/g, '-')
}

/** The memory directory for this project, overridable for tests. */
export function memoryDir({ root = REPO_ROOT, home = homedir(), env = process.env } = {}) {
  if (env.FINDINGS_MEMORY_DIR) return env.FINDINGS_MEMORY_DIR
  return join(home, '.claude', 'projects', projectSlug(root), 'memory')
}

/** The carrier file itself. */
export function carrierPath(opts = {}) {
  return join(memoryDir(opts), 'findings-carrier.md')
}

/** The memory index the carrier must be reachable from. */
export function memoryIndexPath(opts = {}) {
  return join(memoryDir(opts), 'MEMORY.md')
}

/**
 * Does `sessionId` hold the batch lock? Reading the lock file directly keeps
 * this free of the singleton module's liveness probing — the guard only needs
 * "is it me", and a missing or unreadable lock answers no.
 */
export function ownsBatch(sessionId, lockPath = join(REPO_ROOT, '.claude', 'batch-lock.json')) {
  if (!sessionId || !existsSync(lockPath)) return false
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    return String(lock && lock.sessionId) === String(sessionId)
  } catch {
    return false
  }
}
