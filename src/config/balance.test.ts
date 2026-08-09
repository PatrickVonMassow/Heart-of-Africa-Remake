// Balance defaults (CLAUDE.md §7.1 pt. 20, design.md §21). Ports the
// balance-default asserts of settings.mjs (window.__balance) into direct
// imports — same coverage, no browser. Runtime-editability of these fields via
// the debug menu is covered by src/ui/DebugMenu.test.tsx.
import { describe, it, expect } from 'vitest'
import { balance, prices, START_MONEY, START_FOOD_DAYS, START_GIFTS } from './balance'

describe('comfort & control defaults (user calibration)', () => {
  it('mouse, walk, strafe, ambience and travel speed', () => {
    expect(balance.mouseSensitivity).toBe(0.0011)
    expect(balance.placeWalkSpeed).toBe(10)
    expect(balance.placeStrafeFactor).toBe(0.8)
    expect(balance.ambienceVolume).toBe(0.1)
    expect(balance.travelSpeed).toBe(5.6)
  })

  it('the vertical look clamp stops short of vertical (design.md §17.5)', () => {
    expect(balance.lookPitchLimitDeg).toBe(85)
  })
})

describe('terrain relief factors (design.md §11)', () => {
  it('canoe speed-up and the jungle/mountain/canoe-land penalties', () => {
    expect(balance.canoeSpeedup).toBe(3)
    expect(balance.junglePenalty).toBeCloseTo(2.3, 5)
    expect(balance.mountainPenalty).toBeCloseTo(1.67, 5)
    expect(balance.canoeLandPenalty).toBe(2.5)
  })
})

describe('canteen (design.md §6)', () => {
  it('canteen capacity', () => {
    expect(balance.health.canteenCapacity).toBe(500)
  })
})

describe('provisions (design.md §9)', () => {
  it('one purchased food unit lasts four weeks', () => {
    expect(balance.foodUnitDays).toBe(28)
  })
})

describe('fixed design values (not tunable)', () => {
  it('starting money, provisions and gifts', () => {
    expect(START_MONEY).toBe(250)
    expect(START_FOOD_DAYS).toBe(35)
    expect(START_GIFTS).toBe(2)
  })
})

describe('health drains & thresholds (design.md §6)', () => {
  it('per-day point drains, thresholds and canteen consumption rates', () => {
    const h = balance.health
    expect(h.max).toBe(100)
    expect(h.regenPerDay).toBe(4)
    expect(h.starvationDrain).toBe(6)
    expect(h.feverDrain).toBe(8)
    expect(h.dehydrationDrain).toBe(10)
    expect(h.sunblindDrain).toBe(3)
    expect(h.woundLightDrain).toBe(2)
    expect(h.woundSevereDrain).toBe(7)
    expect(h.poorThreshold).toBe(40)
    expect(h.sunblindRecoveryDays).toBe(3)
    expect(h.dehydrationOnsetDays).toBe(0.5)
    // Demo start preset (point 104): no thirst by default; debug-editable.
    expect(h.canteenDrainPerDay).toBe(0)
    expect(h.canteenDesertDrainPerDay).toBe(0)
  })
})

describe('expedition deadline (design.md §5/§18)', () => {
  it('the ~five-year clock, staged warnings and successor penalty', () => {
    expect(balance.deadline.days).toBe(1826)
    expect(balance.deadline.warning1).toBe(0.6)
    expect(balance.deadline.warning2).toBe(0.85)
    expect(balance.deadline.successorDayPenalty).toBe(30)
  })
})

describe('reputation & robbery (design.md §12)', () => {
  it('friend thresholds, protection radii and the robbery haul', () => {
    const r = balance.reputation
    expect(r.goodwillForFriend).toBe(6)
    expect(r.hostilityDays).toBe(30)
    expect(r.robberyMoney).toBe(600)
    expect(r.robberyGifts).toBe(24)
    expect(r.robberyFoodDays).toBe(40)
    expect(r.friendVillageFoodDays).toBe(21)
    expect(r.friendProtectRadiusDeg).toBe(1.5)
    expect(r.friendAidCooldownDays).toBe(10)
  })
})

describe('trade economy sub-values (design.md §8/§10)', () => {
  it('spreads, factors, bounties and the ivory supply', () => {
    const e = balance.economy
    expect(e.reveredFactor).toBe(2.2)
    expect(e.sellSpread).toBe(0.85)
    expect(e.buySpread).toBe(1.25)
    expect(e.bidVariance).toBe(0.15)
    expect(e.bountyVillage).toBe(15)
    expect(e.bountyLandmark).toBe(25)
    expect(e.discoverRadiusDeg).toBe(0.5)
    expect(e.graveyardIvory).toBe(24)
    expect(e.graveyardIvoryPerDig).toEqual({ min: 1, max: 9 })
    expect(e.equipmentSellFactor).toBe(0.5)
  })

  it('the treasure base prices', () => {
    expect(balance.economy.treasureBase).toEqual({
      gold: 60, silver: 35, emerald: 70, copper: 20, ivory: 45, statue: 150,
    })
  })
})

describe('remaining event rates (design.md §14)', () => {
  it('the wetland/desert/discovery rates and the cooldown', () => {
    const e = balance.events
    expect(e.fever).toBeCloseTo(0.0024, 9)
    expect(e.sunblindness).toBeCloseTo(0.002, 9)
    expect(e.sandstorm).toBeCloseTo(0.0024, 9)
    expect(e.findRemains).toBeCloseTo(0.0008, 9)
    expect(e.cooldownDays).toBe(5)
  })
})

describe('current, terrain cost & movement (design.md §11)', () => {
  it('river current, day/food rates, capacity and radii', () => {
    expect(balance.currentDrift).toBe(0.2)
    expect(balance.currentWaterfallBoost).toBe(4)
    expect(balance.currentWaterfallRadius).toBe(0.5)
    expect(balance.daysPerUnit).toBe(0.2)
    // Demo start preset (point 104): no hunger by default; debug-editable.
    expect(balance.foodPerDay).toBe(0)
    // Demo start preset (point 104): random events off by default (debug toggle).
    expect(balance.randomEventsEnabled).toBe(false)
    expect(balance.inventoryCapacity).toBe(20)
    expect(balance.digRadius).toBe(3)
    expect(balance.placeEnterRadius).toBe(2.5)
    // The settlement collider must stay INSIDE the enter radius, else the
    // "Space to enter" prompt could never arm (design.md §11).
    expect(balance.placeCollisionFactor).toBe(0.6)
    expect(balance.placeCollisionFactor).toBeLessThanOrEqual(1)
    expect(balance.goodwillForHint).toBe(2)
    expect(balance.goodwillRevered).toBe(2)
    expect(balance.goodwillNeutral).toBe(1)
  })

  it('the base terrain time-costs', () => {
    expect(balance.terrainCost).toEqual({
      desert: 1.2, savanna: 1.0, jungle: 1.3, mountain: 1.5, water: 2.0,
    })
  })

  it('the mountain-fall risk profile', () => {
    expect(balance.mountainFall).toEqual({
      chancePerDay: 0.35, severeShare: 0.35, itemLossChance: 0.4,
    })
  })
})

describe('camps, village trade & shop prices (design.md §6/§9/§10)', () => {
  it('the camp loot chance and reopen radius', () => {
    expect(balance.camps).toEqual({ lootChancePerDay: 0.03, campRadiusDeg: 0.3 })
  })

  it('the village gift-currency prices and sell rate', () => {
    expect(balance.village.giftPrices).toEqual({
      food: 1, medicine: 1, machete: 2, shovel: 2, rope: 1, canteen: 1,
    })
    expect(balance.village.sellGifts).toBe(1)
  })

  it('the port shop price table', () => {
    expect(prices).toEqual({
      food: 5, medicine: 12, shovel: 20, rope: 15, canteen: 10,
      machete: 15, rifle: 60, canoe: 50,
      giftGold: 30, giftSilver: 12, giftEmerald: 28, giftCopper: 10, giftIvory: 22,
    })
  })
})

describe('village speech (design.md §13.4)', () => {
  it('the pace, the phrase pause and the short, sharply falling hearing range', () => {
    expect(balance.communication).toEqual({
      syllableSeconds: 0.3,
      phrasePauseSeconds: 0.9,
      hearingRadius: 10,
      hearingFalloff: 24,
      labelSeconds: 2.6,
      speechPitchHz: 140,
      speechPitchInterval: 1.68,
      speechVolume: 0.5,
      labelHeadroom: 0.25,
    })
    // A five-syllable atom stays well under two seconds, so a seven-atom
    // message is heard in one go rather than sat through.
    expect(balance.communication.syllableSeconds * 5).toBeLessThan(2)
    // The note over the head outlasts the syllables it annotates — it is read
    // after the voice, never instead of it (work-order point 485).
    expect(balance.communication.labelSeconds).toBeGreaterThan(
      balance.communication.syllableSeconds * 5,
    )
    // And it floats a hand's breadth over the speaker's own head, not a metre
    // over it: the flat 2.3 m the note used to hang at was most of a grown
    // figure's height above the head, and about twice a child's (point 582).
    expect(balance.communication.labelHeadroom).toBeGreaterThan(0)
    expect(balance.communication.labelHeadroom).toBeLessThan(0.5)
  })

  it('pitches both syllables inside one human voice, an interval apart that the ear cannot miss', () => {
    const { speechPitchHz, speechPitchInterval } = balance.communication
    // `ba` and `BA` must read as ONE speaker at two pitches, so both carriers
    // stay in a spoken register — a tone below this hums, above it squeals.
    expect(speechPitchHz).toBeGreaterThanOrEqual(80)
    expect(speechPitchHz * speechPitchInterval).toBeLessThanOrEqual(400)
    // The interval is what the whole language rests on: it must survive the
    // drums beside it, so "merely different" is not enough — a minor sixth
    // (1.6) is the floor, and the two must not cross an octave, where the ear
    // hears the same note again (point 587).
    expect(speechPitchInterval).toBeGreaterThanOrEqual(1.6)
    expect(speechPitchInterval).toBeLessThan(2)
  })

  it('gives the speech its own audible level, and the three older sliders keep theirs (point 577)', () => {
    // The syllables must be audible with NOTHING else configured — the whole
    // communication PoC is learned from them.
    expect(balance.communication.speechVolume).toBeGreaterThan(0)
    // It is exactly the level the speech had while it still rode the ambient
    // bus: the fix moved the ROUTING, not the mix. Pinned so a future edit that
    // makes the speech louder has to say so.
    expect(balance.communication.speechVolume).toBe(0.5)
    // …and the three sliders that existed before are untouched (point 577 §3).
    expect(balance.ambienceVolume).toBe(0.1)
    expect(balance.ambientVolume).toBe(0.5)
    expect(balance.footstepVolume).toBe(2)
  })
})
