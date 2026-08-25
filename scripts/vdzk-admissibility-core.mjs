// WHAT AN AUTOMATED PATH MAY PUT UNDER "VON DIR ZU KLÄREN" (point 749). PURE.
//
// The section holds GENUINE user decisions only. A session writing a card has
// judgement and is held to that rule by `decision-card-guard`; a SCRIPT has none,
// and four of them posted status reports there — a self-pause, an environment
// outage, and two automatic-decision protocols. Each closed with an instruction
// the user could not carry out ("prüfen, was die Meldung ausgelöst hat") and each
// resolved itself when a clock expired, so the card outlived its own condition.
// He cleared three of them by hand and ruled, the third time: "Das sind interne
// Probleme, die du selbst lösen musst. Etabliere einen Mechanismus, der das
// verhindert."
//
// This is that mechanism on the API side: an automated caller has to declare
// itself, and its card is admitted only if it NAMES THE OPTIONS the user is
// choosing between and ADDRESSES HIM with them. A status report does neither, so
// the board refuses it and says where state belongs instead.
//
// The addressing half reuses `asksForDecision`/`addressesUser` from the decision
// card guard rather than inventing a second notion of "this asks the user": one
// definition, so the gate that DEMANDS a card and the gate that ACCEPTS one
// cannot disagree about what an ask is.

import { addressesUser, asksForDecision } from './decision-card-guard-core.mjs'

/**
 * Two alternatives, spelled out. A machine has no excuse for implying them: it
 * either knows the options it is offering or it is not offering a choice.
 *
 * The forms accepted are the ones a German card actually uses — an explicit
 * "Optionen:" list, an "entweder … oder", a lettered or numbered pair, or a
 * question that carries the alternative in its own "oder".
 */
export function namesOptions(text) {
  const prose = String(text ?? '')
  if (!prose.trim()) return false
  if (/\b(optionen|varianten|möglichkeiten|auswahl)\s*:/i.test(prose)) return true
  if (/\bentweder\b[\s\S]{0,400}\boder\b/i.test(prose)) return true
  // A lettered or numbered pair, each item on its own line — the shape a script
  // writing a genuine choice reaches for.
  const bullets = prose.match(/^\s*(?:[([]?[a-d][)\].]|[1-4][).]|[-*•])\s+\S/gim) ?? []
  if (bullets.length >= 2) return true
  // "… A oder B?" — the alternative inside the question itself.
  return /\boder\b[^.!?]*\?/i.test(prose)
}

/**
 * Is this card admissible from an automated path? Returns `{ ok, reason }`, the
 * reason being what the caller is told when it is not — including where the
 * information does belong, since a refusal that names no alternative is how a
 * script ends up writing the card anyway.
 */
export function judgeAutomatedCard({ title, body } = {}) {
  const head = String(title ?? '').trim()
  const text = String(body ?? '').trim()
  if (!head || !text) {
    return { ok: false, reason: 'board: an automated decision card needs both a title and a body' }
  }
  // TWO THINGS MAKE A CARD A DECISION: the options are visible, and it is the
  // USER who is being asked. A card body is an ask by placement, so the question
  // mark the chat guard looks for is not required here — but one of the two
  // addresses must be there, or the card is prose about the machine.
  const options = namesOptions(text)
  const addressed = asksForDecision(text).asks || text.split(/(?<=[.!?])\s+|\n+/).some((s) => addressesUser(s))
  if (options && addressed) return { ok: true, reason: null }
  const missing = options
    ? 'it names options but never addresses the user, so nobody is being asked'
    : 'it reports a state instead of naming the options the user is choosing between'
  return {
    ok: false,
    reason:
      `board: REFUSED — "${head}" is not a user decision: ${missing}. "Von dir zu klären" holds only ` +
      'choices the user alone can make, and it names them. A batch state — paused, an environment ' +
      'outage, an automatic continuation — belongs in the DERIVED state card of "Woran ich gerade ' +
      'arbeite": write the state itself (the pause marker, the alert ladder, the retry state) and the ' +
      'board reports it on the next edit, then stops reporting it when the condition is gone. ' +
      'If this really is a choice, say what the options are.',
  }
}
