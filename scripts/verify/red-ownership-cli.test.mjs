import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkFromName } from './baseline-classify-core.mjs'
import { baselineReport, formatOwnershipVerdict } from './red-ownership-core.mjs'
import { classifyRedSuites } from './red-ownership.mjs'
import { requestEntries } from '../findings-request-core.mjs'

let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hoa-red-filing-test-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

// Only the expensive baseline process is substituted. Requests use the real
// finding CLI and a private carrier; no browser or repository mutation runs.
function run({ suite = 'settings', verdict = 'pre-existing', missing = false, failedDeposit = false,
  failedProcess = false, malformed = false, unresolved = false } = {}) {
  const check = checkFromName('the ground edge is dark')
  const calls = []
  const log = []
  const result = classifyRedSuites([{ suite, failed: [check], checks: 12, unresolved, depth: 'thorough' }], {
    backend: 'webgl', env: { ...process.env, FINDINGS_MEMORY_DIR: dir }, log: (line) => log.push(line),
    spawn: (command, args, options) => {
      calls.push({ args, options })
      if (args[0].endsWith('/baseline-classify.mjs')) {
        if (!missing) writeFileSync(args[args.indexOf('--report-file') + 1], malformed ? '{' : JSON.stringify(baselineReport({
          suite, backend: 'webgl', head: 'b'.repeat(40), baseline: 'a'.repeat(40), logs: ['/kept/baseline.log'],
          classified: [{ check: check.name, key: check.key, verdict }],
        })))
        return { status: failedProcess ? 1 : 0 }
      }
      return failedDeposit ? { status: 1 } : spawnSync(command, args, { ...options, stdio: 'pipe', encoding: 'utf8' })
    },
  })
  return { ...result, calls, log: log.join('\n') }
}

describe('the report deposits evidence through the real finding carrier', () => {
  it('files once across runs and carries baseline identity, check, logs and final state', () => {
    const first = run()
    expect(first.rows[0].elsewhere).toBe(true)
    expect(run().rows[0].elsewhere).toBe(true)
    const entries = requestEntries(readFileSync(join(dir, 'findings-carrier.md'), 'utf8'))
    expect(entries).toHaveLength(1)
    expect(entries[0].fields.why).toContain('merge-base ' + 'a'.repeat(40))
    expect(entries[0].fields.why).toContain('/kept/baseline.log')
    expect(entries[0].fields.spec).toContain('full settings suite passes')
    expect(first.calls[0].args).toContain('--current-checks')
    expect(first.calls[1].args).toContain('--once')
  })

  it.each(['real-regression', 'baseline-flaky', 'baseline-died', 'inconclusive'])('never files %s', (verdict) => {
    const result = run({ verdict })
    expect(result.calls).toHaveLength(1)
    expect(result.rows[0].elsewhere).toBe(false)
  })

  it.each([{ missing: true }, { failedProcess: true }, { malformed: true }, { failedDeposit: true }])('holds failed evidence or filing: %j', (options) => {
    const result = run(options)
    expect(result.rows[0].elsewhere).toBe(false)
    expect(formatOwnershipVerdict(result)).toContain('POINT REDS HOLD')
  })

  it('preserves crossbrowser depth and baseline lane', () => {
    const result = run({ suite: 'crossbrowser' })
    expect(result.calls[0].options.env).toMatchObject({ VERIFY_GL: 'webgl', CROSSBROWSER_DEPTH: 'thorough' })
    expect(result.rows[0].elsewhere).toBe(true)
  })

  it('holds unsupported lanes and incomplete current runs', () => {
    expect(run({ suite: 'preview' }).calls).toHaveLength(0)
    const incomplete = run({ unresolved: true })
    expect(formatOwnershipVerdict(incomplete)).toContain('POINT REDS HOLD')
    expect(incomplete.unresolved).toEqual(['settings: incomplete run or unnamed failure'])
  })
})
