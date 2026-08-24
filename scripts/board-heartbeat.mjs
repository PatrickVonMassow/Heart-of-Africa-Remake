// The I/O half of the IN-TURN BOARD HEARTBEAT (point 848). The rules live in
// scripts/board-heartbeat-core.mjs; this reads the declared focus and the board's
// last live publish, and where the core says so, restamps the now-card through
// the ordinary board command and republishes.
//
// CALLED BY THE RECORDING STEPS, NEVER BY A CLOCK: review-sol.mjs when a round
// comes back, mechanism-review.mjs when a verdict is recorded, batch-in-flight.mjs
// when a wait is declared or refreshed. Each of those already happens repeatedly
// inside the long turns that used to leave the board standing still.
//
// IT FAILS SOFT, ALWAYS. A heartbeat is bookkeeping about work, never the work:
// a board that cannot be published must not take a recorded review down with it.
// Every failure is reported on stderr and swallowed, and the caller's own exit
// status is untouched.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT, STATE_PATH, FOCUS_PATH, readJson } from './dashboard-state.mjs'
import { parseNowCardPoint } from './dashboard-guard-core.mjs'
import { decideHeartbeat, TRIGGERS } from './board-heartbeat-core.mjs'

export { TRIGGERS }

/** The now-card's title point on the registered dashboard, or null. */
function readCardPoint(state) {
  try {
    if (!state?.dashboardPath) return null
    return parseNowCardPoint(readFileSync(resolve(REPO_ROOT, state.dashboardPath), 'utf8'))
  } catch {
    return null
  }
}

/**
 * When the board last went LIVE. `pagesPublishedAt` is the transport's own
 * stamp — the moment the page a reader opens was last written. The legacy
 * `publishedAt` mirror is deliberately not consulted: nothing has written it
 * since the board moved to its current transport, so it would read as ancient
 * forever and make every trigger publish.
 */
function lastPublishedAt(state) {
  const at = state?.pagesPublishedAt
  return Number.isFinite(at) && at > 0 ? at : null
}

/** Restamp the now-card through the ordinary board command, which owns the
 *  edit, the archive rotation and the publish in one step. */
function runBoardStatus(point, status) {
  const result = spawnSync(
    process.execPath,
    [resolve(REPO_ROOT, 'scripts', 'board.mjs'), 'status', String(point), '--text-stdin'],
    // windowsHide: the Stop chain and every recording step run unattended;
    // a console window here would steal the focus on each round (point 401).
    { cwd: REPO_ROOT, input: status, encoding: 'utf8', windowsHide: true },
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(String(result.stderr ?? '').trim() || `board.mjs status exited ${result.status}`)
  }
  return String(result.stdout ?? '')
}

/**
 * Carry the board on one recording step.
 *
 * @param {object}   a
 * @param {string}   a.trigger  one of TRIGGERS
 * @param {string}   a.detail   one line: what this step just recorded
 * @returns {{refreshed: boolean, reason: string, status?: string, error?: string}}
 */
export function heartbeat({
  trigger,
  detail = '',
  now = Date.now(),
  state = readJson(STATE_PATH),
  focus = readJson(FOCUS_PATH),
  cardPoint = undefined,
  writeStatus = runBoardStatus,
  stderr = (line) => console.error(line),
} = {}) {
  try {
    const card = cardPoint === undefined ? readCardPoint(state) : cardPoint
    const decision = decideHeartbeat({
      focus,
      cardPoint: card,
      statusAt: lastPublishedAt(state),
      now,
      trigger,
      detail,
    })
    if (!decision.refresh) return { refreshed: false, reason: decision.reason }

    // The card is addressed by NUMBER, so a refresh needs one. A non-point focus
    // is legitimate work, but there is no card here to carry it.
    const target = focus?.point ?? card
    if (target == null) return { refreshed: false, reason: 'no-target' }

    writeStatus(target, decision.status)
    return { refreshed: true, reason: decision.reason, status: decision.status }
  } catch (error) {
    // NEVER fatal: see the header. The caller recorded real work; the board
    // failing to follow is worth saying out loud and nothing more.
    const message = String(error?.message ?? error)
    stderr(`board heartbeat: the now-card could not be carried — ${message}`)
    return { refreshed: false, reason: 'failed', error: message }
  }
}
