import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import * as core from './baseline-classify-core.mjs'
import { parseWrapperArgs } from './baseline-classify.mjs'

const source = readFileSync('scripts/verify/baseline-classify.mjs', 'utf8')
const start = source.indexOf('  let currentFailed = opts.failed.map(checkFromName)')
const end = source.indexOf('  if (opts.reportFile)', start)
if (start < 0 || end < 0) throw new Error('Baseline classification body missing')

// Run the wrapper's actual measurement/report path with process and filesystem
// boundaries substituted. No baseline worktree, browser or server is created.
async function report(argv, section = '') {
  const lines = []
  const runs = []
  await runInNewContext(`(async () => {${source.slice(start, end)}})()`, {
    ...core, join,
    opts: parseWrapperArgs(['polish', '--runs', '1', ...argv]),
    process: { env: { VERIFY_SECTION: section }, exit: () => { throw new Error('Unexpected exit') } },
    needsServer: true, ROOT: '/candidate', HERE: '/candidate/scripts/verify', INFRA_PATHS: [],
    tree: { dir: '/baseline', mainRoot: '/repo', base: '/trees' },
    baseline: { sha: 'a'.repeat(40), ref: 'merge-base with main' }, backend: 'webgl',
    launchServer: async (_command, label) => ({ base: `http://${label}`, child: null }),
    killTree: () => {}, pruneOldBaselines: () => {}, logDir: () => '/logs',
    existsSync: () => true, readFileSync: () => 'FAIL  jar', git: () => '',
    runSuiteOnce: (options) => {
      runs.push(options)
      const out = options.baseUrl === 'http://current' ? 'FAIL  jar' : 'PASS  jar'
      return { out, failed: core.failedChecks(out), checks: core.allChecks(out), exitCode: out.startsWith('FAIL') ? 1 : 0 }
    },
    console: { log: (line) => lines.push(line) },
  })
  return { text: lines.join('\n'), runs }
}

it('carries the runner context all the way to each printed regression claim', async () => {
  const result = await report(['--failed', 'jar', '--current-context', 'in-pass'])
  expect(result.runs).toHaveLength(1)
  expect(result.text).toContain('REAL REGRESSION (green on baseline, red now) — NOT LIKE-FOR-LIKE (baseline standalone, candidate in-pass; causation unproven)')
})

it.each([['--failed', 'jar'], ['--current-out', '/logs/large.log']])('keeps supplied failures of unknown context qualified: %j', async (...argv) => {
  const result = await report(argv)
  expect(result.runs).toHaveLength(1)
  expect(result.text).toContain('COMPARABILITY UNKNOWN (baseline standalone, candidate unknown; causation unproven)')
})

it.each(['', 'adult-errands'])('uses matching context when it actually runs both candidates itself (section %s)', async (section) => {
  const result = await report(['--current-context', 'in-pass'], section)
  expect(result.runs).toHaveLength(2)
  const context = section ? 'standalone section "adult-errands"' : 'standalone'
  expect(result.text).toContain(`baseline ${context}, candidate ${context}`)
  expect(result.text).toContain('REAL REGRESSION (green on baseline, red now)')
  expect(result.text).not.toContain('causation unproven')
})
