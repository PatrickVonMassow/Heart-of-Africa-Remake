// Point 749: the machine's own status reports are DERIVED state, never a
// question put to the user. These cases pin what is derived, and — the half the
// user actually complained about three times — what stops being derived when the
// condition behind it is gone.
import { describe, expect, it } from 'vitest'

import { ALERT_RESET_MS } from './alert-escalation-core.mjs'
import {
  AUTOMATIC_DECISION_TITLE,
  MAX_STATE_PARAGRAPHS,
  PAUSED_TITLE,
  decisionParagraphs,
  deriveStateCard,
  pauseParagraph,
  recoveryParagraphs,
} from './board-state-core.mjs'

const NOW = Date.UTC(2026, 7, 25, 12, 0, 0)
const measurement = {
  key: 'batch-doctor-gate',
  label: 'node scripts/batch-doctor.mjs --gate',
}

describe('pauseParagraph', () => {
  it('names the reason and the retry clock that will clear it', () => {
    const text = pauseParagraph({ reason: 'Umgebungsausfall: npm nicht erreichbar.', retryAfter: NOW + 15 * 60000 })
    expect(text).toContain('Umgebungsausfall: npm nicht erreichbar.')
    expect(text).toMatch(/Nächster Versuch 25\.08\.2026, 14:15/)
  })

  it('says who owns the halt when there is no clock', () => {
    expect(pauseParagraph({ reason: 'Du hast gestoppt.', cause: 'user-stop' })).toContain('Der Halt kam von dir')
    expect(pauseParagraph({ reason: 'Alarm blieb unbeantwortet.' })).toContain('die laufende Sitzung diagnostiziert')
  })

  it('is nothing at all when nothing is paused', () => {
    expect(pauseParagraph(null)).toBeNull()
  })
})

describe('decisionParagraphs — the continuation and corruption records', () => {
  const ladder = (record) => ({ alerts: { 'k-1': { rung: 4, lastSentAt: NOW - 60000, record } } })

  it('reports a record the batch wrote for itself', () => {
    const out = decisionParagraphs(ladder({ at: NOW - 60000, body: 'Der Batch läuft weiter, weil …' }), { now: NOW })
    expect(out).toEqual(['Der Batch läuft weiter, weil …'])
  })

  it('keeps an old record standing until its named measurement settles it', () => {
    const old = ladder({ at: NOW - 48 * 3600 * 1000, body: 'Alte Entscheidung.', measurement })
    expect(decisionParagraphs(old, { now: NOW })).toEqual(['Alte Entscheidung.'])
  })

  it('applies the ladder staleness floor only to records without a measurement', () => {
    const record = { at: NOW - 48 * 3600 * 1000, body: 'Automatische Entscheidung.' }
    const alert = (age, decision = record) => ({
      alerts: { k: { rung: 4, lastSentAt: NOW - age, record: decision } },
    })

    expect(decisionParagraphs(alert(2 * ALERT_RESET_MS + 1), { now: NOW })).toEqual([])
    expect(decisionParagraphs(alert(2 * ALERT_RESET_MS + 1, { ...record, measurement: {} }), { now: NOW })).toEqual([])
    expect(decisionParagraphs(alert(11 * 3600 * 1000), { now: NOW })).toEqual(['Automatische Entscheidung.'])
    expect(decisionParagraphs(alert(3 * ALERT_RESET_MS, { ...record, measurement }), { now: NOW })).toEqual([
      'Automatische Entscheidung.',
    ])
  })

  it('keeps a decision whose named measurement has not been taken', () => {
    const pending = ladder({ at: NOW - 60000, body: 'Parallel decision.', measurement })
    expect(deriveStateCard({ ladder: pending, doctorState: {}, now: NOW })?.body).toBe('Parallel decision.')
  })

  it('expires the same decision after a newer clean measurement without deleting its trace', () => {
    const record = { at: NOW - 60000, body: 'Parallel decision.', measurement }
    const decided = ladder(record)
    const doctorState = {
      measurements: {
        'batch-doctor-gate': {
          lastRunAt: NOW,
          lastVerdict: 'clean',
          cleanAt: NOW,
          cleanDetail: 'repo state CONSISTENT; every fast gate passed',
        },
      },
    }
    expect(deriveStateCard({ ladder: decided, doctorState, now: NOW })).toBeNull()
    expect(decided.alerts['k-1'].record).toBe(record)
    expect(doctorState.measurements['batch-doctor-gate'].cleanDetail).toMatch(/CONSISTENT/)
  })

  it('keeps the decision standing when its measurement came back dirty', () => {
    const pending = ladder({ at: NOW - 60000, body: 'Parallel decision.', measurement })
    const doctorState = {
      measurements: {
        'batch-doctor-gate': { lastRunAt: NOW, lastVerdict: 'dirty', lastDetail: 'lint failed' },
      },
    }
    expect(deriveStateCard({ ladder: pending, doctorState, now: NOW })?.body).toBe('Parallel decision.')
  })

  it('expires the already-on-disk PARALLEL record from the legacy doctor proof', () => {
    const decided = ladder({
      at: NOW - 60000,
      title: 'Entscheidungsprotokoll: Batch läuft weiter — PARALLEL batch sessions',
      body: 'Automatische Entscheidung: Der Batch läuft weiter.',
    })
    const doctorState = { handledAt: NOW, satisfiedGate: 'abc123|other-session' }
    expect(deriveStateCard({ ladder: decided, doctorState, now: NOW })).toBeNull()
  })

  it('reports nothing for an alert that carries no record, and never throws on junk', () => {
    expect(decisionParagraphs({ alerts: { k: { rung: 1, lastSentAt: NOW } } }, { now: NOW })).toEqual([])
    expect(decisionParagraphs(null, { now: NOW })).toEqual([])
    expect(decisionParagraphs({ alerts: 'nonsense' }, { now: NOW })).toEqual([])
  })
})

describe('recoveryParagraphs — a scheduled child recovery', () => {
  const state = (nextAttemptAt) => ({
    points: { 749: { recovery: { action: 'Austausch', nextAttemptAt, decisionRecord: { body: 'Kind starb an einem Umgebungsfehler.' } } } },
  })

  it('names the point, the action and the clock while the attempt is still ahead', () => {
    const [text] = recoveryParagraphs(state(NOW + 20 * 60000), { now: NOW })
    expect(text).toContain('Punkt 749')
    expect(text).toContain('Austausch')
    expect(text).toContain('Kind starb an einem Umgebungsfehler.')
  })

  it('says nothing once the clock has run out', () => {
    expect(recoveryParagraphs(state(NOW - 1), { now: NOW })).toEqual([])
  })
})

describe('deriveStateCard', () => {
  it('is NULL when the batch has nothing to report — so no card is rendered at all', () => {
    expect(deriveStateCard({ now: NOW })).toBeNull()
    expect(deriveStateCard({ pause: null, ladder: { alerts: {} }, retryState: { points: {} }, now: NOW })).toBeNull()
  })

  it('is titled by the strongest state standing', () => {
    const paused = deriveStateCard({ pause: { reason: 'Ausfall.' }, now: NOW })
    expect(paused.title).toBe(PAUSED_TITLE)
    const recorded = deriveStateCard({
      ladder: { alerts: { k: { lastSentAt: NOW, record: { at: NOW, body: 'Weitergelaufen.' } } } },
      now: NOW,
    })
    expect(recorded.title).toBe(AUTOMATIC_DECISION_TITLE)
  })

  it('stays compact: the board never carries more than the capped paragraphs', () => {
    const alerts = {}
    for (let i = 0; i < 6; i += 1) alerts[`k-${i}`] = { lastSentAt: NOW - i, record: { at: NOW - i, body: `Record ${i}.` } }
    const card = deriveStateCard({ pause: { reason: 'Ausfall.' }, ladder: { alerts }, now: NOW })
    expect(card.body.split('\n\n')).toHaveLength(MAX_STATE_PARAGRAPHS)
  })

  it('carries the pause first, because it is what stops the work', () => {
    const card = deriveStateCard({
      pause: { reason: 'Umgebungsausfall.' },
      ladder: { alerts: { k: { lastSentAt: NOW, record: { at: NOW, body: 'Weitergelaufen.' } } } },
      now: NOW,
    })
    expect(card.body.indexOf('Umgebungsausfall.')).toBeLessThan(card.body.indexOf('Weitergelaufen.'))
  })
})
