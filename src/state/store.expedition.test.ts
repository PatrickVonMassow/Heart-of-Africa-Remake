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
import { useGame } from './store'
import { START_YEAR } from '../config/balance'
import { clampDay, lastDay } from '../systems/season'

withWorld()

beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false // deterministic: no hidden per-day rolls
  // The deadline is SUSPENDED in the shipped config (design.md §5.1: the date
  // stops at 31.12.1895 instead of the run ending). These tests are the spec
  // of the mechanism itself, so they enable it — and prove it still works the
  // day the suspension is lifted.
  balance.deadline.enabled = true
})
afterEach(() => {
  balance.randomEventsEnabled = true
  balance.deadline.enabled = false
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

describe('the suspended deadline and the calendar ceiling (design.md §5.1)', () => {
  it('ships SUSPENDED: the shipped config does not end the expedition on time', () => {
    // The tests above flip it on; this one asserts the state the game ships in.
    balance.deadline.enabled = false
    g().tickDeadline(balance.deadline.days + 500)
    expect(g().defeat).toBeNull()
    expect(g().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text)))
      .not.toContain('journal.deadline2')
  })

  it('stops the calendar at 31.12.1895 instead — travelling cannot pass it', () => {
    const last = lastDay(START_YEAR)
    useGame.setState({ day: last - 0.5, mode: 'travel' })
    // Walk far enough that unclamped time would run well past the window.
    for (let i = 0; i < 200; i++) g().moveTravel(1, 0, 1)
    expect(g().day).toBe(last)
    expect(new Date(Date.UTC(START_YEAR, 0, 1) + g().day * 86400000).getUTCFullYear()).toBe(1895)
  })

  it('clamps every day-advancing path to the same wall, not just travel', () => {
    const last = lastDay(START_YEAR)
    expect(clampDay(last + 900, START_YEAR)).toBe(last)
    expect(clampDay(last, START_YEAR)).toBe(last)
    expect(clampDay(10, START_YEAR)).toBe(10) // inside the window: untouched
  })
})

describe('debugJumpYear (design.md §21.1 — the + and - keys)', () => {
  it('steps a year forward and back, keeping the month and day', () => {
    const jun1890 = (Date.UTC(START_YEAR, 5, 20) - Date.UTC(START_YEAR, 0, 1)) / 86400000
    useGame.setState({ day: jun1890 })
    g().debugJumpYear(1)
    let d = new Date(Date.UTC(START_YEAR, 0, 1) + g().day * 86400000)
    expect([d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]).toEqual([1891, 5, 20])
    g().debugJumpYear(-1)
    d = new Date(Date.UTC(START_YEAR, 0, 1) + g().day * 86400000)
    expect([d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]).toEqual([1890, 5, 20])
  })

  it('stops at both ends of the window rather than leaving it', () => {
    useGame.setState({ day: 10 }) // January 1890, the first year
    g().debugJumpYear(-1)
    expect(g().day).toBe(10) // unchanged: there is no 1889

    const dec1895 = (Date.UTC(1895, 11, 20) - Date.UTC(START_YEAR, 0, 1)) / 86400000
    useGame.setState({ day: dec1895 })
    g().debugJumpYear(1)
    expect(g().day).toBe(dec1895) // unchanged: there is no 1896
  })

  it('never lands past the ceiling when stepping up to the last year', () => {
    const dec1894 = (Date.UTC(1894, 11, 31) - Date.UTC(START_YEAR, 0, 1)) / 86400000
    useGame.setState({ day: dec1894 })
    g().debugJumpYear(1)
    expect(g().day).toBeLessThanOrEqual(lastDay(START_YEAR))
  })
})
