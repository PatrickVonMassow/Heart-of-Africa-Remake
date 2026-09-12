import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import * as core from '../render-verify-core.mjs'
import * as classify from './baseline-classify-core.mjs'
import * as tiers from './tiers.mjs'
import * as load from './machine-load-core.mjs'
import * as sections from './sections.mjs'
import * as ownership from './red-ownership-core.mjs'

const { chargeReds, RETRY_ENV, runVerdict } = core
const ground = 'first-person ground shows micro-detail (edge energy)'
const known = `FAIL  ${ground} — laplacian mean 1.07`
const unknown = 'FAIL  a new defect — unexpected measurement'
const runnerUrl = pathToFileURL(resolve('scripts/verify/run-all.mjs'))
// Run the entrypoint's actual body in an isolated VM. Imports are replaced with
// explicit dependencies, so no process, browser or server can escape the fixture.
const source = readFileSync(runnerUrl, 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(runnerUrl.href))

async function run({ outputs = [known], records = [{}], tasks = '- [ ] 603. ground repair', noRetry = false,
  backend = 'webgl', suite = 'settings', previous = [], spawnError = null, large = false, verdict = 'pre-existing' } = {}) {
  const printed = []
  const classifiedCalls = []
  const exit = new Error('runner exited')
  let exitCode
  const saved = [...previous]
  const attempts = []
  const spawnSync = (_cmd, args, options) => {
    if (!args[0].endsWith(`/${suite}.mjs`)) return { status: args[0].endsWith('/crossbrowser.mjs') ? 0 : 1, stdout: '', stderr: '' }
    const i = attempts.length
    attempts.push(options)
    const out = outputs[Math.min(i, outputs.length - 1)]
    const status = out.includes('FAIL') || out.includes('ERR:') ? 1 : 0
    const stamp = Date.now()
    if (records[i] !== null) saved.push({
      suite, backend, startedAt: stamp, at: stamp, exit: status,
      asserted: true, terminalVerdict: true, crashed: false,
      reds: chargeReds(classify.failedChecks(out), { suite, backend }),
      ...records[i],
    })
    return { status, stdout: out, stderr: '', error: spawnError }
  }
  const context = {
    ...core, ...classify, ...tiers, ...load, ...sections, ...ownership,
    spawnSync, dirname, join, fileURLToPath,
    readRenderState: () => ({ runs: saved }), readTasksAll: () => tasks,
    launchServer: async () => ({ base: 'http://test', child: null }), killTree: () => {},
    needsGpuBackendProbe: () => false,
    classifyRedSuites: (reds) => {
      classifiedCalls.push(reds)
      return { rows: reds.flatMap((red) => ownership.redOwnership({
        suite: red.suite, backend, failed: red.failed,
        report: ownership.baselineReport({ suite: red.suite, backend, baseline: 'a'.repeat(40), head: 'b'.repeat(40),
          classified: red.failed.map((c) => ({ check: c.name, key: c.key, verdict })), logs: [] }),
        filed: red.failed.map((c) => ownership.redRequestTitle(red.suite, c.name)),
      })), unresolved: reds.filter((r) => r.unresolved).map((r) => `${r.suite}: incomplete run`) }
    },
    console: { log: (...args) => printed.push(args.join(' ')) },
    process: {
      execPath: 'node', argv: ['node', 'run-all.mjs', ...(large ? ['large'] : []), suite],
      env: { RVA_SKIP_PREFLIGHT: large ? '1' : '0', VERIFY_GL: backend, VERIFY_NO_RETRY: noRetry ? '1' : '0', VERIFY_ON_LOAD: 'off', RVA_LADDER_ASKED: '1' },
      exit: (code) => { exitCode = code; throw exit },
    },
  }
  try { await runInNewContext(`(async () => {${source}\n})()`, context) }
  catch (error) { if (error !== exit) throw error }
  return { attempts, saved, classifiedCalls, log: printed.join('\n'), status: exitCode }
}

describe('run-all owned-red retry', () => {
  it('runs an owned failure once, names its owner, and keeps the run red and accounted for', async () => {
    const result = await run()
    expect(result.attempts).toHaveLength(1)
    expect(result.log).toContain('ACCOUNTED FOR  settings — retry skipped; all reds charged to open points 603')
    expect(result.log).toContain('1 SUITE(S) FAILED — 1 suites run — reds charged to open points 603')
    expect(result.status).toBe(1)
    expect(result.saved[0].exit).toBe(1)
    expect(runVerdict(result.saved[0], { openPoints: [603] }).status).toBe('accounted')
  })

  it('names every owner once in numeric order when several defects share a suite', async () => {
    const out = [
      'FAIL  the drums were still speaking when the picture was taken — stopped',
      'FAIL  and a clear line to him exists for the shutter — all 16 bearings blocked',
      'FAIL  frame 1085-village-adult-fills-a-jar — subject is not in the rendered picture',
    ].join('\n')
    const result = await run({ suite: 'polish', outputs: [out], tasks: '- [ ] 1102. drums\n- [ ] 1087. fill staging' })
    expect(result.attempts).toHaveLength(1)
    expect(result.log).toContain('all reds charged to open points 1087, 1102; suite stays red')
    expect(result.log).toContain('1 SUITE(S) FAILED — 1 suites run — reds charged to open points 1087, 1102')
  })

  it('does not describe a partial record as accounted-for coverage', async () => {
    const result = await run({ records: [{ partial: true, section: 'ground-detail' }] })
    expect(result.attempts).toHaveLength(1)
    expect(result.log).toContain('PARTIAL  settings — retry skipped')
    expect(result.log).not.toContain('ACCOUNTED FOR')
    expect(runVerdict(result.saved[0], { openPoints: [603] }).covers).toBe(false)
  })

  it('retries a mixed red set and carries the original failures into a successful retry', async () => {
    const result = await run({ outputs: [`${known}\n${unknown}`, 'PASS  repaired for this attempt'] })
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[1].env[RETRY_ENV]).toContain('a new defect')
    expect(result.attempts[1].env[RETRY_ENV]).toContain(ground)
    expect(result.log).toContain('PASSED ON RETRY')
    expect(result.log).not.toContain('retry skipped')
    expect(result.log).toContain('reds charged to open points 603')
    expect(result.status).toBe(0) // Existing retry exit semantics; recorder marks SUSPECT.
  })

  it('keeps the double-failure report for an unowned red', async () => {
    const result = await run({ outputs: [unknown] })
    expect(result.attempts).toHaveLength(2)
    expect(result.log).toContain('retry settings once')
    expect(result.status).toBe(1)
  })

  it.each(['- [x] 603. ground repaired', '- [ ] 603. DEFERRED ground repair', ''])('retries when the owner is not open: %s', async (tasks) => {
    const result = await run({ tasks })
    expect(result.attempts).toHaveLength(2)
    expect(result.log).not.toContain('retry skipped')
  })

  it('keeps strict mode and clean runs at one attempt', async () => {
    expect((await run({ outputs: [unknown], noRetry: true })).attempts).toHaveLength(1)
    const clean = await run({ outputs: ['PASS  all checks'] })
    expect(clean.attempts).toHaveLength(1)
    expect(clean.status).toBe(0)
    expect(clean.log).not.toContain('charged to open points')
  })

  it.each([
    null,
    { reds: [] },
    { crashed: true, crashSource: 'uncaught-exception' },
    { truncated: true },
    { asserted: false },
    { terminalVerdict: false },
    { startedAt: 0 },
    { backend: 'webgpu' },
    { exit: 2 },
    { reds: [{ name: ground, kind: 'check', point: 603 }, { name: 'console error: new error', kind: 'console' }] },
  ])('retries missing, incomplete, crashed or unowned evidence: %j', async (record) => {
    expect((await run({ records: [record] })).attempts).toHaveLength(2)
  })

  it('does not use a stale record or a spawn failure to skip a retry', async () => {
    const previous = [{ suite: 'settings', backend: 'webgl', startedAt: 0, at: 1, exit: 1, reds: [{ name: ground, point: 603 }] }]
    expect((await run({ previous, records: [null] })).attempts).toHaveLength(2)
    expect((await run({ spawnError: { code: 'ENOBUFS' } })).attempts).toHaveLength(2)
  })

  it.each(['compatibility', 'core', null])('respects the WebGPU feature level: %s', async (featureLevel) => {
    const name = 'the streamed dressing does not grow over a session at a fixed anchor (point 278)'
    const result = await run({
      suite: 'enrichments', backend: 'webgpu', outputs: [`FAIL  ${name} — no growth`],
      records: [{ featureLevel, reds: [{ name, kind: 'check' }] }], tasks: '- [ ] 938. dressing repair',
    })
    expect(result.attempts).toHaveLength(featureLevel === 'compatibility' ? 1 : 2)
    if (featureLevel === 'compatibility') expect(result.log).toContain('open points 938')
  })
})


describe('LARGE automatically resolves red ownership in its own report', () => {
  it('classifies and files a pre-existing red, releases that red, and keeps regression exit 1', async () => {
    const result = await run({ large: true })
    expect(result.classifiedCalls).toHaveLength(1)
    expect(result.log).toContain('POINT REDS DO NOT HOLD — charged elsewhere: "Repair pre-existing settings check:')
    expect(result.status).toBe(1)
  })

  it.each(['real-regression', 'baseline-flaky', 'baseline-died', 'inconclusive'])('keeps %s holding', async (verdict) => {
    const result = await run({ large: true, verdict })
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.log).toContain(`(${verdict})`)
    expect(result.status).toBe(1)
  })

  it('retains the rotating failures next to a stable red for baseline classification', async () => {
    const result = await run({ large: true, tasks: '', outputs: [`${known}\n${unknown}`, known] })
    expect(result.classifiedCalls[0][0].failed.map((c) => c.name)).toEqual([ground, 'a new defect'])
  })

  it('holds a crashed record even if its named check predates the branch', async () => {
    const result = await run({ large: true, noRetry: true, records: [{ crashed: true, crashSource: 'uncaught-exception' }] })
    expect(result.log).toContain('POINT REDS HOLD')
    expect(result.log).toContain('incomplete run')
  })

  it('does no baseline work for green runs or unrequested narrow reds', async () => {
    expect((await run({ large: true, outputs: ['PASS  all checks'] })).classifiedCalls).toHaveLength(0)
    expect((await run()).classifiedCalls).toHaveLength(0)
  })

  it('includes crossbrowser in ownership classification', async () => {
    const result = await run({ large: true, suite: 'crossbrowser', outputs: [
      'FAIL  chromium-mobile no console errors on mobile — getSupportedExtensions on null\n1 CROSS-BROWSER/MOBILE CHECK(S) FAILED',
    ] })
    expect(result.classifiedCalls[0][0]).toMatchObject({ suite: 'crossbrowser', depth: 'standard', unresolved: false })
    expect(result.log).toContain('POINT REDS DO NOT HOLD')
    expect(result.status).toBe(1)
  })
})
