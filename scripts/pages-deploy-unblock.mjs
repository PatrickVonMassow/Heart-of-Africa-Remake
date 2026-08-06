// Clear a stuck GitHub Pages deployment — the handle the repository did not
// have on 06.08.2026 (see pages-deploy-unblock-core.mjs for the incident).
//
//   node scripts/pages-deploy-unblock.mjs             # report only
//   node scripts/pages-deploy-unblock.mjs --cancel    # cancel what blocks, then report
//   options: --repo owner/name · --sha <sha> (inspect this one too) · --json
//
// It runs in two places: inside the deploy workflow (with the job's
// GITHUB_TOKEN, after a failed deploy attempt, writing `retry=` to
// $GITHUB_OUTPUT for the one retry step) and by hand on a dev machine (with the
// PAT at .secrets/github-token) as the remedy `ci-status-guard` names.
//
// This is a COMMAND, not a hook: it fails loud and says what it could not do.
// The decision logic is pure (pages-deploy-unblock-core.mjs).
//
// node:https rather than global fetch, for the reason ci-status-guard.mjs
// records: undici's keep-alive sockets stall a natural process exit, and its
// teardown has crashed libuv on Windows. The few lines are duplicated on
// purpose — a working Stop hook is not refactored for a second caller.
import { readFileSync, appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { request } from 'node:https'
import { REPO_ROOT, repoPath } from './repo-paths.mjs'
import { isMainModule } from './is-main.mjs'
import {
  INSPECT_LIMIT,
  blockingDeployments,
  candidateDeployments,
  shouldRetryDeploy,
  stallReport,
} from './pages-deploy-unblock-core.mjs'

const TOKEN_PATHS = [repoPath('.secrets/github-token')]

function readFileTrim(path) {
  try {
    return readFileSync(path, 'utf8').trim() || null
  } catch {
    return null
  }
}

function readToken() {
  for (const key of ['GITHUB_TOKEN', 'GH_TOKEN']) {
    const v = (process.env[key] ?? '').trim()
    if (v) return v
  }
  for (const p of TOKEN_PATHS) {
    const t = readFileTrim(p)
    if (t) return t
  }
  return null
}

/** "owner/repo" from --repo, the runner environment, or the origin remote. */
export function resolveRepo(argv = []) {
  const explicit = flag(argv, '--repo')
  if (explicit) return explicit
  const env = (process.env.GITHUB_REPOSITORY ?? '').trim()
  if (env) return env
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export function flag(argv, name) {
  const i = argv.indexOf(name)
  if (i < 0) return ''
  const v = argv[i + 1]
  return v && !v.startsWith('--') ? v : ''
}

/** {status, body} or null; never rejects. agent:false → the socket closes with
 *  the response so the event loop drains and the process exits by itself. */
function httpsRequest(url, { method = 'GET', headers = {}, timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    try {
      const req = request(url, { method, headers, agent: false, timeout: timeoutMs }, (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (c) => {
          if (data.length < 2_000_000) data += c
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
        res.on('error', () => resolve(null))
      })
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', () => resolve(null))
      req.end()
    } catch {
      resolve(null)
    }
  })
}

function api(repo, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'hoa-pages-deploy-unblock',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return async (path, method = 'GET') => {
    const res = await httpsRequest(`https://api.github.com/repos/${repo}${path}`, { method, headers })
    if (!res) return { ok: false, status: 0, data: null, error: 'no response (offline or timeout)' }
    let data = null
    try {
      data = res.body ? JSON.parse(res.body) : null
    } catch {
      /* a non-JSON body is reported through the status alone */
    }
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      data,
      error: res.status >= 200 && res.status < 300 ? null : (data?.message ?? `HTTP ${res.status}`),
    }
  }
}

/** Inspect the newest `github-pages` deployments and report what still blocks. */
export async function inspect(call, { extraSha = '' } = {}) {
  const listed = await call(`/deployments?environment=github-pages&per_page=${INSPECT_LIMIT}`)
  if (!listed.ok) return { error: `listing deployments failed: ${listed.error}`, inspected: [], blocking: [] }
  const candidates = candidateDeployments(listed.data)
  if (extraSha && !candidates.some((c) => c.sha === extraSha)) candidates.unshift({ sha: extraSha, createdAt: '' })

  const inspected = []
  for (const c of candidates) {
    const res = await call(`/pages/deployments/${c.sha}`)
    // A 404 means this commit has no Pages deployment record — not a blocker.
    inspected.push({ sha: c.sha, createdAt: c.createdAt, status: res.ok ? (res.data?.status ?? '') : 'not_found' })
  }
  return { error: null, inspected, blocking: blockingDeployments(inspected) }
}

/** Cancel each blocking deployment and read its status back. */
export async function cancelAll(call, blocking) {
  const cancelled = []
  const failed = []
  for (const d of blocking) {
    const res = await call(`/pages/deployments/${d.sha}/cancel`, 'POST')
    if (res.ok) {
      const after = await call(`/pages/deployments/${d.sha}`)
      cancelled.push({ sha: d.sha, statusAfter: after.ok ? (after.data?.status ?? '') : 'unknown_status' })
    } else {
      failed.push({ sha: d.sha, error: res.error })
    }
  }
  return { cancelled, failed }
}

function writeGithubOutput(pairs) {
  const file = process.env.GITHUB_OUTPUT
  if (!file) return
  try {
    appendFileSync(file, Object.entries(pairs).map(([k, v]) => `${k}=${v}\n`).join(''))
  } catch (e) {
    console.error(`could not write GITHUB_OUTPUT: ${e && e.message}`)
  }
}

async function main(argv = process.argv.slice(2)) {
  const doCancel = argv.includes('--cancel')
  const asJson = argv.includes('--json')
  const repo = resolveRepo(argv)
  if (!repo) {
    console.error('no repository: pass --repo owner/name (or run inside the repo / on the runner)')
    return 2
  }
  const token = readToken()
  if (!token) console.error('warning: no token — the API runs unauthenticated and a cancel will be refused')

  const call = api(repo, token)
  const { error, inspected, blocking } = await inspect(call, { extraSha: flag(argv, '--sha') })
  if (error) {
    console.error(error)
    writeGithubOutput({ retry: 'false', cleared: '0' })
    return 1
  }

  let cancelled = []
  let failed = []
  if (doCancel && blocking.length > 0) ({ cancelled, failed } = await cancelAll(call, blocking))

  const decision = shouldRetryDeploy({ deployFailed: true, cancelled })
  const report = stallReport({ repo, blocking, cancelled, failed })
  if (asJson) console.log(JSON.stringify({ repo, inspected, blocking, cancelled, failed, decision }, null, 2))
  else {
    console.log(report)
    console.log(decision.reason)
  }
  writeGithubOutput({ retry: String(decision.retry), cleared: String(cancelled.length) })
  return failed.length > 0 ? 1 : 0
}

if (isMainModule(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((e) => {
      console.error(`pages-deploy-unblock failed: ${e && e.message}`)
      process.exitCode = 1
    })
}
