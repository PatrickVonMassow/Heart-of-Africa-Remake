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

/**
 * How long the now-card has stood UNCHANGED, from a record of when its content
 * was last seen to differ.
 *
 * WHY NOT THE CARD'S OWN `Stand HH:MM` STAMP: it carries no date, so its age can
 * only be computed modulo a day, and a card untouched for exactly 24 hours reads
 * as freshly stamped again for ten minutes (cross-vendor review, 24.08.2026,
 * second round). A time-only stamp cannot distinguish today from yesterday, and
 * "unprovable currency is stale" must not have a window in which it inverts.
 *
 * The three answers are distinct on purpose:
 *   · no record at all — nothing here has ever looked, so the age is UNKNOWN and
 *     the caller must treat it as stale rather than guess.
 *   · the content differs from the recorded one — somebody rewrote the card since
 *     the last look, so it is current, and now is when that was first seen.
 *   · the content matches — the card has stood untouched since it was recorded.
 */
export function cardAge({ record = null, digest = '', now = 0 } = {}) {
  const seenAt = Number(record?.seenAt)
  if (!record || !record.digest || !Number.isFinite(seenAt)) {
    return { ageMs: null, remember: { digest, seenAt: now } }
  }
  if (record.digest !== digest) return { ageMs: 0, remember: { digest, seenAt: now } }
  return { ageMs: now - seenAt, remember: null }
}

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
 * @param {number}  a.ageMs      how long the card's own status stamp has stood;
 *                               null when there is no stamp to read
 * @param {string}  a.trigger    one of TRIGGERS
 * @param {string}  a.detail     one line: what this trigger just recorded
 * @param {number}  a.staleAfterMs
 * @returns {{refresh: boolean, reason: string, status: string|null, ageMs: number|null}}
 */
export function decideHeartbeat({
  focus = null,
  cardPoint = null,
  ageMs = null,
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
  // No stamp on the card, so its currency CANNOT be proven — and an unprovable
  // currency is treated as stale, never as fresh. A card the board never
  // stamped and an unreadable clock both land here.
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return { refresh: true, reason: REASONS.NEVER_STAMPED, status, ageMs: null }
  }
  if (ageMs < staleAfterMs) return { refresh: false, reason: REASONS.CURRENT, status: null, ageMs }
  return { refresh: true, reason: REASONS.STALE, status, ageMs }
}
