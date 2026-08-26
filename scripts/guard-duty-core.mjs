// Pure scope shared by Stop guards that impose WORK rather than merely inspect
// the step being closed. A committed context boundary ends this session's
// licence to begin such work. The obligation stays in its source state and is
// therefore the successor's inbox; demanding it from the fenced session would
// make the exit impossible.
import { BOUNDARY_CAUSES, BOUNDARY_PHASES, markerFresh } from './batch-boundary-core.mjs'
export { BOUNDARY_WITHDRAW_COMMAND, scopeMandatoryDuty } from './mandatory-duty-core.mjs'

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
