#!/usr/bin/env node
// The deliberate writer for a session that is allowed to stop the batch.
//
//   node scripts/batch-pause.mjs --user-stop "<the user's instruction>"
//   node scripts/batch-pause.mjs --awaiting-user "<the decision every open item needs>"
//
// These cases must not be collapsed into a hand-written `.claude/batch-paused`:
// only the first is proof that the user stopped the batch and may therefore omit
// a restart clock. The second is an automatic park and inherits the retry ladder.

import { isMainModule } from './is-main.mjs'
import { setPaused } from './batch-lock.mjs'

export const BATCH_PAUSE_COMMAND = 'node scripts/batch-pause.mjs'

export const pauseUsage = () =>
  `usage: ${BATCH_PAUSE_COMMAND} --user-stop "<the user's instruction>" | ` +
  '--awaiting-user "<the decision every open item needs>"'

export function parsePauseCommand(argv = []) {
  const [mode, rawReason, ...extra] = argv
  const cause = mode === '--user-stop' ? 'user-stop' : mode === '--awaiting-user' ? 'awaiting-user' : null
  const reason = String(rawReason ?? '').trim()
  if (!cause || !reason || extra.length > 0) return { ok: false, usage: pauseUsage() }
  return { ok: true, cause, reason }
}

function recorded(reason, cause, plan) {
  return { ...plan, cause, reason }
}

/** The one reachable writer of the proof that permits a clockless pause. */
export function recordUserStop(reason, options = {}) {
  return recorded(reason, 'user-stop', setPaused(reason, { ...options, cause: 'user-stop' }))
}

/** Awaiting a decision is deliberately retried; it is not proof of a user stop. */
export function recordAwaitingUser(reason, options = {}) {
  return recorded(reason, 'awaiting-user', setPaused(reason, { ...options, cause: 'awaiting-user' }))
}

/** Write through the shared pause API so the record type, clock and retry rung
 * cannot drift from every other pause writer. Paths and time are injectable only
 * so Vitest can exercise the real file write without touching the live marker. */
export function recordPause(command, options = {}) {
  if (!command?.ok) throw new Error(command?.usage ?? pauseUsage())
  return command.cause === 'user-stop'
    ? recordUserStop(command.reason, options)
    : recordAwaitingUser(command.reason, options)
}

if (isMainModule(import.meta.url)) {
  try {
    const command = parsePauseCommand(process.argv.slice(2))
    if (!command.ok) {
      console.error(command.usage)
      process.exitCode = 2
    } else {
      const result = recordPause(command)
      const disposition = result.clockless
        ? 'held until the user explicitly restarts it'
        : `parked until ${new Date(result.retryAfter).toISOString()}`
      console.log(`batch-pause: ${disposition} (${result.cause}: ${result.reason})`)
    }
  } catch (error) {
    console.error(`batch-pause: ${error?.message ?? error}`)
    process.exitCode = 1
  }
}
