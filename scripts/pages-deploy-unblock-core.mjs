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

/** Of those, the ones that prove GitHub PROCESSED the deployment to an end —
 *  and therefore that the queue was free at that moment.
 *
 *  `deployment_cancelled` is deliberately NOT among them, and the incident is
 *  why: a re-run against a blocked queue is answered `Deployment cancelled.`,
 *  so a cancelled record is evidence that something was in the way, never that
 *  the way was clear. `deployment_lost` says only that the status could not be
 *  read. Both are finished, so neither is a blocker — but neither ends the
 *  search for one either. */
export const COMPLETED_STATUSES = new Set(['succeed', 'deployment_failed', 'deployment_content_failed'])

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
 * next. Erring towards "blocking" is right here: in the workflow the question is
 * only ever asked after a deploy already failed, and the answer only leads to a
 * cancel + retry. (By hand the same command can be pointed at a healthy
 * repository — `--cancel` would then cancel a deployment that is genuinely in
 * flight, which is why the report runs without it by default.)
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
  }
  // NEWEST FIRST is what the blocking rule below reads, so it is established
  // here rather than trusted: the listing arrives that way, an entry without a
  // usable timestamp sinks to the end, and ties keep their order.
  const key = (d) => {
    const t = Date.parse(d.createdAt)
    return Number.isFinite(t) ? t : -Infinity
  }
  return out
    .map((d, i) => ({ d, i }))
    .sort((a, b) => key(b.d) - key(a.d) || a.i - b.i)
    .slice(0, limit)
    .map((e) => e.d)
}

/**
 * Of the inspected deployments (NEWEST FIRST), the ones that can still be
 * holding the queue: the unbroken run of unfinished ones at the top of the list.
 *
 * MEASURED 06.08.2026, and the reason this is not simply "every unfinished
 * one": in this repository SIX abandoned deployments report
 * `deployment_in_progress` forever, all of them older than a deployment that
 * later reached `succeed`. A deployment older than a COMPLETED one has
 * demonstrably been superseded — it cannot be what a new deployment waits on —
 * so the first such entry ends the chain. Anything that is finished without
 * proving the queue was free (a cancelled deployment, a lost one) and anything
 * that says nothing at all (`not_found`, an unauthenticated lookup) is SKIPPED
 * rather than counted or treated as the end: our own attempt is answered
 * `Deployment cancelled.` precisely when something else holds the queue, and
 * ending the search there would hide the blocker one line below.
 *
 * @param {{sha:string, status:string, createdAt?:string}[]} inspected
 * @param {{alsoConsider?:string[]}} options a sha named from the outside (the
 *   GitHub error names the blocker) counts wherever it sits in the list.
 */
export function blockingDeployments(inspected, { alsoConsider = [] } = {}) {
  const list = (Array.isArray(inspected) ? inspected : []).filter((d) => d && typeof d === 'object')
  const named = new Set(Array.isArray(alsoConsider) ? alsoConsider : [])
  const out = []
  for (const d of list) {
    const s = String(d.status ?? '')
      .trim()
      .toLowerCase()
    if (COMPLETED_STATUSES.has(s)) break
    if (isBlockingStatus(s)) out.push(d)
  }
  for (const d of list) {
    if (named.has(d.sha) && isBlockingStatus(d.status) && !out.some((x) => x.sha === d.sha)) out.push(d)
  }
  return out
}

/**
 * Retry once after ANY failure of the deploy step. The old queue-stall-only
 * rule was too narrow: run 32040260819 reached the step but got HTTP 503 from
 * the Pages deployment API with nothing stuck to clear, while run 32044141828
 * got HTTP 429 downloading the action before any step existed (the workflow
 * records that unreachable residual). There is one retry step in the workflow,
 * so "once" is structural; this decides whether it runs at all.
 *
 * A deterministic failure can cost one extra attempt, but cannot be hidden:
 * the deploy job only follows a successful build, both attempts are bounded,
 * and the workflow verdict prints both outcomes.
 * @returns {{retry:boolean, reason:string}}
 */
export function shouldRetryDeploy({ deployFailed = false, cancelled = [] } = {}) {
  const cleared = Array.isArray(cancelled) ? cancelled.filter(Boolean) : []
  if (!deployFailed) return { retry: false, reason: 'the deployment succeeded — nothing to retry' }
  if (cleared.length === 0) {
    return {
      retry: true,
      reason:
        'the deploy failed with no stuck Pages deployment to clear — this may be a GitHub-side transient, and repeating the deploy step once is safe because the build already succeeded',
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
