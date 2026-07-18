// Store-driven trade economy (CLAUDE.md §7.1 pt. 25, design.md §8/§9/§10).
// Ports the window.__game / window.__ui store asserts of scripts/verify/
// economy.mjs into fast jsdom checks: treasure-cache placement, the bazaar
// offer→bid→accept/decline/reject flow with its stable per-port quote,
// inventory-capacity refusal, the Zanzibar ferry, discovery bounties, the
// graveyard ivory haul, cache digging, presented-valuable reactions and the
// gift-vs-money village/port currency split. The pure regionalFactor / bid /
// ferry / generateTreasureSites maths stay covered in systems/economy.test.ts;
// DOM-rendered dialog/journal text and the telegraph screenshot stay in
// Playwright.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { balance } from '../config/balance'
import { g, freshGame, withWorld, jumpTo, useGame, TEST_SEED } from '../test/store'
import { totalGifts, VILLAGE_TRADE_GOODS, usedInventory } from './store'
import { generateTreasureSites } from '../systems/economy'
import { useUi } from './ui'
import { getStrings } from '../i18n'

withWorld()

// Defaults mutated by capacity/graveyard tests, restored after each case.
const DEFAULT_CAPACITY = balance.inventoryCapacity
const DEFAULT_IVORY_PER_DIG = { ...balance.economy.graveyardIvoryPerDig }

beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false // deterministic: no hidden per-day rolls
})
afterEach(() => {
  balance.randomEventsEnabled = true
  balance.inventoryCapacity = DEFAULT_CAPACITY
  balance.economy.graveyardIvoryPerDig = { ...DEFAULT_IVORY_PER_DIG }
  vi.restoreAllMocks()
})

const journalKeys = () => g().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text))

describe('procedural treasure placement (design.md §18)', () => {
  it('places six treasure caches, one of them the statue site', () => {
    const sites = g().treasureSites
    expect(sites.length).toBe(6)
    expect(sites.filter((s) => s.treasure === 'statue').length).toBe(1)
  })
})

describe('bazaar offer → bid → accept/decline (design.md §10)', () => {
  it('offering a revered treasure yields a bid; accepting pays out and hands it over', () => {
    // rand 0.5 → zero haggling variance, so the bid is a clean, stable value.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    g().debugAddTreasure('gold') // North reveres gold
    const money0 = g().money
    g().offerTreasure('gold')
    const bid = useUi.getState().bazaarBid
    expect(bid).not.toBeNull()
    expect(bid?.amount ?? 0).toBeGreaterThan(0)
    g().acceptBid()
    expect(g().money).toBe(money0 + (bid?.amount ?? 0))
    expect(g().treasures.gold).toBe(0)
    expect(useUi.getState().bazaarBid).toBeNull()
  })

  it('declining keeps the treasure and clears the bid', () => {
    g().debugAddTreasure('emerald') // revered in the North → a real bid
    g().offerTreasure('emerald')
    expect(useUi.getState().bazaarBid).not.toBeNull()
    g().declineBid()
    expect(useUi.getState().bazaarBid).toBeNull()
    expect(g().treasures.emerald).toBe(1)
  })

  it('a rejected material draws no bid, only a toast', () => {
    g().debugAddTreasure('silver') // silver is rejected in the North
    g().offerTreasure('silver')
    expect(useUi.getState().bazaarBid).toBeNull()
    expect(g().toast).toBeTruthy()
  })

  it('re-offering the same treasure shows the identical cached quote, cleared on leaving', () => {
    // A varying-but-deterministic random sequence: were the quote not cached,
    // each re-offer would roll a fresh (different) bid and the check would fail.
    let k = 0
    const seq = [0.13, 0.87, 0.42, 0.61, 0.29, 0.74, 0.05, 0.93]
    vi.spyOn(Math, 'random').mockImplementation(() => seq[k++ % seq.length])
    g().debugAddTreasure('emerald')
    g().offerTreasure('emerald')
    const firstBid = useUi.getState().bazaarBid?.amount
    expect(firstBid ?? 0).toBeGreaterThan(0)
    g().declineBid()
    const reBids: Array<number | undefined> = []
    for (let i = 0; i < 5; i++) {
      g().offerTreasure('emerald')
      reBids.push(useUi.getState().bazaarBid?.amount)
      g().declineBid()
    }
    expect(reBids.every((a) => a === firstBid)).toBe(true)
    expect(g().bazaarQuotes.emerald).toBe(firstBid)
    // The quote is per-port: it expires on leaving and is not restored on re-entry.
    g().leavePlace()
    expect(Object.keys(g().bazaarQuotes).length).toBe(0)
    g().enterPlace('cairo')
    expect(Object.keys(g().bazaarQuotes).length).toBe(0)
  })

  it('buys a treasure at the bazaar (arbitrage leg)', () => {
    g().debugSet({ money: 1000 })
    const money0 = g().money
    g().buyTreasure('copper') // neutral in the North → a valid buy price
    expect(g().treasures.copper).toBe(1)
    expect(g().money).toBeLessThan(money0)
  })
})

describe('inventory capacity (design.md §6)', () => {
  it('a full pack refuses a purchase, and debug adds auto-raise the capacity', () => {
    balance.inventoryCapacity = usedInventory(g()) // pack now exactly full
    const money0 = g().money
    g().buy('rope') // Cairo (port): affordable, but no room
    expect(g().equipment.rope ?? 0).toBe(0)
    expect(g().money).toBe(money0)
    expect(g().toast).toBeTruthy()
    const capFull = balance.inventoryCapacity
    g().debugAddTreasure('gold')
    expect(g().treasures.gold).toBe(1)
    expect(balance.inventoryCapacity).toBe(capFull + 1)
  })
})

describe('ferry passages (design.md §10)', () => {
  it('sails Cairo → Zanzibar, costing fare and days and saving a checkpoint', () => {
    const money0 = g().money
    const day0 = g().day
    g().bookFerry('zanzibar')
    expect(g().placeId).toBe('zanzibar')
    expect(g().mode).toBe('place')
    expect(g().money).toBeLessThan(money0) // fare paid
    expect(g().day).toBeGreaterThan(day0) // days passed
    const keys = journalKeys()
    expect(keys).toContain('journal.ferry')
    expect(keys).toContain('journal.portArrival')
    expect(g().hasCheckpoint).toBe(true)
  })
})

describe('discovery bounties (design.md §10)', () => {
  it('queues a sighted landmark and a first-visited village, paid at the next port', () => {
    jumpTo(-3.05, 37.3) // Kilimanjaro massif
    g().debugAddEquipment('rope') // rope keeps the climb safe (design.md §11)
    for (let i = 0; i < 3; i++) g().moveTravel(0, -1, 0.1)
    expect(g().landmarksSeen).toContain('kilimanjaro')
    expect(g().pendingBounties.some((b) => b.kind === 'landmark' && b.id === 'kilimanjaro')).toBe(true)

    g().enterPlace('maasai-village') // first-visit village (East) → village bounty
    const pending = g().pendingBounties
    expect(pending.some((b) => b.kind === 'village' && b.id === 'maasai-village')).toBe(true)

    const e = balance.economy
    const expected = pending.reduce((sum, b) => sum + (b.kind === 'village' ? e.bountyVillage : e.bountyLandmark), 0)
    const moneyPre = g().money
    g().leavePlace()
    g().enterPlace('zanzibar') // a port credits the pending bounties

    expect(g().money).toBe(moneyPre + expected)
    expect(g().pendingBounties.length).toBe(0)
    expect(journalKeys()).toContain('journal.bounty')

    // The entry records exactly which discoveries earned the transfer.
    const bountyEntry = [...g().journal].reverse().find((x) => x.text.key === 'journal.bounty')
    const params = bountyEntry?.text.params
    expect(String(params?.landmarks ?? '')).toContain('kilimanjaro')
    expect(String(params?.villages ?? '')).toContain('maasai-village')
  })
})

describe('elephant graveyard ivory (design.md §4.4)', () => {
  it('each dig frees a random haul in 1..9 averaging ~5', () => {
    g().debugAddEquipment('shovel')
    jumpTo(-4.9, 36.6) // elephant graveyard
    balance.inventoryCapacity = 1_000_000
    useGame.setState({ graveyardIvoryLeft: 100000 })
    // Deterministic uniform roll: cycling (i+0.5)/9 → floor gives 0..8 → 1..9.
    let n = 0
    vi.spyOn(Math, 'random').mockImplementation(() => ((n++ % 9) + 0.5) / 9)
    const yields: number[] = []
    for (let i = 0; i < 150; i++) {
      const before = g().treasures.ivory
      g().dig()
      yields.push(g().treasures.ivory - before)
    }
    const mean = yields.reduce((a, b) => a + b, 0) / yields.length
    expect(Math.min(...yields)).toBe(1)
    expect(Math.max(...yields)).toBe(9)
    expect(mean).toBeGreaterThan(4)
    expect(mean).toBeLessThan(6)
    expect(journalKeys()).toContain('journal.ivoryFound')
  })

  it('caps the haul by the remaining supply, then an exhausted graveyard gives nothing', () => {
    g().debugAddEquipment('shovel')
    jumpTo(-4.9, 36.6)
    balance.inventoryCapacity = 1_000_000
    balance.economy.graveyardIvoryPerDig = { min: 9, max: 9 } // force a big roll
    useGame.setState({ graveyardIvoryLeft: 2 })
    const before = g().treasures.ivory
    g().dig() // rolls 9 but only 2 remain → capped to 2
    expect(g().treasures.ivory - before).toBe(2)
    expect(g().graveyardIvoryLeft).toBe(0)
    g().setToast(null)
    g().dig() // empty now
    expect(g().toast).toBeTruthy()
    expect(g().treasures.ivory - before).toBe(2) // unchanged
  })

  it('an already-full pack refuses the dig with the inventory-full toast', () => {
    g().debugAddEquipment('shovel')
    jumpTo(-4.9, 36.6)
    useGame.setState({ graveyardIvoryLeft: 100 })
    balance.inventoryCapacity = usedInventory(g()) // exactly full: no free space
    g().setToast(null)
    const before = g().treasures.ivory
    g().dig()
    expect(g().treasures.ivory).toBe(before) // nothing gained
    expect(g().toast).toBe(getStrings().toasts.inventoryFull)
  })

  it('clamps the haul by the free pack space, not only by the remaining supply', () => {
    g().debugAddEquipment('shovel')
    jumpTo(-4.9, 36.6)
    balance.economy.graveyardIvoryPerDig = { min: 9, max: 9 } // force a big roll
    useGame.setState({ graveyardIvoryLeft: 100 }) // plenty remains — space is the binding limit
    balance.inventoryCapacity = usedInventory(g()) + 2 // room for only 2 more
    const before = g().treasures.ivory
    g().dig()
    expect(g().treasures.ivory - before).toBe(2) // clamped by space, not the rolled 9
  })
})

describe('buried treasure caches (design.md §8/§18)', () => {
  it('digs the statue cache and marks it recovered', () => {
    // Pin the caches to the fixed seed and set the grave far away so the dig
    // resolves the statue cache deterministically (no accidental victory).
    useGame.setState({ treasureSites: generateTreasureSites(TEST_SEED) })
    const site = g().treasureSites.find((s) => s.treasure === 'statue')
    expect(site).toBeDefined()
    if (!site) return
    useGame.setState({ graveLatLon: { lat: site.lat + 20, lon: site.lon + 20 } })
    g().debugAddEquipment('shovel')
    jumpTo(site.lat, site.lon)
    g().dig()
    expect(g().treasures.statue).toBe(1)
    expect(g().treasureSites.find((s) => s.treasure === 'statue')?.dug).toBe(true)
    expect(journalKeys()).toContain('journal.treasureFound')
  })

  it('refuses to dig a buried cache with a full pack, leaving the site undug', () => {
    useGame.setState({ treasureSites: generateTreasureSites(TEST_SEED) })
    const site = g().treasureSites.find((s) => s.treasure === 'statue')
    expect(site).toBeDefined()
    if (!site) return
    useGame.setState({ graveLatLon: { lat: site.lat + 20, lon: site.lon + 20 } })
    g().debugAddEquipment('shovel')
    jumpTo(site.lat, site.lon)
    balance.inventoryCapacity = usedInventory(g()) // exactly full: no room for the find
    g().setToast(null)
    g().dig()
    expect(g().treasures.statue).toBe(0)
    expect(g().treasureSites.find((s) => s.treasure === 'statue')?.dug).toBe(false)
    expect(g().toast).toBe(getStrings().toasts.inventoryFull)
  })
})

describe('presented valuables (design.md §8)', () => {
  it('a revered material creates goodwill, a rejected one provokes the negative reaction', () => {
    // North reveres gold, rejects silver.
    g().debugAddTreasure('gold')
    g().enterPlace('nubian-village')
    g().presentValuable('gold')
    expect(journalKeys()).toContain('journal.valuableRevered')
    expect(g().goodwill['nubian-village'] ?? 0).toBeGreaterThan(0)

    g().leavePlace()
    g().debugAddTreasure('silver')
    g().enterPlace('tuareg-village')
    g().presentValuable('silver')
    expect(journalKeys()).toContain('journal.valuableRejected')
  })
})

describe('settlement currency split (design.md §9/§10)', () => {
  it('every settlement offers the baseline goods', () => {
    for (const good of ['food', 'machete', 'shovel', 'medicine'] as const) {
      expect(VILLAGE_TRADE_GOODS).toContain(good)
    }
  })

  it('a village trades in gifts (buy food/gear, sell for gifts) and refuses without gifts', () => {
    g().leavePlace()
    useGame.setState({ gifts: { gold: 0, silver: 0, emerald: 0, copper: 6, ivory: 0 }, money: 500 })
    g().enterPlace('nubian-village') // North village → currency is gifts

    // Buying food spends 1 gift, adds one food unit's provision days (a
    // balance value, four weeks by default), leaves money untouched.
    const gifts0 = totalGifts(g().gifts)
    const food0 = g().foodDays
    const money0 = g().money
    g().buy('food')
    expect(totalGifts(g().gifts)).toBe(gifts0 - 1)
    expect(g().foodDays).toBe(food0 + balance.foodUnitDays)
    expect(g().money).toBe(money0)

    // Buying gear works.
    g().buy('machete')
    expect(g().equipment.machete ?? 0).toBeGreaterThanOrEqual(1)

    // Selling gear pays in gifts, not money.
    const giftsBeforeSell = totalGifts(g().gifts)
    const machBefore = g().equipment.machete ?? 0
    g().sellItem('machete')
    expect(totalGifts(g().gifts)).toBeGreaterThan(giftsBeforeSell)
    expect(g().equipment.machete ?? 0).toBe(machBefore - 1)

    // Without gifts the purchase is refused with a toast.
    useGame.setState({ gifts: { gold: 0, silver: 0, emerald: 0, copper: 0, ivory: 0 } })
    g().setToast(null)
    const machPrev = g().equipment.machete ?? 0
    g().buy('machete')
    expect(g().toast).toBeTruthy()
    expect(g().equipment.machete ?? 0).toBe(machPrev)
  })

  it('a port sells gear back for money', () => {
    // freshGame starts in Cairo, a port.
    g().debugSet({ money: 200 })
    g().debugAddEquipment('machete')
    const money0 = g().money
    g().sellItem('machete')
    expect(g().money).toBeGreaterThan(money0)
  })
})
