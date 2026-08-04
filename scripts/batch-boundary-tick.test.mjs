// THE GUARD STOPPED DEMANDING THE BOUNDARY AS SOON AS THE QUEUE GREW (point 399).
//
// `boundaryDueFrom` asks when a boundary became due, and it used to be fed by
// `lastWorkOrderTick`, which scans the newest FIVE work-order commits. A batch turn
// routinely appends points: on 28.07.2026 eight append-only commits landed after the
// tick of point 338, the tick fell out of that window, and the guard demanded NOTHING
// for the whole 90 minutes in which it should have been demanding the point boundary.
// A session that is not told to hand over keeps the lock and carries the next point in
// the same context — the exact cost point 373 exists to avoid.
//
// Measured on this repository the day the fix landed, the count-limited scan answered
// `null` while the time-windowed one found the tick of point 412: not a hypothetical.
//
// `git` is injected, so the sweep is proven without a repository and without a clock.
import { describe, it, expect } from 'vitest'
import { lastWorkOrderTickSince, TICK_SCAN_MAX } from './batch-boundary.mjs'
import { BOUNDARY_DUE_MS, boundaryDueFrom } from './batch-boundary-core.mjs'

const NOW = 1_785_000_000_000
const sha = (n) => String(n).padStart(40, '0').replace(/0/g, 'a').slice(0, 40)

/**
 * A fake git over a list of work-order commits, newest first:
 *   { sha, at, diff }
 * It honours `--since` the way git does, so a test cannot accidentally prove the
 * window by handing over pre-filtered rows.
 */
const fakeGit = (commits, seen = []) => (args) => {
  seen.push(args)
  if (args[0] === 'log') {
    const sinceArg = args.find((a) => a.startsWith('--since='))
    const since = sinceArg ? Date.parse(sinceArg.slice('--since='.length)) : 0
    return commits
      .filter((c) => c.at >= since)
      .map((c) => `${c.sha} ${Math.floor(c.at / 1000)}`)
      .join('\n')
  }
  if (args[0] === 'show') {
    const want = args[1] === '--format=' ? args[3] : args[1]
    return commits.find((c) => c.sha === want)?.diff ?? ''
  }
  return ''
}

const tickDiff = (point) => `--- a/TASKS.md\n+++ b/TASKS.md\n+- [x] ${point}. A closed point\n`
const appendDiff = (point) => `--- a/TASKS.md\n+++ b/TASKS.md\n+- [ ] ${point}. A new point\n`
const archiveMoveDiff = (point) =>
  `--- a/TASKS.md\n-- [x] ${point}. Older point\n+++ b/docs/tasks-archive.md\n+- [x] ${point}. Older point`

describe('lastWorkOrderTickSince — the anchor cannot fall out of a window', () => {
  it('THE INCIDENT: a tick behind TWENTY append-only commits is still found', () => {
    const commits = []
    for (let i = 0; i < 20; i += 1) {
      commits.push({ sha: sha(400 + i), at: NOW - (i + 1) * 60_000, diff: appendDiff(400 + i) })
    }
    commits.push({ sha: sha(338), at: NOW - 25 * 60_000, diff: tickDiff(338) })
    const tick = lastWorkOrderTickSince({ now: NOW, git: fakeGit(commits) })
    expect(tick).toMatchObject({ point: 338, at: NOW - 25 * 60_000 })
    // …and the guard therefore has a boundary to demand.
    expect(boundaryDueFrom({ tick, ownerSince: NOW - 3 * 3600_000, now: NOW })).toBe(338)
  })

  it('a tick OLDER than the window reports nothing due', () => {
    const commits = [{ sha: sha(338), at: NOW - BOUNDARY_DUE_MS - 60_000, diff: tickDiff(338) }]
    expect(lastWorkOrderTickSince({ now: NOW, git: fakeGit(commits) })).toBe(null)
  })

  it('the window is asked of GIT, not filtered afterwards', () => {
    const seen = []
    lastWorkOrderTickSince({ now: NOW, git: fakeGit([], seen) })
    const log = seen.find((a) => a[0] === 'log')
    expect(log).toBeTruthy()
    const since = log.find((a) => a.startsWith('--since='))
    expect(since).toBeTruthy()
    expect(Date.parse(since.slice('--since='.length))).toBe(NOW - BOUNDARY_DUE_MS)
    // Both work-order paths, and nothing else.
    expect(log.slice(log.indexOf('--'))).toEqual(['--', 'TASKS.md', 'docs/tasks-archive.md'])
  })

  it('an ARCHIVE MOVE is not a tick — the newest real closure wins', () => {
    const commits = [
      { sha: sha(1), at: NOW - 60_000, diff: archiveMoveDiff(380) },
      { sha: sha(2), at: NOW - 120_000, diff: appendDiff(401) },
      { sha: sha(3), at: NOW - 300_000, diff: tickDiff(388) },
    ]
    expect(lastWorkOrderTickSince({ now: NOW, git: fakeGit(commits) })).toMatchObject({ point: 388 })
  })

  it('the NEWEST tick inside the window is the answer', () => {
    const commits = [
      { sha: sha(1), at: NOW - 60_000, diff: tickDiff(399) },
      { sha: sha(2), at: NOW - 600_000, diff: tickDiff(388) },
    ]
    expect(lastWorkOrderTickSince({ now: NOW, git: fakeGit(commits) })).toMatchObject({ point: 399 })
  })

  it('a commit that ticks one point while archiving another reports the tick', () => {
    const diff = `${archiveMoveDiff(380)}\n+- [x] 399. closed now\n`
    expect(lastWorkOrderTickSince({ now: NOW, git: fakeGit([{ sha: sha(1), at: NOW - 60_000, diff }]) })).toMatchObject({
      point: 399,
    })
  })

  it('an UNREADABLE git answers "not due" rather than throwing — the guard fails open', () => {
    const thrower = () => {
      throw new Error('not a git repository')
    }
    expect(() => lastWorkOrderTickSince({ now: NOW, git: thrower })).not.toThrow()
    expect(lastWorkOrderTickSince({ now: NOW, git: thrower })).toBe(null)
    // A ref that exists but answers nonsense is not a tick either.
    expect(lastWorkOrderTickSince({ now: NOW, git: () => 'not a sha at all' })).toBe(null)
  })

  it('a later ref is tried when the first has no such revision', () => {
    const commits = [{ sha: sha(1), at: NOW - 60_000, diff: tickDiff(399) }]
    const real = fakeGit(commits)
    const git = (args) => {
      if (args.includes('origin/main')) throw new Error('unknown revision')
      return real(args)
    }
    expect(lastWorkOrderTickSince({ now: NOW, refs: ['origin/main', 'main'], git })).toMatchObject({ point: 399 })
  })

  // --- MIND THE COST: this runs in a Stop hook at every turn end ---------------
  it('ONE log call, and a show only for candidates inside the window', () => {
    const seen = []
    const commits = [
      { sha: sha(1), at: NOW - 60_000, diff: appendDiff(401) },
      { sha: sha(2), at: NOW - 120_000, diff: tickDiff(399) },
      { sha: sha(3), at: NOW - BOUNDARY_DUE_MS - 60_000, diff: tickDiff(300) }, // outside
    ]
    lastWorkOrderTickSince({ now: NOW, git: fakeGit(commits, seen) })
    expect(seen.filter((a) => a[0] === 'log')).toHaveLength(1)
    // Two shows: it stops at the first commit that ticks something, and never
    // opens the one git already excluded.
    const shown = seen.filter((a) => a[0] === 'show').map((a) => a[3])
    expect(shown).toEqual([sha(1), sha(2)])
  })

  it('the candidate count is capped, so a pathological window stays bounded', () => {
    const seen = []
    const commits = []
    for (let i = 0; i < TICK_SCAN_MAX + 25; i += 1) {
      commits.push({ sha: sha(500 + i), at: NOW - (i + 1) * 1000, diff: appendDiff(500 + i) })
    }
    expect(lastWorkOrderTickSince({ now: NOW, git: fakeGit(commits, seen) })).toBe(null)
    expect(seen.filter((a) => a[0] === 'show')).toHaveLength(TICK_SCAN_MAX)
    expect(TICK_SCAN_MAX).toBeGreaterThan(20) // the incident's eight, with room
  })
})
