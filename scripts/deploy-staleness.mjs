// THE STALE-SITE WATCHDOG (point 528) — one tick of "does the deployed site
// still serve `main`", run as its OWN process by scripts/batch-autostart.mjs.
//
//   node scripts/deploy-staleness.mjs [--quiet] [--no-dispatch]
//
// It fetches the revision marker the build emits at the site root
// (scripts/build-info.mjs), compares it with the commit `main` stands at, and —
// when the site is genuinely behind — NAMES BOTH REVISIONS in an ntfy alert and
// re-dispatches the deploy workflow once GitHub is answering again. It prints
// ONE json line for its caller and always exits 0: a site check may never be a
// reason for the launcher to fail.
//
// WHY A SEPARATE PROCESS, exactly as scripts/board-watchdog.mjs: on this
// platform a `process.exit()` after any `fetch` tears undici's socket down
// mid-close and ABORTS the process, and the launcher exits that way at fifteen
// points. It must not hold a fetch at all. The child is also containment: the
// resurrection above it is untouched whatever happens in here.
//
// --quiet suppresses the ntfy push (the alert is still decided and reported),
// --no-dispatch suppresses the retry — both for hand runs and tests.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { readJson, writeJsonAtomic } from './dashboard-state.mjs'
import { notify } from './notify.mjs'
import { BUILD_INFO_FILE } from './build-info.mjs'
import {
  DEPLOY_WORKFLOW_FILE,
  SITE_URL,
  judgeServedRevision,
  nextAttempts,
  parseBuildInfo,
  retryDecision,
  stalenessAlert,
} from './deploy-staleness-core.mjs'

const STATE = repoPath('.claude/deploy-staleness-state.json')
// The PAT lives OUTSIDE version control; same candidates and same rules as
// ci-status-guard.mjs — read at call time, never logged.
const TOKEN_PATHS = [
  repoPath('.secrets/github-token'),
  'C:\\Users\\Patri\\.claude\\projects\\c--Users-Patri-Documents-Developing-hoa\\.secrets\\github-token',
]

const args = process.argv.slice(2)
const quiet = args.includes('--quiet')
const noDispatch = args.includes('--no-dispatch')
const now = Date.now()

const say = (o) => process.stdout.write(`${JSON.stringify(o)}\n`)

function git(a, timeout = 5000) {
  try {
    return execFileSync('git', a, {
      windowsHide: true,
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

/** Did this git command SUCCEED? (`git()` cannot say — an empty output is normal.) */
function gitOk(a, timeout = 5000) {
  try {
    execFileSync('git', a, { windowsHide: true, cwd: REPO_ROOT, timeout, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function readToken() {
  for (const p of TOKEN_PATHS) {
    try {
      const t = readFileSync(p, 'utf8').trim()
      if (t) return t
    } catch {
      /* next candidate */
    }
  }
  return null
}

/** "owner/repo" from the origin URL, or null when this is not a GitHub clone. */
function githubRepo() {
  const m = git(['remote', 'get-url', 'origin']).match(/github\.com[:/](.+?)(?:\.git)?$/)
  return m ? m[1] : null
}

/** One bounded fetch; never throws. */
async function get(url, { method = 'GET', headers = {}, body = null, timeoutMs = 15000 } = {}) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs)
  try {
    const res = await fetch(url, { method, headers, body, cache: 'no-store', signal: ac.signal })
    const text = await res.text()
    return { status: res.status, body: text }
  } catch (e) {
    return { error: (e && e.message) || 'fetch failed' }
  } finally {
    clearTimeout(timer)
  }
}

const apiHeaders = (token) => ({
  Accept: 'application/vnd.github+json',
  'User-Agent': 'hoa-deploy-staleness',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})

try {
  // --- what `main` stands at -------------------------------------------------
  // FETCHED FIRST (four-eyes review, finding 2). The comparison is only as good
  // as the `main` it is made against, and a stale local ref breaks it BOTH ways:
  // a site serving a commit this clone never fetched — the user's own web edit
  // pushed to `main` is exactly that — reads as stale and earns a pointless
  // dispatch, while a clone and a site that are both behind read as current,
  // which is the miss this whole watchdog exists to prevent. The fetch is
  // bounded and its failure is ignored: the stale refs are then still better
  // than no answer. FETCH_HEAD is the unambiguous tip when the fetch worked.
  const fetchedMain = gitOk(['fetch', '--quiet', 'origin', 'main'], 30000)
  const mainSha =
    (fetchedMain && git(['rev-parse', 'FETCH_HEAD'])) || git(['rev-parse', 'origin/main']) || git(['rev-parse', 'main'])
  const committedAt = mainSha ? Date.parse(git(['show', '-s', '--format=%cI', mainSha])) : NaN

  // --- what the site serves --------------------------------------------------
  const markerUrl = `${SITE_URL}${BUILD_INFO_FILE}?t=${now}`
  const fetched = await get(markerUrl)

  // --- is the site perhaps AHEAD of this clone? ------------------------------
  // Answered only when this clone actually has the served commit; otherwise null,
  // and the core treats "cannot decide" as "not ahead", never as current.
  let servedContainsMain = null
  const servedSha = fetched.status === 200 ? (parseBuildInfo(fetched.body)?.commit ?? '') : ''
  if (servedSha && mainSha && git(['cat-file', '-t', `${servedSha}^{commit}`]) === 'commit') {
    servedContainsMain = isAncestor(mainSha, servedSha)
  }

  // --- the newest deploy run for that commit ---------------------------------
  const repo = githubRepo()
  const token = readToken()
  let latestRun = null
  let githubAnswering = false
  if (repo && mainSha) {
    const res = await get(
      `https://api.github.com/repos/${repo}/actions/workflows/${DEPLOY_WORKFLOW_FILE}/runs?head_sha=${mainSha}&per_page=10`,
      { headers: apiHeaders(token) },
    )
    if (res.status === 200) {
      githubAnswering = true
      try {
        const runs = JSON.parse(res.body)?.workflow_runs
        const newest = (Array.isArray(runs) ? runs : [])
          .map((r) => ({ id: r?.id, createdAt: Date.parse(r?.created_at ?? ''), status: String(r?.status ?? ''), conclusion: String(r?.conclusion ?? '') }))
          .filter((r) => Number.isFinite(r.createdAt))
          .sort((a, b) => b.createdAt - a.createdAt)[0]
        latestRun = newest ?? null
      } catch {
        /* an unreadable listing is no run — the grace then counts from the commit */
      }
    }
  }

  const verdict = judgeServedRevision({
    fetched,
    mainSha,
    mainCommittedAt: Number.isFinite(committedAt) ? committedAt : 0,
    servedContainsMain,
    latestRun,
    now,
  })

  // --- the retry -------------------------------------------------------------
  const state = readJson(STATE) ?? {}
  const decision = retryDecision({
    verdict: verdict.verdict,
    mainSha: verdict.mainSha,
    githubAnswering,
    attempts: state.attempts ?? null,
    now,
  })
  // The message may only claim what actually happened (four-eyes review, finding
  // 4): a dispatch decided but never posted — no token, no remote, --no-dispatch
  // — used to read as "Re-dispatched". `attempted` is the POST, nothing else.
  const blocker = noDispatch ? '--no-dispatch was given' : !repo ? 'this is not a GitHub clone' : !token ? 'no token to dispatch with' : ''
  const attempted = decision.dispatch && !blocker
  let dispatchOutcome = ''
  let accepted = false
  if (attempted) {
    const res = await get(`https://api.github.com/repos/${repo}/actions/workflows/${DEPLOY_WORKFLOW_FILE}/dispatches`, {
      method: 'POST',
      headers: { ...apiHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main' }),
    })
    accepted = res.status === 204
    dispatchOutcome = accepted ? 'accepted' : `refused (${res.error ? res.error : `HTTP ${res.status}`})`
  }

  // The attempt COUNTS whether GitHub accepted it or not — otherwise a refused
  // dispatch would be retried at every tick with no cooldown at all.
  const attempts = nextAttempts({
    verdict: verdict.verdict,
    mainSha: verdict.mainSha,
    attempts: state.attempts ?? null,
    dispatched: attempted,
    now,
  })
  const alert = stalenessAlert({
    ...verdict,
    dispatch: {
      ...decision,
      dispatch: attempted,
      reason: decision.dispatch && blocker ? blocker : decision.reason,
    },
    dispatchOutcome,
    // Keyed on the STORED count, not on the decision's transient attempt number
    // (finding 3): the tick after a dispatch falls into the cooldown branch, and
    // keying on that would re-announce one unchanged fault every cycle.
    attemptCount: Number(attempts?.count) || 0,
    lastKey: state.lastKey ?? null,
    now,
  })
  const sent = alert.notify && !quiet ? await notify(alert.title, alert.message, alert.priority) : false

  writeJsonAtomic(STATE, {
    ...state,
    // Only a fault that was actually ANNOUNCED is remembered as announced — a
    // failed ntfy POST must not silence a standing problem (the lesson
    // board-watchdog records as four-eyes NEW-4).
    lastKey: sent ? alert.key : (verdict.verdict === 'current' ? null : (state.lastKey ?? null)),
    attempts,
    checkedAt: now,
    verdict: verdict.verdict,
  })

  say({
    verdict: verdict.verdict,
    reason: verdict.reason,
    served: verdict.servedSha,
    main: verdict.mainSha,
    dispatched: attempted,
    accepted,
    dispatch: attempted ? dispatchOutcome : decision.dispatch ? blocker : decision.reason,
    exhausted: Boolean(decision.exhausted),
    notified: Boolean(sent),
    message: alert.message,
  })
} catch (e) {
  say({ verdict: 'error', reason: (e && e.message) || String(e), notified: false })
}

/** `git merge-base --is-ancestor` answers by EXIT CODE, not by output. */
function isAncestor(a, b) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', a, b], {
      windowsHide: true,
      cwd: REPO_ROOT,
      timeout: 5000,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}
