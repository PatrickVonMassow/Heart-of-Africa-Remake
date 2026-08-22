import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ERROR_OUTPUT_BUDGET, ORDINARY_OUTPUT_BUDGET } from './tool-output-budget-core.mjs'
import { CAPTURE_LOG_MAX_AGE_MS, pruneCaptureLogs } from './tool-output-log-retention.mjs'
import { shellInvocation } from './tool-output-shell.mjs'

const RUNNER = join(dirname(fileURLToPath(import.meta.url)), 'tool-output-budget.mjs')

function run(command, cwd) {
  return spawnSync(process.execPath, [RUNNER, '--encoded-command', Buffer.from(command).toString('base64url')], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000,
  })
}

function logFrom(stdout) {
  const match = String(stdout).match(/(?:→|--show) (local\/tool-output-logs\/[^\s\]]+\.log)/)
  return match?.[1] ?? null
}

describe('tool-output-budget runner', () => {
  it('spills a large successful command to a log and prints only its middle-cut budget', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'hoa-tool-budget-'))
    try {
      const command = `${JSON.stringify(process.execPath)} -e "process.stdout.write('HEAD\\n'+'x'.repeat(30000)+'\\nTAIL')"`
      const result = run(command, cwd)
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout.length).toBeLessThanOrEqual(ORDINARY_OUTPUT_BUDGET)
      expect(result.stdout).toContain('HEAD')
      expect(result.stdout).toContain('TAIL')
      expect(result.stdout).toContain('OMITTED')

      const rel = logFrom(result.stdout)
      expect(rel).toBeTruthy()
      const full = readFileSync(join(dirname(RUNNER), '..', rel), 'utf8')
      expect(full).toHaveLength(30_010)
      expect(full.startsWith('HEAD\n')).toBe(true)
      expect(full.endsWith('\nTAIL')).toBe(true)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('returns the child status while bounding stderr through the generous error channel', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'hoa-tool-budget-'))
    try {
      const command = `${JSON.stringify(process.execPath)} -e "process.stderr.write('ASSERT\\n'+'bad\\n'.repeat(40000)+'SUMMARY');process.exit(7)"`
      const result = run(command, cwd)
      expect(result.status).toBe(7)
      expect(result.stderr).toBe('')
      expect(result.stdout.length).toBeLessThanOrEqual(ERROR_OUTPUT_BUDGET)
      expect(result.stdout).toContain('ASSERT')
      expect(result.stdout).toContain('SUMMARY')
      expect(result.stdout).toContain('OMITTED')
      expect(result.stdout).toContain('--show local/tool-output-logs/')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('bounds its own malformed-invocation error instead of printing an exception stack', () => {
    const result = spawnSync(process.execPath, [RUNNER], { encoding: 'utf8', windowsHide: true })
    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('missing --encoded-command')
    expect(result.stdout).not.toContain('at run')
    expect(result.stdout.length).toBeLessThanOrEqual(ERROR_OUTPUT_BUDGET)
  })
})

describe('tool output shell invocation', () => {
  it('uses the configured POSIX shell without login-profile flags', () => {
    expect(shellInvocation('git diff', { platform: 'linux', shell: '/bin/zsh' })).toEqual({
      file: '/bin/zsh',
      args: ['-c', 'git diff'],
    })
  })

  it('keeps PowerShell non-interactive and profile-free on Windows', () => {
    expect(shellInvocation('git diff', { platform: 'win32', shell: 'ignored' })).toEqual({
      file: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', 'git diff'],
    })
  })
})

describe('tool output capture retention', () => {
  it('removes only runner-owned logs older than the retention window', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hoa-tool-retention-'))
    const stale = '2026-01-01T00-00-00-000-101.log'
    const recent = '2026-08-22T00-00-00-000-102.log'
    const unrelated = 'keep-me.log'
    try {
      for (const name of [stale, recent, unrelated]) writeFileSync(join(dir, name), name)
      const now = Date.now()
      const old = new Date(now - CAPTURE_LOG_MAX_AGE_MS - 1_000)
      utimesSync(join(dir, stale), old, old)

      expect(pruneCaptureLogs(dir, { now })).toEqual([stale])
      expect(existsSync(join(dir, stale))).toBe(false)
      expect(existsSync(join(dir, recent))).toBe(true)
      expect(existsSync(join(dir, unrelated))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
