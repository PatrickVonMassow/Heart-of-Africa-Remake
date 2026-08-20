// A REPLY MAY NOT INVITE A CLEAR WHILE THIS SESSION STILL CLAIMS THE BATCH.
//
// Measured 20.08.2026, and the user's own catch: this session claimed the batch,
// worked until its context watermark, secured everything and then asked for a
// `/clear` — with the claim still standing and, worse, a background loop still
// RE-CLAIMING it every twenty seconds. Nothing would have reported that. The
// damage is not that the claim survives the window (it does not: a claim is
// ignored the moment the claiming window closes), but what happens in between —
// the owning session releases at its next clean turn end FOR A CLAIMANT THAT NO
// LONGER EXISTS, and the freed lock then stays reserved for that dead window for
// up to thirty minutes. The batch stands still, and no one is left to notice.
//
// So the invitation and the claim may not stand in the same turn. The fix is
// always in the assistant's hand — withdraw the claim (and stop whatever keeps
// re-creating it), or do not ask for the clear yet — which is why this blocks
// rather than warns.
//
// PURE. The wrapper scripts/clear-claim-guard.mjs does the reading.

/**
 * How a reply asks the user to end the session — deliberately NARROW.
 *
 * FOUR cross-vendor rounds on 20.08.2026 each found new prose the previous draft
 * refused wrongly: an indicative that reads like an imperative, a noun that
 * contains one, a quotation of the very sentence this guard looks for, an
 * unrelated "mach das Bild clear", a negation escaping past a comma. That is not
 * a list of bugs to work through — it is what a regex over free German prose is,
 * and every round of widening bought a new class of false refusals.
 *
 * THE TWO ERRORS ARE NOT SYMMETRIC. A missed invitation costs nothing: the claim
 * is withdrawn at the boundary anyway and the batch is unharmed. A false refusal
 * costs a whole turn and teaches the reader to distrust the guard. So this
 * matcher recognises only shapes that cannot be anything else, and every
 * ambiguity — every single one — resolves toward ALLOW. Misses are the price and
 * they are cheap.
 *
 * The one structural rule that does the work: a German imperative LEADS its
 * clause. Requiring the verb to be the clause's first word removes the whole
 * indicative-and-noun family at a stroke, without a list of exceptions.
 */
// A leading "Bitte" is the one particle that may precede the verb without making
// the clause anything other than an order — "Bitte führe einen clear aus". The
// adverbs that also lead clauses ("jetzt", "dann", "danach") are NOT allowed
// here: they lead indicative sentences just as readily, and each one bought a
// false refusal in the cross-vendor rounds of 20.08.2026.
const LEAD = String.raw`(?:bitte\s+)?`
const IMPERATIVE = String.raw`(?:starte|beginne|nimm|f[üu]hre|mach|mache)`
const POLITE = String.raw`(?:Starten|Beginnen|Nehmen|F[üu]hren|Machen)\s+Sie`
const SESSION = String.raw`(?:neue|neuen|frische|frischen)\s+Sitzung`

// German puts the verb first in a CONDITIONAL too: "Starte ich eine neue Sitzung,
// verliere ich den Kontext" is a statement, not an order. What separates them is
// the subject pronoun right after the verb — an imperative never has one
// (cross-vendor review, 20.08.2026).
const SUBJECT = String.raw`(?!\s+(?:ich|du|er|sie|es|wir|ihr|man)\b)`

// The gap between the verb and the command is a FILLER whitelist, not a wildcard.
// A 40-character wildcard let an object slip in — "Führe den Test für /clear aus"
// is an order about something else entirely — and only these few words can stand
// between an imperative and its object without changing what is being ordered.
const FILLER = String.raw`(?:\s+(?:bitte|jetzt|nun|dann|danach|noch|mal|am\s+besten|zuerst|gleich|z\.\s*B\.|zum\s+Beispiel))*\s*`
// An article may stand between the verb and the object, and nothing else.
const ARTICLE = String.raw`(?:(?:eine|einen|die|den|nen)\s+)?`

// And nothing substantive may follow the command, or the clause is ABOUT it
// rather than asking for it: "`Mach bitte /clear` ist der Positivfall" quotes the
// order inside a sentence that makes a claim.
// A German separable prefix belongs to the verb and may stand after the object:
// "führe einen clear AUS". It is part of the order, not something after it.
const PREFIX = String.raw`(?:\s+(?:aus|an|auf|durch|weiter|nach))?`
const TAIL = String.raw`${PREFIX}[\s.!?)»"'\u201c\u201d\u0060]*$`

/** A clause that IS the slash command, or leads with an imperative carrying it. */
const SLASH_CLEAR = new RegExp(
  String.raw`^(?:${LEAD}(?:${IMPERATIVE}|${POLITE})${SUBJECT}\b${FILLER}\/clear\b|\/clear\b)${TAIL}`,
  'i',
)

// The bare word only with an ARTICLE in front of it, which is what turns it into
// the command: "mach einen clear" is the instruction, "mach das Bild clear" is an
// adjective and an unrelated editing order (cross-vendor review, 20.08.2026).
const ARTICLED_CLEAR = new RegExp(
  String.raw`^${LEAD}(?:${IMPERATIVE}|${POLITE})${SUBJECT}\b${FILLER}(?:einen|den|nen)\s+clear\b${TAIL}`,
  'i',
)

export const CLEAR_INVITATION = Object.freeze([
  SLASH_CLEAR,
  ARTICLED_CLEAR,
  new RegExp(
    String.raw`^${LEAD}(?:${IMPERATIVE})${SUBJECT}\b${FILLER}${ARTICLE}${SESSION}\b${TAIL}`,
    'i',
  ),
  new RegExp(String.raw`^${LEAD}(?:${POLITE})\b${FILLER}${ARTICLE}${SESSION}\b${TAIL}`),
  // English keeps no end constraint: a trailing prepositional phrase is ordinary
  // there ("… for the rest"), and the quoted-fixture case it would guard against
  // is already handled by stripping quotations and fenced code.
  /^(?:please\s+)?start(?:\s+a)?\s+(?:new|fresh)\s+session\b/i,
])

/**
 * A NEGATED sentence is not an invitation — and the unit is the SENTENCE, not
 * the clause, precisely because that direction only ever produces MISSES. A
 * postposed "aber bitte nicht" sits in its own clause and still negates the
 * order before it; under the asymmetry above, reading too much as negated is the
 * safe mistake.
 */
const NEGATOR = /\b(?:kein|keine|keinen|keinem|keines|keiner|nicht|niemals|nie)\b/i

/**
 * A QUOTED sentence is a mention, not an order: "Der Negativtest verwendet den
 * Satz „Mach bitte /clear“." talks ABOUT the instruction. Quoted spans and
 * backticked code are removed before matching, which is a rule that can be read
 * off the text rather than guessed at.
 */
function withoutQuotations(text) {
  return String(text ?? '')
    // Fenced code first, or its own backticks would be unwrapped line by line and
    // a fixture inside it would read as an order (cross-vendor review, 20.08.2026).
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/„[^“\n]*“/g, ' ')
    .replace(/»[^«\n]*«/g, ' ')
    .replace(/"[^"\n]*"/g, ' ')
    .replace(/`([^`\n]*)`/g, '$1')
}

/**
 * Sentences, then clauses. An abbreviation such as "z. B." must not end a
 * sentence, or the split falls between an imperative and its object.
 */
const ABBREVIATION = /(?:^|\s)(?:[A-Za-zÄÖÜäöü]|z|bzw|ca|vgl|evtl|ggf|Nr|Abs|Dr|usw|etc)\.$/

export function sentencesOf(text) {
  const value = withoutQuotations(text)
  const pieces = []
  let current = ''
  for (const ch of value) {
    if (ch === '\n') {
      pieces.push(current)
      current = ''
      continue
    }
    current += ch
    if ((ch === '.' || ch === '!' || ch === '?') && !ABBREVIATION.test(current)) {
      pieces.push(current)
      current = ''
    }
  }
  pieces.push(current)
  return pieces.map((part) => part.trim()).filter(Boolean)
}

/** Clauses of one sentence, with the list markers a bullet line carries stripped. */
export function clausesOf(sentence) {
  return String(sentence ?? '')
    .split(/[,;]/)
    .map((part) => part.trim().replace(/^(?:[-*•]|\d+\.)\s*/, ''))
    .filter(Boolean)
}

/**
 * Does this reply ask the user to clear or to start a fresh session?
 *
 * A negated SENTENCE is skipped whole, and a negated heading ending in a colon
 * disarms the lines under it — both are miss-producing directions, which is the
 * side this guard errs on.
 */
export function invitesClear(text) {
  let disarmedByHeading = false
  return sentencesOf(text).some((sentence) => {
    if (/:$/.test(sentence)) {
      disarmedByHeading = NEGATOR.test(sentence)
      return false
    }
    if (disarmedByHeading) return false
    if (NEGATOR.test(sentence)) return false
    return clausesOf(sentence).some((clause) =>
      CLEAR_INVITATION.some((pattern) => pattern.test(clause)),
    )
  })
}

/**
 * Does the recorded claim belong to THIS session and still stand?
 *
 * A withdrawn claim is a DELETED file, so the ordinary case here is `claim ===
 * null`. A released one keeps `releasedAt`, and a claim by another window is
 * that window's business, not this one's.
 */
export function claimStands({ claim = null, sessionId = '' } = {}) {
  if (!claim || typeof claim !== 'object') return false
  const mine = String(claim.claimantSid ?? claim.sessionId ?? '')
  const me = String(sessionId ?? '')
  if (!me || mine !== me) return false
  return !claim.releasedAt
}

/** The command that ends the state this guard refuses on. */
export function withdrawCommand(sessionId = '') {
  return `node scripts/batch-claim.mjs --withdraw --session ${String(sessionId || '<session-id>')}`
}

/**
 * Verdict for the turn: null (allow) or the Stop-hook block object.
 *
 * Fail direction: only a reply that BOTH invites the clear and stands on a live
 * claim blocks. Everything unreadable — no text, no claim file, another
 * session's claim — allows, because this guard's whole subject is a state this
 * session created and can end.
 */
export function evaluate({ lastText = '', claim = null, sessionId = '' } = {}) {
  if (!claimStands({ claim, sessionId })) return null
  if (!invitesClear(lastText)) return null
  return {
    decision: 'block',
    reason:
      'BATCH-CLAIM offen: Diese Antwort fordert einen Clear an, während diese Sitzung den ' +
      'Batch noch beansprucht. Der Eigner gäbe die Sperre dann an seinem nächsten sauberen ' +
      'Zugende für ein Fenster frei, das es nicht mehr gibt, und sie bliebe bis zu 30 Minuten ' +
      'für dieses tote Fenster reserviert — der Stapel stünde still. Ziehe den Anspruch zurück ' +
      `und stoppe, was ihn neu setzt (eine Warteschleife im Hintergrund): ${withdrawCommand(sessionId)} — ` +
      'prüfe danach `node scripts/batch-claim.mjs --status`. Oder nimm die Clear-Aufforderung ' +
      'aus der Antwort. Antworte anschließend KURZ, mit dem aktuellen Zeitstempel, und sage, was du getan hast.',
  }
}
