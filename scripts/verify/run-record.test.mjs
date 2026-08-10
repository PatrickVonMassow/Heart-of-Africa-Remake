// The run record (point 592): the file that makes a verify run one checkable
// object, so awaiting it replaces re-reading its log.
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  SCAN_LIMIT,
  activeRecordPath,
  countPoll,
  elapsedMs,
  framesWrittenSince,
  latestRecordPath,
  pidAlive,
  readRecord,
  recordPathFor,
  runIsLive,
  writeRecord,
} from './run-record.mjs'

const tmp = () => mkdtempSync(join(tmpdir(), 'hoa-runrecord-'))

describe('the record lives beside its log', () => {
  it('derives its path from the log, so the two can never be paired wrongly', () => {
    expect(recordPathFor('/x/y/2026-run.log')).toBe('/x/y/2026-run.log.run.json')
  })

  it('round-trips, and answers null for anything unreadable', () => {
    const dir = tmp()
    const path = join(dir, 'a.log.run.json')
    expect(readRecord(path)).toBeNull()
    expect(writeRecord(path, { command: 'verify small', startedAt: 5 })).toBe(true)
    expect(readRecord(path)).toMatchObject({ command: 'verify small', startedAt: 5 })
    writeFileSync(join(dir, 'b.log.run.json'), 'not json')
    expect(readRecord(join(dir, 'b.log.run.json'))).toBeNull()
  })

  it('resolves the NEWEST run by the start time it carries, not by mtime', () => {
    const dir = tmp()
    // Written newest-first on purpose: a poll rewrites a record, so mtime order
    // and run order are different things.
    writeRecord(join(dir, 'new.log.run.json'), { startedAt: 2000 })
    writeRecord(join(dir, 'old.log.run.json'), { startedAt: 1000 })
    writeFileSync(join(dir, 'junk.run.json'), '{}')
    expect(latestRecordPath(dir)).toBe(join(dir, 'new.log.run.json'))
    expect(latestRecordPath(join(dir, 'nope'))).toBeNull()
  })

  it('bounds its scan, so a hook on every tool call does not grow with the log directory', () => {
    const dir = tmp()
    for (let i = 0; i < SCAN_LIMIT + 5; i++) {
      writeRecord(join(dir, `2026-08-10T00-00-${String(i).padStart(2, '0')}.log.run.json`), { startedAt: 1000 + i })
    }
    // The oldest five are outside the window; the newest is still found.
    expect(latestRecordPath(dir)).toContain(`00-${String(SCAN_LIMIT + 4).padStart(2, '0')}`)
    expect(latestRecordPath(dir, { max: 1 })).toContain(`00-${String(SCAN_LIMIT + 4).padStart(2, '0')}`)
  })
})

describe('activeRecordPath — the run a WAIT is about', () => {
  const alive = (at) => ({ startedAt: at, status: 'running', pid: process.pid })
  const over = (at) => ({ startedAt: at, status: 'finished', exitCode: 0 })

  it('prefers a run that is still GOING over a newer one that has finished', () => {
    // The real case: a quick single-suite verify finishes beside a running
    // LARGE. Judging liveness on the newer record would call the LARGE over and
    // withdraw the wait marker in the middle of the wait it exists for.
    const dir = tmp()
    writeRecord(join(dir, 'a-large.log.run.json'), alive(1000))
    writeRecord(join(dir, 'b-quick.log.run.json'), over(2000))
    expect(activeRecordPath(dir)).toBe(join(dir, 'a-large.log.run.json'))
  })

  it('falls back to the newest record when nothing is running', () => {
    const dir = tmp()
    writeRecord(join(dir, 'a.log.run.json'), over(1000))
    writeRecord(join(dir, 'b.log.run.json'), over(2000))
    expect(activeRecordPath(dir)).toBe(join(dir, 'b.log.run.json'))
  })

  it('takes the newest of several live runs, and answers null for nothing at all', () => {
    const dir = tmp()
    writeRecord(join(dir, 'a.log.run.json'), alive(1000))
    writeRecord(join(dir, 'b.log.run.json'), alive(2000))
    expect(activeRecordPath(dir)).toBe(join(dir, 'b.log.run.json'))
    expect(activeRecordPath(join(dir, 'nope'))).toBeNull()
  })
})

describe('framesWrittenSince — the half the shutter cannot see', () => {
  it('counts DISTINCT image files newer than the run, and nothing else', () => {
    const dir = tmp()
    mkdirSync(dir, { recursive: true })
    const old = new Date(Date.now() - 60_000)
    for (const name of ['01-a.png', '02-b.png', '03-c.jpg']) writeFileSync(join(dir, name), 'x')
    writeFileSync(join(dir, 'README.md'), 'not a frame')
    writeFileSync(join(dir, 'stale.png'), 'x')
    utimesSync(join(dir, 'stale.png'), old, old)
    expect(framesWrittenSince(Date.now() - 5_000, { dir, toleranceMs: 0 })).toBe(3)
  })

  it('answers null rather than zero when it cannot look', () => {
    expect(framesWrittenSince(Date.now(), { dir: join(tmp(), 'absent') })).toBeNull()
    expect(framesWrittenSince(null)).toBeNull()
  })
})

describe('is the run still going?', () => {
  it('reads its own process as alive and a garbage pid as unknown', () => {
    expect(pidAlive(process.pid)).toBe(true)
    expect(pidAlive(0)).toBeNull()
    expect(pidAlive('nonsense')).toBeNull()
    // 2^22 is above every default pid_max on this class of host.
    expect(pidAlive(4_194_303)).toBe(false)
  })

  it('believes a finished status, and corroborates a running one with the process', () => {
    expect(runIsLive(null)).toMatchObject({ live: false, reason: 'no-record' })
    expect(runIsLive({ status: 'finished' })).toMatchObject({ live: false })
    expect(runIsLive({ status: 'running', pid: process.pid })).toMatchObject({ live: true, reason: 'pid-alive' })
    // A wrapper killed before it could stamp the record would otherwise read
    // `running` for ever, and a Stop guard riding on that goes blind.
    expect(runIsLive({ status: 'running', pid: 4_194_303 })).toMatchObject({ live: false, reason: 'pid-gone' })
    expect(runIsLive({ status: 'running' })).toMatchObject({ live: true, reason: 'status-running' })
  })

  it('reports the elapsed time, or null when the record never said', () => {
    expect(elapsedMs({ startedAt: 1000 }, 4000)).toBe(3000)
    expect(elapsedMs({}, 4000)).toBeNull()
  })
})

describe('countPoll — the only thing that moves the counter', () => {
  it('raises the count and stamps when it happened', () => {
    const dir = tmp()
    const path = join(dir, 'a.log.run.json')
    writeRecord(path, { status: 'running', startedAt: 1 })
    expect(countPoll(path).polls).toBe(1)
    expect(countPoll(path).polls).toBe(2)
    expect(readRecord(path).lastPolledAt).toBeGreaterThan(0)
  })

  it('answers null where there is nothing to count against', () => {
    expect(countPoll(join(tmp(), 'absent.run.json'))).toBeNull()
  })
})
