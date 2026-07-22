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
  /** Seconds an inhabitant may be physically pinned (no real movement while it
   *  has a walk target) before it is teleport-nudged to the nearest free spot
   *  (point 155) — a small invisible correction, inhabitants only. */
  walkerUnstuckSeconds: number
  /** Mouse-look sensitivity in the first-person view, radians per pixel. */
  mouseSensitivity: number
  /** Single ambience volume: the noise beds (wind/surf/murmur), their gust/swell
   *  modulation and the proximity animal calls are all scaled by it (1 = full). */
  ambienceVolume: number
  /** Relative loudness of footsteps under the master ambience volume (user
   *  request: footsteps twice as loud as the rest). */
  footstepVolume: number
  /** Relative loudness of every NON-footstep ambient sound (beds, calls, the
   *  interaction chime/"ding-dong") under the master ambience volume (user
   *  request: half as loud as before). */
  ambientVolume: number
  /** Per-source multiplier on the birdsong voice (point 153): a debug-editable
   *  slider over the single ambience volume, so the birds can be turned down on
   *  their own. 1 = the design gain, 0 = silent. */
  birdsongVolume: number
  /** Coastal surf fade (point 153, design.md §19.1): the ocean-surf bed is only
   *  audible near the coast — full within `nearRadius`, silent at/beyond
   *  `cutoff`, smooth between, keyed on the distance to the nearest coast in
   *  degrees. Calibratable by ear at the debug travel speed. */
  surf: {
    nearRadius: number
    cutoff: number
  }
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
    /** TEMPORARY (design.md §5.1): while false the expedition never ends on
     *  time — the calendar stops at 31.12.1895 instead. Flip to true to get
     *  the §5 recall and the §18 successor flow back. */
    enabled: boolean
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
    /** Dry-season shore guarantee (point 135c): minimum drinkers at the
     *  nearest water in the traveller's view once the land has dried. */
    dryShoreMinDrinkers: number
    /** Ring distance beyond the settlement edge: innerRadius + inner..(+spread). */
    ringInner: number
    ringSpread: number
    /** Max subtended angle (deg) of a silhouette — scale is clamped down to it. */
    maxApparentAngleDeg: number
    /** Atmospheric-haze mix toward the sky horizon tone (0 base .. 1 sky). */
    hazeMix: number
    /** Feet sink below the visible horizon line so they never appear to float. */
    sinkEpsilon: number
    /** Clearance (deg) added around a fixed skyline landmark's footprint: no
     *  drifting silhouette enters that azimuth span, so none crosses the
     *  monument (design.md §2.5, point 102). */
    landmarkMarginDeg: number
    /** Minimum region-typical bird's-eye animals seeded near a settlement so
     *  its vicinity is never empty (point 102). */
    vicinityMinAnimals: number
    /** Radius (world units) around a settlement's leave point within which that
     *  minimum presence is guaranteed (≈ 1.5× the default-zoom view ring). */
    vicinityRadius: number
  }
  /** Touch / tablet controls (design.md §17.5, point 84). Feel only — the
   *  gameplay speeds and sensitivities are unchanged. */
  /** Calf/parent water drama (design.md §19.8, point 122). */
  waterDrama: {
    /** Seconds a strong current may carry an animal before it drowns. */
    drownSeconds: number
    /** Effective flow at/above which self-rescue fails and drowning starts. */
    drownFlowThreshold: number
    /** Seasonal multiplier on the drama current at wetness 0 (dry season). */
    dryFlowFactor: number
    /** Seasonal multiplier on the drama current at wetness 1 (full rains). */
    wetFlowFactor: number
    /** Chance per finished gambol bout AT a dry-season lake bank to mire (point 123). */
    mireChancePerBout: number
    /** Local wetness below which a lake bank turns to miring mud. */
    mireDrynessThreshold: number
    /** Seconds a mired calf struggles before the mud releases it (no predator came). */
    mireSeconds: number
  }
  /** The vigil at a calf's carcass (design.md §19.8, point 121). */
  vigil: {
    /** Seconds the bereaved parent holds the vigil before rejoining the herd. */
    seconds: number
    /** Seconds of standing vigil after which the carcass draws a predator to the keeper. */
    predatorDelay: number
  }
  /** The elephants' mourning vigil (design.md §19.8, point 126): a herd whose
   *  centre passes near the graveyard's bones — or a dead herd-mate — walks
   *  in, lowers its heads over them and holds, then moves on. A vigil, not a
   *  sacrifice: nothing dies of it. */
  mourn: {
    /** Seconds the herd holds at the bones before moving on (the walk-in is granted on top). */
    seconds: number
    /** Radius (world units) around the mourn target that draws a passing herd. */
    radius: number
  }
  /** The parent's defence (design.md §19.8, points 124/125/146): a parent
   *  ATTACKING the predator over its calf resolves three ways (one roll,
   *  parentAttackOutcome in wildlifeBehavior.ts) — taken, or the hunt driven
   *  off at preyWeapon[prey] × predatorFlight[predator] (capped 0.95), or the
   *  predator KILLED outright at max(0, preyWeapon − 0.5) × killFlight
   *  (capped 0.95; always ≤ the drive-off chance). A species missing on
   *  either side never defends. Grief surrenders (vigil, trample-throw,
   *  waterfall plunge, mired calf) never roll at all. Calibratable. */
  parentDefense: {
    /** Per-prey weapon strength, reasoned from the animal's real armament. */
    preyWeapon: Record<string, number>
    /** Per-predator readiness to abandon a contested kill — INVERSE to §14.1's
     *  danger order cheetah < leopard < hyena < lion (src/systems/events.ts). */
    predatorFlight: Record<string, number>
    /** Per-predator fragility under a strong parent's strike (point 146):
     *  the kill factor of the revenge outcome. Kept LOW — being eaten stays
     *  the common ending; the user asked for sometimes, not often. */
    killFlight: Record<string, number>
  }
  /** The crocodile ambush (design.md §19.16, point 130). */
  crocodile: {
    /** Bank visitors inside this radius of a hidden crocodile trigger the lunge. */
    strikeRadius: number
    /** Speed of the lunge burst (units/s) — visible motion, never a teleport. */
    lungeSpeed: number
    /** Hard cap on the gripped hold (s, point 186): the grip normally ends with the
     *  victim's caught-countdown, but a victim that VANISHES mid-grip (streamed out
     *  in a chunk despawn, taken by another system) would freeze it forever, so the
     *  crocodile releases and submerges after this window no matter what — the §19.8
     *  "every started drama resolves" rule. Above the ~5 s caught window so a normal
     *  kill is never cut short. */
    gripSeconds: number
  }
  /** Purposeful water crossings (point 192 — the user's water-rule revision:
   *  animals may cross rivers/lakes and flee into them; never the ocean). */
  waterCross: {
    /** Farthest swimmable channel width in world units — a wider water reads
     *  as a barrier and the mover deflects along the bank instead. */
    maxUnits: number
    /** Chance a roam blocked by water starts a crossing instead of turning. */
    chance: number
    /** Hard resolve deadline in seconds (invariant I4): a crossing that has
     *  not landed by then ends where it stands and the setback grounds it. */
    resolveSeconds: number
  }
  /** The scripted hunt (design.md §19.3). */
  hunt: {
    /** Walk-off overtime (point 188): a leaving predator still inside the view
     *  ring after this many seconds retires as soon as it is OFF the rendered
     *  frame — a coast pocket can never pin it pacing forever, while "never
     *  despawns in sight" holds via the frustum projection. */
    leaveOvertimeSeconds: number
  }
  /** Family rescue drives (design.md §19.8, point 127). */
  family: {
    /** Adrenaline burst: a rescuing parent's speed is its ordinary walk (3)
     *  times this factor — ONE rule for charge, shield, guard and wade.
     *  Grief drives (vigil walk, trample charge, waterfall plunge) are not
     *  rescues and stay off it. */
    rescueBurst: number
    /** Fraction of a herd group raised as calves (design.md §19, point 169):
     *  a group of N gets clamp(round(fraction·N), 1, floor(N/2)) calves, each
     *  linked to its own parent — so the family dramas happen more often.
     *  Calibratable/debug-editable. */
    calfFraction: number
    /** Calf leash (design.md §19.8): a calf may stray this far (world units)
     *  from its parent before the follow yank pulls it back in — wide enough
     *  that the family dramas read spatially. Calibratable/debug-editable. */
    followRadius: number
    /** Play range (design.md §19.8): calves gambol only while within this of
     *  the parent, and the leashed scamper orbits inside it (the outward step
     *  dies at the edge). Scales with the leash. Calibratable/debug-editable. */
    gambolRange: number
    /** Length (seconds) of one gambol hop-bout — how long the young hop
     *  around before a bout ends; the idle gap between bouts stays fixed in
     *  the scene. Calibratable/debug-editable. */
    gambolBoutSeconds: number
  }
  /** Rivers (design.md §11.3, point 136). */
  river: {
    /**
     * Widens every river against the strictly-scaled 0.17° base — a deliberate
     * playability-over-scale trade (user decision): canoe navigation on the
     * true width was fiddly. Read at build time (terrain sampling, ribbon
     * geometry, water-edge rules derive from it at init); a debug edit
     * applies on the next reload.
     */
    widthFactor: number
  }
  season: {
    /** Master factor for the seasonal weather look (0 disables, 1 full; design.md §19/§21). */
    weatherStrength: number
    /** How far the Nile's October crest lifts its surface (world units). */
    nileFloodRise: number
  }
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
  walkerUnstuckSeconds: 4, // an inhabitant wedged this long is teleport-nudged free (point 155)
  mouseSensitivity: 0.0011,
  ambienceVolume: 0.1,
  footstepVolume: 2, // footsteps twice as loud as the rest (user request)
  ambientVolume: 0.5, // every other ambient sound half as loud (user request)
  birdsongVolume: 1, // per-source birdsong slider (point 153); 1 = design gain
  surf: { nearRadius: 0.4, cutoff: 3 }, // surf full within 0.4° of the coast, silent beyond 3° (point 153, calibratable)
  daysPerUnit: 0.2,
  foodPerDay: 0, // demo start preset (point 104): no hunger by default; debug-editable
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
  randomEventsEnabled: false, // demo start preset (point 104): events off by default; debug toggle
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
    enabled: false, // suspended for now (design.md §5.1) — the date stops at 31.12.1895
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
    canteenDrainPerDay: 0, // demo start preset (point 104): no thirst by default (was 0.9); debug-editable
    canteenDesertDrainPerDay: 0, // demo start preset (point 104): was 3.0; debug-editable
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
    dryShoreMinDrinkers: 4, // the dry season VISIBLY gathers life at the water
    ringInner: 55, // was +14..28: far too close, so the silhouettes loomed
    ringSpread: 30,
    maxApparentAngleDeg: 2.5, // a distant animal subtends only a couple degrees
    hazeMix: 0.55, // lift the flat near-black toward the sky horizon
    sinkEpsilon: 0.4, // feet just below the horizon line, never floating
    landmarkMarginDeg: 8, // clearance around Giza / Table Mountain
    vicinityMinAnimals: 6, // region-typical animals guaranteed near a settlement
    vicinityRadius: 75, // ≈ 1.5× the default-zoom view ring (VIEW_AT_ZOOM1·0.5)
  },
  waterDrama: {
    drownSeconds: 30, // calibratable: how long the current may carry an animal
    drownFlowThreshold: 0.8, // reached only by a wet-amplified or mid-channel flow
    dryFlowFactor: 0.6, // dry-season rivers run tame — self-rescue always wins
    wetFlowFactor: 1.8, // the rains swell the current past the drown threshold
    mireChancePerBout: 0.35, // per bout ENDING at a dry lake bank — the bank visits are already rare
    mireDrynessThreshold: 0.25, // wetness below this turns the shrinking bank to mud
    mireSeconds: 45, // the mud releases an unfound calf — the drama always resolves
  },
  vigil: {
    seconds: 60, // calibratable: how long the parent stands vigil before rejoining the herd
    predatorDelay: 12, // calibratable: vigil seconds until the carcass draws a predator to the keeper
  },
  mourn: {
    seconds: 30, // calibratable: how long the herd holds at the bones before moving on
    radius: 25, // calibratable: how close a herd's centre must pass for the bones to draw it in
  },
  parentDefense: {
    // Prey side — the weapon is the argument (point 125 grounding pass):
    preyWeapon: {
      giraffe: 1.5, // a cow's kick genuinely kills lions — the user's named case; ×0.5 (lion) = the 0.75 point 124 shipped
      zebra: 1.0, // the kick breaks predator jaws; stallions are recorded maiming pursuers
      wildebeest: 0.7, // horns and bulk: bulls gore and toss the lighter cats
      warthog: 0.7, // tusks: warthogs are documented driving cheetahs off their own kills
      antelope: 0.25, // the generic antelope has no weapon — hooves and luck
      lion: 2.0, // the lioness defending her cubs (point 145c): claws and bulk dominate a lone hyena — ×0.7 (hyena flight) caps defendChance at 0.95, killChance ~0.22
    },
    // Predator side — readiness to abandon, INVERSE to §14.1's tested danger
    // order cheetah < leopard < hyena < lion (src/systems/events.ts):
    predatorFlight: {
      cheetah: 1.0, // the lightest cat famously abandons rather than risk any injury
      leopard: 0.85, // solitary — an injury means starving, so it yields to real resistance
      hyena: 0.7, // bold in the clan, but a lone hunter breaks off under a strong defence
      lion: 0.5, // the apex rarely yields; even the giraffe's kick only sometimes deters it
      crocodile: 0.35, // a locked bite rarely lets go — yet buffalo and elephants are recorded driving crocodiles off a seized victim (point 130)
    },
    // Kill side (point 146) — how fragile the predator is under a genuinely
    // strong parent's strike. The (preyWeapon − 0.5) gate in killChance
    // encodes "a RELATIVELY STRONG parent": the antelope (0.25) kills
    // nothing, by construction. Values kept low (register: sometimes, not
    // often — being eaten stays the common ending).
    killFlight: {
      cheetah: 0.5, // light and famously fragile — a giraffe's or zebra's kick genuinely kills it
      leopard: 0.25, // sturdier than the cheetah; a lucky strike can still break it
      hyena: 0.15, // heavy-boned and thick-necked — a kick rarely does more than drive it off
      lion: 0, // STRUCTURALLY ZERO: nothing kills a lion — §19's drama depends on it staying frightening
      crocodile: 0, // STRUCTURALLY ZERO: no hoof or horn breaks the armoured crocodile — drive-off is the only defence (point 130)
    },
  },
  family: {
    // Calibratable: ordinary walk (3) × 2 = 6 — clearly faster than roaming,
    // yet the shield still meets the hunter (6 > 5.6) and the too-late death
    // stays reachable at its staged distances (point 127's balance guard).
    rescueBurst: 2,
    // Calibratable (point 169): ~a quarter of each herd group is calves, so a
    // group of 8 raises 2 and a group of 4 raises 1 (floor(N/2) caps it so every
    // calf keeps its own distinct parent). Was effectively one calf per group.
    calfFraction: 0.25,
    // Calibratable (user decision: 3× the old 1.8 leash): the wider roam makes
    // the sacrifice/shield/flight dramas readable as separate bodies. The
    // rescue burst still closes this gap well inside the caught window
    // (6 units/s × 5 s = 30 ≫ gambolRange + the too-late distance).
    followRadius: 5.4,
    // Calibratable (scaled 3× with the leash, was the fixed 4): the scamper
    // orbit's outer edge. The leash damping has no cancellation point at any
    // range, so widening it cannot reintroduce the play/follow jitter.
    gambolRange: 12,
    // Calibratable: one hop-bout now runs 8 s (was 16 s × 0.25 = 4 s), so the
    // young visibly hop around before settling; the 12 s idle gap is unchanged.
    gambolBoutSeconds: 8,
  },
  crocodile: {
    strikeRadius: 5, // calibratable: bank visitors inside this of a hidden crocodile trigger the lunge
    lungeSpeed: 12, // calibratable: the burst speed of the lunge — fast and short, never a teleport
    gripSeconds: 8, // calibratable: hard release cap on the grip (> the ~5 s caught window) so a vanished victim never pins the crocodile (point 186)
  },
  waterCross: {
    maxUnits: 6, // calibratable: swimmable channel width (point 192) — the widened rivers span ~2-4 units
    chance: 0.3, // calibratable: how often a water-blocked roam crosses instead of turning
    resolveSeconds: 25, // calibratable: crossing hard deadline (I4) — a normal swim needs ~3-6 s
  },
  hunt: {
    leaveOvertimeSeconds: 45, // calibratable: walk-off overtime before an off-frame retire (point 188) — generous vs the ~20 s a clear walk-off needs
  },
  river: {
    widthFactor: 1.6, // wider-than-scale rivers for canoe playability (point 136)
  },
  season: {
    weatherStrength: 1, // full seasonal atmosphere; calibratable, debug-editable
    nileFloodRise: 0.55, // the unregulated 1890 flood is dramatic; calibratable
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
