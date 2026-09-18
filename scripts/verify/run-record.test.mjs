// The run record (point 592): the file that makes a verify run one checkable
// object, so awaiting it replaces re-reading its log.
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, it, expect, vi } from 'vitest'
import { repositoryCommonRoot } from '../repo-paths.mjs'
import {
  SCAN_LIMIT,
  activeRecordPath,
  countPoll,
  elapsedMs,
  framesWrittenSince,
  lastProgressAtFor,
  latestRecordPath,
  newestFrameMtimeMs,
  openProgressMark,
  progressMarkPathFor,
  pidAlive,
  readRecord,
  logDir,
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

describe('the last sign of life (point 1137)', () => {
  it('reads the NEWEST frame, because a long suite writes frames and no log line', () => {
    const dir = tmp()
    const old = new Date(Date.now() - 600_000)
    writeFileSync(join(dir, '01-a.png'), 'x')
    utimesSync(join(dir, '01-a.png'), old, old)
    writeFileSync(join(dir, '02-b.png'), 'x')
    const newest = newestFrameMtimeMs({ dir })
    expect(newest).toBeGreaterThan(old.getTime())
    expect(newest).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('answers null when there is nothing to look at, rather than a false silence', () => {
    expect(newestFrameMtimeMs({ dir: join(tmp(), 'absent') })).toBeNull()
    expect(newestFrameMtimeMs({ dir: tmp() })).toBeNull()
    expect(lastProgressAtFor({})).toBeNull()
  })

  // ASTRA REVIEW ROUNDS 1 TO 3 — `countPoll` rewrites the run RECORD, so a reader
  // that took that file's mtime for progress could manufacture the life it was
  // looking for; a mark kept INSIDE the record would be dropped whenever a
  // poll's read-modify-write overtook the writer's; and a mark PREFERRED over
  // everything else would freeze a healthy run the moment its marker stopped
  // being writable. So: a file of its own, and the NEWEST of the run's own
  // writings decides.
  it('never takes the run RECORD for progress — a poll writes that file', () => {
    const dir = tmp()
    const log = join(dir, 'run.log')
    const record = join(dir, 'run.log.run.json')
    const stale = new Date(Date.now() - 45 * 60_000)
    writeFileSync(log, 'x')
    utimesSync(log, stale, stale)
    writeFileSync(record, '{}')
    // The record was touched a moment ago, as a counted poll would touch it.
    // The run itself has said nothing for 45 minutes, and that is the answer.
    expect(lastProgressAtFor({ logPath: log, recordPath: record })).toBeLessThan(Date.now() - 40 * 60_000)
  })

  it('takes the newest of the run\'s OWN writings, so a frozen mark cannot condemn it', () => {
    const dir = tmp()
    const log = join(dir, 'run.log')
    const mark = join(dir, 'run.log.progress')
    writeFileSync(mark, '')
    const stale = new Date(Date.now() - 45 * 60_000)
    utimesSync(mark, stale, stale)
    // The marker went unwritable 45 minutes ago; the log is still moving.
    writeFileSync(log, 'x')
    expect(lastProgressAtFor({ logPath: log })).toBeGreaterThan(Date.now() - 60_000)
  })

  // ASTRA REVIEW ROUND 4 — `verification/` is shared and carries no run identity,
  // so any other run's pictures could have vouched for the one being judged, for
  // ever, and even for a selection that takes no frames at all. The frames are
  // the WRITER's business, about its own run, while that run is going.
  it('never lets the shared frame directory speak for a run', async () => {
    // POINTED AT THE REAL `FRAME_DIR`, or the fixture proves nothing (Astra
    // coverage pass): a probe regressed to reading the shared directory would
    // pass against a temporary one it never consults. The module reads
    // `HOA_FRAME_DIR` at import, so the check needs its own module instance.
    const dir = tmp()
    const frames = join(dir, 'frames')
    mkdirSync(frames, { recursive: true })
    writeFileSync(join(frames, '07-somebody-elses.png'), 'x')
    const log = join(dir, 'run.log')
    const stale = new Date(Date.now() - 45 * 60_000)
    writeFileSync(log, 'x')
    utimesSync(log, stale, stale)
    const before = process.env.HOA_FRAME_DIR
    process.env.HOA_FRAME_DIR = frames
    try {
      vi.resetModules()
      const fresh = await import('./run-record.mjs')
      expect(fresh.FRAME_DIR).toBe(frames)
      expect(fresh.newestFrameMtimeMs()).toBeGreaterThan(Date.now() - 60_000)
      expect(fresh.lastProgressAtFor({ logPath: log })).toBeLessThan(Date.now() - 40 * 60_000)
    } finally {
      if (before === undefined) delete process.env.HOA_FRAME_DIR
      else process.env.HOA_FRAME_DIR = before
      vi.resetModules()
    }
  })

  it('derives the mark from the log and from the record path alike', () => {
    expect(progressMarkPathFor('/x/y/run.log')).toBe('/x/y/run.log.progress')
    expect(progressMarkPathFor('/x/y/run.log.run.json')).toBe('/x/y/run.log.progress')
    expect(progressMarkPathFor('')).toBeNull()
    expect(progressMarkPathFor(null)).toBeNull()
  })

  // ASTRA REVIEW ROUNDS 6 TO 9 — the descriptor is the repair. A mark RE-CREATED
  // on every stamp can start failing halfway through a run while the log, opened
  // in the same directory at the same moment, writes on; every attempt to bridge
  // that asymmetry put a second writer into the log. Held open, the two fail
  // together or not at all.
  it('opens the mark once and moves it, without touching the directory again', () => {
    const dir = tmp()
    const log = join(dir, 'run.log')
    const mark = openProgressMark(log)
    expect(mark).not.toBeNull()
    const early = lastProgressAtFor({ logPath: log })
    expect(early).toBeGreaterThan(Date.now() - 60_000)
    const later = Date.now() + 5 * 60_000
    expect(mark.stamp(later)).toBe(true)
    expect(lastProgressAtFor({ logPath: log })).toBeGreaterThan(early)
    // The stamp survives a directory that will take no NEW entry, which is the
    // case that defeated a re-created mark.
    chmodSync(dir, 0o500)
    try {
      expect(mark.stamp(later + 60_000)).toBe(true)
    } finally {
      chmodSync(dir, 0o700)
      mark.close()
    }
  })

  it('answers null rather than throwing when the mark cannot be opened at all', () => {
    expect(openProgressMark(join(tmp(), 'absent', 'run.log'))).toBeNull()
    expect(openProgressMark('')).toBeNull()
    expect(openProgressMark(null)).toBeNull()
  })

  it('falls back to the file marks only for a run that carries no mark', () => {
    const dir = tmp()
    const log = join(dir, 'run.log')
    writeFileSync(log, 'x')
    expect(lastProgressAtFor({ logPath: log })).toBeGreaterThan(Date.now() - 60_000)
  })

  it('ignores a path it cannot stat instead of counting it as silence', () => {
    const dir = tmp()
    const log = join(dir, 'run.log')
    writeFileSync(log, 'x')
    expect(lastProgressAtFor({ logPath: log, recordPath: join(dir, 'gone.run.json') }))
      .toBeGreaterThan(Date.now() - 60_000)
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

describe('the log directory belongs to the shared repository', () => {
  it('defaults to the common checkout', () => {
    expect(logDir({})).toBe(join(repositoryCommonRoot(), 'local', 'verify-logs'))
  })

  // The module is loaded in a CHILD, because the root is resolved once per
  // process: a fixture that runs a script from this checkout against a
  // temporary repository must not find the live checkout's run records. The
  // attended context-ceiling hook did, and read its own verify run as a reason
  // to stay silent (measured 26.08.2026).
  it('follows HOA_REPO_ROOT into a fixture repository', () => {
    const root = mkdtempSync(join(tmpdir(), 'hoa-runrecord-root-'))
    const module = resolve(process.cwd(), 'scripts/verify/run-record.mjs')
    const out = execFileSync(
      process.execPath,
      ['-e', `import(${JSON.stringify(module)}).then((m) => console.log(m.logDir({})))`],
      { encoding: 'utf8', env: { ...process.env, HOA_REPO_ROOT: root }, windowsHide: true },
    )
    expect(out.trim()).toBe(join(root, 'local', 'verify-logs'))
  })
})
