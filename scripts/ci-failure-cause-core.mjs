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

/** The names of the jobs that failed in this run; [] when the list is unusable. */
export function failedJobNames(jobs) {
  if (!Array.isArray(jobs)) return []
  return jobs
    .filter((j) => j && String(j.status ?? 'completed') === 'completed')
    .filter((j) => FAILED_JOB_CONCLUSIONS.has(String(j.conclusion ?? '')))
    .map((j) => String(j.name ?? ''))
    .filter(Boolean)
}

/**
 * Where the cause of a red run lies.
 * @param {{workflowName?:string, conclusion?:string, jobs?:object[]|null}} input
 * @returns {{cause:'repository'|'external'|'unknown', failedJobs:string[], detail:string, remedy:string}}
 */
export function classifyFailureCause(input) {
  try {
    const { workflowName = '', conclusion = '', jobs = null } = input ?? {}
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

    const failed = failedJobNames(jobs)
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
