// The end-to-end handover chain, judged (point 388).
//
// The point that these tests serve is that a green unit layer proves nothing
// about this mechanism: every part worked on the night of 28.07.2026 and the
// batch still stood still. So what is pinned here is the OBSERVER — that it
// reads a complete chain as complete, and above all that it recognises each
// broken link for what it is, including the exact shape of that night's failure.
import { describe, it, expect } from 'vitest'
import {
  OBSERVE_GRACE_MS,
  TAKEOVER_GRACE_MS,
  assessChain,
  parseHandoverLog,
  parseLauncherLog,
} from './batch-handover-observe-core.mjs'
import { HANDOVER_GRACE_MS, PENDING_STALE_MS } from './batch-singleton.mjs'

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
const FREE = '[2026-07-29T10:18:00.000Z] no owner lock — taking over'
const MEASURED_DEAD =
  '[2026-08-21T10:18:00.000Z] owner process measured inactive (pid-dead) — taking over; no live batch-writer process measured'
// Inside the grace the launcher waits ON PURPOSE — a healthy chain, not a failure.
const GRACE_SKIP = '[2026-07-29T10:12:00.000Z] skip: owner alive (handover-grace; heartbeat 7 min old, pid 18492)'
// Past the grace, still reading a live owner: THE failure of 28.07.2026.
const SKIP = '[2026-07-29T10:35:00.000Z] skip: owner alive (pid-alive; heartbeat 30 min old, pid 18492)'

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
    const l = launcherLog(ACCEPT, SPAWN, SKIP, FREE, '[2026-07-29T10:33:00.000Z] SILENT owner: s (pid 1) has not moved in 95 min — notifying')
    expect(l.map((x) => x.kind)).toEqual([
      'handover-accepted',
      'spawned',
      'skip-alive',
      'took-free-lock',
      'silent-notified',
    ])
    expect(l[0].point).toBe(388)
    expect(l[1].pid).toBe(5150)
  })

  it('classifies a process-evidenced dead-owner start without requiring the retired lock claim wording', () => {
    expect(launcherLog(MEASURED_DEAD)[0]).toMatchObject({ kind: 'took-dead-lock' })
  })

  it('reads the LEASE EXPIRED takeover as the old-route takeover it is (point 434)', () => {
    // The launcher stopped writing "owner provably dead" for this case when
    // ownership became a lease. An observer that silently stops recognising the
    // line it exists to find reports a healthy chain forever.
    const l = launcherLog(
      '[2026-07-29T10:40:00.000Z] LEASE EXPIRED: session-old (pid 5150) has not renewed for 63 min — taking the batch.',
    )
    expect(l.map((x) => x.kind)).toEqual(['took-dead-lock'])
  })

  it('tells the deliberate handover-grace wait apart from a skip that means failure', () => {
    const l = launcherLog(GRACE_SKIP, SKIP)
    expect(l.map((x) => x.kind)).toEqual(['skip-grace', 'skip-alive'])
    expect(l[0].reason).toBe('handover-grace')
  })
})

// ---------------------------------------------------------------------------
describe('the observer measures the mechanism, not a copy of it', () => {
  it('its grace matches HANDOVER_GRACE_MS', () => {
    expect(OBSERVE_GRACE_MS).toBe(HANDOVER_GRACE_MS)
  })

  it('and the window it allows a booting successor matches the launcher\'s own PENDING_STALE_MS', () => {
    expect(TAKEOVER_GRACE_MS).toBe(PENDING_STALE_MS)
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

  it('THE NIGHT OF 28.07.2026: a taken boundary the launcher still skips PAST THE GRACE is BROKEN', () => {
    const r = chain({ launcher: launcherLog(SKIP), lock: oldLock, commits: [] })
    const spawn = linkOf(r, 'spawn')
    expect(spawn.status).toBe('broken')
    expect(spawn.evidence).toContain('skip: owner alive')
    expect(spawn.broken).toMatch(/live owner/)
    expect(r.ok).toBe(false)
  })

  it('but the launcher WAITING OUT the grace is a healthy chain on schedule, never a break', () => {
    const r = chain({
      launcher: launcherLog(GRACE_SKIP),
      lock: oldLock,
      commits: [],
      now: HANDOVER_AT + 8 * 60_000,
    })
    expect(linkOf(r, 'spawn').status).toBe('pending')
    expect(linkOf(r, 'spawn').evidence).toMatch(/waiting out the handover grace/)
  })

  it('an ordinary skip INSIDE the grace window is not evidence either', () => {
    const early = '[2026-07-29T10:14:00.000Z] skip: owner alive (pid-alive; heartbeat 9 min old, pid 18492)'
    const r = chain({ launcher: launcherLog(early), lock: oldLock, commits: [], now: HANDOVER_AT + 10 * 60_000 })
    expect(linkOf(r, 'spawn').status).toBe('pending')
  })

  it('a spawn reached by the OLD route — the lock EXPIRING — is not the handover working', () => {
    const dead = '[2026-07-29T10:18:00.000Z] owner provably dead (pid-dead) — taking over'
    const r = chain({ launcher: launcherLog(dead, SPAWN) })
    expect(linkOf(r, 'spawn').status).toBe('broken')
    expect(linkOf(r, 'spawn').broken).toMatch(/it EXPIRED/)
  })

  it('a launcher log with no takeover line at all still passes on the spawn (older builds)', () => {
    expect(linkOf(chain({ launcher: launcherLog(SPAWN) }), 'spawn').status).toBe('pass')
  })

  it('a skip line without its parenthesised reason is still counted as evidence', () => {
    const bare = '[2026-07-29T10:35:00.000Z] skip: owner alive'
    expect(parseLauncherLog(bare)[0].kind).toBe('skip-alive')
    expect(linkOf(chain({ launcher: launcherLog(bare), lock: oldLock, commits: [] }), 'spawn').status).toBe('broken')
  })

  it('THE HEADLESS PATH: a `claude -p` that exited leaves no lock to accept, and the spawn alone proves the link', () => {
    // SessionEnd released the lock, so the launcher logs no acceptance at all.
    const r = chain({ launcher: launcherLog(FREE, SPAWN) })
    expect(linkOf(r, 'spawn').status).toBe('pass')
    expect(linkOf(r, 'spawn').evidence).toContain('launched pid 5150')
    expect(r.ok).toBe(true)
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

  it('the LAUNCHER\'s own pending-spawn lock is not a takeover — that is where conversion can still fail', () => {
    const pending = { sessionId: 'launcher-xyz', kind: 'pending-spawn', spawnedPid: 5150, claimedAt: T('2026-07-29T10:18:02.000Z') }
    const soon = chain({ lock: pending, commits: [], now: T('2026-07-29T10:19:00.000Z') })
    expect(linkOf(soon, 'takeover').status).toBe('pending')
    // …and once the successor has had its time, it is a genuine break.
    const late = chain({ lock: pending, commits: [], now: T('2026-07-29T10:18:02.000Z') + TAKEOVER_GRACE_MS + 1000 })
    expect(linkOf(late, 'takeover').status).toBe('broken')
  })

  it('the seconds while the child boots are pending, not broken', () => {
    const r = chain({ lock: oldLock, commits: [], now: T('2026-07-29T10:18:30.000Z') })
    expect(linkOf(r, 'takeover').status).toBe('pending')
    expect(linkOf(r, 'takeover').evidence).toMatch(/still coming up/)
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

// ---------------------------------------------------------------------------
// THE ANCHOR. Measured on 28.07.2026: a handover that demonstrably completed
// read as "no ticked point found on main", because the anchor was the newest
// tick in the last five work-order commits and eight append-only commits had
// buried it. The handover names its own point; that point's CLOSURE — a state,
// not an event inside a log window — is what the close link must ask.
describe('assessChain anchors on the handover that was taken', () => {
  const anchored = (over = {}) =>
    assessChain({
      tick: null,
      handovers,
      closures: { 388: 'closed' },
      launcher: launcherLog(ACCEPT, SPAWN),
      lock: successorLock,
      commits: commit,
      now: T('2026-07-29T11:00:00.000Z'),
      ...over,
    })

  it('THE MEASURED DEFECT: a tick older than the newest work-order commits still completes the chain', () => {
    const r = anchored()
    expect(r.ok).toBe(true)
    expect(linkOf(r, 'close').status).toBe('pass')
    expect(linkOf(r, 'close').evidence).toContain('point 388 is closed')
    expect(linkOf(r, 'take').evidence).toBe(HANDOVER_LINE)
  })

  it('and names the tick commit when it was found, as evidence rather than as the judgement', () => {
    const r = anchored({ tick })
    expect(linkOf(r, 'close').evidence).toContain('abcdef1')
    expect(r.ok).toBe(true)
  })

  it('a handover for a point that is NOT closed never reads as pass', () => {
    for (const over of [{}, { tick }, { tick: { point: 999, at: TICK_AT, sha: 'ffffff1' } }]) {
      const r = anchored({ closures: { 388: 'open' }, ...over })
      expect(linkOf(r, 'close').status).toBe('pending')
      expect(linkOf(r, 'close').evidence).toMatch(/still OPEN/)
      expect(r.links).toHaveLength(1)
      expect(r.ok).toBe(false)
    }
  })

  it('a closure that could not be read at all falls back to the tick, never inventing one', () => {
    expect(anchored({ closures: { 388: 'unknown' }, tick }).ok).toBe(true) // the tick still anchors
    const blind = anchored({ closures: {} })
    expect(linkOf(blind, 'close').status).toBe('pending')
    expect(linkOf(blind, 'close').evidence).toBe('no ticked point found on main')
  })

  it('no handover anywhere still reports the honest pending', () => {
    const r = anchored({ handovers: [], closures: {}, launcher: [], commits: [] })
    expect(linkOf(r, 'close').status).toBe('pending')
    expect(r.links).toHaveLength(1)
    expect(r.ok).toBe(false)
  })

  it('the NEWEST handover is the anchor when several were recorded', () => {
    const many = parseHandoverLog(
      [
        '[2026-07-29T08:00:00.000Z] HANDOVER point 300 by session-older — lock marked handed-over.',
        HANDOVER_LINE,
      ].join('\n'),
    )
    const r = anchored({ handovers: many, closures: { 300: 'closed', 388: 'closed' } })
    expect(linkOf(r, 'close').evidence).toContain('point 388')
    expect(r.ok).toBe(true)
  })
})
