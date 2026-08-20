// WHICH AUTHORING LANE A POINT GOES TO (point 667). rule:model-policy@7f2f2a79
//
// The user pays two vendors, and authoring is the largest single item of the
// spend, so it is split across both rather than sitting on one. It does NOT all
// move: CLAUDE.md §6 names three lanes with different jobs, and the cut between
// them is decided HERE, from the point's own text, rather than by whoever
// happens to be dispatching. The SPLIT is the standing policy; how full each
// pool happens to be on a given day is not a reason this file knows about
// (cross-vendor audit 17.08.2026 — the header used to argue from one day's
// quota reading, which then outlived it).
//
//   sol    GPT-5.6 Sol authors the points, and Claude then reviews, runs the
//          suites, judges the picture and lands. Since 18.08.2026 that includes
//          the HARD and CRITICAL ones — difficult, complex, error-prone or
//          tagged HIGH criticality goes STRAIGHT here, where it used to be held
//          back for Opus.
//   opus   Opus 5 keeps what only the main lane can honestly finish: a point
//          whose VERIFICATION is the work (a picture judged on both backends is
//          the main session's job, so authoring it elsewhere buys nothing) —
//          and only while nothing marks that point hard, because the user's
//          18.08. ruling outranks this lane, not the other way round.
//   fable  Fable 5 is the escalation described by CLAUDE.md §6. Its weekly
//          pool is the scarcest of the three, so the CUT sends nothing else
//          there — a point's own Fable tag and the caller's override still can,
//          and both are deliberate.
//
// WHY A FUNCTION RATHER THAN A JUDGMENT CALL: the point says the cut is named,
// not guessed. A dispatcher's taste is not reviewable and drifts with whoever
// holds the batch; this is pure, tested, and answers the same way twice — and
// where it answers wrongly, the fix is a case in its test file, not a habit.
//
// It is ADVISORY, not a gate. Nothing blocks on it: the reasons travel with the
// verdict so a dispatcher can see WHY and override with a tag in the point
// itself. Side-effect free; the work-order reading belongs to
// scripts/author-sol.mjs. Pinned by author-routing-core.test.mjs.

/** The authoring lanes, in the order this file describes them. */
export const LANES = Object.freeze(['sol', 'fable', 'opus'])

/** Who each lane is, for the report a dispatcher reads. */
export const LANE_MODEL = Object.freeze({
  sol: 'GPT-5.6 Sol',
  fable: 'Fable 5',
  opus: 'Opus 5',
})

/** User decision 19.08.2026: Fable escalation begins at this many unsuccessful review rounds. */
export const FABLE_ESCALATION_ROUNDS = 5

/** The last Sol/Opus round pauses for a spec reading before Fable may take it. */
export const SPEC_EXAMINATION_ROUND = FABLE_ESCALATION_ROUNDS - 1

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

/** A pre-dispatch receipt written by author-sol for a round governed by this mechanism. */
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

/** The examiner is always the other vendor and never the scarce Fable pool. */
export function specExaminerFor(history = {}, fallbackAuthor = '') {
  const rounds = Array.isArray(history?.rounds) ? history.rounds : []
  const author = [...rounds].reverse().find((round) => round.authoredBy)?.authoredBy || String(fallbackAuthor)
  if (/\bsol\b/i.test(author)) {
    return { vendor: 'claude', model: 'Opus 5', route: 'claude-read', author }
  }
  return { vendor: 'sol', model: 'GPT-5.6 Sol', route: 'ask-sol', author }
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
 * progress toward the scarce Fable lane.
 */
export function authorRoundHistory(records = [], point = '') {
  const wanted = Number(point)
  if (!Number.isInteger(wanted) || wanted < 0) {
    return { unsuccessfulRounds: 0, freshRounds: 0, rounds: [], examination: null }
  }
  const rows = Array.isArray(records) ? records : []
  // This is also the number of the NEXT commission: the first review row is
  // the outcome of round zero, the second the outcome of round one, and so on.
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
        return expectedExaminer.route === 'claude-read'
          ? /\bopus\b/i.test(String(record?.model))
          : /\bsol\b/i.test(String(record?.model))
      }) ?? null
  return { unsuccessfulRounds: rounds.length, freshRounds, rounds, examination }
}

/** Pick a known hostile-tester stance that is not the preceding one. */
export function nextAuthoringFraming(previous = '') {
  const before = String(previous ?? '').trim()
  return AUTHORING_FRAMINGS.find((framing) => framing !== before) ?? AUTHORING_FRAMINGS[0]
}

/**
 * What happens after the history just read: an authoring commission or the one
 * spec examination immediately before the automatic Fable threshold.
 * `escalationRounds` is injectable only so the test can prove every boundary
 * moves with the exported constant instead of hiding a round-number literal.
 */
export function nextAuthoringStep({
  records = [],
  point = '',
  reworkRounds,
  escalationRounds = FABLE_ESCALATION_ROUNDS,
} = {}) {
  const history = authorRoundHistory(records, point)
  const examinationRound =
    escalationRounds === FABLE_ESCALATION_ROUNDS ? SPEC_EXAMINATION_ROUND : escalationRounds - 1
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
        `${freshRounds} fresh attempts have reached the step before the Fable escalation threshold of ${escalationRounds}; ` +
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
 * 18.08.2026). A hit no longer holds work back for Opus; it now OVERRIDES the
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
 * 18.08.2026). A hard or HIGH-criticality picture point is Sol's: the branch
 * above returns before this one, and the test file pins that order. What is left
 * here is the ordinary picture point.
 *
 * THEY ERR TOWARDS MATCHING, deliberately (cross-vendor review of point 667,
 * P1): a mechanical rename that merely mentions WebGPU is routed here and costs
 * the Sol lane one point. The point's own `Author lane:` tag is the cheap way
 * back.
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
 * An explicit lane tag in the point's own text: `Author lane: sol`.
 *
 * The escape hatch, and the reason the rules below may stay simple. A spec that
 * knows better than the markers says so once, in the work order where it is
 * reviewable, instead of the dispatcher remembering an exception.
 *
 * A TAG IS A LINE OF ITS OWN, not a phrase inside a sentence (cross-vendor
 * review of point 667, P1). Skipping only a quote character immediately in front
 * of it left `"use Author lane: sol for this example"` operative — and a
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
    // anchor, `Author lane: sol is the example spelling` was still an operative
    // tag, which is the same sentence-inside-a-document case one round on.
    const m = /^[\s>*-]*author lane:\s*(sol|fable|opus)\s*[.;,)`'"]*\s*$/i.exec(line)
    if (m) found = m[1].toLowerCase()
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
 * Inputs — all optional, because a caller rarely has all of them:
 *   body         the point's text out of the work order
 *   criticality  its tag, as `criticalityOf` reads it ('low' | 'med' | 'high')
 *   reworkRounds completed reviews of this point whose verdict was not a pass
 *   override     a lane the caller insists on, beating even the tag
 *
 * Returns { lane, model, why, signals } — `why` is the ordered list of reasons,
 * first the deciding one. It NEVER throws and never answers nothing: an empty
 * input is a point with no signal against it, which is the mechanical case.
 */
export function authorLaneFor({ body = '', criticality = null, reworkRounds = 0, override = '' } = {}) {
  const text = String(body ?? '')
  const tag = laneTagIn(text)
  const hard = hits(HARD_MARKERS, text)
  const verification = hits(VERIFICATION_MARKERS, text)
  const rounds = Number.isFinite(reworkRounds) ? Math.max(0, Math.trunc(reworkRounds)) : 0
  const signals = { tag, criticality: criticality ?? null, reworkRounds: rounds, hard, verification }
  const decide = (lane, reason) => ({ lane, model: LANE_MODEL[lane], why: [reason], signals })

  if (LANES.includes(String(override).toLowerCase())) {
    return decide(String(override).toLowerCase(), `the caller asked for the ${override} lane explicitly`)
  }
  // A FABLE TAG IS AN OPERATOR DECISION, not an automatic signal. It therefore
  // remains immediate while tags naming the ordinary lanes yield once the
  // recorded escalation boundary has actually been reached.
  if (tag === 'fable') return decide(tag, 'the point itself carries `Author lane: fable`')
  if (rounds >= FABLE_ESCALATION_ROUNDS) {
    return decide(
      'fable',
      `${rounds} unsuccessful review rounds reached the §6 escalation threshold of ${FABLE_ESCALATION_ROUNDS}`,
    )
  }
  if (tag) return decide(tag, `the point itself carries \`Author lane: ${tag}\``)
  // A HARD OR CRITICAL POINT GOES STRAIGHT TO SOL (user 18.08.2026). It used to
  // be held back for Opus — and before that routed to Fable — and it now takes
  // the direct route, ABOVE the verification lane: the user was asked which of
  // the two wins and answered that these go to Sol as well. The picture is still
  // judged here whoever authored it, so only the AUTHORING moves.
  if (criticality === 'high') {
    return decide('sol', 'the point is tagged HIGH criticality — hard and critical work goes straight to Sol')
  }
  if (hard.length) {
    return decide('sol', `the spec names it a hard case (${hard.join(', ')}) — hard cases go straight to Sol`)
  }
  if (verification.length) {
    return decide('opus', `its VERIFICATION is the work (${verification.join(', ')}) — the main session judges that anyway`)
  }
  return decide('sol', 'mechanical or mid-difficulty, and nothing marks it otherwise')
}

/** One line per point, for the dispatcher's report. PURE. */
export function formatLaneLine({ number = '', lane = '', why = [] } = {}) {
  return `  ${String(number).padStart(4)}  ${String(lane).padEnd(5)}  ${why[0] ?? ''}`
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
  const counts = LANES.map((lane) => `${lane} ${list.filter((r) => r.lane === lane).length}`).join(' · ')
  return [
    `author-routing: ${list.length} open point(s) — ${counts}`,
    ...list.map((row) => formatLaneLine(row)),
  ].join('\n')
}
