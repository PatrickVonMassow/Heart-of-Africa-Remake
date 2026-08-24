// The in-turn board heartbeat's rules (point 848). Pure: no board, no clock, no
// filesystem — every case states its own inputs.
import { describe, it, expect } from 'vitest'
import {
  decideHeartbeat,
  heartbeatStatus,
  REASONS,
  STALE_AFTER_MS,
  stampAgeMs,
  stampMinutes,
  TRIGGERS,
} from './board-heartbeat-core.mjs'

const FOCUS = { point: 847, note: 'Sol-Prüfrunden zu Punkt 847' }

describe('the in-turn heartbeat refreshes a stale now-card', () => {
  // THE MEASURED FAILURE, one case per trigger: a long turn keeps recording, the
  // card stands still, and the board shows finished work while review rounds run.
  for (const [name, trigger] of Object.entries(TRIGGERS)) {
    it(`${name}: a stale card is refreshed, and the status carries the round's news`, () => {
      const decision = decideHeartbeat({
        focus: FOCUS,
        cardPoint: 847,
        ageMs: STALE_AFTER_MS + 1,
        trigger,
        detail: 'Runde 3 abgeschlossen (do-not-merge)',
      })
      expect(decision.refresh).toBe(true)
      expect(decision.reason).toBe(REASONS.STALE)
      // The page must say BOTH what the session is doing and what just landed.
      expect(decision.status).toBe('Sol-Prüfrunden zu Punkt 847 · Runde 3 abgeschlossen (do-not-merge)')
    })

    it(`${name}: a CURRENT card is left untouched — no publish storm`, () => {
      const decision = decideHeartbeat({
        focus: FOCUS,
        cardPoint: 847,
        ageMs: 1_000,
        trigger,
        detail: 'Runde 4 abgeschlossen',
      })
      expect(decision.refresh).toBe(false)
      expect(decision.reason).toBe(REASONS.CURRENT)
      expect(decision.status).toBeNull()
    })
  }

  it('the boundary is exclusive: exactly at the threshold the card is already stale', () => {
    const at = (ageMs) =>
      decideHeartbeat({
        focus: FOCUS,
        cardPoint: 847,
        ageMs,
        trigger: TRIGGERS.REVIEW_ROUND,
        detail: 'x',
      }).refresh
    expect(at(STALE_AFTER_MS - 1)).toBe(false)
    expect(at(STALE_AFTER_MS)).toBe(true)
  })
})

describe('what the heartbeat refuses to do', () => {
  it('does not restamp a card whose point disagrees with the declared focus', () => {
    // Reconciling that is the Stop guard's job. A heartbeat writing a fresh
    // status onto the wrong card would hide the very mismatch it must not.
    const decision = decideHeartbeat({
      focus: FOCUS,
      cardPoint: 720,
      ageMs: STALE_AFTER_MS + 1,
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 3',
    })
    expect(decision.refresh).toBe(false)
    expect(decision.reason).toBe(REASONS.CARD_MISMATCH)
  })

  it('says nothing while no focus is declared', () => {
    const decision = decideHeartbeat({
      focus: null,
      cardPoint: 847,
      ageMs: STALE_AFTER_MS + 1,
      trigger: TRIGGERS.IN_FLIGHT,
      detail: 'Suite läuft',
    })
    expect(decision.refresh).toBe(false)
    expect(decision.reason).toBe(REASONS.NO_FOCUS)
  })

  it('ignores an unrecognised trigger instead of guessing at one', () => {
    const decision = decideHeartbeat({
      focus: FOCUS,
      cardPoint: 847,
      ageMs: STALE_AFTER_MS + 1,
      trigger: 'timer',
      detail: 'tick',
    })
    expect(decision.refresh).toBe(false)
    expect(decision.reason).toBe(REASONS.UNKNOWN_TRIGGER)
  })

  it('a non-point focus still carries the board — it is work like any other', () => {
    const decision = decideHeartbeat({
      focus: { point: null, note: 'Abschluss vorbereiten' },
      cardPoint: null,
      ageMs: STALE_AFTER_MS + 1,
      trigger: TRIGGERS.MECHANISM_RECORD,
      detail: 'Prüfung aufgezeichnet',
    })
    expect(decision.refresh).toBe(true)
    expect(decision.status).toBe('Abschluss vorbereiten · Prüfung aufgezeichnet')
  })
})

describe('currency that cannot be proven is not currency', () => {
  it('refreshes when nothing ever recorded a stamp', () => {
    const decision = decideHeartbeat({
      focus: FOCUS,
      cardPoint: 847,
      ageMs: null,
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 1',
    })
    expect(decision.refresh).toBe(true)
    expect(decision.reason).toBe(REASONS.NEVER_STAMPED)
  })

  it('refreshes on a negative age rather than reading it as very fresh', () => {
    const decision = decideHeartbeat({
      focus: FOCUS,
      cardPoint: 847,
      ageMs: -60_000,
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 1',
    })
    expect(decision.refresh).toBe(true)
    expect(decision.reason).toBe(REASONS.NEVER_STAMPED)
  })

  it('reads the card stamp, and wraps a stamp ahead of the clock to yesterday', () => {
    expect(stampMinutes('04:15')).toBe(255)
    expect(stampMinutes('Stand 23:59')).toBe(1439)
    expect(stampMinutes('nonsense')).toBeNull()
    expect(stampMinutes('99:99')).toBeNull()
    // 05:15 now, stamped 04:15 → one hour.
    expect(stampAgeMs(255, 315)).toBe(60 * 60_000)
    // 00:10 now, stamped 23:50 → twenty minutes, not minus 23 hours.
    expect(stampAgeMs(1430, 10)).toBe(20 * 60_000)
    expect(stampAgeMs(null, 10)).toBeNull()
  })
})

describe('the status line', () => {
  it('joins focus and detail, and survives either being absent', () => {
    expect(heartbeatStatus({ note: 'A', detail: 'B' })).toBe('A · B')
    expect(heartbeatStatus({ note: 'A', detail: '' })).toBe('A')
    expect(heartbeatStatus({ note: '', detail: 'B' })).toBe('B')
    expect(heartbeatStatus({})).toBe('')
  })
})
