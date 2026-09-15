import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import * as core from './baseline-classify-core.mjs'
import { SECTION_ENV, listNonPredictive, listSections, narrowDiagnosis, sectionOfLine } from './sections.mjs'
import { parseWrapperArgs } from './baseline-classify.mjs'
import { sectionTag } from '../section-tag-core.mjs'

const source = readFileSync('scripts/verify/baseline-classify.mjs', 'utf8')
const start = source.indexOf('  let currentFailed = opts.failed.map(checkFromName)')
const end = source.indexOf('  if (opts.reportFile)', start)
if (start < 0 || end < 0) throw new Error('Baseline classification body missing')

// Run the wrapper's actual measurement/report path with process and filesystem
// boundaries substituted. No baseline worktree, browser or server is created.
async function report(argv, section = '', { suiteSource = 'no sections here', current = 'FAIL  jar' } = {}) {
  const lines = []
  const runs = []
  await runInNewContext(`(async () => {${source.slice(start, end)}})()`, {
    ...core, join,
    SECTION_ENV, listNonPredictive, listSections, narrowDiagnosis, sectionOfLine,
    opts: parseWrapperArgs(['polish', '--runs', '1', ...argv]),
    process: { env: { VERIFY_SECTION: section }, exit: () => { throw new Error('Unexpected exit') } },
    needsServer: true, ROOT: '/candidate', HERE: '/candidate/scripts/verify', INFRA_PATHS: [],
    tree: { dir: '/baseline', mainRoot: '/repo', base: '/trees' },
    baseline: { sha: 'a'.repeat(40), ref: 'merge-base with main' }, backend: 'webgl',
    launchServer: async (_command, label) => ({ base: `http://${label}`, child: null }),
    killTree: () => {}, pruneOldBaselines: () => {}, logDir: () => '/logs',
    existsSync: () => true,
    // The wrapper reads two different files here: the CURRENT run's output and
    // the suite's own source, from which the narrowing reads the declarations.
    readFileSync: (path) => (String(path).endsWith('polish.mjs') ? suiteSource : current),
    git: () => '',
    runSuiteOnce: (options) => {
      runs.push(options)
      const out = options.baseUrl === 'http://current' ? current : (current.replace(/^FAIL/gm, 'PASS'))
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

// ── the baseline runs only the blocks that are red (point 1126) ────────────
const SECTIONED = [
  "if (section('town-plan')) { check('a plan is drawn') }",
  "if (section('adult-errands')) { check('jar') }",
  "if (section('children-tag')) { check('tag') }",
  "if (section('roof-clearance')) { check('roof') }",
  "if (section('giza-site')) { check('giza') }",
  "if (section('campfire-shadows')) { check('fire') }",
].join('\n')

it('runs the baseline on the red block only, and says so in the report context', async () => {
  const current = `FAIL  jar — saw 0${sectionTag('adult-errands')}`
  const result = await report(['--current-out', '/logs/large.log'], '', { suiteSource: SECTIONED, current })
  expect(result.runs.map((r) => r.onlySection)).toEqual(['adult-errands'])
  expect(result.text).toContain('baseline runs only the red block(s) adult-errands')
  expect(result.text).toContain('baseline standalone block(s) "adult-errands"')
})

it('runs the whole suite when a red names no block at all', async () => {
  const current = 'FAIL  jar — saw 0'
  const result = await report(['--current-out', '/logs/large.log'], '', { suiteSource: SECTIONED, current })
  expect(result.runs.map((r) => r.onlySection)).toEqual([''])
  expect(result.text).toContain('baseline runs the WHOLE suite')
  expect(result.text).toContain('names no section')
})
