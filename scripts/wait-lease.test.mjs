import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  claimWait,
  finishWait,
  readRegistry,
  retireWaiters,
  runTerminalFor,
  waitStatus,
  writeRegistry,
} from './wait-lease.mjs'

let dir
let path
let journalPath

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wait-lease-'))
  path = join(dir, 'wait-leases.json')
  // Journal into the fixture, never into the live batch journal: a unit run
  // must not write events the standstill analysis then reads as real activity.
  journalPath = join(dir, 'activity.jsonl')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const T0 = 1_800_000_000_000

describe('claimWait', () => {
  it('acquires the first wait and records it on disk', () => {
    const result = claimWait({
      sessionId: 'owner', runId: 'run-a', pid: process.pid, expectedRuntimeMs: 60_000, now: T0, path, journalPath,
    })
    expect(result.verdict).toBe('acquire')
    expect(readRegistry(path).leases).toHaveLength(1)
    expect(JSON.parse(readFileSync(path, 'utf8')).leases[0].runId).toBe('run-a')
  })

  it('attaches instead of spawning a second waiter for the same run', () => {
    claimWait({ sessionId: 'owner', runId: 'run-a', pid: process.pid, now: T0, path, journalPath })
    const second = claimWait({ sessionId: 'owner', runId: 'run-a', pid: process.pid, now: T0 + 600_000, path, journalPath })
    expect(second.verdict).toBe('attach')
    expect(second.terminated).toEqual([])
    expect(readRegistry(path).leases).toHaveLength(1)
  })

  it('replaces a wait the session has moved on from and retires its pid', () => {
    claimWait({ sessionId: 'owner', runId: 'run-a', pid: process.pid, now: T0, path, journalPath })
    const signals = []
    const second = claimWait({
      sessionId: 'owner', runId: 'run-b', pid: process.pid, now: T0 + 600_000, path, journalPath,
      kill: (pid, signal) => signals.push([pid, signal]),
    })
    expect(second.verdict).toBe('replace')
    expect(signals).toEqual([[process.pid, 'SIGTERM']])
    expect(second.terminated).toEqual([{ pid: process.pid, outcome: 'terminated', at: T0 + 600_000 }])
    expect(readRegistry(path).leases.map((l) => l.runId)).toEqual(['run-b'])
  })

  it('derives the run id from the log path when none is given', () => {
    const result = claimWait({
      sessionId: 'owner', logPath: 'local/verify-logs/2026-09-03T00-10-00-000-large.log', pid: process.pid, now: T0, path, journalPath,
    })
    expect(result.lease.runId).toBe('2026-09-03T00-10-00-000-large')
    expect(result.lease.recordPath).toMatch(/2026-09-03T00-10-00-000-large\.log\.run\.json$/)
  })

  it('refuses a claim with no run identity at all (union entry U13)', () => {
    const result = claimWait({ sessionId: 'owner', pid: process.pid, now: T0, path, journalPath })
    expect(result.verdict).toBe('invalid')
    expect(result.reason).toBe('no-run-id')
  })
})

describe('retireWaiters', () => {
  it('leaves a reused pid alone rather than killing a stranger', () => {
    const signals = []
    const outcomes = retireWaiters(
      [{ pid: process.pid, pidStartedAt: 1, runId: 'run-a' }],
      { kill: (pid, signal) => signals.push([pid, signal]) },
    )
    expect(outcomes).toEqual([{ pid: process.pid, outcome: 'pid-reused-left-alone' }])
    expect(signals).toEqual([])
  })

  it('reports a pid that is already gone without signalling', () => {
    const outcomes = retireWaiters([{ pid: 2_147_483_600, runId: 'run-a' }], { kill: () => { throw new Error('must not signal') } })
    expect(outcomes).toEqual([{ pid: 2_147_483_600, outcome: 'already-gone' }])
  })
})

describe('runTerminalFor', () => {
  it('is false for an unreadable record: cannot see is not is over', () => {
    expect(runTerminalFor({ recordPath: join(dir, 'absent.run.json') })).toBe(false)
    expect(runTerminalFor({})).toBe(false)
  })

  it('releases a lease whose run record says the run finished', () => {
    const record = join(dir, 'run.run.json')
    writeFileSync(record, JSON.stringify({ status: 'finished' }))
    expect(runTerminalFor({ recordPath: record })).toBe(true)
    writeFileSync(record, JSON.stringify({ status: 'running' }))
    expect(runTerminalFor({ recordPath: record })).toBe(false)
  })
})

describe('finishWait', () => {
  it('removes the named lease and leaves the others', () => {
    claimWait({ sessionId: 'owner', runId: 'run-a', pid: process.pid, now: T0, path, journalPath })
    writeRegistry(
      { v: 1, leases: [...readRegistry(path).leases, { sessionId: 'other', runId: 'run-b', pid: process.pid, startedAt: T0 }] },
      path,
    )
    const result = finishWait({ sessionId: 'owner', runId: 'run-a', now: T0 + 1000, path, journalPath })
    expect(result.found).toBe(true)
    expect(readRegistry(path).leases.map((l) => l.sessionId)).toEqual(['other'])
  })
})

describe('waitStatus (union entries U11 and U12)', () => {
  it('reports no recovery while one wait is inside its estimate', () => {
    claimWait({ sessionId: 'owner', runId: 'run-a', pid: process.pid, expectedRuntimeMs: 60 * 60_000, now: T0, path, journalPath })
    const status = waitStatus({ now: T0 + 60_000, path, journalPath })
    expect(status.recoveryRequested).toBe(false)
    expect(status.leases[0].state).toBe('running')
  })

  it('asks for recovery when a wait passes its hung mark', () => {
    claimWait({ sessionId: 'owner', runId: 'run-a', pid: process.pid, expectedRuntimeMs: 10 * 60_000, now: T0, path, journalPath })
    const status = waitStatus({ now: T0 + 3 * 60 * 60_000, path, journalPath })
    expect(status.leases[0].state).toBe('hung')
    expect(status.recoveryRequested).toBe(true)
    // The crossing is recorded, so a second read reports the state without
    // asking for a second recovery.
    const again = waitStatus({ now: T0 + 4 * 60 * 60_000, path, journalPath })
    expect(again.leases[0].recovery).toBeNull()
  })

  it('raises the incident alarm when one session holds several live waits', () => {
    writeRegistry(
      {
        v: 1,
        leases: Array.from({ length: 10 }, (_, i) => ({
          sessionId: 'owner', runId: `run-${i}`, pid: process.pid, startedAt: T0,
        })),
      },
      path,
    )
    const status = waitStatus({ now: T0 + 60_000, path, journalPath })
    expect(status.alarm.alarm).toBe(true)
    expect(status.alarm.offenders[0].count).toBe(10)
    expect(status.recoveryRequested).toBe(true)
  })
})
