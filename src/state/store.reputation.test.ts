// Standing with the natives (CLAUDE.md §7.1 pt. 26, design.md §12/§7). Ports
// the store-driven asserts of scripts/verify/reputation.mjs into fast jsdom
// checks: what the "Honored Friend" standing DOES — protection, near-death aid
// and free supplies. Nothing bestows it since the gift/goodwill state retired
// (point 1052), so the cases set the flag directly and the observation model
// will bring its producer back.
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
// Nubian and Tuareg villages both sit in the north region.
const NUBIAN_LAT = 21.8
const NUBIAN_LON = 31.6

describe('Honored Friend (design.md §12)', () => {
  it('caps attacks at a light injury with a rescue entry and drives off robbers', () => {
    // Set the standing directly and stand right by a north village, so the
    // natives are in reach.
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
