// Standing with the natives (CLAUDE.md §7.1 pt. 26, design.md §12/§7). Ports
// the store-driven asserts of scripts/verify/reputation.mjs into fast jsdom
// checks: gift rejection -> hostility/expulsion and its wear-off, and the
// "Honored Friend" pledge with its protection/aid/supplies.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { balance } from '../config/balance'
import { g, freshGame, withWorld, jumpTo, useGame } from '../test/store'

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
// North reveres gold, rejects silver (REGION_VALUES.north). Nubian and Tuareg
// villages both sit in the north region.
const NUBIAN = 'nubian-village'
const NUBIAN_LAT = 21.8
const NUBIAN_LON = 31.6

describe('hostility and expulsion (design.md §12)', () => {
  it('a rejected gift expels the traveller, turns the chief hostile, and wears off', () => {
    g().leavePlace()
    g().enterPlace(NUBIAN)

    // Silver is rejected in the north: the gift gets the traveller thrown out.
    g().debugAddGift('silver')
    g().giveGift('silver')
    expect(g().mode).toBe('travel') // expelled from the village
    expect(journalKeys()).toContain('journal.giftRejected')
    expect(g().hostileUntil[NUBIAN] ?? 0).toBeGreaterThan(g().day)
    expect(g().goodwill[NUBIAN] ?? 0).toBe(0) // goodwill reset

    // While hostile the chief refuses even a revered gift.
    g().enterPlace(NUBIAN)
    g().debugAddGift('gold')
    const goldBefore = g().gifts.gold
    g().giveGift('gold')
    expect(g().gifts.gold).toBe(goldBefore) // not spent -> refused
    expect(g().goodwill[NUBIAN] ?? 0).toBe(0)

    // Past the hostility period the chief accepts gifts again.
    g().debugSet({ day: g().day + balance.reputation.hostilityDays + 1 })
    g().giveGift('gold')
    expect(g().gifts.gold).toBe(goldBefore - 1) // now spent -> accepted
    expect(g().goodwill[NUBIAN] ?? 0).toBeGreaterThan(0)
  })
})

describe('Honored Friend (design.md §12)', () => {
  it('repeated revered gifts bestow it once with a single friendPledge entry', () => {
    g().leavePlace()
    g().enterPlace(NUBIAN)
    const need = balance.reputation.goodwillForFriend
    // A handful more revered gifts than strictly needed to prove the pledge
    // still fires only once.
    for (let i = 0; i < need + 2; i++) {
      g().debugAddGift('gold')
      g().giveGift('gold')
    }
    expect(g().honoredFriend.north).toBe(true)
    expect(journalKeys().filter((k) => k === 'journal.friendPledge').length).toBe(1)
  })

  it('caps attacks at a light injury with a rescue entry and drives off robbers', () => {
    // Honored Friend is normally earned by gifts (covered above); set it
    // directly here to isolate the protection behaviour, then stand right by a
    // north village so the natives are in reach.
    useGame.setState({ honoredFriend: { north: true } })
    jumpTo(NUBIAN_LAT, NUBIAN_LON)

    // 0.99 lands the raw severity in the "severe" band; friend protection must
    // still cap it at a light wound and never a defeat.
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    for (let i = 0; i < 5; i++) g().debugTriggerEvent('lionAttack')
    expect(g().defeat).toBeNull()
    expect(g().afflictions.wounds).toBeLessThanOrEqual(1)
    expect(journalKeys()).toContain('journal.friendRescue')

    g().debugTriggerEvent('robberAttack')
    expect(journalKeys()).toContain('journal.friendRescueRobbers')
  })

  it('brings villagers to a near-death traveller with food and medicine', () => {
    useGame.setState({ honoredFriend: { north: true } })
    jumpTo(NUBIAN_LAT, NUBIAN_LON)
    g().debugSet({ health: 20, foodDays: 1 }) // health below the poor threshold (40)
    g().debugSetAffliction('wounds', 2)
    g().moveTravel(0, -1, 0.05) // a travel step runs the health tick -> aid

    expect(journalKeys()).toContain('journal.friendAid')
    expect(g().foodDays).toBeGreaterThanOrEqual(7)
    expect(g().afflictions.wounds).toBe(0)
  })

  it('withholds a second rescue inside the cooldown window, then allows one again past it', () => {
    useGame.setState({ honoredFriend: { north: true } })
    jumpTo(NUBIAN_LAT, NUBIAN_LON)
    g().debugSet({ health: 20, foodDays: 1 })
    g().debugSetAffliction('wounds', 2)
    g().moveTravel(0, -1, 0.05) // first rescue fires
    const firstAidDay = g().lastFriendAidDay
    expect(journalKeys().filter((k) => k === 'journal.friendAid').length).toBe(1)
    expect(g().afflictions.wounds).toBe(0)

    // Re-degrade right away, well inside the 10-day cooldown: aid is withheld.
    g().debugSet({ health: 20, foodDays: 1 })
    g().debugSetAffliction('wounds', 2)
    g().moveTravel(0, -1, 0.05)
    expect(journalKeys().filter((k) => k === 'journal.friendAid').length).toBe(1) // no second rescue
    expect(g().afflictions.wounds).toBe(2) // untouched — the aid never fired
    expect(g().lastFriendAidDay).toBe(firstAidDay) // the cooldown clock did not move

    // Past the cooldown window the rescue fires again.
    g().debugSet({ day: g().day + balance.reputation.friendAidCooldownDays + 1, health: 20, foodDays: 1 })
    g().debugSetAffliction('wounds', 2)
    g().moveTravel(0, -1, 0.05)
    expect(journalKeys().filter((k) => k === 'journal.friendAid').length).toBe(2)
    expect(g().afflictions.wounds).toBe(0)
  })

  it("hands out free provisions and medicine in the region's villages", () => {
    useGame.setState({ honoredFriend: { north: true } })
    g().debugSet({ foodDays: 2 })
    g().enterPlace('tuareg-village') // same north region, friend status applies

    expect(g().foodDays).toBeGreaterThanOrEqual(balance.reputation.friendVillageFoodDays)
    expect(g().equipment.medicine ?? 0).toBeGreaterThanOrEqual(1)
    expect(journalKeys()).toContain('journal.friendSupplies')
  })
})
