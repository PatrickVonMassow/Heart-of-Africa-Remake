// The things about the logging wrapper that a pure test cannot cover: that
// its READING mode never becomes a RUNNING mode, and that a DEFAULT launch
// re-execs itself so the record writer's argv names its log. Written the
// first way, the `--show` branch printed its window and then fell through
// into the spawn — so asking a question about a finished log started a full
// LARGE regression behind the answer. These cases pin the exit paths.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { commandNamesRun } from '../batch-in-flight.mjs'
import { ORDINARY_OUTPUT_BUDGET } from '../tool-output-budget-core.mjs'
import { MAX_SELECTED_LINES, parseRunLoggedArgs } from './run-logged-args.mjs'

const WRAPPER = join(dirname(fileURLToPath(import.meta.url)), 'run-logged.mjs')

function runShow(args, logDir) {
  return spawnSync(process.execPath, [WRAPPER, ...args], {
    windowsHide: true,
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, VERIFY_LOG_DIR: logDir },
  })
}

describe('run-logged argument budgets', () => {
  it('clamps both selective reads and verify digest lines before output is assembled', () => {
    const parsed = parseRunLoggedArgs([
      '--tail',
      '999999',
      '--max',
      '999999',
      '--keep',
      '999999',
      'world',
    ])
    expect(parsed.own).toMatchObject({
      tail: MAX_SELECTED_LINES,
      max: MAX_SELECTED_LINES,
      keep: MAX_SELECTED_LINES,
    })
    expect(parsed.forward).toEqual(['world'])
  })
})

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

  it('keeps an oversized line and caller-raised max inside the absolute output budget', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-runlogged-'))
    const logFile = join(dir, 'huge.log')
    writeFileSync(logFile, `HEAD ${'x'.repeat(40_000)} TAIL`)
    const res = runShow(['--show', logFile, '--tail', '999999', '--max', '999999'], dir)
    expect(res.status).toBe(0)
    expect(res.stdout.length).toBeLessThanOrEqual(ORDINARY_OUTPUT_BUDGET)
    expect(res.stdout).toContain('HEAD')
    expect(res.stdout).toContain('TAIL')
    expect(res.stdout).toContain('OMITTED')
    expect(res.stdout).toContain('--tail 120')
    expect(readdirSync(dir)).toEqual(['huge.log'])
  })

  it('bounds an invalid selective query error instead of leaking an exception stack on stderr', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-runlogged-'))
    const logFile = join(dir, 'sample.log')
    writeFileSync(logFile, 'one\ntwo\n')
    const res = runShow(['--show', logFile, '--grep', '['], dir)
    expect(res.status).toBe(1)
    expect(res.stderr).toBe('')
    expect(res.stdout).toContain('could not select a log window')
    expect(res.stdout.length).toBeLessThanOrEqual(ORDINARY_OUTPUT_BUDGET)
    expect(readdirSync(dir)).toEqual(['sample.log'])
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
        env: { ...process.env, VERIFY_LOG_DIR: relDir, HOA_ACTIVITY_JOURNAL_PATH: join(dir, 'activity.jsonl') },
      })
      expect(res.status, res.stderr).toBe(1) // the shim forwards the child's exit code
      expect(res.stdout).toContain('── tool error digest ── run-logged verify digest')
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

  it(
    'reproduces a signal-killed child instead of flattening it to exit 1 (Sol round 5)',
    async () => {
      if (process.platform === 'win32') return // POSIX signal semantics
      const ROOT = join(dirname(WRAPPER), '..', '..')
      const relDir = join('local', `runlogged-signal-${process.pid}`)
      const dir = join(ROOT, relDir)
      try {
        const shim = spawn(process.execPath, [WRAPPER, 'world', '--section=__no_such_section__'], {
          windowsHide: true,
          stdio: 'ignore',
          env: { ...process.env, VERIFY_LOG_DIR: relDir, HOA_ACTIVITY_JOURNAL_PATH: join(dir, 'activity.jsonl') },
        })
        const closed = new Promise((resolvePromise) =>
          shim.on('close', (code, signal) => resolvePromise({ code, signal })),
        )
        // Poll on the CONDITION, not a wall clock: the record is written by
        // the re-exec'd child BEFORE it spawns the runner, so the pid inside
        // it is alive the moment the file exists.
        const deadline = Date.now() + 30_000
        let childPid = null
        while (childPid === null && Date.now() < deadline) {
          try {
            const name = readdirSync(dir).find((n) => n.endsWith('.run.json'))
            if (name) childPid = JSON.parse(readFileSync(join(dir, name), 'utf8')).pid ?? null
          } catch {
            /* not written yet */
          }
          if (childPid === null) await new Promise((r) => setTimeout(r, 10))
        }
        expect(childPid, 'the run record never appeared').toBeTruthy()
        // SIGKILL cannot be forwarded or caught — the child dies BY SIGNAL.
        process.kill(childPid, 'SIGKILL')
        const { code, signal } = await closed
        // The shim reproduces the termination: killed by the same signal,
        // never recorded as an ordinary exit-1 failed run.
        expect(signal).toBe('SIGKILL')
        expect(code).toBe(null)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    60_000,
  )
})
