// The in-turn board heartbeat's rules (point 848). Pure: no board, no clock, no
// filesystem — every case states its own inputs.
import { describe, it, expect } from 'vitest'
import {
  decideHeartbeat,
  heartbeatStatus,
  REASONS,
  STALE_AFTER_MS,
  TRIGGERS,
} from './board-heartbeat-core.mjs'

const FOCUS = { point: 847, note: 'Sol-Prüfrunden zu Punkt 847' }
const NOW = 1_700_000_000_000

describe('the in-turn heartbeat refreshes a stale now-card', () => {
  // THE MEASURED FAILURE, one case per trigger: a long turn keeps recording, the
  // card stands still, and the board shows finished work while review rounds run.
  for (const [name, trigger] of Object.entries(TRIGGERS)) {
    it(`${name}: a stale card is refreshed, and the status carries the round's news`, () => {
      const decision = decideHeartbeat({
        focus: FOCUS,
        cardPoint: 847,
        statusAt: NOW - STALE_AFTER_MS - 1,
        now: NOW,
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
        statusAt: NOW - 1_000,
        now: NOW,
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
        statusAt: NOW - ageMs,
        now: NOW,
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
      statusAt: NOW - STALE_AFTER_MS - 1,
      now: NOW,
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
      statusAt: NOW - STALE_AFTER_MS - 1,
      now: NOW,
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
      statusAt: NOW - STALE_AFTER_MS - 1,
      now: NOW,
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
      statusAt: NOW - STALE_AFTER_MS - 1,
      now: NOW,
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
      statusAt: null,
      now: NOW,
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 1',
    })
    expect(decision.refresh).toBe(true)
    expect(decision.reason).toBe(REASONS.NEVER_STAMPED)
  })

  it('refreshes when the clock went backwards, rather than reading it as fresh', () => {
    // A backwards clock would otherwise park the card as "current" indefinitely.
    const decision = decideHeartbeat({
      focus: FOCUS,
      cardPoint: 847,
      statusAt: NOW + 60_000,
      now: NOW,
      trigger: TRIGGERS.REVIEW_ROUND,
      detail: 'Runde 1',
    })
    expect(decision.refresh).toBe(true)
    expect(decision.reason).toBe(REASONS.NEVER_STAMPED)
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
