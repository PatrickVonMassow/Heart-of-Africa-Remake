// Pure scope shared by Stop guards that impose WORK rather than merely inspect
// the step being closed. A committed context boundary ends this session's
// licence to begin such work. The obligation stays in its source state and is
// therefore the successor's inbox; demanding it from the fenced session would
// make the exit impossible.
import { BOUNDARY_CAUSES, BOUNDARY_PHASES, markerFresh } from './batch-boundary-core.mjs'

export const BOUNDARY_WITHDRAW_COMMAND = 'node scripts/batch-boundary.mjs --clear'

/** Has this session committed the context boundary that closes its work? */
export function contextFenceState({ marker, sessionId, now = Date.now() } = {}) {
  const closed = Boolean(
    marker &&
      marker.phase === BOUNDARY_PHASES.COMMITTED &&
      marker.cause === BOUNDARY_CAUSES.CONTEXT &&
      sessionId &&
      marker.sessionId === sessionId &&
      markerFresh(marker, now),
  )
  return {
    closed,
    boundary: closed ? BOUNDARY_CAUSES.CONTEXT : null,
    sessionId: String(sessionId ?? ''),
    successor: 'the successor session',
  }
}

/**
 * Scope one mandatory duty. `owed` is the guard's ordinary condition; a closed
 * fence changes only WHO owes it, never whether the underlying debt exists.
 */
export function scopeMandatoryDuty({ owed, fence, guardId, sessionId, duty } = {}) {
  if (!owed) return { owed: false, deferred: false, message: '' }
  const who = String(sessionId ?? '').trim() || 'the current batch owner'
  if (!fence?.closed) {
    return {
      owed: true,
      deferred: false,
      message: `${duty} This duty is owed by session ${who}.`,
    }
  }
  return {
    owed: false,
    deferred: true,
    message:
      `${guardId}: the context boundary is COMMITTED, so ${duty} is deferred to ${fence.successor ?? 'the successor session'}'s ` +
      `first turn and does not block this exit. To make this session responsible again, withdraw the boundary with ` +
      `\`${BOUNDARY_WITHDRAW_COMMAND}\`.`,
  }
}
