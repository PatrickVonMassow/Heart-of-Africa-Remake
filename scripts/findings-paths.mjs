// Where the findings carrier lives, and who owns the batch.
//
// The carrier deliberately sits in the MEMORY directory, not in the repo: a
// session that does not hold the batch lock may not write the working tree,
// and that is exactly the session that loses findings. Memory is writable in
// every state, which is the whole reason this mechanism can bind at all.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { COMMON_REPO_ROOT, REPO_ROOT } from './repo-paths.mjs'

/** Claude Code's per-project directory name: every non-alphanumeric character in
 *  the project path becomes a dash (`/workspace/hoa` → `-workspace-hoa`).
 *  Trailing separators are dropped first: `/workspace/hoa/` once produced a
 *  second, real carrier under `-workspace-hoa-` that no drain ever read. */
export function projectSlug(root = REPO_ROOT) {
  return String(root).replace(/[\\/]+$/, '').replace(/[^A-Za-z0-9]/g, '-')
}

/** The main checkout: a linked worktree's findings belong to the one carrier. */
const mainRoot = () => COMMON_REPO_ROOT() || REPO_ROOT

/** The memory directory for this project, overridable for tests. */
export function memoryDir({ root = mainRoot(), home = homedir(), env = process.env } = {}) {
  if (env.FINDINGS_MEMORY_DIR) return env.FINDINGS_MEMORY_DIR
  return join(home, '.claude', 'projects', projectSlug(root), 'memory')
}

/**
 * EVERY carrier that belongs to this repository: the canonical one, a
 * trailing-separator twin (`-workspace-hoa-`) and the per-worktree ones older
 * sessions wrote before the main-checkout resolution. The reconciliation reads
 * them all — a tick in a carrier nobody reads is still a promise.
 */
export function repoCarrierPaths({ root = mainRoot(), home = homedir(), env = process.env } = {}) {
  if (env.FINDINGS_MEMORY_DIR) return [join(env.FINDINGS_MEMORY_DIR, 'findings-carrier.md')]
  const slug = projectSlug(root)
  const base = join(home, '.claude', 'projects')
  let names = []
  try {
    names = readdirSync(base)
  } catch {
    return [carrierPath({ root, home, env })]
  }
  const own = names.filter((n) => n.replace(/-+$/, '') === slug || n.startsWith(`${slug}--claude-worktrees-`))
  const paths = own.map((n) => join(base, n, 'memory', 'findings-carrier.md')).filter((p) => existsSync(p))
  const canonical = carrierPath({ root, home, env })
  return paths.includes(canonical) ? paths : [canonical, ...paths]
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
