// Central balance configuration (CLAUDE.md §2).
// All values below are calibratable educated guesses unless design.md fixes
// them explicitly (e.g. starting money 250 $, start year 1890). The debug
// menu (F1) exposes them at runtime for fine-tuning.

import type { Material } from '../world/geo'
import type { EquipmentId } from '../state/store'

export interface BalanceConfig {
  /** Travel speed on the continent map, world units per second (1 unit = 0.1 degree). */
  travelSpeed: number
  /** Walking speed inside places (first-person), meters per second. */
  placeWalkSpeed: number
  /** Speed factor for strafing and walking backward inside places (design.md §2). */
  placeStrafeFactor: number
  /** Mouse-look sensitivity in the first-person view, radians per pixel. */
  mouseSensitivity: number
  /** Single ambience volume: the noise beds (wind/surf/murmur), their gust/swell
   *  modulation and the proximity animal calls are all scaled by it (1 = full). */
  ambienceVolume: number
  /** In-game days that pass per world unit traveled on the map. */
  daysPerUnit: number
  /** Provisions consumed per in-game day (1.0 = one day's ration). */
  foodPerDay: number
  /** Days of provisions one purchased food unit grants (design.md §9). */
  foodUnitDays: number
  /** Base terrain time-cost multipliers (more days per unit in rough terrain).
   *  jungle/mountain are the costs with the relieving item carried; water is the
   *  cost while swimming (no canoe). The penalty/speed-up factors below modify
   *  them by whether the relieving item is in the pack (possession-based). */
  terrainCost: {
    desert: number
    savanna: number
    jungle: number
    mountain: number
    water: number
  }
  /** Jungle without a machete is this much slower than with one (design.md §11). */
  junglePenalty: number
  /** Mountain without a rope is this much slower than with one (design.md §11). */
  mountainPenalty: number
  /** A canoe makes water travel this much faster than swimming (design.md §11). */
  canoeSpeedup: number
  /** Carrying the canoe slows land travel by this factor (design.md §11): the
   *  canoe is only relevant by possession, so it is a permanent land handicap. */
  canoeLandPenalty: number
  /** River current drift in degrees/sec at full strength on the centerline; the
   *  flow sweeps the traveller downstream (design.md §11). */
  currentDrift: number
  /** Multiplier on the current's strength close to a waterfall (design.md §11). */
  currentWaterfallBoost: number
  /** Radius (degrees) around a waterfall within which the current is boosted. */
  currentWaterfallRadius: number
  /** Climbing a mountain without a rope in the pack (design.md §7/§11). */
  mountainFall: {
    /** Chance per travelled day of a fall while on a mountain without a rope. */
    chancePerDay: number
    /** Share of falls that wound severely (the rest are light). */
    severeShare: number
    /** Chance a fall also costs one carried equipment item. */
    itemLossChance: number
  }
  /** Radius (world units) around the grave in which digging succeeds. */
  digRadius: number
  /** Radius (world units) around a place marker in which it can be entered. */
  placeEnterRadius: number
  /** How far (degrees) off the coast the sea stays swimmable (design.md
   *  §11.2); beyond it the open ocean blocks movement even inside bays. */
  oceanSwimMarginDeg: number
  /** Extra clearance (world units) beyond the enter radius the traveller must
   *  reach after leaving a settlement before it can be re-entered, so walking
   *  straight back in does not immediately re-enter it (design.md §2). */
  placeReentryMargin: number
  /** Goodwill points required before the chief reveals the location hint. */
  goodwillForHint: number
  /** Goodwill gained per culturally revered gift. */
  goodwillRevered: number
  /** Goodwill gained per neutral gift. */
  goodwillNeutral: number
  /** Random events enabled (design.md §14). */
  randomEventsEnabled: boolean
  /** Per-day base probabilities of the random events (design.md §14). */
  events: {
    animalAttack: number
    robberAttack: number
    crocodile: number
    fever: number
    sunblindness: number
    sandstorm: number
    waterfallSweep: number
    findRemains: number
    /** Minimum days between two rolled events (spam guard). */
    cooldownDays: number
  }
  /** Expedition deadline (design.md §5): total days and staged warnings. */
  deadline: {
    days: number
    /** Fractions of the deadline at which the two warnings fire. */
    warning1: number
    warning2: number
    /** Days a successor loses when taking over (design.md §18). */
    successorDayPenalty: number
  }
  /** Health & afflictions (design.md §6); drains/regen in points per in-game day. */
  health: {
    max: number
    /** Regeneration while fed and free of afflictions. */
    regenPerDay: number
    starvationDrain: number
    feverDrain: number
    dehydrationDrain: number
    sunblindDrain: number
    woundLightDrain: number
    woundSevereDrain: number
    /** Natural wound healing while fed (design.md §6): days until a light
     * wound closes on its own, and days until a severe wound subsides to a
     * light one. Medicine remains the instant cure. */
    woundHealLightDays: number
    woundHealSevereDays: number
    /** Days of an empty canteen (thirst) until dehydration sets in (design.md
     * §6); fresh water in reach (river/lake) counts as drinking and resets it. */
    dehydrationOnsetDays: number
    /** Water consumed per travelled day away from fresh water — the base rate
     * off the desert, and the faster desert rate (design.md §6/§11). The
     * canteen fill fraction (0..1) drops by this over canteenCapacity, so a full
     * canteen lasts canteenCapacity / drainPerDay travelled days. */
    canteenDrainPerDay: number
    canteenDesertDrainPerDay: number
    /** Water the canteen holds (units matching the drain rates above). Raising
     * it makes the supply last proportionally longer (design.md §6/§21). */
    canteenCapacity: number
    /** Days outside the desert until sun blindness heals. */
    sunblindRecoveryDays: number
    /** Below this the condition counts as "poor" (vultures, §19). */
    poorThreshold: number
  }
  /** Show hidden objects (grave position) — debug aid, default off. */
  showHiddenObjects: boolean
  /** Carryable item count: equipment + gifts + treasures (design.md §6 camps). */
  inventoryCapacity: number
  /** Standing with the native peoples (design.md §12). */
  reputation: {
    /** Goodwill at which a chief bestows "Honored Friend" on his region. */
    goodwillForFriend: number
    /** Days a village stays hostile after wrong behavior (expulsion). */
    hostilityDays: number
    /** Radius in degrees around a friend region's villages with protection. */
    friendProtectRadiusDeg: number
    /** Days between two aid deliveries when close to death (§12). */
    friendAidCooldownDays: number
    /** Provisions level a friend village tops the traveler up to. */
    friendVillageFoodDays: number
    /** Loot of a hut robbery (§12): the haul is deliberately rich so a robbery
     *  can pay off despite the permanent regional fallout — money, gifts (capped
     *  by pack space) and provisions days. */
    robberyMoney: number
    robberyGifts: number
    robberyFoodDays: number
  }
  /** Item caches (design.md §6 camps). */
  camps: {
    /** Chance per travelled day that a stocked free camp is looted. */
    lootChancePerDay: number
    /** Radius in degrees for reopening/discovering a camp. */
    campRadiusDeg: number
  }
  /** First-person walk feel inside settlements (design.md §2, point 97). */
  walkFeel: {
    /** Velocity ease time constants (s): ramp up, settle down. */
    accelTau: number
    decelTau: number
    /** Step-phase radians advanced per metre walked (cadence). */
    stepCadence: number
    /** Head-bob amplitudes at full speed (m): vertical, lateral figure-eight. */
    bobAmp: number
    swayAmp: number
    /** Max strafe roll (deg) and its smoothing time constant (s). */
    maxRollDeg: number
    rollTau: number
    /** Barely-visible idle sway when standing (m, < 0.01) and its rate (rad/s). */
    idleSwayAmp: number
    idleSwayRate: number
  }
  /** §2.5 panorama wildlife: distant drifting silhouettes (points 92/94). */
  panoramaWildlife: {
    /** Ring distance beyond the settlement edge: innerRadius + inner..(+spread). */
    ringInner: number
    ringSpread: number
    /** Max subtended angle (deg) of a silhouette — scale is clamped down to it. */
    maxApparentAngleDeg: number
    /** Atmospheric-haze mix toward the sky horizon tone (0 base .. 1 sky). */
    hazeMix: number
    /** Feet sink below the visible horizon line so they never appear to float. */
    sinkEpsilon: number
  }
  /** Touch / tablet controls (design.md §17.5, point 84). Feel only — the
   *  gameplay speeds and sensitivities are unchanged. */
  touch: {
    /** Virtual-stick travel radius (px) and its resting dead zone (px). */
    stickRadius: number
    stickDeadZone: number
    /** Look-drag gain: multiplies the raw px delta before mouseSensitivity. */
    lookDragFactor: number
    /** Pinch gain: how strongly a finger-spread ratio drives the zoom (1 = raw). */
    pinchFactor: number
  }
  /** Trade economy (design.md §8/§10). */
  economy: {
    /** Base prices of the treasure finds in $ (before regional factors). */
    treasureBase: Record<Material | 'statue', number>
    /** Price multiplier where the material is revered (arbitrage margin). */
    reveredFactor: number
    /** Buy/sell spread on treasures: bazaar bids stay below asking prices. */
    sellSpread: number
    buySpread: number
    /** Haggling variance on a bazaar bid (± fraction). */
    bidVariance: number
    /** Ferry fare: minimum plus per-degree route cost (design.md §10). */
    ferryMinCost: number
    ferryCostPerDeg: number
    /** Passage duration: minimum days plus per-degree days. */
    ferryMinDays: number
    ferryDaysPerDeg: number
    /** Discovery bounties credited on the next port visit (design.md §10). */
    bountyVillage: number
    bountyLandmark: number
    /** Radius in degrees within which a landmark counts as discovered. */
    discoverRadiusDeg: number
    /** Total ivory pieces recoverable at the elephant graveyard (design.md §4.4). */
    graveyardIvory: number
    /** Random ivory yield per dig at the graveyard (uniform, averages ~5). */
    graveyardIvoryPerDig: { min: number; max: number }
    /** Fraction of the buy price the traveler gets back when selling gear. */
    equipmentSellFactor: number
  }
  /** Native-village trade (design.md §9/§10): gifts are the local currency. */
  village: {
    /** Gift-currency buy prices for the baseline goods sold in every village. */
    giftPrices: Partial<Record<EquipmentId | 'food', number>>
    /** Gifts paid to the traveler for one sold piece of gear. */
    sellGifts: number
  }
}

export const balance: BalanceConfig = {
  travelSpeed: 5.6, // reduced 30% from 8 for a calmer overland pace
  placeWalkSpeed: 10,
  placeStrafeFactor: 0.8,
  mouseSensitivity: 0.0011,
  ambienceVolume: 0.1,
  daysPerUnit: 0.2,
  foodPerDay: 1,
  foodUnitDays: 28, // one purchased food unit lasts four weeks (user calibration)
  terrainCost: {
    desert: 1.2,
    savanna: 1.0,
    jungle: 1.3, // with a machete (cleared path)
    mountain: 1.5, // with a rope (safe, fast)
    water: 2.0, // swimming, without a canoe
  },
  junglePenalty: 2.3, // no machete: 1.3 * 2.3 ≈ 3.0
  mountainPenalty: 1.67, // no rope: 1.5 * 1.67 ≈ 2.5
  canoeSpeedup: 3.0, // with a canoe water travel is 3x faster (user calibration)
  canoeLandPenalty: 2.5, // carrying the canoe: 2.5x slower on ANY land (user calibration: was 1.6, too weak)
  currentDrift: 0.2, // deg/s at full strength (~2 world units/s, ~35% of walking)
  currentWaterfallBoost: 4.0,
  currentWaterfallRadius: 0.5,
  mountainFall: {
    chancePerDay: 0.35,
    severeShare: 0.35,
    itemLossChance: 0.4,
  },
  digRadius: 3,
  placeEnterRadius: 2.5,
  oceanSwimMarginDeg: 1.2, // calibratable: swimmable coastal band width in degrees
  placeReentryMargin: 1, // small clearance beyond the enter radius before re-entry re-arms (user: shrunk from 2)
  goodwillForHint: 2,
  goodwillRevered: 2,
  goodwillNeutral: 1,
  randomEventsEnabled: true,
  // Per-day base probabilities (design.md §14). Reduced by a factor of 5 from
  // the earlier calibration on user request — events should be markedly rarer.
  events: {
    animalAttack: 0.004,
    robberAttack: 0.002,
    crocodile: 0.012,
    fever: 0.0024,
    sunblindness: 0.002,
    sandstorm: 0.0024,
    waterfallSweep: 0.024,
    findRemains: 0.0008,
    cooldownDays: 5,
  },
  deadline: {
    days: 1826, // about five years (design.md §5)
    warning1: 0.6,
    warning2: 0.85,
    successorDayPenalty: 30,
  },
  health: {
    max: 100,
    regenPerDay: 4,
    starvationDrain: 6,
    feverDrain: 8,
    dehydrationDrain: 10,
    sunblindDrain: 3,
    woundLightDrain: 2,
    woundSevereDrain: 7,
    woundHealLightDays: 6, // a light wound closes on its own in about a week (fed)
    woundHealSevereDays: 10, // a severe wound subsides to a light one (fed)
    dehydrationOnsetDays: 0.5,
    canteenDrainPerDay: 0.9, // consumption raised 200x (user request), offset by the 2000x capacity below
    canteenDesertDrainPerDay: 3.0, // 200x; desert is faster
    canteenCapacity: 500, // user calibration: reduced from 2000; a full canteen now lasts 500/0.9 ≈ 555 land days
    sunblindRecoveryDays: 3,
    poorThreshold: 40,
  },
  showHiddenObjects: false,
  inventoryCapacity: 20,
  reputation: {
    goodwillForFriend: 6,
    hostilityDays: 30,
    friendProtectRadiusDeg: 1.5,
    friendAidCooldownDays: 10,
    friendVillageFoodDays: 21,
    robberyMoney: 600, // rich cash haul (design.md §12): a robbery must be able to pay off
    robberyGifts: 24, // capped by free pack space
    robberyFoodDays: 40,
  },
  camps: {
    lootChancePerDay: 0.03,
    campRadiusDeg: 0.3,
  },
  walkFeel: {
    accelTau: 0.10, // brisk ramp-up, no rubber-banding
    decelTau: 0.06, // settles a touch faster than it starts
    stepCadence: 0.9, // step-phase rad per metre (≈ a stride every ~1.7 m at bob 2x)
    bobAmp: 0.045, // m vertical head bob at full speed
    swayAmp: 0.025, // m lateral figure-eight
    maxRollDeg: 2.5, // strafe lean
    rollTau: 0.09,
    idleSwayAmp: 0.004, // m — well under a centimetre
    idleSwayRate: 0.7,
  },
  panoramaWildlife: {
    ringInner: 55, // was +14..28: far too close, so the silhouettes loomed
    ringSpread: 30,
    maxApparentAngleDeg: 2.5, // a distant animal subtends only a couple degrees
    hazeMix: 0.55, // lift the flat near-black toward the sky horizon
    sinkEpsilon: 0.4, // feet just below the horizon line, never floating
  },
  touch: {
    stickRadius: 60, // px from the stick centre to full deflection
    stickDeadZone: 8, // px resting slack
    lookDragFactor: 1, // 1 = drag px maps 1:1 to mouse px through mouseSensitivity
    pinchFactor: 1, // 1 = raw finger-spread ratio drives the zoom
  },
  economy: {
    treasureBase: { gold: 60, silver: 35, emerald: 70, copper: 20, ivory: 45, statue: 150 },
    reveredFactor: 2.2,
    sellSpread: 0.85,
    buySpread: 1.25,
    bidVariance: 0.15,
    ferryMinCost: 15,
    ferryCostPerDeg: 1.2,
    ferryMinDays: 2,
    ferryDaysPerDeg: 0.35,
    bountyVillage: 15,
    bountyLandmark: 25,
    discoverRadiusDeg: 0.5,
    graveyardIvory: 24,
    graveyardIvoryPerDig: { min: 1, max: 9 }, // uniform 1..9 → average 5
    equipmentSellFactor: 0.5,
  },
  village: {
    giftPrices: { food: 1, medicine: 1, machete: 2, shovel: 2, rope: 1, canteen: 1 },
    sellGifts: 1,
  },
}

// Shop prices in $ (ports only; design.md §9/§10). Educated guesses.
export const prices = {
  food: 5, // one food unit (foodUnitDays of provisions, four weeks by default)
  medicine: 12,
  shovel: 20,
  rope: 15,
  canteen: 10,
  machete: 15,
  rifle: 60,
  canoe: 50,
  // Gift types are derived from the culture/value matrix (design.md §8).
  // OPEN: design.md does not define concrete purchasable gift items; the POC
  // maps gifts onto the matrix materials (gold/silver/emerald/copper/ivory).
  giftGold: 30,
  giftSilver: 12,
  giftEmerald: 28,
  giftCopper: 10,
  giftIvory: 22,
}

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__balance = balance
}

// Fixed by design.md — do not tune.
export const START_MONEY = 250
export const START_YEAR = 1890
/** Start provisions in days (5 weeks, from the checkpoint table example in design.md §18). */
export const START_FOOD_DAYS = 35
/** Start gifts (design.md §18 table example shows 2). */
export const START_GIFTS = 2
