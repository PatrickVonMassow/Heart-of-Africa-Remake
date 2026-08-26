// THE READER SIDE OF THE DERIVED BOARD STATE (point 749).
//
// It reads the three stores the batch already keeps — the pause marker, the alert
// ladder, the child-retry state — and hands them to the pure derivation. Kept
// apart from `board-state-core.mjs` so the judgement stays testable without a
// live checkout, and apart from `alert-escalation.mjs`/`child-retry.mjs` so the
// board does not import a module that notifies, pauses or spawns on the way in.
//
// EVERY read fails soft. A state file that is missing, half-written or from a
// future version must never cost a board edit: the worst outcome of an unreadable
// store is a paragraph the board does not show, and the store itself is not what
// the reader consults for an incident.

import { existsSync, readFileSync } from 'node:fs'

import { applyDerivedStateCard } from './board-core.mjs'
import { deriveStateCard } from './board-state-core.mjs'
import { parsePauseRecord } from './batch-pause-core.mjs'
import { repoPath } from './repo-paths.mjs'

/** The three stores, named once. The owning scripts name them too; a reader that
 *  guessed a path would silently derive nothing at all. */
export const PAUSE_PATH = repoPath('.claude/batch-paused')
export const LADDER_PATH = repoPath('.claude/resilience/alert-escalation.json')
export const RETRY_STATE_PATH = repoPath('.claude/resilience/child-retry.json')

/** JSON, or null — an unreadable store is one paragraph fewer, never a failure. */
function readJson(path) {
  try {
    if (!existsSync(path)) return null
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

/** The pause record as the derivation wants it, or null when nothing is paused. */
export function readPause({ path = PAUSE_PATH } = {}) {
  try {
    if (!existsSync(path)) return null
    return parsePauseRecord(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/**
 * The state card this repository's state implies right now, or null when the
 * batch has nothing to report. Every call re-reads: that is what lets a card
 * disappear the moment its condition does.
 */
export function currentStateCard({
  pausePath = PAUSE_PATH,
  ladderPath = LADDER_PATH,
  retryPath = RETRY_STATE_PATH,
  now = Date.now(),
} = {}) {
  return deriveStateCard({
    pause: readPause({ path: pausePath }),
    ladder: readJson(ladderPath),
    retryState: readJson(retryPath),
    now,
  })
}

/**
 * The document with its derived state card brought up to date — the one call
 * every board edit and every publish makes. Idempotent, so calling it twice in a
 * turn is not a second card.
 */
export function withDerivedState(html, options = {}) {
  try {
    return applyDerivedStateCard(html, currentStateCard(options), options)
  } catch {
    // A board whose current-work section cannot be found is a board the publish
    // gate will refuse by name; swallowing that here keeps the derivation from
    // becoming a second, less informative failure on top of it.
    return html
  }
}
