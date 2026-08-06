// Vitest coverage for the I/O half of the Pages unblock command
// (pages-deploy-unblock.mjs), driven through a fake API caller — no network.
//
// The `$GITHUB_OUTPUT` contract is the reason this file exists: the workflow's
// retry step reads `steps.unblock.outputs.retry`, so a typo in that key would
// silently disable the retry and leave a stuck deployment in place with a green
// clearing step. Both ends are pinned here, the writer and the workflow.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { repoPath } from './repo-paths.mjs'
import { cancelAll, inspect, writeGithubOutput } from './pages-deploy-unblock.mjs'

// repoPath, not `new URL(import.meta.url)`: under Vitest's module runner that is
// not a file URL and would throw at import time (see repo-paths.mjs).
const WORKFLOW = repoPath('.github/workflows/deploy-pages.yml')

/** A fake `call(path, method)` over a canned repository state. */
function fakeApi({ deployments = [], statuses = {}, cancels = {} } = {}) {
  const seen = []
  const call = async (path, method = 'GET') => {
    seen.push(`${method} ${path}`)
    if (path.startsWith('/deployments')) return { ok: true, status: 200, data: deployments, error: null }
    const cancelMatch = path.match(/^\/pages\/deployments\/([^/]+)\/cancel$/)
    if (cancelMatch) {
      const outcome = cancels[cancelMatch[1]] ?? { ok: true }
      return { ok: outcome.ok, status: outcome.ok ? 204 : 403, data: null, error: outcome.error ?? null }
    }
    const statusMatch = path.match(/^\/pages\/deployments\/([^/]+)$/)
    if (statusMatch) {
      const s = statuses[statusMatch[1]]
      return s === undefined
        ? { ok: false, status: 404, data: null, error: 'Not Found' }
        : { ok: true, status: 200, data: { status: s }, error: null }
    }
    return { ok: false, status: 404, data: null, error: 'unexpected path' }
  }
  return { call, seen }
}

const dep = (sha, createdAt) => ({ sha, id: 1, environment: 'github-pages', created_at: createdAt })

describe('inspect', () => {
  it('reads each candidate through the Pages API and names what blocks', async () => {
    const { call, seen } = fakeApi({
      deployments: [dep('a'.repeat(40), '2026-08-06T15:00:00Z'), dep('b'.repeat(40), '2026-08-06T14:00:00Z')],
      statuses: { ['a'.repeat(40)]: 'deployment_in_progress', ['b'.repeat(40)]: 'succeed' },
    })
    const out = await inspect(call)
    expect(out.error).toBe(null)
    expect(out.inspected.map((d) => d.status)).toEqual(['deployment_in_progress', 'succeed'])
    expect(out.blocking.map((d) => d.sha)).toEqual(['a'.repeat(40)])
    expect(seen[0]).toContain('/deployments?environment=github-pages')
  })

  it('reports a deployment with no Pages record as not_found rather than blocking', async () => {
    const { call } = fakeApi({ deployments: [dep('c'.repeat(40), '2026-08-06T15:00:00Z')], statuses: {} })
    const out = await inspect(call)
    expect(out.inspected[0].status).toBe('not_found')
    expect(out.blocking).toEqual([])
  })

  it('inspects a sha named from the outside even when the listing omits it', async () => {
    const named = 'd'.repeat(40)
    const { call } = fakeApi({
      deployments: [dep('e'.repeat(40), '2026-08-06T15:00:00Z')],
      statuses: { ['e'.repeat(40)]: 'succeed', [named]: 'deployment_in_progress' },
    })
    const out = await inspect(call, { extraSha: named })
    expect(out.blocking.map((d) => d.sha)).toEqual([named])
  })

  it('reports a failed listing instead of claiming nothing blocks', async () => {
    const call = async () => ({ ok: false, status: 403, data: null, error: 'Forbidden' })
    const out = await inspect(call)
    expect(out.error).toContain('Forbidden')
    expect(out.blocking).toEqual([])
  })
})

describe('cancelAll', () => {
  it('cancels each blocker and reads its status back', async () => {
    const sha = 'f'.repeat(40)
    const { call, seen } = fakeApi({ statuses: { [sha]: 'deployment_cancelled' } })
    const out = await cancelAll(call, [{ sha }])
    expect(out.cancelled).toEqual([{ sha, statusAfter: 'deployment_cancelled' }])
    expect(out.failed).toEqual([])
    expect(seen).toContain(`POST /pages/deployments/${sha}/cancel`)
  })

  it('keeps a refused cancel apart, with its error', async () => {
    const sha = '0'.repeat(40)
    const { call } = fakeApi({ cancels: { [sha]: { ok: false, error: 'HTTP 403' } } })
    const out = await cancelAll(call, [{ sha }])
    expect(out.cancelled).toEqual([])
    expect(out.failed).toEqual([{ sha, error: 'HTTP 403' }])
  })
})

describe('the $GITHUB_OUTPUT contract with the workflow', () => {
  let dir = ''
  let previous

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hoa-pages-out-'))
    previous = process.env.GITHUB_OUTPUT
  })

  afterEach(() => {
    if (previous === undefined) delete process.env.GITHUB_OUTPUT
    else process.env.GITHUB_OUTPUT = previous
    rmSync(dir, { recursive: true, force: true })
  })

  it('writes key=value lines to the file the runner names', () => {
    const file = join(dir, 'out.txt')
    process.env.GITHUB_OUTPUT = file
    writeGithubOutput({ retry: 'true', cleared: '2' })
    expect(readFileSync(file, 'utf8')).toBe('retry=true\ncleared=2\n')
  })

  it('is a silent no-op off the runner', () => {
    delete process.env.GITHUB_OUTPUT
    expect(() => writeGithubOutput({ retry: 'false' })).not.toThrow()
  })

  it('the workflow reads exactly the key the script writes', () => {
    const yml = readFileSync(WORKFLOW, 'utf8')
    expect(yml).toContain("steps.unblock.outputs.retry == 'true'")
    // The step that produces it must be the one the retry names.
    expect(yml).toMatch(/id:\s*unblock/)
    expect(yml).toContain('pages-deploy-unblock.mjs --cancel')
  })
})
