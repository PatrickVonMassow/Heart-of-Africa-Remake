// Store random-event application (CLAUDE.md §7.1 pt. 23, design.md §14/§21).
// Ports the store-driven half of scripts/verify/events.mjs — the debug-trigger
// consequences (fever/sandstorm/waterfall-sweep/robbery/fatal lion), autonomous
// firing while travelling, its silence when disabled, and predator contact — plus
// the first-time danger warnings of scripts/verify/enrichments.mjs, into fast
// jsdom checks. The pure weaponProtection/eventChance/resolveEvent asserts live
// in src/systems/events.test.ts; the RAF/three lion-pinning stays in Playwright.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { balance } from '../config/balance'
import { totalGifts } from './store'
import { g, freshGame, withWorld, jumpTo, terrainAt, COORD, useGame } from '../test/store'

withWorld()

// Restore the event rates mutated by the autonomous-firing test.
const eventDefaults = { ...balance.events }

beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false // deterministic: no hidden per-day rolls unless a test opts in
})
afterEach(() => {
  balance.randomEventsEnabled = true
  Object.assign(balance.events, eventDefaults)
  vi.restoreAllMocks()
})

const bodyKeys = () => g().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text))
const titleKeys = () => g().journal.map((e) => (typeof e.title === 'object' ? e.title.key : e.title))
const drive = (dirX: number, dirZ: number, n: number, dt = 0.1) => {
  for (let i = 0; i < n; i++) g().moveTravel(dirX, dirZ, dt)
}

// The event journal keys (body) counted for autonomous firing (as events.mjs).
const EVENT_KEYS = [
  'journal.animalAttack', 'journal.robbery', 'journal.feverOn', 'journal.sunblindOn',
  'journal.sandstorm', 'journal.sweptAway', 'journal.findRemains',
]
const eventCount = () => bodyKeys().filter((k) => EVENT_KEYS.includes(k)).length

describe('debug-triggered event consequences (design.md §14/§21)', () => {
  it('fever afflicts and reports in the journal', () => {
    jumpTo(...COORD.savanna)
    g().debugTriggerEvent('fever')
    expect(g().afflictions.fever).toBe(true)
    expect(bodyKeys()).toContain('journal.feverOn')
  })

  it('a sandstorm costs time (the day advances)', () => {
    jumpTo(...COORD.desert)
    const day0 = g().day
    g().debugTriggerEvent('sandstorm')
    expect(g().day).toBeGreaterThan(day0) // daysLost = 0.5 + rand(), always positive
    expect(bodyKeys()).toContain('journal.sandstorm')
  })

  it('a waterfall sweep halves the gifts, wounds and reports', () => {
    jumpTo(...COORD.savanna)
    g().debugAddGift('copper')
    g().debugAddGift('copper')
    const before = { ...g().gifts }
    g().debugTriggerEvent('waterfallSweep')
    expect(g().gifts.copper).toBe(Math.floor(before.copper / 2))
    expect(g().afflictions.wounds).toBeGreaterThanOrEqual(1)
    expect(bodyKeys()).toContain('journal.sweptAway')
  })

  it('an unarmed robbery steals money', () => {
    jumpTo(...COORD.savanna) // fresh equipment is empty → unarmed, always robbed
    vi.spyOn(Math, 'random').mockReturnValue(0.6) // robbed band, no deterrence, no wound roll
    const money0 = g().money
    g().debugTriggerEvent('robberAttack')
    expect(g().money).toBeLessThan(money0)
    expect(bodyKeys()).toContain('journal.robbery')
  })

  it('a lion attack can end fatally (defeat = death, cause "eaten")', () => {
    jumpTo(...COORD.savanna)
    // 0.46 lands in the lion fatal band [0.45, 0.45 + 0.08*protection) for any
    // protection level, so the outcome is fatal deterministically.
    vi.spyOn(Math, 'random').mockReturnValue(0.46)
    g().debugTriggerEvent('lionAttack')
    expect(g().defeat).toBe('death')
    expect(g().deathCause).toBe('eaten')
  })
})

describe('autonomous firing while travelling (design.md §14)', () => {
  it('events fire on their own while travelling', () => {
    balance.randomEventsEnabled = true
    balance.events.robberAttack = 0.8 // raise a rate so an event fires reliably over the leg
    // rand = 0 makes the first gated event of a savanna tile (a lion) fire and
    // resolve to an escape (roll < 0.45) — a deterministic event journal entry.
    vi.spyOn(Math, 'random').mockReturnValue(0)
    jumpTo(...COORD.savanna)
    const before = eventCount()
    for (let i = 0; i < 30; i++) {
      g().moveTravel(1, 0, 0.1)
      g().debugSet({ foodDays: 30, health: 100 }) // keep the traveller alive over the leg
    }
    expect(eventCount()).toBeGreaterThan(before)
  })

  it('stays silent while random events are disabled', () => {
    balance.randomEventsEnabled = false
    balance.events.robberAttack = 0.8
    vi.spyOn(Math, 'random').mockReturnValue(0) // would fire if enabled; disabled → nothing
    jumpTo(...COORD.savanna)
    const before = eventCount()
    for (let i = 0; i < 30; i++) {
      g().moveTravel(1, 0, 0.1)
      g().debugSet({ foodDays: 30, health: 100 })
    }
    expect(eventCount()).toBe(before)
  })
})

describe('predator contact triggers that predator\'s attack (design.md §14/§19)', () => {
  it('predatorContact("lion") triggers a lion attack and sets the cooldown', () => {
    balance.randomEventsEnabled = true // predatorContact is gated by the events flag
    jumpTo(...COORD.savanna)
    vi.spyOn(Math, 'random').mockReturnValue(0.7) // light injury band (non-fatal) → attack entry
    g().predatorContact('lion')
    expect(titleKeys()).toContain('journal.titles.attack')
    expect(g().eventCooldown).toBeGreaterThan(0)
  })

  it('predatorContact("hyena") triggers a hyena attack (non-lion predator)', () => {
    balance.randomEventsEnabled = true
    jumpTo(...COORD.savanna)
    vi.spyOn(Math, 'random').mockReturnValue(0.7)
    g().predatorContact('hyena')
    expect(titleKeys()).toContain('journal.titles.attack')
    expect(g().eventCooldown).toBeGreaterThan(0)
  })

  it('does nothing while random events are disabled', () => {
    balance.randomEventsEnabled = false
    jumpTo(...COORD.savanna)
    const before = titleKeys().filter((k) => k === 'journal.titles.attack').length
    g().predatorContact('lion')
    expect(titleKeys().filter((k) => k === 'journal.titles.attack').length).toBe(before)
    expect(g().eventCooldown).toBe(0)
  })
})

describe('first-time danger warnings (design.md §14)', () => {
  it('the first desert stretch warns once and not again', () => {
    jumpTo(...COORD.desert)
    expect(terrainAt(...COORD.desert)).toBe('desert')
    const desertWarn = () => bodyKeys().filter((k) => k === 'journal.dangerDesert').length
    drive(1, 0, 1)
    expect(desertWarn()).toBe(1)
    expect(g().dangerWarned.desert).toBe(true)
    drive(1, 0, 4)
    expect(desertWarn()).toBe(1)
  })

  it('the first water warns of crocodiles once', () => {
    jumpTo(...COORD.water)
    expect(terrainAt(...COORD.water)).toBe('water')
    const waterWarn = () => bodyKeys().filter((k) => k === 'journal.dangerWater').length
    drive(0, 1, 1)
    expect(waterWarn()).toBe(1)
    expect(g().dangerWarned.water).toBe(true)
    drive(0, 1, 4)
    expect(waterWarn()).toBe(1)
  })

  it('the first fever-prone jungle warns once', () => {
    jumpTo(...COORD.jungle)
    expect(terrainAt(...COORD.jungle)).toBe('jungle')
    const wetlandWarn = () => bodyKeys().filter((k) => k === 'journal.dangerWetland').length
    drive(1, 0, 1)
    expect(wetlandWarn()).toBe(1)
    expect(g().dangerWarned.wetland).toBe(true)
    drive(1, 0, 4)
    expect(wetlandWarn()).toBe(1)
  })
})

describe('mountain fall resolution (design.md §7/§11)', () => {
  it('a severe fall with item loss drops a droppable item but spares the shovel', () => {
    jumpTo(...COORD.mountain)
    g().debugAddEquipment('machete')
    g().debugAddEquipment('shovel')
    // 0.01 lands in the severe band, triggers the item-loss roll and picks
    // index 0 of the droppable list (the shovel is filtered out of it).
    vi.spyOn(Math, 'random').mockReturnValue(0.01)
    g().applyMountainFall()
    expect(g().afflictions.wounds).toBe(2)
    expect(g().equipment.machete ?? 0).toBe(0) // torn loose by the fall
    expect(g().equipment.shovel ?? 0).toBe(1) // the goal tool is protected
    expect(bodyKeys()).toContain('journal.mountainFallItem')
  })

  it('a fall that loses no item writes the plain fall entry', () => {
    jumpTo(...COORD.mountain)
    g().debugAddEquipment('machete')
    vi.spyOn(Math, 'random').mockReturnValue(0.9) // light band, above the item-loss roll
    g().applyMountainFall()
    expect(g().equipment.machete ?? 0).toBe(1) // nothing dropped
    expect(bodyKeys()).toContain('journal.mountainFall')
    expect(bodyKeys()).not.toContain('journal.mountainFallItem')
  })
})

describe('predator contact for the other cats (design.md §14/§19)', () => {
  const attackCount = () => titleKeys().filter((k) => k === 'journal.titles.attack').length

  it('predatorContact("cheetah") logs an attack and arms the cooldown', () => {
    balance.randomEventsEnabled = true
    jumpTo(...COORD.savanna)
    vi.spyOn(Math, 'random').mockReturnValue(0.7) // light (non-fatal) band for every cat
    const before = attackCount()
    g().predatorContact('cheetah')
    expect(attackCount()).toBe(before + 1)
    expect(g().eventCooldown).toBeGreaterThan(0)
  })

  it('predatorContact("leopard") logs an attack and arms the cooldown', () => {
    balance.randomEventsEnabled = true
    jumpTo(...COORD.savanna)
    vi.spyOn(Math, 'random').mockReturnValue(0.7)
    const before = attackCount()
    g().predatorContact('leopard')
    expect(attackCount()).toBe(before + 1)
    expect(g().eventCooldown).toBeGreaterThan(0)
  })

  it('does nothing while the event cooldown is still running', () => {
    balance.randomEventsEnabled = true
    jumpTo(...COORD.savanna)
    useGame.setState({ eventCooldown: 5 })
    const before = attackCount()
    g().predatorContact('leopard')
    expect(attackCount()).toBe(before) // suppressed by the cooldown
    expect(g().eventCooldown).toBe(5)
  })
})

describe('debug gift total (design.md §21)', () => {
  it('sets and drains the total gift count', () => {
    g().debugSetGiftTotal(10)
    expect(totalGifts(g().gifts)).toBe(10)
    g().debugSetGiftTotal(0)
    expect(totalGifts(g().gifts)).toBe(0)
  })
})
