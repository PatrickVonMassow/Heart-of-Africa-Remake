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
const WORKFLOW_DEPENDENCY_REMEDY =
  'Check the workflow file\'s own dependencies against what GitHub still offers — the `runs-on` label and every ' +
  '`uses:` tag. A RETIRED runner image or a YANKED action tag kills an unchanged file in exactly this shape, and ' +
  'only a push pinning a live one fixes it. If they all still resolve, this is an outage and waiting is the remedy.'
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

/** How long a famine-shaped red on an untouched workflow stays credible as
 *  somebody else's outage. MEASURED against the longest degradation this project
 *  has seen (06.08.2026: 15:35 UTC into the evening, ~3.5 h and counting), with
 *  room over it — the point is not to cut a real outage short, it is that a
 *  waiver with NO expiry can excuse a fault forever. */
export const OUTAGE_WAIVER_MAX_MS = 6 * 60 * 60 * 1000

/**
 * Is the outage waiver still credible? (Reviewer residual (a), 06.08.2026.)
 *
 * "The workflow file is byte-identical to its last green run" proves nobody HERE
 * broke it. It does NOT prove nothing broke it: a `runs-on` image retired by
 * GitHub, or an action tag yanked by its publisher, kills an unchanged file in
 * exactly the famine shape — and that red IS fixable, but only by a push. The
 * two are indistinguishable in a single run. They are NOT indistinguishable over
 * TIME: an outage passes, a retired dependency does not. So the waiver expires,
 * and what expires with it is the SILENCE, not the stand-down — see the branch
 * below for why this does not go back to blocking.
 *
 * @param {{famineSince?:number, now?:number, maxMs?:number}} input `famineSince`
 *   is when this workflow was first seen dying this way (the caller's state file);
 *   0/absent means "first sighting", which is always credible.
 * @returns {{credible:boolean, ageMs:number, hours:number}}
 */
export function waiverCredibility(input) {
  try {
    const { famineSince = 0, now = Date.now(), maxMs = OUTAGE_WAIVER_MAX_MS } = input ?? {}
    const since = Number(famineSince) || 0
    if (!since || !Number.isFinite(since)) return { credible: true, ageMs: 0, hours: 0 }
    const ageMs = Math.max(0, Number(now) - since)
    return { credible: ageMs < Number(maxMs), ageMs, hours: Math.round(ageMs / 3_600_000) }
  } catch {
    return { credible: true, ageMs: 0, hours: 0 } // fail-open: never invent a fault
  }
}

/** The page size and page cap the caller uses to read a run's jobs. */
export const JOBS_PAGE_SIZE = 100
export const JOBS_MAX_PAGES = 5

/**
 * Did the caller read ALL of a run's jobs? (Reviewer residual (b), 06.08.2026.)
 *
 * The classifier's central rule is "EVERY failed job ran nothing of ours". A
 * TRUNCATED job list can satisfy that while a failed job on the next page ran
 * our code — which would waive a red that is genuinely ours. So a partial list
 * is not a smaller truth, it is no answer: the caller hands `null` instead, and
 * the classifier falls back to its blocking reading. `total_count` comes from
 * the API listing itself, so this needs no second call.
 *
 * @returns {boolean} true only when the fetched jobs demonstrably cover the run.
 */
export function jobsComplete({ fetched = 0, totalCount = null } = {}) {
  const have = Number(fetched)
  // `Number(null)` is 0, and a zero total would "prove" any list complete — so
  // the absence of a count is rejected before the numbers are compared at all.
  if (totalCount === null || totalCount === undefined || totalCount === '') return false
  const total = Number(totalCount)
  if (!Number.isFinite(have) || have < 0) return false
  if (!Number.isFinite(total) || total < 0) return false // no count → cannot prove completeness
  return have >= total
}

/** Should another page be fetched? Bounded, so a pathological run cannot spin. */
export function moreJobPages({ fetched = 0, totalCount = null, page = 1, perPage = JOBS_PAGE_SIZE, maxPages = JOBS_MAX_PAGES } = {}) {
  const have = Number(fetched) || 0
  const total = Number(totalCount)
  if (!Number.isFinite(total) || have >= total) return false
  if (Number(page) >= Number(maxPages)) return false
  return have > 0 && have % Number(perPage) === 0
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
 * `famineSince` is when that waiver started (the caller's state file): past
 * `OUTAGE_WAIVER_MAX_MS` the waiver stops being credible and `escalate` is set,
 * so the alert names the retired-image / yanked-tag reading only a push can fix.
 *
 * @param {{workflowName?:string, conclusion?:string, jobs?:object[]|null, workflowsUntouched?:boolean, famineSince?:number, now?:number}} input
 * @returns {{cause:'repository'|'external'|'unknown', actionable?:boolean, escalate?:boolean, failedJobs:string[], detail:string, remedy:string}}
 */
export function classifyFailureCause(input) {
  try {
    const { workflowName = '', conclusion = '', jobs = null, workflowsUntouched, famineSince = 0, now = Date.now() } = input ?? {}
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
        // …AND THE WAIVER EXPIRES (reviewer residual (a)). An outage passes; a
        // retired `runs-on` image or a yanked action tag does not, and neither
        // touches our file. Past the window the red is still NOT blocked — a
        // block nothing in the session can clear cost ~30 turns of looping once
        // already — but it stops being reported as "nothing to do here": the
        // alert names the dependency reading and the push that would fix it.
        const w = waiverCredibility({ famineSince, now })
        if (!w.credible) {
          return {
            cause: 'external',
            actionable: false,
            escalate: true,
            failedJobs: failed,
            detail: `${died}, and \`.github/workflows/\` is untouched since the last green run — but this has stood for ~${w.hours} h, which is no longer credible as an outage: a RETIRED \`runs-on\` image or a YANKED action tag kills an unchanged file in exactly this shape`,
            remedy: WORKFLOW_DEPENDENCY_REMEDY,
          }
        }
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
