// WHERE a red CI run's cause lies — pure, never throws, Vitest-covered in
// ci-failure-cause-core.test.mjs. Read by ci-status-guard-core.blockReason so
// the Stop block names the REAL remedy.
//
// WHY IT EXISTS (measured 06.08.2026): a Pages deployment stuck on GitHub's
// side turned the deploy workflow red for a commit whose repository content was
// flawless. `ci-status-guard` knew only "red", so it demanded a fixing push that
// could not exist — the fault was not in the repository at all. The handle was
// a Pages-API cancel plus a fresh dispatch, and a guard that cannot tell the two
// apart sends the session looking in the wrong place.
//
// The distinction is STRUCTURAL, not scraped from a log: our build runs in the
// `build` job, and the `deploy` job of the Pages workflow only talks to the
// Pages API. So the failed JOB names the side the fault sits on. Where the job
// list is unavailable the answer is `unknown` — the guard then names both
// paths rather than guessing one.

/** The Pages deploy workflow, by its `name:` (what the Actions API reports). */
export const PAGES_WORKFLOW = 'Deploy to GitHub Pages'

/** Per workflow, the jobs that only ever talk to a GitHub service. A failure
 *  there is never fixable by a push. Everything else is ours by default. */
export const GITHUB_SIDE_JOBS = new Map([[PAGES_WORKFLOW, ['deploy']]])

/** Job conclusions that count as failed (same set the run-level classifier uses). */
const FAILED_JOB_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out', 'startup_failure'])

const UNBLOCK = 'node scripts/pages-deploy-unblock.mjs --cancel'
const REPO_REMEDY =
  'Reproduce the fast gate locally (npm run build && npm run lint && node scripts/audit-check.mjs && ' +
  'npm run test:unit), fix the cause, commit and push — CI green is part of done.'
const PAGES_REMEDY =
  `No push in this repository can clear this. Run \`${UNBLOCK}\` to cancel the stuck deployment, then ` +
  'dispatch "Deploy to GitHub Pages" again and confirm the run goes green.'
const RERUN_REMEDY =
  'No push in this repository can clear a cancellation — re-run the workflow and confirm it goes green.'
const FAMINE_REMEDY =
  'No push in this repository can clear this — not one step of ours ran. Wait for GitHub to answer ' +
  'again, then re-run the workflow and confirm it goes green.'
const WORKFLOW_OR_OUTAGE_REMEDY =
  'Re-run the workflow. If it goes green it was an outage on GitHub\'s side. If it dies the same way, ' +
  'the fault is in the workflow FILE — check what the recent commits changed under `.github/workflows/` ' +
  '(a `uses:` reference that resolves nowhere, or a `runs-on` label no runner matches) and fix it there.'

/** The steps the RUNNER contributes to every job. A job that got no further than
 *  these executed nothing of ours, whatever the job is named. `Post <name>`
 *  wrappers are the runner's teardown half of an action and count the same. */
const RUNNER_OWN_STEPS = new Set(['set up job', 'set up runner', 'complete job'])

function isRunnerOwnStep(name) {
  const n = String(name ?? '').trim().toLowerCase()
  return RUNNER_OWN_STEPS.has(n) || n.startsWith('post ')
}

/** The failed jobs themselves; [] when the list is unusable. */
function failedJobs(jobs) {
  if (!Array.isArray(jobs)) return []
  return jobs
    .filter((j) => j && String(j.status ?? 'completed') === 'completed')
    .filter((j) => FAILED_JOB_CONCLUSIONS.has(String(j.conclusion ?? '')))
}

/** The names of the jobs that failed in this run; [] when the list is unusable. */
export function failedJobNames(jobs) {
  return failedJobs(jobs)
    .map((j) => String(j.name ?? ''))
    .filter(Boolean)
}

/**
 * Did this job execute anything of OURS? A job whose step list is empty, or holds
 * only the runner's own steps, never reached a line this repository wrote — so its
 * failure cannot be a defect in the repository, whatever the job is called.
 *
 * WHY BY OBSERVATION, NOT BY NAME (measured 06.08.2026, point 528): the first cut
 * of this module told outside from inside by the job's NAME, with the Pages
 * `deploy` job listed as GitHub-side. Hours later a broad Actions outage killed
 * every run in `Set up job` with `Failed to resolve action download info` — and
 * because the failing job was called `build`, the guard read our own outage as a
 * repository defect and demanded a fixing push that could not exist. A name list
 * is a guess about the world; "no step of ours ran" is an observation and holds
 * in outages nobody has seen yet.
 */
export function ranNothingOfOurs(job) {
  const steps = job?.steps
  if (!Array.isArray(steps)) return false // unknown — never claim an excuse we cannot see
  if (steps.length === 0) return true // never got a runner at all
  return steps.every((s) => isRunnerOwnStep(s?.name))
}

/**
 * Where the cause of a red run lies.
 *
 * `actionable` says whether the remedy is something this machine can DO. Every
 * cause is actionable except the runner famine above: a Pages stall has its
 * cancel command, a cancelled run has its re-run, a repository fault has its
 * fixing push — but an outage that never reached our code leaves nothing to do
 * but wait, and holding the session there stops the batch over a fault that is
 * not ours (point 528). Absent (undefined) means actionable, so every existing
 * caller and every branch below keeps its old behaviour.
 *
 * `workflowsUntouched` must be TRUE — proven by the caller — before a run that
 * executed nothing of ours counts as somebody else's outage; see the branch.
 *
 * @param {{workflowName?:string, conclusion?:string, jobs?:object[]|null, workflowsUntouched?:boolean}} input
 * @returns {{cause:'repository'|'external'|'unknown', actionable?:boolean, failedJobs:string[], detail:string, remedy:string}}
 */
export function classifyFailureCause(input) {
  try {
    const { workflowName = '', conclusion = '', jobs = null, workflowsUntouched } = input ?? {}
    const workflow = String(workflowName ?? '')
    const isPages = workflow === PAGES_WORKFLOW
    const verdict = String(conclusion ?? '').toLowerCase()

    if (verdict === 'cancelled') {
      return {
        cause: 'external',
        failedJobs: failedJobNames(jobs),
        detail: isPages
          ? 'the run was cancelled — a newer push supersedes an older one in the `pages` concurrency group, and a superseded run can leave its Pages deployment in progress'
          : 'the run was cancelled, so it never reached a verdict on the code',
        remedy: isPages ? PAGES_REMEDY : RERUN_REMEDY,
      }
    }

    const failedList = failedJobs(jobs)
    const failed = failedJobNames(jobs)

    // BEFORE any name is consulted: if NO failed job got past the runner's own
    // steps, nothing this repository wrote ever executed. That reading holds for
    // every workflow and every outage, so it comes first (point 528).
    if (failedList.length > 0 && failedList.every(ranNothingOfOurs)) {
      const died = `the failing job is "${failed.join('", "')}", and it executed no step of ours — it died in the runner's own set-up`
      // A BROKEN WORKFLOW FILE DIES IN EXACTLY THIS SHAPE (four-eyes review,
      // 06.08.2026): a typo'd `uses:` reference or an unknown `runs-on` label
      // also fails in `Set up job` with no step of ours run — and that red IS
      // ours, fixable only by a push. The two are indistinguishable from the
      // step list alone, so the caller must PROVE the workflow files were not
      // touched before this counts as somebody else's outage. Without that
      // proof the guard keeps blocking and names both readings.
      if (workflowsUntouched === true) {
        return {
          cause: 'external',
          actionable: false,
          failedJobs: failed,
          detail: `${died}, and no commit since the last green run of this workflow touched \`.github/workflows/\` — so GitHub never got as far as this repository's code`,
          remedy: FAMINE_REMEDY,
        }
      }
      return {
        cause: 'unknown',
        failedJobs: failed,
        detail: `${died}, which is either an outage on GitHub's side or a broken workflow FILE (a bad \`uses:\` reference or \`runs-on\` label dies here too)`,
        remedy: WORKFLOW_OR_OUTAGE_REMEDY,
      }
    }

    const githubSide = GITHUB_SIDE_JOBS.get(workflow) ?? []
    if (failed.length > 0) {
      const outside = failed.filter((n) => !githubSide.includes(n))
      if (outside.length === 0) {
        return {
          cause: 'external',
          failedJobs: failed,
          detail: `the failing job is "${failed.join('", "')}", which only talks to the GitHub Pages API — the build ran in its own job and passed`,
          remedy: PAGES_REMEDY,
        }
      }
      return {
        cause: 'repository',
        failedJobs: failed,
        detail: `the failing job is "${outside.join('", "')}" — that work runs in this repository`,
        remedy: REPO_REMEDY,
      }
    }

    if (isPages) {
      return {
        cause: 'unknown',
        failedJobs: [],
        detail: 'the job list could not be read, so it is unclear whether the build or the Pages deployment failed',
        remedy: `If the deploy job failed: ${PAGES_REMEDY} If the build job failed: ${REPO_REMEDY}`,
      }
    }
    return { cause: 'repository', failedJobs: [], detail: '', remedy: REPO_REMEDY }
  } catch {
    // Pure fail-safe: an internal error must never cost the guard its message.
    return { cause: 'repository', failedJobs: [], detail: '', remedy: REPO_REMEDY }
  }
}
