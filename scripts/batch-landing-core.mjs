// THE LANDING JOURNAL'S STAGES AND CRASH RULE — the slice of step 9 that step 8
// needs (work-order point 834; union M33/M34/M35). The full crash-recoverable
// landing inside scripts/land-point.mjs is 676's remainder; what is settled
// HERE is the vocabulary a landing journal records and what a successor does
// with a journal that stopped mid-way — because reconciliation must classify a
// crashed landing without guessing, and the rule is M34's: repeat any human
// judgment whose completion cannot be proven.
//
// Pure, dark, and imported only by the reconciliation core.

/** The ordered stages of one landing transaction (M33). Everything before
 *  `merge` is judgment and verification; `merge` is the published act; what
 *  follows is bookkeeping toward `landed`. */
export const LANDING_STAGES = Object.freeze([
  'candidate', // candidate SHA and target SHA recorded
  'diff-review', // the human/diff judgment completed
  'gates', // build, lint, unit results recorded
  'picture-webgpu', // first backend judgment, artifact hash recorded (M35)
  'picture-webgl2', // second backend judgment, artifact hash recorded (M35)
  'merge', // the merge SHA recorded — the published act
  'bookkeeping', // work-order update recorded
  'board', // board update recorded
  'landed', // terminal
])

/** What a successor does with a landing journal that stopped at `stage`.
 *
 *  Before `merge`, NOTHING published exists and M34 applies in full: the
 *  successor repeats the judgments — a diff review or picture verdict whose
 *  completion is recorded is still repeated when any LATER unproven judgment
 *  depends on the same tree, so the rule collapses to restart-from-candidate.
 *  That discards only work that is cheap to redo and never discards evidence.
 *
 *  At `merge` the act may or may not have published: the recorded merge SHA is
 *  resolved against the REMOTE like any publication intent (mechanism 2) — the
 *  reconciliation core owns that resolution, and this function only says that
 *  it must happen.
 *
 *  After `merge`, the published act is proven and only bookkeeping remains:
 *  resume forward, repeating nothing that is already journalled. */
export function landingCrashDecision({ stage = null } = {}) {
  const index = LANDING_STAGES.indexOf(stage)
  if (index < 0) return { ok: false, reason: `unknown landing stage: ${String(stage)}` }
  if (stage === 'landed') return { ok: true, action: 'done', reason: 'the landing completed; nothing to recover' }
  if (index < LANDING_STAGES.indexOf('merge')) {
    return {
      ok: true,
      action: 'restart',
      reason: 'the crash fell before the published act; every unproven judgment is repeated (M34), so the landing restarts from candidate',
    }
  }
  if (stage === 'merge') {
    return {
      ok: true,
      action: 'resolve-merge-against-remote',
      reason: 'the merge may or may not have published; its recorded SHA is resolved against the remote before anything else happens',
    }
  }
  return { ok: true, action: 'resume-bookkeeping', reason: 'the published act is proven; only journalled bookkeeping remains' }
}

/** A boundary is planned only outside a landing (M34): before one starts, or
 *  after its journal reaches `landed`. */
export function landingAllowsBoundary({ stage = null } = {}) {
  if (stage === null || stage === 'landed') return { ok: true }
  return { ok: false, reason: `a landing is at ${stage}; a planned boundary waits for landed or happens before the landing starts` }
}
