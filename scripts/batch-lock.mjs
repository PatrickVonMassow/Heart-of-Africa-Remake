// Batch coordination state for the autonomous TASKS.md batch, so two Claude
// instances never work the same repo in parallel (which collides on git and
// the dev server). Two small git-ignored files under .claude/:
//
//   batch-lock.json  — which session owns the batch right now, refreshed as it
//                      works; a session that has not refreshed within STALE_MS
//                      (token exhaustion / closed window) is considered dead so
//                      a fresh session may take over.
//   batch-paused     — user PAUSE marker; while present no session auto-resumes,
//                      regardless of the lock (the batch waits for an explicit go).
//
// The SessionStart hook (batch-resume-hook.mjs) consults both before emitting
// its resume instruction; the active instance refreshes the lock as it works
// and releases it (or sets the pause marker) when it stops.

import { readFileSync, writeFileSync, existsSync, rmSync, renameSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const LOCK_PATH = fileURLToPath(new URL('../.claude/batch-lock.json', import.meta.url))
const PAUSE_PATH = fileURLToPath(new URL('../.claude/batch-paused', import.meta.url))

// Atomic write (Fable-5 audit #18): the lock is rewritten on EVERY tool call by
// the heartbeat, so a torn read (writeFileSync interrupted) would parse as null
// and be treated as "no lock". temp-file + rename makes the swap atomic.
function writeAtomic(path, text) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, text)
  renameSync(tmp, path)
}

// A lock older than this without a refresh is treated as dead. Generous enough
// that the per-point work cadence (commit + dashboard, ~10-40 min) keeps a live
// lock fresh, but a token outage (paused for the refill) goes stale so a
// legitimate new session can take over.
export const STALE_MS = 45 * 60 * 1000

export function readLock() {
  try {
    const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'))
    if (lock && typeof lock.claimedAt === 'number' && typeof lock.sessionId === 'string') return lock
  } catch {
    // no lock or unreadable
  }
  return null
}

/**
 * Lock status for `sessionId` at `nowMs`: 'free' (no lock or stale → may claim),
 * 'mine' (this session already owns it), or 'held' (a different, still-fresh
 * session owns it → must not resume).
 */
export function lockStatus(sessionId, nowMs) {
  const lock = readLock()
  if (!lock) return 'free'
  if (nowMs - lock.claimedAt > STALE_MS) return 'free'
  return lock.sessionId === sessionId ? 'mine' : 'held'
}

/** Claim (or refresh) the lock for `sessionId`; keeps the original startedAt. */
export function claimLock(sessionId, nowMs) {
  const prev = readLock()
  const startedAt = prev && prev.sessionId === sessionId ? prev.startedAt : nowMs
  writeAtomic(LOCK_PATH, JSON.stringify({ sessionId, startedAt, claimedAt: nowMs }, null, 2))
}

/** Release the lock if this session owns it (no-op otherwise). */
export function releaseLock(sessionId) {
  const lock = readLock()
  if (lock && lock.sessionId === sessionId) {
    try {
      rmSync(LOCK_PATH)
    } catch {
      // already gone
    }
  }
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
