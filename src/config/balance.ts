// Central balance configuration (CLAUDE.md §2).
// All values below are calibratable educated guesses unless design.md fixes
// them explicitly (e.g. starting money 250 $, start year 1890). The debug
// menu (F1) exposes them at runtime for fine-tuning.

import type { Material } from '../world/geo'
import type { EquipmentId } from '../state/store'

interface BalanceConfig {
  /** Travel speed on the continent map, world units per second (1 unit = 0.1 degree). */
  travelSpeed: number
  /** Walking speed inside places (first-person), meters per second. */
  placeWalkSpeed: number
  /** Speed factor for strafing and walking backward inside places (design.md §2). */
  placeStrafeFactor: number
  /**
   * How high a scattered stone's top may stand, in metres, and still be GROUND
   * rather than an obstacle (design.md §16, work-order 1149). A stone below it
   * raises the ground under the walk the way an excavation's spoil does — the
   * player and every villager ride up and over it — and it leaves the collider
   * set. A stone at or above it keeps its collider and stays something to walk
   * around. Calibratable (CLAUDE.md §2, design.md §14) and strictly below
   * `villageLife.bankGame.climbableRockTop`, so no stone is ground and climbing
   * stone at once.
   */
  placeStepOverTop: number
  /** Seconds an inhabitant may be physically pinned (no real movement while it
   *  has a walk target) before it is teleport-nudged to the nearest free spot
   *  (point 155) — a small invisible correction, inhabitants only. */
  walkerUnstuckSeconds: number
  /** Calibratable minimum displacement in metres for an inhabitant's escape
   *  search. The caller's home anchor is exempt as the final fallback. */
  walkerUnstuckMinDistance: number
  /** The PLAYER's own escape from a wedge (work-order 604): the key frees him,
   *  the detection only tells him the key exists. The lengths are calibrated for
   *  the walking scale of a settlement; the bird's-eye view scales them by the
   *  ratio of its own travel speed, so "half a step of progress" means the same
   *  thing on the continent map. */
  unstuck: {
    /** How far he must get from where the stall began before that counts as
     *  movement, in metres. */
    stallDistance: number
    /** Seconds of HELD movement input without that progress before the hint shows. */
    stallSeconds: number
    /** How far the outward search for free ground looks, in metres. */
    searchRadius: number
    /** Ring spacing of that search, in metres. */
    searchStep: number
  }
  /** How deep the traveller wades into a settlement's river before he is out of
   *  his depth, in metres (work-order 584). It is the settlement's walkable
   *  region ON the water: he walks down the drawn shore this far, and past it
   *  the boundary ends and the bird's-eye view — where the river is swum and the
   *  current carries him — takes over. Nothing ever HOLDS him at the water. */
  bankWadeDepth: number
  /** How deep the water stands where a water carrier fills his jar, in metres
   *  (work-order 1087). The fill spot is solved on the shore profile at this
   *  depth rather than pinned to a distance, so it stays at the waterline
   *  whatever the calibratable river width does to it. Ankle-deep: he stands IN
   *  the water, which is what makes the act read as fetching from the river,
   *  and far short of `bankWadeDepth`, so filling is never wading. */
  bankFillDepth: number
  /** How long the jar stays under, in seconds (work-order 1087) — the readable
   *  hold between the dip going down and the jar coming up full. */
  bankFillSeconds: number
  /** The jar's tip through the fill (work-order 1117, design.md §13.4): its
   *  MOUTH goes into the water, never the vessel. Angles and offsets are in the
   *  carrying hand's own frame, reached at the bottom of the dip. */
  bankFillJar: {
    /** Tip about the hand's x axis, mouth forward and down (rad). */
    tilt: number
    /** Jar centre's distance from the grip toward the mouth (m): the hand holds it near the base. */
    reach: number
    /** How far up the arm the grip sits during the tip (m). */
    lift: number
  }
  /** The ring the surface answers the dip with (work-order 1117), at the jar's
   *  mouth for as long as the fill phase runs. */
  bankFillRing: {
    /** Rings drawn at once, evenly staggered in phase. */
    count: number
    /** Seconds one ring takes to spread from `startRadius` to `endRadius`. */
    period: number
    startRadius: number
    endRadius: number
    /** Opacity of a newborn ring at the full dip; it fades as it spreads. */
    opacity: number
  }
  /** How far past the settlement's waterline the landscape backdrop turns map
   *  LAND into water, filling the gap between the drawn river and the map's
   *  own river course (work-order 1250), in place metres. */
  backdropRiverFillReach: number
  /** How many filled jars the village water stand holds before a new delivery
   *  replaces the oldest (work-order 1087). */
  waterStandCapacity: number
  /** Arrival tolerance at the separate working spots beside the water stand. */
  waterStandArrivalRadius: number
  /** Arrival tolerance at the fill spot in the river (work-order 1117), so the
   *  carrier dips ankle-deep rather than from the dry edge. */
  bankFillArrivalRadius: number
  /** The settlement edge painted on the ground (design.md §2.6, point 352/488):
   *  where the swept, trodden ground gives way to open land. The band's PLACE is
   *  never configured — it sits at the boundary the leave check reads
   *  (`src/scenes/place/boundary.ts`); only its look is calibratable. */
  placeEdgeBand: {
    /** How wide the give-way reads, in metres (the full ramp, centred on the boundary). */
    widthM: number
    /** How far the outline may meander off the true boundary, in metres. Hard-capped
     *  by `EDGE_BAND_MAX_WANDER_M`: it may look natural, it may not mislead. */
    wanderM: number
    /** Master strength of the whole edge, 0 (invisible) .. 1 (the full per-kind look). */
    strength: number
  }
  /** The blood a kill or a trample soaks into the ground (design.md §19.5,
   *  points 267/323): how big the patch reads and how ragged its outline runs. */
  bloodStain: {
    /** Size factor on every patch's radius (1 = the base ~0.9 m kill patch). */
    sizeScale: number
    /** How far the seeded outline swings off that radius, as a fraction of it:
     *  0 draws a machined circle, 0.25 a clearly ragged one. Hard-capped by
     *  `STAIN_MAX_IRREGULARITY` so the contour can never fold through itself. */
    irregularity: number
  }
  /** Mouse-look sensitivity in the first-person view, radians per pixel. */
  mouseSensitivity: number
  /** Vertical first-person look clamp in DEGREES from the horizon (design.md
   *  §17.5, point 392): how far up and down the view may pitch. Calibratable,
   *  but structurally capped just short of vertical (`PITCH_LIMIT_CEILING_DEG`
   *  in src/systems/lookPitch.ts) so the world can never roll over. */
  lookPitchLimitDeg: number
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
  /** The last stage of the audio graph (design.md §19.1): a fixed transfer
   *  curve between the master gain and the destination, so no coincidence of
   *  buses can leave the mix above full scale. Both values are ESTIMATES
   *  (calibratable, CLAUDE.md §2) chosen from the measured worst case of 1.336:
   *  the mix is identity below `threshold` and bends smoothly towards — never
   *  onto — `ceiling` above it. `threshold` sits just UNDER the everyday single
   *  close voice (0.932), which therefore enters the knee and gives up 0.14 dB
   *  — an order of magnitude below audibility, and the price of a knee with
   *  room to bend: lifting the threshold clear of that voice would leave only
   *  0.018 between it and the ceiling and turn the stage into the hard clipper
   *  it exists to prevent. A lone drum strike (0.249) or footstep is under it
   *  outright. `ceiling` keeps 0.45 dB under full scale, which is where a mix
   *  is mastered to and the most the destination may then be handed. */
  mixLimiter: {
    threshold: number
    ceiling: number
  }
  /** The optional meaningless village drum BED (not the message drums). It is
   *  silent by default so it cannot be mistaken for communication; the switch
   *  and every calibration value remain exposed in the debug menu. */
  drumBed: {
    /** Debug audition switch. False is the shipped, silent state. */
    enabled: boolean
    /** Seconds between the eight subdivisions of a bar. */
    stepSeconds: number
    /** Number of varied bars in one phrase before the audible pause. */
    phraseBars: number
    /** Random bounds of the silence after each phrase. */
    phraseGapMinSeconds: number
    phraseGapMaxSeconds: number
    /** Per-village tempo and pitch spread around the values above/below. */
    tempoSpread: number
    pitchSpread: number
    /** Pitch fall and body length of the low, soft bed membrane. */
    pitchStartHz: number
    pitchEndHz: number
    hitSeconds: number
    /** How much one secondary accent moves around the phrase (0..1). */
    accentShift: number
    /** When thinning reaches its maximum, and how much it stretches pauses. */
    thinAfterSeconds: number
    thinMaxGapFactor: number
    /** Layer gains while inside a village and while passing nearby. */
    villageGain: number
    nearbyGain: number
  }
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
  /**
   * How much room the settlement scene gives its inhabitants, as a MULTIPLE of
   * the walkable radius the place scene was first built at (point 1173, user
   * 21.09.2026). It is the ONE handle on the settlement's size: `PLACE_RADIUS`
   * is this factor times that base, and station placement, the children's
   * quarter, the huts and the collision fabric all derive from it.
   *
   * CALIBRATABLE, and both the reason it exists and its CEILING are measured.
   * At 1.0 every teaching voice of the communication slice cleared every other
   * by EXACTLY the hearing radius and no more, and it bought that clearance by
   * shrinking the children's ground to its 4 m floor.
   *
   * The ceiling is `communication.call.reach`: the bank stage moves out with the
   * waterline while the children's quarter stays among the huts, so a round's
   * called words have further to carry the wider the settlement is. Measured at
   * 1.15 a call from the quarter reached the documented spectator stand at 36 m
   * against a 34 m register and was not heard at all. 1.1 is the last value that
   * holds it; going past it is a CALL-REACH decision, not a layout one.
   */
  settlementRoom: number
  /**
   * Walkable room, in metres, the settlement boundary keeps around every scene
   * ground with a performer (children's quarter, bank stage, dig sites, water
   * errand, loom, chief's hut, market, the fishers' fire and mortar, the fixed
   * vignettes; `sceneGrounds.ts`) — `boundary.ts` grows the boundary per
   * bearing until it holds; the layout does not move. CALIBRATABLE (work-order
   * 1252, raised 1273): a ground of radius r fills the reference viewport's
   * width (73.4 deg) from r / sin 36.7 deg, i.e. ~0.67 r past its rim; the
   * widest ground (a bank stage, r 12) needs 8.07 m, the fishers' fire (~4 m)
   * under 3. The edge band (`placeEdgeBand.widthM` 8, centred on the boundary)
   * reaches 4 m (+0.4 wander) inside, but its visible fall is only the last
   * ~1.4 m (measured in polish settlement-edge); inside that the ground reads
   * as the village's own. 8.5 m thus leaves ~7 m before the visible edge and
   * 4.1 m clear of the band's nominal extent. Toward the river the wade limit
   * stays the edge.
   */
  observerMargin: number
  /**
   * Settlement collision radius as a SHARE of `placeEnterRadius` (design.md
   * §11): the bird's-eye traveller cannot walk through a settlement's
   * footprint. Must stay <= 1 so the "Space to enter" prompt always arms at or
   * OUTSIDE the collision boundary — a larger collider would stop the traveller
   * before the enter radius and no place could ever be entered.
   */
  placeCollisionFactor: number
  /** How far (degrees) off the coast the sea stays swimmable (design.md
   *  §11.2); beyond it the open ocean blocks movement even inside bays. */
  oceanSwimMarginDeg: number
  /** Way out of blocked water the traveller already stands in (point 1212). */
  strandedExit: {
    /** Ring spacing of the search for the nearest open spot, world units. */
    searchStep: number
    /** Farthest the search looks, world units. */
    searchRadius: number
    /** Least cosine between an allowed step and the way to the exit. */
    minHeadingCos: number
  }
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
    /** Radius in degrees around a friend region's villages with protection. */
    friendProtectRadiusDeg: number
    /** Days between two aid deliveries when close to death (§12). */
    friendAidCooldownDays: number
    /** Provisions level a friend village tops the traveler up to. */
    friendVillageFoodDays: number
  }
  /** Item caches (design.md §6 camps). */
  camps: {
    /** Chance per travelled day that a stocked free camp is looted. */
    lootChancePerDay: number
    /** Radius in degrees for reopening/discovering a camp. */
    campRadiusDeg: number
  }
  /** Bird's-eye follow camera (point 1286): smoothing time constant (s) and
   *  the follow lag (world units) beyond which it snaps instead of sliding. */
  travelCameraFollow: {
    tau: number
    snapDistance: number
    /** Fraction (0..1) of the oblique view's north/south ground-reach
     *  asymmetry the camera compensates by moving south with an unchanged
     *  tilt (design.md §2.1): 1 = as far south as north (shift ≈ 7.5 units at
     *  the default zoom, traveller ≈ 37 % from the top), 0 = traveller centred. */
    southReachCompensation: number
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
    /** Ring distance beyond the settlement edge: innerRadius + inner..(+spread),
     *  the spread shortened where the §2.5 band leaves less room. */
    ringInner: number
    ringSpread: number
    /** Depth spread an open-plain site keeps (Giza): its walkable radius is
     *  derived from `ringInner + openPlainRingSpread`, not the full spread. */
    openPlainRingSpread: number
    /** Angle (deg) a giraffe subtends at mid-ring distance from the settlement
     *  centre; every species shares the factor this sets (work-order 1285). */
    giraffeTargetDeg: number
    /** True standing height (m, crown/head) per skyline species; only their
     *  ratios matter, the shared factor sets the drawn size. */
    speciesHeight: { elephant: number; giraffe: number; zebra: number; antelope: number }
    /** Safety net only: max subtended angle (deg) of a silhouette. */
    maxApparentAngleDeg: number
    /** Atmospheric-haze mix toward the sky horizon tone (0 base .. 1 sky). */
    hazeMix: number
    /** Pelt-marking contrast kept on the hazed silhouette (0 flat tint .. 1
     *  full pelt contrast) and the band widening (< 1 = fewer, broader bands),
     *  so a skyline zebra still reads striped and a gazelle banded. */
    markContrast: number
    markBandScale: number
    /** Height multiplier of the gazelle's dark flank band on the silhouette. */
    markFlankWiden: number
    /** Feet sink below the visible horizon line so they never appear to float,
     *  in the silhouette's model units (scaled with it). */
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
  /** How the settlement river's current READS (design.md §11.3, work-order
   *  1280): the speed its pattern and flotsam drift at, and the flotsam mix. */
  riverCurrent: {
    /** Drift speed of the drawn current at a season factor of 1, in m/s. The
     *  season scales it with `waterDrama.dryFlowFactor` / `wetFlowFactor` — the
     *  gameplay current's own factors — so dry 0.6 → 0.78 m/s, wet 1.8 → 2.34. */
    driftBaseSpeed: number
    /** Shares of the drifting flotsam by kind; normalised, so only the ratio
     *  matters. Foam patches carry the old reading, the rest is the debris a
     *  river carries past a village. */
    flotsamMix: { foam: number; leaf: number; grass: number; twig: number }
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
     *  danger order cheetah < leopard < hyena < lion (src/systems/events.ts);
     *  the crocodile, outside that order, is set on its own. */
    predatorFlight: Record<string, number>
    /** Per-predator fragility under a strong parent's strike (point 146):
     *  the kill factor of the revenge outcome. Kept LOW — being eaten stays
     *  the common ending; the user asked for sometimes, not often. */
    killFlight: Record<string, number>
  }
  /** The crocodile ambush (design.md §19.16, points 130/268/275). */
  crocodile: {
    /** Bank visitors inside this radius of a hidden crocodile trigger the lunge. */
    strikeRadius: number
    /** Broadened ambush reach (point 275): a prey standing at the WATERLINE (its
     *  feet on land) up to this distance from a hidden crocodile is a legal target
     *  even without a formal drink pose, so a wandering grazer stepping to the bank
     *  can be ambushed. Kept small so the croc never snatches a grazer far up the
     *  shore — the ambush stays occasional and never clears the whole bank. */
    ambushBankBand: number
    /** Feed mouth anchor (point 268): the local forward reach along the crocodile's
     *  +z axis at which the seized victim lies — its JAWS end, not its back. Scaled
     *  by the instance size and rotated by the croc's facing to place the victim. */
    mouthOffsetLocal: number
    /** Speed of the lunge burst (units/s) — visible motion, never a teleport. */
    lungeSpeed: number
    /** Speed (units/s) of the DRAG-INTO-WATER leg (point 383): §19.16's kill is
     *  hauled back into the river — the feed never happens on the bank. Fast
     *  enough to read as part of the seizure, slow enough to be seen. */
    dragSpeed: number
    /** Hard deadline on that haul (s, invariant I4): a drag that cannot reach
     *  water settles where it stands rather than pinning the drama forever. */
    dragSeconds: number
    /** Hard cap on the gripped hold (s, point 186): the grip normally ends with the
     *  victim's caught-countdown, but a victim that VANISHES mid-grip (streamed out
     *  in a chunk despawn, taken by another system) would freeze it forever, so the
     *  crocodile releases and submerges after this window no matter what — the §19.8
     *  "every started drama resolves" rule. Above the ~5 s caught window so a normal
     *  kill is never cut short. */
    gripSeconds: number
    /** Rest after a DRIVE-OFF (s, point 130 under the broadened waterline
     *  trigger): a crocodile the parent repelled keeps to its water this long
     *  before it may take a new ambush target. Without it the freed victim,
     *  still standing at the bank, is a legal target again the very next frame
     *  and the croc re-seizes it at once — the rescue would read as failed. */
    driveOffRestSeconds: number
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
    /** Swim-out after a flight: the landing bank must lie at least this
     *  multiple of each threat's trigger ring (traveller shy ring, predator
     *  flee radius) from that threat, so the animal never swims back into the
     *  ring it just fled and re-triggers the flight at the waterline. */
    fleeBankClearance: number
    /** Arrival radius of a swim: within this of its bank target the animal is
     *  set onto the target and the swim ends, so a waterline a hair before the
     *  target can never stall it until the deadline. */
    arriveUnits: number
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
    /** Juvenile prey preference (design.md §19.8, point 245): the chance a
     *  fresh hunt seeks a nearby JUVENILE (over a generic grazer) so the family
     *  sacrifice/shield/flight drama plays out on screen. Juveniles are the
     *  preferred prey of EVERY predator; raised well above half.
     *  Calibratable/debug-editable. */
    juvenilePreyBias: number
    /** Crocodile drinking-juvenile bias (design.md §19.16/§19.8, point 245): a
     *  calf/foal drinking at a bank is the STRONGLY preferred lunge target
     *  (weight, ≫ 1 = an adult's), so the §19.8 sacrifice/rescue drama fires
     *  more often. Calibratable/debug-editable. */
    juvenileDrinkCrocBias: number
    /** Orphan adoption reach (design.md §19.8/§21.2, point 262): when a
     *  juvenile's parent dies (any cause), the nearest eligible ADULT of its
     *  own kind within this radius (world units) adopts it and becomes its new
     *  parent, so the §19.8 family dramas recur for the new pairing instead of a
     *  one-off orphaning. No adult in range → the young stays parentless until
     *  one roams near. Calibratable/debug-editable. */
    adoptionRadius: number
    /** Escape run (design.md §19.8, point 311): how long (seconds) a calf freed
     *  by its parent's sacrifice runs clear of the predator before it becomes
     *  adoptable again. Without the window the point-262 adoption claimed the
     *  calf the instant the parent fell, so it walked back to its new parent
     *  past the feeding predator instead of escaping. A hard deadline — the
     *  adoption resumes the moment it expires. Calibratable/debug-editable. */
    escapeSeconds: number
    /** Separation window (design.md §19.8/§21.2, point 341): how long (seconds) a
     *  juvenile may stay OUT OF REACH of its parent — farther than followRadius —
     *  before the bond RESOLVES: both links are cleared and the young goes through
     *  the orphan adoption, so it gains a living parent nearby or roams on
     *  parentless instead of walking at a parent it can never reach. The clock
     *  runs only while the calf is genuinely out of reach, so a gambol at the
     *  leash edge never trips it. Zero switches the window off.
     *  Calibratable/debug-editable. */
    reunionSeconds: number
    /** Orphan mourning window (design.md §19.8/§21.2, point 369): how long
     *  (seconds) a juvenile whose parent DIED in front of it stays subdued —
     *  keeping to the spot its parent fell and NOT gambolling — before it plays
     *  again. Only a death opens the window: a bond that merely resolved
     *  administratively (point 341 — the parent was streamed out, or the pair
     *  drifted apart) is not mourned. Fear outranks it: every danger response
     *  takes the frame. Calibratable/debug-editable. */
    mourningSeconds: number
    /** Bereaved parent (design.md §19.8, point 1213): how long (seconds) a parent
     *  whose young a predator just killed adopts no other young. It outlasts the
     *  vigil and the remains, so no adoptee walks up to it at the kill and reads
     *  as the dead young come back to life. Calibratable. */
    bereavedSeconds: number
  }
  /** Intraspecies combat (design.md §19.17, point 264): territorial/dominance
   *  fights WITHIN a species, on the researched species only
   *  (docs/intraspecies-combat-1890.md; the per-species table lives in
   *  `FIGHT_PROFILES`, wildlifeBehavior.ts). Every value here is calibratable
   *  and debug-editable (§21.2). */
  fight: {
    /** Base chance per eligibility check that an idle adult of a fighting
     *  species takes the "wants to fight" disposition — scaled by the
     *  species' own researched rate. Kept LOW: a fight is an occasional
     *  event, not the plains' normal state. */
    dispositionRate: number
    /** Seconds between two disposition checks on one animal — the roll's
     *  cadence, so the rate above reads as "per this many seconds". */
    dispositionInterval: number
    /** How far (world units) an aggressor looks for a same-species opponent. */
    seekRadius: number
    /** Centre distance at which the two bodies meet and the clash starts. */
    contactRadius: number
    /** How far a chased animal must have fled before the aggressor is
     *  satisfied and breaks off — the DRIVE-OFF ending, no kill. */
    driveOffDistance: number
    /** Hard deadline (seconds) on the approach/chase: past it the bout ends in
     *  a peaceful break-off, so a converge that can never meet — a river
     *  between them, a quarry it cannot catch — always resolves (invariant I4). */
    approachSeconds: number
    /** Seconds the visible clash itself lasts before it resolves. */
    clashSeconds: number
    /** Scales the whole clash POSE — the wedge the two bodies splay into, the
     *  wheel about their contact point, the shove and the alternating rear.
     *  One knob rather than five: it decides how violently the bout reads at
     *  the bird's-eye zoom, and 0 collapses it back to two animals standing
     *  nose to nose. Affects the picture only, never an outcome. */
    clashIntensity: number
    /** Speed factor over the ordinary walking pace for the converge run and
     *  the chase — a fight is approached at a charge, not a stroll. */
    approachBurst: number
    /** The fleeing quarry's share of the aggressor's speed. Below 1 so a chase
     *  closes: with the drive-off distance above it decides catch vs drive-off
     *  — a quarry jumped at close range is run down, one with room to run
     *  clears the patch first. */
    quarryFleeFactor: number
    /** Scales every species' researched clash lethality: 1 ships the research's
     *  own rates, 0 turns every fight into a bloodless contest. */
    lethalityScale: number
    /** Seconds an animal is barred from a new fight after one resolved — so a
     *  driven-off pair does not immediately re-engage. */
    cooldownSeconds: number
    /** TEST-ONLY (the point-177 precedent): pins the clash outcome so a staged
     *  verification needs no retry loop. Never set in normal play. */
    forceOutcome?: 'death' | 'submission'
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
    /**
     * How far up its own course (degrees) a SEA mouth's current slackens to
     * nothing (design.md §11.3, point 316) — the tidal/backwater reach that
     * keeps a mouth from funnelling a swimmer into a coast-locked pocket. Read
     * at build time (the flow index bakes the ramp per segment); a debug edit
     * applies on the next reload.
     */
    mouthSlackDeg: number
  }
  season: {
    /** Master factor for the seasonal weather look (0 disables, 1 full; design.md §19/§21). */
    weatherStrength: number
    /** How far the Nile's October crest lifts its surface (world units). */
    nileFloodRise: number
    /** How strongly rain darkens/glosses the ground, 0 dry .. 1 full (point 225). */
    wetGroundStrength: number
  }
  /** The village cooking fire's response to rain (design.md §19.10, point 256). */
  fire: {
    /** How much full rain damps the SHELTERED flame under the cook-shelter (0..1, small: it burns on). */
    shelteredRainDamp: number
    /** How much full rain damps an UNSHELTERED open flame (0..1, large: rain drowns it toward embers). */
    openRainDamp: number
  }
  /** The hold-Ctrl label layer (design.md §17.8). */
  labelOverlay: {
    /** How many labels may stand at once while Ctrl is held — the nearest ones
     *  win, the rest are dropped. It is a READABILITY limit first (a crowded
     *  savanna otherwise turns into a wall of text) and a frame budget second. */
    maxLabels: number
  }
  /** Startup picture liveness (point 337). */
  startup: {
    /** How long the loading picture may stand still, in milliseconds — the
     *  budget the live gate (`scripts/verify/startup.mjs`) binds. It covers the
     *  WHOLE standstill, both the part a blocked main thread causes and the
     *  part a busy renderer causes inside one long animation frame, so a busy
     *  renderer cannot excuse a freeze the player plainly sees. Calibratable:
     *  raise it only with a measurement that says the slower state is
     *  acceptable, never to quieten a regression. */
    pictureFreezeBudgetMs: number
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
  /** Village life vignettes (design.md §19.10). */
  villageLife: {
    /** The children's game of tag (work-order 480/351). */
    tag: {
      /** How many children play in a village at full seasonal presence. */
      childCount: number
      /** The chaser's flat-out pace (m/s) at a full reserve. */
      sprintSpeed: number
      /** The runner's top pace as a factor over the chaser's (> 1). */
      runnerBoost: number
      /** Cruise (trot) pace as a fraction of the sprint; at or below it the
       *  reserve refills. */
      trotFactor: number
      /** The deliberate recovery pace, as a fraction of the sprint. */
      recoverFactor: number
      /** The pace a chase never falls below, as a fraction of the sprint. */
      floorFactor: number
      /** Reserve spent per second at the full sprint pace. */
      drainPerSecond: number
      /** Reserve refilled per second at or below the trot. */
      recoverPerSecond: number
      /** Low threshold: at or below it a child breaks off into recovery. */
      breakOff: number
      /** High threshold: at or above it a recovering child presses again. */
      resume: number
      /** A runner sprints while the chaser is this close. */
      pressureDistance: number
      /** A chaser presses only at a target within this reach. */
      chaseReach: number
      /** Inside this distance the chaser presses whatever the gap is doing. */
      commitDistance: number
      /** The small distance a catch happens within. */
      catchDistance: number
      /** How much nearer a candidate must be before the chaser switches to it. */
      targetSwitchMargin: number
      /** The freshly-tagged child's immunity against an instant re-tag. */
      immunitySeconds: number
      /** Backstop: one chaser's tenure before the group breaks off into idling. */
      resolveCapSeconds: number
      /** How long the group idles before starting again. */
      idleSeconds: number
      /** Time constant of the gap-trend ease (the burst cadence). */
      trendTau: number
      /** Gap trend at or below which the chaser opens a burst. */
      trendEnter: number
      /** Gap trend at or above which it breaks the burst off. */
      trendLeave: number
      /** Per-child spread of the RATES and the opening reserve (never a pace). */
      variation: number
      /** Seconds without real movement before a child is nudged free. */
      unstuckSeconds: number
      /** Seconds a child keeps going the same way ROUND an obstacle, so it
       *  follows its edge instead of pacing to and fro at its face. */
      edgeSeconds: number
      /** Dev-mode alarm: a group that could play and has produced neither a
       *  catch nor a fresh round for this long raises `tag-silent`. */
      silenceSeconds: number
      /** Forward lean (rad) at the full sprint. */
      leanAtSprint: number
      /** How fast the drawn body may turn, in rad/s. */
      turnRate: number
      /** Seconds the freshly caught child stands before it chases (work-order
       *  1176); never longer than `immunitySeconds`. */
      caughtPauseSeconds: number
      /** A caught child's slump (work-order 1239): trunk lean and arm roll (rad). */
      caughtSlumpLean: number
      caughtSlumpArmRoll: number
      /** Largest trunk turn (rad) the chaser's gaze takes toward its quarry. */
      gazeTurnMax: number
      /** The catcher's wordless cry: length (s), per-cry pitch spread (±
       *  fraction), reach (m) and level (a factor on the voice peak). */
      crySeconds: number
      cryPitchSpread: number
      cryReach: number
      cryGain: number
      /** Radius of the children's play ground — how far from its middle they
       *  may roam. It is what keeps them a GROUP the player can stand among
       *  (point 481/478), not a scatter across the whole settlement. */
      playRadius: number
    }
    /** The children's game at the river bank (work-order 687): the phases of one
     *  cycle, the stage's own distances and the berth they give the traveller.
     *  The paces, the stamina and the steering are the tag game's above. */
    bankGame: {
      /** The bank round's own catch ring (m): it overrides the tag round's,
       *  which shrank to a hand's reach in work-order 1176. */
      catchDistance: number
      /** Whether a visit finds the group at its rocks, its first cycle opening
       *  at once (work-order 1250); off, a visit opens with a roaming phase. */
      visitOpensAtBank: boolean
      /** How long the group roams its own quarter between two cycles. */
      roamSeconds: number
      /** Per-cycle spread of that length, 0..1 (0 = a metronome). */
      roamSpread: number
      /** Backstop on the walk down to the bank. */
      gatherSeconds: number
      /** Backstop on one run. */
      runSeconds: number
      /** Visible held-standing pause while the catcher taps ROCK. */
      tapPauseSeconds: number
      /** Backstop for the tapper's short walk into the line. */
      tapReturnSeconds: number
      /** Settling radius for the catchers at their stations. */
      catcherStationDistance: number
      arrivalHoldSeconds: number
      /** Bound on queuing for stone contact, separate from the group's walk backstop. */
      arrivalApproachSeconds: number
      /** Backstop on the walk between two runs. */
      regroupSeconds: number
      /** How long the group walks toward its roaming quarter before roaming again. */
      partSeconds: number
      /** How long caught children stay slumped after the cycle's last run. */
      endPauseSeconds: number
      /** Complete cycles one play session runs back to back before the
       *  children part and roam. */
      seriesCycles: number
      /** Arrival (safe) radius around a rock's centre, outside its collider;
       *  the runner walks on from here before its hand names the stone. */
      reachDistance: number
      /** How far off a rock's centre a child's waiting station stands. */
      standOff: number
      /** Side-by-side spacing of the stations at one rock. */
      stationSpacing: number
      /** Sideways spacing of the runners' lanes across the stretch. */
      laneSpacing: number
      /** How near a catcher must be before a runner bends its line round him. */
      dodgeDistance: number
      /** How far sideways that bend carries the runner's aim at the closest. */
      dodgeReach: number
      /** How fast a roaming child's heading drifts (rad/s). */
      roamTurn: number
      /** How long the climber may make no progress toward the boulder before giving up. */
      roamGoalSeconds: number
      /** How far outside the boulder's own collider the climber stops before it
       *  steps up onto the stone (work-order 1080). */
      climbApproach: number
      /** How long the step up onto the stone takes, and the step back down. */
      climbRiseSeconds: number
      climbSinkSeconds: number
      /** How long the child stands on the stone before coming down. ROCK is
       *  spoken at the top of the rise, so this is the time the player has to
       *  connect the word with what the child is standing on. */
      climbHoldSeconds: number
      /** How high a scattered boulder's top must stand for the FALLBACK search
       *  to take it as the climbed stone when the layout derived none (m); with
       *  none that tall the fallback takes the tallest stone there is. */
      climbableRockTop: number
      /** The most OVERTIME the off-game ROCK guard may hold a cycle for, past
       *  the roaming phase's own length. Beyond it the RIVER call goes out with
       *  that one cycle's boulder unnamed. */
      roamGuardSeconds: number
      /** The pace of every walk that is not a run (m/s). */
      walkPace: number
      /** The EXTRA berth the children give the traveller over a villager. */
      strangerBerth: number
      /** Ordinary gap between two utterances; the first arrival is guaranteed. */
      utteranceGapSeconds: number
      /** Dev-mode alarm (point 589): a round that could speak and has said
       *  nothing for this long raises `bank-speech-silent`. */
      roundSilenceSeconds: number
      /** Where the children's stretch is centred along the bank, in metres
       *  DOWNSTREAM of the settlement's bank normal (negative: upstream;
       *  work-order 1245). */
      stretchCentre: number
      /** How far the children's roaming quarter's centre may lie from the
       *  middle of their bank stretch (work-order 1245), in metres. */
      quarterWithin: number
      /** How far inside the CALL register's reach of the stage's photographing
       *  stand the children's roaming quarter's far rim is sought (m;
       *  work-order 1245). */
      quarterCallMargin: number
    }
    /** The adults' water errands and paired digging, which teach RIVER and DIG
     *  (work-order point 483). */
    adultErrands: {
      /** Seconds between two staged errands. */
      intervalSeconds: number
      /** Random spread of that interval, 0..1 (0 = a metronome). */
      intervalSpread: number
      /** How long a villager stays at the place it was sent to. */
      dwellSeconds: number
      /** How long a bout of visible digging lasts. */
      digSeconds: number
      /** Where a digger stands to work a site: metres from the site centre
       *  (work-order 1125). Both members of a pair stand on this rim, on
       *  opposite bearings, facing each other across the hole. */
      digStandDistance: number
      /** Slack on that stand before a body counts as away from the pit and
       *  stops playing the stroke (work-order 1125). */
      digStandTolerance: number
      /** Backstop: an errand never outlives this, however the walk goes. */
      errandSeconds: number
      /** Seconds of NO headway toward the target after which the errand is let
       *  go for BOTH partners, including one already waiting at his spot. */
      stallSeconds: number
      /** The pace a villager walks at while on an errand (m/s). */
      pace: number
      /** How many errand villagers a village keeps out and about. Read when a
       *  settlement is entered (like the children's count), so an edit takes
       *  effect on the next visit rather than mid-scene. */
      villagerCount: number
      /** How far beyond the upstream end of the children's stretch the water
       *  path lands, in metres along the bank (work-order 1245). */
      waterFootBeyond: number
    }
    /** The fishermen's dugout beside the children's bank game (work-order
     *  1237, two men and a drift net since 1245). Distances in metres along
     *  the bank (s, downstream of the settlement's bank normal) and out from
     *  the waterline. */
    canoe: {
      /** How far out from the waterline the lane lies. */
      laneOut: number
      /** The lane's upstream and downstream ends, as s. */
      laneStart: number
      laneEnd: number
      /** The least distance the range keeps from the children's stretch and
       *  from the adults' water-work sites: a 10 m hearing zone round each
       *  plus the 10 m hearing radius. */
      stretchGapMin: number
      /** Ground speed against the current, and carried with it (m/s). */
      upstreamSpeed: number
      downstreamSpeed: number
      /** The bow swinging out into the current at the upstream end, while the
       *  net is paid out. */
      turnSeconds: number
      /** Both men hauling the net in at the downstream end. */
      haulSeconds: number
      /** Running the bow onto the sand, and pushing back off to the lane. */
      landSeconds: number
      launchSeconds: number
      /** The net man stepping between his seat and the bank, lifting or
       *  setting down the basket, and one fish handed over into it. */
      stepSeconds: number
      liftSeconds: number
      fillSecondsPerFish: number
      /** The longest a word waits for the settlement's floor before the boat
       *  goes on unspoken (the floor then forgets it). */
      wordWaitSeconds: number
      /** Seconds after a visit opens until the net man's first word: the
       *  dugout is found this far short of the lane's upstream end. */
      firstCallSeconds: number
      /** Fish per haul, drawn per haul, and their length (m). */
      catchMin: number
      catchMax: number
      fishLengthMin: number
      fishLengthMax: number
      /** The drift net's float line: its length trailing behind, its reach
       *  out into the river, and how many floats show it. */
      netLength: number
      netReach: number
      netFloats: number
      /** One paddle stroke against the current, one steering stroke, and one
       *  pull of the net hand over hand. */
      strokeSeconds: number
      steerStrokeSeconds: number
      haulStrokeSeconds: number
      /** The dugout's length and beam. */
      hullLength: number
      hullBeam: number
    }
    /** The fishermen's own fire by the landing (work-order 1245): the carrier,
     *  the griller, the smoking rack and the pounding pair who eat there. */
    fishFire: {
      /** The fire: this far upstream of the landing and inland of the top of
       *  the bank (m). */
      fireBack: number
      fireInland: number
      /** Walking paces (m/s). */
      carrierPace: number
      duoPace: number
      /** Setting down or taking up a basket or a fish. */
      liftSeconds: number
      /** How long before the full basket is set down the carrier is meant to
       *  be back at the bank. */
      carrierLeadSeconds: number
      /** The least time one fish takes to gut. */
      gutMinSecondsPerFish: number
      /** Fish at the carrier's fire at the start, still to be gutted. */
      startFish: number
      /** Fish over the embers at once, and how long each grills. */
      grillSlots: number
      grillSeconds: number
      /** The griller's handling: a fish off the board, a turn, onto the
       *  rack, and the driest into the storage basket. */
      takeSeconds: number
      turnSeconds: number
      laySeconds: number
      packSeconds: number
      /** The fill the rack is kept at. */
      rackFill: number
      /** Smoked fish in the storage basket at the start. */
      storageStart: number
      /** The pounding pair (point 1282): how often they walk to the rack
       *  together (s, with a spread 0..1), how long a fish takes to eat and
       *  one bite, and where their mortar stands — this far back from the
       *  rack toward the village and this far to the side of that bearing. */
      duoIntervalSeconds: number
      duoIntervalSpread: number
      eatSeconds: number
      biteSeconds: number
      duoHomeBack: number
      duoMortarOffset: number
      /** Side by side at the rack: the gap between the two women (m). */
      duoRackGap: number
      /** The wait budget per round, boat and carrier alike (s, averaged). */
      waitBudgetSeconds: number
      /** The fishers' cook-shelter (point 1275): half the post square (m), wide
       *  enough that the grill, its forked posts and the kneeling griller stand
       *  beneath it — the village shelter's 1.35 m would leave him outside. */
      shelterPostR: number
      /** Collision (point 1275): the stand-off added round each drawn prop, and
       *  the body radius of a fisher the traveller cannot walk through. */
      colliderMargin: number
      figureBodyR: number
    }
    /** The weaver's loom (work-order 1157): the station that shows weaving AND
     *  teaches UPSTREAM/DOWNSTREAM a second time, on a walking body instead of
     *  the children's running groups. */
    loom: {
      /** Whether a village lays the loom at all. Off since the user parked the
       *  weaving scene (29.09.2026); the station, its words and its tests stay
       *  in the game so it can be switched back on. */
      placed: boolean
      /** Metres from the weaver's seat to each warp stake — half the stretched
       *  warp. The seat is its MIDPOINT, so both calls send the helper away. */
      warpHalf: number
      /** Metres from the seat at which the helper works when a call sends him
       *  to one end. Inside `warpHalf`, so he is plainly ON the warp. */
      tendStand: number
      /** Seconds of one shuttle pass: across the warp and back again. */
      passSeconds: number
      /** Metres of woven strip one completed pass adds to the cloth. */
      clothPerPass: number
      /** Seconds between two NAMED tendings. The throws themselves say no words;
       *  this is the rate the two direction words fall at. */
      tendIntervalSeconds: number
      /** Random spread of that interval, 0..1 (0 = a metronome). */
      tendIntervalSpread: number
      /** How long the helper works at the end he was sent to. */
      tendDwellSeconds: number
      /** The pace he walks the warp at, in metres per second. */
      helperPace: number
      foldSeconds: number
      weaveSaturation: number
      helperCycleSeconds: number
      stackCap: number
      stackFallback: number
      stackSeedMin: number
      stackSeedMax: number
      beatPeak: number
      beatAttack: number
      beatDuration: number
      beatFrequency: number
    }
    /** Grain pounding at the village mortar (`mortarPounding.ts`): the mortar's
     *  shape, the pestle, the full-body stroke of the two women who pound it
     *  alternately, the grain puff and the thud. Lengths in metres, at the
     *  figure's own scale (a 1.34 m villager). */
    mortar: {
      /** How many women pound the one mortar: 1, or 2 striking alternately. */
      pounders: 1 | 2
      /** Seconds of ONE woman's stroke, impact to impact. */
      strokeSeconds: number
      /** Overall height of the mortar, rim included (waist-high to the figure). */
      height: number
      /** Outer radii: the flared foot, the narrow waist and the rim. */
      footRadius: number
      waistRadius: number
      rimRadius: number
      /** How far the hollowed bowl reaches down from the rim. */
      bowlDepth: number
      /** The grain's surface, this far below the rim. */
      grainBelowRim: number
      /** From the mortar's centre to where each woman stands. */
      standOff: number
      /** Sideways from the centre that each woman's pestle lands, so the two
       *  shafts pass each other instead of meeting in the bowl. */
      strikeOffset: number
      /** The pestle: its length, its radius, and where it is gripped (measured
       *  from its foot). */
      pestleLength: number
      pestleRadius: number
      gripFromFoot: number
      /** Half the gap between the two hands across the shaft. */
      gripHalf: number
      /** At impact the pestle foot goes this far below the grain's surface. */
      impactDepth: number
      /** At the top of the stroke the foot hangs this far above the rim. */
      liftAboveRim: number
      /** Lifted, the foot hangs this far toward her over the opening (none
       *  in the bowl), so the raised shaft stands upright before her face. */
      footDrift: number
      /** The knee dip at impact: the body's height shrinks by this fraction. */
      squatDepth: number
      /** Forward lean of the trunk at impact and at the top (rad). */
      leanImpact: number
      leanTop: number
      /** The grain puff: grains thrown, how long they fly (s), how fast (m/s). */
      puffGrains: number
      puffSeconds: number
      puffSpeed: number
      /** The thud: envelope peak, attack and length (s), lowpass corner (Hz). */
      thudPeak: number
      thudAttack: number
      thudDuration: number
      thudFrequency: number
    }
    /** The body every inhabitant presents to every other (work-order 578). */
    separation: {
      /** Body radius of a figure drawn at scale 1; a child's is this times its
       *  own scale. Smaller than the mover footprint, like the animals'. */
      bodyRadius: number
      /** Overlap tolerated before anything is corrected (the anti-jitter band). */
      slop: number
      /** Fraction of the remaining overlap taken out per frame (0..1). */
      stiffness: number
      /** Cap on the push speed (m/s). */
      maxSpeed: number
      /** Seconds wedged before the escape nudge is asked for. */
      wedgeSeconds: number
      /** Sweeps a group may take in one frame, so a CHAIN of three or more
       *  figures comes apart in the frame it formed. */
      passes: number
    }
  }
  /** Village speech and drums (design.md §13.4, docs/communication-poc-spec.md). */
  communication: {
    /** Constant pause between the atoms of a phrase — spoken and drummed alike. */
    phrasePauseSeconds: number
    /** How far an utterance carries, in place-scene units. */
    hearingRadius: number
    /** Seconds per spoken syllable — the constant pace of every utterance. */
    syllableSeconds: number
    /** Steepness of the hearing falloff; the level at the rim is 1/(1+falloff). */
    talk: { reach: number; loudness: number; falloff: number }
    call: { reach: number; loudness: number; falloff: number }
    /** Visible consequence after the last syllable; calibratable seconds. */
    consequenceSeconds: number
    /** How long an INSTRUCTED body waits after the last syllable before it
     *  starts doing what it was told (work-order 1184). Serves the water errand
     *  and the loom alike; the word's own length is added to it. */
    instructionHoldSeconds: number
    /** Stuck-situation backstop, measured against shipped work in tests. */
    speechHoldSeconds: number
    /** How long the hypothesis stands over a speaker's head, for one atom. */
    labelSeconds: number
    /** Carrier pitch of the LOW syllable `ba`, in Hz (point 587). */
    speechPitchHz: number
    /** Child low carrier; the same shared interval transposes the whole pair. */
    speechChildPitchHz: number
    /** Maximum stereo pan, 0 = mono, 1 = full width (calibratable). */
    speechStereoWidth: number
    /** The HIGH syllable `BA` as a multiple of the low pitch — the interval that
     *  carries the entire language, so it is calibratable on its own. */
    speechPitchInterval: number
    /** Relative level of the village speech on its OWN bus (point 577): the
     *  syllables are the one sound the player must hear, so `ambientVolume`
     *  ("everything else") no longer touches them. */
    speechVolume: number
    /** Envelope peak of ONE chief's drum-message strike, before the ambience
     *  volume under it (`drumMessagePlan`). The message is the PoC's one piece
     *  of long-range speech, so it carries its own level rather than the
     *  meaningless bed's `drumBed.villageGain`. */
    drumMessagePeak: number
    /** The gap between the top of a speaker's DRAWN head and its note's tail
     *  tip, in screen pixels (the note's anchor is the head top itself).
     *  `px` is the lift applied; `minPx`..`maxPx` is the band the rendered gap
     *  must fall in at every camera distance (verification asserts it). */
    labelTipGap: { px: number; minPx: number; maxPx: number }
    /** How an older note stands back while a newer one is shown (speechLabelRecedes). */
    labelRecede: { opacity: number; scale: number }
    /** The note's size on screen (speechBubbleScale): `baseScale` times a
     *  power law through `nearScale` at `nearDistance` and `farScale` at
     *  `farDistance` (camera-to-note, settlement units), held at `farScale`
     *  beyond and capped at `maxScale` up close. Never wider than
     *  `maxViewportWidth` nor taller than `maxViewportHeight` of the viewport. */
    speechBubble: {
      baseScale: number
      nearDistance: number
      farDistance: number
      nearScale: number
      farScale: number
      maxScale: number
      maxViewportWidth: number
      maxViewportHeight: number
    }
    /** How close the traveller must stand to the chief, in settlement units, for
     *  the find from the boulder to be laid in his hands. */
    giveReach: number
    /** How fast the chief crosses between his hut and his drummer, in
     *  settlement units per second (design.md §13.4). */
    chiefWalkSpeed: number
    /** The minute he stands beside the drummer before he walks home — counted
     *  from his arrival and afresh from every drum message. */
    chiefStaySeconds: number
    /** How far beside the drummer he takes his stand, in settlement units. */
    chiefBesideDrummer: number
    /** Clear passage between the hut wall and the chief’s robe at his door. */
    chiefHutGap: number
    /** Least angle, in degrees, between the chief’s hut and the market hut as
     *  seen from the drummer, so his pointing gesture names one hut only. */
    marketBearingFromChief: number
    /** How near the traveller must stand to the chief or to the drummer for the
     *  use key to reach either man. */
    chiefTalkReach: number
  }
}

export const balance: BalanceConfig = {
  travelSpeed: 5.6, // reduced 30% from 8 for a calmer overland pace
  placeWalkSpeed: 10,
  placeStrafeFactor: 0.8,
  // Educated guess (CLAUDE.md §2): 0.30 m is about knee height on a grown body,
  // the step a walker takes without breaking stride. The scatter draws its
  // instance scale from 0.3 to 1.0, so tops run 0.16-0.53 m: everything up to
  // scale ~0.57 becomes ground and the taller half stays an obstacle, while the
  // derived climbing stone (scale 1, top 0.53 m) stays well clear of it.
  placeStepOverTop: 0.3,
  walkerUnstuckSeconds: 4, // an inhabitant wedged this long is teleport-nudged free (point 155)
  walkerUnstuckMinDistance: 0.6, // calibratable: one adult body width out of the pinned position
  unstuck: {
    // Calibratable: half a metre is well under one walking step, so a man who
    // really is wedged never crosses it while a man edging along a wall does;
    // three seconds of holding the key is long enough that ordinary bumping into
    // a hut stays silent. The search reaches across a compound (12 m) in half-
    // metre rings — fine enough to find the slot between two huts.
    stallDistance: 0.5,
    stallSeconds: 3,
    searchRadius: 12,
    searchStep: 0.5,
  },
  // Calibratable: 0.7 m is about mid-thigh on a grown man — the depth at which
  // wading stops being walking. It lands the far edge of the walkable region
  // roughly three metres past the waterline, well inside the drawn shallows.
  bankWadeDepth: 0.7,
  // Calibratable: 0.12 m is ankle-deep on a grown man — far enough in that the
  // water is unmistakably around his feet, shallow enough that he is standing
  // rather than wading. Solved on the profile, it lands the carrier a few
  // centimetres past the drawn waterline.
  bankFillDepth: 0.12,
  // Calibratable: 1.4 s under the surface. Long enough for a player who is not
  // looking for it to see the jar go down and come up, short enough that the
  // errand's own timing backstops are untouched.
  bankFillSeconds: 1.4,
  // Calibratable (work-order 1117): solved against the dip's own hand, which
  // sits at the surface. 2.2 rad lays the jar base-up with its axis about 35°
  // under level; held near the base and slid 0.15 m up the arm, the mouth's
  // centre stands ~3 cm under the water and the jar's centre ~4 cm above it.
  bankFillJar: { tilt: 2.2, reach: 0.12, lift: 0.15 },
  // Calibratable (work-order 1117): two rings at once, each spreading from the
  // mouth's own size to about a metre across in 0.9 s, so the 1.4 s fill shows
  // a ring born and a ring spreading.
  bankFillRing: { count: 2, period: 0.9, startRadius: 0.16, endRadius: 0.55, opacity: 0.55 },
  // Calibratable (work-order 1250): at the Bambara village the map's Niger
  // begins 5-29 m past the drawn waterline along the visible bank; 40 m covers
  // that gap with room, and a map river further off is left alone.
  backdropRiverFillReach: 40,
  // Calibratable: three standing jars. The fourth delivery replaces the oldest,
  // which is what lets the stand need no consumer.
  waterStandCapacity: 3,
  // Calibratable: stop within 0.3 m of the assigned spot. The generic 1.1 m
  // tolerance let a waiting carrier occupy the sender's approach lane.
  waterStandArrivalRadius: 0.3,
  // Calibratable (work-order 1117): the fill spot lies only ~0.5 m past the
  // waterline, so the generic 1.1 m let the carrier dip from dry ground.
  bankFillArrivalRadius: 0.2,
  placeEdgeBand: {
    // Calibratable: ~8 m of give-way at a slightly softened 0.8 strength —
    // tuned by the operator in play on 27.08.2026: the wider, gentler ramp
    // reads as trodden ground giving way rather than a stripe. 0.4 m of wander
    // bows the outline visibly; the wander stays bounded by the band's VISIBLE
    // FALL rather than its full width (work-order 581), and a warp that pushed
    // the true boundary out of that fall would mislead.
    widthM: 8,
    wanderM: 0.4,
    strength: 0.8,
  },
  bloodStain: {
    // Calibratable: the base patch keeps the size point 267 shipped, and a
    // quarter of the radius of swing reads as an unmistakably organic outline
    // at the bird's-eye zooms a player can reach without turning into a star.
    sizeScale: 1,
    irregularity: 0.24,
  },
  mouseSensitivity: 0.0011,
  lookPitchLimitDeg: 85, // just short of vertical (point 392); the view never rolls over
  ambienceVolume: 0.1,
  footstepVolume: 2, // footsteps twice as loud as the rest (user request)
  ambientVolume: 0.5, // every other ambient sound half as loud (user request)
  birdsongVolume: 1, // per-source birdsong slider (point 153); 1 = design gain
  mixLimiter: {
    // Estimates (calibratable): a knee with 0.1 of room to bend in, under a
    // ceiling 0.45 dB below full scale. Point 1156.
    threshold: 0.85,
    ceiling: 0.95,
  },
  drumBed: {
    // Message drums bypass this switch. The meaningless ambient bed ships off.
    enabled: false,
    // Two bars establish a phrase, followed by enough silence that the bed
    // cannot read as an endlessly repeated loop. All are calibratable (§2).
    stepSeconds: 0.25,
    phraseBars: 2,
    phraseGapMinSeconds: 1.4,
    phraseGapMaxSeconds: 3,
    // A village keeps its own small, deterministic character for the visit;
    // neither spread is wide enough to turn the bed into message drumming.
    tempoSpread: 0.07,
    pitchSpread: 0.08,
    pitchStartHz: 112,
    pitchEndHz: 48,
    hitSeconds: 0.18,
    accentShift: 0.35,
    // After roughly a minute the pauses are 2.6x their opening length. The
    // bed remains present as place character, but demands progressively less.
    thinAfterSeconds: 60,
    thinMaxGapFactor: 2.6,
    villageGain: 0.42,
    nearbyGain: 0.14,
  },
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
  settlementRoom: 1.1,
  observerMargin: 8.5, // calibratable (work-order 1252/1273): room around a watched scene before the boundary
  // 0.6 → a 1.5-unit collider around the marker: it matches the drawn cluster
  // (the port's main house plus annex reaches ~1.3 units past the anchor, the
  // village huts ~1.45) and stays inside the river clearance every place keeps
  // (geo.ts PORT_RIVER_CLEARANCE_DEG = band + 0.15° = 1.5 units), so a canoe
  // passage down the channel is never deflected by a riverside settlement.
  placeCollisionFactor: 0.6,
  oceanSwimMarginDeg: 1.0, // calibratable: swimmable coastal band width in degrees (point 221: narrowed from 1.2 so the traveller cannot wade ~1.18 deg out into deep blue while the ~0.89 deg nearshore stays swimmable)
  strandedExit: { searchStep: 0.5, searchRadius: 20, minHeadingCos: 0.5 }, // calibratable: the report's trap lay under a unit off the beach; cos 0.5 = a 60° cone
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
    canteenCapacity: 500, // user calibration: reduced from 2000; at the former 0.9 drain a full canteen lasted 500/0.9 ≈ 555 land days
    sunblindRecoveryDays: 3,
    poorThreshold: 40,
  },
  showHiddenObjects: false,
  inventoryCapacity: 20,
  reputation: {
    friendProtectRadiusDeg: 1.5,
    friendAidCooldownDays: 10,
    friendVillageFoodDays: 21,
  },
  camps: {
    lootChancePerDay: 0.03,
    campRadiusDeg: 0.3,
  },
  travelCameraFollow: {
    tau: 0.13, // calibratable: the former 0.12/frame lerp at 60 fps (-1/(60·ln 0.88))
    snapDistance: 30, // calibratable: far above the walking lag (~0.7), below any jump
    southReachCompensation: 1.0, // calibratable: full 1:1 reach; 0.5 = about half (user choice pending)
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
    ringInner: 40, // calibratable: nearest ring 40 m past the backdrop rim
    ringSpread: 80, // calibratable: ..120 m, so one species varies ~3x in apparent size
    openPlainRingSpread: 45, // calibratable: keeps Giza's walkable radius at 98 m
    giraffeTargetDeg: 1.4, // calibratable: giraffe at mid ring; elephant ~1.07, zebra ~0.54, antelope ~0.47
    speciesHeight: { elephant: 4.2, giraffe: 5.5, zebra: 2.1, antelope: 1.85 }, // calibratable ratios
    maxApparentAngleDeg: 2.5, // safety net; the shared factor stays below it
    hazeMix: 0.55, // lift the flat near-black toward the sky horizon
    markContrast: 0.7, // calibratable: haze-reduced, still clearly visible stripes/flank band
    markBandScale: 0.6, // calibratable: ~4 broad torso bands on a two-degree zebra
    markFlankWiden: 2.5, // calibratable: the flank band spans ~a third of the flank, not one pixel
    sinkEpsilon: 0.12, // calibratable: 0.4 m at the former ~3.3 scale; feet just below the line
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
  riverCurrent: {
    driftBaseSpeed: 1.3, // calibratable: m/s at season factor 1 (was a fixed 0.85)
    flotsamMix: { foam: 0.5, leaf: 0.2, grass: 0.15, twig: 0.15 }, // calibratable art shares
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
    // Calibratable (point 245: ×1.5 again, from the point-238 5.4 = 3×1.8): the
    // still-wider roam makes the sacrifice/shield/flight dramas read as clearly
    // separate bodies. The rescue burst still closes this gap well inside the
    // caught window — worst gap = gambolRange(18) + the too-late 3.2 ≈ 21.2 <
    // burst-cover 6 units/s × 5 s = 30 (re-asserted in wildlifeBehavior.test.ts).
    followRadius: 8.1,
    // Calibratable (scaled with the leash: point-238 12 = 3×4, ×1.5 = 18): the
    // scamper orbit's outer edge. The leash damping has no cancellation point at
    // any range, so widening it cannot reintroduce the play/follow jitter.
    gambolRange: 18,
    // Calibratable: one hop-bout runs 8 s (was 16 s × 0.25 = 4 s), so the
    // young visibly hop around before settling; the 12 s idle gap is unchanged.
    gambolBoutSeconds: 8,
    // Calibratable (point 245): juveniles are the preferred prey — raised from
    // the earlier 0.6 so the family drama fires more often near the player.
    juvenilePreyBias: 0.85,
    // Calibratable (point 245): a drinking calf is 6× the lunge weight of an
    // adult drinker, so the crocodile ambush overwhelmingly picks the juvenile.
    juvenileDrinkCrocBias: 6,
    // Calibratable (point 262): a bereaved juvenile is taken in by an adult of
    // its kind within this reach. Sized above the calf leash (followRadius 8.1)
    // so a nearby herd-mate — not only the dead parent's immediate neighbour —
    // can adopt, yet local enough that the young joins a genuinely close adult.
    adoptionRadius: 20,
    // Calibratable (point 311): the freed calf's escape leg. Sized so the flight
    // actually carries it clear of the kill — the prey flee runs at up to
    // FLEE_SPEED 5 units/s and eases off with distance, so ~12 s covers the
    // 14-unit flee radius with room to spare — and well above the ~5 s struggle
    // window, so the escape is never cut short by the drama it follows.
    escapeSeconds: 12,
    // Calibratable (point 341): the bond's deadline. Sized well above one whole
    // play cycle — a bout runs 8 s and the idle gap 12 s (20 s), and the follow
    // leg back from the gambol edge (18 units at 4.5 units/s against a walking
    // parent) adds a few more — so a healthy pair, which drops inside the leash
    // once per cycle, never approaches it, while a calf that genuinely cannot
    // reach its parent is re-homed inside a minute of play.
    reunionSeconds: 45,
    // Calibratable (point 369): the orphan's subdued window. Sized above one
    // whole play cycle (an 8 s bout plus the 12 s idle gap) so the calf visibly
    // SKIPS a gambol it would otherwise have played — the picture the point
    // exists for — and in the register of the other §19.8 vigils (the elephants
    // hold 30 s at the bones). It outlives the body itself (a carcass dissolves
    // in ~9 s), so the later part of the watch is held at the spot it fell.
    mourningSeconds: 30,
    // Calibratable (point 1213): above the 60 s vigil plus the kill flock's
    // landing and the remnant's ~10 s dissolve, so the parent has left the kill
    // site or the remains are gone before it may take in another young.
    bereavedSeconds: 90,
  },
  // Intraspecies combat (point 264). All calibratable; the per-species rates
  // and lethalities they scale come from docs/intraspecies-combat-1890.md.
  fight: {
    // Rare by design, like the other §19 dramas: with the 8 s cadence below an
    // eligible ritual-sparring bull picks a quarrel roughly every few minutes,
    // a zebra stallion less often — an occasional event on the plain, never
    // the herd's normal state.
    dispositionRate: 0.012,
    dispositionInterval: 8,
    seekRadius: 26, // within a herd's own spread — a fight is with a herd-mate, not a stranger across the plain
    contactRadius: 2.2, // the two bodies meet: just over the §19.5 separation radius, so the clash is contact, not overlap
    driveOffDistance: 24, // the quarry is "far enough" — off the aggressor's patch, still on screen
    approachSeconds: 25, // hard deadline (I4): a converge that cannot meet breaks off here
    clashSeconds: 5, // the visible clash — long enough to read as a fight, short enough not to freeze two animals
    clashIntensity: 1, // calibratable: full strength of the clash pose — at the default zoom 0.5 the wedge, the wheel and the rear are what make the bout READ as a fight
    approachBurst: 1.5, // over PREY_WALK_SPEED (3): a charge at 4.5, still under the hunt's 4.6 so a real predator outruns a fighter
    quarryFleeFactor: 0.75, // with the 24-unit drive-off: a chase begun inside ~7.5 units is caught, a wider one ends in the drive-off
    lethalityScale: 1, // ships the researched per-species rates unchanged
    cooldownSeconds: 45, // a settled pair does not re-engage at once
  },
  crocodile: {
    strikeRadius: 5, // calibratable: bank visitors inside this of a hidden crocodile trigger the lunge
    ambushBankBand: 4, // calibratable (point 275): a prey at the waterline within this of a hidden croc is a legal target even without drinking — kept < strikeRadius so the ambush stays occasional
    mouthOffsetLocal: 1.15, // calibratable (point 268): local forward reach to the jaws (snout tip ~1.5), so the seized victim lies IN the mouth, gripped
    lungeSpeed: 12, // calibratable: the burst speed of the lunge — fast and short, never a teleport
    dragSpeed: 5, // calibratable (point 383): how fast the catch is hauled back into the water — a visible drag, not a snap
    dragSeconds: 6, // calibratable (point 383): hard deadline on that haul (I4) — far above the ~1 s a bank kill needs
    gripSeconds: 8, // calibratable: hard release cap on the grip (> the ~5 s caught window) so a vanished victim never pins the crocodile (point 186)
    driveOffRestSeconds: 20, // calibratable: a repelled crocodile keeps to its water this long — long enough for the freed victim to leave the bank, so a rescue is not undone the next frame
  },
  waterCross: {
    maxUnits: 6, // calibratable: swimmable channel width (point 192) — the widened rivers span ~2-4 units
    chance: 0.3, // calibratable: how often a water-blocked roam crosses instead of turning
    resolveSeconds: 25, // calibratable: crossing hard deadline (I4) — a normal swim needs ~3-6 s
    fleeBankClearance: 1.5, // calibratable: swim-out bank clearance as a multiple of the threat ring — 1.5 = the shy flight's exit ring
    arriveUnits: 0.1, // calibratable: swim arrival radius — above one frame's swim step (~0.04 at 60 fps), far below a body length
  },
  hunt: {
    leaveOvertimeSeconds: 45, // calibratable: walk-off overtime before an off-frame retire (point 188) — generous vs the ~20 s a clear walk-off needs
  },
  river: {
    widthFactor: 1.6, // wider-than-scale rivers for canoe playability (point 136)
    mouthSlackDeg: 0.6, // calibratable: ~65 km of slack water at a sea mouth (point 316)
  },
  season: {
    weatherStrength: 1, // full seasonal atmosphere; calibratable, debug-editable
    nileFloodRise: 0.55, // the unregulated 1890 flood is dramatic; calibratable
    wetGroundStrength: 1, // rain fully darkens/glosses the ground (point 225); calibratable, debug-editable
  },
  fire: {
    // The cooking fire keeps burning through the rains under its thatch cook-shelter
    // (design.md §19.10, docs/peoples-1890.md §10, point 256): the sheltered flame
    // only dips a touch (steamier), the unsheltered flame is drowned toward embers.
    shelteredRainDamp: 0.25, // calibratable, debug-editable
    openRainDamp: 0.7, // calibratable, debug-editable
  },
  labelOverlay: {
    // Educated guess: a herd in the near view holds a dozen-odd animals, and
    // two dozen labels still read as annotation rather than as a page of text.
    maxLabels: 24, // calibratable, debug-editable
  },
  startup: {
    // Measured post-fix on the headless verify lanes (point 337): the worst
    // standstill is the renderer's own device/adapter init at ~1.0 s (WebGPU)
    // and ~2.1 s (WebGL 2), not a shader compile any more. 4 s leaves room for
    // a loaded machine while still catching the defect this guards, which was
    // 21 s of blocked thread and 20 s without a painted frame.
    pictureFreezeBudgetMs: 4000, // calibratable, debug-editable
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
  villageLife: {
    // The children's game of tag (design.md §19.10, work-order 480/351).
    // Calibratable starting values (educated guess, CLAUDE.md §2), tuned so a
    // pursuit is decided by a runner running out of steam within a quarter of
    // the backstop cap, never by the cap itself.
    tag: {
      childCount: 5,
      sprintSpeed: 3.4, // a child at a flat run, a little under an adult's sprint
      // Strictly above 1: a FRESH runner must be faster than a fresh chaser (so
      // a catch is never immediate) while a SPENT one sits at the shared floor
      // (so a catch stays reachable) — and the drain follows the pace run, which
      // is why the hunted child is the one that tires first.
      runnerBoost: 1.12,
      trotFactor: 0.5,
      recoverFactor: 0.38,
      floorFactor: 0.34, // winded, never frozen — a still child mid-game reads as a bug
      drainPerSecond: 0.14,
      recoverPerSecond: 0.06,
      breakOff: 0.4, // deliberately above the reserve at which EITHER role's curve meets the trot
      resume: 0.85,
      pressureDistance: 11,
      chaseReach: 14,
      commitDistance: 2,
      // Work-order 1176: the catch is a reaching hand ON the quarry, so the ring
      // is the reach of a child's leaning arm (0.24 m arm, 0.5 rad lean) plus the
      // quarry's trunk and one hand — measured through the drawn chain, the hand
      // touches up to 0.45 m and stands 7 cm off at 0.5. It was 0.8, a touch the
      // arm could never make. Calibratable.
      catchDistance: 0.45,
      targetSwitchMargin: 1.5,
      immunitySeconds: 1.4,
      resolveCapSeconds: 45, // BACKSTOP per chaser tenure, not the mechanism
      idleSeconds: 8,
      trendTau: 0.6,
      trendEnter: 0.02, // a steady chase trends at zero — the burst must still open
      trendLeave: 0.12,
      variation: 0.2,
      unstuckSeconds: 1.5,
      // How long a child keeps to ONE way round what is in front of it (point
      // 648). The commitment normally ends by itself, the moment the child is
      // travelling where it wanted again; this is only the backstop on a side
      // that turned out to be the long way round. At the trot that is some four
      // metres of edge — a hut is round in two — and short enough that a child
      // never circles a whole compound before it thinks again.
      edgeSeconds: 3,
      // The long-run alarm's window (point 589). The longest LEGITIMATE gap
      // between two round events is a tenure that runs to the backstop plus the
      // idle break after it (45 + 8 s); this sits well clear of it, so only a
      // game that has genuinely stopped producing trips it.
      silenceSeconds: 90,
      leanAtSprint: 0.28,
      // ~3.6 rad/s: a body turns a half circle in about a second — quick enough
      // for a chase to read as agile, slow enough that no figure snaps about-face.
      turnRate: 3.6,
      // Work-order 1176, calibratable estimates. The caught child's beat of
      // frustration; the tag-back window (1.4 s) covers it plus a first step.
      caughtPauseSeconds: 0.7,
      // Work-order 1239, calibratable estimates. A caught child stands in a
      // frustrated slump instead of squatting: the trunk leans forward (0.48 rad
      // = 28°; 0.40 did not separate from the sprint's 0.28 at 12 m in the
      // bank-run picture) and both arms hang plumb, closer to
      // the body than at rest (0.46). The roll was specified at 0.20, but below
      // about 0.34 the upper arm sinks into the trunk cone at this lean
      // (src/render/figures.test.ts pins the clearance).
      // OPEN: confirm 0.34 against the specified 0.20 in the picture.
      caughtSlumpLean: 0.48,
      caughtSlumpArmRoll: 0.34,
      // The chaser looks at its quarry within a modest trunk turn.
      gazeTurnMax: 0.6,
      // One wordless child cry on the catch: a short "ha!", varied a little per
      // cry, heard as far as the talk register carries (10 m).
      crySeconds: 0.22,
      cryPitchSpread: 0.08,
      cryReach: 10,
      cryGain: 0.8,
      // A ground 20 m across: room for a chase to breathe, small enough that the
      // group stays one group a player can stand among and hear (point 481).
      playRadius: 10,
    },
    // The children's game at the bank (work-order 687). Calibratable starting
    // values (educated guess, CLAUDE.md §2), all debug-editable, chosen so a
    // visiting player sees a WHOLE cycle rather than a fragment of one: the
    // roaming phase is of the order of a minute so the RIVER call that opens the
    // cycle is never missed, and every phase that ends on a CONDITION carries a
    // backstop generous enough that it is the condition — not the clock — that
    // normally ends it.
    bankGame: {
      // The pre-1176 ring, kept for the bank round: its catch has no reaching
      // hand and its landed pictures must not change. Calibratable.
      catchDistance: 0.8,
      // A player at the river must not wait out a whole roam for the first word
      // (work-order 1250). A switch, like `loom.placed`.
      visitOpensAtBank: true,
      roamSeconds: 55,
      roamSpread: 0.25,
      // Calibratable backstops: allow a full-stretch walk plus a hut detour.
      // The group normally opens on arrival; these only release a blocked child.
      // Gather previously needed 34.5 s in Mandinka even at a run.
      gatherSeconds: 60,
      runSeconds: 20,
      // One complete atom lasts 1.2 s. The extra beat lets the player connect
      // the catcher's held indication to ROCK before either side charges.
      tapPauseSeconds: 1.5,
      // Calibratable: a short walk back into the catcher line, clear of the touch spot.
      tapReturnSeconds: 6,
      // Calibratable: 400 s village replays at 0.6 m give regroup ranges of
      // 7.47-12.90 s (Bambara@42), 7.87-8.40 s (Bambara@2972259115), and
      // 7.93-18.62 s (Mandinka@99), with no backstop. At 0.2 m, Bambara@42
      // stalls for 62.05 s: crowd/collider jostle can keep the last 20 cm out
      // of reach. 0.6 m still fits well inside the 1.32 m charge-frame bar
      // (reachDistance * 0.6). Stone queues have their own timeout below.
      catcherStationDistance: 0.6,
      // Calibratable: one ROCK atom plus a beat with the hand resting on the flank.
      arrivalHoldSeconds: 1.5,
      // Calibratable: 14 s bounds occupied stone queues in 400 s village replays
      // at shipped and 8 s roaming, well before the group's walk backstop.
      arrivalApproachSeconds: 14,
      // Calibratable: catchers walk the full stretch after the sides swap.
      regroupSeconds: 60,
      partSeconds: 8,
      endPauseSeconds: 3,
      // Calibratable: one cycle may be too short to watch and the next comes minutes
      // later, so a session plays this many cycles in a row (user 30.09.2026).
      seriesCycles: 1,
      // Arrival/safe radius from the centre, outside the collider and footprint.
      // The runner walks on from here before its hand can name the stone.
      reachDistance: 2.2,
      standOff: 2.6,
      stationSpacing: 1,
      // The swerve that makes a run a game rather than a sweep: it begins while
      // the catcher is still twelve metres away and reaches 4.5 m at the closest.
      // The bend is therefore readable before the catch, while its aim remains
      // inside the twenty-metre stretch rather than turning into an escape.
      laneSpacing: 1.2,
      dodgeDistance: 12,
      dodgeReach: 4.5,
      // A quarter turn a second at the most: a wander that reads as wandering
      // rather than as a figure being blown about.
      roamTurn: 1.4,
      // A reachable stone keeps resetting this watch as the climber gets
      // closer. Thirty seconds without gaining any ground toward it means a
      // hut, pocket or other collider has made the approach impossible.
      roamGoalSeconds: 30,
      // THE CLIMB IS THE PICTURE, so it is paced to be SEEN (work-order 1080).
      // What shipped before was a 0.32 m hop held for 0.35 s while the child
      // stood 2.2 m clear of the stone: measured over five seeds and ten minutes
      // of village time each, the pose was up for 1.83-2.20 s of 600 s, and the
      // user reported the climb as missing from the game.
      //
      // Estimates, calibratable (CLAUDE.md §2 / design.md §14). The approach
      // ends a hand's breadth outside the stone's collider — which already
      // stands 0.35 m proud of the drawn mesh, so the child is close enough that
      // the step up is a step and not a vault — it rises in a little under a
      // second, stands long enough for a player who looks over at the word to
      // find the child and the stone under it, and comes down a touch faster
      // than it went up. At a middling boulder that makes the rise ~1.2 m
      // across and ~0.42 m up in 0.9 s: a walking pace while climbing.
      // Together ~4.5 s per naming at the then 2.8 s hold, five or six namings
      // in ten minutes: still a
      // small part of a roaming phase, so the group keeps wandering and the
      // child-motion floor (25 m per played minute against a measured 102 m) is
      // untouched.
      //
      // AND THE STAND IS LONG ENOUGH TO BE FOUND (work-order 1082). 2.8 s was
      // still the length of a glance: the user reported the climb missing a
      // SECOND time, at shipped values, and the picture that had signed 1080 off
      // was taken with this number forced to 25 s. Seven seconds is the estimate
      // that lets a player who looks over when the word falls turn, find the
      // group and see what the child is standing on before it steps down; the
      // word over its head is derived from this number rather than written down
      // again (`speakBankUtterance`), so the two cannot drift apart. Together
      // ~8.6 s per naming against a cycle of minutes: still a small part of a
      // roaming phase.
      climbApproach: 0.15,
      climbRiseSeconds: 0.9,
      climbHoldSeconds: 7,
      climbSinkSeconds: 0.7,
      // A stone whose top is lower than this is a pebble: a child steps OVER it
      // rather than onto it, and the climb would read as a stumble. HISTORY
      // (before work-order 1082, when the value was 0.20 m): it was then a
      // search FLOOR, measured, because the first cut of it was both floor and
      // preference. At 0.30 m the bar refused the nearest stone in two of four shipped
      // village/seed layouts and sent the climber to one 5 m further off (in
      // bambara-village at seed 2972259115, 6.7 m → 12.0 m); the approach then
      // failed, the guard spent its overtime with the boulder unnamed, and the
      // group's whole trajectory moved enough to push a child's station-walk
      // over the shuffle gate (0.274 % against 0.25 %). The scatter's tops run
      // 0.16-0.53 m, and 0.25 m is a child's step; only the smallest instances
      // are genuinely too low to stand on. At 0.20 m the nearest stone won in
      // every shipped layout, which was what the round wanted: the stone the
      // children were next to anyway.
      //
      // THE COMPETITION IS OVER (work-order 1082), so the floor could be raised
      // where the note above could not raise it: the layout now DERIVES the
      // climbing stone instead of searching for one, and this number governs
      // only the fallback for a fabric that left no room. RE-MEASURED over the
      // 110 shipped village/seed layouts the 0.20 m note was measured on (22
      // villages x 5 seeds): every one of them carries a derived stone, top
      // 0.53 m, 96 of them standing 1.2 m outside the rim of the children's
      // quarter and the rest out to 6.0 m. What the pre-1082 search picked in those same
      // layouts was a stone of 0.20-0.52 m, 5.2-21.7 m from the quarter centre,
      // and 31 of the 110 were below 0.30 m — a pebble. 0.50 m is just under the
      // 0.5296 m a scale-1.0 instance guarantees, so the fallback can no longer
      // take a pebble while a real stone stands in the scatter; below that it
      // takes the tallest the settlement has, exactly as before.
      climbableRockTop: 0.5,
      // AND THE PHASE ITSELF IS BOUNDED, because the watch above is not enough:
      // it resets on ANY gain, so a child creeping toward a stone it can never
      // quite reach neither arrives nor fails, and the roaming phase then has no
      // end at all. Measured under load, the round sat in `roam` for 150 s of
      // its own clock without ever opening a run — a player at the bank watching
      // the children wander and never play.
      //
      // 45 s is the KNEE of the measured curve, not a round number: replayed
      // over nine village/seed layouts at the verification's own shortened roam
      // (122 roaming phases, 113 namings), a 45 s bound keeps 92 % of the
      // namings — and 60 s or 90 s keep 92-93 %, because every remaining one
      // needs 89-206 s. So the overtime past 45 s buys almost no teaching and
      // costs the deliverable: the game itself. What a cut-off cycle loses is
      // the off-game ROCK once; the RIVER call, the runs and the arrivals all
      // still happen.
      roamGuardSeconds: 45,
      // A child's walk, well under the chase's trot — the walks between runs
      // must read as walking, not as more running.
      walkPace: 1.4,
      // ONE EXTRA RADIUS over what a villager's body already claims (spec item
      // 7): the children are shy of the stranger, so they visibly swerve round
      // the traveller rather than brushing past him.
      strangerBerth: 0.3,
      // One atom is four syllables at `communication.syllableSeconds` — 0.3 s —
      // so an atom runs 1.2 s; this leaves a clear breath between two moments
      // that fall together.
      utteranceGapSeconds: 2,
      // The long-run alarm's window (point 589), first set for the situation
      // catalogue the five-word rebuild deleted and now read off the bank
      // round's OWN phases: the longest LEGITIMATE quiet spell runs from the
      // last arrival to the next cycle's RIVER call — endPauseSeconds (3), the
      // walk home (8), plus a
      // roaming phase at its widest spread (55 x 1.25 = 68.75) plus the off-game
      // ROCK guard's whole overtime (45), which is ~125 s, and in that stretch a
      // cycle whose boulder proves unreachable says nothing at all. Roughly
      // half again over that, so only a round that has genuinely stopped speaking trips it.
      roundSilenceSeconds: 180,
      // THE STRETCH MOVED UPSTREAM (work-order 1245, user 30.09.2026),
      // calibratable: with the symmetric ±45 m bank the stretch's upstream reach
      // matches the dugout's downstream one, and its span (21 m) stays inside
      // the upstream plateau with `BANK_STRETCH_PLATEAU_MARGIN` to spare. The
      // spec's ≈ −29 measured one metre short: at −29 the water path beyond the
      // stretch found no clear straight lane in 1 of ~450 river layouts
      // (mandinka-village@1479265250); at −28 with `waterFootBeyond` 8.5, none
      // of 900 (three villages, 2 x 150 seeds).
      stretchCentre: -28,
      // Calibratable (work-order 1245): the quarter lies BESIDE the stage
      // (design.md §13.4) — preferably within 40 m of the stretch's middle,
      // and in any case where its far rim lies within the CALL reach of the
      // stage's photographing stand less a 2 m margin, so its RIVER call is
      // heard there; where no ground keeping every floor is, the nearest one.
      quarterWithin: 40,
      quarterCallMargin: 2,
    },
    // The adults' errands (work-order point 483). Calibratable starting values
    // (educated guess, CLAUDE.md §2): slower than the children's chatter,
    // because each errand is a WALK the player has to be able to follow with his
    // eyes — an utterance every nine seconds leaves the walk it explains alone
    // in the picture, and the dwell is long enough to read as "arrived" without
    // parking a figure at the water for a minute.
    adultErrands: {
      intervalSeconds: 9,
      intervalSpread: 0.35,
      dwellSeconds: 6,
      digSeconds: 9, // several strokes of the digging motion, plainly readable
      // THE WORKING RIM (work-order 1125), calibratable: the drawn mouth's
      // broken ground reaches 1.01 m out (layout `DIG_SITE_RADIUS` 0.9 m, drawn
      // to r x 1.12 in `DigSites`), and a hoe held in both hands adds about
      // 0.64 m of reach. A man standing here has the blade in the hole and his
      // own feet on unbroken ground.
      digStandDistance: 1.65,
      // Arrival slack (0.25 m) plus the shove of a body squeezing past, so a
      // nudged digger keeps working instead of flickering between poses. It
      // stays well inside the 2.4 m approach stand, which is NOT a dig stand.
      digStandTolerance: 0.45,
      // Backstop only: a blocked walk lets go instead of pinning. It has to
      // OUTLAST the longest errand the catalogue can order, or the villager is
      // released halfway and the errand teaches nothing.
      // RE-SIZED FOR THE ROUND TRIP. The water errand is no longer the walk OUT
      // to the bank: one carrier now walks to the stand, on to the water, dips,
      // and walks the whole way BACK to report. Measured over the three river
      // villages at twenty seeds each: the worst stand-to-fill leg is 34.8 m, so
      // the round trip alone is 69.6 m — 55.7 s at this pace — and the carrier's
      // own walk to the stand comes on top, about 84 s of straight line in the
      // worst village. At the old 180 s a walk that took twice its straight line
      // round huts and villagers ran the errand out of time ON THE WAY BACK: the
      // jar was set down but the report was never spoken, which the WebGPU pass
      // of 12.09.2026 caught as "water-back: villager 1 ran out of time with his
      // walk word unspoken". 300 s is 3.6x the measured straight line, and a
      // genuinely stuck villager is still let go by `stallSeconds` below long
      // before it. Calibratable (CLAUDE.md §2).
      // RE-SIZED AGAIN BY WORK-ORDER 1245: the water path moved upstream with the
      // children's stretch, and the worst stand-to-fill leg grew to about 62 m
      // (bambara-village seed 1: 150.6 s of straight round trip, 327 s once
      // doubled for bends and given its dwell and stall). 360 s covers it.
      // RE-SIZED BY POINT 1282: with the centre mortar gone to the river the
      // worst plan is mandinka-village seed 5 (167.2 s straight, 360.4 s with
      // bends, dwell and stall). 375 s covers it.
      errandSeconds: 375,
      // A walk that gets NOWHERE for this long is let go — twenty seconds is
      // many times the longest stretch a legitimate detour round a hut spends
      // without shortening the straight line, and a fifteenth of the backstop
      // above, which on its own held a blocked villager for twenty staged
      // errands and left the village silent for minutes (point 586).
      stallSeconds: 20,
      pace: 1.25, // an unhurried working walk
      villagerCount: 4,
      // Calibratable (work-order 1245). The landing used to lie about 4.25 m
      // beyond the upstream rock, but at a clearly different BEARING from the
      // centre, since the stretch sat on the normal. Moved upstream, the
      // stretch's upstream rock lies almost on the foot's radial line, so the
      // straight track from the village to the foot runs past the rock unless
      // the foot sits further out: at 4 m no river layout found a clear lane,
      // at 8.5 all 900 measured did, with the fill spot still walkable.
      waterFootBeyond: 8.5,
    },
    // THE LOOM (work-order 1157). Calibratable starting values (CLAUDE.md §2),
    // each stated against what it has to hold:
    //  - 3.2 m of warp either side of the seat makes a 6.4 m stretch. It has to
    //    be long enough that a helper WALKING to one end reads as a direction
    //    rather than a step aside, and short enough to fit the room a village
    //    has left between its huts; the water path's own head sweep works with
    //    the same order of distance.
    //  - The helper works at 2.4 m, well inside the stake, so he stands ON the
    //    warp and not past its end.
    //  - One pass takes 2.6 s: slow enough to follow the shuttle across by eye,
    //    quick enough that half a minute of watching shows real progress.
    //  - 0.11 m of strip per pass fills a 3.2 m side in about 29 passes — 75 s,
    //    so a player who watches sees the cloth grow and, staying longer, sees
    //    it taken off and the warp bare again.
    //  - A named tending every 18 s is "a few times a minute" (item 8): often
    //    enough to catch in passing, rare enough that the speech labels do not
    //    become noise beside the children's.
    // THE VILLAGER'S DUGOUT (work-order 1237). Calibratable starting values
    // (educated guess, CLAUDE.md §2), after the Niger's Bozo/Somono river
    // fishermen of the 1890s: a small fishing pirogue of about 5.5 m, paddled
    // kneeling. It makes about 1.3 m/s through the water; against a dry-season
    // current of about 0.5 m/s that is 0.8 m/s over the ground, kept close in
    // where the current is weakest, while the run back rides the current at
    // about 1.5 m/s with steering strokes only. The lane lies 7 m out between
    // s = +27 and +47 m, so it keeps 20 m from the children's stretch (10 m
    // hearing zone + 10 m hearing radius) and no standing place hears the
    // SPOKEN words of both; the call carries at the call register (34 m).
    // THE FISHERMEN (work-order 1237, rebuilt by 1245). Calibratable starting
    // values (educated guess, CLAUDE.md §2). The lane runs 7 m out from s = −2
    // to s = +47 (49 m), 20 m clear of the children's stretch (centre −28, down
    // to −17.5) and of the water work (−46.5). Paces: a dugout paddled against
    // the Niger's current near the bank, and carried by it. One round comes to
    // about 139 s (61 s up, 33 s down, the rest turning, hauling, landing and
    // handing the catch over), which the carrier's round is timed against.
    canoe: {
      laneOut: 7,
      laneStart: -1,
      laneEnd: 47,
      stretchGapMin: 20,
      upstreamSpeed: 0.8,
      downstreamSpeed: 1.5,
      turnSeconds: 6,
      haulSeconds: 10,
      landSeconds: 6,
      launchSeconds: 6,
      stepSeconds: 1.5,
      liftSeconds: 0.8,
      fillSecondsPerFish: 0.9,
      // Well inside the floor's own 240 s hold, so a held word is let go by
      // the boat rather than forced out by the floor.
      wordWaitSeconds: 12,
      // Calibratable (work-order 1250): long enough that the boat is seen
      // under way before the word, short enough that a player walking in from
      // the entrance hears the first DOWNSTREAM within a few seconds.
      firstCallSeconds: 4,
      // A drift net of the middle Niger brings a handful of fish per drift,
      // Nile perch young and tilapia of a hand to a forearm (user 30.09.2026:
      // "recognisable, not stylised").
      catchMin: 4,
      catchMax: 8,
      fishLengthMin: 0.25,
      fishLengthMax: 0.4,
      // The net is set on the hull's shore side (seen from the village): the
      // float line reaches 2 m in toward the bank and trails ~4 m upstream.
      netLength: 4.5,
      netReach: 2,
      netFloats: 10,
      strokeSeconds: 1.3,
      steerStrokeSeconds: 3,
      haulStrokeSeconds: 1.6,
      hullLength: 5.5,
      hullBeam: 0.62,
    },
    // THE FISHERMEN'S FIRE (work-order 1245). Calibratable (CLAUDE.md §2). The
    // carrier's gutting fills his round up to the boat's (`gutSecondsFor`), so
    // with about six fish a round he spends ~20 s on each; the griller keeps
    // four on the embers for 50 s each, far more than the ~6 fish a round
    // bring, so the board never backs up; the pounding pair comes about every
    // three minutes and takes a fish each, which the next laid fish replace.
    fishFire: {
      fireBack: 8,
      fireInland: 6.5,
      carrierPace: 1.25,
      duoPace: 1.1, // calibratable
      liftSeconds: 0.8,
      carrierLeadSeconds: 6,
      gutMinSecondsPerFish: 6,
      startFish: 3,
      grillSlots: 4,
      grillSeconds: 50,
      takeSeconds: 1.2,
      turnSeconds: 1,
      laySeconds: 1.2,
      packSeconds: 1.2,
      rackFill: 8,
      storageStart: 4,
      duoIntervalSeconds: 180, // calibratable
      duoIntervalSpread: 0.3, // calibratable
      eatSeconds: 24, // calibratable
      biteSeconds: 3, // calibratable
      duoHomeBack: 12, // calibratable
      duoMortarOffset: 0.6, // calibratable
      duoRackGap: 0.85, // calibratable
      waitBudgetSeconds: 15,
      shelterPostR: 1.55, // calibratable
      colliderMargin: 0.15, // calibratable
      figureBodyR: 0.28, // calibratable
    },
    loom: {
      placed: false, // weaving parked (user 29.09.2026); true re-enables the station
      warpHalf: 3.2,
      tendStand: 2.4,
      passSeconds: 2.6,
      clothPerPass: 0.11,
      tendIntervalSeconds: 18,
      tendIntervalSpread: 0.35,
      tendDwellSeconds: 5,
      helperPace: 1.25, // the errand walk's own unhurried pace
      // Calibratable scenery and motion; no inventory or trade value.
      foldSeconds: 3.2,
      weaveSaturation: 0.25,
      helperCycleSeconds: 1.1,
      stackCap: 8,
      stackFallback: 3,
      stackSeedMin: 2,
      stackSeedMax: 4,
      beatPeak: 0.65,
      beatAttack: 0.003,
      beatDuration: 0.085,
      beatFrequency: 1800,
    },
    // Calibratable starting values (educated guess, CLAUDE.md §2): an East and
    // West African wooden mortar scaled to the 1.34 m figure — a 1.6 m woman's
    // ~65 cm mortar and ~1.6 m pestle — and a stroke of about one per 1.5 s per
    // woman, so a pair thuds roughly every 0.75 s.
    mortar: {
      pounders: 2, // calibratable
      strokeSeconds: 1.5, // calibratable
      height: 0.54, // calibratable
      footRadius: 0.16, // calibratable
      waistRadius: 0.085, // calibratable
      rimRadius: 0.16, // calibratable
      bowlDepth: 0.17, // calibratable
      grainBelowRim: 0.07, // calibratable
      standOff: 0.42, // calibratable
      strikeOffset: 0.06, // calibratable
      pestleLength: 1.3, // calibratable
      pestleRadius: 0.032, // calibratable
      gripFromFoot: 0.25, // calibratable
      gripHalf: 0.05, // calibratable
      impactDepth: 0.03, // calibratable
      liftAboveRim: 0.18, // calibratable
      footDrift: 0.12, // calibratable
      squatDepth: 0.12, // calibratable
      leanImpact: 0.04, // calibratable
      leanTop: 0, // calibratable
      puffGrains: 12, // calibratable
      puffSeconds: 0.38, // calibratable
      puffSpeed: 0.9, // calibratable
      thudPeak: 1.1, // calibratable
      thudAttack: 0.004, // calibratable
      thudDuration: 0.14, // calibratable
      thudFrequency: 260, // calibratable
    },
    // The body every inhabitant presents to every other (work-order 578).
    // Calibratable starting values (educated guess, CLAUDE.md §2), stated
    // against the values they have to live with:
    //  - 0.24 is 0.8 of the mover footprint (WALKER_RADIUS 0.3), so two adults
    //    stand 0.48 m apart — clear of one another at the torso without the
    //    village shouldering itself all day (the animals' 0.18 for the same
    //    reason). A child is drawn at 0.55, so its pair separates at 0.264 m.
    //  - THE CATCH WINS (point 578.4): the children's catch distance (0.45 m in
    //    tag, 0.8 m in the bank game) is 1.7 to three times the separation two
    //    children settle at, so a chaser is
    //    always well inside its tag before the bodies ever touch.
    //  - THE SLOP is the anti-jitter half, and it is the whole of it: nothing is
    //    corrected inside a centimetre, so a settled pair has nothing left to
    //    trade. The STIFFNESS was the other half and was the bug (point 648):
    //    taking half of the overlap per frame is less than two children running
    //    at each other ADD per frame, so the pass never caught up and the pair
    //    stayed visibly inside one another. At 1 the overlap is gone in the step
    //    it appeared, and nothing rings because the push never overshoots.
    //  - MAX SPEED bounds only the deep spawn stack. 8 m/s is above the fastest
    //    pair that can close (a chaser at 3.4 and a runner at 3.81 = 7.21 m/s),
    //    so it can never again throttle an ordinary crossing, while a stack of
    //    two adults still unwinds over a couple of frames rather than snapping.
    //  - PASSES is the chain half. One sweep resolves a PAIR; pushing the middle
    //    of THREE out of one neighbour presses it back into the other, which was
    //    resolved already, so a cluster kept a residual overlap for ever.
    //    Measured over 600 s of the children's game alone: one sweep left 192–537
    //    overlapping pair-frames (worst 0.07 m of a 0.264 m contact), two left
    //    NONE. The SETTLEMENT holds more than the children, though — the adults,
    //    the porters and the routine walkers share one body set — so its chains
    //    are longer, and two sweeps still left a tenth of a percent of frames
    //    touching in the reported village. Four clears it. It is a CEILING, not a
    //    cost: the sweeping stops the moment one moves nobody, so an ordinary
    //    frame pays for one and only a real cluster pays for more.
    separation: {
      bodyRadius: 0.24,
      slop: 0.01,
      stiffness: 1,
      maxSpeed: 8,
      wedgeSeconds: 1.5,
      passes: 4,
    },
  },
  communication: {
    // Calibratable starting values (educated guess, CLAUDE.md §2). The pause is
    // long enough to read one atom as finished before the next begins; the
    // radius is a bit over twice the interact radius (4.5), so the children's
    // group and the adults' group are never heard at once from the middle.
    phrasePauseSeconds: 0.9,
    // THE RANGE OF THE WHOLE ACT, not of the voice alone (point 580): a figure
    // gestures only where it is also heard and read, so this one value bounds
    // the utterance, the note over the head AND the arms. Beyond it a villager
    // stands still rather than miming a concept the player gets no word for.
    // The rule lives in src/communication/spokenGesture.ts and follows this
    // value wherever the debug menu sets it.
    hearingRadius: 10,
    // One four-syllable atom takes 1.2 s at this pace (point 686 shortened the
    // word from five syllables to four) — slow enough to count the beats by ear,
    // quick enough that the chief's four-atom message stays short.
    syllableSeconds: 0.3,
    // Conversational reach: 73.5 % at 3 m, 50 % at 5 m, 20 % at the 10 m rim.
    talk: { reach: 10, loudness: 1, falloff: 4 },
    // Rock-to-stand is 22.03 m; Mandinka's roaming RIVER caller reaches 32.64 m
    // in the shipped-layout replay. Keep the whole call audible (calibratable).
    call: { reach: 34, loudness: 1.25, falloff: 4 },
    consequenceSeconds: 2,
    // Calibratable (CLAUDE.md §2), user's default of 22.09.2026: one second
    // between the end of an order and the first step of the man obeying it.
    // Long enough that the word plainly comes FIRST and the act answers it,
    // short enough that the two still read as one exchange. With a four-
    // syllable word at 0.3 s that is a 2.09 s hold, which sits inside the
    // floor's own consequence window (1.2 + `consequenceSeconds`) and inside
    // the note over the speaker's head (`labelSeconds`), so nothing else in the
    // village speaks into the gap and the player can still see what was said
    // when the body answers it.
    // WATER IS SCARCE (point 1182), SO THE COST WAS MEASURED, NOT ASSUMED: over
    // 1200 s of simulated village at four adults, the interval between two
    // deliveries is 63.29 s both with the hold and without it (19 deliveries
    // either way). The errand carries TWO held words, but the catalogue only
    // casts water on its `intervalSeconds` grid, which swallows them; the same
    // harness moves to 80.72 s at a hold of 8 s, so the reading is a real
    // measurement and not a blind spot.
    instructionHoldSeconds: 1,
    speechHoldSeconds: 240,
    // Long enough to read one reading and look back at the speaker, short
    // enough that the scene never carries standing text; a phrase adds one
    // pause per further atom (speechLabelSeconds).
    labelSeconds: 2.6,
    // A low chest voice, and a major sixth above it for `BA` (point 587): wide
    // enough to be unmistakable side by side and over the drums, and NOT an
    // octave, which the ear is prone to confuse with the same note. Both pitches
    // stay in one human speaking range, so the two read as one voice.
    speechPitchHz: 140,
    // Calibratable child register and width; both tones move by the same factor.
    speechChildPitchHz: 210,
    speechStereoWidth: 0.6,
    speechPitchInterval: 1.68,
    // Independent speech bus. Re-measured with child carriers and compensated
    // stereo: the envelope peak was reduced for headroom (speaking.ts), while
    // falloff 4 still lifts speech at 3 m and at the hearing rim.
    // 1.5x its former 2 on the user's instruction of 18.09.2026, 07:50.
    // MEASURED HEADROOM: see the graph test in src/systems/ambience.test.ts.
    speechVolume: 3,
    // 2.5x its former 1.8 on the same instruction — the literal used to sit in
    // drumMessage.ts, where nothing could calibrate it. MEASURED IN THE GRAPH,
    // not in the plan (src/systems/ambience.test.ts): the loudest strike reaches
    // the destination at 0.135 over the 0.114 village floor, so the message on
    // its own clears full scale. The ambient bus and the speech bus meet at the
    // one master, so a strike landing on the two-voice worst case still adds to
    // it — that coincidence is point 1156's, not a reason to lower this value.
    drumMessagePeak: 4.5,
    // Calibratable (CLAUDE.md §2, point 1276): the tail tip ends just above the
    // drawn head. The gap used to be 0.15 m over the actor record — itself
    // 0.11 m over the head sphere — and a metre gap grows on screen as the
    // speaker nears: 65-85 px over a speaker 4 m away. The anchor is the head
    // top now and the gap a fixed screen lift, so it reads the same at every
    // distance: 5 px clears the hair, and the band allows the projection's
    // rounding plus a head bobbing with the walk between frames. The floor is
    // positive: a tip touching the hair (0 px) reads as no gap at all.
    labelTipGap: { px: 5, minPx: 1, maxPx: 16 },
    // Calibratable (CLAUDE.md §2): with two notes up, the older one steps back —
    // dimmed and a little smaller — so the current speaker's note is always the
    // most prominent. Still readable: the player may want to guess at it.
    labelRecede: { opacity: 0.55, scale: 0.85 },
    // Calibratable (CLAUDE.md §2, user-approved 03.10.2026): the note follows
    // felt loudness. The old linear curve spanned only 1.8x and held flat below
    // 3 m while the speaker's own picture grows ~1/d, so a near note read
    // SMALLER beside its speaker. Against those values: near (3 m) x2.25 —
    // nearScale 1.35 -> 3.04 — and far (22 m) /1.25 — farScale 0.75 -> 0.60 —
    // with baseScale 1.4 unchanged; between them a power law,
    // k = ln(3.04/0.60)/ln(22/3) ~ 0.81. Closer than 3 m it keeps growing to a
    // hard cap of 4.0 (reached at ~2.1 m); beyond 22 m it holds at 0.60. The
    // viewport caps — a third of the width, under a third of the height — keep
    // a close-up note from covering the scene whatever its text.
    speechBubble: {
      baseScale: 1.4,
      nearDistance: 3,
      farDistance: 22,
      nearScale: 3.04,
      farScale: 0.6,
      maxScale: 4,
      maxViewportWidth: 0.35,
      maxViewportHeight: 0.3,
    },
    // Calibratable (CLAUDE.md §2): the find is handed over face to face, so the
    // reach is an arm's length plus a step — a little over the 1.6 m the chief
    // stands beside his own door (CHIEF_STAND_OFFSET), and well inside the
    // hearing radius, so a traveller who can give it is always one who can hear
    // the answer.
    giveReach: 2.6,
    // Calibratable (CLAUDE.md §2): an old man's unhurried pace, well under the
    // traveller's own, so the walk across the village reads as a walk and not
    // as a slide — and short enough that the player who pressed the key at the
    // hut is not left waiting for him.
    chiefWalkSpeed: 1.4,
    // THE CALIBRATABLE MINUTE (user 07.09.2026). Long enough to walk over from
    // the hut, listen to the sixteen strikes and ask for them once more;
    // short enough that a player who wanders off finds the village as he left it.
    chiefStaySeconds: 60,
    // Calibratable: one long stride beside the drummer. It clears both drum
    // shells (the further one reaches 0.5 m out) and keeps the two men close
    // enough to stand in one picture from the front.
    chiefBesideDrummer: 1.5,
    // Calibratable: the player’s 0.7 m diameter plus 0.1 m of walking clearance.
    chiefHutGap: 0.8,
    // Calibratable: the market hut stands ~6 m from the drummer and spans about
    // ±29° there; 60° keeps its edge well off the line to the chief’s hut.
    marketBearingFromChief: 60,
    // Calibratable: the same reach the give already uses, so a traveller who
    // can hand the find over is exactly one who can ask for the drums.
    chiefTalkReach: 2.6,
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
/** Start gifts in copper (user decision 18.09.2026, revising the giftless start
 *  of 17.09.2026): villages trade in gifts only, so the expedition can buy there
 *  before it has visited a bazaar. */
export const START_GIFTS = 10

/**
 * Villager dress, the cells the research could not settle (work-order "dress by
 * people, sex, age, season and year"; docs/peoples-1890.md §8.3). Every value is
 * a CALIBRATABLE educated guess: neither the period search nor the second
 * search (GPT-6 Astra, 04.10.2026) found a dated figure for any of them.
 */
export const VILLAGER_DRESS = {
  /** Share of Zulu cold-weather cloaks that are a trade blanket rather than a
   *  greased hide, by game year (linear between the two ends). Mayr's 1907
   *  "Skin-Zulu → Blanket-Zulu" names the direction, no source the rate. */
  zuluBlanketShare: { from: 1890, share: 0.3, to: 1895, shareTo: 0.5 },
  /** The year from which a Baganda man of rank wears a white cotton kanzu over
   *  the bark cloth: the protectorate (1894) favoured cotton (§2.5, MODERN). The
   *  record gives no population-wide date (Astra B44), so it is rank-gated. */
  bagandaCottonFrom: 1894,
} as const

/**
 * How a villager walks, kneels and carries on the head (work-order "walking
 * villagers"). Units are the figure's own (an adult man is FIGURE_STATURE
 * tall), seconds and radians. Every value is a CALIBRATABLE educated guess,
 * read off the pictures, not a measured gait.
 */
export const VILLAGER_MOTION = {
  /** How far the lowest foot point may sit off the ground under it. */
  footGroundTolerance: 0.02,
  /** How far a planted foot may drift along the ground during one stance. */
  stanceSlipTolerance: 0.03,
  /** Hip swing (rad) at the reference pace; the stride scales from it. */
  swingAmp: 0.34,
  /** Pace (figure units per second) the swing amplitude is stated for. */
  referenceSpeed: 1.2,
  /** The stride's span of the amplitude, as factors over `swingAmp`, from a
   *  shuffle to a hurry. */
  ampMin: 0.45,
  ampMax: 1.25,
  /** Below this ground speed a figure is standing, not walking. */
  moveSpeed: 0.08,
  /** Time constant (s) of the measured ground speed's smoothing. */
  speedSmoothing: 0.12,
  /** A ground speed above this is a placement, not a walk (no stride). */
  teleportSpeed: 6,
  /** How fast the walk fades in and out (weight per second, 0 ↔ 1). */
  walkFadeRate: 5,
  /** Swing foot's lift at mid-swing, as a fraction of the leg length. */
  clearance: 0.07,
  /** Arm counter-swing (rad) at a full stride. */
  armSwing: 0.3,
  /** Pelvis and shoulder counter-rotation about the vertical (rad). */
  hipYaw: 0.07,
  shoulderYaw: 0.09,
  /** The elder's walk: shorter stride and smaller swing, as a factor. */
  elderFactor: 0.65,
  /** How fast a work crouch is released and resumed (rad of knee flex / s). */
  crouchRate: 4.5,
  /** Going down to kneel and getting up again (s). */
  kneelSeconds: 0.6,
  /** Head loads: which carrier steadies the load with a hand on its rim, and
   *  which balances it hands-free. docs/peoples-1890.md names no variant, so
   *  this is the guess: a brimming water jar is steadied, a dry basket or
   *  bundle balanced. */
  headLoad: {
    jar: { steady: true },
    basket: { steady: false },
    bundle: { steady: false },
  },
  /** How far up a steadied load the hand grips, as a fraction of its height
   *  (lowered further where the arm cannot reach — never a straight arm). */
  gripFraction: 0.8,
  /** How far a held stance foot may stray from under its hip, as fractions of
   *  the leg length (sideways, fore/aft), before it is dragged along — the
   *  reach a turn or a shove asks of the planted leg. */
  plantSide: 0.3,
  plantFore: 0.5,
  /** The stepping a turn asks for, as ground covered per radian turned
   *  (figure units): a walker turning steps round, it does not pivot on one
   *  held foot. */
  turnStep: 0.4,
  /** How fast a standing figure's feet shuffle back under the hips (figure
   *  units per second). */
  plantSettle: 0.6,
  /** The tightest corner a walker rounds at its pace (m radius), and how fast
   *  it turns nearly on the spot when its way lies far off its heading (rad/s). */
  turnRadius: 0.5,
  spotTurnRate: 3,
  /** The heading error (rad) at which a walker stops to turn; its pace eases
   *  from full (heading on its way) to nothing at this error. */
  turnStopAngle: 1.75,
} as const

/**
 * The villager's glTF body as the asset pipeline builds it (work-order "glTF
 * villager body"; scripts/villager/build.mjs reads this block). BUILD-time values:
 * a change takes effect when the pipeline is re-run and the .glb committed.
 * Every value is a CALIBRATABLE educated guess unless noted.
 */
export const VILLAGER_ASSET = {
  /** Crown height of an adult man in figure units (render/figureBody.ts
   *  FIGURE_STATURE: the primitive figure's cone 1 + head) — every caller sizes
   *  and collides a figure by it. Not a guess: the figure contract. */
  stature: 1.34,
  /** Stature against an adult man's, by age and sex (anthropometric means, as
   *  render/figureBody.ts); a child is built to the adult stature and drawn
   *  small by its caller's scale. */
  statureFactor: {
    child: { male: 1, female: 1 },
    youth: { male: 0.98, female: 0.94 },
    adult: { male: 1, female: 0.94 },
    elder: { male: 0.97, female: 0.91 },
  },
  /** MakeHuman's age slider (0 = 1 year, 0.1875 = 11, 0.5 = 25, 1 = 90) for
   *  each age group: a child of about seven, a youth of about sixteen, an adult
   *  of about thirty, an elder of about sixty-five. */
  makeHumanAge: { child: 0.1125, youth: 0.3, adult: 0.54, elder: 0.81 },
  /** The ethnic mix of MakeHuman's macro targets. */
  makeHumanRace: { african: 1, asian: 0, caucasian: 0 },
  /** How far a build of ±1 moves MakeHuman's weight slider off its average. */
  buildWeight: 0.3,
  /** Triangles of the decimated body (hands, feet and face kept finer). */
  bodyTriangles: 6000,
  /** How far a garment vertex may lie inside the body in any frame of any clip
   *  at any morph extreme (figure units, ≈ 4 mm) — the penetration report's
   *  tolerance. */
  garmentPenetrationTolerance: 0.003,
} as const

// Dev hook for the headless verification (the village-walk tolerances).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__villagerMotion = VILLAGER_MOTION
}
