// The in-turn board heartbeat's rules (point 848). Pure: no board, no clock, no
// filesystem — every case states its own inputs.
import { describe, it, expect } from 'vitest'
import {
  decideHeartbeat,
  heartbeatStatus,
  REASONS,
  cardAge,
  STALE_AFTER_MS,
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

  it('ages the card by CONTENT, and answers UNKNOWN where it has never looked', () => {
    const NOW = 1_700_000_000_000
    // Never looked: the age is unprovable, and the caller must read that as stale.
    const first = cardAge({ record: null, digest: 'a', now: NOW })
    expect(first.ageMs).toBeNull()
    expect(first.remember).toEqual({ digest: 'a', seenAt: NOW })

    // Unchanged since it was recorded: the age is exactly that span.
    const stood = cardAge({ record: { digest: 'a', seenAt: NOW - 90_000 }, digest: 'a', now: NOW })
    expect(stood.ageMs).toBe(90_000)
    expect(stood.remember).toBeNull()

    // Somebody rewrote the card between the last look and now, so the span since
    // that look BOUNDS its age — it is not proof the card is brand new.
    const rewritten = cardAge({ record: { digest: 'a', seenAt: NOW - 90_000 }, digest: 'b', now: NOW })
    expect(rewritten.ageMs).toBe(90_000)
    expect(rewritten.remember).toEqual({ digest: 'b', seenAt: NOW })

    // THE DEFECT AN AGE OF ZERO HAD (third cross-vendor round, 24.08.2026): a
    // card last looked at a day ago and rewritten some unknown time since is not
    // fresh, and must not suppress a refresh for another ten minutes.
    const longAgo = cardAge({ record: { digest: 'a', seenAt: NOW - 24 * 3_600_000 }, digest: 'b', now: NOW })
    expect(longAgo.ageMs).toBe(24 * 3_600_000)
    expect(
      decideHeartbeat({
        focus: FOCUS,
        cardPoint: 847,
        ageMs: longAgo.ageMs,
        trigger: TRIGGERS.REVIEW_ROUND,
        detail: 'x',
      }).reason,
    ).toBe(REASONS.STALE)

    // …while a recent look bounds it tightly, so no storm follows an ordinary edit.
    expect(cardAge({ record: { digest: 'a', seenAt: NOW - 1_000 }, digest: 'b', now: NOW }).ageMs).toBe(1_000)

    // A malformed record is ignorance, not evidence.
    expect(cardAge({ record: { digest: 'a' }, digest: 'a', now: NOW }).ageMs).toBeNull()
  })

  it('a card untouched for a full day never reads as fresh again', () => {
    // THE DEFECT A TIME-ONLY STAMP HAD (cross-vendor review, 24.08.2026, second
    // round): aged modulo a day, a card stamped 04:15 and untouched for 24 h read
    // as freshly stamped for ten minutes. An epoch record cannot wrap.
    const NOW = 1_700_000_000_000
    const day = cardAge({ record: { digest: 'a', seenAt: NOW - 24 * 3_600_000 }, digest: 'a', now: NOW })
    expect(day.ageMs).toBe(24 * 3_600_000)
    expect(
      decideHeartbeat({
        focus: FOCUS,
        cardPoint: 847,
        ageMs: day.ageMs,
        trigger: TRIGGERS.REVIEW_ROUND,
        detail: 'x',
      }).reason,
    ).toBe(REASONS.STALE)
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
