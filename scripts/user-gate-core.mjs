// THE TYPED USER GATE — advice continues; only a real confirmation waits.
// Pure and side-effect free, so the Vitest layer can sweep every rule against
// text fixtures without a filesystem (scripts/user-gate-core.test.mjs).
//
// `AWAITING-USER` used to mix advisory product questions with genuinely
// outward-facing confirmations. That made either one non-commissionable. The
// standing autonomy rule of 23.08.2026 reverses the unsafe default: uncertainty
// continues, and only the closed confirmation class below may park a point.
//
// ---------------------------------------------------------------------------
// THE MARKER SYNTAX (this is the documentation of record)
// ---------------------------------------------------------------------------
//
//   - [ ] 462. SOME POINT … AWAITING-CONFIRMATION(2026-07-30; push the version tag; safe prepared state: the build is verified locally and no tag is pushed)
//   - [ ] 463. SOME POINT … SELF-DECIDED(2026-08-23; migrated advisory question)
//   - [ ] 462. SOME POINT … USER-ANSWERED(2026-08-07)
//
// * Both markers live at the END of the point's OWN head line — the `- [ ] N.`
//   line — exactly where `defer-for-user.mjs` appends them, and nowhere else.
//   BOTH halves of that are load-bearing (four-eyes review, Fable 5, 07.08.2026):
//   the head line keeps a marker out of a point's prose, and the END anchor
//   keeps it out of the head line's own prose. Without the anchor, a HEADLINE
//   that merely names the mechanism ("HARDEN THE AWAITING-USER PARSER") gated
//   its own point, and — worse — a gate whose REASON mentioned `USER-ANSWERED`
//   parsed as answered, sending the unanswered point to the head of the queue.
//   In a repository whose reasons discuss this very mechanism, both were
//   reachable through the shipped command.
// * The LAST marker on the line is the state. That is what "the answer came
//   after the gate" means mechanically, and it needs no precedence rule.
// * A TYPED marker is only a marker WITH its brackets. `AWAITING-CONFIRMATION`,
//   `SELF-DECIDED` or `USER-ANSWERED` standing bare at the end of a headline is
//   prose, not state. Only the legacy marker may appear without them.
// * `AWAITING-CONFIRMATION(<since>; <why>)` is the only gate. Its reason must
//   name one of the policy's closed outward-facing acts — creating, moving,
//   pushing, publishing, deleting, removing, retracting, revoking or
//   withdrawing a version/poc/release tag; dispatching or withdrawing the public
//   release; changing the PUBLISHED four-section board contract — AND the state
//   safely prepared before that act, IN WORDS: naming the phrase without saying
//   what stands prepared is refused. Every accepted verb form is spelled out in
//   `ACT_FORMS`, so a NOUN built from one of them is not an act.
// * `SELF-DECIDED(<at>; <summary>)` records that an advisory choice took the
//   reversible-default lane. Its `Entscheidungsprotokoll:` board card is the
//   detailed record (decision, evidence, consequence and exact veto action).
// * Legacy `AWAITING-USER` is classified from its OWN reason. It gates only if
//   that reason meets today's confirmation rule. Missing or ambiguous reasons
//   fall toward `SELF-DECIDED`/continuation. `--migrate` makes that verdict
//   explicit and reports EVERY legacy marker on the line — including one that
//   stands before a later answer — with the reason it judged.
// * `USER-ANSWERED(<when>)` is what the gate becomes when the answer arrives.
//   It is not cosmetic: it is what puts the point back at the HEAD of the queue
//   (`queueOrder` ranks it ahead of everything else), and it stays on the line
//   until the point is ticked, so the priority survives a session boundary.
// * A `DEFERRED` line is ignored wholesale, as everywhere else in this codebase:
//   a deferred point is not commissionable and therefore not gateable either.
// * A marker on a TICKED (`- [x]`) line is never a gate — a closed point must not
//   be resurrectable at the head of the queue — but it is reported as stale, so
//   the leftover can be removed.
//
// WHAT READS IT: board-queue-core (queue order + the card's meta),
// queue-order-guard-core (a finder ahead of a GATED point is not misordered,
// because the gated point is not workable), batch-in-flight-core (a gated point
// is no candidate, so an idle pool slot owes no reason for it) and
// defer-for-user.mjs (which writes it).

/** The only marker that gates a point on the user. */
export const CONFIRMATION_MARKER = 'AWAITING-CONFIRMATION'
export const GATE_MARKER = CONFIRMATION_MARKER

/** Untyped predecessor, read only for deterministic migration. */
export const LEGACY_GATE_MARKER = 'AWAITING-USER'

/** An advisory choice resolved from evidence while the point stays workable. */
export const SELF_DECIDED_MARKER = 'SELF-DECIDED'

/** …and the one that records the answer and sends the point to the queue head. */
export const ANSWERED_MARKER = 'USER-ANSWERED'

/** How long a recorded reason may be before it is cut (a work-order line, not an essay). */
export const REASON_MAX = 160

/**
 * The LAST marker on a line, and only when it ENDS the line. See the header:
 * anchoring is what keeps the marker out of the prose that surrounds it — the
 * head line's own headline text as much as a reason that names the mechanism.
 * Written against a line whose trailing `\r` has already been peeled.
 */
const MARKERS = [CONFIRMATION_MARKER, LEGACY_GATE_MARKER, SELF_DECIDED_MARKER, ANSWERED_MARKER]
/**
 * A TYPED MARKER MUST CARRY ITS PAYLOAD BRACKETS (cross-vendor review, GPT-5.6
 * Sol, 23.08.2026). With the brackets optional for every marker, a head line
 * whose HEADLINE ends in the bare word — "…RENAME THE MARKER TO SELF-DECIDED" —
 * parsed as a marker, and the next rewrite deleted that headline text with
 * `stripMarkers`. Only the LEGACY marker keeps them optional, because untyped
 * lines written before this rule exist and migration must still see them.
 */
const TYPED_MARKERS = [CONFIRMATION_MARKER, SELF_DECIDED_MARKER, ANSWERED_MARKER]
const MARKER_TAIL_RE = new RegExp(
  `(?:^|\\s)((?:${TYPED_MARKERS.join('|')})\\([^)]*\\)|${LEGACY_GATE_MARKER}(?:\\([^)]*\\))?)[ \\t]*$`,
)
const MARKER_TOKEN_RE = new RegExp(`^(${MARKERS.join('|')})(?:\\(([^)]*)\\))?$`)
const HEAD_RE = /^- \[( |x)\] (\d+)\./
/** CRLF checkouts are real on this repository (point 439) — peel, never assume. */
const peelCr = (line) => String(line ?? '').replace(/\r+$/, '')

/** An ISO date or timestamp at the start of a marker's payload, or ''. */
const leadingStamp = (text) => (String(text ?? '').trim().match(/^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?/) ?? [''])[0]

/** One marker token — `SELF-DECIDED(2026-08-23; …)` — split into name and payload. */
const readMarkerToken = (token) => {
  const m = String(token ?? '').match(MARKER_TOKEN_RE)
  return m ? { marker: m[1], payload: String(m[2] ?? '') } : null
}

/** A marker payload split into its leading stamp and its recorded reason. */
const readPayload = (marker, payload) => {
  const answered = marker === ANSWERED_MARKER
  const stamp = leadingStamp(payload)
  const rest = payload.slice(stamp.length).replace(/^\s*;\s*/, '').trim()
  return { stamp, reason: answered ? '' : sanitiseReason(rest || (stamp ? '' : payload)) }
}

/**
 * Every trailing marker of a line, in the order they stand, plus the line with
 * all of them removed. Migration needs each one — `parseGateLine` reads only the
 * LAST, which is the STATE, and a legacy marker standing before a later answer
 * would otherwise never be seen (cross-vendor review, GPT-5.6 Sol, 23.08.2026).
 */
const peelTrailingMarkers = (line) => {
  let head = String(line)
  const markers = []
  for (;;) {
    const hit = head.match(MARKER_TAIL_RE)
    if (!hit) return { head, markers }
    markers.unshift(hit[1])
    head = head.slice(0, hit.index).replace(/[ \t]+$/, '')
  }
}

/**
 * A reason made safe to store on one work-order line: no closing bracket (it
 * would end the marker early), no newline (it would end the line), collapsed
 * whitespace, capped length. Returns '' for nothing usable.
 */
export function sanitiseReason(reason, { max = REASON_MAX } = {}) {
  const t = String(reason ?? '')
    .replace(/[()\r\n]+/g, ' ')
    .replace(/;/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/**
 * Classify a proposed confirmation reason against the CLOSED U3 authority.
 * Presentation words such as "outward-facing" do not grant authority by
 * themselves: the reason must name the concrete act and what has safely been
 * prepared without performing it.
 */
// The verbs that make an act outward-facing. UNDOING a released artefact is as
// hard to reverse as making it (cross-vendor review, GPT-5.6 Sol, 23.08.2026):
// "delete the v1.2.0 release tag" fell to advisory while "push" did not.
//
// EVERY FORM IS SPELLED OUT rather than closed with `\w*` (second cross-vendor
// round, GPT-5.6 Sol, 23.08.2026). A trailing `\w*` turned the verbs into their
// NOUNS: "copy for the withdrawal dialog in production" — an advisory design
// question — named an authorized act and parked its point. A closed policy list
// is spelled out; that is what makes it closed.
const ACT_FORMS = [
  'create', 'creates', 'created', 'creating',
  'move', 'moves', 'moved', 'moving',
  'push', 'pushes', 'pushed', 'pushing',
  'publish', 'publishes', 'published', 'publishing',
  'unpublish', 'unpublishes', 'unpublished', 'unpublishing',
  'apply', 'applies', 'applied', 'applying',
  'delete', 'deletes', 'deleted', 'deleting',
  'remove', 'removes', 'removed', 'removing',
  'retract', 'retracts', 'retracted', 'retracting',
  'revoke', 'revokes', 'revoked', 'revoking',
  'withdraw', 'withdraws', 'withdrew', 'withdrawn', 'withdrawing',
]
/** The release lane adds the words that name a public release itself. */
const RELEASE_FORMS = [
  ...ACT_FORMS,
  'dispatch', 'dispatches', 'dispatched', 'dispatching',
  'deploy', 'deploys', 'deployed', 'deploying',
  'release', 'releases', 'released', 'releasing',
]
const ACT_VERB = ACT_FORMS.join('|')
const RELEASE_VERB = RELEASE_FORMS.join('|')

const wordsIn = (text) => String(text ?? '').trim().split(/\s+/).filter(Boolean).length

/**
 * A prepared state is NAMED, never merely announced. Both of these passed while
 * recording nothing (cross-vendor review, GPT-5.6 Sol, 23.08.2026): the bare
 * phrase "safe prepared state:" and the bare "prepared locally". The record is
 * what the queue skip is bought with, so it must carry words.
 */
const PREPARED_QUALIFIER = /\b(?:locally|without|not|unchanged|unpublished|unpushed|undispatched|undeployed)\b/
const namesPreparedState = (lower) => {
  const m = /\b(?:safe|safely)\s+prepared\s+state\b[\s:,-]*(.*)$/.exec(lower)
  return Boolean(m) && wordsIn(m[1]) >= 3
}
const namesPreparationInWords = (lower) => {
  const m = /\bprepared\b[\s:,-]*(.*)$/.exec(lower)
  return Boolean(m) && PREPARED_QUALIFIER.test(m[1]) && wordsIn(m[1]) >= 3
}

export function classifyConfirmationReason(reason) {
  const text = sanitiseReason(reason, { max: 1000 })
  const lower = text.toLowerCase()
  const tagAct =
    new RegExp(`\\b(?:${ACT_VERB})\\b[^.]{0,100}\\b(?:version|poc|release)\\b[^.]{0,50}\\btag\\b`).test(lower) ||
    new RegExp(`\\b(?:version|poc|release)\\b[^.]{0,50}\\btag\\b[^.]{0,100}\\b(?:${ACT_VERB})\\b`).test(lower)
  const publicReleaseAct =
    new RegExp(`\\b(?:${RELEASE_VERB})\\b[^.]{0,100}\\b(?:public|production)\\b`).test(lower) ||
    new RegExp(`\\b(?:public|production)\\b[^.]{0,100}\\b(?:${RELEASE_VERB})\\b`).test(lower)
  // BOTH directions demand the PUBLIC qualifier (cross-vendor review, GPT-5.6
  // Sol, 23.08.2026). Without it on the second alternative, "should the
  // four-section internal draft change font?" — an advisory question — named an
  // authorized act and parked its point, which is the exact inversion this
  // point exists to remove.
  const boardContractAct =
    /\b(?:change|replace|restructure|alter)\w*\b[^.]{0,120}\b(?:published|public)\b[^.]{0,80}\b(?:four[- ]section|4[- ]section|section contract)\b/.test(lower) ||
    /\b(?:published|public)\b[^.]{0,80}\b(?:four[- ]section|4[- ]section|section contract)\b[^.]{0,120}\b(?:change|replace|restructure|alter)\w*\b/.test(lower)
  // The PHRASE alone is not the state (cross-vendor review, GPT-5.6 Sol,
  // 23.08.2026): "push the release tag; safe prepared state:" named nothing and
  // was accepted, which is precisely the record the gate is bought with.
  const prepared =
    namesPreparedState(lower) ||
    namesPreparationInWords(lower) ||
    /\b(?:locally|verified|built|staged|ready|unchanged)\b[^.]{0,120}\b(?:not|no|without|before)\b[^.]{0,80}\b(?:push|publish|dispatch|deploy|tag|change)\w*\b/.test(lower)
  const act = tagAct ? 'release-tag' : publicReleaseAct ? 'public-release' : boardContractAct ? 'board-contract' : ''
  if (!act) {
    return { verdict: 'advisory', act: '', reason: text, error: 'reason does not name an authorized outward-facing act' }
  }
  if (!prepared) {
    return { verdict: 'advisory', act, reason: text, error: 'reason does not name the safe prepared state before that act' }
  }
  return { verdict: 'confirmation', act, reason: text, error: '' }
}

/**
 * What ONE work-order line says about the user gate. PURE.
 *
 * Returns { point, open, gated, answered, since, reason, reasonMissing, stale }
 * or null when the line is not a point head line at all. `stale` marks a marker
 * sitting on a ticked point.
 */
export function parseGateLine(line) {
  const text = peelCr(line)
  const head = text.match(HEAD_RE)
  if (!head) return null
  const point = Number(head[2])
  const open = head[1] === ' '
  const deferred = /\bDEFERRED\b/.test(text)
  const hit = text.match(MARKER_TAIL_RE)
  if (!hit) {
    return { point, open, gated: false, answered: false, since: '', at: '', reason: '', reasonMissing: false, stale: false }
  }
  // The LAST marker on the line is the state — a gate written after an answer
  // gates again, an answer written after a gate answers. No precedence rule.
  const { marker, payload } = readMarkerToken(hit[1])
  const answered = marker === ANSWERED_MARKER
  const selfDecided = marker === SELF_DECIDED_MARKER
  const { stamp, reason } = readPayload(marker, payload)
  const classification = marker === CONFIRMATION_MARKER || marker === LEGACY_GATE_MARKER
    ? classifyConfirmationReason(reason)
    : null
  // A DEFERRED point is out of the batch entirely, and a ticked one is closed;
  // neither may be gated, but a marker left on either is worth reporting.
  const live = open && !deferred
  return {
    point,
    open,
    marker,
    legacy: marker === LEGACY_GATE_MARKER,
    selfDecided: live && selfDecided,
    // An untyped marker is read through today's rule immediately: a legacy
    // advisory must not park the point merely because migration has not run.
    // The same fail-continuing direction applies to an invalid explicit marker.
    gated: live && !answered && !selfDecided && classification?.verdict === 'confirmation',
    answered: live && answered,
    since: answered ? '' : stamp,
    at: answered ? stamp : '',
    reason,
    reasonMissing: !answered && !selfDecided && live && reason === '',
    classification,
    stale: !live,
  }
}

/**
 * Every user gate in the work order. PURE — the text is handed in.
 *
 * Returns { gated, answered, stale, reasonless }:
 *   gated      [{point, since, reason, reasonMissing}] — skipped by the queue
 *   answered   [{point, at}]                           — head of the queue
 *   stale      [{point, kind}]                         — marker on a closed/deferred point
 *   reasonless [point]                                 — gated with nothing recorded
 */
export function parseUserGates(tasksText) {
  const gated = []
  const answered = []
  const selfDecided = []
  const advisory = []
  const stale = []
  for (const line of String(tasksText ?? '').split('\n')) {
    const parsed = parseGateLine(line)
    if (!parsed) continue
    if (parsed.gated) gated.push({ point: parsed.point, since: parsed.since, reason: parsed.reason, reasonMissing: parsed.reasonMissing })
    else if (parsed.answered) answered.push({ point: parsed.point, at: parsed.at })
    else if (parsed.selfDecided) selfDecided.push({ point: parsed.point, at: parsed.since, decision: parsed.reason })
    else if (parsed.open && parsed.classification?.verdict === 'advisory') {
      advisory.push({ point: parsed.point, marker: parsed.marker, since: parsed.since, reason: parsed.reason, error: parsed.classification.error })
    }
    else if (parsed.stale && hasMarker(line)) stale.push({ point: parsed.point, kind: parsed.open ? 'deferred' : 'ticked' })
  }
  return { gated, answered, selfDecided, advisory, stale, reasonless: advisory.filter((g) => !g.reason).map((g) => g.point) }
}

/** Does this line END in either marker? */
export function hasMarker(line) {
  return MARKER_TAIL_RE.test(peelCr(line))
}

/** The gated point numbers as a Set — what the queue and the pool skip. */
export function gatedPoints(tasksText) {
  return new Set(parseUserGates(tasksText).gated.map((g) => g.point))
}

/** The answered point numbers as a Set — what the queue puts at its head. */
export function answeredPoints(tasksText) {
  return new Set(parseUserGates(tasksText).answered.map((a) => a.point))
}

/**
 * The gates as one object the consumers pass around: { gated:Set, answered:Set,
 * reasons:Map<point,string> }. Accepts either the raw work order or an already
 * parsed result, so a caller that has one need not re-read the file.
 */
export function gateSets(source) {
  const parsed = typeof source === 'string' || source == null ? parseUserGates(source) : source
  const gated = new Set((parsed?.gated ?? []).map((g) => Number(g.point)))
  const answered = new Set((parsed?.answered ?? []).map((a) => Number(a.point)))
  const reasons = new Map((parsed?.gated ?? []).map((g) => [Number(g.point), String(g.reason ?? '')]))
  const since = new Map((parsed?.gated ?? []).map((g) => [Number(g.point), String(g.since ?? '')]))
  return { gated, answered, reasons, since }
}

// ---------------------------------------------------------------------------
// THE REWRITES — pure, so `defer-for-user.mjs` stays thin I/O and every exit
// path is testable against a fixture rather than against the live work order.
// ---------------------------------------------------------------------------

/**
 * Replace the head line of `point`, or report that there is none.
 *
 * THE LINE ENDING SURVIVES (four-eyes review, Fable 5). On a CRLF checkout —
 * which this repository has met before (point 439) — appending to the raw line
 * put the marker AFTER the `\r`, so the next reader that normalises line
 * endings saw the marker on a line of its own and the gate silently evaporated.
 * The `\r` is peeled before the transform and put back after it.
 */
function rewriteHead(tasksText, point, transform, { includeTicked = false } = {}) {
  const n = Number(point)
  let hit = null
  const out = String(tasksText ?? '')
    .split('\n')
    .map((raw) => {
      const line = peelCr(raw)
      const cr = raw.slice(line.length)
      const head = line.match(HEAD_RE)
      if (!head || Number(head[2]) !== n) return raw
      hit = head[1] === ' ' ? 'open' : 'ticked'
      return hit === 'open' || includeTicked ? `${transform(line)}${cr}` : raw
    })
  return { text: out.join('\n'), hit }
}

/** Every trailing marker, however many were appended in a row. */
const stripMarkers = (line) => {
  let out = String(line)
  for (;;) {
    const next = out.replace(MARKER_TAIL_RE, '').replace(/[ \t]+$/, '')
    if (next === out) return out
    out = next
  }
}

/**
 * Mark a point as awaiting a true confirmation. Returns { text, ok, error }.
 *
 * A gate with no reason is REFUSED here (not silently written): recording the
 * why is what the queue skip is bought with. An already gated point is
 * re-stamped rather than doubled, so the reason can be corrected.
 */
export function markGated(tasksText, point, { since = '', reason = '' } = {}) {
  const clean = sanitiseReason(reason)
  if (!clean) {
    return { text: String(tasksText ?? ''), ok: false, error: 'a gate needs a reason — record WHY the point waits on the user' }
  }
  const classified = classifyConfirmationReason(clean)
  if (classified.verdict !== 'confirmation') {
    return {
      text: String(tasksText ?? ''),
      ok: false,
      error: `advisory reasons cannot wait on the user — ${classified.error}; decide it and record SELF-DECIDED instead`,
    }
  }
  // ONLY a real ISO stamp goes in (four-eyes review, Fable 5): a raw fallback
  // let a bracket in `since` close the marker early and strand the rest of the
  // line as junk no re-stamp could remove. The format already tolerates none.
  const stamp = leadingStamp(since)
  const marker = `${GATE_MARKER}(${stamp ? `${stamp}; ` : ''}${clean})`
  const { text, hit } = rewriteHead(tasksText, point, (line) => `${stripMarkers(line)} ${marker}`)
  if (hit === null) return { text, ok: false, error: `point ${Number(point)} has no line in the work order` }
  if (hit === 'ticked') return { text, ok: false, error: `point ${Number(point)} is already ticked — a closed point is not gateable` }
  return { text, ok: true, error: '' }
}

/** Record a reversible advisory decision without making the point unworkable. */
export function markSelfDecided(tasksText, point, { at = '', decision = '' } = {}) {
  const clean = sanitiseReason(decision)
  if (!clean) {
    return { text: String(tasksText ?? ''), ok: false, error: 'SELF-DECIDED needs the decision that was taken' }
  }
  const stamp = leadingStamp(at)
  const marker = `${SELF_DECIDED_MARKER}(${stamp ? `${stamp}; ` : ''}${clean})`
  const { text, hit } = rewriteHead(tasksText, point, (line) => `${stripMarkers(line)} ${marker}`)
  if (hit === null) return { text, ok: false, error: `point ${Number(point)} has no line in the work order` }
  if (hit === 'ticked') return { text, ok: false, error: `point ${Number(point)} is already ticked — no advisory decision is needed` }
  return { text, ok: true, error: '' }
}

/**
 * The durable board record for an advisory decision. The labels are explicit
 * because all four facts are mandatory and a prose blob cannot prove which one
 * was omitted. The title deliberately does not START with the point number:
 * dashboard-integrity treats a leading number in this section as a parked
 * point, whereas SELF-DECIDED must remain visible in the workable queue.
 */
export function advisoryDecisionCard(point, { decision = '', evidence = '', consequence = '', vetoAction = '' } = {}) {
  const fields = {
    decision: sanitiseReason(decision, { max: 1000 }),
    evidence: sanitiseReason(evidence, { max: 1000 }),
    consequence: sanitiseReason(consequence, { max: 1000 }),
    vetoAction: sanitiseReason(vetoAction, { max: 1000 }),
  }
  const missing = Object.entries(fields).filter(([, value]) => !value).map(([key]) => key)
  if (missing.length) return { ok: false, error: `decision record needs: ${missing.join(', ')}`, title: '', body: '' }
  return {
    ok: true,
    error: '',
    title: `Entscheidungsprotokoll: Punkt ${Number(point)} läuft weiter`,
    body:
      `Entscheidung: ${fields.decision}. Evidenz: ${fields.evidence}. ` +
      `Folge: ${fields.consequence}. Exakte Veto-Aktion: ${fields.vetoAction}.`,
  }
}

/** Validate and prepare both halves of one advisory decision atomically in memory. */
export function prepareAdvisoryDecision(tasksText, point, {
  at = '',
  question = '',
  decision = '',
  evidence = '',
  consequence = '',
  vetoAction = '',
} = {}) {
  const classified = classifyConfirmationReason(question)
  if (!classified.reason) {
    return { text: String(tasksText ?? ''), ok: false, error: 'an advisory decision needs the question it resolves', card: null }
  }
  if (classified.verdict === 'confirmation') {
    return {
      text: String(tasksText ?? ''),
      ok: false,
      error: 'this reason names a true confirmation act — use AWAITING-CONFIRMATION instead of SELF-DECIDED',
      card: null,
    }
  }
  const card = advisoryDecisionCard(point, { decision, evidence, consequence, vetoAction })
  if (!card.ok) return { text: String(tasksText ?? ''), ok: false, error: card.error, card: null }
  const marked = markSelfDecided(tasksText, point, { at, decision })
  if (!marked.ok) return { ...marked, card: null }
  return { ...marked, card, question: classified.reason }
}

const legacyDecision = (point, reason) => advisoryDecisionCard(point, {
  decision: `Die offene Beratungsfrage wird mit dem sichersten reversiblen Standard entschieden: ${reason || 'keine belastbare Frage aufgezeichnet'}`,
  evidence: 'Der alte Marker nennt weder einen autorisierten Außenakt noch den davor sicher vorbereiteten Zustand',
  consequence: `Punkt ${point} bleibt bearbeitbar und der Batch setzt ihn fort`,
  vetoAction: `Auf dieser Karte mit „Veto“ und der gewünschten Alternative antworten; der nächste Besitzer öffnet Punkt ${point} erneut und macht die daraus entstandenen Änderungen rückgängig`,
})

/**
 * Rewrite every legacy marker and return an auditable verdict for EVERY ONE.
 * Confirmations retain their original stamp/reason; ambiguous open markers
 * become SELF-DECIDED and yield the decision card the CLI must publish.
 *
 * EVERY marker on the line, not only the state (cross-vendor review, GPT-5.6
 * Sol, 23.08.2026). Reading through `parseGateLine` saw the LAST marker alone:
 * a legacy gate standing before a later `USER-ANSWERED` was neither rewritten
 * nor reported, and two legacy markers in a row were stripped together but
 * yielded a single verdict — both against the promise that the report names
 * every existing marker.
 */
export function migrateLegacyGates(tasksText, { at = '' } = {}) {
  const stamp = leadingStamp(at)
  const entries = []
  const cards = []
  const lines = String(tasksText ?? '').split('\n').map((raw) => {
    const line = peelCr(raw)
    const cr = raw.slice(line.length)
    const head = line.match(HEAD_RE)
    if (!head) return raw
    const point = Number(head[2])
    const { head: bare, markers } = peelTrailingMarkers(line)
    const tokens = markers.map((token) => ({ token, ...(readMarkerToken(token) ?? { marker: '', payload: '' }) }))
    if (!tokens.some((t) => t.marker === LEGACY_GATE_MARKER)) return raw
    // A ticked or DEFERRED point is closed to the batch; its leftovers go,
    // and each legacy one is still named so the removal is auditable.
    const live = head[1] === ' ' && !/\bDEFERRED\b/.test(line)
    if (!live) {
      for (const t of tokens) {
        if (t.marker !== LEGACY_GATE_MARKER) continue
        entries.push({ point, verdict: 'stale-removed', reason: readPayload(t.marker, t.payload).reason })
      }
      return `${bare}${cr}`
    }
    const rebuilt = tokens.map((t) => {
      if (t.marker !== LEGACY_GATE_MARKER) return t.token
      const { stamp: since, reason } = readPayload(t.marker, t.payload)
      if (classifyConfirmationReason(reason).verdict === 'confirmation') {
        entries.push({ point, verdict: 'confirmation', reason })
        return `${CONFIRMATION_MARKER}(${since ? `${since}; ` : ''}${reason})`
      }
      entries.push({ point, verdict: 'self-decided', reason })
      const card = legacyDecision(point, reason)
      if (card.ok) cards.push({ point, ...card })
      const summary = sanitiseReason(reason || 'legacy marker had no recorded reason')
      return `${SELF_DECIDED_MARKER}(${stamp ? `${stamp}; ` : ''}${summary})`
    })
    return `${[bare, ...rebuilt].join(' ')}${cr}`
  })
  return { text: lines.join('\n'), entries, cards }
}

/**
 * Record the user's answer: the gate becomes `USER-ANSWERED(<when>)`, which is
 * what returns the point to the HEAD of the queue. Returns { text, ok, error,
 * wasGated }.
 */
export function markAnswered(tasksText, point, { at = '' } = {}) {
  const before = parseGateLine(
    String(tasksText ?? '')
      .split('\n')
      .find((l) => {
        const h = peelCr(l).match(HEAD_RE)
        return h && Number(h[2]) === Number(point)
      }) ?? '',
  )
  const stamp = leadingStamp(at)
  const marker = `${ANSWERED_MARKER}(${stamp})`
  const { text, hit } = rewriteHead(tasksText, point, (line) => `${stripMarkers(line)} ${marker}`)
  if (hit === null) return { text, ok: false, error: `point ${Number(point)} has no line in the work order`, wasGated: false }
  if (hit === 'ticked') {
    return { text, ok: false, error: `point ${Number(point)} is already ticked — nothing to answer`, wasGated: false }
  }
  return { text, ok: true, error: '', wasGated: Boolean(before?.gated) }
}

/**
 * Remove the markers from a point's line — the answer was worked, the gate was
 * wrong, or a leftover sits on a point that has since been ticked.
 *
 * TICKED LINES INCLUDED (four-eyes review, Fable 5): `gateReport` tells the
 * operator to clear exactly those, and the only API that could refused them,
 * silently. Removing a marker can never resurrect a closed point — nothing
 * reads a marker off a ticked line as live — so there is nothing to protect.
 */
export function clearMarkers(tasksText, point) {
  const { text, hit } = rewriteHead(tasksText, point, stripMarkers, { includeTicked: true })
  return { text, ok: hit !== null, error: hit === null ? `point ${Number(point)} has no line in the work order` : '' }
}

/**
 * The operator-facing report of the current gates — one line each, the recorded
 * reason included. This is where the "why" the queue skipped on becomes visible
 * without opening the work order.
 */
export function gateReport(tasksText) {
  const { gated, answered, selfDecided, advisory, stale } = parseUserGates(tasksText)
  const lines = []
  for (const g of gated) {
    lines.push(`  ${g.point} awaits confirmation${g.since ? ` since ${g.since}` : ''}: ${g.reason || '— NO REASON RECORDED (repair it)'}`)
  }
  for (const a of answered) lines.push(`  ${a.point} answered${a.at ? ` ${a.at}` : ''} — back at the head of the queue`)
  for (const s of selfDecided) lines.push(`  ${s.point} self-decided${s.at ? ` ${s.at}` : ''}: ${s.decision}`)
  for (const a of advisory) {
    lines.push(`  ${a.point} continues — ${a.marker} is advisory: ${a.reason || '— NO REASON RECORDED'} (${a.error})`)
  }
  for (const s of stale) {
    lines.push(`  ${s.point} carries a leftover marker on a ${s.kind} point — node scripts/defer-for-user.mjs --forget ${s.point}`)
  }
  return lines
}
