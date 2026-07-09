// Store deadline & successor transitions (CLAUDE.md §7.1 pt. 24, design.md
// §5/§18). Ports the store-driven asserts of expedition.mjs (deadline sanity,
// the two staged warnings firing exactly once each, deadline expiry losing the
// run, and the death → successor takeover with day penalty, inherited warning
// stage and takeover entry) into fast jsdom checks. The defeat-overlay DOM
// assert (the "recalled" text and the missing successor button) stays in the
// Playwright E2E.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { balance } from '../config/balance'
import { g, freshGame, withWorld, COORD } from '../test/store'

withWorld()

beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false // deterministic: no hidden per-day rolls
})
afterEach(() => {
  balance.randomEventsEnabled = true
  vi.restoreAllMocks()
})

const journalKeys = () => g().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text))
const count = (key: string) => journalKeys().filter((k) => k === key).length

describe('deadline configuration (design.md §5)', () => {
  it('is a multi-year deadline with two ordered staged warnings', () => {
    const dl = balance.deadline
    expect(dl.days).toBeGreaterThan(1000)
    expect(dl.warning1).toBeLessThan(dl.warning2)
    expect(dl.warning2).toBeLessThan(1)
  })
})

describe('staged deadline warnings (design.md §5)', () => {
  it('fires the first warning once at 60 % and the final one once at 85 %', () => {
    const dl = balance.deadline
    expect(count('journal.deadline1')).toBe(0)

    // 60 % of the granted time reached → first warning, exactly once.
    g().tickDeadline(dl.days * dl.warning1)
    expect(count('journal.deadline1')).toBe(1)
    expect(g().deadlineWarned).toBe(1)
    expect(count('journal.deadline2')).toBe(0)

    // Ticking again past 60 % but below 85 % must not repeat it.
    g().tickDeadline(dl.days * dl.warning1 + 1)
    expect(count('journal.deadline1')).toBe(1)

    // 85 % reached → final warning, exactly once.
    g().tickDeadline(dl.days * dl.warning2)
    expect(count('journal.deadline2')).toBe(1)
    expect(g().deadlineWarned).toBe(2)

    g().tickDeadline(dl.days * dl.warning2 + 1)
    expect(count('journal.deadline2')).toBe(1)
  })
})

describe('deadline expiry (design.md §5)', () => {
  it('loses the expedition when the granted time runs out', () => {
    const dl = balance.deadline
    expect(g().defeat).toBeNull()

    g().tickDeadline(dl.days)
    expect(g().defeat).toBe('deadline')
    expect(g().journalOpen).toBe(false)

    // No successor is offered for a deadline recall. The overlay's missing
    // successor button (DOM) stays in the Playwright E2E; here the store side
    // is that a fresh expiry has no checkpoint to resume from.
    expect(g().successorTakeOver()).toBe(false)
  })
})

describe('death → successor takeover (design.md §18)', () => {
  // Enter Cairo to lay down a checkpoint, leave, then drain the health pool to
  // zero with severe wounds so the predecessor dies in the field.
  const layCheckpointAndDie = (checkpointDay: number): number => {
    g().debugSet({ day: checkpointDay })
    g().enterPlace('cairo') // a port entry saves the checkpoint
    const saved = g().day
    g().leavePlace()
    g().debugSet({ health: 2 })
    g().debugSetAffliction('wounds', 2)
    // Severe-wound drain over several days empties the pool → death.
    g().tickHealth(5, 'savanna', COORD.savanna[0], COORD.savanna[1])
    return saved
  }

  it('resumes from the last checkpoint, loses the penalty days and writes a takeover entry', () => {
    const checkpointDay = layCheckpointAndDie(100)
    expect(g().defeat).toBe('death')

    const took = g().successorTakeOver()
    expect(took).toBe(true)
    expect(g().defeat).toBeNull()
    // The takeover costs the configured penalty days off the checkpoint date.
    expect(g().day).toBeCloseTo(checkpointDay + balance.deadline.successorDayPenalty, 2)
    expect(journalKeys()).toContain('journal.successor')
  })

  it('silently inherits an already-passed warning stage on takeover', () => {
    const dl = balance.deadline
    // A checkpoint past the 85 % mark, still short of expiry after the penalty.
    const checkpointDay = Math.floor(dl.days * dl.warning2) + 10
    const saved = layCheckpointAndDie(checkpointDay)
    expect(g().defeat).toBe('death')
    // The checkpoint carried no warnings yet.
    const before1 = count('journal.deadline1')
    const before2 = count('journal.deadline2')

    expect(g().successorTakeOver()).toBe(true)
    expect(saved + dl.successorDayPenalty).toBeGreaterThanOrEqual(dl.days * dl.warning2)
    // Both staged warnings count as passed, but neither is re-announced.
    expect(g().deadlineWarned).toBe(2)
    expect(count('journal.deadline1')).toBe(before1)
    expect(count('journal.deadline2')).toBe(before2)
  })
})
