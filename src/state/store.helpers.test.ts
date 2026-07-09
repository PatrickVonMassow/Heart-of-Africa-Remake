// Pure store helpers (design.md §6/§8/§19): the exported utility functions that
// carry no state — health banding, inventory bag maths, gift totals, equipment
// id guard and the exploration grid key. No browser, no store instance.
import { describe, it, expect } from 'vitest'
import {
  healthState, bagItemCount, emptyBag, totalGifts, isEquipmentId,
  exploreCellKey, EXPLORE_CELL_DEG, EQUIPMENT_IDS, type ItemBag,
  usedInventory, priceOfGood, giftPriceOfGood, VILLAGE_TRADE_GOODS, type GameState,
} from './store'
import { balance } from '../config/balance'
import type { Material } from '../world/geo'

const MATERIALS: Material[] = ['gold', 'silver', 'emerald', 'copper', 'ivory']

describe('healthState (design.md §6/§19)', () => {
  it('bands health into healthy / weakened / poor', () => {
    expect(healthState(100)).toBe('healthy')
    expect(healthState(75)).toBe('healthy')
    expect(healthState(74)).toBe('weakened')
    expect(healthState(balance.health.poorThreshold)).toBe('weakened')
    expect(healthState(balance.health.poorThreshold - 1)).toBe('poor')
    expect(healthState(0)).toBe('poor')
  })
})

describe('inventory bag (design.md §6 camps)', () => {
  it('an empty bag counts zero items', () => {
    expect(bagItemCount(emptyBag())).toBe(0)
  })

  it('counts equipment, gifts and treasures together', () => {
    const bag: ItemBag = {
      equipment: { machete: 1, rope: 2 },
      gifts: { gold: 3 },
      treasures: { ivory: 4 },
    }
    expect(bagItemCount(bag)).toBe(1 + 2 + 3 + 4)
  })
})

describe('gift + equipment helpers', () => {
  it('totalGifts sums the gift record', () => {
    expect(totalGifts({ gold: 1, silver: 2, emerald: 0, copper: 3, ivory: 0 })).toBe(6)
  })

  it('isEquipmentId recognizes exactly the equipment ids', () => {
    for (const id of EQUIPMENT_IDS) expect(isEquipmentId(id)).toBe(true)
    expect(isEquipmentId('gold')).toBe(false)
    expect(isEquipmentId('nonsense')).toBe(false)
  })
})

describe('exploration grid (design.md §19)', () => {
  it('maps a coordinate to a stable cell key and neighbours share it', () => {
    const k = exploreCellKey(-2.5, 34.8)
    expect(k).toBe(exploreCellKey(-2.5 + EXPLORE_CELL_DEG / 4, 34.8 + EXPLORE_CELL_DEG / 4))
    // A full cell away yields a different key.
    expect(k).not.toBe(exploreCellKey(-2.5 + EXPLORE_CELL_DEG, 34.8))
  })
})

describe('usedInventory (design.md §6 capacity)', () => {
  it('counts equipment, gifts and treasures of a state slice together', () => {
    const s: Pick<GameState, 'equipment' | 'gifts' | 'treasures'> = {
      equipment: { machete: 1, rope: 2 }, // 3
      gifts: { gold: 1, silver: 0, emerald: 2, copper: 0, ivory: 0 }, // 3
      treasures: { gold: 0, silver: 0, emerald: 0, copper: 0, ivory: 1, statue: 4 }, // 5
    }
    expect(usedInventory(s)).toBe(11)
  })

  it('an empty pack uses zero capacity', () => {
    const s: Pick<GameState, 'equipment' | 'gifts' | 'treasures'> = {
      equipment: {},
      gifts: { gold: 0, silver: 0, emerald: 0, copper: 0, ivory: 0 },
      treasures: { gold: 0, silver: 0, emerald: 0, copper: 0, ivory: 0, statue: 0 },
    }
    expect(usedInventory(s)).toBe(0)
  })
})

describe('priceOfGood (design.md §9/§10)', () => {
  it('returns a positive, defined price for every sellable good and material', () => {
    for (const good of [...EQUIPMENT_IDS, 'food' as const, ...MATERIALS]) {
      const price = priceOfGood(good)
      expect(price).toBeTypeOf('number')
      expect(Number.isFinite(price)).toBe(true)
      expect(price).toBeGreaterThan(0)
    }
  })
})

describe('village trade (design.md §9)', () => {
  it('giftPriceOfGood returns the configured gift price, else the fallback of 1', () => {
    for (const good of VILLAGE_TRADE_GOODS) {
      expect(giftPriceOfGood(good)).toBe(balance.village.giftPrices[good])
    }
    // A good with no configured gift price falls back to 1.
    expect(balance.village.giftPrices.rifle).toBeUndefined()
    expect(giftPriceOfGood('rifle')).toBe(1)
  })

  it('VILLAGE_TRADE_GOODS also barters rope and a canteen', () => {
    expect(VILLAGE_TRADE_GOODS).toContain('rope')
    expect(VILLAGE_TRADE_GOODS).toContain('canteen')
  })
})
