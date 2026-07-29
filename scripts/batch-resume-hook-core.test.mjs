import { describe, expect, it } from 'vitest'
import { STAND_DOWN_KINDS, standDownKind, standDownMessage } from './batch-resume-hook-core.mjs'
import { CLAIM_BY, responderClaim } from './chat-watcher-core.mjs'

const now = 1_700_000_000_000
const watcherClaim = (responderPid) =>
  responderClaim({
    sessionId: 'chat-responder-abc',
    watcherPid: 100,
    watcherStartedAt: now - 60_000,
    responderPid,
    now: now - 1000,
  })
const userClaim = { v: 1, sessionId: 'user-window-1', pid: 55, pidStartedAt: now - 9000, at: now - 9000 }
const liveLock = { sessionId: 'owner-1', pid: 42, claimedAt: now - 120_000 }

describe('standDownKind — which of the four situations reached this branch', () => {
  it('THIS session is the responder when the watcher claim names its own claude process', () => {
    expect(standDownKind({ claim: watcherClaim(777), claimHonoured: true, ancestorPid: 777 })).toBe(
      STAND_DOWN_KINDS.RESPONDER,
    )
  })

  it('another session is the responder when the pids differ', () => {
    expect(standDownKind({ claim: watcherClaim(777), claimHonoured: true, ancestorPid: 778 })).toBe(
      STAND_DOWN_KINDS.OTHER_RESPONDER,
    )
    expect(standDownKind({ claim: watcherClaim(777), claimHonoured: true, ancestorPid: null })).toBe(
      STAND_DOWN_KINDS.OTHER_RESPONDER,
    )
  })

  it('an UNHONOURED watcher claim decides nothing — a dead watcher reserves nobody', () => {
    expect(standDownKind({ lock: liveLock, claim: watcherClaim(777), claimHonoured: false, ancestorPid: 777 })).toBe(
      STAND_DOWN_KINDS.LIVE_OWNER,
    )
  })

  it("a USER's claim is never read as a responder's, whatever the pids say", () => {
    expect(standDownKind({ claim: { ...userClaim, responderPid: 777 }, claimHonoured: true, ancestorPid: 777 })).toBe(
      STAND_DOWN_KINDS.RESERVED,
    )
  })

  it('a live owner lock is the ordinary case', () => {
    expect(standDownKind({ lock: liveLock })).toBe(STAND_DOWN_KINDS.LIVE_OWNER)
  })

  it('a claim with NO lock is a reservation, not an owner', () => {
    expect(standDownKind({ lock: null, claim: userClaim, claimHonoured: true })).toBe(STAND_DOWN_KINDS.RESERVED)
  })

  it('neither lock nor claim: a lost race, and it says so', () => {
    expect(standDownKind({})).toBe(STAND_DOWN_KINDS.UNKNOWN)
  })
})

describe('the RESPONDER message — the fix for the silent instruction loss', () => {
  const text = standDownMessage({
    sessionId: 's1',
    lock: null,
    claim: watcherClaim(777),
    claimHonoured: true,
    ancestorPid: 777,
    now,
  }).text

  // THE DEFECT (four-eyes review 29.07.2026, finding 1a): the responder used to
  // get the generic stand-down, whose text forbids editing TASKS.md — the exact
  // duty it was woken for. An instruction from the phone was read, obeyed into
  // silence, and lost.
  it('GRANTS the work-order append the responder was woken for', () => {
    expect(text).toMatch(/append-and-defer/)
    expect(text).toMatch(/END of TASKS\.md on main/)
    expect(text).not.toMatch(/do NOT edit TASKS\.md/)
  })

  it('makes the reply obligatory — it is also the receipt the ack needs', () => {
    expect(text).toContain('chat-reply.mjs')
    expect(text).toMatch(/always answer/)
  })

  it('still forbids everything the batch does', () => {
    expect(text).toMatch(/YOU MAY NOT/)
    for (const forbidden of ['work the queue', 'merge anything', 'run a regression', 'take the batch lock']) {
      expect(text).toContain(forbidden)
    }
  })

  it('keeps it LIGHT: no work order, no design.md, no archive', () => {
    expect(text).toMatch(/Do not read the work order, design\.md or/)
  })

  it('explains why it does not own the lock, instead of implying a fault', () => {
    expect(text).toContain('chat-watcher.mjs')
    expect(text).toMatch(/bounded claim/)
  })

  it('tells it to END rather than idle', () => {
    expect(text).toMatch(/END the session/)
  })

  it('does NOT offer the take-the-batch command — a responder must never claim', () => {
    expect(text).not.toContain('batch-claim.mjs')
  })
})

describe('the other stand-downs stay honest', () => {
  it('the live-owner text is the original one, with the way back', () => {
    const { kind, text } = standDownMessage({ sessionId: 's1', lock: liveLock, now })
    expect(kind).toBe(STAND_DOWN_KINDS.LIVE_OWNER)
    expect(text).toContain('another session OWNS the batch lock (session owner-1, pid 42, heartbeat 2 min ago')
    expect(text).toContain('its liveness check passed')
    expect(text).toContain('STAND DOWN')
    expect(text).toContain('node scripts/batch-claim.mjs --session s1')
  })

  it('the live-owner text still warns about an existing claim', () => {
    const { text } = standDownMessage({ sessionId: 's1', lock: liveLock, claim: userClaim, claimHonoured: true, now })
    expect(text).toContain('session user-window-1 has already claimed the batch')
  })

  // THE SECOND HALF OF finding 1a: with a claim and NO lock on disk, the old
  // text asserted "another session OWNS the batch lock (session unknown, pid
  // unknown, heartbeat 0 min ago) and its liveness check passed" — every clause
  // false, and a session that reads an obviously wrong description of its own
  // situation learns to discount the true parts too.
  it('the RESERVED text no longer claims an owner that does not exist', () => {
    const { text } = standDownMessage({ sessionId: 's1', lock: null, claim: userClaim, claimHonoured: true, now })
    expect(text).toContain('NO session owns the batch lock right now')
    expect(text).toContain('user-window-1')
    expect(text).not.toContain('OWNS the batch lock (session unknown')
    expect(text).not.toContain('liveness check passed')
  })

  it('the UNKNOWN text names the lost acquire rather than inventing an owner', () => {
    const { kind, text } = standDownMessage({ sessionId: 's1', lock: null, now })
    expect(kind).toBe(STAND_DOWN_KINDS.UNKNOWN)
    expect(text).toContain('did NOT succeed here and no owner lock is readable')
    expect(text).not.toContain('liveness check passed')
    expect(text).toContain('node scripts/batch-claim.mjs --session s1')
  })

  it('a bystander beside a responder is told what is actually holding the batch', () => {
    const { kind, text } = standDownMessage({
      sessionId: 's1',
      lock: null,
      claim: watcherClaim(777),
      claimHonoured: true,
      ancestorPid: 999,
      now,
    })
    expect(kind).toBe(STAND_DOWN_KINDS.OTHER_RESPONDER)
    expect(text).toContain('message RESPONDER holds a bounded claim')
    expect(text).toContain('chat-watcher.mjs')
    expect(text).toContain('STAND DOWN')
  })

  it('every non-responder stand-down forbids the batch and offers the way back', () => {
    const cases = [
      { lock: liveLock },
      { lock: null, claim: userClaim, claimHonoured: true },
      { lock: null, claim: watcherClaim(777), claimHonoured: true, ancestorPid: 1 },
      { lock: null },
    ]
    for (const c of cases) {
      const { text } = standDownMessage({ sessionId: 's1', now, ...c })
      expect(text).toContain('do NOT edit TASKS.md or the dashboard')
      expect(text).toContain('node scripts/batch-claim.mjs --session s1')
    }
  })

  it('is total — the empty call still produces a usable message', () => {
    expect(standDownMessage().text.length).toBeGreaterThan(50)
  })

  it('recognises the watcher marker by the shared constant, not a literal', () => {
    expect(watcherClaim(1).by).toBe(CLAIM_BY)
  })
})
