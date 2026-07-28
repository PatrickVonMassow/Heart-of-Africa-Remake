// The end-to-end handover chain, judged (point 388).
//
// The point that these tests serve is that a green unit layer proves nothing
// about this mechanism: every part worked on the night of 28.07.2026 and the
// batch still stood still. So what is pinned here is the OBSERVER — that it
// reads a complete chain as complete, and above all that it recognises each
// broken link for what it is, including the exact shape of that night's failure.
import { describe, it, expect } from 'vitest'
import { assessChain, parseHandoverLog, parseLauncherLog } from './batch-handover-observe-core.mjs'

const T = (iso) => Date.parse(iso)
const TICK_AT = T('2026-07-29T10:00:00.000Z')
const tick = { point: 388, at: TICK_AT, sha: 'abcdef1234567890' }

const HANDOVER_LINE =
  '[2026-07-29T10:05:00.000Z] HANDOVER point 388 by session-old — lock marked handed-over; the launcher may spawn the successor.'
const handovers = parseHandoverLog(HANDOVER_LINE)
const HANDOVER_AT = T('2026-07-29T10:05:00.000Z')

const launcherLog = (...lines) => parseLauncherLog(lines.join('\n'))
const ACCEPT = '[2026-07-29T10:18:00.000Z] HANDOVER accepted: session-old handed the batch over at point 388 — spawning the successor'
const SPAWN = '[2026-07-29T10:18:02.000Z] launched pid 5150 under pending-spawn lock launcher-xyz'
const SKIP = '[2026-07-29T10:18:00.000Z] skip: owner alive (pid-alive; heartbeat 20 min old, pid 18492)'

const successorLock = { sessionId: 'session-new', kind: 'session', pid: 5150, claimedAt: T('2026-07-29T10:19:00.000Z') }
const oldLock = { sessionId: 'session-old', kind: 'session', pid: 18492, claimedAt: HANDOVER_AT - 60_000 }
const commit = [{ sha: 'fedcba9876543210', at: T('2026-07-29T10:40:00.000Z'), subject: 'Give the walkers a way out' }]

const chain = (over = {}) =>
  assessChain({
    tick,
    handovers,
    launcher: launcherLog(ACCEPT, SPAWN),
    lock: successorLock,
    commits: commit,
    now: T('2026-07-29T11:00:00.000Z'),
    ...over,
  })

const linkOf = (result, id) => result.links.find((l) => l.id === id)

// ---------------------------------------------------------------------------
describe('parsers — the log lines each link is proved by', () => {
  it('reads a handover record', () => {
    expect(handovers).toEqual([{ at: HANDOVER_AT, point: 388, sid: 'session-old', line: HANDOVER_LINE }])
  })

  it('ignores prose that merely mentions a handover', () => {
    expect(parseHandoverLog('[2026-07-29T10:05:00.000Z] boundary stop by s1 for point 388 but the lock…')).toEqual([])
  })

  it('classifies the launcher lines that matter', () => {
    const l = launcherLog(ACCEPT, SPAWN, SKIP, '[2026-07-29T10:33:00.000Z] SILENT owner: s (pid 1) has not moved in 95 min — notifying')
    expect(l.map((x) => x.kind)).toEqual(['handover-accepted', 'spawned', 'skip-alive', 'silent-notified'])
    expect(l[0].point).toBe(388)
    expect(l[1].pid).toBe(5150)
  })
})

// ---------------------------------------------------------------------------
describe('assessChain — one observed handover, end to end', () => {
  it('a complete chain reads as complete, with the evidence for every link', () => {
    const r = chain()
    expect(r.ok).toBe(true)
    expect(r.links.map((l) => l.id)).toEqual(['close', 'take', 'spawn', 'takeover', 'work'])
    expect(r.links.every((l) => l.status === 'pass')).toBe(true)
    expect(linkOf(r, 'spawn').evidence).toContain('launched pid 5150')
    expect(linkOf(r, 'work').evidence).toContain('Give the walkers a way out')
  })

  it('THE NIGHT OF 28.07.2026: a taken boundary that the launcher still skips is BROKEN, not pending', () => {
    const r = chain({ launcher: launcherLog(SKIP), lock: oldLock, commits: [] })
    const spawn = linkOf(r, 'spawn')
    expect(spawn.status).toBe('broken')
    expect(spawn.evidence).toContain('skip: owner alive')
    expect(spawn.broken).toMatch(/live owner/)
    expect(r.ok).toBe(false)
  })

  it('a boundary that was never taken is the OTHER half of that night, and names the guard that must block it', () => {
    const r = chain({ handovers: [], launcher: [], lock: oldLock, commits: [] })
    const take = linkOf(r, 'take')
    expect(take.status).toBe('pending')
    expect(take.broken).toMatch(/TAKE THE POINT BOUNDARY/)
    expect(r.links.map((l) => l.id)).toEqual(['close', 'take']) // it stops at the broken link
  })

  it('an accepted handover with no spawn line is broken at the launcher, not at the lock', () => {
    const r = chain({ launcher: launcherLog(ACCEPT), lock: oldLock, commits: [] })
    expect(linkOf(r, 'spawn').status).toBe('broken')
    expect(linkOf(r, 'spawn').evidence).toContain('no "launched pid" line followed')
  })

  it('a successor that never converted the lock breaks the takeover link', () => {
    const r = chain({ lock: oldLock, commits: [] })
    expect(linkOf(r, 'spawn').status).toBe('pass')
    expect(linkOf(r, 'takeover').status).toBe('broken')
    expect(linkOf(r, 'takeover').broken).toMatch(/pending-spawn/)
  })

  it('a successor that owns the lock but commits nothing is still incomplete', () => {
    const r = chain({ commits: [] })
    expect(linkOf(r, 'takeover').status).toBe('pass')
    expect(linkOf(r, 'work').status).toBe('pending')
    expect(r.ok).toBe(false)
  })

  it('a commit from BEFORE the spawn is not the successor\'s work', () => {
    const r = chain({ commits: [{ sha: 'aaaaaaa1', at: TICK_AT, subject: 'the predecessor tick' }] })
    expect(linkOf(r, 'work').status).toBe('pending')
  })

  it('waiting for the launcher\'s next tick is pending, never broken', () => {
    const r = chain({ launcher: [], lock: oldLock, commits: [], now: HANDOVER_AT + 4 * 60_000 })
    expect(linkOf(r, 'spawn').status).toBe('pending')
    expect(linkOf(r, 'spawn').evidence).toMatch(/every 15 min/)
  })

  it('a handover for a DIFFERENT point does not prove this one', () => {
    const other = parseHandoverLog('[2026-07-29T10:05:00.000Z] HANDOVER point 999 by session-old — lock marked handed-over.')
    expect(linkOf(chain({ handovers: other }), 'take').status).toBe('pending')
  })

  it('a handover recorded BEFORE the tick belongs to the previous point', () => {
    const stale = parseHandoverLog('[2026-07-29T09:00:00.000Z] HANDOVER point 388 by session-old — lock marked handed-over.')
    expect(linkOf(chain({ handovers: stale }), 'take').status).toBe('pending')
  })

  it('no closed point at all → the chain has not begun', () => {
    const r = assessChain({ tick: null })
    expect(r.ok).toBe(false)
    expect(r.links).toHaveLength(1)
    expect(linkOf(r, 'close').status).toBe('pending')
  })
})
