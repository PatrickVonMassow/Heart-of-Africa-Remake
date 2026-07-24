// Decision logic for the batch doctor (scripts/batch-doctor.mjs): after a
// parallel-session incident the OWNER must prove the repo was not corrupted by
// concurrent writes — and if it was, prefer THROWING AWAY suspect work
// (recoverably: rescue branch + stash, everything logged) over leaving a
// corrupted tree. Pure and Vitest-covered (scripts/batch-doctor-core.test.mjs);
// the wrapper gathers the git state and executes the plan.

/**
 * Plan the remediation for the observed repo state.
 * state = {
 *   branch,                 // current branch of the main checkout
 *   mergeInProgress,        // MERGE_HEAD exists (half-done merge)
 *   dirtyFiles: [..],       // uncommitted paths (porcelain)
 *   conflictMarkers,        // tracked files contain <<<<<<< markers
 *   divergence: { ahead, behind },  // main vs origin/main
 *   tasksParses,            // TASKS.md checkbox format parses
 *   parallelDetected,       // a parallel session was live during the window
 * }
 * Returns an ordered list of actions:
 *   { action, level: 'auto' | 'repair' | 'alert', reason }
 * 'auto'   — safe, run on every doctor invocation
 * 'repair' — destructive-looking (still fully recoverable), runs only with --repair
 * 'alert'  — cannot be fixed mechanically; report loudly
 */
export function planRemediation(state) {
  const plan = []
  const div = state.divergence ?? { ahead: 0, behind: 0 }

  if (state.mergeInProgress) {
    plan.push({
      action: 'abort-merge',
      level: 'repair',
      reason: 'A merge is half done (MERGE_HEAD exists) — a concurrent session likely interrupted it. Abort restores the pre-merge state.',
    })
  }

  if ((state.dirtyFiles?.length ?? 0) > 0 && (state.parallelDetected || state.conflictMarkers)) {
    plan.push({
      action: 'quarantine-stash',
      level: 'repair',
      reason:
        'Uncommitted changes exist in the shared tree during/after a parallel-session window — they cannot be attributed to one author. Quarantine them in a stash (recoverable, named, logged) rather than build on them.',
    })
  }

  if (div.ahead > 0 && div.behind > 0) {
    plan.push({
      action: 'rescue-and-reset',
      level: 'repair',
      reason:
        'Local main and origin/main DIVERGED — the two-session signature. Preserve local main on a rescue/ branch, then hard-reset main to origin/main (the published, known-good lineage). Nothing is lost; the rescue branch is named in the log.',
    })
  } else if (div.behind > 0 && div.ahead === 0) {
    plan.push({
      action: 'fast-forward',
      level: 'auto',
      reason: 'Local main is strictly behind origin/main — fast-forward to the published state.',
    })
  }
  // ahead-only is the NORMAL owner state (unpushed commits) — no action.

  if (!state.tasksParses) {
    plan.push({
      action: 'alert-tasks-format',
      level: 'alert',
      reason: 'TASKS.md checkboxes no longer parse — a concurrent edit may have mangled the work order. Fix by hand; never read this as "batch complete".',
    })
  }

  if (state.conflictMarkers) {
    plan.push({
      action: 'alert-conflict-markers',
      level: 'alert',
      reason: 'Tracked files contain conflict markers (<<<<<<<) — a conflicted merge was committed or left unresolved. Inspect and fix by hand.',
    })
  }

  return plan
}

/** True when the plan requires a --repair run (any repair-level action). */
export function needsRepair(plan) {
  return plan.some((a) => a.level === 'repair')
}

/** True when the state is fully consistent (empty plan). */
export function isConsistent(plan) {
  return plan.length === 0
}
