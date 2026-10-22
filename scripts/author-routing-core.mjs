// WHICH AUTHORING LANE A POINT GOES TO (point 667). rule:model-policy@2f245cec
//
// The user pays two vendors, and authoring is the largest single item of the
// spend, so it is split across both rather than sitting on one. It does NOT all
// move: CLAUDE.md §6 names three lanes with different jobs, and the cut between
// them is decided HERE, from the point's own text, rather than by whoever
// happens to be dispatching. The SPLIT is the standing policy; how full each
// pool happens to be on a given day is not a reason this file knows about
// (cross-vendor audit 17.08.2026 — the header used to argue from one day's
// quota reading, which then outlived it). An UNREACHABLE lane is different from
// a full one: where the cross lane's volume is spent, authoring goes to the main chain
// rather than waiting for the vendor (user 23.09.2026; point 1194 measures and lifts it).
// That fallback is decided in lane-routing-core.mjs (`effectiveRoute`), not here.
//
//   cross  The cross-vendor lane authors the points, and the main chain then
//          reviews, runs the suites, judges the picture and lands. Since
//          18.08.2026 that includes the HARD and CRITICAL ones — difficult,
//          complex, error-prone or tagged HIGH criticality goes STRAIGHT here,
//          where it used to be held back for the main lane.
//   main   The main chain keeps what only the main lane can honestly finish: a point
//          whose VERIFICATION is the work (a picture judged on both backends is
//          the main session's job, so authoring it elsewhere buys nothing) —
//          and only while nothing marks that point hard, because the user's
//          18.08. ruling outranks this lane, not the other way round.
//   scarce The scarce lane is the escalation described by CLAUDE.md §6 when the shared
//          switch admits it. A point's tag, a caller override and the automatic
//          boundary all consult that same decision.
//
// WHY A FUNCTION RATHER THAN A JUDGMENT CALL: the point says the cut is named,
// not guessed. A dispatcher's taste is not reviewable and drifts with whoever
// holds the batch; this is pure, tested, and answers the same way twice — and
// where it answers wrongly, the fix is a case in its test file, not a habit.
//
// The reasons travel with the verdict so a dispatcher can see WHY and override
// with a tag in the point itself; author-delegate.mjs refuses a run whose point
// routes to another lane unless `--anyway` is given. Side-effect free; the work-order reading belongs to
// scripts/author-delegate.mjs. Pinned by author-routing-core.test.mjs.

import { CROSS, MAIN, SCARCE, lane, laneByFamily } from './model-lanes.mjs'
import { laneIsOn, laneRefusalReason, requireState } from './lane-switch-core.mjs'

/** The authoring lanes (lane roles), in report order. */
export const AUTHOR_LANES = Object.freeze(['cross', 'scarce', 'main'])

/** Who each lane is, for the report a dispatcher reads — DERIVED from the lane records,
 * so a version bump moves one record and not a scattered set. */
export const LANE_MODEL = Object.freeze(Object.fromEntries(AUTHOR_LANES.map((role) => [role, lane(role).displayName])))

/**
 * User decision 31.08.2026: scarce-lane escalation begins at this many FRESH
 * unsuccessful review rounds (repeats excluded, `authorRoundHistory().freshRounds`), and TEN IS THE STANDING DEFAULT — not a shortage measure.
 *
 * It was raised once before and fell back to five when the volume shortage that
 * happened to be running at the time was declared over; the raise was read as
 * part of that emergency and taken back with it. It is not. The reason to spend
 * ten rounds before reaching for the scarcest lane holds in a full week exactly
 * as in an empty one: a point that repeated reviews have rejected is far more often
 * badly cut than badly authored, and switching vendor buys less than re-cutting
 * it. An emergency may raise this FURTHER for a while; when it ends the value
 * returns here, to ten, and never to five.
 */
export const SCARCE_ESCALATION_ROUNDS = 10

/** The words prose names the scarce lane by: its role and its family words. */
export const SCARCE_LANE_WORDS = Object.freeze([SCARCE.role, ...SCARCE.familyWords])

/** The last cross/main round pauses for a spec reading before the scarce lane may take it. */
export const SPEC_EXAMINATION_ROUND = SCARCE_ESCALATION_ROUNDS - 1

/**
 * The hostile-tester stances used to make successive re-authoring commissions
 * ask materially different questions of the same lane. These are instructions,
 * not labels: the prompt can hand either one to an author without another
 * judgment call in the dispatcher.
 */
export const AUTHORING_FRAMINGS = Object.freeze([
  'Act as a hostile tester: assume the previous fix is confidently wrong, reproduce every finding from first principles, and search the adjacent state transitions for the same failure.',
  'Act as a hostile contract tester: treat every sentence of the point as an adversarial boundary, construct the smallest counterexample to the current implementation, and repair the invariant rather than the example.',
])

/** The two outcomes a completed examination may record. */
export const SPEC_EXAMINATION_VERDICTS = Object.freeze(['sound', 'amended'])

/** A pre-dispatch receipt written by author-delegate for a round governed by this mechanism. */
export const AUTHORING_COMMISSION_KIND = 'authoring-commission'

const isUnsuccessfulReview = (record, wanted) => {
  if (Number(record?.point) !== wanted) return false
  if (record?.mode && record.mode !== 'review') return false
  if (record?.specExamination) return false
  if (record?.aborted || record?.shortfall || record?.completed === false) return false
  return record?.verdict === 'merge-with-fixes' || record?.verdict === 'do-not-merge'
}

const isExaminationRecord = (record, wanted) =>
  Number(record?.point) === wanted &&
  record?.mode === 'review' &&
  record?.verdict === 'merge' &&
  SPEC_EXAMINATION_VERDICTS.includes(String(record?.specExamination)) &&
  !record?.aborted &&
  !record?.shortfall &&
  record?.completed !== false &&
  String(record?.evidence ?? '').trim().length >= 10

/** The examiner is always the other vendor and never the scarce lane. */
export function specExaminerFor(history = {}, fallbackAuthor = '') {
  const rounds = Array.isArray(history?.rounds) ? history.rounds : []
  const author = [...rounds].reverse().find((round) => round.authoredBy)?.authoredBy || String(fallbackAuthor)
  if (laneByFamily(author)?.role === CROSS.role) {
    return { role: MAIN.role, model: MAIN.displayName, route: 'main-read', author }
  }
  return { role: CROSS.role, model: CROSS.displayName, route: 'ask-lane', author }
}

/**
 * An unsuccessful round is a completed review whose verdict was not a pass.
 * A run that aborted, did not run or had a material shortfall is not completed
 * and does not count; the ordinary record path writes no row for those cases,
 * and the defensive checks here also reject such a hand-authored row.
 */
export function unsuccessfulReviewRounds(records = [], point = '') {
  const wanted = Number(point)
  if (!Number.isInteger(wanted) || wanted < 0) return 0
  return (Array.isArray(records) ? records : []).filter((record) => isUnsuccessfulReview(record, wanted)).length
}

/**
 * Read the re-authoring history once, in ledger order.
 *
 * Outcomes of authoring rounds zero and one carry no framing. Every later fresh
 * attempt must name one and must differ from the preceding fresh attempt. A
 * missing or repeated framing remains visible as a repeat, but does not buy
 * progress toward the scarce lane.
 */
export function authorRoundHistory(records = [], point = '') {
  const wanted = Number(point)
  if (!Number.isInteger(wanted) || wanted < 0) {
    return { unsuccessfulRounds: 0, freshRounds: 0, rounds: [], examination: null }
  }
  const rows = Array.isArray(records) ? records : []
  // freshRounds is escalation credit only. The NEXT commission's number is
  // rounds.length: the first review row is the outcome of round zero, the
  // second the outcome of round one, and so on.
  let freshRounds = 0
  let previousFraming = ''
  const rounds = []
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const record = rows[rowIndex]
    if (!isUnsuccessfulReview(record, wanted)) continue
    const index = rounds.length
    const reviewFraming = String(record?.authorFraming ?? '').trim()
    const commission = [...rows.slice(0, rowIndex)].reverse().find(
      (candidate) =>
        candidate?.kind === AUTHORING_COMMISSION_KIND &&
        Number(candidate?.point) === wanted &&
        Number(candidate?.round) === index,
    )
    const commissionedFraming = String(commission?.authorFraming ?? '').trim()
    const framing = commissionedFraming || reviewFraming
    // No old ledger row could carry a commission receipt or the confirmation
    // flag: those rows are real pre-mechanism attempts, not malformed uses of
    // a rule that did not exist. Once either marker exists, enforce the rule.
    const governed = Boolean(commission || reviewFraming)
    // Every ledger outcome consumes its own attempt number, including a
    // repeat. Freshness controls escalation credit; it must not also control
    // the ordinal, or one bad row makes every later row retry the same rules.
    const reviewedRound = index
    let repeat = ''
    if (commission && reviewFraming && reviewFraming !== commissionedFraming) {
      repeat = 'the review framing does not match the recorded commission'
    }
    if (governed && reviewedRound <= 1 && framing) repeat = 'rounds zero and one must carry no author framing'
    if (governed && reviewedRound > 1 && !framing) repeat = 'no author framing was recorded'
    if (governed && framing && !AUTHORING_FRAMINGS.includes(framing)) {
      repeat = 'the record names no recognized hostile-tester framing'
    }
    if (governed && framing && previousFraming && framing === previousFraming) {
      repeat = 'the author framing repeats the preceding fresh round'
    }
    if (!repeat) {
      freshRounds += 1
      previousFraming = framing
    }
    rounds.push({
      ledgerRound: index + 1,
      freshRound: repeat ? null : reviewedRound,
      framing,
      commissioned: Boolean(commission),
      repeat,
      evidence: String(record?.evidence ?? '').trim(),
      authoredBy: String(record?.authoredBy ?? '').trim(),
    })
  }
  const expectedExaminer = specExaminerFor({ rounds })
  const examination =
    [...rows]
      .reverse()
      .find((record) => {
        if (!isExaminationRecord(record, wanted)) return false
        if (!expectedExaminer.author) return true
        return laneByFamily(String(record?.model ?? ''))?.role === expectedExaminer.role
      }) ?? null
  return { unsuccessfulRounds: rounds.length, freshRounds, rounds, examination }
}

/** Pick a known hostile-tester stance that is not the preceding one. */
function nextAuthoringFraming(previous = '') {
  const before = String(previous ?? '').trim()
  return AUTHORING_FRAMINGS.find((framing) => framing !== before)
}

/**
 * What happens after the history just read: an authoring commission or the one
 * spec examination immediately before the automatic scarce-lane threshold.
 * `escalationRounds` is injectable only so the test can prove every boundary
 * moves with the exported constant instead of hiding a round-number literal.
 */
export function nextAuthoringStep({
  records = [],
  point = '',
  reworkRounds,
  escalationRounds = SCARCE_ESCALATION_ROUNDS,
} = {}) {
  const history = authorRoundHistory(records, point)
  const examinationRound = escalationRounds - 1
  const overridden = Number.isFinite(reworkRounds) ? Math.max(0, Math.trunc(reworkRounds)) : null
  const freshRounds = overridden ?? history.freshRounds
  const round = overridden ?? history.unsuccessfulRounds
  if (freshRounds === examinationRound && !history.examination) {
    return {
      kind: 'spec-examination',
      round,
      framing: '',
      history,
      reason:
        `${freshRounds} fresh attempts have reached the step before the escalation threshold of ${escalationRounds}; ` +
        'the point text and generated brief must be examined against every finding before another commission',
    }
  }
  const previous = [...history.rounds].reverse().find((round) => round.freshRound !== null)?.framing ?? ''
  const framing = round > 1 ? nextAuthoringFraming(previous) : ''
  return {
    kind: 'commission',
    round,
    framing,
    history,
    reason: framing
      ? `re-authoring round ${round} is decorrelated with a hostile-tester framing`
      : `authoring round ${round} is the unframed baseline`,
  }
}

/** The whole ledger-derived history as a compact dispatcher-facing reading. */
export function formatAuthorRoundHistory(history = {}) {
  const rounds = Array.isArray(history?.rounds) ? history.rounds : []
  const oneLine = (value) =>
    String(value ?? '')
      .replace(/\s+/g, ' ')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
      .trim()
  const lines = [
    `  review record: ${Number(history?.unsuccessfulRounds) || 0} unsuccessful round(s); ` +
      `${Number(history?.freshRounds) || 0} fresh attempt(s)`,
  ]
  if (!rounds.length) lines.push('  round history: no unsuccessful reviews recorded')
  for (const round of rounds) {
    if (round.repeat) {
      lines.push(`  ledger review ${round.ledgerRound}: REPEAT — ${round.repeat}`)
      continue
    }
    lines.push(
      `  round ${round.freshRound}: ${round.framing ? `framing — ${oneLine(round.framing)}` : 'unframed baseline'}`,
    )
  }
  const examination = history?.examination
  lines.push(
    examination
      ? `  spec examination: ${oneLine(examination.specExamination)} — ${oneLine(examination.evidence)}`
      : '  spec examination: not recorded',
  )
  return lines.join('\n')
}

/**
 * The words CLAUDE.md §6 itself uses for the hard cases, plus the classic
 * error-prone subjects, which a spec names when it is one.
 *
 * Deliberately SHORT, and it stayed short when the lane it feeds REVERSED (user
 * 18.08.2026). A hit no longer holds work back for the main lane; it now OVERRIDES the
 * verification lane below, which is the one thing that still costs something to
 * get wrong. So a term that merely sounds weighty ("careful", "important") is
 * still not on the list: it would pull picture points out of the main session
 * one plausible adjective at a time. What IS here is either the policy's own
 * wording or a subject where a wrong answer is silent — a race, a lock, a
 * migration of state that exists.
 */
export const HARD_MARKERS = Object.freeze([
  /\bdifficult\b/i,
  /\bcomplex(?:ity)?\b/i,
  /\berror[- ]prone\b/i,
  /\brace (?:condition|window)\b/i,
  /\bconcurren\w+\b/i,
  /\bdeadlock\b/i,
  // The inflections, not one spelling: the comment above promised locks and
  // state migration and the list held only the noun "migration" (cross-vendor
  // review of point 667, P1).
  /\bmigrat\w+\b/i,
  /\block(?:s|ed|ing)?\b/i,
])

/**
 * …and the markers of a point whose VERIFICATION IS THE WORK.
 *
 * Not a difficulty judgment: these name work whose ANSWER is a rendered picture
 * or a browser run. The main session judges that picture whoever authored the
 * code, so for an ORDINARY such point authoring it elsewhere splits it in two
 * and saves little — which is why this lane exists at all.
 *
 * IT IS THE LAST WORD ONLY WHERE NOTHING MARKS THE POINT HARD (user
 * 18.08.2026). A hard or HIGH-criticality picture point is the cross lane's: the branch
 * above returns before this one, and the test file pins that order. What is left
 * here is the ordinary picture point.
 *
 * THEY ERR TOWARDS MATCHING, deliberately (cross-vendor review of point 667,
 * P1): a mechanical rename that merely mentions WebGPU is routed here and costs
 * the cross lane one point. The point's own `Author lane:` tag is the cheap way
 * back.
 *
 * AND THE SUSPICION THAT IT READS BOILERPLATE WAS MEASURED AND IS WRONG (point
 * 1077, 09.09.2026). Every player-visible point writes a Test line naming
 * screenshots and both backends, so this list looked as though it were routing
 * the whole game on house boilerplate: all 99 main-lane points of that day were
 * main for this reason and no other, and none carried a main-lane tag. But
 * cut the standing tail off every point — Test, Refs:, Bundle:, Criticality:,
 * Author lane: — and 97 of those 99 still name a marker in the point's OWN
 * prose. The obvious narrowing would move TWO points, so it was decided against
 * rather than forgotten, and the tag handles those two. Numbers, the rest of the
 * reasoning and the reopening condition: docs/lane-routing.md, "Routed and not
 * commissioned".
 */
export const VERIFICATION_MARKERS = Object.freeze([
  /\bscreenshots?\b/i,
  /\bpictures?\b/i,
  /\brender[- ]verif\w+\b/i,
  /\bboth backends\b/i,
  /\bwebgpu\b/i,
  /\bwebgl\b/i,
  /\bplaywright\b/i,
  /\bbrowser suites?\b/i,
  /\baesthetic\w*\b/i,
  // "visually inspect the banding" is how half the render points are written,
  // and the list had no word for it (same review).
  /\bvisual\w*\b/i,
])

/**
 * An explicit lane tag in the point's own text: `Author lane: cross` (a role, or a lane's
 * family word as older tags spell it).
 *
 * The escape hatch, and the reason the rules below may stay simple. A spec that
 * knows better than the markers says so once, in the work order where it is
 * reviewable, instead of the dispatcher remembering an exception.
 *
 * A TAG IS A LINE OF ITS OWN, not a phrase inside a sentence (cross-vendor
 * review of point 667, P1). Skipping only a quote character immediately in front
 * of it left `"use Author lane: cross for this example"` operative — and a
 * document that DESCRIBES this convention would route the points that quote it.
 * Requiring the line to begin with the tag is both simpler and stricter than
 * chasing quotation, and it is how the tag is meant to be written anyway.
 *
 * The LAST such line wins: a spec revises itself at the end.
 */
export function laneTagIn(body) {
  let found = ''
  let fence = '' // the delimiter that OPENED the current block, or '' outside one
  for (const line of String(body ?? '').split(/\r?\n/)) {
    // A FENCED EXAMPLE IS STILL AN EXAMPLE (third cross-vendor round): the whole
    // purpose is that a document showing the convention cannot route points by
    // showing it, and a code block is where such a document shows it.
    //
    // THE DELIMITER IS REMEMBERED (fourth round): toggling on either marker let
    // a `~~~` inside a backtick block close it — and the tag after it counted.
    // Markdown's rule, followed properly (fifth round): only the SAME character
    // closes, at least as long, with NO info string and at most three spaces of
    // indent — so `~~~javascript` inside a backtick block is content.
    const fenceLine = /^([\s>]*)(`{3,}|~{3,})(.*)$/.exec(line)
    const marker = fenceLine?.[2] ?? ''
    if (marker) {
      const info = (fenceLine[3] ?? '').trim()
      // A TAB IS FOUR COLUMNS, not zero (seventh round): dropping it counted a
      // tab-indented marker as flush, which is the same misclassification one
      // whitespace character further along.
      //
      // AND THE INDENT IS MEASURED FROM THE CONTENT, not from the page (eighth
      // round): a blockquote's own `> ` markers are not indentation, so summing
      // the whole prefix made an ordinary quoted example look over-indented and
      // handed the tag inside it back as operative.
      const indent = [...(fenceLine[1] ?? '').replace(/^[\s>]*>/, '')].reduce(
        (n, c) => (c === '\t' ? n + 4 : c === ' ' ? n + 1 : n),
        0,
      )
      // THE INDENT RULE BINDS THE OPENER TOO (sixth round): four spaces make an
      // indented code block, not a fence, so treating one as an opener swallowed
      // every line after it — suppressing a REAL tag rather than an example.
      if (indent > 3) continue
      if (!fence) {
        fence = marker
        continue
      }
      if (marker[0] === fence[0] && marker.length >= fence.length && !info) fence = ''
      continue
    }
    if (fence) continue
    // A list marker or blockquote may precede it; a quote character may not. The
    // line must also END there (second cross-vendor round): without the closing
    // anchor, `Author lane: cross is the example spelling` was still an operative
    // tag, which is the same sentence-inside-a-document case one round on.
    // A tag names a role, or — as the work order's older tags do — a lane's family word
    // (current or retired, point 1061), resolved through the lane records so an
    // operator's older tag routes to the lane it means instead of being dropped.
    const m = /^[\s>*-]*author lane:\s*([a-z]+)\s*[.;,)`'"]*\s*$/i.exec(line)
    if (m) {
      const word = m[1].toLowerCase()
      const role = AUTHOR_LANES.includes(word) ? word : laneByFamily(word)?.role
      if (role && AUTHOR_LANES.includes(role)) found = role
    }
  }
  return found
}

/**
 * The standing PROCESS phrases, which name verification without the point being
 * about any — measured against the real queue on the way in (13.08.2026).
 *
 * "Claude reviews, runs the suites and judges the picture" is how CLAUDE.md §6
 * describes the role swap, so every point that so much as MENTIONS the workflow
 * routed itself to the picture lane — point 667, which builds this file, first
 * among them. They are cut out of the text before the markers are asked, which
 * is narrower than dropping the marker: a point whose SUBJECT is a picture still
 * says so in its own words.
 */
const PROCESS_PHRASES = /\b(?:judges?|judging|judged) the picture\b|\bpicture judg\w+\b/gi

/** The markers of a list that actually match, as the phrases they matched. */
function hits(markers, text) {
  const subject = String(text).replace(PROCESS_PHRASES, ' ')
  return markers.map((re) => re.exec(subject)?.[0]).filter(Boolean)
}

/**
 * THE DECISION. PURE.
 *
 * Inputs — optional except `scarceState`, which `requireState` demands:
 *   body         the point's text out of the work order
 *   criticality  its tag, as `criticalityOf` reads it ('low' | 'med' | 'high')
 *   reworkRounds fresh unsuccessful review rounds (`authorRoundHistory().freshRounds`)
 *   override     a lane the caller insists on, beating even the tag
 *   scarceState  the scarce lane's switch state
 *
 * Returns { lane, model, refused, why, signals } — `why` is the ordered list of
 * reasons, first the deciding one. An unknown switch throws rather than choosing
 * a direction; an unavailable explicitly requested scarce lane is a refusal.
 */
export function authorLaneFor({ body = '', criticality = null, reworkRounds = 0, override = '', scarceState } = {}) {
  const state = requireState(scarceState)
  const scarceOn = laneIsOn(state)
  const text = String(body ?? '')
  const tag = laneTagIn(text)
  const hard = hits(HARD_MARKERS, text)
  const verification = hits(VERIFICATION_MARKERS, text)
  const rounds = Number.isFinite(reworkRounds) ? Math.max(0, Math.trunc(reworkRounds)) : 0
  const signals = { tag, criticality: criticality ?? null, reworkRounds: rounds, hard, verification }
  // A CLOSED ESCALATION SAYS SO WHERE IT WOULD HAVE FIRED. Silently routing
  // such a point onward would read as "the threshold was never reached".
  const withheld =
    !scarceOn && rounds >= SCARCE_ESCALATION_ROUNDS
      ? `${rounds} unsuccessful review rounds would have reached the §6 escalation threshold of ` +
        `${SCARCE_ESCALATION_ROUNDS}, but ${laneRefusalReason(state)}`
      : ''
  const decide = (lane, reason) => ({
    lane,
    model: LANE_MODEL[lane],
    refused: false,
    why: withheld ? [reason, withheld] : [reason],
    signals,
  })
  const refuseScarce = (reason) => ({
    lane: '',
    model: '',
    refused: true,
    why: [reason, laneRefusalReason(state)],
    signals,
  })

  if (AUTHOR_LANES.includes(String(override).toLowerCase())) {
    const role = String(override).toLowerCase()
    if (role === 'scarce' && !scarceOn) return refuseScarce(`the caller asked for the ${override} lane explicitly`)
    return decide(role, `the caller asked for the ${override} lane explicitly`)
  }
  // A SCARCE TAG IS AN OPERATOR DECISION, not an automatic signal. It therefore
  // remains immediate while tags naming the ordinary lanes yield once the
  // recorded escalation boundary has actually been reached.
  if (tag === 'scarce') {
    return scarceOn
      ? decide(tag, 'the point itself carries a scarce-lane `Author lane:` tag')
      : refuseScarce('the point itself carries a scarce-lane `Author lane:` tag')
  }
  if (scarceOn && rounds >= SCARCE_ESCALATION_ROUNDS) {
    return decide(
      'scarce',
      `${rounds} unsuccessful review rounds reached the §6 escalation threshold of ${SCARCE_ESCALATION_ROUNDS}`,
    )
  }
  if (tag) return decide(tag, `the point itself carries a ${tag}-lane \`Author lane:\` tag`)
  // A HARD OR CRITICAL POINT GOES STRAIGHT TO THE CROSS LANE (user 18.08.2026). It used
  // to be held back for the main lane — and before that routed to the scarce lane — and
  // it now takes the direct route, ABOVE the verification lane: the user was asked which
  // of the two wins and answered that these go to the cross lane as well. The picture is still
  // judged here whoever authored it, so only the AUTHORING moves.
  if (criticality === 'high') {
    return decide('cross', 'the point is tagged HIGH criticality — hard and critical work goes straight to the cross lane')
  }
  if (hard.length) {
    return decide('cross', `the spec names it a hard case (${hard.join(', ')}) — hard cases go straight to the cross lane`)
  }
  if (verification.length) {
    return decide('main', `its VERIFICATION is the work (${verification.join(', ')}) — the main session judges that anyway`)
  }
  return decide('cross', 'mechanical or mid-difficulty, and nothing marks it otherwise')
}

/** One line per point, for the dispatcher's report. PURE. */
export function formatLaneLine({ number = '', lane = '', why = [] } = {}) {
  return `  ${String(number).padStart(4)}  ${String(lane).padEnd(6)}  ${why[0] ?? ''}`
}

/**
 * The report over a whole queue: the counts per lane, then a line per point.
 *
 * The counts come first because the question this answers is "how much actually
 * moves", and a list of forty lines does not answer it (point 667's own measure:
 * the lever is judged by what it shifts, not by having been built).
 */
export function formatLaneReport(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  const reportLanes = [...AUTHOR_LANES, 'blocked']
  const counts = reportLanes
    .map((lane) => `${lane} ${list.filter((r) => (lane === 'blocked' ? r.refused : r.lane === lane)).length}`)
    .join(' · ')
  return [
    `author-routing: ${list.length} open point(s) — ${counts}`,
    ...list.map((row) => formatLaneLine(row)),
  ].join('\n')
}
