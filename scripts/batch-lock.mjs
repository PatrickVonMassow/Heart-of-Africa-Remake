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
//   readLock()      — read-only view of .claude/batch-lock.json for reporting.

import { readFileSync, existsSync, rmSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const LOCK_PATH = fileURLToPath(new URL('../.claude/batch-lock.json', import.meta.url))
const PAUSE_PATH = fileURLToPath(new URL('../.claude/batch-paused', import.meta.url))

// Atomic write: temp-file + rename, so a torn read can never half-parse.
function writeAtomic(path, text) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, path)
}

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

export function pauseReason() {
  try {
    return readFileSync(PAUSE_PATH, 'utf8').trim()
  } catch {
    return ''
  }
}

export function setPaused(reason) {
  writeAtomic(PAUSE_PATH, `${reason}\n`)
}

export function clearPaused() {
  try {
    rmSync(PAUSE_PATH)
  } catch {
    // not paused
  }
}
