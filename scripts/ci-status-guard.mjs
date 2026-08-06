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
import { classifyRuns, shouldBlock, shouldNotify, blockReason } from './ci-status-guard-core.mjs'
import { classifyFailureCause } from './ci-failure-cause-core.mjs'
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
    // The workflow's OWN file is the only one that can have broken it. Comparing
    // the whole directory would call an unrelated workflow edit a suspect and
    // block on it forever.
    const path = String(run?.path ?? '')
    const workflowId = run?.workflow_id
    if (!path.startsWith('.github/workflows/') || !workflowId) return false

    // The baseline is the last commit GitHub carried this workflow to a GREEN
    // verdict on: everything since is what could have broken the file. A shallow
    // HEAD~1 would "prove" nothing — the edit is usually further back.
    const green = await fetchLastGreenSha(repo, workflowId)
    if (!green) return false
    git(['cat-file', '-e', `${green}^{commit}`]) // throws if we do not have it
    return git(['diff', '--name-only', `${green}..${head}`, '--', path]).length === 0
  } catch {
    return false // undecided → keep blocking
  }
}

/** The head sha of the newest SUCCESSFUL run of one workflow; null on any doubt. */
async function fetchLastGreenSha(repo, workflowId) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'hoa-ci-status-guard',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = readToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await httpsRequest(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflowId}/runs?status=success&per_page=1`,
    { headers },
  )
  if (!res || res.status !== 200) return null
  try {
    const sha = JSON.parse(res.body)?.workflow_runs?.[0]?.head_sha
    return typeof sha === 'string' && sha ? sha : null
  } catch {
    return null
  }
}

/** The jobs of one run, so the failing JOB can say which side the fault sits on
 *  (ci-failure-cause-core). null on any failure — the classifier then reports
 *  `unknown` for the Pages workflow and keeps the old wording elsewhere. */
async function fetchJobs(repo, runId) {
  if (!runId) return null
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'hoa-ci-status-guard',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  const token = readToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await httpsRequest(`https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs?per_page=30`, {
    headers,
  })
  if (!res || res.status !== 200) return null
  try {
    const data = JSON.parse(res.body)
    return Array.isArray(data?.jobs) ? data.jobs : null
  } catch {
    return null
  }
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
  const cause = classifyFailureCause({
    workflowName: runClassification.workflowName,
    conclusion: runClassification.conclusion,
    jobs: await fetchJobs(repo, runClassification.runId),
    workflowsUntouched: await workflowsUntouchedSince(repo, runs, runClassification, head),
  })
  const classification = { ...runClassification, ...cause }

  const state = readJson(STATE) ?? {}
  if (shouldNotify(classification.state, state.notifiedSha, head)) {
    await notifyCiRed(
      `CI failed for pushed ${head.slice(0, 7)}: "${classification.workflowName}" ` +
        `run ${classification.runId} (${classification.conclusion}, cause: ${classification.cause}). ` +
        `${classification.url ?? ''}`,
    )
    writeJsonAtomic(STATE, {
      ...state,
      notifiedSha: head,
      notifiedAt: Date.now(),
      runId: classification.runId,
    })
  }

  // A red with NOTHING to do is reported, not sat on (point 528, 06.08.2026). The
  // guard exists to stop a session walking away from a defect IT can clear; when
  // GitHub's own runners never reached our code, holding the turn end clears
  // nothing and stops the batch over a foreign outage. The alert above still
  // went out, and the next session re-reads the same run — so this forgets
  // nothing, it only declines to stand still.
  if (classification.actionable === false) return null

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
