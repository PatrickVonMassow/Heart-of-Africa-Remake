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
 * How a reply asks the user to end the session. German first, since replies to
 * the user are German; the slash form is the one that needs no context at all.
 *
 * THE MATCHER IS DELIBERATELY CONSERVATIVE. Three cross-vendor rounds on
 * 20.08.2026 each found new prose the previous draft read wrongly, which is what
 * a regex over free German is: an approximation. The two errors are NOT
 * symmetric — a missed invitation costs nothing (the claim is still withdrawn at
 * the boundary), while a false refusal costs a whole turn and teaches the reader
 * to distrust the guard. So every remaining ambiguity resolves toward ALLOW, and
 * a pattern is only kept when it reads as an INSTRUCTION rather than a mention.
 */
// UNAMBIGUOUS imperative forms only. `startet`, `beginnt`, `führt` and `macht`
// are also ordinary third-person indicative — "Die neue Sitzung startet
// automatisch" is a description — and under the fail direction above an
// ambiguous form is left out rather than guessed at. The polite forms are
// unambiguous because of the capital "Sie".
const IMPERATIVE = String.raw`(?:starte|starten\s+Sie|start|beginne|beginn|beginnen\s+Sie|nimm|nehmen\s+Sie|f[üu]hre|f[üu]hren\s+Sie|mach|mache|machen\s+Sie)`

// The gap between a verb and its object may contain a full stop: "Starte z. B.
// eine neue Sitzung" is one instruction. Excluding `.` was how the first drafts
// kept a match inside one sentence; `invitesClear` now splits into sentences
// BEFORE matching, so the gap only has to stay on one line (cross-vendor review,
// 20.08.2026).
export const CLEAR_INVITATION = Object.freeze([
  /\b(?:mach|mache|machen\s+Sie|starte|starten\s+Sie|f[üu]hre|f[üu]hren\s+Sie)\b[^\n]{0,60}\/?clear\b/i,
  /\bclear\b[^\n]{0,60}\b(?:kann kommen|kannst du machen|bitte|jetzt machen)\b/i,
  new RegExp(String.raw`\b(?:neue|neuen|frische|frischen)\s+Sitzung\b[^\n]{0,60}\b${IMPERATIVE}\b`, 'i'),
  new RegExp(String.raw`\b${IMPERATIVE}\b[^\n]{0,60}\b(?:neue|neuen|frische|frischen)\s+Sitzung\b`, 'i'),
  /\bstart(?:\s+a)?\s+(?:new|fresh)\s+session\b/i,
])

/**
 * A NEGATED instruction is not an invitation.
 *
 * DOUBLE NEGATION ("mach nicht keinen Clear") is deliberately read as negated
 * rather than counted out. Counting negators is wrong in the ordinary case —
 * "Starte keine neue Sitzung, ich brauche das nicht" holds two and IS negated —
 * and the fail direction above says to allow when unsure.
 */
const NEGATOR = /\b(?:kein|keine|keinen|keinem|keines|keiner|nicht|niemals|nie)\b/i

/**
 * The bare slash spelling is an instruction only where its clause also carries
 * one. "Der Befehl `/clear` leert den Kontext" EXPLAINS the mechanism and must
 * not cost a turn; "Jetzt kann /clear kommen" asks for it. Backticks cannot tell
 * the two apart — this project writes the command in backticks either way — so
 * the discriminator is the imperative or an asking word beside it (cross-vendor
 * review, 20.08.2026).
 */
const SLASH_CLEAR = /(?:^|[\s(«"'`])\/clear\b/i
const ASKING = new RegExp(
  String.raw`\b${IMPERATIVE}\b|\b(?:bitte|kann kommen|kannst du|jetzt|danach|dann)\b`,
  'i',
)

/**
 * SENTENCES for the invitation, CLAUSES for the negation — the two scopes are
 * genuinely different, and collapsing them into one was wrong in both
 * directions (cross-vendor rounds, 20.08.2026).
 *
 * An instruction may span a comma: "Die neue Sitzung nimmt den Schnitt frisch
 * auf, starte sie danach" is one invitation whose object and verb sit in
 * different clauses, so matching per clause misses it. A negation may NOT span
 * one: "Der Kontext ist nicht mehr nötig, starte eine neue Sitzung" is an
 * unambiguous invitation whose `nicht` governs the other clause, so disarming
 * per sentence kills it. Match over the sentence; ask about the negation only in
 * the clauses the match actually touches.
 *
 * An abbreviation such as "z. B." must not end a sentence, or the split falls
 * between an imperative and its object.
 */
const ABBREVIATION = /(?:^|\s)(?:[A-Za-zÄÖÜäöü]|z|bzw|ca|vgl|evtl|ggf|Nr|Abs|Dr|usw|etc)\.$/
const CLAUSE_BREAK = /[,;]/

export function sentencesOf(text) {
  const value = String(text ?? '')
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

/** The clauses a match touches: from the break before it to the break after. */
function clauseWindow(sentence, from, to) {
  let left = 0
  for (let i = from - 1; i >= 0; i -= 1) {
    if (CLAUSE_BREAK.test(sentence[i])) {
      left = i + 1
      break
    }
  }
  let right = sentence.length
  for (let i = to; i < sentence.length; i += 1) {
    if (CLAUSE_BREAK.test(sentence[i])) {
      right = i
      break
    }
  }
  return sentence.slice(left, right)
}

/** Is this match disarmed by a negation in the clauses it touches? */
function negated(sentence, hit) {
  return NEGATOR.test(clauseWindow(sentence, hit.index, hit.index + hit[0].length))
}

/**
 * Does this reply ask the user to clear or to start a fresh session?
 *
 * A LIST MARKER inherits from its heading: "Bitte nicht:" followed by bullets is
 * the one shape where a negation governs what comes after it, so a negated line
 * ending in a colon disarms the lines below it until the next heading.
 */
export function invitesClear(text) {
  let disarmedByHeading = false
  return sentencesOf(text).some((sentence) => {
    if (/:$/.test(sentence)) {
      disarmedByHeading = NEGATOR.test(sentence)
      return false
    }
    if (disarmedByHeading) return false
    if (SLASH_CLEAR.test(sentence)) {
      const hit = SLASH_CLEAR.exec(sentence)
      if (ASKING.test(sentence) && !negated(sentence, hit)) return true
    }
    return CLEAR_INVITATION.some((pattern) => {
      const hit = pattern.exec(sentence)
      return Boolean(hit) && !negated(sentence, hit)
    })
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
