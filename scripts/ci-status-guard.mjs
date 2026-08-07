// Stop hook (user mandate 22.07.2026): GUARANTEE the batch assistant notices
// when GitHub CI turns red for a commit it pushed — a red "fast" run went
// unnoticed until the user pointed it out, and that must not recur.
//
// THE UNIT OF JUDGEMENT IS THE PUSHED REF, AND THE DEMAND IS "CONFIRM GREEN"
// (point 387, 30.07.2026). Asking about HEAD alone let 26 red runs on `main`
// and thirteen red branch runs stand unseen for three weeks: the owning
// session's HEAD was green while every push of a delegated agent's branch
// failed, and a delegated agent pushes under the parent's session id. So this
// sweeps every ref the repository pushed inside the window — named from the
// local push reflog, never from an API sweep over branches — and a push does not
// count as landed until the run for that exact sha has CONCLUDED green. An
// unfinished run is a WAIT, not a pass; a ref that no longer exists is dropped;
// the alert goes out once per (ref, sha). Answers that can never change are
// cached per sha in .claude/ci-status-guard-state.json, so the common turn — the
// one that pushed nothing new — costs no API call at all. The decision logic
// lives in ci-status-guard-core.mjs (pure, Vitest-covered).
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
import {
  failedRuns,
  notifiedFromState,
  pruneFamine,
  pruneNotifiedRefs,
  pruneShaCache,
  pushedRefsFromReflog,
  refTargets,
  sweepTargets,
} from './ci-status-guard-core.mjs'
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

/** Every remote-tracking ref that still EXISTS, short form ("origin/main").
 *  A ref that has been deleted is thereby dropped from the sweep instead of
 *  being reported forever (point 387). */
function remoteRefNames() {
  try {
    return git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/'])
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/** How many reflog entries the push scan reads. BOUNDED BY CONSTRUCTION, which
 *  is point 387's cost rule: the walk may not grow with repository age, and a
 *  raised timeout is not a fix for a check that walks real git history.
 *  Sized so the CAP cannot bite before the 24 h window does: a commit writes
 *  three or four entries across HEAD, its branch and the remote ref, and the 500
 *  newest here span about 26 h — barely over the window, and less than that on a
 *  busy night with three parallel agents. 2000 keeps a roughly four-fold margin,
 *  at the same one git process (four-eyes finding 2). */
const REFLOG_ENTRIES = 2000

/** The push reflog, newest first — ONE git process, no network.
 *  WORST CASE per turn end: 4 git processes (rev-parse, branch -r --contains,
 *  this reflog read, for-each-ref), each on local refs, measured at 31 ms
 *  together. Nothing here scales with the number of branches, with the size of
 *  the ledger, or with repository age. */
function pushReflog() {
  try {
    return git([
      'reflog',
      '--date=unix',
      '--format=%gD%x09%H%x09%gs',
      '--all',
      '-n',
      String(REFLOG_ENTRIES),
    ])
  } catch {
    return '' // no reflog (fresh clone) — HEAD alone is then the sweep
  }
}

/** Judge ONE red sha the way the HEAD path always did: every failed run on it,
 *  each classified for WHERE its fault lies, so an outage cannot be mistaken for
 *  our own breakage (points 526/528). Returns the chosen classification, whether
 *  every red is unactionable, and the famine clocks to keep. */
async function judgeRed(repo, { sha, runs, classification, famine, now }) {
  const reds = failedRuns(runs, sha)
  const judged = []
  const stillFamished = {}
  for (const red of reds.length > 0 ? reds : [classification]) {
    const cause = classifyFailureCause({
      workflowName: red.workflowName,
      conclusion: red.conclusion,
      jobs: await fetchJobs(repo, red.runId),
      workflowsUntouched: await workflowsUntouchedSince(repo, runs, red, sha),
      famineSince: Number(famine[red.workflowName]) || 0,
      now,
    })
    if (cause.actionable === false) stillFamished[red.workflowName] = Number(famine[red.workflowName]) || now
    judged.push({ ...red, ...cause })
  }
  return {
    // The one that decides: the first red something can be done about, else the
    // first — which is then, by construction, an unactionable one.
    classification: judged.find((c) => c.actionable !== false) ?? judged[0],
    standDown: judged.every((c) => c.actionable === false),
    stillFamished,
    // Every workflow this call actually judged, so the sweep can CLEAR the
    // waiver clock of one that is no longer dying the famine way.
    judgedWorkflows: judged.map((c) => c.workflowName),
  }
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

  const repo = githubRepo()
  if (!repo) return null

  const now = Date.now()
  const head = git(['rev-parse', 'HEAD'])
  const state = readJson(STATE) ?? {}
  // WHEN each workflow was first seen dying the famine way, so the outage waiver
  // can expire. Kept per workflow name, not per sha: the very failure mode is one
  // workflow dying identically across commit after commit.
  const famine = pruneFamine(state.famine, now)
  const cache = pruneShaCache(state.shas, now)
  const existingRefs = remoteRefNames()
  const notified = pruneNotifiedRefs(notifiedFromState(state), existingRefs)

  // EVERY REF THIS REPOSITORY PUSHED, not just HEAD (point 387). The list comes
  // from the local push reflog: a delegated agent's branch push lands in the
  // shared reflog, so the owning session sees the work it is responsible for
  // without asking the API about a single branch it did not push.
  const targets = refTargets({
    pushed: pushedRefsFromReflog(pushReflog(), { now }),
    existingRefs,
    headSha: head,
    headPushed: isPushed(head),
  })
  if (targets.length === 0) return null // nothing pushed → no API call at all

  const swept = await sweepTargets({
    targets,
    cache,
    notified,
    famine,
    now,
    fetchRuns: (sha) => fetchRuns(repo, sha),
    judgeRed: (args) => judgeRed(repo, args),
    notify: ({ target, classification, standDown }) =>
      notifyCiRed(
        `CI failed for pushed ${target.ref} ${String(target.sha).slice(0, 7)}: "${classification.workflowName}" ` +
          `run ${classification.runId} (${classification.conclusion}, cause: ${classification.cause}` +
          `${standDown ? ', nothing in the repository can clear it' : ''}). ${classification.url ?? ''}` +
          // Once the outage waiver has expired, the alert stops saying "nothing
          // to do" and NAMES the reading only a push can fix.
          (classification.escalate ? ` ${classification.detail}. ${classification.remedy}` : ''),
      ),
  })

  if (swept.dirty || JSON.stringify(state.notifiedRefs ?? {}) !== JSON.stringify(swept.notified)) {
    writeJsonAtomic(STATE, {
      famine: swept.famine,
      shas: swept.cache,
      notifiedRefs: swept.notified,
      notifiedAt: now,
    })
  }

  // A fail-open SAYS why (point 387): a silently swallowed API error is
  // indistinguishable from a green, which is the confusion this point ends.
  if (swept.failedOpen.length > 0) {
    console.error(`ci-status-guard allowed the stop without a verdict for: ${swept.failedOpen.join('; ')}`)
  }
  return swept.decision ? JSON.stringify({ decision: 'block', reason: swept.decision }) : null
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
