// Shared state I/O for the dashboard-currency toolchain (dashboard-guard,
// focus, dashboard-publish, lock-heartbeat-hook). One merged JSON state file
// plus three tiny markers under .claude/, all git-ignored:
//
//   dashboard-state.json      — registered dashboard path, reviewed HEAD,
//                               published-content hash
//   current-focus.json        — the DECLARED current work focus (point + note)
//   focus-check-pending.json  — armed by every user prompt; cleared by an
//                               explicit focus confirm/set or a --synced review
//   tool-activity.json        — last tool-call timestamp (focus freshness)
//
// State writes are atomic (tmp + rename) because the PostToolUse heartbeat can
// write concurrently with a CLI command in the same turn.
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'

export { REPO_ROOT }
export const STATE_PATH = repoPath('.claude/dashboard-state.json')
export const FOCUS_PATH = repoPath('.claude/current-focus.json')
export const PENDING_PATH = repoPath('.claude/focus-check-pending.json')
export const ACTIVITY_PATH = repoPath('.claude/tool-activity.json')

/** Where the board lives when no path has been registered yet. */
export const BOARD_FILE_DEFAULT = '.batch-dashboard.html'

/**
 * The CANONICAL board file (point 435) — the registered path, or the repo-root
 * default. One resolver, so nothing measures a stale copy of the board instead:
 * the reminder hook used to stat the retired mirror's scratchpad file.
 */
export function boardFilePath(state = readJson(STATE_PATH)) {
  const rel = (state && typeof state === 'object' && state.dashboardPath) || BOARD_FILE_DEFAULT
  return repoPath(rel)
}

/** Parse a JSON file; null when absent/unreadable/torn (caller decides). */
export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/** Atomic JSON write (tmp + rename) — a torn read must never parse as garbage. */
export function writeJsonAtomic(path, value) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2))
  renameSync(tmp, path)
}

/**
 * Merge `patch` into dashboard-state.json without clobbering unrelated fields
 * (the old --synced overwrote the whole file, which would drop the published
 * hash). A patch value of `undefined` DELETES that key.
 */
export function mergeState(patch) {
  const state = readJson(STATE_PATH) ?? {}
  const next = { ...state, ...patch }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key]
  }
  writeJsonAtomic(STATE_PATH, next)
  return next
}

/** Remove a marker file; absent is fine. */
export function removeFile(path) {
  try {
    rmSync(path)
  } catch {
    // already gone
  }
}

/** SHA-256 of a file's bytes; null when unreadable (fail-open for guards). */
export function sha256File(path) {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
  } catch {
    return null
  }
}
