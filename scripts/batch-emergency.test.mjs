import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ACTIVITY_CLASSES } from './batch-standstill-core.mjs'
import { EMERGENCY_COOLDOWN_MS, EMERGENCY_THRESHOLD_MS } from './batch-emergency-core.mjs'
import { defaultInputs, restartOutcome, runEmergency, terminateLockedOwner, verificationProcessAlive } from './batch-emergency.mjs'

const dirs = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const fixture = () => {
  const dir = mkdtempSync(join(tmpdir(), 'hoa-emergency-'))
  dirs.push(dir)
  const now = Date.parse('2026-08-26T20:00:00Z')
  const progressAt = now - 2 * EMERGENCY_THRESHOLD_MS
  return {
    dir, repo: dir, now, progressAt,
    statePath: join(dir, 'state.json'),
    logPath: join(dir, 'strikes.jsonl'),
    inputs: {
      workablePoints: [947], paused: false, veto: null, state: {},
      report: {
        window: { start: progressAt - 1, end: now },
        batchProgress: [{ at: progressAt, kind: 'first-parent-commit' }],
        timeline: [
          { start: progressAt - 1, end: progressAt, className: ACTIVITY_CLASSES.FOREGROUND },
          { start: progressAt, end: now, className: ACTIVITY_CLASSES.IDLE_OWNER },
        ],
      },
    },
  }
}

describe('the real emergency strike orchestration', () => {
  it('records intent before soft repair and starts the real autostart command last', () => {
    const f = fixture()
    const calls = []
    const result = runEmergency({
      ...f,
      execute: (_exe, args) => { calls.push(args.at(-1)?.endsWith('.mjs') ? args.at(-1) : args.slice(-2).join(' ')); return '' },
    })
    expect(result.decision.action).toBe('soft-recover')
    expect(result.restored).toBe(true)
    expect(result.outcomes.map((x) => x.step)).toEqual(['batch-doctor.mjs --repair', 'batch-autostart.mjs'])
    const rows = readFileSync(f.logPath, 'utf8').trim().split('\n').map(JSON.parse)
    expect(rows.map((x) => x.phase)).toEqual(['intent', 'outcome'])
    expect(JSON.parse(readFileSync(f.statePath, 'utf8')).pending).toBeUndefined()
  })

  it('hard-recovers only the exact locked identity, then doctors and restarts', () => {
    const f = fixture()
    f.inputs.state = { lastStrikeAt: f.now - EMERGENCY_COOLDOWN_MS - 1, lastStrikeProgressAt: f.progressAt }
    const order = []
    const lock = { sessionId: 'wedged-owner', pid: 123, pidStartedAt: 1000, fence: 8 }
    const result = runEmergency({
      ...f,
      getLock: () => lock,
      getProcesses: () => ({}),
      revoke: (session, fence) => { order.push(`revoke:${session}:${fence}`); return { revoked: true, reason: 'revoked' } },
      terminate: (seen) => { order.push(`terminate:${seen.pid}`); return { step: 'terminate-owner', ok: true, pid: seen.pid } },
      releaseLock: (session) => { order.push(`release:${session}`); return true },
      execute: (_exe, args) => { order.push(args.join(' ')); return '' },
    })
    expect(result.decision.action).toBe('hard-recover')
    expect(order.slice(0, 3)).toEqual(['revoke:wedged-owner:8', 'terminate:123', 'release:wedged-owner'])
    expect(result.outcomes.at(-1)).toMatchObject({ step: 'batch-autostart.mjs', ok: true })
  })

  it('terminates every distinct recorded batch process and keeps doctor read-only when identity proof fails', () => {
    const f = fixture()
    f.inputs.state = { lastStrikeAt: f.now - EMERGENCY_COOLDOWN_MS - 1, lastStrikeProgressAt: f.progressAt }
    const commands = []
    const lock = { sessionId: 'owner', pid: 10, pidStartedAt: 1000, fence: 2 }
    const result = runEmergency({
      ...f,
      getLock: () => lock,
      getProcesses: () => ({ owner: { pid: 10, startedAt: 1000 }, delegate: { pid: 11, startedAt: 2000 } }),
      revoke: () => ({ revoked: true, reason: 'revoked' }),
      terminate: (target) => ({ step: 'terminate-owner', ok: target.pid === 10, pid: target.pid }),
      releaseLock: vi.fn(),
      execute: (_exe, args) => { commands.push(args); return '' },
    })
    expect(result.outcomes.filter((x) => x.step === 'terminate-owner').map((x) => x.pid)).toEqual([10, 11])
    expect(commands[0].slice(-1)).toEqual([join(f.dir, 'scripts', 'batch-doctor.mjs')])
  })

  it('dry-run, pause and veto write and execute nothing', () => {
    for (const mode of ['dry', 'pause', 'veto']) {
      const f = fixture()
      if (mode === 'pause') f.inputs.paused = true
      if (mode === 'veto') f.inputs.veto = { reason: 'operator', until: f.now + 1000 }
      const execute = vi.fn()
      const result = runEmergency({ ...f, dryRun: mode === 'dry', execute })
      expect(result.outcomes).toEqual([])
      expect(execute).not.toHaveBeenCalled()
    }
  })
})

describe('locked owner termination', () => {
  it('refuses a recycled or unprovable pid and terminates an exact incarnation', () => {
    const lock = { pid: 123, pidStartedAt: 1000 }
    expect(terminateLockedOwner(lock, { probe: () => ({ exists: true, startedAt: 4000 }) })).toMatchObject({ ok: false })
    const kill = vi.fn()
    if (process.platform !== 'win32') {
      expect(terminateLockedOwner(lock, { probe: () => ({ exists: true, startedAt: 1001 }), kill })).toMatchObject({ ok: true, pid: 123 })
      expect(kill).toHaveBeenCalledWith(123, 'SIGTERM')
    }
  })
})

describe('restart identity', () => {
  it('starts the interactive primary task from the SYSTEM timer on Windows', () => {
    const execute = vi.fn(() => '')
    expect(restartOutcome({ execute, platform: 'win32' })).toMatchObject({ step: 'start-primary-scheduled-task', ok: true })
    expect(execute.mock.calls[0][0]).toBe('powershell')
    expect(execute.mock.calls[0][1].join(' ')).toMatch(/Start-ScheduledTask.*HoA-Batch-Autostart/)
  })
})

describe('verification process identity', () => {
  it('probes the already-resolved log and accepts only an explicit live verdict', () => {
    const log = '/repo/local/verify-logs/large.log'
    const runRecord = vi.fn(() => ({ alive: true }))
    expect(verificationProcessAlive({}, '/ignored.run.json', log, { runRecord })).toBe(true)
    expect(runRecord).toHaveBeenCalledWith(log)
    expect(verificationProcessAlive({}, '', log, { runRecord: () => ({ alive: false }) })).toBe(false)
    expect(verificationProcessAlive({}, '', log, { runRecord: () => { throw new Error('unreadable') } })).toBe(false)
  })

  it('wires the resolved report path into the real default input probe', () => {
    const repo = mkdtempSync(join(tmpdir(), 'hoa-emergency-inputs-'))
    dirs.push(repo)
    writeFileSync(join(repo, 'TASKS.md'), '')
    const log = join(repo, 'local', 'verify-logs', 'large.log')
    const runRecord = vi.fn(() => ({ alive: true }))
    let alive = false
    defaultInputs({
      repo,
      now: Date.now(),
      thresholdMs: EMERGENCY_THRESHOLD_MS,
      runRecord,
      gather: ({ verificationProcessAlive: probe }) => {
        alive = probe({}, `${log}.run.json`, log)
        return {}
      },
    })
    expect(alive).toBe(true)
    expect(runRecord).toHaveBeenCalledWith(log)
  })
})
