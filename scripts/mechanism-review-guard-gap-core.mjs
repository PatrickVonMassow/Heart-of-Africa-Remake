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
  if (size <= cap) return { gap: false, reason: 'fits', measuredChars: size, budget: cap }
  if (planner && planner.available) {
    if (planner.covers) return { gap: false, reason: 'splits', measuredChars: size, budget: cap }
    return {
      gap: true,
      reason: 'split-cannot-cover',
      measuredChars: size,
      budget: cap,
      uncoverable: [...(planner.uncoverable ?? [])].map((p) => String(p)),
    }
  }
  return { gap: true, reason: 'no-splitter', measuredChars: size, budget: cap }
}

/**
 * The report the guard prints INSTEAD of its refusal while the gap holds. It
 * names the range, the measured size and the budget — the caller must be able
 * to see the gap before a round is spent on it — and states the resume rule,
 * so nobody reads the stand-down as a cleared gate.
 */
export function formatReviewGap({ baseline = '', head = '', decision = {} } = {}) {
  const range = `${String(baseline).slice(0, 12)}..${String(head).slice(0, 12)}`
  const lines = [
    `mechanism-review-guard: REVIEW GAP — the material for ${range} cannot be assembled for review:`,
    `  measured ${decision.measuredChars} characters against the ${decision.budget}-character round budget.`,
  ]
  if (decision.reason === 'no-splitter') {
    lines.push('  This tree carries no pass-splitting tool, so no round can hold the range at all.')
  }
  if (decision.reason === 'split-cannot-cover' && decision.uncoverable?.length) {
    lines.push(
      '  Even a split into passes cannot carry these — no pass can hold them, not even their',
      '  diff alone:',
      ...decision.uncoverable.map((p) => `    ${p}`),
    )
  }
  lines.push(
    '  A review nobody can produce is not demanded: this turn may end. Recorded verdicts on',
    '  this range keep their standing — the gap suspends the demand, never the record. The',
    '  gate RESUMES blocking the moment the material fits, or splits into coverable passes.',
  )
  return lines.join('\n')
}
