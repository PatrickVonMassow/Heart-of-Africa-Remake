// The things about the logging wrapper that a pure test cannot cover: that
// its READING mode never becomes a RUNNING mode, and that a DEFAULT launch
// re-execs itself so the record writer's argv names its log. Written the
// first way, the `--show` branch printed its window and then fell through
// into the spawn — so asking a question about a finished log started a full
// LARGE regression behind the answer. These cases pin the exit paths.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { commandNamesRun } from '../batch-in-flight.mjs'

const WRAPPER = join(dirname(fileURLToPath(import.meta.url)), 'run-logged.mjs')

function runShow(args, logDir) {
  return spawnSync(process.execPath, [WRAPPER, ...args], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, VERIFY_LOG_DIR: logDir },
  })
}

describe('run-logged --show', () => {
  it('reads a bounded window and starts NOTHING', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-runlogged-'))
    const logFile = join(dir, 'sample.log')
    writeFileSync(logFile, ['# heading', 'PASS  docs         7 pass', 'noise', 'ALL GREEN — 1 suites run'].join('\n'))
    const res = runShow(['--show', logFile, '--tail', '2'], dir)
    expect(res.status).toBe(0)
    expect(res.stdout).toContain('ALL GREEN — 1 suites run')
    expect(res.stdout).toContain('(2 not shown)')
    // A run would have written a NEW log into VERIFY_LOG_DIR. Only the fixture is there.
    expect(readdirSync(dir)).toEqual(['sample.log'])
  })

  it('filters with --grep before it tails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-runlogged-'))
    const logFile = join(dir, 'red.log')
    writeFileSync(logFile, ['PASS  docs  ok', 'FAIL  world  broke', 'noise', 'FAIL  flow  broke'].join('\n'))
    const res = runShow(['--show', logFile, '--grep', 'FAIL', '--tail', '1'], dir)
    expect(res.status).toBe(0)
    expect(res.stdout).toContain('FAIL  flow  broke')
    expect(res.stdout).not.toContain('FAIL  world')
    expect(readdirSync(dir)).toEqual(['red.log'])
  })

  it('reports a missing log with a non-zero exit, and still starts nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-runlogged-'))
    const res = runShow(['--show', join(dir, 'absent.log')], dir)
    expect(res.status).toBe(1)
    expect(res.stdout).toContain('no such log')
    expect(readdirSync(dir)).toEqual([])
  })
})

describe('run-logged default launch — the run-identity re-exec (point 700, Sol round 4)', () => {
  it("re-execs itself so the record writer's argv names the log path", () => {
    // VERIFY_LOG_DIR is ROOT-relative by contract (run-record.mjs logDir);
    // local/ is git-ignored, so the fixture leaves no stray file behind.
    const ROOT = join(dirname(WRAPPER), '..', '..')
    const relDir = join('local', `runlogged-reexec-${process.pid}`)
    const dir = join(ROOT, relDir)
    try {
      // An unknown --section dies inside run-all BEFORE anything is built or
      // booted (point 566) — the cheapest real run there is: the wrapper still
      // re-execs, writes its record and closes it with the child's exit code.
      const res = spawnSync(process.execPath, [WRAPPER, 'world', '--section=__no_such_section__'], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env, VERIFY_LOG_DIR: relDir },
      })
      expect(res.status, res.stderr).toBe(1) // the shim forwards the child's exit code
      const recordName = readdirSync(dir).find((n) => n.endsWith('.run.json'))
      expect(recordName, `log dir held ${readdirSync(dir).join(', ')}`).toBeTruthy()
      const record = JSON.parse(readFileSync(join(dir, recordName), 'utf8'))
      expect(record.status).toBe('finished')
      expect(record.exitCode).toBe(1)
      // The writer's own probed argv (/proc, recorded as evidence) carries the
      // log path it recorded…
      expect(String(record.cmdline)).toContain('--log-file')
      expect(String(record.cmdline)).toContain(record.log)
      // …which is exactly the identity the transfer probe demands — while the
      // identical bare invocation (a recycled pid re-running the default
      // command line) is NOT this run.
      expect(commandNamesRun(record.cmdline, { logPaths: [record.log] })).toBe(true)
      expect(commandNamesRun(`node ${WRAPPER} world --section=__no_such_section__`, { logPaths: [record.log] })).toBe(
        false,
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
