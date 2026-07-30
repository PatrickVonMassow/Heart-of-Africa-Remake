// The escalation ladder (point 434, remainder of part 1) — the decision core.
// Each case names the incident it would have prevented (docs/batch-resilience.md §8).
import { describe, it, expect } from 'vitest'
import {
  ALERT_GAPS_MS,
  ALERT_PAUSE_RUNG,
  PAUSE_MIN_PRIORITY,
  PRIORITY_ORDER,
  higherPriority,
  priorityRank,
  ALERT_PRIORITIES,
  ALERT_RESET_MS,
  advanceLadder,
  alertKey,
  clearLadder,
  describeEscalation,
  escalationDecision,
  escalationPauseReason,
  ladderEntry,
} from './alert-escalation-core.mjs'

const NOW = Date.UTC(2026, 6, 30, 2, 0, 0)
const MIN = 60 * 1000
const at = (entry) => ({ key: 'k', now: NOW, entry })

describe('alertKey — a rising minute count is the SAME alert', () => {
  it('collapses the watchdog’s changing minute count into one key', () => {
    // Would have prevented: the ladder never leaving rung 0, because every
    // half-hourly watchdog message differs by its "no push for N minutes".
    expect(alertKey('Batch steht', 'kein Push seit 121 Minuten')).toBe(alertKey('Batch steht', 'kein Push seit 151 Minuten'))
  })

  it('keeps genuinely different alerts apart, so CI-red does not ride the watchdog’s ladder', () => {
    // The two share ONE ntfy topic — that is precisely why the ladder must be
    // per-alert and not per-channel.
    expect(alertKey('Batch steht', 'kein Push seit 121 Minuten')).not.toBe(alertKey('CI rot', 'main ist rot'))
  })

  it('ignores case and whitespace noise', () => {
    expect(alertKey('CI  ROT', ' main ist rot ')).toBe(alertKey('ci rot', 'main ist rot'))
  })
})

describe('escalationDecision — the first alert always goes out', () => {
  it('sends immediately when the alert has never been raised', () => {
    const d = escalationDecision(at(null))
    expect(d.action).toBe('send')
    expect(d.rung).toBe(0)
    expect(d.priority).toBe(ALERT_PRIORITIES[0])
  })

  it('sends when the ladder entry is unreadable rather than swallowing the alert', () => {
    // FAIL-OPEN MEANS DELIVER on an alerting path.
    expect(escalationDecision(at(ladderEntry({ alerts: { k: { rung: 'x' } } }, 'k'))).action).toBe('send')
  })
})

describe('escalationDecision — a repeated identical alert backs off', () => {
  it('suppresses the second buzz inside the first gap', () => {
    // THE NIGHT: the watchdog fires every 30 min and would have buzzed
    // identically eight times before morning.
    const d = escalationDecision(at({ rung: 1, lastSentAt: NOW - 5 * MIN, firstSentAt: NOW - 5 * MIN, sends: 1 }))
    expect(d.action).toBe('suppress')
    expect(d.dueInMs).toBe(ALERT_GAPS_MS[1] - 5 * MIN)
  })

  it('sends once the rung’s gap has elapsed, and the gaps rise', () => {
    for (let rung = 1; rung < ALERT_PAUSE_RUNG; rung++) {
      const d = escalationDecision(at({ rung, lastSentAt: NOW - ALERT_GAPS_MS[rung], firstSentAt: NOW - 60 * MIN, sends: rung }))
      expect(d.action).toBe('send')
      expect(d.nextRung).toBe(rung + 1)
    }
    expect(ALERT_GAPS_MS[2]).toBeGreaterThan(ALERT_GAPS_MS[1])
    expect(ALERT_GAPS_MS[3]).toBeGreaterThan(ALERT_GAPS_MS[2])
    expect(ALERT_GAPS_MS[4]).toBeGreaterThan(ALERT_GAPS_MS[3])
  })

  it('raises the priority with the rung, so the fourth buzz does not look like the first', () => {
    const first = escalationDecision(at(null)).priority
    const top = escalationDecision(at({ rung: ALERT_PAUSE_RUNG, lastSentAt: NOW - ALERT_GAPS_MS[ALERT_PAUSE_RUNG], firstSentAt: NOW - 300 * MIN, sends: 4 })).priority
    expect(first).toBe('default')
    expect(top).toBe('urgent')
  })
})

describe('escalationDecision — the last rung PAUSES the batch', () => {
  const topEntry = { rung: ALERT_PAUSE_RUNG, lastSentAt: NOW - ALERT_GAPS_MS[ALERT_PAUSE_RUNG], firstSentAt: NOW - 300 * MIN, sends: ALERT_PAUSE_RUNG }
  // A CONDITION-shaped alert: the watchdog, CI-red and the wedge alerts all
  // post at high/urgent. Only these may reach the pause rung.
  const condition = { ...at(topEntry), priority: 'high' }

  it('pauses instead of buzzing a fifth time', () => {
    // Would have prevented the night of 29./30.07.2026 ending with a stopped
    // batch and a phone that had merely been notified.
    const d = escalationDecision(condition)
    expect(d.action).toBe('pause-and-send')
    expect(d.reason).toMatch(/pauses/)
  })

  it('does NOT re-pause a batch that is already paused', () => {
    // Stand-down: the pause is a state, not an action to repeat.
    const d = escalationDecision({ ...condition, paused: true })
    expect(d.action).toBe('send')
    expect(d.reason).toMatch(/ALREADY paused/)
  })

  it('falls silent above the last rung — the state now carries the message', () => {
    const d = escalationDecision({ ...at({ rung: ALERT_PAUSE_RUNG + 1, lastSentAt: NOW - 10 * MIN, firstSentAt: NOW - 300 * MIN, sends: 5 }), priority: 'high' })
    expect(d.action).toBe('suppress')
    expect(d.reason).toMatch(/board card/)
  })

  it('reaches the pause in under four hours of an unanswered condition', () => {
    // A ladder that only pauses after a working day would not have caught the
    // night either.
    const total = ALERT_GAPS_MS.reduce((a, b) => a + b, 0)
    expect(total).toBeLessThanOrEqual(4 * 60 * MIN)
    expect(total).toBeGreaterThanOrEqual(2 * 60 * MIN)
  })

  it('writes the pause reason in the morning reader’s language, naming the alert and the way out', () => {
    const reason = escalationPauseReason('Batch steht seit 2 Stunden', escalationDecision(condition), '30.07.2026, 04:00')
    expect(reason).toMatch(/Eskalation/)
    expect(reason).toMatch(/Batch steht/)
    expect(reason).toMatch(/batch-paused/)
  })
})

describe('escalationDecision — an EVENT never pauses a healthy batch', () => {
  const topEntry = { rung: ALERT_PAUSE_RUNG, lastSentAt: NOW - ALERT_GAPS_MS[ALERT_PAUSE_RUNG], firstSentAt: NOW - 300 * MIN, sends: ALERT_PAUSE_RUNG }

  it.each(['low', 'default'])('caps a %s-priority recurring event at the top gap instead of pausing', (priority) => {
    // WOULD HAVE PAUSED A HEALTHY BATCH: batch-autostart posts "Resurrected"
    // (priority low) on EVERY successor spawn — the designed healthy flow under
    // the context-boundary policy, several times a night, and identical once
    // digit runs collapse. Simulated at a 45-min point cadence it reached this
    // rung after ~5 hours; the 6-hour reset never fires on a busy night.
    const d = escalationDecision({ ...at(topEntry), priority })
    expect(d.action).toBe('send')
    expect(d.reason).toMatch(/EVENT, not an unanswered condition/)
  })

  it('keeps an event alert ON the ceiling rung, so it never falls permanently silent', () => {
    // The other half of the same bug: throttling a recurring healthy-flow
    // notification into permanent silence would hide the flow entirely.
    const d = escalationDecision({ ...at(topEntry), priority: 'low' })
    expect(d.nextRung).toBe(ALERT_PAUSE_RUNG)
    const next = escalationDecision({ ...at({ ...topEntry, rung: d.nextRung }), priority: 'low' })
    expect(next.action).toBe('send')
  })

  it('still throttles the event between rungs — the ceiling is a gap, not a licence', () => {
    const d = escalationDecision({ ...at({ ...topEntry, lastSentAt: NOW - MIN }), priority: 'low' })
    expect(d.action).toBe('suppress')
  })

  it('reads the CALLER’s priority, not the rung’s raised one', () => {
    // The ladder raises a rung-4 alert to "urgent"; if the gate read THAT, every
    // event alert would pause the batch and the gate would be decorative.
    const d = escalationDecision({ ...at(topEntry), priority: 'low' })
    expect(d.priority).toBe('urgent')
    expect(d.action).toBe('send')
  })

  it('pauses for exactly the priorities at or above the threshold', () => {
    for (const p of PRIORITY_ORDER) {
      const d = escalationDecision({ ...at(topEntry), priority: p })
      const shouldPause = priorityRank(p) >= priorityRank(PAUSE_MIN_PRIORITY)
      expect(d.action).toBe(shouldPause ? 'pause-and-send' : 'send')
    }
  })
})

describe('higherPriority — the ladder raises, never lowers', () => {
  it('keeps an urgent caller urgent on rung 0', () => {
    expect(higherPriority('urgent', 'default')).toBe('urgent')
  })

  it('raises a default caller to the rung’s priority', () => {
    expect(higherPriority('default', 'high')).toBe('high')
  })

  it('tolerates an unknown priority rather than dropping the alert', () => {
    expect(higherPriority('made-up', 'high')).toBe('high')
    expect(higherPriority('high', 'made-up')).toBe('high')
    expect(priorityRank('made-up')).toBe(priorityRank('default'))
  })
})

describe('escalationDecision — the ladder resets when the condition goes away', () => {
  it('starts from the bottom after a long silence', () => {
    const d = escalationDecision(at({ rung: ALERT_PAUSE_RUNG, lastSentAt: NOW - ALERT_RESET_MS - MIN, firstSentAt: NOW - 20 * 60 * MIN, sends: 4 }))
    expect(d.action).toBe('send')
    expect(d.rung).toBe(0)
    expect(d.reset).toBe(true)
  })

  it('does NOT reset while the condition keeps flapping just under the ceiling', () => {
    // Would have prevented: a condition recurring every five hours resetting
    // forever and never reaching the pause.
    const d = escalationDecision(at({ rung: 2, lastSentAt: NOW - ALERT_RESET_MS + MIN, firstSentAt: NOW - 10 * 60 * MIN, sends: 2 }))
    expect(d.reset).toBe(false)
    expect(d.action).toBe('send')
    expect(d.rung).toBe(2)
  })
})

describe('INDEPENDENCE — the ladder acts while the other layers are missing or stale', () => {
  it('decides with NO state at all (nothing else has run on this machine)', () => {
    expect(escalationDecision({ key: 'k', now: NOW }).action).toBe('send')
  })

  it('decides on a corrupt state document instead of throwing', () => {
    expect(ladderEntry({ alerts: 'nonsense' }, 'k')).toBeNull()
    expect(ladderEntry(null, 'k')).toBeNull()
    expect(escalationDecision(at(ladderEntry({ alerts: { k: null } }, 'k'))).action).toBe('send')
  })

  it('is not locked for the length of a clock that jumped backwards', () => {
    // Would have prevented: a lastSentAt ten hours in the future silencing the
    // channel for ten hours — the one failure mode an alerting path must not
    // have. The skew costs at most ONE rung gap, never the skew itself.
    const d = escalationDecision(at({ rung: 1, lastSentAt: NOW + 10 * 60 * MIN, firstSentAt: NOW, sends: 1 }))
    expect(d.action).toBe('suppress')
    expect(d.dueInMs).toBeLessThanOrEqual(ALERT_GAPS_MS[1])
  })

  it('does not need the batch lock, the launcher log or the in-flight declaration', () => {
    // The launcher log ENDED at 02:21 that night. A ladder that needed it would
    // have gone silent with it.
    const d = escalationDecision(at({ rung: 3, lastSentAt: NOW - ALERT_GAPS_MS[3], firstSentAt: NOW - 200 * MIN, sends: 3 }))
    expect(d.action).toBe('send')
  })
})

describe('advanceLadder / clearLadder are pure', () => {
  it('books a send and does not mutate the input', () => {
    const start = { alerts: {} }
    const next = advanceLadder(start, { key: 'k', decision: escalationDecision(at(null)), now: NOW })
    expect(start.alerts).toEqual({})
    expect(next.alerts.k).toEqual({ rung: 1, lastSentAt: NOW, firstSentAt: NOW, sends: 1 })
  })

  it('keeps the first-seen time across rungs, so the pause text can say how long it went on', () => {
    let state = advanceLadder({ alerts: {} }, { key: 'k', decision: escalationDecision(at(null)), now: NOW - 60 * MIN })
    const entry = ladderEntry(state, 'k')
    state = advanceLadder(state, { key: 'k', decision: escalationDecision({ ...at(entry), now: NOW }), now: NOW })
    expect(state.alerts.k.firstSentAt).toBe(NOW - 60 * MIN)
    expect(state.alerts.k.sends).toBe(2)
  })

  it('restarts the counters on a reset', () => {
    const entry = { rung: 3, lastSentAt: NOW - ALERT_RESET_MS - MIN, firstSentAt: NOW - 50 * 60 * MIN, sends: 3 }
    const next = advanceLadder({ alerts: { k: entry } }, { key: 'k', decision: escalationDecision(at(entry)), now: NOW })
    expect(next.alerts.k).toEqual({ rung: 1, lastSentAt: NOW, firstSentAt: NOW, sends: 1 })
  })

  it('drops entries nobody has touched for two reset windows', () => {
    const stale = { alerts: { old: { rung: 2, lastSentAt: NOW - 3 * ALERT_RESET_MS, firstSentAt: 0, sends: 2 } } }
    const next = advanceLadder(stale, { key: 'k', decision: escalationDecision(at(null)), now: NOW })
    expect(next.alerts.old).toBeUndefined()
    expect(next.alerts.k).toBeDefined()
  })

  it('clearLadder forgets one alert and leaves the rest', () => {
    const state = { alerts: { a: { rung: 1, lastSentAt: NOW }, b: { rung: 2, lastSentAt: NOW } } }
    expect(Object.keys(clearLadder(state, 'a').alerts)).toEqual(['b'])
  })

  it('describeEscalation prints the rung movement for the log', () => {
    expect(describeEscalation(escalationDecision(at(null)))).toMatch(/send \(rung 0 → 1, default\)/)
  })
})
