import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyPause, pauseRecovery } from './batch-pause-core.mjs'
import { holdsBatchLock, parsePauseCommand, recordPause, recordUserStop } from './batch-pause.mjs'

const NOW = Date.parse('2026-08-23T12:00:00.000Z')
const LOCK = { sessionId: 'owner', kind: 'session', pid: 4242, pidStartedAt: 1_000_000 }
const HOLDER = { lock: LOCK, ancestor: { pid: 4242, startedAt: 1_000_300 } }
const STOOD_DOWN = { lock: LOCK, ancestor: { pid: 5151, startedAt: 2_000_000 } }
const INCIDENT = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'batch-paused-2026-09-23-chat-reply.json'), 'utf8'),
)
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
    const result = recordPause(parsePauseCommand(['--user-stop', 'the user said "stop the batch until I return"']), {
      ...target,
      owner: HOLDER,
      now: NOW,
    })
    const text = readFileSync(target.path, 'utf8')

    expect(result).toMatchObject({ cause: 'user-stop', clockless: true, retryAfter: null })
    expect(text).toContain('type: user-stop')
    expect(text).toContain('cause: user-stop')
    expect(text).toContain('retry-after: never')
    expect(classifyPause({ text, now: NOW })).toMatchObject({ state: 'hold', cause: 'user-stop' })
  })

  it('refuses a user stop from a session without the batch lock and writes nothing', () => {
    const target = paths()
    const result = recordUserStop('the user said "stop now"', { ...target, owner: STOOD_DOWN, now: NOW })
    expect(result).toMatchObject({ refused: true, why: expect.stringMatching(/^not-lock-holder/) })
    expect(existsSync(target.path)).toBe(false)
  })

  it('refuses the measured chat-reply stop, which quoted no user, even from the holder', () => {
    const reason = INCIDENT.text.split('\n')[0]
    const stoodDown = paths()
    expect(recordUserStop(reason, { ...stoodDown, owner: STOOD_DOWN, now: NOW }).refused).toBe(true)
    expect(existsSync(stoodDown.path)).toBe(false)
    const holder = paths()
    expect(recordUserStop(reason, { ...holder, owner: HOLDER, now: NOW })).toMatchObject({
      refused: true,
      why: expect.stringMatching(/^no-user-utterance/),
    })
    expect(existsSync(holder.path)).toBe(false)
  })

  it('knows the holder by process ancestry, never by a pending spawn or a reused pid', () => {
    expect(holdsBatchLock(HOLDER)).toBe(true)
    expect(holdsBatchLock(STOOD_DOWN)).toBe(false)
    expect(holdsBatchLock({ lock: null, ancestor: HOLDER.ancestor })).toBe(false)
    expect(holdsBatchLock({ lock: { ...LOCK, kind: 'pending-spawn' }, ancestor: HOLDER.ancestor })).toBe(false)
    expect(holdsBatchLock({ lock: LOCK, ancestor: { pid: 4242, startedAt: 9_000_000 } })).toBe(false)
  })

  it('turns the measured misfiled marker into a clock that expires this tick', () => {
    const verdict = classifyPause({ text: INCIDENT.text, now: NOW })
    expect(verdict).toMatchObject({ state: 'recover', misfiledUserStop: true })
    const recovery = pauseRecovery({ text: INCIDENT.text, now: NOW, delayMs: 0 })
    expect(recovery.body).toContain(JSON.stringify(INCIDENT.text))
    expect(classifyPause({ text: recovery.record, now: NOW })).toMatchObject({ state: 'retry', retryAfter: NOW })
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
    expect(parsePauseCommand(argv)).toMatchObject({ ok: false, help: expect.stringContaining('--user-stop') })
  })

  it('points every stop instruction at the typed writer and distinguishes the clocked case', () => {
    const guard = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'batch-progress-guard.mjs'), 'utf8')
    expect(guard).toContain('batch-pause.mjs --user-stop')
    expect(guard).toContain('batch-pause.mjs --awaiting-user')
    expect(guard).toMatch(/--awaiting-user[\s\S]*restart clock/)
    expect(guard).not.toContain('then create .claude/batch-paused and stop')
  })
})
