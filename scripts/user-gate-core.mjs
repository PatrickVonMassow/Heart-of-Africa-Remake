// THE USER GATE — a point that waits on the user never jams the queue (point 450).
// Pure and side-effect free, so the Vitest layer can sweep every rule against
// text fixtures without a filesystem (scripts/user-gate-core.test.mjs).
//
// WHY THIS EXISTS. Two decisions had been waiting on the user since 29.07.2026,
// and a fortnight of absence must not stop the batch. `defer-for-user.mjs` has
// stamped `AWAITING-USER(<date>)` on such a point since 22.07.2026 — but nothing
// READ it. The marker recorded no reason, no consumer skipped the point, the
// board still rendered it as ordinary pending work, and "the assistant simply
// skips it" was a convention living in a comment. This module turns that
// convention into a mechanism the queue, the pool and the board all share.
//
// ---------------------------------------------------------------------------
// THE MARKER SYNTAX (this is the documentation of record)
// ---------------------------------------------------------------------------
//
//   - [ ] 462. SOME POINT … AWAITING-USER(2026-07-30; needs the user's ruling on X)
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
// * `AWAITING-USER(<since>; <why>)` — `<since>` is an ISO date (or timestamp),
//   `<why>` is one line of English prose (the work order is English by rule).
//   The `;` separates them; everything after the first `;` is the reason.
// * The REASON IS THE POINT of the marker: the queue skips the point *after
//   recording why*, and the marker is that record — durable, in the work order,
//   visible to every session and to the user. `defer-for-user.mjs` refuses to
//   write a gate without one. A LEGACY marker with no reason (or a bare
//   `AWAITING-USER` with no brackets at all) is still honoured as a gate — the
//   safe direction is always to skip, never to hand the user's absence a way of
//   jamming the queue — but it is REPORTED as reasonless so it can be repaired.
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

/** The marker that gates a point on the user. */
export const GATE_MARKER = 'AWAITING-USER'

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
const MARKER_TAIL_RE = new RegExp(`(?:^|\\s)(${GATE_MARKER}|${ANSWERED_MARKER})(?:\\(([^)]*)\\))?[ \\t]*$`)
const HEAD_RE = /^- \[( |x)\] (\d+)\./
/** CRLF checkouts are real on this repository (point 439) — peel, never assume. */
const peelCr = (line) => String(line ?? '').replace(/\r+$/, '')

/** An ISO date or timestamp at the start of a marker's payload, or ''. */
const leadingStamp = (text) => (String(text ?? '').trim().match(/^\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?/) ?? [''])[0]

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
  const answered = hit[1] === ANSWERED_MARKER
  const payload = String(hit[2] ?? '')
  const stamp = leadingStamp(payload)
  const rest = answered ? '' : payload.slice(stamp.length).replace(/^\s*;\s*/, '').trim()
  const reason = answered ? '' : sanitiseReason(rest || (stamp ? '' : payload))
  // A DEFERRED point is out of the batch entirely, and a ticked one is closed;
  // neither may be gated, but a marker left on either is worth reporting.
  const live = open && !deferred
  return {
    point,
    open,
    gated: live && !answered,
    answered: live && answered,
    since: answered ? '' : stamp,
    at: answered ? stamp : '',
    reason,
    reasonMissing: !answered && live && reason === '',
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
  const stale = []
  for (const line of String(tasksText ?? '').split('\n')) {
    const parsed = parseGateLine(line)
    if (!parsed) continue
    if (parsed.gated) gated.push({ point: parsed.point, since: parsed.since, reason: parsed.reason, reasonMissing: parsed.reasonMissing })
    else if (parsed.answered) answered.push({ point: parsed.point, at: parsed.at })
    else if (parsed.stale && hasMarker(line)) stale.push({ point: parsed.point, kind: parsed.open ? 'deferred' : 'ticked' })
  }
  return { gated, answered, stale, reasonless: gated.filter((g) => g.reasonMissing).map((g) => g.point) }
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
 * Mark a point as waiting on the user. Returns { text, ok, error }.
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
  const { gated, answered, stale } = parseUserGates(tasksText)
  const lines = []
  for (const g of gated) {
    lines.push(`  ${g.point} waits on the user${g.since ? ` since ${g.since}` : ''}: ${g.reason || '— NO REASON RECORDED (repair it)'}`)
  }
  for (const a of answered) lines.push(`  ${a.point} answered${a.at ? ` ${a.at}` : ''} — back at the head of the queue`)
  for (const s of stale) {
    lines.push(`  ${s.point} carries a leftover marker on a ${s.kind} point — node scripts/defer-for-user.mjs --forget ${s.point}`)
  }
  return lines
}
