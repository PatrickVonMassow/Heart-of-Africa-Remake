/**
 * The one valid handover-card answer when the work order has no open point.
 *
 * The boundary composer and the board writer share these exact words so the
 * last handover cannot dictate a card that its own writer refuses. A malformed
 * work order is still diagnosed by the resume hook's format alarm; at this
 * boundary, the safe observable fact is only that no open point was parsed.
 */
export const NO_FOLLOW_ON_WORK = 'Der Arbeitsauftrag enthält keinen offenen Punkt; der Stapel ist abgeschlossen.'

/** A handover must name either a numbered follow-on or the canonical empty state. */
export function namesFollowOnWork(text) {
  const body = String(text ?? '')
  return /\b(?:punkt|point)\s*(\d{1,6})\b/i.test(body) || body.includes(NO_FOLLOW_ON_WORK)
}
