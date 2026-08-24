// Pure core of the IN-TURN BOARD HEARTBEAT (point 848). Side-effect free, so the
// Vitest layer sweeps every rule without a filesystem, a board or a git remote
// (scripts/board-heartbeat-core.test.mjs).
//
// WHY THIS EXISTS. Every currency mechanism the board has bites at a TURN END:
// `dashboard-guard` enforces card currency in the Stop chain, and the launcher's
// watchdog only speaks when the session is wedged. A session that works one
// continuous turn reaches neither. Measured 23.08.2026 ~05:00: the board's last
// publish was 02:30, while the watchdog session spawned at 01:50 worked point 847
// through fifteen Sol review rounds until at least 04:58 in ONE `-p` turn and
// never rewrote the now-card. The public board showed finished work for ~2.5 h of
// live review ping-pong, and the user had to ask whether the batch was alive.
//
// THE CURE IS NOT A POLL. Nothing here runs on a clock; the recurring recording
// steps a long turn already performs — a review round completing, a mechanism
// review being recorded, an in-flight declaration or its refresh — carry the
// board with them. Round N is visible on the page while round N+1 runs.
//
// TWO REFUSALS KEEP IT HONEST:
//   · A CURRENT card is left untouched. Without that the triggers would publish
//     on every round and the board's history would be a storm of identical cards.
//   · A card whose title point DISAGREES with the declared focus is NOT restamped.
//     Reconciling that mismatch is the Stop guard's job (invariants 5-8 in
//     dashboard-guard-core.mjs) and it must be reconciled, not papered over by a
//     heartbeat writing a fresh status onto the wrong card.

/** The recording steps that carry the board. Each is a real, recurring in-turn
 *  event — never a timer. */
export const TRIGGERS = Object.freeze({
  REVIEW_ROUND: 'review-round',
  MECHANISM_RECORD: 'mechanism-record',
  IN_FLIGHT: 'in-flight',
})

const KNOWN = new Set(Object.values(TRIGGERS))

/**
 * How long a now-card status may stand before a trigger refreshes it.
 *
 * CALIBRATABLE. The measured failure was ~2.5 h of silence, and a Sol review
 * round runs single-digit minutes, so ten minutes keeps at most one round
 * invisible while leaving the common case — several recordings inside one
 * round — publishing once. Lower it and a fast round publishes twice for the
 * same news; raise it and the board goes quiet exactly when it is busiest.
 */
export const STALE_AFTER_MS = 10 * 60_000

/** Why a decision came out the way it did. Recorded, so a caller can say what
 *  it did without re-deriving it. */
export const REASONS = Object.freeze({
  NO_FOCUS: 'no-focus',
  UNKNOWN_TRIGGER: 'unknown-trigger',
  CARD_MISMATCH: 'card-mismatch',
  NEVER_STAMPED: 'never-stamped',
  CURRENT: 'current',
  STALE: 'stale',
})

/** One line of board prose out of the focus note and what the trigger recorded.
 *  The focus says what the session is doing; the detail says what just landed. */
export function heartbeatStatus({ note, detail } = {}) {
  const parts = [String(note ?? '').trim(), String(detail ?? '').trim()].filter(Boolean)
  return parts.join(' · ')
}

/**
 * Should this trigger restamp and republish the now-card?
 *
 * @param {object}  a
 * @param {object}  a.focus      the declared focus ({point, note}), or null
 * @param {number}  a.cardPoint  the now-card's title point, or null when unknown
 * @param {number}  a.statusAt   epoch ms the card's status was last written;
 *                               null/undefined when nothing recorded it
 * @param {number}  a.now        epoch ms
 * @param {string}  a.trigger    one of TRIGGERS
 * @param {string}  a.detail     one line: what this trigger just recorded
 * @param {number}  a.staleAfterMs
 * @returns {{refresh: boolean, reason: string, status: string|null, ageMs: number|null}}
 */
export function decideHeartbeat({
  focus = null,
  cardPoint = null,
  statusAt = null,
  now = 0,
  trigger = '',
  detail = '',
  staleAfterMs = STALE_AFTER_MS,
} = {}) {
  const no = (reason) => ({ refresh: false, reason, status: null, ageMs: null })

  if (!KNOWN.has(String(trigger))) return no(REASONS.UNKNOWN_TRIGGER)
  // Nothing declared means nothing to say: the heartbeat reports the focus, and
  // inventing one here would publish a card the session never stood behind.
  if (!focus || (focus.point == null && !String(focus.note ?? '').trim())) return no(REASONS.NO_FOCUS)
  // A point focus pointing at a differently-titled card is a real disagreement.
  if (focus.point != null && cardPoint != null && cardPoint !== focus.point) return no(REASONS.CARD_MISMATCH)

  const status = heartbeatStatus({ note: focus.note, detail })
  // Nothing ever recorded a stamp, so currency CANNOT be proven — and an
  // unprovable currency is treated as stale, never as fresh. A fresh checkout
  // and a lost state file both land here.
  const stamped = Number.isFinite(statusAt) && statusAt > 0
  if (!stamped) return { refresh: true, reason: REASONS.NEVER_STAMPED, status, ageMs: null }

  const ageMs = now - statusAt
  // A clock that went backwards must not be read as "very fresh" forever; a
  // negative age is as unprovable as a missing stamp.
  if (ageMs < 0) return { refresh: true, reason: REASONS.NEVER_STAMPED, status, ageMs }
  if (ageMs < staleAfterMs) return { refresh: false, reason: REASONS.CURRENT, status: null, ageMs }
  return { refresh: true, reason: REASONS.STALE, status, ageMs }
}
