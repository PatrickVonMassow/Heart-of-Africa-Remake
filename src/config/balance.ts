// Central balance configuration (CLAUDE.md §2).
// All values below are calibratable educated guesses unless design.md fixes
// them explicitly (e.g. starting money 250 $, start year 1890). The debug
// menu (F1) exposes them at runtime for fine-tuning.

export interface BalanceConfig {
  /** Travel speed on the continent map, world units per second (1 unit = 0.1 degree). */
  travelSpeed: number
  /** Walking speed inside places (first-person), meters per second. */
  placeWalkSpeed: number
  /** Mouse-look sensitivity in the first-person view, radians per pixel. */
  mouseSensitivity: number
  /** Volume multiplier for the ambience noise beds (wind/surf/murmur), 1 = full. */
  ambienceNoiseVolume: number
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
  /** Random events enabled (design.md §14) — POC: no random events implemented. */
  randomEventsEnabled: boolean
  /** Show hidden objects (grave position) — debug aid, default off. */
  showHiddenObjects: boolean
}

export const balance: BalanceConfig = {
  travelSpeed: 8,
  placeWalkSpeed: 7.5,
  mouseSensitivity: 0.0011,
  ambienceNoiseVolume: 0.2,
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
  showHiddenObjects: false,
}

// Shop prices in $ (ports only; design.md §9/§10). Educated guesses.
export const prices = {
  food: 10, // one week of provisions
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
