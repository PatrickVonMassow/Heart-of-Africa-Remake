// THE REVIEW-GAP RULING (point 714): what the mechanism gate does while a
// range's review material CANNOT BE ASSEMBLED at all.
//
// The trap this closes was live on `main` on 18.08.2026: a range had grown past
// the material budget, every review round refused it as truncated, the standing
// verdicts said do-not-merge FOR THAT TRUNCATION — and the guard demanded, on
// every turn, a review no caller could produce. The work order's clause
// (c06a02d2) is built here: the guard MEASURES the range against the budget,
// and while the material genuinely cannot be assembled it REPORTS that gap —
// naming the range, the measured size and the budget — and lets the turn end.
// It resumes blocking the moment the material fits (or splits into coverable
// passes) again.
//
// NOT a blanket waiver, in three ways this file is the single wording of:
//   - the ruling is MEASURED per range against the budget, every time;
//   - a measurement that FAILED never rules a gap — a check that cannot tell
//     whether the material fits says so and keeps the gate blocking, because
//     waiving a review on an unmeasured claim is the unearned clearance this
//     whole point exists to prevent;
//   - where a pass-splitting tool is present and its plan COVERS the range,
//     there is no gap — the material can be produced pass by pass, so the
//     demand stands.
//
// Pure on purpose: the guard wrapper (mechanism-review-guard-gap.mjs) feeds
// the measurement in; every branch below is pinned from the Vitest layer.

/**
 * The per-round material budget this ruling measures against. It MIRRORS
 * `MATERIAL_BUDGET_CHARS` in scripts/review-material-core.mjs — the test pins
 * them equal wherever that module exists — but is declared here on its own so
 * this ruling works in a tree that does not carry the splitting tool yet
 * (the clause is cherry-picked ahead of the tool to open the live trap).
 */
export const REVIEW_GAP_BUDGET_CHARS = 200_000

/** MIRRORS `MAX_PASS_TOTAL` in scripts/review-material-core.mjs, for the same
 *  reason as the budget mirror above: the recorder accepts no split of more
 *  than this many passes, so `budget × this` is the most material ANY
 *  recordable split can carry — a proven floor above it needs no plan to rule. */
export const REVIEW_GAP_MAX_PASS_TOTAL = 256

/** What DELIVERY adds to the raw parts in a single no-manifest round, mirrored
 *  from assembleMaterial (the section frames and the receipt line, then one
 *  header and its separators per carried file). The no-splitter ruling reads
 *  the rendered floor through these; where the tool exists its own fit ruling
 *  outranks this estimate. The per-file constant is the header's fixed text
 *  plus its two separators, deliberately a couple of characters ABOVE the real
 *  cost: at the margin an over-estimate reports a gap the assembly would just
 *  have fitted (fail-open by a hair), while an under-estimate re-arms the
 *  permanent trap this file exists to end. */
export const REVIEW_GAP_FIXED_DELIVERY_CHARS = 96
export const REVIEW_GAP_PER_FILE_DELIVERY_CHARS = 40

/** The rendered floor of a no-splitter round: the raw parts plus what delivery
 *  adds. Pure, so the wrapper and the tests read the same arithmetic. */
export function estimateRenderedChars({ measuredChars = 0, filePaths = [] } = {}) {
  const parts = Number(measuredChars) || 0
  let overhead = REVIEW_GAP_FIXED_DELIVERY_CHARS
  for (const p of filePaths ?? []) overhead += REVIEW_GAP_PER_FILE_DELIVERY_CHARS + String(p ?? '').length
  return parts + overhead
}

/**
 * Rule on the gap for ONE range.
 *
 *   measuredChars     what the range's material assembles to (diffstat + patch
 *                     + every touched path's current content), in characters
 *   budget            the per-round ceiling (defaults to the mirror above)
 *   planner           what the pass-splitting tool said, or null where none
 *                     exists: { available, covers, uncoverable: [path…] } —
 *                     `covers` means every pass of its plan fits, so the
 *                     material CAN be produced
 *   measurementError  why the measurement failed, when it did
 *
 * Returns { gap, reason, measuredChars?, budget, uncoverable? } with reason one
 * of: 'unmeasured' (no ruling — keep blocking), 'fits' (keep blocking, the
 * ordinary demand), 'splits' (keep blocking — review it in passes),
 * 'split-cannot-cover' (GAP), 'no-splitter' (GAP).
 */
export function decideReviewGap({
  measuredChars = null,
  budget = REVIEW_GAP_BUDGET_CHARS,
  planner = null,
  measurementError = '',
  oversizeProven = false,
  renderedChars = null,
} = {}) {
  const cap = Math.max(0, Number(budget) || 0) || REVIEW_GAP_BUDGET_CHARS
  // An ABSENT measurement is not the number zero: Number(null) is 0, and a
  // missing reading must never rule 'fits'.
  const size = measuredChars === null || measuredChars === undefined ? Number.NaN : Number(measuredChars)
  if (measurementError || !Number.isFinite(size) || size < 0) {
    // CANNOT TELL WHETHER IT FIT: say so, and do not assume. No gap is ruled,
    // so the gate keeps blocking — the failure is named for the caller.
    return {
      gap: false,
      reason: 'unmeasured',
      detail: String(measurementError || 'the material size could not be measured'),
      budget: cap,
    }
  }
  // A READING THAT OVERFLOWED ITS BUFFER IS A MEASUREMENT, NOT A FAILURE
  // (landing-round pass 3): git output past the measurement buffer used to
  // throw, rule 'unmeasured' and keep blocking — so material large enough to
  // be UNASSEMBLABLE BY NECESSITY recreated the permanent trap this ruling
  // exists to end. What the overflow proves is a FLOOR: at least `size`
  // characters. Above the widest recordable split (budget × max pass total)
  // no plan can exist and the gap is proven without one; a floor below that
  // ceiling proves nothing either way, and an unproven claim keeps blocking.
  if (oversizeProven) {
    if (size > cap * REVIEW_GAP_MAX_PASS_TOTAL) {
      return { gap: true, reason: 'beyond-any-split', measuredChars: size, floor: true, budget: cap }
    }
    return {
      gap: false,
      reason: 'unmeasured',
      detail: `the material overflowed the measurement buffer (a floor of ${size} characters, which proves nothing at this budget)`,
      budget: cap,
    }
  }
  // THE SPLITTER'S OWN FIT RULING OUTRANKS THE RAW SIZE (final-round pass 3):
  // the raw sum omits what delivery adds — manifest, section headers, the
  // receipt — so material just over the budget once rendered read as fitting
  // here. Where the tool measured, its answer is the answer; the bare size
  // rules only in a tree without the tool.
  if (planner && planner.available) {
    if (planner.fits === true) return { gap: false, reason: 'fits', measuredChars: size, budget: cap }
    if (planner.covers) return { gap: false, reason: 'splits', measuredChars: size, budget: cap }
    return {
      gap: true,
      reason: 'split-cannot-cover',
      measuredChars: size,
      budget: cap,
      uncoverable: [...(planner.uncoverable ?? [])].map((p) => String(p)),
    }
  }
  // WITHOUT THE TOOL, THE RENDERED FLOOR DECIDES, not the raw sum (landing-
  // round pass 3): delivery adds frames, headers and the receipt, so raw
  // material just under the budget could exceed it once rendered — and the
  // guard then demanded a review the assembly refuses. The wrapper hands the
  // estimate in (estimateRenderedChars); a caller without one falls back to
  // the raw sum, which is the old, narrower reading.
  const rendered = Number.isFinite(Number(renderedChars)) && renderedChars !== null ? Number(renderedChars) : size
  if (Math.max(size, rendered) <= cap) return { gap: false, reason: 'fits', measuredChars: size, budget: cap }
  return { gap: true, reason: 'no-splitter', measuredChars: size, budget: cap }
}

/**
 * The report the guard prints INSTEAD of its refusal while the gap holds. It
 * names the range, the measured size and the budget — the caller must be able
 * to see the gap before a round is spent on it — and states the resume rule,
 * so nobody reads the stand-down as a cleared gate.
 *
 * `standingRecords` is the count of do-not-merge findings the block rests on,
 * taken from the evaluator's STRUCTURED verdict (never from reviewer prose):
 * the gap through the record door (a verdict standing on a range nobody can
 * re-review) must say so explicitly, or the stand-down reads like a clearance
 * of what the record found.
 */
export function formatReviewGap({ baseline = '', head = '', decision = {}, standingRecords = 0 } = {}) {
  const range = `${String(baseline).slice(0, 12)}..${String(head).slice(0, 12)}`
  const lines = [
    `mechanism-review-guard: REVIEW GAP — the material for ${range} cannot be assembled for review:`,
    `  measured ${decision.measuredChars}${decision.floor ? '+' : ''} characters against the ${decision.budget}-character round budget` +
      `${decision.floor ? ' (a proven floor — the reading overflowed the measurement buffer)' : ''}.`,
  ]
  if (decision.reason === 'no-splitter') {
    lines.push('  This tree carries no pass-splitting tool, so no round can hold the range at all.')
  }
  if (decision.reason === 'beyond-any-split') {
    lines.push(
      `  That floor exceeds the widest recordable split (${REVIEW_GAP_MAX_PASS_TOTAL} passes of ` +
        `${decision.budget} characters), so no pass plan can cover this range whatever it cuts.`,
    )
  }
  if (decision.reason === 'split-cannot-cover' && decision.uncoverable?.length) {
    lines.push(
      '  Even a split into passes cannot carry these — no pass can hold them, not even their',
      '  diff alone:',
      ...decision.uncoverable.map((p) => `    ${p}`),
    )
  }
  if (Number(standingRecords) > 0) {
    lines.push(
      `  ${Number(standingRecords)} do-not-merge record(s) stand on this range. Whatever they found`,
      '  keeps its standing — but the re-review that would answer them cannot be assembled,',
      '  so that demand is SUSPENDED for material, not satisfied. It is owed again the',
      '  moment the material fits.',
    )
  }
  lines.push(
    '  A review nobody can produce is not demanded: this turn may end. Recorded verdicts on',
    '  this range keep their standing — the gap suspends the demand, never the record. The',
    '  gate RESUMES blocking the moment the material fits, or splits into coverable passes.',
  )
  return lines.join('\n')
}

/**
 * What the guard DOES with a blocking verdict and the gap ruling — the one
 * junction where a do-not-merge could be waved through, so it is pure and
 * pinned (the measured trap of 18.08.2026 entered through this door: a
 * RECORDED do-not-merge on a range nobody could re-assemble blocked every
 * turn on main, and the gap clause keyed only on the missing-record shape).
 *
 * The key is the MEASUREMENT alone, never the verdict's prose: a verdict on a
 * range that fits (or splits into covering passes) keeps blocking exactly as
 * before, whatever it says — the re-review it demands is producible. Only a
 * range no reviewer can be given degrades to the report, and an absent or
 * failed ruling (`gap: false`, reason 'unmeasured') blocks: fail-closed on the
 * judgment, fail-open only on the guard's own crash.
 */
export function guardOutcome({ blocked = false, gap = null } = {}) {
  if (!blocked) return { action: 'clear' }
  if (gap && gap.gap === true) return { action: 'report-gap' }
  return { action: 'block' }
}

/**
 * Which of the CRITICALITY gate's blocking findings may degrade to a gap
 * report, and the range each one's re-review would need.
 *
 * Only a RECORD-BACKED refusal ('unresolved' — a standing do-not-merge /
 * merge-with-fixes — or 'unanswered' — a refusal no later merge record
 * answers) names a range at all: the recorded sha's own commit range, which is
 * what a re-review of that point's work must be able to assemble. A finding
 * with no record ('no-review', 'self-review', 'not-in-history') demands a
 * FRESH review whose sha the caller chooses, so nothing is unassemblable by
 * necessity — any such finding keeps the whole block standing, and this
 * returns null. Null also on an unrecognisable sha: an unmeasurable claim
 * never waives the gate.
 *
 * EVERY record a finding carries is planned, not only the first (round-2
 * pass 2): the gate today puts exactly one record in each of these findings,
 * but this helper must not assume that — one reviewable record among several
 * is a demand somebody can meet, and skipping it would report a gap over it.
 */
export function criticalityGapPlan(findings = []) {
  const entries = []
  for (const f of findings ?? []) {
    if (f?.kind !== 'unresolved' && f?.kind !== 'unanswered') return null
    const records = f?.records ?? []
    if (!records.length) return null
    for (const r of records) {
      const sha = String(r?.sha ?? '')
      if (!/^[0-9a-f]{7,40}$/i.test(sha)) return null
      entries.push({ point: Number(f?.tick?.number ?? Number.NaN), sha })
    }
  }
  return entries.length ? entries : null
}

/**
 * The criticality gate's stand-in for its refusal while EVERY blocking record
 * rests on an unassemblable range. Same three facts per point — range,
 * measured size, budget — and the same resume rule.
 */
export function formatCriticalityGap(entries = []) {
  const lines = [
    'criticality-review-guard: REVIEW GAP — every blocking record stands on a range that',
    'cannot be assembled for review:',
  ]
  for (const e of entries ?? []) {
    lines.push(
      `  point ${e.point} — record ${String(e.sha).slice(0, 12)}: measured ${e.decision?.measuredChars} characters ` +
        `against the ${e.decision?.budget}-character round budget.`,
    )
  }
  lines.push(
    '  The refusals keep their standing — the gap suspends the re-review demand, never the',
    '  record. The gate RESUMES blocking the moment the material fits, or splits into',
    '  coverable passes.',
  )
  return lines.join('\n')
}
