// DERIVED BATCH STATE FOR THE BOARD (point 749).
//
// A paused batch and an environment outage are STATE, not decisions the user can
// make — and until this module existed both were posted as "Von dir zu klären"
// cards. The user cleared such a card by hand three times (19.08.2026 18:59,
// 24.08.2026 07:54, 25.08.2026 13:44) and ruled each time that the machine must
// solve its own incidents: "Das sind interne Probleme, die du selbst lösen musst.
// Etabliere einen Mechanismus, der das verhindert."
//
// THE MECHANISM IS DERIVATION. Nothing writes a state card any more. The state
// lives where it already lived — the pause marker, the alert ladder, the retry
// state — and this module RE-DERIVES the board's state card from those three on
// every board edit and every publish. That is what makes the card self-resolving:
// when `.claude/batch-paused` is removed the pause paragraph is simply not
// derived again, so a condition that has passed cannot outlive itself on the
// board and nobody has to remember to delete anything.
//
// PURE. The wrapper reads the three stores; every judgement is made here so the
// unit layer can exercise it without a live checkout.

/** The marker every derived state card carries. Nothing else may wear it. */
export const DERIVED_STATE_KIND = 'derived'

/** Title when the batch itself is standing still — the strongest state there is. */
export const PAUSED_TITLE = 'Batch pausiert'

/** Title when the batch runs on and only records what it decided on its own. */
export const AUTOMATIC_DECISION_TITLE = 'Automatische Entscheidung'

/** At most this many paragraphs — the board's cards stay compact by contract. */
export const MAX_STATE_PARAGRAPHS = 3

const trim = (value) => String(value ?? '').trim()

/** German date/time for a state paragraph — the board speaks German to the user. */
function berlinMoment(instant) {
  const at = Number(instant)
  if (!Number.isFinite(at) || at <= 0) return null
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(at))
}

/**
 * The pause paragraph, or null when nothing is paused.
 *
 * The reason is the record's own first line, which is what the pausing script
 * already wrote for a human; a retry clock is named because it answers the only
 * question the reader has ("does this clear itself?").
 */
export function pauseParagraph(pause) {
  if (!pause) return null
  const reason = trim(pause.reason) || 'Grund nicht aufgezeichnet.'
  const due = berlinMoment(pause.retryAfter)
  const clock = due
    ? `Nächster Versuch ${due}.`
    : pause.cause === 'user-stop'
      ? 'Der Halt kam von dir und bleibt, bis du ihn aufhebst.'
      : 'Kein Wiederanlauf eingeplant — die laufende Sitzung diagnostiziert.'
  return `${reason} ${clock}`
}

/**
 * The paragraphs for the automatic decisions the batch made on its own: an alert
 * that stayed unanswered and was continued, and a corruption class that was
 * repaired. Both are RECORDS, so they are reported, never asked.
 *
 * A retroactive veto stays possible without a standing decision card: the record
 * names the channel (a chat or ntfy answer), which is where the user already
 * reads and writes.
 */
export function decisionParagraphs(ladder, { now = Date.now(), maxAgeMs = 24 * 3600 * 1000 } = {}) {
  const alerts = ladder?.alerts && typeof ladder.alerts === 'object' ? ladder.alerts : {}
  return Object.values(alerts)
    .map((entry) => ({ record: entry?.record ?? null, at: Number(entry?.record?.at ?? entry?.lastSentAt) }))
    .filter(({ record, at }) => record && trim(record.body) && Number.isFinite(at) && now - at <= maxAgeMs)
    .sort((a, b) => b.at - a.at)
    .map(({ record }) => trim(record.body))
}

/**
 * The paragraph for a scheduled recovery of a delegated child — a state, like the
 * pause, and dropped again once its own clock has run out: the next attempt
 * either happened or the retry state moved on.
 */
export function recoveryParagraphs(retryState, { now = Date.now() } = {}) {
  const points = retryState?.points && typeof retryState.points === 'object' ? retryState.points : {}
  return Object.entries(points)
    .map(([point, record]) => ({ point, recovery: record?.recovery ?? null }))
    .filter(({ recovery }) => recovery && Number(recovery.nextAttemptAt) > now && trim(recovery.decisionRecord?.body))
    .sort((a, b) => Number(a.recovery.nextAttemptAt) - Number(b.recovery.nextAttemptAt))
    .map(({ point, recovery }) => {
      const due = berlinMoment(recovery.nextAttemptAt)
      const action = trim(recovery.action) || 'Wiederanlauf'
      return `Punkt ${point}: ${action} eingeplant${due ? ` (${due})` : ''}. ${trim(recovery.decisionRecord.body)}`
    })
}

/**
 * THE ONE DERIVED STATE CARD, or null when the batch has no state to report.
 *
 * One card and not three: the board's entries are collapsible cards and its
 * binding structure keeps them compact, so three stacked machine cards would be
 * the "Text-Tapete" the user has objected to. The strongest state names the card;
 * every standing item gets its own paragraph, newest first, capped.
 */
export function deriveStateCard({ pause = null, ladder = null, retryState = null, now = Date.now() } = {}) {
  const paragraphs = [
    pauseParagraph(pause),
    ...decisionParagraphs(ladder, { now }),
    ...recoveryParagraphs(retryState, { now }),
  ].filter((paragraph) => trim(paragraph))
  if (paragraphs.length === 0) return null
  return {
    kind: DERIVED_STATE_KIND,
    title: pause ? PAUSED_TITLE : AUTOMATIC_DECISION_TITLE,
    body: paragraphs.slice(0, MAX_STATE_PARAGRAPHS).join('\n\n'),
  }
}
