// Pure decisions for the two feedback loops measured on 20.08.2026.
//
// A claim used to be acted on only by the Stop hook. On 20.08, at least seven
// response boundaries passed while the read-only preflight correctly said
// `claim: "release"`, but the hand-back did not run. The leading hypothesis is
// that the owner kept ending responses in `tool_use`; its transcript was not
// identified, however, and a stale board card stopping the Stop chain at
// dashboard-guard before batch-progress-guard is an unexamined alternative.
// Counting on PostToolUse fixes either path. `advanceClaimSurvival` counts
// distinct assistant responses without confusing parallel calls for several.
//
// The same run repaired clear-claim-guard repeatedly. In first-parent history,
// four consecutive commits touching one guard family is the largest other run;
// the 20.08 clear-claim run has nine. Four is therefore the measured ordinary
// range, not a guessed round number, and the fifth commit is surfaced once.

export const CLAIM_CLEAN_TURN_LIMIT = 3
export const REPAIR_COMMIT_ORDINARY_MAX = 4

/** Stable identity of the newest assistant response in a JSONL transcript. */
export function latestAssistantTurnKey(transcript = '') {
  let key = ''
  for (const line of String(transcript ?? '').split('\n')) {
    if (!line.trim()) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row?.type !== 'assistant' || !row.message) continue
    const id = row.message.id ?? row.uuid ?? row.timestamp
    if (id) key = String(id)
  }
  return key
}

const emptyClaimState = () => ({
  claimKey: '',
  turns: 0,
  cleanTurns: 0,
  lastTurnKey: '',
  reasonReported: false,
  releaseReported: false,
})

/**
 * Count unique clean assistant response boundaries survived by one claim.
 *
 * `release` is the exact verdict from batch-claim-core's `releaseDecision`.
 * A dirty/unverifiable boundary does not count as clean, but it does count as a
 * response survived: after the same bound it reports WHY release is waiting.
 * Missing ownership, a pause, or no honoured claim resets the observation, so
 * subagents and paused batches can never inherit the duty.
 */
export function advanceClaimSurvival({
  state,
  claimKey = '',
  turnKey = '',
  verdict = 'none',
  ownsBatch = false,
  paused = false,
  limit = CLAIM_CLEAN_TURN_LIMIT,
} = {}) {
  if (!ownsBatch || paused || !claimKey) {
    return { state: emptyClaimState(), report: false, kind: '', count: 0 }
  }

  const prior = state?.claimKey === claimKey ? state : emptyClaimState()
  if (!turnKey || prior.lastTurnKey === turnKey) {
    return { state: { ...prior, claimKey }, report: false, kind: '', count: prior.cleanTurns }
  }

  const turns = (prior.turns ?? prior.cleanTurns ?? 0) + 1
  const cleanTurns = prior.cleanTurns + (verdict === 'release' ? 1 : 0)
  const releaseReport = cleanTurns >= limit && prior.releaseReported !== true
  const reasonReport =
    !releaseReport && verdict !== 'release' && turns >= limit && prior.reasonReported !== true
  const report = releaseReport || reasonReport
  return {
    state: {
      claimKey,
      turns,
      cleanTurns,
      lastTurnKey: turnKey,
      reasonReported: prior.reasonReported === true || reasonReport,
      releaseReported: prior.releaseReported === true || releaseReport,
    },
    report,
    kind: releaseReport ? 'release' : reasonReport ? 'reason' : '',
    count: cleanTurns,
  }
}

/** Guard mechanism families touched by a commit's paths. */
export function guardMechanisms(paths = []) {
  const found = new Set()
  for (const path of Array.isArray(paths) ? paths : []) {
    const match = /^scripts\/(.+?-guard)(?:-core)?(?:\.test)?\.mjs$/.exec(String(path))
    if (match) found.add(match[1])
  }
  return [...found].sort()
}

/** Leading run length, newest commit first, for one mechanism family. */
function leadingRun(commits, mechanism) {
  const run = []
  for (const commit of commits) {
    if (!guardMechanisms(commit?.paths).includes(mechanism)) break
    run.push(commit)
  }
  return run
}

/**
 * Find an extraordinary leading run and report it once as it grows.
 *
 * `commits` contains only heads observed after this owner session's tool calls,
 * newest first. Remembering a SHA already inside the live run suppresses the
 * sixth, seventh, ... reports without suppressing a later, separate run of the
 * same mechanism.
 */
export function detectRepairLoop({
  commits = [],
  state = {},
  ordinaryMax = REPAIR_COMMIT_ORDINARY_MAX,
} = {}) {
  const list = Array.isArray(commits) ? commits.filter((commit) => commit?.sha) : []
  const mechanisms = guardMechanisms(list[0]?.paths)
  let candidate = null
  for (const mechanism of mechanisms) {
    const run = leadingRun(list, mechanism)
    if (!candidate || run.length > candidate.run.length) candidate = { mechanism, run }
  }

  if (!candidate || candidate.run.length <= ordinaryMax) {
    return { state: { reportedSha: '', mechanism: '' }, report: false, count: candidate?.run.length ?? 0 }
  }

  const alreadyReported =
    state?.mechanism === candidate.mechanism &&
    candidate.run.some((commit) => commit.sha === state.reportedSha)
  const report = !alreadyReported
  return {
    state: report
      ? { mechanism: candidate.mechanism, reportedSha: candidate.run[0].sha }
      : state,
    report,
    count: candidate.run.length,
    mechanism: candidate.mechanism,
    commits: candidate.run,
  }
}
