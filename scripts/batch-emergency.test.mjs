import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ACTIVITY_CLASSES } from './batch-standstill-core.mjs'
import { EMERGENCY_COOLDOWN_MS, EMERGENCY_THRESHOLD_MS } from './batch-emergency-core.mjs'
import { runRecordFor } from './batch-in-flight.mjs'
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
  // PAST THE THRESHOLD, SHORT OF THE ABSOLUTE DEADLINE. The deadline of union
  // entry U5 sits at twice the threshold and is decided BEFORE the cooldown and
  // the lease, so a fixture stalled by exactly that much recovers hard for a
  // reason none of these cases is about — and every soft path below would be
  // tested against a decision it never reaches.
  const progressAt = now - 1.5 * EMERGENCY_THRESHOLD_MS
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
    // The intent SURVIVES the outcome (union entry U7): it is what the
    // successor reads for its handoff and what the next tick of the same
    // episode recognises instead of opening a second recovery.
    expect(JSON.parse(readFileSync(f.statePath, 'utf8')).pending).toMatchObject({ phase: 'intent' })
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

  it('resumes its own crashed attempt instead of opening a second one', () => {
    const f = fixture()
    const lock = { sessionId: 'wedged-owner', pid: 123, pidStartedAt: 1000, fence: 8 }
    const first = runEmergency({ ...f, getLock: () => lock, execute: () => '' })
    expect(first.decision.strike).toBe(true)

    // The crash: the strike died between its intent and its outcome, so the
    // state carries a pending intent and the log carries one row.
    const afterIntent = JSON.parse(readFileSync(f.statePath, 'utf8'))
    const state = { ...afterIntent, pending: { ...afterIntent.pending, phase: 'intent' }, lastOutcome: undefined }
    // The retry is the NEXT scheduled tick, not a second attempt inside the
    // cooldown: the crashed strike left its episode's silence behind, and the
    // hourly task is what comes back to it.
    const retry = runEmergency({
      ...f,
      now: f.now + EMERGENCY_COOLDOWN_MS + 60_000,
      inputs: { ...f.inputs, state },
      getLock: () => lock,
      execute: () => '',
    })

    expect(retry.decision.strike).toBe(true)
    const rows = readFileSync(f.logPath, 'utf8').trim().split('\n').map(JSON.parse)
    // ONE intent for one episode: the retry reuses the recorded id rather than
    // minting a second recovery for the same wedge.
    expect(rows.filter((x) => x.phase === 'intent')).toHaveLength(1)
    expect(new Set(rows.map((x) => x.id)).size).toBe(1)
    expect(JSON.parse(readFileSync(f.statePath, 'utf8')).lastStrikeId).toBe(state.lastStrikeId)
  })

  it('opens a new episode when the owner generation it recovers from has changed', () => {
    const f = fixture()
    const first = runEmergency({ ...f, getLock: () => ({ sessionId: 'a', pid: 1, pidStartedAt: 1, fence: 8 }), execute: () => '' })
    expect(first.decision.strike).toBe(true)
    const afterIntent = JSON.parse(readFileSync(f.statePath, 'utf8'))
    const state = { ...afterIntent, pending: { ...afterIntent.pending, phase: 'intent' } }

    const next = runEmergency({
      ...f,
      now: f.now + EMERGENCY_COOLDOWN_MS + 60_000,
      inputs: { ...f.inputs, state },
      getLock: () => ({ sessionId: 'b', pid: 2, pidStartedAt: 2, fence: 9 }),
      execute: () => '',
    })
    expect(next.decision.strike).toBe(true)
    const rows = readFileSync(f.logPath, 'utf8').trim().split('\n').map(JSON.parse)
    expect(rows.filter((x) => x.phase === 'intent')).toHaveLength(2)
    expect(JSON.parse(readFileSync(f.statePath, 'utf8')).lastStrikeId).not.toBe(state.lastStrikeId)
  })

  it('retires the waits of the sessions it recovered and leaves every other one alone', () => {
    const f = fixture()
    f.inputs.state = { lastStrikeAt: f.now - EMERGENCY_COOLDOWN_MS - 1, lastStrikeProgressAt: f.progressAt }
    const lock = { sessionId: 'owner', pid: 10, pidStartedAt: 1000, fence: 2 }
    const handed = []
    const result = runEmergency({
      ...f,
      getLock: () => lock,
      getProcesses: () => ({ owner: { pid: 10, startedAt: 1000 }, delegate: { pid: 11, startedAt: 2000 } }),
      revoke: () => ({ revoked: true, reason: 'revoked' }),
      terminate: (target) => ({ step: 'terminate-owner', ok: true, pid: target.pid }),
      releaseLock: () => true,
      getWaitLeases: () => [
        { sessionId: 'owner', pid: 900, pidStartedAt: 5, runId: 'r1' },
        { sessionId: 'delegate', pid: 901, pidStartedAt: 6, runId: 'r2' },
        { sessionId: 'a-live-stranger', pid: 902, pidStartedAt: 7, runId: 'r3' },
      ],
      retireWaits: (waits) => { handed.push(...waits); return waits.map((w) => ({ pid: w.pid, outcome: 'terminated' })) },
      execute: () => '',
    })
    expect(handed.map((w) => w.pid)).toEqual([900, 901])
    expect(result.outcomes.find((x) => x.step === 'retire-waits')).toMatchObject({ ok: true })
  })

  it('survives an unreadable wait registry rather than skipping the repair', () => {
    const f = fixture()
    f.inputs.state = { lastStrikeAt: f.now - EMERGENCY_COOLDOWN_MS - 1, lastStrikeProgressAt: f.progressAt }
    const result = runEmergency({
      ...f,
      getLock: () => ({ sessionId: 'owner', pid: 10, pidStartedAt: 1000, fence: 2 }),
      getProcesses: () => ({}),
      revoke: () => ({ revoked: true, reason: 'revoked' }),
      terminate: () => ({ step: 'terminate-owner', ok: true, pid: 10 }),
      releaseLock: () => true,
      getWaitLeases: () => { throw new Error('registry is corrupt') },
      execute: () => '',
    })
    expect(result.outcomes.filter((x) => x.step === 'retire-waits')).toEqual([
      { step: 'retire-waits', ok: false, error: 'registry is corrupt' },
      { step: 'retire-waits', ok: true, skipped: 'no-registered-wait' },
    ])
    expect(result.outcomes.at(-1)).toMatchObject({ step: 'batch-autostart.mjs', ok: true })
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
  it('makes the real run-record reducer follow the captured snapshot instead of re-reading disk', () => {
    const repo = mkdtempSync(join(tmpdir(), 'hoa-emergency-snapshot-'))
    dirs.push(repo)
    const log = join(repo, 'large.log')
    const diskPid = 111
    const snapshotPid = 222
    writeFileSync(`${log}.run.json`, JSON.stringify({
      pid: diskPid, log, status: 'running', startedAt: 1000,
    }))
    const snapshot = { pid: snapshotPid, log, status: 'running', startedAt: 2000 }
    const probed = []
    const realRunRecord = (path, options) => runRecordFor(path, {
      ...options,
      probe: (pid) => { probed.push(pid); return { exists: pid === snapshotPid } },
      commandOf: () => `node /repo/scripts/verify/run-logged.mjs --log-file ${log}`,
    })

    expect(verificationProcessAlive(snapshot, `${log}.run.json`, log, { runRecord: realRunRecord })).toBe(true)
    expect(probed).toEqual([snapshotPid])
  })

  it('probes the already-resolved log and accepts only an explicit live verdict', () => {
    const log = '/repo/local/verify-logs/large.log'
    const record = { pid: 4242, log: 'local/verify-logs/large.log', startedAt: 1000 }
    const runRecord = vi.fn(() => ({ alive: true }))
    expect(verificationProcessAlive(record, '/ignored.run.json', log, { runRecord })).toBe(true)
    expect(runRecord).toHaveBeenCalledWith(log, { read: expect.any(Function) })
    expect(runRecord.mock.calls[0][1].read()).toBe(record)
    expect(verificationProcessAlive(record, '', log, { runRecord: () => ({ alive: false }) })).toBe(false)
    expect(verificationProcessAlive(record, '', log, { runRecord: () => { throw new Error('unreadable') } })).toBe(false)
    expect(verificationProcessAlive(null, '', log, { runRecord })).toBe(false)
  })

  it('wires the resolved report path into the real default input probe', () => {
    const repo = mkdtempSync(join(tmpdir(), 'hoa-emergency-inputs-'))
    dirs.push(repo)
    writeFileSync(join(repo, 'TASKS.md'), '')
    const log = join(repo, 'local', 'verify-logs', 'large.log')
    const record = { pid: 4242, log: 'local/verify-logs/large.log', startedAt: 1000 }
    const runRecord = vi.fn(() => ({ alive: true }))
    let alive = false
    defaultInputs({
      repo,
      now: Date.now(),
      thresholdMs: EMERGENCY_THRESHOLD_MS,
      runRecord,
      gather: ({ verificationProcessAlive: probe }) => {
        alive = probe(record, `${log}.run.json`, log)
        return {}
      },
    })
    expect(alive).toBe(true)
    expect(runRecord).toHaveBeenCalledWith(log, { read: expect.any(Function) })
    expect(runRecord.mock.calls[0][1].read()).toBe(record)
  })
})
