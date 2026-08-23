// The escalation ladder (point 434, remainder of part 1) — the decision core.
// Each case names the incident it would have prevented (docs/batch-resilience.md §8).
import { describe, it, expect } from 'vitest'
import {
  ALERT_GAPS_MS,
  ALERT_PAUSE_RUNG,
  ALERT_PRIORITIES,
  CORRUPTION_ALERT_CLASSES,
  PRIORITY_ORDER,
  higherPriority,
  priorityRank,
  ALERT_RESET_MS,
  advanceLadder,
  alertKey,
  clearLadder,
  continuationDecisionCard,
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

  it('raises a CONDITION’s priority with the rung, so the fourth buzz does not look like the first', () => {
    const first = escalationDecision({ ...at(null), priority: 'default' }).priority
    const top = escalationDecision({ ...at({ rung: ALERT_PAUSE_RUNG, lastSentAt: NOW - ALERT_GAPS_MS[ALERT_PAUSE_RUNG], firstSentAt: NOW - 300 * MIN, sends: 4 }), priority: 'default' }).priority
    expect(first).toBe('default')
    expect(top).toBe('urgent')
  })

  it('never lowers an urgent caller while climbing', () => {
    for (let rung = 0; rung <= ALERT_PAUSE_RUNG; rung++) {
      const entry = rung === 0 ? null : { rung, lastSentAt: NOW - ALERT_GAPS_MS[rung], firstSentAt: NOW - 300 * MIN, sends: rung }
      expect(escalationDecision({ ...at(entry), priority: 'urgent' }).priority).toBe('urgent')
    }
  })

  it('does NOT raise an EVENT’s priority at any rung — it is delivered as the caller declared it', () => {
    for (let rung = 0; rung <= ALERT_PAUSE_RUNG; rung++) {
      const entry = rung === 0
        ? null
        : { rung, lastSentAt: NOW - ALERT_GAPS_MS[rung], firstSentAt: NOW - 300 * MIN, sends: rung }
      expect(escalationDecision({ ...at(entry), priority: 'low', recurring: true }).priority).toBe('low')
    }
  })
})

describe('escalationDecision — only the closed corruption list may PAUSE the batch', () => {
  const topEntry = { rung: ALERT_PAUSE_RUNG, lastSentAt: NOW - ALERT_GAPS_MS[ALERT_PAUSE_RUNG], firstSentAt: NOW - 300 * MIN, sends: ALERT_PAUSE_RUNG }
  const corruption = { ...at(topEntry), title: 'FORBIDDEN MODEL', priority: 'high', alertClass: 'forbidden-serving-model' }

  it.each(CORRUPTION_ALERT_CLASSES)('allows the explicit %s corruption class to pause', (alertClass) => {
    expect(escalationDecision({ ...corruption, alertClass }).action).toBe('pause-and-send')
  })

  it('does not let an urgent but unknown class acquire pause authority', () => {
    const d = escalationDecision({ ...corruption, alertClass: 'new-unsafe-sounding-class', priority: 'urgent' })
    expect(d.action).toBe('continue-and-record')
  })

  it('does NOT re-pause a batch that is already paused', () => {
    // Stand-down: the pause is a state, not an action to repeat.
    const d = escalationDecision({ ...corruption, paused: true })
    expect(d.action).toBe('send')
    expect(d.reason).toMatch(/ALREADY paused/)
  })

  it('falls silent above the last rung — the corruption pause and card now carry the message', () => {
    const d = escalationDecision({ ...corruption, entry: { rung: ALERT_PAUSE_RUNG + 1, lastSentAt: NOW - 10 * MIN, firstSentAt: NOW - 300 * MIN, sends: 5 } })
    expect(d.action).toBe('suppress')
    expect(d.reason).toMatch(/corruption-class alert paused/)
  })

  it('reaches the pause in under four hours of an unanswered condition', () => {
    // A ladder that only pauses after a working day would not have caught the
    // night either.
    const total = ALERT_GAPS_MS.reduce((a, b) => a + b, 0)
    expect(total).toBeLessThanOrEqual(4 * 60 * MIN)
    expect(total).toBeGreaterThanOrEqual(2 * 60 * MIN)
  })

  it('writes the pause reason in the morning reader’s language, naming the alert and the way out', () => {
    const reason = escalationPauseReason('FORBIDDEN MODEL', escalationDecision(corruption), '30.07.2026, 04:00')
    expect(reason).toMatch(/Eskalation/)
    expect(reason).toMatch(/FORBIDDEN MODEL/)
    expect(reason).toMatch(/batch-paused/)
  })
})

describe('escalationDecision — generic stalled and stale alerts continue and record', () => {
  const topEntry = { rung: ALERT_PAUSE_RUNG, lastSentAt: NOW - ALERT_GAPS_MS[ALERT_PAUSE_RUNG], firstSentAt: NOW - 300 * MIN, sends: ALERT_PAUSE_RUNG }
  const generic = { ...at(topEntry), title: 'Batch drive is STALLED', priority: 'urgent', alertClass: 'stalled' }

  it.each(['stalled', 'staleness', 'outage', 'generic'])('never pauses a repeated %s alert', (alertClass) => {
    const d = escalationDecision({ ...generic, alertClass })
    expect(d.action).toBe('continue-and-record')
    expect(d.action).not.toBe('pause-and-send')
  })

  it('cannot return a pause verdict however far a generic alert repeats', () => {
    for (let rung = 0; rung <= ALERT_PAUSE_RUNG + 20; rung++) {
      const entry = rung === 0 ? null : { ...topEntry, rung }
      expect(escalationDecision({ ...generic, entry }).action).not.toBe('pause-and-send')
    }
  })

  it('names the decision card demanded by the continue verdict', () => {
    const d = escalationDecision(generic)
    expect(d.decisionCard).toBe('Entscheidungsprotokoll: Batch läuft weiter — Batch drive is STALLED')
    expect(d.reason).toContain(d.decisionCard)
    expect(continuationDecisionCard('  Board   out of date ')).toBe('Entscheidungsprotokoll: Batch läuft weiter — Board out of date')
  })

  it('advances above the top only after the continue decision is recorded', () => {
    const d = escalationDecision(generic)
    expect(d.nextRung).toBe(ALERT_PAUSE_RUNG + 1)
    const next = escalationDecision({ ...generic, entry: { ...topEntry, rung: d.nextRung } })
    expect(next.action).toBe('suppress')
    expect(next.reason).toMatch(/decision card records/)
  })

  it('priority never grants pause authority', () => {
    for (const p of PRIORITY_ORDER) {
      expect(escalationDecision({ ...generic, priority: p }).action).toBe('continue-and-record')
    }
  })
})

describe('escalationDecision — a recurring EVENT keeps its ceiling', () => {
  const topEntry = {
    rung: ALERT_PAUSE_RUNG,
    lastSentAt: NOW - ALERT_GAPS_MS[ALERT_PAUSE_RUNG],
    firstSentAt: NOW - 300 * MIN,
    sends: ALERT_PAUSE_RUNG,
  }
  const event = { ...at(topEntry), title: 'Resurrected', priority: 'low', recurring: true }

  it('keeps an event alert ON the ceiling rung, so it never falls permanently silent', () => {
    const d = escalationDecision(event)
    expect(d.action).toBe('send')
    expect(d.nextRung).toBe(ALERT_PAUSE_RUNG)
    const next = escalationDecision({ ...event, entry: { ...topEntry, rung: d.nextRung } })
    expect(next.action).toBe('send')
  })

  it('files no continuation decision card for an event-shaped alert', () => {
    const d = escalationDecision(event)
    expect(d.action).toBe('send')
    expect(d.decisionCard).toBeUndefined()
    expect(d.reason).toMatch(/creates no decision card/)
  })

  it('still throttles the event between ceiling sends', () => {
    const d = escalationDecision({ ...event, entry: { ...topEntry, lastSentAt: NOW - MIN } })
    expect(d.action).toBe('suppress')
    expect(d.dueInMs).toBe(ALERT_GAPS_MS[ALERT_PAUSE_RUNG] - MIN)
  })

  it('repairs event state that was already advanced above the ceiling', () => {
    const d = escalationDecision({
      ...event,
      entry: { ...topEntry, rung: ALERT_PAUSE_RUNG + 1 },
    })
    expect(d.action).toBe('send')
    expect(d.rung).toBe(ALERT_PAUSE_RUNG)
    expect(d.nextRung).toBe(ALERT_PAUSE_RUNG)
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
