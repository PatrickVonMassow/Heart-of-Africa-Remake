import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const CAPTURE_LOG_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

// Only files minted by tool-output-budget's timestamp+pid naming scheme belong
// to this policy. A human note or another producer's log in the directory is
// not ours to remove.
const CAPTURE_LOG_NAME = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}-\d+\.log$/

/** Remove stale completed captures. Best-effort by design: retention failure
 * must never prevent the current command from running or preserving its log. */
export function pruneCaptureLogs(directory, { now = Date.now(), maxAgeMs = CAPTURE_LOG_MAX_AGE_MS } = {}) {
  const removed = []
  let entries
  try {
    entries = readdirSync(directory, { withFileTypes: true })
  } catch {
    return removed
  }
  for (const entry of entries) {
    if (!entry.isFile() || !CAPTURE_LOG_NAME.test(entry.name)) continue
    const path = join(directory, entry.name)
    try {
      if (now - statSync(path).mtimeMs <= maxAgeMs) continue
      rmSync(path)
      removed.push(entry.name)
    } catch {
      // A concurrent cleanup or unreadable entry is harmless to this capture.
    }
  }
  return removed
}
