// Central balance configuration (CLAUDE.md §2).
// All values below are calibratable educated guesses unless design.md fixes
// them explicitly (e.g. starting money 250 $, start year 1890). The debug
// menu (F1) exposes them at runtime for fine-tuning.

import type { Material } from '../world/geo'

export interface BalanceConfig {
  /** Travel speed on the continent map, world units per second (1 unit = 0.1 degree). */
  travelSpeed: number
  /** Walking speed inside places (first-person), meters per second. */
  placeWalkSpeed: number
  /** Mouse-look sensitivity in the first-person view, radians per pixel. */
  mouseSensitivity: number
  /** Volume multiplier for the ambience noise beds (wind/surf/murmur), 1 = full. */
  ambienceNoiseVolume: number
  /** Volume multiplier for the gust/swell modulation on the noise beds, 1 = full. */
  ambienceGustVolume: number
  /** In-game days that pass per world unit traveled on the map. */
  daysPerUnit: number
  /** Provisions consumed per in-game day (1.0 = one day's ration). */
  foodPerDay: number
  /** Terrain time-cost multipliers (more days per unit in rough terrain). */
  terrainCost: {
    desert: number
    savanna: number
    jungle: number
    jungleWithMachete: number
    mountain: number
    mountainWithRope: number
    water: number
    waterWithCanoe: number
  }
  /** Radius (world units) around the grave in which digging succeeds. */
  digRadius: number
  /** Radius (world units) around a place marker in which it can be entered. */
  placeEnterRadius: number
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
    /** Loot of a hut robbery: gifts and provisions days (§12). */
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
    /** Ivory pieces recoverable at the elephant graveyard (design.md §4.4). */
    graveyardIvory: number
  }
}

export const balance: BalanceConfig = {
  travelSpeed: 8,
  placeWalkSpeed: 10,
  mouseSensitivity: 0.0011,
  ambienceNoiseVolume: 0.2,
  ambienceGustVolume: 0.2,
  daysPerUnit: 0.2,
  foodPerDay: 1,
  terrainCost: {
    desert: 1.2,
    savanna: 1.0,
    jungle: 3.0,
    jungleWithMachete: 1.3,
    mountain: 2.5,
    mountainWithRope: 1.5,
    water: 2.0,
    waterWithCanoe: 0.5,
  },
  digRadius: 3,
  placeEnterRadius: 2.5,
  goodwillForHint: 2,
  goodwillRevered: 2,
  goodwillNeutral: 1,
  randomEventsEnabled: true,
  events: {
    animalAttack: 0.02,
    robberAttack: 0.01,
    crocodile: 0.06,
    fever: 0.012,
    sunblindness: 0.01,
    sandstorm: 0.012,
    waterfallSweep: 0.12,
    findRemains: 0.004,
    cooldownDays: 5,
  },
  deadline: {
    days: 1826, // about five years (design.md §19)
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
    robberyGifts: 3,
    robberyFoodDays: 7,
  },
  camps: {
    lootChancePerDay: 0.03,
    campRadiusDeg: 0.3,
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
    graveyardIvory: 3,
  },
}

// Shop prices in $ (ports only; design.md §9/§10). Educated guesses.
export const prices = {
  food: 5, // one week of provisions
  medicine: 12,
  map: 10,
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
