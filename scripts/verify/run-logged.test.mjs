// The one thing about the logging wrapper that a pure test cannot cover: that
// its READING mode never becomes a RUNNING mode. Written the first way, the
// `--show` branch printed its window and then fell through into the spawn — so
// asking a question about a finished log started a full LARGE regression behind
// the answer. These cases cost ~200 ms each and pin the exit paths.
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const WRAPPER = join(dirname(fileURLToPath(import.meta.url)), 'run-logged.mjs')

function runShow(args, logDir) {
  return spawnSync(process.execPath, [WRAPPER, ...args], {
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
