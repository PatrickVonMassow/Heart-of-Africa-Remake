// Stop hook (user mandate 22.07.2026): GUARANTEE the batch assistant notices
// when GitHub CI turns red for a commit it pushed — a red "fast" run went
// unnoticed until the user pointed it out, and that must not recur. When HEAD
// is pushed, this checks the latest Actions runs for HEAD via the GitHub REST
// API (`gh` is NOT installed on this machine — the API is the working path),
// BLOCKS turn-end on a confirmed red, and pushes an ntfy alert once per
// failing sha (dedup via .claude/ci-status-guard-state.json). The decision
// logic lives in ci-status-guard-core.mjs (pure, Vitest-covered).
//
// Fail-OPEN above all: CI pending, no run yet, token missing, offline, non-200,
// any internal error → allow, so the guard can never freeze a session. All
// network/git calls carry short timeouts so turn-end cannot hang. The API call
// uses node:https with agent:false — global fetch (undici) plus process.exit
// crashes libuv on Windows (UV_HANDLE_CLOSING assert), and its keep-alive
// would stall the natural exit. This is the turn-end SECONDARY detector; the
// PRIMARY guaranteed push is the `if: failure()` ntfy step inside
// .github/workflows/ci.yml (Layer B), which fires even with no session running.
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { request } from 'node:https'
import { fileURLToPath } from 'node:url'
import { readJson, writeJsonAtomic } from './dashboard-state.mjs'
import { classifyRuns, failedRuns, shouldBlock, shouldNotify, blockReason } from './ci-status-guard-core.mjs'
import { JOBS_PAGE_SIZE, classifyFailureCause, jobsComplete, moreJobPages } from './ci-failure-cause-core.mjs'
import { heldByOtherLiveOwner } from './batch-singleton.mjs'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PAUSE = fileURLToPath(new URL('../.claude/batch-paused', import.meta.url))
const STATE = fileURLToPath(new URL('../.claude/ci-status-guard-state.json', import.meta.url))
const NTFY_TOPIC_FILE = fileURLToPath(new URL('../.claude/ntfy-topic', import.meta.url))
// The PAT lives OUTSIDE version control; candidates in preference order. Read
// at call time, never logged. Missing token → unauthenticated (public repo,
// lower rate limit) → still works; API failure → fail-open.
const TOKEN_PATHS = [
  fileURLToPath(new URL('../.secrets/github-token', import.meta.url)),
  'C:\\Users\\Patri\\.claude\\projects\\c--Users-Patri-Documents-Developing-hoa\\.secrets\\github-token',
]

function git(args) {
  return execFileSync('git', args, {
    windowsHide: true,
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 5000,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

/** HEAD counts as pushed once ANY origin ref contains it (local refs, no
 *  network). Feature branches push to origin/feat/<point>-<slug>, so the old
 *  origin/main-only ancestor check silenced the guard for ALL branch work —
 *  a red branch run would have gone unnoticed until the merge. */
function isPushed(head) {
  try {
    return git(['branch', '-r', '--contains', head]).length > 0
  } catch {
    return false // unknown sha / no remote refs — nothing to check
  }
}

/** "owner/repo" from the origin URL (https or ssh), null when not GitHub. */
function githubRepo() {
  const url = git(['remote', 'get-url', 'origin'])
  const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/)
  return m ? m[1] : null
}

function readFileTrim(path) {
  try {
    const t = readFileSync(path, 'utf8').trim()
    return t || null
  } catch {
    return null
  }
}

function readToken() {
  for (const p of TOKEN_PATHS) {
    const t = readFileTrim(p)
    if (t) return t
  }
  return null
}

/** Minimal HTTPS request: resolves {status, body} or null; never rejects.
 *  agent:false → the socket closes with the response and the loop drains. */
function httpsRequest(url, { method = 'GET', headers = {}, body = null, timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    try {
      const req = request(url, { method, headers, agent: false, timeout: timeoutMs }, (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          if (data.length < 2_000_000) data += chunk
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
        res.on('error', () => resolve(null))
      })
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', () => resolve(null))
      if (body) req.write(body)
      req.end()
    } catch {
      resolve(null)
    }
  })
}

/** Actions runs for the sha; null on any failure (the caller fails open). */
async function fetchRuns(repo, headSha) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'hoa-ci-status-guard',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = readToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await httpsRequest(
    `https://api.github.com/repos/${repo}/actions/runs?head_sha=${headSha}&per_page=20`,
    { headers },
  )
  if (!res || res.status !== 200) return null
  try {
    const data = JSON.parse(res.body)
    return Array.isArray(data?.workflow_runs) ? data.workflow_runs : null
  } catch {
    return null
  }
}

/**
 * PROOF, not assumption: did anything under `.github/workflows/` change between
 * the last run of this workflow that GitHub carried to a verdict and HEAD?
 *
 * A red that executed no step of ours reads as somebody else's outage — but a
 * workflow file with a `uses:` reference that resolves nowhere, or a `runs-on`
 * label no runner matches, dies in exactly the same shape and IS ours (four-eyes
 * review, 06.08.2026). Only this comparison tells them apart, so the classifier
 * demands it before it will excuse a red.
 *
 * Returns true ONLY when the answer is a proven no. Anything unclear — no
 * earlier run to compare against, a sha git does not have, a git error — returns
 * false, and the guard keeps blocking. Undecided must never read as excused.
 */
async function workflowsUntouchedSince(repo, runs, runClassification, head) {
  try {
    const run = (Array.isArray(runs) ? runs : []).find((r) => String(r?.id) === String(runClassification?.runId))
    // The workflow's OWN file is normally the only one that can have broken it,
    // and scoping to it keeps an unrelated workflow edit from making every other
    // workflow a suspect. The exception is a REUSABLE workflow: `uses:
    // ./.github/workflows/x.yml` kills the caller before any step, and the
    // breakage is in the callee (review S2). None exists here today — so the
    // scope widens to the directory only if one appears, which cannot go
    // unnoticed the way a silent hole would.
    const path = String(run?.path ?? '')
    const workflowId = run?.workflow_id
    if (!path.startsWith('.github/workflows/') || !workflowId) return false
    const scope = callsAReusableWorkflow(path) ? '.github/workflows' : path

    // The baseline is the last commit GitHub carried this workflow to a GREEN
    // verdict on: everything since is what could have broken the file. A shallow
    // HEAD~1 would "prove" nothing — the edit is usually further back.
    // The newest green sha we actually HAVE. `ci.yml` also runs on pull_request,
    // so the newest green can sit on a fork commit this clone never fetched —
    // taking only the first would throw away a usable baseline (review S3).
    const green = (await fetchLastGreenShas(repo, workflowId)).find((sha) => {
      try {
        git(['cat-file', '-e', `${sha}^{commit}`])
        return true
      } catch {
        return false
      }
    })
    if (!green) return false
    // Two-dot diff: this compares the FILE CONTENT at both commits, so it holds
    // across rebases and across branches — "byte-identical to a file that ran
    // green" is the proof, ancestry is not.
    return git(['diff', '--name-only', `${green}..${head}`, '--', scope]).length === 0
  } catch {
    return false // undecided → keep blocking
  }
}

/** Does this workflow call another workflow of ours? Unreadable → true, so the
 *  scope widens rather than narrows on doubt. */
function callsAReusableWorkflow(path) {
  try {
    return /uses:\s*\.\/\.github\/workflows\//.test(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))
  } catch {
    return true
  }
}

/** The head shas of the newest SUCCESSFUL runs of one workflow; [] on any doubt. */
async function fetchLastGreenShas(repo, workflowId) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'hoa-ci-status-guard',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = readToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await httpsRequest(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/runs?status=success&per_page=5`,
    { headers },
  )
  if (!res || res.status !== 200) return []
  try {
    const list = JSON.parse(res.body)?.workflow_runs
    if (!Array.isArray(list)) return []
    return list.map((r) => r?.head_sha).filter((s) => typeof s === 'string' && s)
  } catch {
    return []
  }
}

/** The jobs of one run, so the failing JOB can say which side the fault sits on
 *  (ci-failure-cause-core). null on any failure — the classifier then reports
 *  `unknown` for the Pages workflow and keeps the old wording elsewhere.
 *
 *  PAGINATED, and null on a list that cannot be PROVEN complete (four-eyes
 *  residual (b), 06.08.2026). The old call read the first 30 jobs of a run and
 *  handed them over as if they were all of them — and the classifier's central
 *  rule is "EVERY failed job ran nothing of ours", which a truncated list can
 *  satisfy while a failed job one page on ran our code. That would WAIVE a red
 *  that is genuinely ours. A partial list is therefore not a smaller truth but
 *  no answer, and `null` sends the classifier back to its blocking reading. */
async function fetchJobs(repo, runId) {
  if (!runId) return null
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'hoa-ci-status-guard',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = readToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const jobs = []
  let totalCount = null
  let page = 1
  for (;;) {
    const res = await httpsRequest(
      `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?per_page=${JOBS_PAGE_SIZE}&page=${page}`,
      { headers },
    )
    if (!res || res.status !== 200) return null
    try {
      const data = JSON.parse(res.body)
      if (!Array.isArray(data?.jobs)) return null
      jobs.push(...data.jobs)
      totalCount = Number(data.total_count)
    } catch {
      return null
    }
    if (!moreJobPages({ fetched: jobs.length, totalCount, page, perPage: JOBS_PAGE_SIZE })) break
    page += 1
  }
  return jobsComplete({ fetched: jobs.length, totalCount }) ? jobs : null
}

/** ntfy push, same channel as scripts/notify.mjs but via node:https (see top).
 *  Silent no-op without a configured topic; failures never break the guard. */
async function notifyCiRed(message) {
  const topic = readFileTrim(NTFY_TOPIC_FILE)
  if (!topic) return
  await httpsRequest(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
    method: 'POST',
    headers: { Title: 'HoA batch: CI red', Priority: 'high', Tags: 'rotating_light' },
    body: String(message).slice(0, 3500),
  })
}

/** Returns the block-decision JSON string, or null to allow. */
async function main() {
  let sid = ''
  try {
    sid = JSON.parse(readFileSync(0, 'utf8')).session_id || ''
  } catch {
    /* no/non-JSON stdin (manual run) — CI state is global truth, not session-local */
  }

  if (existsSync(PAUSE)) return null // user-paused: no batch duty in flight
  if (heldByOtherLiveOwner(sid)) return null // hard singleton: a non-owner session stands down — no batch duty

  const head = git(['rev-parse', 'HEAD'])
  if (!isPushed(head)) return null

  const repo = githubRepo()
  if (!repo) return null

  const runs = await fetchRuns(repo, head)
  if (!runs) return null // offline / rate-limited / API error — fail-open

  const runClassification = classifyRuns(runs, head)
  if (!shouldBlock(runClassification.state)) return null

  // WHERE the fault lies decides the remedy: a red the repository cannot fix
  // must not demand a fixing push (point 526).
  //
  // EVERY failed run is judged, not just the one classifyRuns names (four-eyes
  // review, 06.08.2026). Which run that is comes down to API list order, and
  // once an outside failure may WAIVE the block, letting order decide would let
  // a famine-shaped watchdog run excuse a genuinely red CI run on the same
  // commit. So: block on the first red that has something to do, and stand down
  // only when every single one of them has not.
  const reds = failedRuns(runs, head)
  const state = readJson(STATE) ?? {}
  const now = Date.now()
  // WHEN each workflow was first seen dying the famine way, so the outage waiver
  // can expire (residual (a)). Kept per workflow name, not per sha: the very
  // failure mode is one workflow dying identically across commit after commit.
  const famine = state.famine && typeof state.famine === 'object' ? state.famine : {}
  const stillFamished = {}
  const judged = []
  for (const red of reds.length > 0 ? reds : [runClassification]) {
    const cause = classifyFailureCause({
      workflowName: red.workflowName,
      conclusion: red.conclusion,
      jobs: await fetchJobs(repo, red.runId),
      workflowsUntouched: await workflowsUntouchedSince(repo, runs, red, head),
      famineSince: Number(famine[red.workflowName]) || 0,
      now,
    })
    if (cause.actionable === false) stillFamished[red.workflowName] = Number(famine[red.workflowName]) || now
    judged.push({ ...red, ...cause })
  }
  // The one that decides: the first red something can be done about, else the
  // first — which is then, by construction, an unactionable one.
  const classification = judged.find((c) => c.actionable !== false) ?? judged[0]
  const standDown = judged.every((c) => c.actionable === false)

  // A stood-down red gets a REPEATED alert, not one ever (four-eyes review S1):
  // in a runner famine no step runs, so ci.yml's own `if: failure()` alert —
  // the primary detector — never fires either. Dedup per sha alone would leave
  // a permanently broken main pinging exactly once and never blocking.
  const alertKey = standDown ? `${head}:${classification.runId}:${new Date().toISOString().slice(0, 13)}` : head
  if (shouldNotify(classification.state, state.notifiedSha, alertKey)) {
    await notifyCiRed(
      `CI failed for pushed ${head.slice(0, 7)}: "${classification.workflowName}" ` +
        `run ${classification.runId} (${classification.conclusion}, cause: ${classification.cause}` +
        `${standDown ? ', nothing in the repository can clear it' : ''}). ${classification.url ?? ''}` +
        // Once the outage waiver has expired, the alert stops saying "nothing to
        // do" and NAMES the reading only a push can fix (residual (a)).
        (classification.escalate ? ` ${classification.detail}. ${classification.remedy}` : ''),
    )
    writeJsonAtomic(STATE, {
      ...state,
      famine: stillFamished,
      notifiedSha: alertKey,
      notifiedAt: Date.now(),
      runId: classification.runId,
    })
  } else if (JSON.stringify(stillFamished) !== JSON.stringify(famine)) {
    // A workflow that recovered forgets its waiver clock, so the NEXT famine
    // starts a fresh six hours instead of inheriting an expired one.
    writeJsonAtomic(STATE, { ...state, famine: stillFamished })
  }

  // A red with NOTHING to do is reported, not sat on (point 528, 06.08.2026). The
  // guard exists to stop a session walking away from a defect IT can clear; when
  // GitHub's own runners never reached our code, holding the turn end clears
  // nothing and stops the batch over a foreign outage. The alert above still
  // went out, and the next session re-reads the same runs — so this forgets
  // nothing, it only declines to stand still.
  if (standDown) return null

  return JSON.stringify({ decision: 'block', reason: blockReason(classification, head) })
}

// No process.exit after awaits (libuv teardown race on Windows) — print the
// decision and let the loop drain; any error allows the stop (fail-open).
main()
  .then((decision) => {
    if (decision) process.stdout.write(decision)
  })
  .catch((e) => {
    console.error(`ci-status-guard error (allowing stop): ${e && e.message}`)
  })
