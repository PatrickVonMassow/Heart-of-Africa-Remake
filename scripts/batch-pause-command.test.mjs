import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyPause } from './batch-pause-core.mjs'
import { parsePauseCommand, recordPause } from './batch-pause.mjs'

const NOW = Date.parse('2026-08-23T12:00:00.000Z')
const dirs = []

function paths() {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-pause-command-'))
  dirs.push(dir)
  return { path: join(dir, 'batch-paused'), statePath: join(dir, 'autostart-state.json') }
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true })
})

describe('batch-pause command', () => {
  it('writes a proved user stop through the real pause API', () => {
    const target = paths()
    const result = recordPause(parsePauseCommand(['--user-stop', 'stop the batch until I return']), {
      ...target,
      now: NOW,
    })
    const text = readFileSync(target.path, 'utf8')

    expect(result).toMatchObject({ cause: 'user-stop', clockless: true, retryAfter: null })
    expect(text).toContain('type: user-stop')
    expect(text).toContain('cause: user-stop')
    expect(text).toContain('retry-after: never')
    expect(classifyPause({ text, now: NOW })).toMatchObject({ state: 'hold', cause: 'user-stop' })
  })

  it('keeps an all-items-awaiting-user park on the automatic retry clock', () => {
    const target = paths()
    recordPause(parsePauseCommand(['--awaiting-user', 'choose the launch region']), { ...target, now: NOW })
    const verdict = classifyPause({ text: readFileSync(target.path, 'utf8'), now: NOW })

    expect(verdict).toMatchObject({ state: 'wait', type: 'automatic', cause: 'awaiting-user' })
    expect(verdict.retryAfter).toBeGreaterThan(NOW)
  })

  it.each([
    [],
    ['--user-stop'],
    ['--user-stop', '   '],
    ['--automatic', 'reason'],
    ['--user-stop', 'reason', 'discarded'],
  ])('refuses an incomplete or ambiguous invocation: %j', (argv) => {
    expect(parsePauseCommand(argv)).toMatchObject({ ok: false, usage: expect.stringContaining('--user-stop') })
  })

  it('points every stop instruction at the typed writer and distinguishes the clocked case', () => {
    const guard = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'batch-progress-guard.mjs'), 'utf8')
    expect(guard).toContain('batch-pause.mjs --user-stop')
    expect(guard).toContain('batch-pause.mjs --awaiting-user')
    expect(guard).toMatch(/--awaiting-user[\s\S]*restart clock/)
    expect(guard).not.toContain('then create .claude/batch-paused and stop')
  })
})
