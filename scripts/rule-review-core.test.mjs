import { describe, it, expect } from 'vitest'
import {
  REVIEW_INTERVAL_DAYS,
  GROWTH_BUDGET,
  AXES,
  HIGH_FREQUENCY_FIRST,
  evaluateRuleReview,
  formatReviewDemand,
  isSubstantialEvidence,
} from './rule-review-core.mjs'

const DAY = 86_400_000
const NOW = 1_800_000_000_000
const fresh = { now: NOW, lastReviewedAt: NOW - DAY, entryCount: 90, reviewedCount: 88 }

describe('evaluateRuleReview', () => {
  it('allows a recently reviewed, barely grown corpus', () => {
    expect(evaluateRuleReview(fresh)).toBeNull()
  })

  it('demands a review when the interval has elapsed', () => {
    const v = evaluateRuleReview({ ...fresh, lastReviewedAt: NOW - REVIEW_INTERVAL_DAYS * DAY })
    expect(v?.decision).toBe('block')
    expect(v.reason).toContain('Tage zurück')
  })

  it('allows one day short of the interval — the boundary is exact', () => {
    expect(evaluateRuleReview({ ...fresh, lastReviewedAt: NOW - (REVIEW_INTERVAL_DAYS - 1) * DAY - 1 })).toBeNull()
  })

  it('demands a review on GROWTH alone, well inside the interval', () => {
    const v = evaluateRuleReview({ ...fresh, entryCount: 88 + GROWTH_BUDGET, reviewedCount: 88 })
    expect(v?.decision).toBe('block')
    expect(v.reason).toContain('gewachsen')
  })

  it('allows one entry short of the growth budget', () => {
    expect(evaluateRuleReview({ ...fresh, entryCount: 88 + GROWTH_BUDGET - 1, reviewedCount: 88 })).toBeNull()
  })

  it('does not fire on a SHRINKING corpus — retiring rules is the cure, not the disease', () => {
    expect(evaluateRuleReview({ ...fresh, entryCount: 40, reviewedCount: 88 })).toBeNull()
  })

  it('demands the first review when none was ever recorded', () => {
    const v = evaluateRuleReview({ ...fresh, lastReviewedAt: null })
    expect(v?.decision).toBe('block')
    expect(v.reason).toContain('NIE')
  })

  it('stands down while the batch is paused', () => {
    expect(evaluateRuleReview({ ...fresh, lastReviewedAt: null, paused: true })).toBeNull()
  })

  it('defers an owed review after the context fence closes', () => {
    const v = evaluateRuleReview({
      ...fresh,
      lastReviewedAt: null,
      sessionId: 'closing-owner',
      fence: { closed: true, successor: 'the successor session' },
    })
    expect(v).toMatchObject({ decision: 'defer', deferred: true })
    expect(v.reason).toContain('successor session')
    expect(v.reason).toContain('batch-boundary.mjs --clear')
  })

  it('demands that same review from the successor\'s first turn', () => {
    const v = evaluateRuleReview({
      ...fresh,
      lastReviewedAt: null,
      sessionId: 'successor-1',
      fence: { closed: false },
    })
    expect(v?.decision).toBe('block')
    expect(v.reason).toContain('successor-1')
  })

  it('errs toward allowing on unusable input rather than trapping the session', () => {
    expect(evaluateRuleReview(null)).toBeNull()
    expect(evaluateRuleReview({})).toBeNull()
    expect(evaluateRuleReview({ now: NaN, lastReviewedAt: null })).toBeNull()
    // Uncountable corpus: time is still authoritative, growth simply is not checked.
    expect(evaluateRuleReview({ ...fresh, entryCount: null, reviewedCount: null })).toBeNull()
    expect(() => evaluateRuleReview({ now: NOW, lastReviewedAt: 'gestern' })).not.toThrow()
  })
})

describe('formatReviewDemand', () => {
  const msg = formatReviewDemand('Testgrund.')

  it('carries all six axes, so the review is not improvised each time', () => {
    for (const a of AXES) expect(msg).toContain(a)
  })

  it('orders the review by channel frequency, loudest first', () => {
    expect(msg.indexOf(HIGH_FREQUENCY_FIRST[0])).toBeLessThan(msg.indexOf(HIGH_FREQUENCY_FIRST[4]))
  })

  it('insists on checking against the CODE, not neighbouring prose', () => {
    expect(msg).toMatch(/gegen den CODE/)
    expect(msg).toMatch(/INNERHALB einer Datei/)
  })

  it('names the exact attestation command', () => {
    expect(msg).toContain('node scripts/rule-review.mjs --reviewed --evidence')
  })
})

describe('isSubstantialEvidence', () => {
  it('rejects a rubber stamp', () => {
    for (const t of ['', null, 'ok', 'erledigt', 'alles geprüft']) {
      expect(isSubstantialEvidence(t)).toBe(false)
    }
  })

  it('accepts a receipt that names what was checked, found and changed', () => {
    expect(
      isSubstantialEvidence(
        'Alle 63 Memories und 27 Wächter durchgesehen; Release-Verfahren zusammengeführt, zwei Regeln zurückgezogen.',
      ),
    ).toBe(true)
  })
})
