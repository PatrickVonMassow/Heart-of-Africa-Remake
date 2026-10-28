// The shared usage texts (scripts/cli-usage.mjs): every command that used to
// answer `--help` with something else now prints its usage, and an unknown or
// missing argument keeps today's exit code while carrying the syntax.
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { USAGE, usageSynopsis, wantsHelp } from './cli-usage.mjs'
import { TIERS_USAGE } from './verify/tiers.mjs'
import { repoPath } from './repo-paths.mjs'

const run = (script, args) =>
  spawnSync(process.execPath, [repoPath('scripts', script), ...args], { encoding: 'utf8', timeout: 60_000, windowsHide: true })

describe('--help prints the usage', () => {
  it.each([
    ['finding.mjs', 'finding', 0],
    ['queue-rank.mjs', 'queue-rank', 0],
    ['tasks-source.mjs', 'tasks-source', 0],
    ['verify/tiers.mjs', 'tiers', 0],
    ['worktree-cleanup.mjs', 'worktree-cleanup', 2],
  ])('%s', (script, key, code) => {
    const r = run(script, ['--help'])
    expect(r.stdout).toContain(USAGE[key])
    expect(r.status).toBe(code)
  })

  it('the findings command prints the usage alone — never the carrier listing', () => {
    const r = run('finding.mjs', ['--help'])
    expect(r.stdout.trim()).toBe(USAGE.finding)
  })
})

describe('an unknown or missing argument keeps its exit code and carries the usage', () => {
  it('the findings command: unknown flag still lists the state and prints the usage, exit 0', () => {
    const r = run('finding.mjs', ['--bogus'])
    expect(r.stdout).toContain(USAGE.finding)
    expect(r.status).toBe(0)
  })

  it('queue-rank: unknown flag names the option, prints the usage and keeps the status exit code', () => {
    const plain = run('queue-rank.mjs', [])
    const bogus = run('queue-rank.mjs', ['--bogus'])
    expect(bogus.stdout).toContain('unknown option --bogus')
    expect(bogus.stdout).toContain(USAGE['queue-rank'])
    expect(bogus.status).toBe(plain.status)
    expect(plain.stdout).not.toContain(USAGE['queue-rank'])
  })

  it('worktree-cleanup: no path is refused with exit 2 and the usage on stdout', () => {
    const r = run('worktree-cleanup.mjs', ['--bogus'])
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('no path was given')
    expect(r.stdout).toContain(USAGE['worktree-cleanup'])
  })

  it('worktree-cleanup: --help beside a real path removes nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wt-help-'))
    try {
      const r = run('worktree-cleanup.mjs', [dir, '--help'])
      expect(r.status).toBe(2)
      expect(existsSync(dir)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('tasks-source and tiers print their usage for any argument, exit 0', () => {
    expect(run('tasks-source.mjs', ['--bogus']).stdout).toContain(USAGE['tasks-source'])
    expect(run('verify/tiers.mjs', []).stdout.trim()).toBe(TIERS_USAGE)
  })
})

describe('usageSynopsis', () => {
  it('is the first line of every usage, prefix cut, under one header', () => {
    const lines = usageSynopsis()
    expect(lines).toHaveLength(Object.keys(USAGE).length + 1)
    for (const text of Object.values(USAGE)) {
      expect(lines).toContain(`  ${text.split('\n')[0].slice('usage: '.length)}`)
    }
  })

  it('throws on an entry that is not a usage text', () => {
    expect(() => usageSynopsis({ broken: 'no prefix here' })).toThrow(/broken/)
  })

  it('wantsHelp reads --help and -h only', () => {
    expect(wantsHelp(['--help'])).toBe(true)
    expect(wantsHelp(['-h'])).toBe(true)
    expect(wantsHelp(['--status'])).toBe(false)
  })
})
