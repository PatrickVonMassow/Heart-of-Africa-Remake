// Batch PAUSE state + legacy lock reader.
//
// Since 24.07.2026 (hard singleton, after the e9407cae double-session
// incident) batch OWNERSHIP lives in scripts/batch-singleton.mjs: an atomic
// test-and-set acquire, a pid-backed liveness heartbeat, and stand-down for
// non-owners. The old advisory claim-and-check API (lockStatus/claimLock/
// releaseLock) is deliberately GONE — every claim must go through
// batch-singleton's acquire, and nothing may "refresh" a lock it does not own.
//
// What remains here:
//   batch-paused    — user PAUSE marker; while present no session auto-resumes,
//                     regardless of the lock (the batch waits for an explicit go).
//                     Since point 445 the marker is a RECORD: it carries the reason
//                     and a RETRY-AFTER, and the launcher tick resumes the batch
//                     when that clock runs out. The format and every decision about
//                     it live in scripts/batch-pause-core.mjs; only the file access
//                     is here. `isPaused()` stays existence-based on purpose — an
//                     expired clock is the LAUNCHER's to act on, so every guard's
//                     stand-down keeps reading a parked batch as parked until the
//                     tick has actually cleared the record.
//   readLock()      — read-only view of .claude/batch-lock.json for reporting.

import { readFileSync, existsSync, rmSync } from 'node:fs'
import { writeTextAtomic } from './atomic-write.mjs'
import { repoPath } from './repo-paths.mjs'
import { classifyPause, formatPauseRecord, parsePauseRecord, planPause } from './batch-pause-core.mjs'

// Through repo-paths (point 365 D), not `fileURLToPath(new URL(…, import.meta.url))`:
// that form THROWS under Vitest's module runner, at import time, so every module
// importing this one died with it — which is why the pause API was reached by lazy
// import everywhere. The launcher's `--status` reads the park directly now.
const LOCK_PATH = repoPath('.claude/batch-lock.json')
const PAUSE_PATH = repoPath('.claude/batch-paused')

/** Read-only view of the owner lock (null when absent/unreadable). Ownership
 *  decisions belong to batch-singleton.mjs — never derive "may I work?" from
 *  this alone. */
export function readLock() {
  try {
    const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'))
    if (lock && typeof lock.claimedAt === 'number' && typeof lock.sessionId === 'string') return lock
  } catch {
    // no lock or unreadable
  }
  return null
}

/** The user PAUSE marker: while present, no session auto-resumes the batch. */
export function isPaused() {
  return existsSync(PAUSE_PATH)
}

/** The raw record text, or null when the batch is not parked. */
export function readPauseRecord() {
  try {
    return readFileSync(PAUSE_PATH, 'utf8')
  } catch {
    return null
  }
}

/** The reason WITHOUT the metadata lines — a legacy marker returns its whole text. */
export function pauseReason() {
  const text = readPauseRecord()
  return text == null ? '' : parsePauseRecord(text).reason
}

/** What the record says right now: 'none' | 'hold' | 'wait' | 'retry' (+ details). */
export function pauseState(now = Date.now()) {
  return classifyPause({ text: readPauseRecord(), now })
}

/**
 * Park the batch. A park carries a RESTART CLOCK unless its cause is on the short
 * unsafe list of batch-pause-core.mjs (`CLOCKLESS_CAUSES`) or the ladder is spent —
 * `attempt` is how many retries this cause has already had.
 *
 * `setPaused(reason)` therefore now writes a clocked park by default, which is the
 * whole point of 445: an unattended cause that clears itself must not cost the rest
 * of the absence. A caller that means "hold until a human comes" passes a clockless
 * cause (e.g. `{ cause: 'user-stop' }`) or `{ retryAfter: null }` outright.
 */
export function setPaused(reason, { cause = null, attempt = 0, retryAfter, now = Date.now() } = {}) {
  const plan = retryAfter === undefined ? planPause({ cause, attempt, now }) : { cause, attempt, retryAfter }
  writeTextAtomic(PAUSE_PATH, formatPauseRecord({ reason, ...plan, pausedAt: now }))
  return plan
}

export function clearPaused() {
  try {
    rmSync(PAUSE_PATH)
  } catch {
    // not paused
  }
}
