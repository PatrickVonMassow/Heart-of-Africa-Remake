// IS THE DEPLOYED SITE STILL THE COMMIT `main` STANDS AT? — pure decision logic
// for scripts/deploy-staleness.mjs. No I/O, never throws, Vitest-covered in
// deploy-staleness-core.test.mjs.
//
// WHY IT EXISTS (measured 06.08.2026, point 528): every alarm this project has
// fires on a RED RUN. None fires on a site that quietly serves yesterday. On
// 06.08. GitHub Actions stopped handing out runners; `main` moved on to ee125053
// while the page kept serving c728c816 for hours, and the user judges every
// render change against exactly that page. The run being red is not the fault
// that matters — the SITE BEING STALE is, and it can also arise with no red run
// at all (a push that triggered nothing, a deployment that reported success and
// did not land).
//
// So the comparison is made against the site itself: the build emits
// `build-info.json` at the site root (scripts/build-info.mjs), the watchdog
// fetches it, and this module decides. It NAMES BOTH REVISIONS in every verdict,
// because "the site is stale" without the two shas is not actionable.
//
// FAIL-OPEN THROUGHOUT: anything unclear — an unreachable site, an unreadable
// marker, a missing sha — is `unknown`, never an alarm. A watchdog that cries
// wolf on its own network hiccup is worse than none.

/** The deployed site whose root is built from `main`. */
export const SITE_URL = 'https://patrickvonmassow.github.io/Heart-of-Africa-Remake/'

/** The workflow the retry dispatches, by file name (the Actions API accepts it). */
export const DEPLOY_WORKFLOW_FILE = 'deploy-pages.yml'

/** How long a fresh commit on `main` may take to reach the site before its
 *  absence is a fault. MEASURED from the run history of 05./06.08.2026: build
 *  2-5 min, deploy job 9 s-10 min, plus the Pages CDN. 25 min is the slowest
 *  observed end-to-end (10 m 11 s deploy on run 31108927749) with room over it. */
export const DEPLOY_GRACE_MS = 25 * 60 * 1000

/** How long a run that is still queued/in progress excuses a stale site. Beyond
 *  it the run is not progress, it is the fault: on 06.08. runs sat unassigned
 *  and were killed after ~15 min, and a stale site must not hide behind an
 *  endless queue. */
export const IN_FLIGHT_GRACE_MS = 30 * 60 * 1000

/** Between two dispatches of the deploy workflow for the same commit. */
export const RETRY_COOLDOWN_MS = 30 * 60 * 1000

/** How many times one commit is re-dispatched before the watchdog stops trying
 *  and starts insisting. Three attempts over 90 minutes is generous for an
 *  outage; past that the fault needs a human, not another dispatch. */
export const MAX_DISPATCHES = 3

const SHA_RE = /^[0-9a-f]{7,40}$/i
const short = (sha) => (typeof sha === 'string' && sha ? sha.slice(0, 7) : '?')

/**
 * Read a served `build-info.json`. Returns null for anything that is not one —
 * a Pages 404 page, a truncated body, a marker without a usable commit — so a
 * garbled answer can never be mistaken for a revision.
 */
export function parseBuildInfo(text) {
  try {
    const data = JSON.parse(String(text ?? ''))
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    const commit = String(data.commit ?? '').trim().toLowerCase()
    if (!SHA_RE.test(commit)) return null
    return {
      commit,
      short: String(data.short ?? commit.slice(0, 7)),
      ref: String(data.ref ?? ''),
      builtAt: String(data.builtAt ?? ''),
    }
  } catch {
    return null
  }
}

/**
 * The verdict on the served site.
 *
 * @param {object} input
 * @param {{status?:number, body?:string, error?:string}} input.fetched what the
 *   GET of `<site>/build-info.json` returned. `error` set → no answer at all.
 * @param {string} input.mainSha the commit `main` stands at.
 * @param {number} [input.mainCommittedAt] epoch ms of that commit.
 * @param {boolean|null} [input.servedContainsMain] does the served commit CONTAIN
 *   `main`? true means our clone is behind the site, not the other way round.
 *   null when it cannot be decided (a sha this clone does not have).
 * @param {{createdAt?:number, status?:string, conclusion?:string}|null} [input.latestRun]
 *   the newest deploy run for `mainSha`, or null when none exists.
 * @returns {{verdict:'current'|'pending'|'stale'|'unknown', servedSha:string|null,
 *   mainSha:string, reason:string, servedBuiltAt?:string}}
 */
export function judgeServedRevision(input) {
  try {
    const {
      fetched = null,
      mainSha = '',
      mainCommittedAt = 0,
      servedContainsMain = null,
      latestRun = null,
      now = Date.now(),
      graceMs = DEPLOY_GRACE_MS,
      inFlightGraceMs = IN_FLIGHT_GRACE_MS,
    } = input ?? {}
    const main = String(mainSha ?? '').trim().toLowerCase()
    const unknown = (reason) => ({ verdict: 'unknown', servedSha: null, mainSha: main, reason })
    if (!SHA_RE.test(main)) return unknown('the local `main` revision could not be read')

    const f = fetched && typeof fetched === 'object' ? fetched : {}
    const status = Number(f.status) || 0
    let servedSha = null
    let servedBuiltAt = ''

    if (f.error) return unknown(`the site did not answer: ${f.error}`)
    if (status === 404) {
      // The site IS up and has no marker. That is not ambiguous: every build
      // since the marker landed emits one, so a site without it predates the
      // marker commit and therefore lags `main` by at least that commit.
      servedSha = null
    } else if (status === 200) {
      const info = parseBuildInfo(f.body)
      if (!info) return unknown('the served revision marker could not be read')
      servedSha = info.commit
      servedBuiltAt = info.builtAt
    } else {
      return unknown(`the site answered HTTP ${status || '?'}`)
    }

    const done = (verdict, reason) => ({ verdict, servedSha, mainSha: main, reason, servedBuiltAt })

    if (servedSha && (servedSha === main || servedSha.startsWith(main) || main.startsWith(servedSha))) {
      return done('current', `the site serves ${short(servedSha)}, which is \`main\``)
    }
    if (servedSha && servedContainsMain === true) {
      // The site is AHEAD of this clone — a local ref that was never fetched.
      // Reporting that as stale would send a session chasing its own git state.
      return done('current', `the site serves ${short(servedSha)}, which already contains \`main\` ${short(main)}`)
    }

    const behind = servedSha
      ? `the site serves ${short(servedSha)} while \`main\` stands at ${short(main)}`
      : `the site carries no revision marker at all, so it predates it — \`main\` stands at ${short(main)}`

    // Not yet a fault: a deploy still on its way. The clock starts at the RUN,
    // not at the commit — a commit pushed long after it was authored would
    // otherwise be "overdue" the moment it landed.
    const runCreated = Number(latestRun?.createdAt) || 0
    const runLive = Boolean(latestRun) && String(latestRun.status ?? '') !== 'completed'
    if (runLive && runCreated && now - runCreated < inFlightGraceMs) {
      return done('pending', `${behind}, and its deploy run is still in flight`)
    }
    const since = runCreated || Number(mainCommittedAt) || 0
    if (since && now - since < graceMs) {
      return done('pending', `${behind}, and the deploy of ${short(main)} is still within its ${Math.round(graceMs / 60000)}-minute window`)
    }

    const waited = since ? ` for ${Math.round((now - since) / 60000)} min` : ''
    const noRun = latestRun ? '' : ' — no deploy run exists for it at all'
    return done('stale', `${behind}${waited}${noRun}`)
  } catch {
    return { verdict: 'unknown', servedSha: null, mainSha: '', reason: 'internal error' }
  }
}

/**
 * Retry the deploy — but only what a retry can actually fix, and not forever.
 *
 * `githubAnswering` is the point of the whole item: during the outage the API
 * refused, and re-dispatching into that changes nothing. The watchdog dispatches
 * exactly when GitHub is answering again, once per cooldown, up to the cap.
 *
 * @returns {{dispatch:boolean, attempt:number, exhausted:boolean, reason:string}}
 */
export function retryDecision(input) {
  try {
    const {
      verdict = 'unknown',
      mainSha = '',
      githubAnswering = false,
      attempts = null,
      now = Date.now(),
      cooldownMs = RETRY_COOLDOWN_MS,
      maxDispatches = MAX_DISPATCHES,
    } = input ?? {}
    const main = String(mainSha ?? '').trim().toLowerCase()
    const no = (reason, extra = {}) => ({ dispatch: false, attempt: 0, exhausted: false, reason, ...extra })
    if (verdict !== 'stale') return no(`nothing to retry — the verdict is "${verdict}"`)
    if (!githubAnswering) return no('GitHub is not answering — a dispatch now would only add a run that never starts')

    // Attempts are counted PER COMMIT: a new commit on `main` is a new deploy,
    // and it must not inherit the exhausted budget of the one before it.
    const a = attempts && typeof attempts === 'object' && String(attempts.sha ?? '') === main ? attempts : null
    const count = Number(a?.count) || 0
    const last = Number(a?.at) || 0

    if (count >= maxDispatches) {
      return no(
        `${count} dispatches for ${short(main)} did not land it — this needs a human, not a fourth run`,
        { exhausted: true },
      )
    }
    if (last && now - last < cooldownMs) {
      return no(`the last dispatch was ${Math.round((now - last) / 60000)} min ago — waiting out the cooldown`)
    }
    return {
      dispatch: true,
      attempt: count + 1,
      exhausted: false,
      reason: `dispatching "${DEPLOY_WORKFLOW_FILE}" for ${short(main)} (attempt ${count + 1} of ${maxDispatches})`,
    }
  } catch {
    return { dispatch: false, attempt: 0, exhausted: false, reason: 'internal error' }
  }
}

/**
 * The alert. Names BOTH revisions, what was done about it, and keys itself so a
 * standing fault is not repeated identically — except once the retries are
 * exhausted, where the key carries the hour so the escalation ladder can climb
 * (the same reasoning ci-status-guard uses for a red nothing can clear).
 *
 * @returns {{notify:boolean, key:string|null, title:string, message:string, priority:string}}
 */
export function stalenessAlert(input) {
  try {
    const {
      verdict = 'unknown',
      servedSha = null,
      mainSha = '',
      reason = '',
      dispatch = null,
      dispatchOutcome = '',
      attemptCount = 0,
      lastKey = null,
      siteUrl = SITE_URL,
      now = Date.now(),
    } = input ?? {}
    const quiet = { notify: false, key: null, title: '', message: '', priority: 'default' }
    if (verdict !== 'stale') return quiet

    const exhausted = Boolean(dispatch?.exhausted)
    const parts = [`The DEPLOYED SITE lags \`main\`: ${reason}.`]
    if (dispatch?.dispatch) parts.push(`Re-dispatched the deploy (attempt ${dispatch.attempt})${dispatchOutcome ? `: ${dispatchOutcome}` : ''}.`)
    else if (dispatch?.reason) parts.push(`No retry: ${dispatch.reason}.`)
    parts.push(siteUrl)

    // Exhausted is a standing CONDITION (a human must look) and is re-announced
    // hourly so the ladder escalates; everything else is an EVENT keyed by the
    // pair of revisions plus how many dispatches that pair has HAD, so one
    // unchanged fault is reported once and each new attempt is news. The count
    // is the caller's stored one (four-eyes finding 3) — keying on the current
    // tick's decision would flip between "dispatched" and "in cooldown" and
    // re-announce the same fault every cycle.
    const key = exhausted
      ? `stale:${servedSha ?? '-'}:${mainSha}:${Math.floor(now / 3_600_000)}`
      : `stale:${servedSha ?? '-'}:${mainSha}:${Number(attemptCount) || 0}`
    if (lastKey && lastKey === key) return { ...quiet, key }

    return {
      notify: true,
      key,
      title: exhausted ? 'Deployed site STILL stale' : 'Deployed site is stale',
      message: parts.join(' '),
      priority: exhausted ? 'high' : 'default',
    }
  } catch {
    return { notify: false, key: null, title: '', message: '', priority: 'default' }
  }
}

/** The attempt record to store after a tick. Keeps the count per commit and
 *  forgets it as soon as the site is current again. */
export function nextAttempts(input) {
  const { verdict = 'unknown', mainSha = '', attempts = null, dispatched = false, now = Date.now() } = input ?? {}
  const main = String(mainSha ?? '').trim().toLowerCase()
  if (verdict === 'current') return null
  const same = attempts && typeof attempts === 'object' && String(attempts.sha ?? '') === main ? attempts : null
  if (!dispatched) return same
  return { sha: main, count: (Number(same?.count) || 0) + 1, at: now }
}
