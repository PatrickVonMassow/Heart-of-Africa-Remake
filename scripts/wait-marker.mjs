// THE WAIT MARKER A HOOK SETS (point 592) — the IO half.
//
// It reads the newest verify RUN RECORD (scripts/verify/run-record.mjs), asks
// the pure decision in ./wait-marker-core.mjs what to do, and writes or
// withdraws the `batch-in-flight` declaration accordingly — the same file, in
// the same shape, that a session writes by hand with
// `node scripts/batch-in-flight.mjs --waiting-on …`.
//
// It is called from duty (8) of scripts/lock-heartbeat-hook.mjs (PostToolUse on
// every tool call) rather than from a matcher of its own, for the same reason
// duty (5) lives there: .claude/settings.json is a protected path an unattended
// session cannot edit.
//
// Cost on the hot path: one `readdir` of the verify log directory. With no run
// record on disk — the ordinary case — it returns before anything else happens.
//
//   node scripts/wait-marker.mjs --status   what the hook would do right now
import { existsSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoPath } from './repo-paths.mjs'
import { latestRecordPath, logDir, readRecord, runIsLive } from './verify/run-record.mjs'
import { clearDeclaration, readDeclaration, writeDeclaration } from './batch-in-flight.mjs'
import { extendLease, readOwnerLock, clearDeclaredWait } from './batch-singleton.mjs'
import { DECLARED_WAIT_LEASE_MS } from './batch-lease-core.mjs'
import { markerDeclaration, waitMarkerDecision } from './wait-marker-core.mjs'

/** The newest verify run this checkout knows about, with the freshness of its
 *  log. All of it failure-tolerant: nothing readable means nothing declared. */
export function readActiveRun({ dir = logDir() } = {}) {
  try {
    const path = latestRecordPath(dir)
    if (!path) return { record: null, live: false, logMtime: null }
    const record = readRecord(path)
    if (!record) return { record: null, live: false, logMtime: null }
    let logMtime = null
    try {
      // The record stores the log the way the wrapper printed it — repo-relative
      // where it can be, absolute where the caller chose a path outside the tree.
      logMtime = statSync(isAbsolute(record.log) ? record.log : repoPath(record.log)).mtimeMs
    } catch {
      /* an unreadable log is no evidence — the decision answers 'none' */
    }
    return { record, live: runIsLive(record).live, logMtime }
  } catch {
    return { record: null, live: false, logMtime: null }
  }
}

/**
 * ARM (or withdraw) THE MARKER. Returns the decision that was acted on, so the
 * `--status` mode and the tests can see what a real call would do. Never
 * throws: a hook may not break a tool call over its own bookkeeping.
 */
export function armWaitMarker({
  sid = '',
  ownsBatch = false,
  paused = false,
  now = Date.now(),
  dir = undefined,
  declarationPath = undefined,
  lockPath = undefined,
} = {}) {
  try {
    // The cheap gates FIRST, before any file is read: a non-owner session and a
    // paused batch pay one comparison for this duty and nothing else.
    if (!sid || paused || !ownsBatch) {
      return { ...waitMarkerDecision({ sid, ownsBatch, paused, now }), written: false }
    }
    const { record, live, logMtime } = readActiveRun(dir === undefined ? {} : { dir })
    const declaration = declarationPath === undefined ? readDeclaration() : readDeclaration(declarationPath)
    const decision = waitMarkerDecision({ sid, ownsBatch, paused, record, recordLive: live, logMtime, declaration, now })
    if (decision.action === 'declare') {
      const lock = lockPath === undefined ? readOwnerLock() : readOwnerLock(lockPath)
      const body = markerDeclaration({ sid, lock, decision, now })
      if (declarationPath === undefined) writeDeclaration(body)
      else writeDeclaration(body, declarationPath)
      // The same lease extension the hand-written declaration takes: a wait that
      // says in advance it will be long is the only thing that keeps a session
      // inside one blocking call from losing the batch to its own expiring lease
      // (point 556). It is owner-guarded, monotonic, and the launcher ends it
      // early the moment the declared evidence stops advancing.
      extendLease(sid, now + DECLARED_WAIT_LEASE_MS, { declaredWait: true, now, ...(lockPath ? { lockPath } : {}) })
      return { ...decision, written: true }
    }
    if (decision.action === 'clear') {
      if (declarationPath === undefined) clearDeclaration()
      else clearDeclaration(declarationPath)
      clearDeclaredWait(sid, lockPath ? { lockPath } : {})
      return { ...decision, written: true }
    }
    return { ...decision, written: false }
  } catch (err) {
    return { action: 'none', reason: `error:${err?.message ?? err}`, written: false }
  }
}

/** Is the batch paused? Read here so the hook passes one flag rather than a path. */
export function batchPaused() {
  try {
    return existsSync(repoPath('.claude', 'batch-paused'))
  } catch {
    return false
  }
}

// --- CLI ------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { record, live, logMtime } = readActiveRun()
  const lock = readOwnerLock()
  const sid = lock?.sessionId ?? ''
  const decision = waitMarkerDecision({
    sid,
    ownsBatch: !!sid,
    paused: batchPaused(),
    record,
    recordLive: live,
    logMtime,
    declaration: readDeclaration(),
  })
  console.log(`run:      ${record ? `${record.command} (${live ? 'RUNNING' : 'over'}, log ${record.log})` : 'none recorded'}`)
  console.log(`decision: ${decision.action} — ${decision.reason}`)
  if (decision.action === 'declare') console.log(`would declare: ${decision.waitingOn}`)
}
