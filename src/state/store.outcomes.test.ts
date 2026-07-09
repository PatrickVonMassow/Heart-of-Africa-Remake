// Store event-outcome application (CLAUDE.md §7.1 pt. 22/23, design.md §14/§16).
// Drives applyEventOutcome() directly with hand-built, roll-free outcomes so the
// state change and journal entry for each event kind are asserted deterministically
// — the per-kind consequences the rollEvent path only reaches probabilistically.
// The pure resolveEvent/attackSeverity asserts live in src/systems/events.test.ts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { balance } from '../config/balance'
import { g, freshGame, withWorld } from '../test/store'
import type { EventOutcome } from '../systems/events'

withWorld()

beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false
})
afterEach(() => {
  balance.randomEventsEnabled = true
  vi.restoreAllMocks()
})

const bodyKeys = () => g().journal.map((e) => e.text.key)
const countKey = (key: string) => bodyKeys().filter((k) => k === key).length
/** Params of the first animal-attack entry (design.md §16 named the animal). */
const attackParams = () => g().journal.find((e) => e.text.key === 'journal.animalAttack')?.text.params

describe('applyEventOutcome — finds and attacks (design.md §14/§16)', () => {
  it('a remains find credits its money and journals findRemains', () => {
    const money0 = g().money
    g().applyEventOutcome({ kind: 'findRemains', result: 'find', money: 20 })
    expect(g().money).toBe(money0 + 20)
    expect(bodyKeys()).toContain('journal.findRemains')
  })

  it('a light snakebite wounds and names the snake', () => {
    g().applyEventOutcome({ kind: 'snakeBite', result: 'light' })
    expect(g().afflictions.wounds).toBeGreaterThanOrEqual(1)
    expect(bodyKeys()).toContain('journal.animalAttack')
    expect(attackParams()?.animal).toBe('snake')
  })

  it('a severe result sets wounds to 2, a light result raises them to at least 1', () => {
    g().applyEventOutcome({ kind: 'snakeBite', result: 'severe' })
    expect(g().afflictions.wounds).toBe(2)

    freshGame()
    g().applyEventOutcome({ kind: 'snakeBite', result: 'light' })
    expect(g().afflictions.wounds).toBeGreaterThanOrEqual(1)
  })

  it('a fatal result ends the expedition (death, eaten, journal shut)', () => {
    g().applyEventOutcome({ kind: 'lionAttack', result: 'fatal' })
    expect(g().defeat).toBe('death')
    expect(g().deathCause).toBe('eaten')
    expect(g().journalOpen).toBe(false)
  })

  it('maps each predator/reptile kind onto the right animal param', () => {
    const cases: Array<{ kind: EventOutcome['kind']; animal: string }> = [
      { kind: 'crocodileAttack', animal: 'crocodile' },
      { kind: 'cheetahAttack', animal: 'cheetah' },
      { kind: 'leopardAttack', animal: 'leopard' },
      { kind: 'hyenaAttack', animal: 'hyena' },
    ]
    for (const c of cases) {
      freshGame()
      g().applyEventOutcome({ kind: c.kind, result: 'light' })
      expect(attackParams()?.animal).toBe(c.animal)
    }
  })

  it('a friend-rescued attack writes the rescue entry, not a plain attack', () => {
    g().applyEventOutcome({ kind: 'lionAttack', result: 'light', rescued: true })
    expect(bodyKeys()).toContain('journal.friendRescue')
    expect(bodyKeys()).not.toContain('journal.animalAttack')
  })
})

describe('applyEventOutcome — robbery, afflictions, weather (design.md §14/§16)', () => {
  it('a robbery deducts the stolen money', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6) // above the 0.4 wound roll → clean deduction
    const money0 = g().money
    g().applyEventOutcome({ kind: 'robberAttack', result: 'robbed', money: 15 })
    expect(g().money).toBe(money0 - 15)
    expect(bodyKeys()).toContain('journal.robbery')
  })

  it('sun blindness sets in once and a second bout is a no-op', () => {
    g().applyEventOutcome({ kind: 'sunblindness', result: 'afflicted' })
    expect(g().afflictions.sunblind).toBe(true)
    expect(g().sunblindRecovery).toBeGreaterThan(0)
    expect(countKey('journal.sunblindOn')).toBe(1)

    g().applyEventOutcome({ kind: 'sunblindness', result: 'afflicted' })
    expect(countKey('journal.sunblindOn')).toBe(1) // no duplicate entry
  })

  it('fever sets in once and a second bout is a no-op', () => {
    g().applyEventOutcome({ kind: 'fever', result: 'afflicted' })
    expect(g().afflictions.fever).toBe(true)
    expect(countKey('journal.feverOn')).toBe(1)

    g().applyEventOutcome({ kind: 'fever', result: 'afflicted' })
    expect(countKey('journal.feverOn')).toBe(1)
  })

  it('a waterfall sweep halves gifts, drops a non-shovel item and cuts provisions', () => {
    g().debugAddGift('gold')
    g().debugAddGift('gold') // gold now 2, copper starts at 2
    g().debugAddEquipment('machete')
    g().debugAddEquipment('shovel')
    const food0 = g().foodDays
    vi.spyOn(Math, 'random').mockReturnValue(0.9) // deterministic drop index / wound roll
    g().applyEventOutcome({ kind: 'waterfallSweep', result: 'swept' })
    expect(g().gifts.gold).toBe(1)
    expect(g().gifts.copper).toBe(1)
    expect(g().equipment.machete ?? 0).toBe(0) // the droppable item is swept away
    expect(g().equipment.shovel ?? 0).toBe(1) // the goal tool is never dropped
    expect(g().foodDays).toBeLessThan(food0)
    expect(bodyKeys()).toContain('journal.sweptAway')
  })

  it('a sandstorm advances the day by the lost days', () => {
    const day0 = g().day
    g().applyEventOutcome({ kind: 'sandstorm', result: 'weather', daysLost: 2 })
    expect(g().day).toBeCloseTo(day0 + 2, 5)
    expect(bodyKeys()).toContain('journal.sandstorm')
  })
})
