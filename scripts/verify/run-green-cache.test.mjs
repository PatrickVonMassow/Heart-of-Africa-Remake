import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  cacheEnvironment, findGreenReceipt, formatCachedGreen, isNeutralPath, lastGreenReceipt, neutralDiffReader, parseNameList, rejudgeBackend, rejudgeLarge, snapshotSuiteRuns,
} from './run-green-cache.mjs'
import { DEV_SUITES, SERVERLESS_SUITES, WEBGL_ONLY_SUITES } from './tiers.mjs'

const ARGS = ['polish', '--section=adult-errands']
const green = (overrides = {}) => ({
  args: ARGS, head: 'abc123', verifyGl: null, status: 'finished', exitCode: 0, cleanAtStart: true,
  finishedAt: 60_000, receipt: { exitCode: 0, green: true }, ...overrides,
})
const entry = (overrides = {}) => ({ path: 'green.log.run.json', record: green(overrides) })
const request = (overrides = {}) => ({ argv: ARGS, head: 'abc123', records: [entry()], ...overrides })

describe('run-logged green receipts', () => {
  it('serves the last green for exactly the same head, suite and section', () => {
    const old = entry({ finishedAt: 100 })
    const latest = entry({ finishedAt: 120_000 })
    const found = lastGreenReceipt(request({ records: [latest, entry({ exitCode: 1 }), old] }))
    expect(found).toBe(latest)
    expect(formatCachedGreen(found, 240_000)).toBe('already green 2 min ago, receipt green.log.run.json')
  })

  it.each([
    { head: 'changed' }, { argv: ['settings', '--section=adult-errands'] },
    { argv: ['polish', '--section=other'] }, { argv: ['polish'] },
    { argv: ['large'] }, { argv: ['polish', 'settings'] },
    { argv: [...ARGS, '--baseline'] }, { verifyGl: 'webgl' },
    { again: true }, { clean: false }, { head: null },
    { environment: cacheEnvironment({ VERIFY_SEED: '1234' }) },
  ])('does not reuse a different request or an explicit fresh run: %j', (change) => {
    expect(lastGreenReceipt(request(change))).toBeNull()
  })

  it.each([
    { status: 'running' }, { exitCode: 1 }, { receipt: null },
    { receipt: { exitCode: 1 } }, { finishedAt: null },
    { receipt: { exitCode: 0, green: false, failing: [{ name: 'settings' }] } },
    { args: ['large', ...ARGS] },
  ])('does not reuse incomplete or ineligible evidence: %j', (change) => {
    expect(lastGreenReceipt(request({ records: [entry(change)] }))).toBeNull()
  })

  it('does not reuse a receipt from a dirty tree even when the current tree is clean', () => {
    expect(lastGreenReceipt(request({ clean: true, records: [entry({ cleanAtStart: false })] }))).toBeNull()
  })

  it('does not treat a legacy receipt with unknown tree state as clean', () => {
    const legacy = entry()
    delete legacy.record.cleanAtStart
    expect(lastGreenReceipt(request({ clean: true, records: [legacy] }))).toBeNull()
  })

  it('keeps seed and retry settings distinct while ignoring wrapper controls', () => {
    expect(cacheEnvironment({ VERIFY_NO_WAIT: '1', VERIFY_LOG_DIR: 'logs', VERIFY_GL: 'webgl' })).toBe('[]')
    const environment = cacheEnvironment({ VERIFY_SEED: '1234', VERIFY_NO_RETRY: '1' })
    expect(lastGreenReceipt(request({ environment, records: [entry({ cacheEnvironment: environment })] }))).not.toBeNull()
    expect(lastGreenReceipt(request({ environment, records: [entry()] }))).toBeNull()
  })

  it('finds a green beyond twenty newer red records and ignores torn JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-green-cache-'))
    try {
      writeFileSync(join(dir, 'old.log.run.json'), JSON.stringify(green()))
      for (let i = 0; i < 25; i++) {
        writeFileSync(join(dir, `${i}.log.run.json`), JSON.stringify(green({ exitCode: 1 })))
      }
      writeFileSync(join(dir, 'torn.run.json'), '{')
      const found = findGreenReceipt({ ...request(), dir, clean: true })
      expect(found.path).toBe(join(dir, 'old.log.run.json'))
      expect(findGreenReceipt({ ...request(), dir, clean: true, again: true })).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('re-judging a LARGE receipt across a render-neutral diff', () => {
  const BROWSER = DEV_SUITES.filter((s) => !SERVERLESS_SUITES.includes(s))
  const suiteRun = (suite, backend, overrides = {}) => ({
    suite, backend, head: 'old1234full', startedAt: 10, at: 20, exit: 0, asserted: true, terminalVerdict: true, ...overrides,
  })
  const passOf = (backend, overrides = {}) => BROWSER
    .filter((s) => backend === 'webgl' || !WEBGL_ONLY_SUITES.includes(s))
    .map((s) => suiteRun(s, backend, overrides[s] ?? {}))
  const large = (suiteRuns, overrides = {}) => ({
    path: 'large.log.run.json',
    record: {
      args: ['large'], head: 'old1234', verifyGl: null, status: 'finished', exitCode: 1, cleanAtStart: true,
      finishedAt: 1000, receipt: { exitCode: 1, green: false, failing: [{ name: 'polish' }] }, suiteRuns, ...overrides,
    },
  })
  // polish on WebGPU went red on a check TODAY's ledger does not charge.
  const loose = { polish: { exit: 1, reds: [{ name: 'a red nobody owns', kind: 'check' }] } }
  const receipt = () => large([...passOf('webgl'), ...passOf('webgpu', loose)])
  const ask = (diff, overrides = {}) => rejudgeLarge({
    records: [receipt()], argv: ['large'], head: 'new5678', verifyGl: undefined,
    diffFor: () => diff, openPoints: [], ledger: [], ...overrides,
  })

  it('reuses the receipt across a neutral diff and runs only the backend it did not cover', () => {
    const result = ask(['scripts/render-verify-charges.mjs', 'TASKS.md', 'scripts/verify/ladder-core.test.mjs'])
    expect(result.covered.map((c) => [c.backend, c.range])).toEqual([['webgl', 'old1234..new5678']])
    expect(result.missing).toEqual(['webgpu'])
    expect(result.docs).toBe(true)
  })

  it('re-judges against the CURRENT ledger: a red charged today to an open point is covered', () => {
    const ledger = [{ point: 42, suite: 'polish', match: /^a red nobody owns$/ }]
    const result = ask(['scripts/render-verify-charges.mjs'], { openPoints: [42], ledger })
    expect(result.covered.map((c) => c.backend)).toEqual(['webgl', 'webgpu'])
    expect(result.missing).toEqual([])
    expect(result.docs).toBe(false)
  })

  it('runs everything when the diff touches src/', () => {
    expect(ask(['docs/backlog.md', 'src/game/store.ts']).missing).toEqual(['webgl', 'webgpu'])
  })

  it.each(['vite.config.ts', 'package-lock.json', 'public/favicon.svg', 'scripts/closing-guard-core.mjs', 'scripts/verify/polish.mjs'])(
    'runs everything for a path outside the neutral set (fail closed): %s', (path) => {
      expect(isNeutralPath(path)).toBe(false)
      expect(ask([path]).missing).toEqual(['webgl', 'webgpu'])
    })

  it('does not re-judge a red whose run record is incomplete — that backend reruns', () => {
    const ledger = [{ point: 42, suite: 'polish', match: /^a red nobody owns$/ }]
    const incomplete = { polish: { ...loose.polish, truncated: true } }
    const records = [large([...passOf('webgl'), ...passOf('webgpu', incomplete)])]
    const result = ask([], { records, openPoints: [42], ledger })
    expect(result.missing).toEqual(['webgpu'])
    expect(rejudgeBackend(records[0].record, 'webgpu', { openPoints: [42], ledger }).reason).toMatch(/incomplete/)
  })

  it('never re-judges an old receipt without suite records, a missing suite, or a non-ancestor', () => {
    expect(ask([], { records: [large(undefined)] }).missing).toEqual(['webgl', 'webgpu'])
    const short = large(passOf('webgl').filter((r) => r.suite !== 'polish'))
    expect(ask([], { records: [short] }).missing).toEqual(['webgl', 'webgpu'])
    expect(ask(null).missing).toEqual(['webgl', 'webgpu'])
  })

  it('never re-judges when a non-browser step failed or the request is not an unfiltered LARGE', () => {
    const lint = large(passOf('webgl'), { receipt: { exitCode: 1, failing: [{ name: 'lint' }] } })
    expect(ask([], { records: [lint] }).missing).toEqual(['webgl', 'webgpu'])
    expect(ask([], { argv: ['polish'] }).covered).toEqual([])
    expect(ask([], { again: true }).covered).toEqual([])
  })

  it('answers a pinned request from the matching backend only', () => {
    expect(ask([], { verifyGl: 'webgl' })).toMatchObject({ missing: [] })
    expect(ask([], { verifyGl: 'webgpu' }).missing).toEqual(['webgpu'])
  })

  it('snapshots only the full-suite records the run itself wrote', () => {
    const runs = [suiteRun('polish', 'webgl'), suiteRun('polish', 'webgl', { head: 'other' }),
      suiteRun('polish', 'webgl', { partial: true }), suiteRun('polish', 'webgl', { startedAt: 1 })]
    expect(snapshotSuiteRuns(runs, { head: 'old1234', startedAt: 5, finishedAt: 30 })).toEqual([runs[0]])
  })

  it('judges both sides of a rename: moving code out of src/ into docs/ is not neutral', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-rejudge-rename-'))
    const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    try {
      git('init', '-q')
      git('config', 'user.email', 't@example.invalid')
      git('config', 'user.name', 'test')
      mkdirSync(join(dir, 'src'))
      writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1\n'.repeat(20))
      git('add', '.')
      git('commit', '-q', '-m', 'base')
      const base = git('rev-parse', 'HEAD').trim()
      mkdirSync(join(dir, 'docs'))
      git('mv', 'src/a.ts', 'docs/x.md')
      git('commit', '-q', '-m', 'move')
      const paths = neutralDiffReader(dir)(base)
      expect(paths.sort()).toEqual(['docs/x.md', 'src/a.ts'])
      expect(ask(paths).missing).toEqual(['webgl', 'webgpu'])
      expect(parseNameList('src/a b.ts\0docs/x.md\0')).toEqual(['src/a b.ts', 'docs/x.md'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
