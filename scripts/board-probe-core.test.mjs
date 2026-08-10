// THE FLICKERING REACHABILITY PROBE (point 562) — the verification the point
// names: "pure Vitest over the probe's decision function — an alternating
// failure/success sequence never escalates; N consecutive failures do; a single
// failure followed by a successful retry is not counted; and a fetch failure
// while the currency check still answers is reported as a transport failure, not
// as a stale board."
//
// The last two describe the whole incident of 08.08.2026: the launcher log shows
// `board: unreachable — fetch failed` INTERLEAVED with successful probes of the
// same URL while `board-publish.mjs --check` reported CURRENT, and the escalation
// ladder paused the entire batch on it.
import { describe, it, expect } from 'vitest'
import {
  PROBE_ATTEMPTS,
  PROBE_RETRY_DELAY_MS,
  UNREACHABLE_STREAK,
  classifyBoardProbe,
  describeProbe,
  nextFailureStreak,
  probeResult,
  probeVerdict,
} from './board-probe-core.mjs'
import { watchdogDecision } from './board-currency-core.mjs'
import {
  ALERT_PAUSE_RUNG,
  PAUSE_MIN_PRIORITY,
  escalationDecision,
  priorityRank,
} from './alert-escalation-core.mjs'

const ok = (body = '<html>') => ({ ok: true, body })
const bad = (error = 'fetch failed') => ({ ok: false, error })

/** Run a whole sequence of probe KINDS through the streak arithmetic and report
 *  the verdict of each — the shape the launcher produces tick after tick. */
const run = (kinds, threshold = UNREACHABLE_STREAK) => {
  let streak = 0
  return kinds.map((kind) => {
    streak = nextFailureStreak({ streak, kind })
    return probeVerdict({ kind, streak, threshold, currency: bad(), viewer: bad() }).verdict
  })
}

describe('one probe folds its attempts (rule 2: the retry happens before anything counts)', () => {
  it('a single failure followed by a successful retry is NOT counted', () => {
    const r = probeResult([bad('ENOTFOUND'), ok('<title>x</title>')])
    expect(r.ok).toBe(true)
    expect(r.error).toBeNull()
    expect(r.body).toBe('<title>x</title>')
    // It is still worth a log line — a flicker that had to be retried is news to
    // a reader, it is simply not a fault.
    expect(r.rescued).toBe(true)
    expect(r.errors).toEqual(['ENOTFOUND'])
    // …and it classifies as reachable, which resets the streak outright.
    expect(classifyBoardProbe({ currency: r })).toBe('reachable')
    expect(nextFailureStreak({ streak: 7, kind: 'reachable' })).toBe(0)
  })

  it('a success on the FIRST attempt is not a rescue', () => {
    const r = probeResult([ok()])
    expect(r.ok).toBe(true)
    expect(r.rescued).toBe(false)
  })

  it('only an all-failed probe is a failure, and it keeps the last error', () => {
    const r = probeResult([bad('ECONNRESET'), bad('HTTP 502 Bad Gateway')])
    expect(r.ok).toBe(false)
    expect(r.error).toBe('HTTP 502 Bad Gateway')
    expect(r.rescued).toBe(false)
  })

  it('a probe that never ran is a failure, not a success', () => {
    for (const junk of [[], null, undefined, 'nope', [{}]]) {
      expect(probeResult(junk).ok).toBe(false)
    }
  })

  it('retries at all, briefly — the constants are the mechanism', () => {
    expect(PROBE_ATTEMPTS).toBeGreaterThanOrEqual(2)
    expect(PROBE_RETRY_DELAY_MS).toBeGreaterThan(0)
    expect(PROBE_RETRY_DELAY_MS).toBeLessThan(30_000)
  })
})

describe('the two transports are told apart (rules 1 and 4)', () => {
  it('the currency transport answering makes the probe reachable', () => {
    expect(classifyBoardProbe({ currency: probeResult([ok()]), viewer: null })).toBe('reachable')
  })

  it('a fetch failure while the OTHER transport answers is a transport failure', () => {
    expect(classifyBoardProbe({ currency: probeResult([bad(), bad()]), viewer: probeResult([ok()]) })).toBe('transport')
    // Symmetric: whichever of the two answered, the board is reachable.
    expect(classifyBoardProbe({ currency: probeResult([ok()]), viewer: probeResult([bad(), bad()]) })).toBe('transport')
  })

  it('BOTH failing is what an outage looks like', () => {
    expect(classifyBoardProbe({ currency: probeResult([bad(), bad()]), viewer: probeResult([bad(), bad()]) })).toBe(
      'unreachable',
    )
  })

  it('a junk or missing input never reads as reachable', () => {
    expect(classifyBoardProbe({})).toBe('unreachable')
    expect(classifyBoardProbe()).toBe('unreachable')
    expect(classifyBoardProbe({ currency: 'fine' })).toBe('unreachable')
  })
})

describe('the escalation counts only CONSECUTIVE failures (rule 3)', () => {
  it('an alternating failure/success sequence NEVER escalates', () => {
    const kinds = Array.from({ length: 40 }, (_, i) => (i % 2 === 0 ? 'unreachable' : 'reachable'))
    expect(run(kinds)).not.toContain('unreachable')
    // …and a success arriving as a TRANSPORT failure resets it just as hard:
    // something answered, so the board is not gone.
    expect(run(['unreachable', 'transport', 'unreachable', 'transport', 'unreachable'])).not.toContain('unreachable')
  })

  it('N consecutive failures DO escalate, and not one probe earlier', () => {
    const verdicts = run(Array.from({ length: UNREACHABLE_STREAK + 2 }, () => 'unreachable'))
    expect(verdicts.slice(0, UNREACHABLE_STREAK - 1).every((v) => v === 'flaky')).toBe(true)
    expect(verdicts[UNREACHABLE_STREAK - 1]).toBe('unreachable')
    expect(verdicts[UNREACHABLE_STREAK]).toBe('unreachable')
  })

  it('one success anywhere in the chain sends it back to the bottom', () => {
    const kinds = [...Array(UNREACHABLE_STREAK).fill('unreachable'), 'reachable', 'unreachable']
    const verdicts = run(kinds)
    expect(verdicts[UNREACHABLE_STREAK - 1]).toBe('unreachable')
    expect(verdicts[UNREACHABLE_STREAK + 1]).toBe('flaky')
  })

  it('the streak arithmetic tolerates junk without ever inventing a failure', () => {
    expect(nextFailureStreak()).toBe(0)
    expect(nextFailureStreak({ streak: 'x', kind: 'unreachable' })).toBe(1)
    expect(nextFailureStreak({ streak: -5, kind: 'unreachable' })).toBe(1)
  })
})

describe('the verdict names WHICH of the two happened', () => {
  it('a transport failure says so, and says the board is not stale', () => {
    const v = probeVerdict({
      kind: 'transport',
      streak: 0,
      currency: probeResult([bad('ENOTFOUND raw.githubusercontent.com')]),
      viewer: probeResult([ok()]),
    })
    expect(v.verdict).toBe('transport')
    expect(v.reason).toMatch(/CURRENCY transport/)
    expect(v.reason).toMatch(/ENOTFOUND/)
    expect(v.reason).toMatch(/NOT a stale board/)
  })

  it('…and where the CURRENCY host is the one that failed, it says the currency is UNKNOWN', () => {
    // Four-eyes review of this point. Only the currency host carries the
    // fingerprint, so a tick that could not reach it did not read the board's
    // currency at all. Claiming otherwise would be an alert asserting something
    // untrue — which is the exact sin point 562 was opened on.
    const v = probeVerdict({
      kind: 'transport',
      streak: 0,
      currency: probeResult([bad('ENOTFOUND'), bad('ENOTFOUND')]),
      viewer: probeResult([ok()]),
    })
    expect(v.reason).toMatch(/CURRENCY IS UNKNOWN this tick/)
    expect(v.reason).toMatch(/only the currency host carries the fingerprint/)
    expect(v.reason).toMatch(/reachable/)
    // The claim that would be false here must not appear on this side at all.
    expect(v.reason).not.toMatch(/currency is known/i)
    expect(v.reason).not.toMatch(/DID read the board/)
  })

  it('names the VIEWER when that is the side that blipped, and then the currency WAS read', () => {
    const v = probeVerdict({
      kind: 'transport',
      streak: 0,
      currency: probeResult([ok()]),
      viewer: probeResult([bad('HTTP 503 Service Unavailable')]),
    })
    expect(v.reason).toMatch(/board VIEWER/)
    expect(v.reason).toMatch(/503/)
    // On THIS side the currency really was read, so it may say so — and must not
    // borrow the other side's "unknown".
    expect(v.reason).toMatch(/DID read the board this tick/)
    expect(v.reason).not.toMatch(/UNKNOWN/)
  })

  it('neither side ever claims the board is stale — no content was observed either way', () => {
    for (const [currency, viewer] of [
      [probeResult([bad()]), probeResult([ok()])],
      [probeResult([ok()]), probeResult([bad()])],
    ]) {
      const v = probeVerdict({ kind: 'transport', streak: 0, currency, viewer })
      expect(v.reason).toMatch(/NOT a stale board/)
      expect(v.reason).toMatch(/transport failure/)
    }
  })

  it('a sub-threshold failure explains itself as a flicker, not an outage', () => {
    const v = probeVerdict({ kind: 'unreachable', streak: 1, threshold: 3, currency: bad(), viewer: bad() })
    expect(v.verdict).toBe('flaky')
    expect(v.reason).toMatch(/not an outage/)
    expect(describeProbe(v)).toMatch(/board probe: flaky/)
  })

  it('a reachable probe is a verdict too, and carries no complaint', () => {
    expect(probeVerdict({ kind: 'reachable' })).toEqual({ verdict: 'reachable', streak: 0, reason: '' })
  })
})

// --- What the launcher actually does with these verdicts ----------------------
// The alert assembly lives in `watchdogDecision`; these cases pin the two claims
// the point makes about it, because a verdict nobody acts on differently is no
// distinction at all.
describe('a transport failure can never pause the batch, an outage still can', () => {
  const alert = (verdict, reason) => watchdogDecision({ verdict, reason, state: {}, now: 1_000_000, lastKey: null })

  it('a TRANSPORT failure is reported, under its own title, at a priority the ladder may not pause on', () => {
    const d = alert('transport', 'the CURRENCY transport could not be fetched, while the viewer answered')
    expect(d.notify).toBe(true)
    expect(d.title).toBe('Board transport hiccup')
    expect(d.message).toMatch(/not stale/)
    // THE MECHANISM: the escalation ladder's pause rung is gated on the CALLER's
    // priority (PAUSE_MIN_PRIORITY), so an alert raised below it is an EVENT that
    // throttles for ever and never pauses. That is what makes rule 4 hold.
    expect(priorityRank(d.priority)).toBeLessThan(priorityRank(PAUSE_MIN_PRIORITY))
    const top = escalationDecision({
      key: 'k',
      now: 10_000_000,
      entry: { rung: ALERT_PAUSE_RUNG, lastSentAt: 0, firstSentAt: 0, sends: 5 },
      priority: d.priority,
    })
    expect(top.action).toBe('send')
    expect(top.action).not.toBe('pause-and-send')
  })

  it('a genuinely UNREACHABLE board still climbs all the way to the pause', () => {
    const d = alert('unreachable', 'neither the currency transport nor the viewer answered, for 2 consecutive probes')
    expect(d.notify).toBe(true)
    expect(d.title).toBe('Board unreachable')
    expect(priorityRank(d.priority)).toBeGreaterThanOrEqual(priorityRank(PAUSE_MIN_PRIORITY))
    const top = escalationDecision({
      key: 'k',
      now: 10_000_000,
      entry: { rung: ALERT_PAUSE_RUNG, lastSentAt: 0, firstSentAt: 0, sends: 5 },
      priority: d.priority,
    })
    expect(top.action).toBe('pause-and-send')
  })

  it('a FLAKY probe wakes nobody at all', () => {
    const d = alert('flaky', 'failure 1 of the 2 consecutive ones a report needs')
    expect(d.notify).toBe(false)
    expect(d.key).toBeNull()
  })

  it('the two claims never share a ladder key — one cannot inherit the other\'s rung', () => {
    const t = alert('transport', 'x')
    const u = alert('unreachable', 'x')
    expect(t.key).not.toBe(u.key)
  })

  it('a wedged publish is still reported THROUGH a flaky probe — the board layers are independent', () => {
    const d = watchdogDecision({
      verdict: 'flaky',
      reason: 'one flicker',
      state: { publishDue: { at: 1000 } },
      now: 60 * 60 * 1000,
      lastKey: null,
    })
    expect(d.notify).toBe(true)
    expect(d.title).toBe('Board publish outstanding')
  })
})
