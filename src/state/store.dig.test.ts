// Store dig / goal loop and treasure-buy guards (CLAUDE.md §7.1 pt. 10/25,
// design.md §8/§10/§13.3). Ports the dig-to-victory loop and the bazaar buy
// refusals — previously only exercised through Playwright (flow.mjs) — into fast
// jsdom store checks. The bazaar bid/sell/ferry/bounty asserts stay in
// src/state/store.economy.test.ts; the pure treasureBuyPrice lives in economy.ts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { balance } from '../config/balance'
import { g, freshGame, withWorld, useGame } from '../test/store'
import { getStrings } from '../i18n'
import { stripVoiceMarkup } from '../journal/voiceMarkup'

withWorld()

const capacityDefault = balance.inventoryCapacity

beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false
})
afterEach(() => {
  balance.randomEventsEnabled = true
  balance.inventoryCapacity = capacityDefault
  vi.restoreAllMocks()
})

const bodyKeys = () => g().journal.map((e) => e.text.key)

describe('dig and the goal loop (design.md §13.3)', () => {
  it('digging up the grave with a shovel wins the game', () => {
    const grave = g().graveLatLon
    g().debugJumpTo(grave.lat, grave.lon)
    g().debugAddEquipment('shovel')
    g().dig()
    expect(g().victory).toBe(true)
    expect(bodyKeys()).toContain('journal.victory')
  })

  it('digging without a shovel fails with the no-shovel toast', () => {
    const grave = g().graveLatLon
    g().debugJumpTo(grave.lat, grave.lon)
    g().dig()
    expect(g().victory).toBe(false)
    expect(g().toast).toBe(getStrings().toasts.digNoShovel)
  })

  it('digging on empty ground far from any site yields nothing', () => {
    // Clear the procedural caches and move to open ground away from the grave
    // and the elephant graveyard so only the "nothing found" branch can fire.
    useGame.setState({ treasureSites: [] })
    g().debugJumpTo(-25, 24) // southern interior, far from grave and graveyard
    g().debugAddEquipment('shovel')
    const treasures0 = { ...g().treasures }
    g().dig()
    expect(g().victory).toBe(false)
    expect(g().toast).toBe(stripVoiceMarkup(getStrings().journal.digNothing))
    expect(g().treasures).toEqual(treasures0) // nothing gained
  })
})

describe('bazaar buy guards in a port (design.md §10)', () => {
  it('buying a locally rejected material is a no-op (no price)', () => {
    g().enterPlace('cairo') // North rejects silver
    const money0 = g().money
    g().buyTreasure('silver')
    expect(g().money).toBe(money0)
    expect(g().treasures.silver).toBe(0)
  })

  it('buying beyond the purse is refused with the not-enough-money toast', () => {
    g().enterPlace('cairo')
    const money0 = g().money // 250 < the statue's revered asking price
    g().buyTreasure('statue')
    expect(g().money).toBe(money0)
    expect(g().treasures.statue).toBe(0)
    expect(g().toast).toBe(getStrings().toasts.notEnoughMoney)
  })

  it('buying into a full pack is refused with the inventory-full toast', () => {
    g().enterPlace('cairo')
    balance.inventoryCapacity = 2 // fresh pack already holds 2 gift trinkets
    const money0 = g().money
    g().buyTreasure('copper') // affordable and traded in the North
    expect(g().treasures.copper).toBe(0)
    expect(g().money).toBe(money0)
    expect(g().toast).toBe(getStrings().toasts.inventoryFull)
  })

  it('buying a gift material in a port spends money and stocks the gift', () => {
    g().enterPlace('cairo')
    const money0 = g().money
    const gold0 = g().gifts.gold
    g().buy('gold')
    expect(g().gifts.gold).toBe(gold0 + 1)
    expect(g().money).toBeLessThan(money0)
  })
})
