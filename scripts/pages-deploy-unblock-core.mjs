// Pure decision logic for clearing a stuck GitHub Pages deployment
// (pages-deploy-unblock.mjs). No I/O, never throws — Vitest-covered in
// pages-deploy-unblock-core.test.mjs.
//
// WHY IT EXISTS (measured 06.08.2026 on `main`): a Pages deployment was
// accepted by GitHub and then sat in `deployment_in_progress` until the deploy
// action gave up with `Timeout reached, aborting!`. Its own cancel did not take
// effect, so the deployment stayed IN PROGRESS on GitHub's side and every later
// deployment was refused — the re-run and a `workflow_dispatch` were answered
// `Deployment cancelled.`, the next commit's run with `Deployment request
// failed … due to in progress deployment. Please cancel <sha> first`. The site
// then served a two-hour-old `main` while the user judges every render change
// against exactly that site, and nothing in the repository knew the handle:
// cancel the stuck deployment through the Pages API, then deploy again.
//
// The BUILD/GITHUB split is structural, not guessed from a log: our build runs
// in the `build` job, and the `deploy` job only talks to the Pages API. So a
// retry driven from here can never re-run (and never mask) a failing build —
// `deploy` does not even start unless `build` succeeded.

/** Pages deployment statuses that are FINISHED — nothing to cancel.
 *  From actions/deploy-pages (src/internal/deployment.js). */
export const TERMINAL_STATUSES = new Set([
  'succeed',
  'deployment_failed',
  'deployment_content_failed',
  'deployment_cancelled',
  'deployment_lost',
])

/** Statuses that say nothing about the deployment; treated as not blocking, so
 *  a lookup that failed can never be reported as a stuck deployment. */
export const UNKNOWN_STATUSES = new Set(['', 'unknown_status', 'not_found'])

/** How many recent `github-pages` deployments are inspected. A blocker is by
 *  definition among the newest few; the listing is newest first. */
export const INSPECT_LIMIT = 10

/**
 * Is this Pages deployment status still holding the queue?
 * Anything neither terminal nor unknown counts — `deployment_in_progress`,
 * `queued`, `building`, `deployment_attempt_error` and whatever GitHub adds
 * next. Erring towards "blocking" is right here: the caller only asks after a
 * deploy already failed, and the answer only ever leads to a cancel + retry.
 */
export function isBlockingStatus(status) {
  const s = String(status ?? '')
    .trim()
    .toLowerCase()
  return !TERMINAL_STATUSES.has(s) && !UNKNOWN_STATUSES.has(s)
}

/**
 * The shas to ask the Pages API about, newest first, deduplicated.
 * Input is the Deployments API listing (`GET /repos/{repo}/deployments`), which
 * is where a Pages deployment becomes visible by commit sha at all.
 * @returns {{sha:string, id:(number|null), createdAt:string}[]}
 */
export function candidateDeployments(deployments, { limit = INSPECT_LIMIT, environment = 'github-pages' } = {}) {
  if (!Array.isArray(deployments)) return []
  const seen = new Set()
  const out = []
  for (const d of deployments) {
    if (!d || typeof d !== 'object') continue
    if (environment && String(d.environment ?? '') !== environment) continue
    const sha = String(d.sha ?? '')
    if (!/^[0-9a-f]{7,40}$/i.test(sha) || seen.has(sha)) continue
    seen.add(sha)
    out.push({ sha, id: d.id ?? null, createdAt: String(d.created_at ?? '') })
    if (out.length >= limit) break
  }
  return out
}

/**
 * Of the inspected deployments, the ones still holding the queue.
 * @param {{sha:string, status:string, createdAt?:string}[]} inspected
 */
export function blockingDeployments(inspected) {
  if (!Array.isArray(inspected)) return []
  return inspected.filter((d) => d && isBlockingStatus(d.status))
}

/**
 * Retry the deploy exactly when this run actually CLEARED something.
 * A deploy failure with nothing blocking is not a queue stall — an oversized or
 * missing artifact fails the same way, and retrying it would only lose time and
 * blur the report. There is one retry step in the workflow, so "once" is
 * structural; this decides whether it runs at all.
 * @returns {{retry:boolean, reason:string}}
 */
export function shouldRetryDeploy({ deployFailed = false, cancelled = [] } = {}) {
  const cleared = Array.isArray(cancelled) ? cancelled.filter(Boolean) : []
  if (!deployFailed) return { retry: false, reason: 'the deployment succeeded — nothing to retry' }
  if (cleared.length === 0) {
    return {
      retry: false,
      reason:
        'the deploy failed with no stuck Pages deployment to clear — the cause is not a queue stall, so it stays red at once',
    }
  }
  return {
    retry: true,
    reason: `cleared ${cleared.length} stuck Pages deployment(s) (${cleared
      .map((c) => String(c.sha ?? c).slice(0, 7))
      .join(', ')}) — deploying again`,
  }
}

/** Age in whole minutes, or null when the timestamp is unusable. */
export function ageMinutes(createdAt, now = Date.now()) {
  const t = Date.parse(String(createdAt ?? ''))
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.round((now - t) / 60000))
}

/**
 * The report a stall gets instead of a bare timeout: every blocking deployment
 * NAMED, what was done about it, and the handle for a human.
 */
export function stallReport({ repo = '', blocking = [], cancelled = [], failed = [], now = Date.now() } = {}) {
  const lines = []
  const list = Array.isArray(blocking) ? blocking : []
  if (list.length === 0) {
    lines.push(`No in-progress Pages deployment found for ${repo || 'this repository'}.`)
    lines.push('The deploy did not fail on a queue stall — look at the deploy step itself.')
    return lines.join('\n')
  }
  lines.push(`Stuck Pages deployment(s) in ${repo || 'this repository'}:`)
  for (const d of list) {
    const age = ageMinutes(d?.createdAt, now)
    const cancelledHere = (Array.isArray(cancelled) ? cancelled : []).some((c) => c && c.sha === d.sha)
    const failedHere = (Array.isArray(failed) ? failed : []).find((f) => f && f.sha === d.sha)
    const what = cancelledHere
      ? 'cancelled'
      : failedHere
        ? `NOT cancelled (${failedHere.error ?? 'cancel failed'})`
        : 'left in place'
    lines.push(
      `  ${String(d.sha ?? '?').slice(0, 7)}  status=${d?.status ?? '?'}` +
        `${age === null ? '' : `  age=${age} min`}  → ${what}`,
    )
  }
  lines.push(
    'Handle: node scripts/pages-deploy-unblock.mjs --cancel, then dispatch the deploy workflow again.',
  )
  return lines.join('\n')
}
