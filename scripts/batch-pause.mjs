#!/usr/bin/env node
// Deliberate writer for an allowed batch stop.
//
//   node scripts/batch-pause.mjs --user-stop "<reason>"
//   node scripts/batch-pause.mjs --awaiting-user "<reason>"
//
// These cases must not be collapsed into a hand-written `.claude/batch-paused`:
// only the first is proof that the user stopped the batch and may therefore omit
// a restart clock. The second is an automatic park and inherits the retry ladder.
//
// The user stop is writable only by the session that HOLDS the batch lock, and its
// reason quotes the user's words (point 1193). A stood-down or chat-reply session
// is not held by the batch guards: it simply ends its turn and records nothing.

import { isMainModule } from './is-main.mjs'
import { setPaused } from './batch-lock.mjs'
import { PID_START_TOLERANCE_MS, findClaudeAncestor, readOwnerLock } from './batch-singleton.mjs'
import { namesUserUtterance } from './batch-pause-core.mjs'

export const pauseUsage = () =>
  'usage: node scripts/batch-pause.mjs --user-stop "<reason quoting the user\'s words>" | --awaiting-user "<reason>"'

export function parsePauseCommand(argv = []) {
  const [mode, rawReason, ...extra] = argv
  const cause = mode === '--user-stop' ? 'user-stop' : mode === '--awaiting-user' ? 'awaiting-user' : null
  const reason = String(rawReason ?? '').trim()
  if (!cause || !reason || extra.length > 0) return { ok: false, help: pauseUsage() }
  return { ok: true, cause, reason }
}

function recorded(reason, cause, plan) {
  return { ...plan, cause, reason }
}

/** Does the calling process run under the claude process the batch lock names?
 *  Ancestry, not an asserted session id: an id can be copied from the lock file. */
export function holdsBatchLock({ lock, ancestor } = {}) {
  if (!lock || lock.kind === 'pending-spawn' || typeof lock.pid !== 'number' || lock.pid <= 0) return false
  if (!ancestor || ancestor.pid !== lock.pid) return false
  if (typeof lock.pidStartedAt !== 'number' || typeof ancestor.startedAt !== 'number') return false
  return Math.abs(ancestor.startedAt - lock.pidStartedAt) <= PID_START_TOLERANCE_MS
}

/** Why a user stop may not be written, or null. `owner` is injectable for Vitest. */
export function userStopRefusal(reason, { owner, lockPath } = {}) {
  const probe = owner ?? { lock: readOwnerLock(lockPath), ancestor: findClaudeAncestor() }
  if (!holdsBatchLock(probe)) {
    return 'not-lock-holder: only the session holding the batch lock may stop the batch; a stood-down or chat-reply session ends its turn and records nothing'
  }
  if (!namesUserUtterance(reason)) {
    return 'no-user-utterance: the reason must quote the user\'s own words in quotation marks'
  }
  return null
}

/** The one reachable writer of the proof that permits a clockless pause. A
 *  refusal writes nothing and returns `{ refused: true, why }`. */
export function recordUserStop(reason, options = {}) {
  const why = userStopRefusal(reason, options)
  if (why) return { refused: true, cause: 'user-stop', reason, why, clockless: false, retryAfter: null }
  const { owner: _owner, lockPath: _lockPath, ...pauseOptions } = options
  return recorded(reason, 'user-stop', setPaused(reason, { ...pauseOptions, cause: 'user-stop' }))
}

/** Awaiting a decision is deliberately retried; it is not proof of a user stop. */
export function recordAwaitingUser(reason, options = {}) {
  return recorded(reason, 'awaiting-user', setPaused(reason, { ...options, cause: 'awaiting-user' }))
}

/** Write through the shared pause API so the record type, clock and retry rung
 * cannot drift from every other pause writer. Paths and time are injectable only
 * so Vitest can exercise the real file write without touching the live marker. */
export function recordPause(command, options = {}) {
  if (!command?.ok) throw new Error(command?.help ?? pauseUsage())
  return command.cause === 'user-stop'
    ? recordUserStop(command.reason, options)
    : recordAwaitingUser(command.reason, options)
}

if (isMainModule(import.meta.url)) {
  try {
    const command = parsePauseCommand(process.argv.slice(2))
    if (!command.ok) {
      console.error(command.help)
      process.exitCode = 2
    } else {
      const result = recordPause(command)
      if (result.refused) {
        console.error(`batch-pause: refused, nothing written (${result.why})`)
        process.exitCode = 3
      } else {
        const disposition = result.clockless
          ? 'held until the user explicitly restarts it'
          : `parked until ${new Date(result.retryAfter).toISOString()}`
        console.log(`batch-pause: ${disposition} (${result.cause}: ${result.reason})`)
      }
    }
  } catch (error) {
    console.error(`batch-pause: ${error?.message ?? error}`)
    process.exitCode = 1
  }
}
