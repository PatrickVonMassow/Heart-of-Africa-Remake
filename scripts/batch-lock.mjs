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
/** The launcher's own state, read here only for the retry rung (`pauseAttempt`). */
const STATE_PATH = repoPath('.claude/autostart-state.json')

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
export function isPaused({ path = PAUSE_PATH } = {}) {
  return existsSync(path)
}

/** The raw record text, or null when the batch is not parked. */
export function readPauseRecord({ path = PAUSE_PATH } = {}) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

/** The reason WITHOUT the metadata lines — a legacy marker returns its whole text. */
export function pauseReason(opts = {}) {
  const text = readPauseRecord(opts)
  return text == null ? '' : parsePauseRecord(text).reason
}

/** What the record says right now: 'none' | 'hold' | 'wait' | 'retry' (+ details). */
export function pauseState(now = Date.now(), opts = {}) {
  return classifyPause({ text: readPauseRecord(opts), now })
}

/**
 * How many times the launcher has already resumed the batch since it last made
 * progress — the rung the next park starts from. It lives in the launcher's state
 * file because that is what clears it (with `failCount`) the moment a spawn commits
 * something, and a park written from anywhere else must climb the SAME ladder: an
 * unanswered alert or a standing outage that re-parked at rung 1 every twenty
 * minutes would never reach a human (four-eyes review, Fable 5, findings 1 + 3).
 */
export function retryAttempts({ statePath = STATE_PATH, path = PAUSE_PATH } = {}) {
  let fromState = 0
  try {
    const n = JSON.parse(readFileSync(statePath, 'utf8'))?.pauseAttempt
    if (Number.isFinite(n) && n > 0) fromState = Math.floor(n)
  } catch {
    /* no state file — the launcher has never run here */
  }
  const text = readPauseRecord({ path })
  const fromRecord = text == null ? 0 : parsePauseRecord(text).attempt
  return Math.max(fromState, fromRecord)
}

/**
 * Park the batch. A park carries a RESTART CLOCK unless its cause is on the short
 * unsafe list of batch-pause-core.mjs (`CLOCKLESS_CAUSES`) or the ladder is spent.
 *
 * `setPaused(reason)` therefore now writes a clocked park by default, which is the
 * whole point of 445: an unattended cause that clears itself must not cost the rest
 * of the absence. A caller that means "hold until a human comes" passes a clockless
 * cause (e.g. `{ cause: 'user-stop' }`) or `{ retryAfter: null }` outright. The rung
 * comes from `retryAttempts()` unless the caller names one, so a repeating cause
 * climbs to a clockless park instead of oscillating for ever.
 */
export function setPaused(reason, { cause = null, attempt, retryAfter, now = Date.now(), path = PAUSE_PATH, statePath = STATE_PATH } = {}) {
  const rung = Number.isFinite(attempt) ? attempt : retryAttempts({ statePath, path })
  const plan = retryAfter === undefined ? planPause({ cause, attempt: rung, now }) : { cause, attempt: rung, retryAfter }
  writeTextAtomic(path, formatPauseRecord({ reason, ...plan, pausedAt: now }))
  return plan
}

export function clearPaused({ path = PAUSE_PATH } = {}) {
  try {
    rmSync(path)
  } catch {
    // not paused
  }
}
