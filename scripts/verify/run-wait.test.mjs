// The awaiting CLI (point 592). The exit paths are what matters here — a mode
// that silently fell through into another would be the same class of bug the
// `--show` cases of run-logged.test.mjs were written for.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const CLI = join(HERE, 'run-wait.mjs')

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], { windowsHide: true, encoding: 'utf8', timeout: 30_000 })
}

/** A log path plus its record, in a throwaway directory. */
function fixture(record) {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-runwait-'))
  const log = join(dir, 'run.log')
  writeFileSync(log, 'PASS  docs  10 pass\n')
  writeFileSync(`${log}.run.json`, JSON.stringify(record))
  return { dir, log }
}

const finished = {
  command: 'verify small',
  tier: 'small',
  suites: ['docs', 'i18n'],
  startedAt: 1_000,
  finishedAt: 2_000,
  status: 'finished',
  exitCode: 0,
  polls: 0,
  receipt: {
    command: 'verify small',
    suites: ['docs', 'i18n'],
    backends: ['WebGPU'],
    head: 'abc1234',
    branch: 'main',
    logPath: 'local/verify-logs/run.log',
    exitCode: 0,
    durationMs: 1000,
    polls: 0,
    failing: [],
    frames: { status: 'ok', expected: 19, written: 19, message: 'frames: 19/19' },
  },
}

describe('--plan: the decision that belongs BEFORE the run', () => {
  it('sends a LARGE run to the background and names the notification', () => {
    const res = run(['--plan', 'large'])
    expect(res.status).toBe(0)
    expect(res.stdout).toMatch(/BACKGROUND/)
    expect(res.stdout).toMatch(/notification/)
    expect(res.stdout).toMatch(/93 expected/)
  })

  it('lets a single measured suite be one blocking foreground call', () => {
    const res = run(['--plan', 'world'])
    expect(res.stdout).toMatch(/FOREGROUND as ONE blocking call/)
  })
})

describe('--await: one blocking call, and no poll counted', () => {
  it('returns the receipt at once when the run is already over', () => {
    const { log } = fixture(finished)
    const res = run(['--await', log])
    expect(res.status).toBe(0)
    expect(res.stdout).toMatch(/already over/)
    expect(res.stdout).toMatch(/verify receipt/)
    expect(res.stdout).toMatch(/frames: 19\/19/)
    expect(res.stdout).toMatch(/polls: {3}0 \(awaited, not polled\)/)
  })

  it('hands back the run’s own exit code, so a red run is red here too', () => {
    const { log } = fixture({ ...finished, exitCode: 1, receipt: { ...finished.receipt, exitCode: 1 } })
    expect(run(['--await', log]).status).toBe(1)
  })

  it('gives up with instructions rather than looping when its budget is spent', () => {
    const { log } = fixture({ ...finished, status: 'running', pid: process.pid, startedAt: Date.now() })
    const res = run(['--await', log, '--timeout', '1'])
    expect(res.status).toBe(3)
    expect(res.stdout).toMatch(/STILL RUNNING/)
    expect(res.stdout).toMatch(/Do NOT start a poll loop/)
  })
})

describe('--status: the ONE counted poll', () => {
  it('counts, and says how many are left', () => {
    const { log } = fixture({ ...finished, status: 'running', pid: process.pid, startedAt: Date.now(), expectedRuntimeMs: 60_000 })
    const first = run(['--status', log])
    expect(first.status).toBe(0)
    expect(first.stdout).toMatch(/POLLS {4}1 of 5/)
    const second = run(['--status', log])
    expect(second.stdout).toMatch(/POLLS {4}2 of 5/)
  })

  it('refuses a sixth look and names the two ways out', () => {
    const { log } = fixture({ ...finished, status: 'running', pid: process.pid, startedAt: Date.now(), polls: 3, expectedRuntimeMs: 600_000 })
    expect(run(['--status', log]).stdout).toMatch(/LAST one/)
    const spent = run(['--status', log])
    expect(spent.stdout).toMatch(/POLL BUDGET SPENT \(5\/5\)/)
    expect(spent.stdout).toMatch(/--await/)
  })

  it('calls a run hung past the measured factor, with a non-zero exit', () => {
    const { log } = fixture({
      ...finished,
      status: 'running',
      pid: process.pid,
      startedAt: Date.now() - 600_000,
      expectedRuntimeMs: 60_000,
    })
    const res = run(['--status', log])
    expect(res.status).toBe(4)
    expect(res.stdout).toMatch(/HUNG/)
  })

  it('does NOT count a poll against a run that is already finished', () => {
    const { log } = fixture(finished)
    const res = run(['--status', log])
    expect(res.stdout).toMatch(/not counted as a poll/)
    expect(res.stdout).toMatch(/polls: {3}0/)
  })
})

describe('--receipt and the failure modes', () => {
  it('reprints a finished receipt for free', () => {
    const { log } = fixture(finished)
    const res = run(['--receipt', log])
    expect(res.stdout).toMatch(/verify receipt/)
    expect(res.stdout).not.toMatch(/counted as a poll/)
  })

  it('says a receipt is INCOMPLETE while the run is still going', () => {
    const { log } = fixture({ ...finished, status: 'running', pid: process.pid })
    expect(run(['--receipt', log]).stdout).toMatch(/NOT over/)
  })

  it('explains itself when there is no record at all, and never pretends', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-runwait-'))
    const res = run(['--await', join(dir, 'nothing.log')])
    expect(res.status).toBe(2)
    expect(res.stdout).toMatch(/no verify run record/)
  })

  it('prints usage for an unknown mode instead of doing something', () => {
    const res = run(['--nonsense'])
    expect(res.status).toBe(2)
    expect(res.stdout).toMatch(/usage:/)
  })
})
