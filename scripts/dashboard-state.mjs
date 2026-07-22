// Shared state I/O for the dashboard-currency toolchain (dashboard-guard,
// focus, dashboard-publish, lock-heartbeat-hook). One merged JSON state file
// plus three tiny markers under .claude/, all git-ignored:
//
//   dashboard-state.json      — registered dashboard path, reviewed HEAD,
//                               published-content hash, scratchpad path
//   current-focus.json        — the DECLARED current work focus (point + note)
//   focus-check-pending.json  — armed by every user prompt; cleared by an
//                               explicit focus confirm/set or a --synced review
//   tool-activity.json        — last tool-call timestamp (focus freshness)
//
// State writes are atomic (tmp + rename) because the PostToolUse heartbeat can
// write concurrently with a CLI command in the same turn.
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const R = (p) => fileURLToPath(new URL(p, import.meta.url))
export const REPO_ROOT = R('..')
export const STATE_PATH = R('../.claude/dashboard-state.json')
export const FOCUS_PATH = R('../.claude/current-focus.json')
export const PENDING_PATH = R('../.claude/focus-check-pending.json')
export const ACTIVITY_PATH = R('../.claude/tool-activity.json')

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
