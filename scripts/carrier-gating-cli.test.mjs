// PUSH FIRST, TICK SECOND (no user order is ever lost, 21.10.2026).
//
// The carrier said "queued 1402..1406" while the appends were only in the
// working tree; the doctor then stashed the tree. These cases run the real CLI
// against a throwaway checkout with a bare origin and pin that `--queued` and
// `--drained --point` tick ONLY once origin/main holds the point.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REPO_ROOT } from './repo-paths.mjs'
import { appendPoint, makeRepoFixture } from './carrier-reconcile-fixture.mjs'
import { parseRequestState, titleAnchor } from './carrier-reconcile-core.mjs'
import { requestEntries } from './findings-request-core.mjs'
import { memoryDir, projectSlug, repoCarrierPaths } from './findings-paths.mjs'

let mem
let repo
const run = (args, root = repo.root) => {
  try {
    return { ok: true, out: execFileSync(process.execPath, ['scripts/finding.mjs', ...args, '--session', 'test'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, FINDINGS_MEMORY_DIR: mem, HOA_REPO_ROOT: root },
      stdio: ['pipe', 'pipe', 'pipe'],
    }) }
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}
const carrier = () => readFileSync(join(mem, 'findings-carrier.md'), 'utf8')
const deposit = (title) => {
  writeFileSync(join(mem, 'spec.md'), 'FINAL STATE: x.\n')
  writeFileSync(join(mem, 'why.md'), 'why.\n')
  return run(['--request', title, '--spec-file', join(mem, 'spec.md'), '--why-file', join(mem, 'why.md'), '--quotes', 'user 21.10.2026: "x"'])
}
const stateOf = (title) => requestEntries(carrier()).find((e) => e.title.includes(title))?.state

beforeEach(() => {
  mem = mkdtempSync(join(tmpdir(), 'hoa-gating-mem-'))
  repo = makeRepoFixture({ points: [100] })
})
afterEach(() => {
  rmSync(mem, { recursive: true, force: true })
  rmSync(repo.base, { recursive: true, force: true })
})

describe('--queued is refused until origin/main holds the point', () => {
  it('refuses a point that is only in the working tree and leaves the entry pending', () => {
    deposit('Nutzerauftrag A')
    appendPoint(repo.root, 1402)
    const r = run(['--queued', 'Nutzerauftrag A', '--point', '1402'])
    expect(r.ok).toBe(false)
    expect(r.out).toMatch(/REFUSED: point 1402 is only in the working tree/)
    expect(stateOf('Nutzerauftrag A')).toBe('pending')
  })

  it('refuses a point committed locally but not pushed', () => {
    deposit('Nutzerauftrag B')
    appendPoint(repo.root, 1403)
    repo.git('commit', '-qam', 'append 1403')
    const r = run(['--queued', 'Nutzerauftrag B', '--point', '1403', '--no-fetch'])
    expect(r.ok).toBe(false)
    expect(r.out).toMatch(/only in an unpushed local commit/)
    expect(stateOf('Nutzerauftrag B')).toBe('pending')
  })

  it('refuses a point that only a feature branch / linked worktree holds', () => {
    deposit('Nutzerauftrag C')
    const wt = join(repo.base, 'wt')
    repo.git('worktree', 'add', '-q', '-b', 'feat/x', wt)
    appendPoint(wt, 1404)
    execFileSync('git', ['-C', wt, 'commit', '-qam', 'append on branch'], { stdio: 'ignore', windowsHide: true })
    // Run FROM the worktree: the proof must still read the main checkout.
    const r = run(['--queued', 'Nutzerauftrag C', '--point', '1404'], wt)
    expect(r.ok).toBe(false)
    expect(r.out).toMatch(/1404 is in neither TASKS.md nor/)
    expect(stateOf('Nutzerauftrag C')).toBe('pending')
  })

  it('ticks with the origin/main sha and the title anchor once pushed', () => {
    deposit('Nutzerauftrag D')
    appendPoint(repo.root, 1405, 'Water carrier sets the jar down')
    expect(run(['--appending', 'Nutzerauftrag D', '--point', '1405']).ok).toBe(true)
    expect(stateOf('Nutzerauftrag D')).toBe('appending 1405')
    // Still open: a queue tick without the push stays refused.
    expect(run(['--queued', 'Nutzerauftrag D', '--point', '1405']).ok).toBe(false)
    repo.git('commit', '-qam', 'append 1405')
    repo.git('push', '-q', 'origin', 'main')
    const sha = repo.git('rev-parse', 'origin/main').slice(0, 12)
    const r = run(['--queued', 'Nutzerauftrag D', '--point', '1405'])
    expect(r.ok).toBe(true)
    expect(stateOf('Nutzerauftrag D')).toBe(`queued 1405 @${sha} ~${titleAnchor('Water carrier sets the jar down')}`)
  })

  it('a legacy sha-less tick still parses, and is flagged as unproven', () => {
    const legacy = parseRequestState('queued 1009')
    expect(legacy).toMatchObject({ kind: 'queued', points: [1009], sha: null, anchor: null })
    expect(parseRequestState('queued 1402..1406').points).toEqual([1402, 1403, 1404, 1405, 1406])
    expect(parseRequestState('queued 7 @abcdef123456 ~0badc0de')).toMatchObject({ sha: 'abcdef123456', anchor: '0badc0de' })
  })
})

describe('--drained names where the finding went', () => {
  it('refuses a drain with neither --point nor --why', () => {
    run(['--record', 'Ein Befund', '--detail', 'd'])
    expect(run(['--drained', 'Ein Befund']).out).toMatch(/--point <N>/)
  })

  it('refuses --point for an unpushed point, and stamps the proof once pushed', () => {
    run(['--record', 'Ein Befund', '--detail', 'd'])
    appendPoint(repo.root, 1406)
    expect(run(['--drained', 'Ein Befund', '--point', '1406']).out).toMatch(/REFUSED/)
    expect(carrier()).toMatch(/- \[ \] .* · Ein Befund/)
    repo.git('commit', '-qam', 'append 1406')
    repo.git('push', '-q', 'origin', 'main')
    expect(run(['--drained', 'Ein Befund', '--point', '1406']).ok).toBe(true)
    expect(carrier()).toMatch(/- \[x\] .* · Ein Befund\n {6}d\n {6}drained into point 1406 @[0-9a-f]{12} ~[0-9a-f]{8}/)
  })

  it('keeps the reason of a drain into no point', () => {
    run(['--record', 'Doppelt', '--detail', 'd'])
    expect(run(['--drained', 'Doppelt', '--why', 'duplicate of 100']).ok).toBe(true)
    expect(carrier()).toContain('drained without a point: duplicate of 100')
  })
})

describe('one repository, one memory directory', () => {
  it('maps a path with and without a trailing separator to the same slug', () => {
    expect(projectSlug('/workspace/hoa/')).toBe(projectSlug('/workspace/hoa'))
    expect(memoryDir({ root: '/workspace/hoa/', home: '/h', env: {} })).toBe(memoryDir({ root: '/workspace/hoa', home: '/h', env: {} }))
  })

  it('reads every carrier that belongs to the repository, the trailing twin and worktree ones included', () => {
    const home = mkdtempSync(join(tmpdir(), 'hoa-home-'))
    for (const name of ['-workspace-hoa', '-workspace-hoa-', '-workspace-hoa--claude-worktrees-point-1', '-workspace-hoax']) {
      mkdirSync(join(home, '.claude', 'projects', name, 'memory'), { recursive: true })
      writeFileSync(join(home, '.claude', 'projects', name, 'memory', 'findings-carrier.md'), '')
    }
    const paths = repoCarrierPaths({ root: '/workspace/hoa', home, env: {} }).map((p) => p.split(/[\\/]/).at(-3))
    expect(paths.sort()).toEqual(['-workspace-hoa', '-workspace-hoa-', '-workspace-hoa--claude-worktrees-point-1'])
    rmSync(home, { recursive: true, force: true })
  })
})

describe('an appending request is open but not a turn-end violation', () => {
  const text = [
    '- [ ] 2026-10-21T10:00:00.000Z · s · [request] · appending 1402 · Auftrag',
    '      #spec',
    '      FINAL STATE: x',
  ].join('\n')

  it('counts apart from pending and drained', async () => {
    const { parseCarrier } = await import('./findings-core.mjs')
    const parsed = parseCarrier(text)
    expect(parsed.requests).toHaveLength(0)
    expect(parsed.appending).toHaveLength(1)
    expect(parsed.drained).toBe(0)
  })

  it('the Stop guard does not demand a premature tick, but the boundary still refuses to hand it over', async () => {
    const { auditFindings, boundaryRequestRefusal, parseCarrier } = await import('./findings-core.mjs')
    const v = auditFindings({ tally: { investigative: 0, agents: 0, records: [] }, ownsBatch: true, carrierRequests: parseCarrier(text).requests.length })
    expect(v.violations.map((x) => x.kind)).not.toContain('request-not-queued')
    expect(boundaryRequestRefusal(() => text)).toMatch(/--queued/)
  })
})
