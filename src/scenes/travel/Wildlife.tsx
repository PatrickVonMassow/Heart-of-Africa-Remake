// Ambient wildlife for the travel view (design.md §19): non-threatening
// herds as scenery (elephants, giraffes, zebra, wildebeest, antelope, warthog,
// flamingos at the lakes), a purely decorative predator hunt (lion, cheetah,
// leopard or hyena taking prey from its food web), and vultures circling the
// player when the expedition is in poor condition. The animals interact with
// one another: wandering elephants trample smaller animals underfoot (dead
// over a red stain), prey flee an active predator, and vultures gather above a
// kill. Herds raise young: calves gambol, get hunted (with the parent's rescue
// sacrifice) and fall into water (with the parent's rescue and the waterfalls'
// toll); kills leave remnants that the circling flock descends on and
// finishes (the ground scavenger serves only carcasses without a flock,
// e.g. trampled ones), animals keep body spacing and never stray into the
// open ocean. Only walking into the lion attacks the player (§14);
// otherwise no gameplay effect.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { healthState, useGame } from '../../state/store'
import { useUi } from '../../state/ui'
import { setAmbienceAnimals, playTrampleCrunch, proximityGain, trampleCrunchFires } from '../../systems/ambience'
import { devAssert } from '../../systems/devAssert'
import { setAnimalCollider } from './wildlifeCollision'
import { isOnScreen } from './frameVisibility'
import { latLonToWorld, regionAt, PLACES, UNITS_PER_DEGREE, worldToLatLon } from '../../world/geo'
import { RIVER_WIDTH_DEG, sampleTerrain } from '../../world/terrain'
import { waterSurfaceY } from './waterSurface'
import { drinkWalkDistance, crocodileNeedsReanchor } from './waterEdgeRules'
import { climateZoneAt, CURRENT_WEATHER } from '../../systems/season'
import { lakeDistance, riverDistance, riverFlow } from '../../world/geoIndex'
import { hashChunk, mulberry32 } from '../../world/noise'
import { balance } from '../../config/balance'
import {
  blockHeading,
  guardEngagement,
  griefTarget,
  frontInterceptTarget,
  elephantWouldTrample,
  deflectAroundCircle,
  fleesFromPlayer,
  fleeCrossing,
  resolveFleeTarget,
  type DramaState,
  flightStep,
  segPointDist,
  gambolState,
  groundNormal,
  leashedGambolDir,
  separationPush,
  edgeSeparationPush,
  turnToward,
  committedFleeHeading,
  FLEE_COMMIT_MARGIN,
  crocodileTargetWeight,
  prefersJuvenilePrey,
  killFlockMayDescend,
  killFlockActive,
  assignPerCarcassFlocks,
  pickOffscreenLandAnchor,
  calvesForGroup,
  deflectedStep,
  escapeCorridorHeading,
  calfFleeStep,
  type FlightState,
  channelDriftStep,
  ambientSavannaSpecies,
  claimedByAnotherDrama,
  drinkCatchment,
  mireFate,
  mireRoll,
  REGION_PREDATORS,
  parentAttackOutcome,
  PREDATOR_PREY,
  REGION_PREY,
  type PredatorKind,
  type PreyKind,
  vicinitySeedBounds,
  vicinityAttemptSeed,
  seasonFlowFactor,
  shouldMourn,
  mournDeadline,
  elephantStepAllowed,
  rescueSpeed,
  sheetAnchorY,
  wadeSpeed,
  waderStandY,
  PREY_WALK_SPEED,
  landedBirdYPosed,
  landedBirdClearancePosed,
  birdExtentOffsets,
  CROCODILE_REGIONS,
  crocodileAllowedAt,
  crocodileLungeReady,
  crocodileIdleYaw,
  crocodileGripExpired,
  crocodileHoldsCatch,
  grassFireEligible,
  ploverShouldLure,
  ploverLureHeading,
  ploverLureResolve,
  ploverTaken,
  vigilBlocksLanding,
  vigilDrawReady,
  offscreenRingSpawn,
  waterStruggleFate,
} from './wildlifeBehavior'
import { ELEPHANT_GRAVEYARD, WATERFALLS } from '../../world/data/landmarks'
import { rinderpestCarrionActive, rinderpestPhaseAtDay } from '../../systems/rinderpest'
import { START_YEAR } from '../../config/balance'
import {
  buildAntelope,
  buildAntelopeCalf,
  buildCheetah,
  buildElephant,
  buildCrocodile,
  buildFlamingo,
  buildPlover,
  buildPloverChick,
  buildGiraffe,
  buildHyena,
  buildLeopard,
  buildLion,
  buildLionCub,
  buildVulture,
  buildWarthog,
  buildWarthogCalf,
  buildWildebeest,
  buildWildebeestCalf,
  buildZebra,
  buildZebraCalf,
  createFaunaMaterial,
  crocodileBodyY,
} from '../../render/fauna'

const CHUNK_SIZE = 24

// The predator kinds are herd species too (point 146): a predator KILLED by
// an avenging parent becomes an ordinary carcass in the herd lists, so the
// existing scavenger/cull/render machinery works a dead hyena exactly like a
// dead zebra. Live predators never spawn here — spawnChunk picks species
// explicitly, and the one live hunter stays the scripted <LionHunt>.
type Species = 'elephant' | 'giraffe' | 'zebra' | 'wildebeest' | 'antelope' | 'warthog' | 'flamingo' | 'crocodile' | 'plover' | PredatorKind
const SPECIES: Species[] = [
  'elephant', 'giraffe', 'zebra', 'wildebeest', 'antelope', 'warthog', 'flamingo', 'crocodile', 'plover',
  'lion', 'cheetah', 'leopard', 'hyena',
]
const MAX_INSTANCES: Record<Species, number> = {
  elephant: 60,
  giraffe: 60,
  zebra: 120,
  wildebeest: 120,
  antelope: 120,
  warthog: 80,
  flamingo: 140,
  crocodile: 12,
  plover: 24,
  // Lion slots hold a lioness-and-cub family (point 145c) plus revenge
  // carcasses (point 146); the other predators hold only carcasses — kills are
  // rare and dissolve/cull quickly, so a handful of instances suffices.
  lion: 12,
  cheetah: 6,
  leopard: 6,
  hyena: 6,
}
/** Juveniles render through their own baby-schema geometry (design.md §19) in
 *  a separate instanced mesh per species; one calf per herd group keeps the
 *  counts small. Flamingos raise no young; the lion joins for its cub (the
 *  lioness-vs-hyena drama, point 145c), the other predators hold carcasses only. */
const CALF_SPECIES = ['elephant', 'giraffe', 'zebra', 'wildebeest', 'antelope', 'warthog', 'plover', 'lion'] as const
// Per-species calf render budget. Raised for point 169 (a fraction of each herd
// group is now calves, so several groups in view can hold more than the old
// one-per-group), still a small buffer.
const MAX_CALF_INSTANCES = 48

interface Animal {
  x: number
  z: number
  y: number
  rot: number
  scale: number
  /** Per-animal phase for the grazing shuffle. */
  phase: number
  /** Trampled by an elephant: lies dead at (x,z) (design.md §19). */
  dead?: boolean
  /** Shore point this animal periodically walks to and drinks at. */
  drink?: { tx: number; tz: number }
  /** Current heading for roaming elephants (radians; set lazily). */
  heading?: number
  /** Herd id shared by elephants placed together, so a herd moves as one. */
  herd?: number
  /** Chunk key that spawned this animal (for streaming despawn). */
  chunk?: string
  /** Seconds of carcass left once a scavenger has landed; removed at 0 (design.md §19). */
  dissolve?: number
  /** A juvenile that keeps close to its parent and nurses (design.md §19). */
  young?: boolean
  /** The young's parent (object identity survives array sort/filter). */
  parent?: Animal
  /** The parent's calf/foal, guarded against predators (design.md §19). */
  child?: Animal
  /** Shore animals that also wade in and bathe, not just drink (design.md §19). */
  bathe?: boolean
  /** Persisted flee/dodge heading, turned toward its target at a bounded rate so
   *  the facing never snaps between flanking threats (design.md §19). Shared by
   *  the elephant dodge AND the player-shy flight — ONE held heading, so the
   *  two threats can never fight each other into an oscillation. */
  dodgeHeading?: number
  /** Blended climb (0..1) of a bird flying off from the traveller (design.md
   *  §19): ramps up while the shy flight is engaged, settles once it ends —
   *  never a pop. */
  flyLift?: number
  /** Sticky escape-corridor heading for a hunted calf boxed against the sea
   *  (point 226): held while the direct flight dead-ends at a concave coast
   *  pocket so the shore run cannot flip-flop; cleared by the step itself the
   *  moment the direct flight opens again. */
  fleeCorridor?: number
  /** Blended amplitude of the idle shuffle render offset: behaviours fade it
   *  instead of switching it — a hard on/off popped the rendered position at
   *  every behaviour transition (design.md §19). */
  wobAmp?: number
  /** Play lock after a bout ended out of range: no new bout until the calf is
   *  well inside the range again (hysteresis against play/follow ping-pong). */
  playLock?: boolean
  /** Bout detour applied after hitting the sea mid-bout: the scamper bends
   *  along the bank for the rest of the bout instead of vibrating against it. */
  boutDetour?: number
  /** Seconds of struggle left while a predator eats this calf (design.md §19):
   *  during the window the calf is alive and wriggling (no stain/shrink yet), and
   *  a parent may still save it. */
  caught?: number
  /** This carcass is being consumed by the on-scene predator (the lion hunt),
   *  not the ground scavenger — keeps the vulture from double-feeding on it.
   *  Waterfall victims set it too: the river takes them, no scavenger lands. */
  lionFed?: boolean
  /** Seconds this calf has been struggling in open water (design.md §19). */
  inWater?: number
  /** Seconds a rescuing parent has been wading in open water (point 122) —
   *  its own field, NOT inWater: that one carries calf-only pose/behaviour
   *  couplings (facing freeze, dodge exemption, render struggle). */
  wadeTime?: number
  /** Seconds a calf has been MIRED in a dry-season lake bank (point 123):
   *  it struggles in place, cannot free itself, and the mud releases it
   *  only after balance.waterDrama.mireSeconds — unless a predator ends it. */
  mired?: number
  /** This calf is currently inside a gambol bout (per-bout mire roll). */
  bouted?: boolean
  /** Seeded by the dry-shore guarantee (point 135) — counted by tag. */
  shoreSeed?: boolean
  /** Land point to walk back to after a water rescue (where the calf fell in). */
  rescueEntry?: { x: number; z: number }
  /** The parent reached its calf in the water: both walk back to the
   *  rescueEntry until they stand on land again (design.md §19). */
  rescued?: boolean
  /** Where this parent's calf went over a waterfall: the parent plunges after
   *  it and dies there (design.md §19). */
  plungeTo?: { x: number; z: number }
  /** Where this parent's calf was trampled: the parent throws itself before the
   *  elephant's feet and is trampled too (design.md §19). Tracks the elephant's
   *  live position, not the death spot — it charges the moving feet. Grief, not
   *  a rescue: nobody is saved, both die. */
  trampleTo?: { x: number; z: number }
  /** Seconds of grief left (design.md §19): the charge above always resolves —
   *  it clears at 0 (or when no elephant is left) so a parent can never be
   *  stuck chasing a target that cannot trample it. */
  grief?: number
  /** The vigil at a calf's carcass (design.md §19.8, point 121): set when a
   *  predator finished the calf and this parent was alive but too far away to
   *  charge. It walks to the kill site, stands over the carcass, keeps the
   *  vultures off, and NEVER flees (a deliberate user decision) — a predator
   *  that reaches it takes it through the existing hunt path. time accumulates
   *  until balance.vigil.seconds or until the carcass is gone; then the field
   *  clears and the parent simply rejoins the herd. */
  vigil?: { x: number; z: number; carcass: Animal; time: number }
  /** Closest lion-to-calf approach seen by this guarding parent (point 191):
   *  feeds guardEngagement's release-on-recede, so a PASSING hunt is guarded
   *  only while it closes in — never leapfrog-followed to the kill. */
  guardMinD?: number
  /** Swept-and-grounded at least once (point 203(A)): the anchoring assert only
   *  judges animals the ground sweep has seen — a staged injection with a
   *  hard-coded y is corrected on its first sweep visit, not flagged. */
  grounded?: boolean
  /** Consecutive anchoring-assert visits this animal has been buried/floating
   *  (point 200): the tripwire fires only at 2+, tolerating a 1-frame transient. */
  floatStrike?: number
  /** A purposeful river/lake crossing (point 192): the far-bank target and the
   *  time spent. Exempt from the water setback while it lasts; swims at the
   *  seasonal wade speed with a lowered body; cleared on landing (or by the
   *  resolve deadline — every started move ends, invariant I4). */
  crossing?: { tx: number; tz: number; time: number }
  /** The crocodile ambush (design.md §19.16, point 130), per-crocodile state:
   *  absent = hidden at its spot; set = lunging at / gripping a victim or
   *  slinking back home. Its own state — the scripted LION hunt is never
   *  touched by an ambush. */
  lunge?: { victim: Animal | null; timer: number; homeX: number; homeZ: number; gripped: boolean; retreat?: boolean }
  /** A hidden crocodile's FIXED rest heading (point 257): captured once when it
   *  settles to waiting, the anchor its subtle idle yaw oscillates about. Held
   *  absolute so the sway can never accumulate into a rotation; cleared when the
   *  croc lunges so the post-attack slink-home heading re-anchors it. */
  restYaw?: number
  /** Spawned dead as rinderpest toll (point 133) — lets the verify count the
   *  plague's own carrion apart from ordinary hunt/trample deaths. */
  plague?: true
  /** Caught by the grass-fire line (point 145a): seconds of struggle left
   *  before the fire takes it. */
  fireTrapped?: number
  /** The ground-nester's nest spot (point 145b) — the fixed point it guards
   *  and returns to. */
  nest?: { x: number; z: number }
  /** The running broken-wing act (point 145b). */
  lure?: { timer: number; heading: number; returning: boolean }
  /** Seconds until the plover will act again (point 145b): after a lure it
   *  sits alert at the nest instead of looping the act at a standing threat. */
  lureCooldown?: number
  /** Which ambusher seized this animal (point 130): routes the shared caught
   *  countdown and the parent's charge to the crocodile instead of the lion
   *  hunt, and the kill sinks (the river takes the body) instead of staining. */
  caughtBy?: 'crocodile'
  /** Current playful-hop height (0..1) while a calf gambols (design.md §19);
   *  kept as state so the verification can observe the play. */
  hop?: number
  /** Removed from the herd arrays (culled/consumed): releases any scavenger
   *  flight still bound to this carcass — a ghost target would otherwise stay
   *  "valid" forever and pin the vulture to an empty spot. */
  gone?: boolean
  /** Prey scrap a finished hunt left behind (design.md §19.6): consumed by
   *  the kill-circling flock already overhead, never by the ground
   *  scavenger — the user-visible rule is that no NEW vulture flies in for
   *  a kill the flock has been circling all along. */
  remnant?: boolean
  /** Persistent rendered facing (radians), steered toward each frame's desired
   *  heading at a capped turn rate: the visible orientation can never snap —
   *  not between two flanking threats, not when a flight starts or ends, not
   *  on any behavior change (design.md §19). */
  face?: number
  /** Seconds left of the defence-strike pose (design.md §19.8, points
   *  124/125): set for EVERY successful defence, whatever the species and
   *  weapon — the parent rears and strikes out at the departing predator,
   *  then settles. The field keeps its 124 name. */
  kick?: number
}

/**
 * Shared lion-hunt state (module scope): the herds react to it — prey
 * animals flee from an active lion, vultures gather over the kill.
 */
interface LionHuntState {
  mode: 'idle' | 'chase' | 'feed' | 'leave'
  lx: number
  lz: number
  px: number
  pz: number
  timer: number
  /** Per-hunt weave phase (chase) / walk-off direction (leave). */
  heading: number
  /** Lion's current facing while pursuing (turn-rate limited). */
  lionHeading: number
  /** Prey's current flee heading (weaving). */
  preyHeading: number
  /** Predator running this hunt (chosen per hunt by region). */
  predator: PredatorKind
  /** Species being hunted (chosen per hunt from the predator's food web). */
  prey: PreyKind
  /** A hunted/eaten herd calf (then its sacrificed parent) when the hunt targets
   *  a family (design.md §19); null for a generic scripted-prey hunt. When set,
   *  this real herd animal is the visible victim and the scripted prey mesh hides. */
  victim: Animal | null
  /** True for the whole lifetime of a calf hunt (chase→feed→leave), so the
   *  scripted prey/stain meshes stay hidden — the herds draw the victim instead. */
  victimHunt: boolean
  /** Sticky escape-corridor course of the leave phase (point 188); undefined
   *  until picked, re-derived only when the held corridor closes. */
  leaveHeading?: number
  /** Sim-seconds spent in the leave phase (point 188): past the calibratable
   *  overtime a still-ringbound predator retires the moment it is off-frame. */
  leaveT?: number
}
const LION_STATE: LionHuntState = {
  mode: 'idle', lx: 0, lz: 0, px: 0, pz: 0, timer: 0, heading: 0, lionHeading: 0, preyHeading: 0,
  predator: 'lion', prey: 'zebra', victim: null, victimHunt: false,
}

/** The COMPLETE co-active drama/hunt state of one animal (point 252), fed to
 *  the flee arbitration. One builder — never a hand-picked subset at a call
 *  site — so no §19.8 drama can slip past the player-shy gate through an
 *  incomplete object (the earlier sites omitted vigil/kick/plunge/trample/
 *  defending; structurally unreachable while familyHeld suppresses the dodge
 *  block, but the arbitration must not depend on that ordering). `defending`
 *  derives from the child-in-peril relations the §19.8 rescue drives key on. */
function dramaStateOf(a: Animal, isHunted: boolean): DramaState {
  return {
    caught: a.caught,
    fireTrapped: a.fireTrapped,
    inWater: a.inWater,
    rescued: a.rescued,
    mired: a.mired,
    crossing: a.crossing,
    vigil: a.vigil,
    kick: a.kick,
    plungeTo: a.plungeTo,
    trampleTo: a.trampleTo,
    defending:
      a.child !== undefined && !a.child.dead &&
      (a.child.caught !== undefined || a.child.inWater !== undefined || a.child.mired !== undefined ||
        LION_STATE.victim === a.child),
    isLionVictim: a === LION_STATE.victim,
    isHunted,
  }
}

/** Pointer to the herds of the mounted <Herds>, so <LionHunt> can pick a nearby
 *  calf to hunt (both live in this module). Set each frame by <Herds>, cleared on
 *  unmount. */
let ACTIVE_HERDS: Record<Species, Animal[]> | null = null

/** Base render scale per prey species (warthog small, wildebeest sturdy). The
 *  giraffe geometry is already giraffe-sized (~3.6 units tall, fauna.ts), so
 *  its factor matches the ambient herds' 0.9 spawn base — it reads much larger
 *  than a zebra through the build, not the scale. */
const PREY_SCALE: Record<PreyKind, number> = { zebra: 1, wildebeest: 1.05, antelope: 0.85, warthog: 0.62, giraffe: 0.95 }

// REGION_PREDATORS now lives in wildlifeBehavior.ts (point 208 A3) so the
// random-event system shares the same roster; imported above.
// The food web itself (PREDATOR_PREY, REGION_PREY and the Predator/PreyKind
// types) lives in wildlifeBehavior.ts so the fit rules — incl. the lion-only
// giraffe of point 124 — are pure-testable.
/** Render scale per predator (cheetah/leopard lithe, hyena mid, lion large). */
const PREDATOR_SCALE: Record<PredatorKind, number> = { lion: 1, cheetah: 0.9, leopard: 0.92, hyena: 0.88 }

/** Distance (world units) at which walking into a lion triggers an attack. */
const LION_CONTACT_RADIUS = 2

/** Lion hunt (design.md §19): speeds, the prey's evasive weave, lion turn rate. */
const HUNT_PREY_SPEED = 4.6
const HUNT_LION_SPEED = 5.6
const HUNT_LION_TURN = 3.0
const HUNT_WEAVE_FREQ = 2.2
const HUNT_WEAVE_AMP = 1.0
const HUNT_LION_APPROACH = 15
/** After the meal the predator trots off and leaves the stage only well beyond
 *  the zoom-aware view ring — it never despawns in sight (design.md §19); a
 *  chase that strays ends past the same ring. */
const HUNT_LEAVE_SPEED = 4.5
const HUNT_OFFSTAGE_MARGIN = 30

/** Species that flee from a hunting or feeding lion. */
const FLEES_LION: Record<Species, boolean> = {
  elephant: false, giraffe: true, zebra: true, wildebeest: true, antelope: true, warthog: true, flamingo: false,
  crocodile: false, // the ambusher fears nothing on its water (point 130)
  plover: false, // the ground-nester's answer to threat is the lure, not flight (point 145b)
  // The lioness defends her cub rather than fleeing (point 145c); the other
  // predator lists hold only revenge carcasses (point 146) — nothing to flee.
  lion: false, cheetah: false, leopard: false, hyena: false,
}
const TRAMPLE_RADIUS = 1.5
const FLEE_RADIUS = 14
/** Base swim speed of a purposeful crossing (point 192) — slower than the walk,
 *  further braked by the seasonal flow via wadeSpeed. */
const CROSS_SWIM_SPEED = 2.6
/** Speed (units/sec) at which prey run from an active predator; the flee
 *  accumulates into the animal's position so it never teleports (design.md §19). */
const FLEE_SPEED = 5
const MAX_STAINS = 60
/** Elephant herd roaming (design.md §19): a slow amble that only ever moves
 *  forward, turning in gentle arcs. Herd-mates keep together (cohesion); they
 *  do not hunt prey — a smaller animal is only trampled if it happens to be in
 *  the herd's path and dodges too late. */
const ELEPHANT_SPEED = 1.5
const ELEPHANT_TURN = 0.55 // gentle steering only (no sharp turns / strafing)
const ELEPHANT_HERD_ARC = 0.3 // amplitude of the herd heading's slow S-curve
const ELEPHANT_COHESION = 6 // steer back toward the herd beyond this radius
/** The mourning vigil (design.md §19.8, point 126): a herd drawn to the
 *  graveyard's bones — or a dead herd-mate — walks in on its gentle arcs,
 *  halts a staggered step short of the target and lowers its heads, then
 *  moves on (window and draw radius in balance.mourn). */
const MOURN_STAND_DIST = 2.5 // a mourner halts this close to the bones (staggered per animal)
const MOURN_TOUCH_DIST = 5 // within this of the target the head lowers to the bones
const GRAVEYARD_POS = latLonToWorld(ELEPHANT_GRAVEYARD.lat, ELEPHANT_GRAVEYARD.lon)
/** The ground scavenger's landed-bird clearance this frame (point 128),
 *  written by the Wildlife frame and folded into the Vultures component's
 *  `clearance` dev hook so the verify metric covers BOTH vulture systems. */
const SCAV_CLEARANCE = { v: Infinity }

/** The burning of the steppe (design.md §19.8/§19.13, point 145a): in the
 *  cured dry-season grass of the Sahel and congo-north belts the inhabitants
 *  fire the land — Dybowski watched it at the game's own latitude, Park saw
 *  the lines of fire from the Gambia. A fire line walks downwind leaving a
 *  blackened band; a calf standing in its path is caught by the line, and
 *  the parent goes in after it — a SURRENDER of the point-134 family (grief
 *  pace, never the rescue burst, no defence roll). The fire never touches
 *  the traveller (any player effect would be a §14 design decision). */
const FIRE_STATE = {
  mode: 'idle' as 'idle' | 'burning' | 'smoulder',
  x: 0,
  z: 0,
  heading: 0,
  front: 2,
  timer: 90, // first ignition chance ~a minute and a half in
  victim: null as Animal | null,
  keeper: null as Animal | null,
}
const FIRE_FRONT_SPEED = 1.4
const FIRE_MAX_FRONT = 45
const FIRE_HALF_WIDTH = 6
const FIRE_SMOULDER_SECONDS = 90 // the blackened band lingers, then fades
const FIRE_COOLDOWN_SECONDS = 300
const FIRE_TRAP_SECONDS = 3
// GRIEF, not a rescue (point 134): the parent walks into the fire after its
// calf — its own pace, off the rescue burst, and it never rolls a defence.
const FIRE_PLUNGE_SPEED = 5.5
const FIRE_FLAME_COUNT = 14
const fireFlameGeo = new THREE.PlaneGeometry(1.0, 1.4)
const fireFlameMat = new THREE.MeshBasicMaterial({
  color: '#ff7a1e', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
})
const FIRE_BAND_SEGMENTS = 16 // terrain-following scorch strip (point 196)
const fireBandGeo = new THREE.PlaneGeometry(1, 1)
const fireBandMat = new THREE.MeshBasicMaterial({
  color: '#181008', transparent: true, opacity: 0.8, depthWrite: false,
})
/** Prey dodge an elephant only when it comes this close, and a touch slower
 *  than the elephant, so a head-on herd still tramples them now and then. */
const PREY_PANIC_RADIUS = 3.2
const PREY_PANIC_SPEED = 1.35
/** Max turn rate (rad/s) for a prey's dodge/flee facing: responsive enough to
 *  dart aside, capped so the heading can never snap between two threats. */
const PREY_DODGE_TURN = 8
/** Universal cap (rad/s) on every animal's rendered facing (design.md §19):
 *  each frame's desired heading only steers the persistent facing, so no
 *  behavior boundary can flip the body around within a frame. */
const FACE_TURN = 7
/** A dodge disengages only well past its trigger ring (hysteresis), so an
 *  elephant tailing its prey cannot flap the dodge on and off at the ring. */
const PREY_PANIC_EXIT = 1.5
/** Player shyness (design.md §19): weak/prey animals and any juvenile flee the
 *  traveller's bird's-eye figure inside this ring (hysteresis via
 *  PREY_PANIC_EXIT, exactly like the elephant dodge), running slower than the
 *  default travel speed so the traveller can still overtake them. The flee is
 *  cosmetic — the collision resolution stays consequence-free (blocked at the
 *  body edge, no damage, no event) and the §19.3 walk-into-a-predator attack
 *  is untouched. Birds take to the air instead of running. */
const PLAYER_SHY_RADIUS = 6
const PLAYER_SHY_SPEED = 4.2
const BIRD_FLY_LIFT = 2.6 // world units of climb at full flight
/** Family life (design.md §19): a calf keeps within the calibratable leash
 *  radius of its parent (balance.family.followRadius, read fresh per frame so
 *  the debug edit applies live), and a parent moves between an approaching
 *  predator and its calf to guard it, standing off a short distance in front
 *  of the young. */
const YOUNG_FOLLOW_SPEED = 4.5
const GUARD_RADIUS = 12
const GUARD_STANDOFF = 2.2
/** Calf predation (design.md §19): while the hunt runs, the parent does not
 *  flee — it holds itself between hunter and calf (BLOCK_*), a living shield
 *  on the escape line; a hunter that reaches the blocking parent (TAKE_DIST)
 *  takes it in the calf's place and the calf escapes uncaught. If the parent
 *  cannot reach its station in time and the calf is caught, it does not die at
 *  once — it struggles for CAUGHT_DURATION seconds first (no stain/shrink
 *  yet). Only then does the parent charge the predator; reaching it
 *  (SACRIFICE_DIST) it is taken instead and the calf escapes, while a parent
 *  that only got close (TOO_LATE_DIST) by the time the window ends is eaten
 *  alongside the calf. */
const CAUGHT_DURATION = 5
// Rotating throttle for the 203(A) anchoring asserts (~1/13 of animals per frame).
let ASSERT_TICK = 0
// The juvenile hunt bias (point 245) is the calibratable balance.family.juvenilePreyBias.
const CALF_HUNT_SEEK = 45 // radius around the player within which a huntable calf is picked
const CALF_CATCH_DIST = 0.9 // the predator catches the chased calf within this
/** The hunted calf bolts instead of standing at its parent, but slower than its
 *  hunter, so it is visibly run down in the open (design.md §19). */
const CALF_FLEE_SPEED = 3.8
/** Inside this radius the predator pounces straight at the calf, bypassing its
 *  turn-rate limit: with speed 5.6 and turn 3 the minimum turning circle is
 *  ~1.9 — wider than the catch distance — so a near-stationary (nursing) calf
 *  could otherwise be orbited forever and never caught. */
const CALF_POUNCE_RADIUS = 3
const PARENT_SACRIFICE_DIST = 1.3 // parent reaches the predator → sacrifices itself
const PARENT_TOO_LATE_DIST = 3.2 // parent only this close when the window ends → both eaten
/** The vigil (point 121): the bereaved parent holds this close to the carcass. */
const VIGIL_HOLD_DIST = 1.5
/** The blocking station sits this far from the hunted calf toward the hunter —
 *  beyond the catch reach (CALF_CATCH_DIST), so a closing hunter meets the
 *  shield first. The rescue burst carries the shield faster than the calf's
 *  flee (so it holds the moving station) and faster than the hunter (so the
 *  hunter meets the shield), and the hunter takes a blocking parent within
 *  PARENT_TAKE_DIST. All four rescue drives — charge, shield, guard, wade —
 *  run at the ONE burst-derived speed (point 127): rescueSpeed(
 *  balance.family.rescueBurst), computed fresh each frame so the debug edit
 *  applies live. */
const PARENT_BLOCK_OFFSET = 1.8
const PARENT_TAKE_DIST = 1.0
/** Species whose calves a predator hunt can target (design.md §19). The
 *  giraffe joined with point 124 — its calves are run down by the LION only
 *  (the food web gates the predator pick), and its parent's charge may end in
 *  the kick instead of the sacrifice. */
const CALF_HUNT_SPECIES = ['zebra', 'wildebeest', 'antelope', 'warthog', 'giraffe'] as const
/** Species whose parent can defend its young through the SHARED resolution core
 *  (caught countdown → charge/shield → drive-off/kill/taken, and the vigil) —
 *  the grazers PLUS the lion (point 145c): a lioness defends her cub against a
 *  hyena hunt exactly through that one path. The lion is deliberately NOT a
 *  CALF_HUNT_SPECIES, so the prey-behaviour loops (gambol into water, flee, the
 *  grazer vicinity seed, the food-web hunt pick) never touch it — only the
 *  resolution core reaches the lioness, invoking the one parentAttackOutcome
 *  matrix against the one LION_STATE hunt (predator = hyena). No second hunt
 *  state (the points 121(f)/130/146 architecture line). */
const FAMILY_DEFEND_SPECIES = [...CALF_HUNT_SPECIES, 'lion'] as const
/** Duration of the rendered defence strike (design.md §19.8, points 124/125):
 *  any parent that drove the hunt off rears and strikes before settling. */
const PARENT_KICK_SECONDS = 0.8

/** Distance from the nearest LIVE vigil-keeper to the given carcass point, or
 *  Infinity with none (point 121) — a dead keeper guards nothing. Feeds
 *  vigilBlocksLanding for both vulture landing gates (kill flock, scavenger). */
function nearestVigilKeeperDist(herds: Record<Species, Animal[]>, x: number, z: number): number {
  let best = Infinity
  for (const sp of CALF_HUNT_SPECIES) {
    for (const a of herds[sp]) {
      if (a.dead || a.vigil === undefined) continue
      const d = Math.hypot(a.x - x, a.z - z)
      if (d < best) best = d
    }
  }
  return best
}
/** Calf play and water accidents (design.md §19): calves gambol on a per-calf
 *  cycle; a calf that ends up on open water struggles there, its parent wades
 *  in and pulls it back to land, and near a waterfall the current takes any of
 *  them over the falls — a calf that goes over is followed by its plunging
 *  parent, which dies with it. */
// Bout length and play range are calibratable (balance.family.gambolBoutSeconds
// / .gambolRange, read fresh per frame); only the idle gap between bouts and
// the hop speed stay fixed here.
const GAMBOL_IDLE_SECONDS = 12 // gap between play bouts (was 16 s period − 4 s bout)
const GAMBOL_SPEED = 2.2
const CALF_DRIFT_DEG = 0.06 // deg/s downstream drift of a struggling calf
const RESCUE_REACH = 1.2 // parent this close pulls the calf out
const RETURN_SPEED = PREY_WALK_SPEED // walking back to the rescue entry — the ordinary walk the burst is measured against
const FALLS_DEATH_RADIUS_DEG = 0.2 // in water this close to a fall = swept over
// GRIEF, not a rescue (point 127): the plunge after a swept-over calf cannot
// save it — it stays on its own speed, off the rescue burst.
const PLUNGE_SPEED = 5.5 // a parent rushing after its swept-over calf
const PLUNGE_REACH = 1
const STRUGGLE_SELF_RESCUE = 25 // s after which an unaided calf clambers out
// GRIEF, not a rescue (point 127): the calf is already dead — this charge
// saves nobody and stays on its own speed, off the rescue burst. So does the
// point-121 vigil walk (YOUNG_FOLLOW_SPEED in the vigil pre-pass).
const TRAMPLE_GRIEF_SPEED = 6.5 // a parent rushing the elephant that trampled its calf
// Grief window; an unresolved charge clears here (the I4 "every drama resolves"
// backstop). Widened from 12 s (point 261): the elephant is now a solid body the
// grieving parent must ROUTE AROUND to reach the front-intercept point instead
// of clipping straight through its legs, which lengthens the path — so the
// deadline is doubled to comfortably cover circling the body (~π·bodyRadius at
// TRAMPLE_GRIEF_SPEED, plus the chase after a walking elephant) before it fires.
const TRAMPLE_GRIEF_SECONDS = 24
// How far ahead of the elephant (along its heading) the grieving parent aims
// (point 259): it must reach the elephant's FRONT to be crushed, so the moving
// elephant travels toward it (the trampleKills direction condition). Kept BELOW
// TRAMPLE_RADIUS (1.5) so a parent standing on the front point is already inside
// the trample reach AND ahead of the feet — reaching a flank or the rear does
// not kill, the parent keeps steering to get in front, and the
// TRAMPLE_GRIEF_SECONDS deadline still resolves the grief regardless.
const GRIEF_FRONT_REACH = 1
// OPEN (design.md §19, CLAUDE.md §7.1 pt.12): tree-climbing-to-flee (e.g. a
// light animal escaping up a kopje/tree) and further new species/birds beyond
// the current roster and the added calves are not yet implemented.

/** Wildlife streaming (design.md §19): animals are kept alive while they may be
 *  on screen and only despawned well beyond the view. The view radius scales
 *  with the bird's-eye zoom; the spawn chunk range is clamped for performance. */
const VIEW_AT_ZOOM1 = 100
const SPAWN_MARGIN = 18
const DESPAWN_MARGIN = 60
const SPAWN_RANGE_MIN = 4
// A radius that exceeds the frustum out to the F3-report wide zoom (~2.2x): the
// range grid must cover the spawn radius so no herd is missing inside the
// rendered frame at a wide zoom (point 195; the point-171 flora fix, applied to
// wildlife). Beyond this cap animals are sub-pixel and the far sheet takes over.
const SPAWN_COVER_RADIUS_MAX = 288
const SPAWN_RANGE_MAX = Math.ceil(SPAWN_COVER_RADIUS_MAX / CHUNK_SIZE)
/** Scavenging (design.md §19): a trampled/other-death carcass draws a vulture
 *  that flies in, lands and consumes it, dissolving it like a lion kill. */
const CARCASS_DISSOLVE_SECONDS = 9
/** Fast glide: the flights start beyond the view ring (design.md §19), so the
 *  birds must cover real distance to arrive while their reason still holds. */
const VULTURE_SCAVENGE_SPEED = 16
const VULTURE_FLY_SPEED = 16

/** Drift boost of the current close to a fall (mirrors the traveller's drift
 *  §11 but with local, decorative constants). */
const FALLS_DRIFT_BOOST = 4
const FALLS_DRIFT_RADIUS_DEG = 0.5

/** Body radius per species (world units, at scale 1): animals spawn with — and
 *  keep — at least the sum of two bodies' radii between their centres, so they
 *  neither spawn inside one another nor walk through each other (design.md
 *  §19). The elephant×smaller-prey pair is exempt at runtime: trampling is a
 *  designed interaction (the herd walks OVER a too-slow animal). */
const BODY_RADIUS: Record<Species, number> = {
  elephant: 1.3,
  giraffe: 0.9,
  zebra: 0.7,
  wildebeest: 0.75,
  antelope: 0.6,
  warthog: 0.45,
  flamingo: 0.25,
  crocodile: 0.55,
  plover: 0.12,
  // Predator entries complete the record (point 146); their list members are
  // always dead, and every proximity pass skips carcasses.
  lion: 0.8,
  cheetah: 0.55,
  leopard: 0.55,
  hyena: 0.6,
}
/** Grid cell size for the runtime separation pass (≥ 2·max body radius). */
const SEPARATION_CELL = 4
// Body separation acts as a bounded force (units/s), not a per-frame teleport:
// clamped corrections cannot vibrate against the behaviours' own steps.
const SEPARATION_MAX_SPEED = 2.2

/**
 * Live animals near a point as collision circles `[x, z, radius]` (design.md
 * §19): the bird's-eye traveller collides with animals instead of walking
 * through them. Reads the streamed herds shared each frame via ACTIVE_HERDS;
 * carcasses are passable. The Wildlife component registers this with
 * `setAnimalCollider` so the movement loop can call it (see wildlifeCollision).
 */
function nearAnimalObstacles(px: number, pz: number, radius: number): Array<[number, number, number]> {
  const herds = ACTIVE_HERDS
  if (!herds) return []
  const out: Array<[number, number, number]> = []
  for (const sp of SPECIES) {
    const br = BODY_RADIUS[sp]
    for (const a of herds[sp]) {
      if (a.dead) continue
      const r = br * a.scale
      if (Math.abs(a.x - px) < radius + r && Math.abs(a.z - pz) < radius + r) out.push([a.x, a.z, r])
    }
  }
  return out
}

// Wildlife placement salts the seed so it decorrelates from the terrain
// scatter that shares hashChunk (design.md §19).
const hash = (cx: number, cz: number, i: number, seed: number): number => hashChunk(cx, cz, i, seed ^ 0xa51ce5)

/** Distance (degrees) to the nearest waterfall (design.md §4.4/§19). */
function fallsDistanceDeg(lat: number, lon: number): number {
  let best = Infinity
  for (const wf of WATERFALLS) {
    const d = Math.hypot(lat - wf.lat, lon - wf.lon)
    if (d < best) best = d
  }
  return best
}

/** Nearest land spot around a water point (probing rings outward): the walk-
 *  back target of a rescue when the fall-in point was never seen on land.
 *  Two passes: proper dry land first, then any non-water cell regardless of
 *  height — the widened river mouths (point 136) carve broad low aprons
 *  where nothing clears the dry bar for many units, and a low coast cell is
 *  still better than leaving an animal standing in the open sea. */
function findLandNear(x: number, z: number, seed: number): { x: number; z: number } {
  for (const minHeight of [0.05, -Infinity]) {
    for (let r = 1; r <= 14; r += 1.5) {
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2
        const nx = x + Math.cos(ang) * r
        const nz = z + Math.sin(ang) * r
        const ll = worldToLatLon(nx, nz)
        const t = sampleTerrain(ll.lat, ll.lon, seed)
        if (t.type !== 'water' && t.type !== 'ocean' && t.height > minHeight) return { x: nx, z: nz }
      }
    }
  }
  return { x, z } // mid-lake with no bank in reach — hold position
}

/** Inward water normal at (x, z): a unit vector pointing toward nearby
 *  impassable water (river/lake/ocean), or null when no water is close
 *  (design.md §19.5, point 222). A cheap 8-point ring sample, called only when a
 *  separation push is about to shove an animal toward water — the pinned-at-edge
 *  pair then parts along the shore tangent instead of being reverted by the
 *  water setback every frame. */
function waterNormalAt(x: number, z: number, seed: number): [number, number] | null {
  let nx = 0
  let nz = 0
  let hits = 0
  const r = 2.5
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2
    const ll = worldToLatLon(x + Math.cos(ang) * r, z + Math.sin(ang) * r)
    const t = sampleTerrain(ll.lat, ll.lon, seed).type
    if (t === 'water' || t === 'ocean') {
      nx += Math.cos(ang)
      nz += Math.sin(ang)
      hits++
    }
  }
  if (hits === 0) return null
  const m = Math.hypot(nx, nz)
  if (m < 1e-6) return null
  return [nx / m, nz / m]
}

/** Nearest river/lake WATER cell to (x, z) — the inverse of findLandNear, for
 *  re-anchoring a beached crocodile back onto its home water (design.md §19.16,
 *  point 242). Skips the ocean (never a crocodile's home); returns null when no
 *  river/lake water is within reach so the caller can hold position rather than
 *  teleport the croc across dry land. */
function findWaterNear(x: number, z: number, seed: number): { x: number; z: number } | null {
  for (let r = 1; r <= 14; r += 1.5) {
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2
      const nx = x + Math.cos(ang) * r
      const nz = z + Math.sin(ang) * r
      const ll = worldToLatLon(nx, nz)
      if (sampleTerrain(ll.lat, ll.lon, seed).type === 'water') return { x: nx, z: nz }
    }
  }
  return null
}

/** Walk-off direction after a kill: straight away from the traveller, so the
 *  leave never crosses the view; random when standing on the traveller. */
/** Region prey pool at a world point (point 124): a victim hunt may only
 *  target a species the region's own pool holds — the region-fit gate for the
 *  calf pick, matching the fit the generic hunt applies via REGION_PREY. */
function regionPreyAt(x: number, z: number): PreyKind[] {
  const ll = worldToLatLon(x, z)
  return REGION_PREY[regionAt(ll.lat, ll.lon)] ?? REGION_PREY.east
}

function leaveHeading(x: number, z: number, px: number, pz: number): number {
  const dx = x - px
  const dz = z - pz
  if (Math.hypot(dx, dz) < 1e-3) return Math.random() * Math.PI * 2
  return Math.atan2(dx, dz)
}

/** A predator does not strip its kill bare (design.md §19): when it walks off,
 *  a small remnant of the prey stays behind at the site — a carcass scrap the
 *  kill-circling flock then descends on and finishes. */
const REMNANT_SCALE = 0.35
function spawnRemnant(s: LionHuntState, seed: number): Animal | null {
  const herds = ACTIVE_HERDS
  if (!herds) return null
  const ll = worldToLatLon(s.px, s.pz)
  const remnant: Animal = {
    x: s.px,
    z: s.pz,
    y: Math.max(0.02, sampleTerrain(ll.lat, ll.lon, seed).height),
    rot: Math.random() * Math.PI * 2,
    scale: PREY_SCALE[s.prey] * REMNANT_SCALE,
    phase: 0,
    dead: true,
    remnant: true,
  }
  herds[s.prey].push(remnant)
  return remnant
}

function emptyHerds(): Record<Species, Animal[]> {
  return {
    elephant: [], giraffe: [], zebra: [], wildebeest: [], antelope: [], warthog: [], flamingo: [], crocodile: [], plover: [],
    lion: [], cheetah: [], leopard: [], hyena: [],
  }
}

/** Populate one chunk's deterministic herd/flock into the shared herd arrays,
 *  tagging each animal with its chunk key so it can be streamed out later. */
const MAASAI_VILLAGE = PLACES.find((p) => p.id === 'maasai-village')

function spawnChunk(herds: Record<Species, Animal[]>, ccx: number, ccz: number, seed: number, day: number): void {
  const key = `${ccx},${ccz}`
  const roll = hash(ccx, ccz, 0, seed)
  const ax = (ccx + hash(ccx, ccz, 1, seed)) * CHUNK_SIZE
  const az = (ccz + hash(ccx, ccz, 2, seed)) * CHUNK_SIZE
  const ll = worldToLatLon(ax, az)
  const anchor = sampleTerrain(ll.lat, ll.lon, seed)

  // Flamingo flocks gather at lake shores regardless of biome roll.
  const lakeD = lakeDistance(ll.lat, ll.lon, 1)
  if (lakeD < 0.42 && roll < 0.7) {
    placeGroup(herds.flamingo, ccx, ccz, ax, az, 8 + Math.floor(roll * 10), 3.5, seed, 1.4, BODY_RADIUS.flamingo, true, undefined, key)
    return
  }

  // Crocodiles lie in the rivers and lakes themselves (design.md §19.16,
  // point 130): a water anchor in crocodile country seeds one or two hidden
  // ambushers ON water cells — never on land, never in the ocean.
  if (anchor.type === 'water' && roll < 0.5) {
    const region = regionAt(ll.lat, ll.lon)
    if ((CROCODILE_REGIONS as readonly string[]).includes(region)) {
      const n = 1 + Math.floor(hash(ccx, ccz, 3, seed) * 2)
      for (let i = 0; i < n; i++) {
        if (herds.crocodile.length >= MAX_INSTANCES.crocodile) break
        const x = ax + (hash(ccx, ccz, 30 + i * 2, seed) - 0.5) * 8
        const z = az + (hash(ccx, ccz, 31 + i * 2, seed) - 0.5) * 8
        const cll = worldToLatLon(x, z)
        const ct = sampleTerrain(cll.lat, cll.lon, seed)
        if (!crocodileAllowedAt(ct.type)) continue
        // Anchor to the RENDERED water surface, not the carved bed (point 187 —
        // the point-152 class): the hidden pose offsets from a.y so only the eye
        // knobs break the surface; anchored to the bed the whole crocodile sat
        // ~SURFACE_LIFT below the ribbon (deeper on lakes). Fallback: bed + 0.3
        // (the river SURFACE_LIFT) should waterSurfaceY miss on an edge texel.
        const cws = waterSurfaceY(cll.lat, cll.lon, seed, ct.height)
        herds.crocodile.push({
          x, z, y: cws ?? ct.height + 0.3, rot: hash(ccx, ccz, 34 + i, seed) * Math.PI * 2,
          scale: 0.9 + hash(ccx, ccz, 35 + i, seed) * 0.3, phase: hash(ccx, ccz, 36 + i, seed), chunk: key,
        })
      }
    }
    return
  }

  // The rinderpest carrion (design.md §16/§19.15, point 133): while
  // Maasailand stands STRUCK (1891-92), the plague's wildlife toll lies on
  // the plains — dead wildebeest and antelope the vultures and scavengers
  // then work like any carcass. Date-dependent by design: the same chunk in
  // 1890 spawns living herds instead.
  // Rinderpest carrion near a STRUCK village on ANY land (point 133, widened
  // for point 168): the toll fires for any land chunk within the struck
  // radius — not only savanna. The Maasai village sits by Kilimanjaro/Meru,
  // so gating on a savanna ANCHOR left the standard-zoom player at the rocky
  // village with nothing (few savanna chunks stream in the small view ring);
  // the wide-zoom check saw plenty only because it streamed far-out savanna.
  // roll < 0.5 keeps living herds on the OTHER near-village chunks (so the
  // family dramas still stage), and the branch fires only at struck dates, so
  // ordinary play (and every check that ends at 1890) is untouched.
  if (
    anchor.type !== 'ocean' &&
    anchor.type !== 'water' &&
    anchor.height > 0.05 &&
    roll < 0.5 &&
    MAASAI_VILLAGE
  ) {
    const distDeg = Math.hypot(ll.lat - MAASAI_VILLAGE.lat, ll.lon - MAASAI_VILLAGE.lon)
    const phase = rinderpestPhaseAtDay('maasai', day, START_YEAR)
    if (rinderpestCarrionActive(phase, distDeg)) {
      const sp2: Species = hash(ccx, ccz, 40, seed) < 0.6 ? 'wildebeest' : 'antelope'
      const n = 1 + Math.floor(hash(ccx, ccz, 41, seed) * 3)
      for (let i = 0; i < n && herds[sp2].length < MAX_INSTANCES[sp2]; i++) {
        const x = ax + (hash(ccx, ccz, 42 + i * 2, seed) - 0.5) * 10
        const z = az + (hash(ccx, ccz, 43 + i * 2, seed) - 0.5) * 10
        const cll = worldToLatLon(x, z)
        const ct = sampleTerrain(cll.lat, cll.lon, seed)
        if (ct.type === 'ocean' || ct.type === 'water' || ct.height <= 0.05) continue
        herds[sp2].push({
          x, z, y: Math.max(0.02, ct.height), rot: hash(ccx, ccz, 46 + i, seed) * Math.PI * 2,
          scale: 0.9 + hash(ccx, ccz, 47 + i, seed) * 0.2, phase: hash(ccx, ccz, 48 + i, seed), chunk: key,
          dead: true,
          plague: true,
        })
      }
      return
    }
  }

  // Ground-nesting plovers (design.md §19.8, point 145b): a nest on open
  // savanna — the parent at its fixed nest spot with two chicks beside it.
  if (anchor.type === 'savanna' && roll >= 0.68 && roll < 0.72) {
    if (herds.plover.length + 3 <= MAX_INSTANCES.plover) {
      const parent: Animal = {
        x: ax, z: az, y: Math.max(0.02, anchor.height), rot: hash(ccx, ccz, 50, seed) * Math.PI * 2,
        scale: 1, phase: hash(ccx, ccz, 51, seed), chunk: key,
        nest: { x: ax, z: az },
      }
      herds.plover.push(parent)
      for (let i = 0; i < 2; i++) {
        const chick: Animal = {
          x: ax + (hash(ccx, ccz, 52 + i, seed) - 0.5) * 0.8,
          z: az + (hash(ccx, ccz, 54 + i, seed) - 0.5) * 0.8,
          y: Math.max(0.02, anchor.height), rot: hash(ccx, ccz, 56 + i, seed) * Math.PI * 2,
          scale: 0.9, phase: hash(ccx, ccz, 58 + i, seed), chunk: key,
          young: true, parent,
        }
        herds.plover.push(chick)
      }
    }
    return
  }

  // A lioness with her cub (design.md §19.8, point 145c): the apex predator
  // read from the other side — a mother. Seeded on open savanna only where a
  // hyena hunt is possible (REGION_PREDATORS holds the hyena — the eastern and
  // southern plains), so the drawn threat is always region-true. The lioness
  // carries .child; the cub is her defended young — the shared resolution core
  // (FAMILY_DEFEND_SPECIES) runs the hyena hunt, shield and sacrifice on them.
  if (anchor.type === 'savanna' && roll >= 0.72 && roll < 0.735) {
    const region = regionAt(ll.lat, ll.lon)
    if (REGION_PREDATORS[region]?.includes('hyena') && herds.lion.length + 2 <= MAX_INSTANCES.lion) {
      const lioness: Animal = {
        x: ax, z: az, y: Math.max(0.02, anchor.height), rot: hash(ccx, ccz, 60, seed) * Math.PI * 2,
        scale: 1, phase: hash(ccx, ccz, 61, seed), chunk: key,
      }
      const cub: Animal = {
        x: ax + (hash(ccx, ccz, 62, seed) - 0.5) * 1.6,
        z: az + (hash(ccx, ccz, 63, seed) - 0.5) * 1.6,
        y: Math.max(0.02, anchor.height), rot: hash(ccx, ccz, 64, seed) * Math.PI * 2,
        scale: 0.55, phase: hash(ccx, ccz, 65, seed), chunk: key,
        young: true, parent: lioness,
      }
      lioness.child = cub
      herds.lion.push(lioness, cub)
    }
    return
  }

  let species: Species | null = null
  let count = 0
  if (anchor.type === 'savanna') {
    // The ambient grazer herd is drawn from the region's own pool (point 208
    // A2): the old fixed roll bands placed giraffe/zebra/wildebeest on ANY
    // savanna, contradicting the hunt/vicinity rules that region-gate them.
    species = ambientSavannaSpecies(regionAt(ll.lat, ll.lon), roll)
    if (species) count = species === 'elephant' ? 5 : species === 'giraffe' ? 3 : species === 'warthog' ? 4 : 7
  } else if (anchor.type === 'jungle') {
    if (roll < 0.06) {
      species = 'elephant'
      count = 3
    }
  } else if (anchor.type === 'desert') {
    if (roll < 0.05) {
      species = 'antelope'
      count = 4
    }
  }
  if (!species) return
  // Elephants placed together share a herd id (stable per chunk) so they move
  // as one; other species roam/graze individually.
  const herdId = species === 'elephant' ? ccx * 1000003 + ccz : undefined
  placeGroup(herds[species], ccx, ccz, ax, az, count, 7, seed, species === 'elephant' ? 1 : 0.9, BODY_RADIUS[species], false, herdId, key)
}

function placeGroup(
  list: Animal[],
  ccx: number,
  ccz: number,
  ax: number,
  az: number,
  count: number,
  spread: number,
  seed: number,
  baseScale: number,
  bodyRadius: number,
  shoreline: boolean,
  herdId?: number,
  chunkKey?: string,
) {
  const placedStart = list.length
  for (let i = 0; i < count; i++) {
    const r1 = hash(ccx, ccz, 10 + i * 3, seed)
    const r2 = hash(ccx, ccz, 11 + i * 3, seed)
    const r3 = hash(ccx, ccz, 12 + i * 3, seed)
    let x = ax + (r1 - 0.5) * spread * 2
    let z = az + (r2 - 0.5) * spread * 2
    const sc = baseScale * (0.85 + r3 * 0.3)
    // Spawn spacing (design.md §19): part the newcomer from already-placed
    // herd-mates before the terrain check, so no two animals spawn inside one
    // another. Deterministic — only hash-derived positions feed in.
    for (let iter = 0; iter < 4; iter++) {
      const neighbors: Array<[number, number, number]> = []
      for (let j = placedStart; j < list.length; j++) {
        const b = list[j]
        neighbors.push([b.x, b.z, bodyRadius * (sc + b.scale)])
      }
      const [dx, dz] = separationPush(x, z, neighbors)
      if (dx === 0 && dz === 0) break
      x += dx * 2 // only the newcomer moves, so take the full correction
      z += dz * 2
    }
    const ll = worldToLatLon(x, z)
    const s = sampleTerrain(ll.lat, ll.lon, seed)
    if (shoreline) {
      // Flamingos stand in shallow water or on the bank.
      if (s.type !== 'water' && s.height > 0.6) continue
    } else if (s.type === 'ocean' || s.type === 'water' || s.height <= 0.05) {
      continue
    }
    const animal: Animal = {
      x,
      z,
      // A shoreline wader stands in ITS OWN shallow water (point 196): legs in
      // the rendered sheet, clamped to the local bed — the flat 0.02 buried
      // whole flocks on elevated lakes and floated them over low banks.
      y: shoreline
        ? s.type === 'water'
          ? waderStandY(s.height, waterSurfaceY(ll.lat, ll.lon, seed, s.height))
          : Math.max(0.02, s.height)
        : Math.max(0.02, s.height),
      rot: r3 * Math.PI * 2,
      scale: sc,
      phase: r1 * Math.PI * 2,
      ...(herdId !== undefined ? { herd: herdId } : {}),
      ...(chunkKey !== undefined ? { chunk: chunkKey } : {}),
    }
    // Animals near water periodically walk to the shore and drink
    // (design.md §19); the shore point follows the water-distance gradient.
    if (!shoreline) {
      // The dry season widens the catchment (design.md §19.13, point 120e):
      // as the land dries, animals walk to the water from farther out, so the
      // remaining rivers and lakes visibly gather the wildlife. The traveller's
      // local weather is the spawn's proxy — chunks spawn near the traveller.
      const dryness =
        (1 - CURRENT_WEATHER.wetness) * Math.min(1, Math.max(0, balance.season.weatherStrength))
      // Width-derived (point 135c): the fixed 0.35 base was a hidden
      // 0.17+0.18 of the scale-true river width — the 136 widening ate the
      // drinking belt and starved the dry-season gathering.
      const catchment = drinkCatchment(RIVER_WIDTH_DEG, dryness)
      // The dry-season catchment can exceed the default 3x3 bucket reach
      // (~0.45deg); only then widen the water-distance search to 5x5 (range 2,
      // ~0.9deg) and the query radius, so the gradient does not COLLAPSE for
      // animals 0.45-0.70 from water — both probes would otherwise read the
      // saturated 0.45 and gLat=gLon=0, and they never walk to the bank
      // (point 176). The wet season keeps the cheaper range 1.
      const wideWater = catchment > 0.45
      const qr = wideWater ? 2 : 1
      const qd = wideWater ? catchment + 0.06 : 0.5
      const rd = riverDistance(ll.lat, ll.lon, qd, qr)
      const ld = lakeDistance(ll.lat, ll.lon, qd, qr)
      const wd = Math.min(ld, rd)
      if (wd > 0.02 && wd < catchment) {
        const e = 0.03
        const gLat =
          Math.min(lakeDistance(ll.lat + e, ll.lon, qd, qr), riverDistance(ll.lat + e, ll.lon, qd, qr)) -
          Math.min(lakeDistance(ll.lat - e, ll.lon, qd, qr), riverDistance(ll.lat - e, ll.lon, qd, qr))
        const gLon =
          Math.min(lakeDistance(ll.lat, ll.lon + e, qd, qr), riverDistance(ll.lat, ll.lon + e, qd, qr)) -
          Math.min(lakeDistance(ll.lat, ll.lon - e, qd, qr), riverDistance(ll.lat, ll.lon - e, qd, qr))
        const gl = Math.hypot(gLat, gLon)
        if (gl > 1e-4) {
          // Walk down the gradient only to the BANK, never into the channel;
          // a bather's target wades a small step past it into the shallow
          // edge (waterEdgeRules, design.md §19).
          const bathe = hash(ccx, ccz, 40 + i, seed) < 0.4
          const walk = drinkWalkDistance(rd, ld, bathe)
          const shoreLat = ll.lat - (gLat / gl) * walk
          const shoreLon = ll.lon - (gLon / gl) * walk
          const w = latLonToWorld(shoreLat, shoreLon)
          animal.drink = { tx: w.x, tz: w.z }
          if (bathe) animal.bathe = true
        }
      }
    }
    list.push(animal)
  }
  // Family life (design.md §19): a herd of at least three raises juveniles that
  // keep close to a parent and nurse; the parent guards them against predators.
  // A calibratable fraction of the group are calves now (point 169), each linked
  // to its OWN distinct parent — the LAST k placed become calves of the FIRST k
  // placed, and k ≤ floor(n/2) keeps those index ranges from overlapping (so a
  // parent is never its own calf and the .child relation stays 1:1). Flamingos
  // (shoreline flocks) are excluded. Counted over the animals actually placed
  // (water spots are skipped above), so the links never reach into an earlier
  // group's animals.
  if (!shoreline) {
    const n = list.length - placedStart
    const k = calvesForGroup(n, balance.family.calfFraction)
    for (let i = 0; i < k; i++) {
      const parent = list[placedStart + i]
      const calf = list[list.length - 1 - i]
      if (parent && calf && parent !== calf) {
        calf.young = true
        calf.parent = parent
        calf.scale *= 0.55 // a small juvenile
        parent.child = calf
      }
    }
  }
}

/**
 * Keep the bird's-eye vicinity of every settlement from reading empty (point
 * 102, design.md §2.5): after the normal chunk spawn, guarantee a minimum
 * presence of region-typical grazers within `vicinityRadius` of each nearby
 * settlement by seeding ONE deterministic herd — but ONLY when the normal spawn
 * produced fewer than the minimum (never additive on an already-populated
 * vicinity). Seeded animals are ordinary herd animals: seed-deterministic
 * placement, the region's own species pool, normal chunk membership (so they
 * stream out with the settlement's chunk) and the existing spacing/capacity
 * rules. A clearance keeps them off the leave point so the player never
 * materialises inside a herd.
 */
// Per-place seeding-attempt counter (point 102): advances once per frame in
// which that place's vicinity needed a top-up, so every attempt draws a fresh
// candidate set via vicinityAttemptSeed — a deferring frame (all bearings
// on-screen or wet) never re-tests the same frozen candidates forever.
const vicinitySeedAttempt = new Map<string, number>()
function seedSettlementVicinity(
  herds: Record<Species, Animal[]>,
  pos: { x: number; z: number },
  seed: number,
  spawnedChunks: Set<string>,
): void {
  const min = balance.panoramaWildlife.vicinityMinAnimals
  const radius = balance.panoramaWildlife.vicinityRadius
  const CLEARANCE = 14 // world units clear of the leave point
  const SPREAD = 6
  // Count/place against a margin-shrunk ring (point 135a): edge loiterers
  // no longer satisfy the guarantee, and seeds land well inside, so the
  // count holds from the player's leave point and across wander time.
  const bounds = vicinitySeedBounds(radius, CLEARANCE, SPREAD, 10)
  for (const place of PLACES) {
    const w = latLonToWorld(place.lat, place.lon)
    if (Math.hypot(w.x - pos.x, w.z - pos.z) > radius + SPAWN_MARGIN) continue
    // Tag seeded animals with the settlement's own chunk so they stream out with
    // it; only seed once that chunk is live (else they'd be culled at once).
    const scx = Math.floor(w.x / CHUNK_SIZE)
    const scz = Math.floor(w.z / CHUNK_SIZE)
    const chunkKey = `${scx},${scz}`
    if (!spawnedChunks.has(chunkKey)) continue
    const region = regionAt(place.lat, place.lon)
    const pool = REGION_PREY[region]
    if (!pool || pool.length === 0) continue
    // Count region-typical grazers already within the radius.
    let count = 0
    for (const sp of pool) {
      for (const a of herds[sp]) if (!a.dead && Math.hypot(a.x - w.x, a.z - w.z) <= bounds.countRadius) count++
    }
    if (count >= min) continue
    const deficit = min - count
    // Deterministic placement from the settlement id + world seed + attempt
    // index: the attempt stride makes each frame's draw EXPLORE fresh ring
    // bearings (see vicinityAttemptSeed) instead of re-testing one frozen set —
    // the old fixed seed let an idle player's static camera pin a deferring
    // draw (or a member offset on wet/low ground) in place forever, stalling
    // the guarantee one animal short (point 249).
    let h = 0
    for (const c of place.id) h = (h * 31 + c.charCodeAt(0)) | 0
    const attempt = vicinitySeedAttempt.get(place.id) ?? 0
    vicinitySeedAttempt.set(place.id, attempt + 1)
    const rand = mulberry32(vicinityAttemptSeed(seed, h, attempt))
    // Rotate through the pool from a deterministic start until a species has
    // instance capacity left (point 135a): picking ONE and giving up at its
    // cap silently starved the guarantee once the test scenarios had filled
    // that herd — the vicinity stayed one animal short.
    let species: (typeof pool)[number] | null = null
    const start = Math.floor(rand() * pool.length)
    for (let sIdx = 0; sIdx < pool.length; sIdx++) {
      const cand = pool[(start + sIdx) % pool.length]
      if (herds[cand].length + deficit <= MAX_INSTANCES[cand]) {
        species = cand
        break
      }
    }
    if (!species) continue
    // Deterministic offset candidates inside the ring, past the clearance — a
    // coastal port may face water on some bearings. Pick one OUTSIDE the frame
    // (points 165/183) so the seeded group never pops into view; the vicinity
    // radius reaches past the frame at the default zoom, so an off-screen land
    // spot almost always exists. When none does (near water, all off-screen
    // candidates are river/lake), DEFER — the null below skips this settlement
    // this frame and the moving camera exposes off-screen land next frame —
    // rather than popping a herd into view (point 183, the user's Nile report).
    const candidates: Array<readonly [number, number]> = []
    for (let k = 0; k < 14; k++) {
      const dir = rand() * Math.PI * 2
      const dist = bounds.distMin + rand() * Math.max(1, bounds.distMax - bounds.distMin)
      candidates.push([w.x + Math.cos(dir) * dist, w.z + Math.sin(dir) * dist])
    }
    const anchor = pickOffscreenLandAnchor(
      candidates,
      (x, z) => {
        const ll = worldToLatLon(x, z)
        const s = sampleTerrain(ll.lat, ll.lon, seed)
        return s.type !== 'ocean' && s.type !== 'water' && s.height > 0.05
      },
      isOnScreen,
    )
    if (!anchor) continue
    const ax = anchor[0]
    const az = anchor[1]
    // The scatter cloud, not just the anchor, must clear the frame (point 195):
    // members land within ±SPREAD, so a member near the edge could pop in. Defer
    // unless the whole SPREAD disc around the anchor is off-screen.
    let discClear = true
    for (let e = 0; e < 8; e++) {
      const ea = (e * Math.PI) / 4
      if (isOnScreen(ax + Math.cos(ea) * SPREAD, az + Math.sin(ea) * SPREAD)) {
        discClear = false
        break
      }
    }
    if (!discClear) continue
    placeGroup(herds[species], scx, scz, ax, az, deficit, SPREAD, seed, 0.9, BODY_RADIUS[species], false, undefined, chunkKey)
  }
}

/**
 * The dry season gathers life at the remaining water — GUARANTEED (point
 * 120e, hardened by 135c): once the traveller's local land has dried, the
 * nearest water in the view ring holds at least `dryShoreMinDrinkers`
 * drinking animals. The chunk spawn provides them where its hashes happen
 * to fall near a bank; where they fall short, this tops the shore up —
 * deterministic per (seed, water cell), tagged to the traveller's chunk so
 * the group streams out normally.
 */
let shoreSeedClock = 999 // seconds since the last upkeep; start due
function seedDryShoreDrinkers(
  herds: Record<Species, Animal[]>,
  pos: { x: number; z: number },
  seed: number,
  spawnedChunks: Set<string>,
  dt: number,
): void {
  // Throttled by TIME, not frames: the guarantee needs seconds-scale upkeep
  // (per-frame re-seeding ballooned the herds, point 135) — and a frame
  // counter stretched past the verification window whenever the frame rate
  // dropped under full-regression load.
  shoreSeedClock += dt
  if (shoreSeedClock < 2) return
  shoreSeedClock = 0
  const dryness =
    (1 - CURRENT_WEATHER.wetness) * Math.min(1, Math.max(0, balance.season.weatherStrength))
  if (dryness < 0.6) return
  const min = balance.panoramaWildlife.dryShoreMinDrinkers
  const RANGE = 40 // world units around the traveller
  // Find the nearest river/lake bank cell in range (coarse ring probe).
  const pll = worldToLatLon(pos.x, pos.z)
  let bank: { x: number; z: number } | null = null
  let bd = Infinity
  for (let r = 4; r <= RANGE && !bank; r += 4) {
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2
      const lat = pll.lat + (Math.cos(ang) * r) / 10
      const lon = pll.lon + (Math.sin(ang) * r) / 10
      const wd = Math.min(riverDistance(lat, lon, 0.5), lakeDistance(lat, lon, 0.5))
      if (wd < RIVER_WIDTH_DEG + 0.1 && wd > RIVER_WIDTH_DEG + 0.01) {
        const t = sampleTerrain(lat, lon, seed)
        // No dry-height bar (the findLandNear lesson, point 122): the widened
        // rivers carve low aprons where nothing clears 0.05 for units around
        // the bank — a LOW bank is still a bank the animals can stand on.
        if (t.type !== 'water' && t.type !== 'ocean') {
          const w = latLonToWorld(lat, lon)
          // Only a bank whose drinking group would land OFF the rendered frame
          // (point 184, Pillar 1: the invariant harness caught the dry-shore seeder
          // popping a drinking herd into view near water — the point-183 class, a
          // DIFFERENT seeder). Seed at the nearest OFF-screen bank so the drinkers
          // drift in; the moving camera exposes one next upkeep, and the ordinary
          // chunk spawn still bases the shore. isOnScreen defaults off-screen with no
          // travel camera, so a camera-less context still seeds normally.
          if (isOnScreen(w.x + 1, w.z + 1)) continue
          const d = Math.hypot(w.x - pos.x, w.z - pos.z)
          if (d < bd) {
            bd = d
            bank = { x: w.x, z: w.z }
          }
        }
      }
    }
  }
  if (!bank) return // no water in reach — nothing to gather at
  // Count at the BANK, and count the seeder's own animals by tag whether or
  // not their spawn roll handed them a drink walk: counting player-centred
  // drink-holders re-seeded EVERY frame while the placed group wandered or
  // missed its drink target — the herd ballooned to hundreds (point 135).
  let count = 0
  for (const sp of SPECIES) {
    for (const a of herds[sp]) {
      if (a.dead) continue
      if (!a.drink && !a.shoreSeed) continue
      if (Math.hypot(a.x - bank.x, a.z - bank.z) <= RANGE) count++
    }
  }
  if (count >= min) return
  const region = regionAt(pll.lat, pll.lon)
  const pool = REGION_PREY[region]
  if (!pool || pool.length === 0) return
  const rand = mulberry32(((seed ^ Math.round(bank.x * 7 + bank.z * 13)) + 0x77) >>> 0)
  const deficit = min - count
  // Rotate through the pool from a deterministic start until a species has
  // instance capacity left (the point-135a rotation the vicinity seeder
  // already runs): picking ONE and giving up at its cap starved the
  // guarantee whenever the fixed seed's pick happened to be a full herd —
  // the measured dryDrinkers 2/4 runs.
  let species: (typeof pool)[number] | null = null
  const start = Math.floor(rand() * pool.length)
  for (let sIdx = 0; sIdx < pool.length; sIdx++) {
    const cand = pool[(start + sIdx) % pool.length]
    if (herds[cand].length + deficit <= MAX_INSTANCES[cand]) {
      species = cand
      break
    }
  }
  if (!species) return
  const cx = Math.floor(pos.x / CHUNK_SIZE)
  const cz = Math.floor(pos.z / CHUNK_SIZE)
  const key = `${cx},${cz}`
  if (!spawnedChunks.has(key)) return
  // Place the group a short walk inland of the bank: the spawn path then
  // hands each animal its own drink target at this shore.
  // 1 unit inland at spread 2.5: inside the dry catchment (each member gets
  // its drink walk) with body spacing intact at spawn. Tag the seeded so the
  // count above sees them even after they wander or shed the drink target.
  const before = herds[species].length
  placeGroup(herds[species], cx, cz, bank.x + 1, bank.z + 1, deficit, 2.5, seed, 0.9, BODY_RADIUS[species], false, undefined, key)
  for (let i = before; i < herds[species].length; i++) herds[species][i].shoreSeed = true
}

// The wildlife InstancedMeshes are MODULE singletons (point 96): fresh
// InstancedMesh objects per mount create fresh internal instance-matrix
// buffer nodes, whose generated uniform names differ — every travel remount
// then produced byte-new shader sources for the whole herd set and the
// renderer re-linked them synchronously after leavePlace().
interface WildlifeMeshPool {
  adult: Record<Species, THREE.InstancedMesh>
  calf: Record<(typeof CALF_SPECIES)[number], THREE.InstancedMesh>
  stain: THREE.InstancedMesh
  material: THREE.MeshStandardMaterial
  vultureGeo: THREE.BufferGeometry
}
let wildlifeMeshCache: WildlifeMeshPool | null = null
function getWildlifeMeshes(): WildlifeMeshPool {
  if (wildlifeMeshCache) return wildlifeMeshCache
  const geometries: Record<Species, THREE.BufferGeometry> = {
    elephant: buildElephant(),
    giraffe: buildGiraffe(),
    zebra: buildZebra(),
    wildebeest: buildWildebeest(),
    antelope: buildAntelope(),
    warthog: buildWarthog(),
    flamingo: buildFlamingo(),
    crocodile: buildCrocodile(),
    plover: buildPlover(),
    // Predator meshes draw only revenge carcasses (point 146).
    lion: buildLion(),
    cheetah: buildCheetah(),
    leopard: buildLeopard(),
    hyena: buildHyena(),
  }
  const calfGeometries: Record<(typeof CALF_SPECIES)[number], THREE.BufferGeometry> = {
    elephant: buildElephant(true),
    giraffe: buildGiraffe(true),
    zebra: buildZebraCalf(),
    plover: buildPloverChick(),
    wildebeest: buildWildebeestCalf(),
    antelope: buildAntelopeCalf(),
    warthog: buildWarthogCalf(),
    lion: buildLionCub(),
  }
  // Shared smooth-shaded fauna material (point 214): flat shading would fold
  // the rounded bodies back into hard polygon panels.
  const material = createFaunaMaterial()
  const adult = {} as Record<Species, THREE.InstancedMesh>
  for (const sp of SPECIES) {
    const m = new THREE.InstancedMesh(geometries[sp], material, MAX_INSTANCES[sp])
    m.castShadow = true
    m.frustumCulled = false
    m.count = 0
    adult[sp] = m
  }
  const calf = {} as Record<(typeof CALF_SPECIES)[number], THREE.InstancedMesh>
  for (const sp of CALF_SPECIES) {
    const m = new THREE.InstancedMesh(calfGeometries[sp], material, MAX_CALF_INSTANCES)
    m.castShadow = true
    m.frustumCulled = false
    m.count = 0
    calf[sp] = m
  }
  const stain = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.9, 16),
    new THREE.MeshStandardMaterial({ color: '#a51512', roughness: 1, transparent: true, opacity: 0.8 }),
    MAX_STAINS,
  )
  stain.frustumCulled = false
  stain.count = 0
  wildlifeMeshCache = { adult, calf, stain, material, vultureGeo: buildVulture() }
  return wildlifeMeshCache
}

// Lion-hunt predator/prey geometries, module-cached for the same reason: the
// scripted hunt remounts with the travel scene and must not rebuild (and,
// under dispose={null}, leak) its geometry set per place visit.
interface HuntGeos {
  predator: Record<PredatorKind, THREE.BufferGeometry>
  prey: Record<PreyKind, THREE.BufferGeometry>
}
let huntGeoCache: HuntGeos | null = null
function getHuntGeos(): HuntGeos {
  if (huntGeoCache) return huntGeoCache
  huntGeoCache = {
    predator: { lion: buildLion(), cheetah: buildCheetah(), leopard: buildLeopard(), hyena: buildHyena() },
    prey: {
      zebra: buildZebra(),
      wildebeest: buildWildebeest(),
      antelope: buildAntelope(),
      warthog: buildWarthog(),
      giraffe: buildGiraffe(),
    },
  }
  return huntGeoCache
}

/** Instanced herds, softly shuffling in place. */
function Herds() {
  const seed = useGame((s) => s.seed)
  const pool = getWildlifeMeshes()
  const meshRefs = useRef<Partial<Record<Species, THREE.InstancedMesh>>>(pool.adult)
  const herdsRef = useRef<Record<Species, Animal[]> | null>(null)
  // Accumulated SIM time (sum of the clamped dt) and frame count, exposed for the
  // verification (point 177): the sim advances in clamped dt (max 0.1/frame), so
  // under headless load wall-time outruns sim-time — drama checks that budget in
  // sim-time via these stay deterministic where a wall-clock budget would flake.
  const simTimeRef = useRef(0)
  const frameCountRef = useRef(0)
  // Chunks currently populated in herdsRef (streaming key set).
  const spawnedChunks = useRef(new Set<string>())
  // Shared per-herd roaming state (heading + arc phase), keyed by herd id.
  // `mourn` is the running vigil at the bones (point 126) with its hard
  // deadline; `mourned` the per-visit latch cleared once the herd has left
  // the draw radius. Both die with the entry when the herd streams out.
  const herdState = useRef(
    new Map<number, { heading: number; phase: number; mourn?: { x: number; z: number; until: number }; mourned?: boolean }>(),
  )
  // Rotating index of the water backstop sweep (open sea AND river/lake
  // water outside the scripted dramas, design.md §19).
  const waterSweep = useRef(0)
  // Scavenger vultures that fly to and consume non-lion carcasses. Each flock's
  // x/z and mode live in a FlightState so it flies in from — and departs to —
  // beyond the zoom-aware view ring instead of popping (design.md §19). A POOL
  // of independent flocks (point 251): each eligible carcass draws and OWNS its
  // own flock, so several carcasses draw several concurrent flocks rather than
  // one global set of vultures hopping from the finished carcass to the next.
  type ScavFlock = FlightState & { y: number; landed: boolean; target: Animal | null }
  const scavengeGroups = useRef<(THREE.Group | null)[]>([])
  const makeScavFlock = (): ScavFlock => ({ mode: 'idle', x: 0, z: 0, y: 14, landed: false, target: null })
  // scavenger.current is flock 0 — the dev hook (window.__wildlife.scavenger)
  // and the single-carcass verify checks read/reset it; scavengers.current[0]
  // is the same object so both views stay in sync.
  const scavenger = useRef<ScavFlock>(makeScavFlock())
  const scavengers = useRef<ScavFlock[]>([scavenger.current, makeScavFlock(), makeScavFlock()])

  // Juveniles keep their own baby-schema build (design.md §19) — geometries,
  // materials and meshes all live in the module pool (point 96).
  const calfMeshRefs = useRef<Partial<Record<Species, THREE.InstancedMesh>>>(pool.calf)
  const material = pool.material
  const vultureGeo = pool.vultureGeo

  useEffect(() => {
    herdsRef.current = emptyHerds()
    spawnedChunks.current.clear()
    herdState.current.clear()
    for (const f of scavengers.current) f.target = null
  }, [seed])

  const mtx = useMemo(() => new THREE.Matrix4(), [])
  const quat = useMemo(() => new THREE.Quaternion(), [])
  const quat2 = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const nrm = useMemo(() => new THREE.Vector3(), [])
  const vpos = useMemo(() => new THREE.Vector3(), [])
  const vscl = useMemo(() => new THREE.Vector3(), [])
  const stainMesh = useRef<THREE.InstancedMesh>(pool.stain)
  const fireFlames = useRef<THREE.InstancedMesh>(null)
  const fireBand = useRef<THREE.InstancedMesh>(null)
  // Each stain lies in the local slope plane (position + ground normal): a
  // horizontal disc on a hillside got wedges swallowed by the ground and read
  // as a Pac-Man (design.md §19).
  const stains = useRef<Array<{ x: number; y: number; z: number; nx: number; ny: number; nz: number }>>([])
  const pushStain = (x: number, z: number) => {
    if (stains.current.length >= MAX_STAINS) return
    const heightAt = (px: number, pz: number) => {
      const ll = worldToLatLon(px, pz)
      return sampleTerrain(ll.lat, ll.lon, seed).height
    }
    const [nx, ny, nz] = groundNormal(x, z, heightAt)
    stains.current.push({ x, y: Math.max(0.02, heightAt(x, z)), z, nx, ny, nz })
  }

  // The one death the §19.8 dramas share (Closing pass): the resolution
  // logic grew by accretion across eight sites — this is its single
  // spelling. sink: a water victim sinks (no scavenger lands on open
  // water); stain: a land kill marks the ground.
  const takeAnimal = (a: Animal, opts: { sink?: boolean; stain?: boolean } = {}) => {
    a.dead = true
    a.lionFed = true
    a.dissolve = CARCASS_DISSOLVE_SECONDS
    if (opts.sink) a.inWater = 0
    if (opts.stain) pushStain(a.x, a.z)
  }

  // Revenge (design.md §19.8, point 146): a strong parent's strike kills a
  // weak predator outright. The predator drops where it stands as an ORDINARY
  // herd carcass — lionFed stays false so the ground scavenger works it like
  // any trampled grazer (no stain: the kick breaks, it does not open a kill).
  const slayPredator = (kind: PredatorKind, x: number, z: number, rot: number) => {
    const h = herdsRef.current
    if (!h) return
    const ll = worldToLatLon(x, z)
    h[kind].push({
      x,
      z,
      y: Math.max(0.02, sampleTerrain(ll.lat, ll.lon, seed).height),
      rot,
      scale: PREDATOR_SCALE[kind],
      phase: 0,
      dead: true,
      dissolve: CARCASS_DISSOLVE_SECONDS,
      lionFed: false,
      chunk: `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`,
    })
  }

  // Dev hook for the headless verification (CLAUDE.md §7.2). `restock` empties
  // every herd in place AND forgets the spawned chunks, so the next frame
  // re-streams the area deterministically — the harness needs it after a test
  // has emptied herd arrays (a bare array clear leaves the chunk keys behind
  // and the area would stay barren until the player travelled far away).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    const restock = () => {
      const h = herdsRef.current
      if (h) for (const sp of SPECIES) h[sp].length = 0
      spawnedChunks.current.clear()
      herdState.current.clear()
      for (const f of scavengers.current) f.target = null
    }
    const igniteFire = (x: number, z: number, heading: number) => {
      FIRE_STATE.mode = 'burning'
      FIRE_STATE.x = x
      FIRE_STATE.z = z
      FIRE_STATE.heading = heading
      FIRE_STATE.front = 2
      FIRE_STATE.victim = null
      FIRE_STATE.keeper = null
    }
    w.__wildlife = { herdsRef, stains, spawnedChunks, scavenger, restock, calfMeshRefs, herdState, fire: FIRE_STATE, lion: LION_STATE, igniteFire, simTime: () => simTimeRef.current, frames: () => frameCountRef.current }
    return () => {
      delete w.__wildlife
    }
  }, [])

  // Drop the shared herd pointer when this scene unmounts so a stale reference
  // never outlives it (design.md §19).
  useEffect(() => () => { ACTIVE_HERDS = null }, [])

  // Let the travel movement loop collide the player with the streamed animals
  // (design.md §19), cleared on unmount so no stale query survives the scene.
  useEffect(() => {
    setAnimalCollider(nearAnimalObstacles)
    return () => setAnimalCollider(null)
  }, [])

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1)
    // Accumulate the SIM clock (point 177): drama verifications budget in these
    // sim-seconds so they stay deterministic when headless load drops the fps.
    simTimeRef.current += dt
    frameCountRef.current++
    // The one burst-derived speed of all four rescue drives (point 127),
    // read fresh so a debug edit of balance.family.rescueBurst applies live.
    const RESCUE_SPEED = rescueSpeed(balance.family.rescueBurst)
    // The calf leash and play bout (design.md §19.8, §21.2) — read fresh each
    // frame so the debug edits apply live. Lengthening the bout lengthens the
    // play; the idle gap between bouts stays the fixed GAMBOL_IDLE_SECONDS.
    const YOUNG_FOLLOW_RADIUS = balance.family.followRadius
    const GAMBOL_RANGE = balance.family.gambolRange
    const GAMBOL_PERIOD = balance.family.gambolBoutSeconds + GAMBOL_IDLE_SECONDS
    const GAMBOL_ACTIVE = balance.family.gambolBoutSeconds / GAMBOL_PERIOD
    const pos = useGame.getState().pos
    const cx = Math.floor(pos.x / CHUNK_SIZE)
    const cz = Math.floor(pos.z / CHUNK_SIZE)

    // Stream wildlife by chunk (design.md §19): keep every animal that may be on
    // screen alive — the kept radius scales with the bird's-eye zoom — and only
    // despawn chunks well beyond the view. Dead carcasses dissolve on screen and
    // are never chunk-despawned.
    if (herdsRef.current === null) herdsRef.current = emptyHerds()
    const herds = herdsRef.current
    ACTIVE_HERDS = herds // let <LionHunt> pick a calf to hunt from these herds
    const zoom = useUi.getState().travelZoom
    const viewR = VIEW_AT_ZOOM1 * zoom
    const spawnR = viewR + SPAWN_MARGIN
    const despawnR = viewR + DESPAWN_MARGIN
    const range = Math.max(SPAWN_RANGE_MIN, Math.min(SPAWN_RANGE_MAX, Math.ceil(spawnR / CHUNK_SIZE)))
    for (let dz = -range; dz <= range; dz++) {
      for (let dx = -range; dx <= range; dx++) {
        const ccx = cx + dx
        const ccz = cz + dz
        const key = `${ccx},${ccz}`
        if (spawnedChunks.current.has(key)) continue
        const chx = (ccx + 0.5) * CHUNK_SIZE
        const chz = (ccz + 0.5) * CHUNK_SIZE
        if (Math.hypot(chx - pos.x, chz - pos.z) > spawnR) continue
        spawnChunk(herds, ccx, ccz, seed, useGame.getState().day)
        spawnedChunks.current.add(key)
      }
    }
    let despawned = false
    for (const key of spawnedChunks.current) {
      const comma = key.indexOf(',')
      const kx = Number(key.slice(0, comma))
      const kz = Number(key.slice(comma + 1))
      const chx = (kx + 0.5) * CHUNK_SIZE
      const chz = (kz + 0.5) * CHUNK_SIZE
      if (Math.hypot(chx - pos.x, chz - pos.z) > despawnR) {
        spawnedChunks.current.delete(key)
        despawned = true
      }
    }
    if (despawned) {
      // Keep dead carcasses (they dissolve on screen) and untagged animals
      // (e.g. injected by the verification) even when their chunk streams out.
      for (const sp of SPECIES) {
        herds[sp] = herds[sp].filter((a) => a.dead || a.chunk === undefined || spawnedChunks.current.has(a.chunk))
      }
      for (const hid of [...herdState.current.keys()]) {
        if (!herds.elephant.some((a) => a.herd === hid)) herdState.current.delete(hid)
      }
      stains.current = stains.current.filter((st) => Math.hypot(st.x - pos.x, st.z - pos.z) <= despawnR)
    }
    // Never leave a settlement's bird's-eye vicinity empty (point 102): top the
    // region-typical presence up to the minimum where the chunk spawn fell short.
    seedSettlementVicinity(herds, pos, seed, spawnedChunks.current)
    seedDryShoreDrinkers(herds, pos, seed, spawnedChunks.current, dt)
    // Render nearest-first so the visible cap keeps the animals closest to the
    // player when a chunk range holds more than an instanced mesh can show.
    for (const sp of SPECIES) {
      if (herds[sp].length > MAX_INSTANCES[sp]) {
        herds[sp].sort(
          (a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z),
        )
      }
    }

    // Frame-start positions for the elephant body collider (design.md §19.5,
    // point 261): every non-elephant animal's step this frame is later swept
    // against the elephants' bodies so it slides AROUND them rather than through.
    // Snapshotted here, before any drive moves an animal, so the sweep sees the
    // whole frame's displacement (no tunnelling through the ~2.6 m-wide body).
    const stepFrom = new Map<Animal, [number, number]>()
    for (const sp of SPECIES) {
      if (sp === 'elephant') continue
      for (const a of herds[sp]) stepFrom.set(a, [a.x, a.z])
    }

    // Calf predation resolution (design.md §19), over the FULL herd lists — not
    // just the rendered slice — so a caught calf's struggle countdown and its
    // parent's rescue charge always resolve, even when a herd exceeds the
    // instance cap and the family straddles the rendered boundary. The render
    // loop below only poses these animals; the state transitions happen here.
    // FAMILY_DEFEND_SPECIES, not CALF_HUNT_SPECIES: the lioness reaches this
    // shared core for her cub (point 145c) without joining the prey loops.
    for (const sp of FAMILY_DEFEND_SPECIES) {
      for (const a of herds[sp]) {
        if (a.dead) continue
        // The defence kick's pose window runs down here so it always resolves
        // (point 124) — the render loop below only draws it.
        if (a.kick !== undefined) {
          a.kick -= dt
          if (a.kick <= 0) a.kick = undefined
        }
        if (a.caught !== undefined && a.caught > 0) {
          // Caught calf: count down the struggle. Unrescued, the kill completes —
          // and a parent that charged in but only got close (too late) is taken
          // alongside it: both are eaten (§19).
          a.caught -= dt
          if (a.caught <= 0) {
            a.caught = undefined
            // A crocodile drags its kill under — the river takes the body
            // (design.md §19.16); land predators leave the stained carcass.
            const croc = a.caughtBy === 'crocodile'
            takeAnimal(a, croc ? { sink: true } : { stain: true })
            const par = a.parent
            if (par && !par.dead && Math.hypot(par.x - a.x, par.z - a.z) < PARENT_TOO_LATE_DIST) {
              takeAnimal(par, croc ? { sink: true } : { stain: true })
              par.child = undefined
            } else if (par && !par.dead) {
              // The vigil (design.md §19.8, point 121): a parent that stayed
              // clear of the kill does not resume grazing — it walks to the
              // carcass and stands over it (behaviour in the vigil pre-pass).
              par.vigil = { x: a.x, z: a.z, carcass: a, time: 0 }
              par.child = undefined
              a.parent = undefined
            }
          }
        } else if (a.child && !a.child.dead && a.child.caught !== undefined && a.child.caught > 0) {
          // A calf of ours is being eaten: charge the predator (at the calf) and
          // sacrifice ourselves on contact so the calf gets up and escapes (§19).
          const calf = a.child
          const toX = calf.x - a.x
          const toZ = calf.z - a.z
          const d = Math.hypot(toX, toZ) || 1
          a.x += (toX / d) * RESCUE_SPEED * dt
          a.z += (toZ / d) * RESCUE_SPEED * dt
          { // ground-follow (point 203(A)): a mover carries its own standing height
            const gfl = worldToLatLon(a.x, a.z)
            const gft = sampleTerrain(gfl.lat, gfl.lon, seed)
            if (gft.type !== 'water' && gft.type !== 'ocean') a.y = Math.max(0.02, gft.height)
          }
          if (d < PARENT_SACRIFICE_DIST) {
            // The defence roll (design.md §19.8, points 124/125/146): ONE
            // roll resolves the charging parent's attack three ways — its
            // weapon against THIS hunter's readiness to yield (driveOff) or
            // fragility (kill). Deterministic per event (hashed from phase
            // and position, like the mire roll — never Math.random in the
            // sim). A MIRED calf never rolls (point 123): the charge into
            // the mud is a SURRENDER, not an attack — the point-125 line —
            // so it stays chance-zero by construction.
            const roll = Math.abs(Math.sin(a.phase * 127.1 + a.x * 311.7 + a.z * 74.7)) % 1
            const outcome =
              calf.mired === undefined
                ? parentAttackOutcome(sp, calf.caughtBy ?? LION_STATE.predator, roll, balance.parentDefense)
                : 'taken'
            if (outcome !== 'taken') {
              // Driven off or killed: the calf is freed and rises, the parent
              // LIVES unwounded, strikes (the kick pose below) and simply
              // resumes herd behaviour — an attacker never stands vigil.
              calf.caught = undefined
              a.kick = PARENT_KICK_SECONDS
              if (calf.caughtBy === 'crocodile') {
                // Driven off the seized calf (point 130): the crocodile lets
                // go and slinks back to its water. Kill is structurally
                // impossible (killFlight.crocodile = 0) — nothing breaks the
                // armoured ambusher.
                const cc = herds.crocodile.find((k) => k.lunge && k.lunge.victim === calf)
                if (cc && cc.lunge) cc.lunge.retreat = true
                calf.caughtBy = undefined
              } else if (LION_STATE.victim === calf) {
                LION_STATE.victim = null
                if (outcome === 'kill') {
                  // Revenge (point 146): the strike kills the predator where
                  // it fed — at the carcass flank. The hunt ends AT this
                  // resolution point (the point-121 claim rule allows that):
                  // straight to idle, which hides the scripted predator mesh
                  // — the carcass pushed into the herds replaces it in place,
                  // so nothing pops. No walk-off: the predator is dead.
                  slayPredator(LION_STATE.predator, LION_STATE.px + 0.7, LION_STATE.pz + 0.25, Math.atan2(-0.7, -0.25))
                  LION_STATE.victimHunt = false
                  LION_STATE.mode = 'idle'
                  LION_STATE.timer = 30 + Math.random() * 30
                } else {
                  LION_STATE.mode = 'leave'
                  LION_STATE.heading = leaveHeading(LION_STATE.lx, LION_STATE.lz, pos.x, pos.z)
                  LION_STATE.leaveHeading = undefined // fresh corridor pick (point 188)
                  LION_STATE.leaveT = 0
                  // The feeding predator stood at the carcass flank — pick the
                  // walk-off up from there, like the feed→leave exit does.
                  LION_STATE.lx = LION_STATE.px + 0.7
                  LION_STATE.lz = LION_STATE.pz + 0.25
                }
              }
            } else {
              // A MIRED calf cannot rise and flee (point 123): the parent's
              // charge still costs its life, but the mud holds the calf for
              // the predator — at the waterhole both are taken, through the
              // existing caught countdown (no new kill path).
              if (calf.mired === undefined) {
                calf.caught = undefined // freed — it rises and flees on its own
                calf.parent = undefined
                a.child = undefined
              }
              if (calf.caughtBy === 'crocodile') {
                // The sacrifice at the waterline (point 130): the crocodile
                // takes the charging parent under in the calf's place.
                takeAnimal(a, { sink: true })
                const cc = herds.crocodile.find((k) => k.lunge && k.lunge.victim === calf)
                if (cc && cc.lunge) cc.lunge.retreat = true
                calf.caughtBy = undefined
              } else {
                takeAnimal(a, { stain: true })
                if (LION_STATE.victim === calf) LION_STATE.victim = a // the predator feeds on the parent now
              }
            }
          }
        } else if (
          a.child &&
          !a.child.dead &&
          a.child.caught === undefined &&
          a.child.mired === undefined && // the vigil (point 123) never shields:
          // the mud holds the calf, the hunt reaches it, and the parent's
          // charge after the catch costs its life beside it.
          LION_STATE.mode === 'chase' &&
          LION_STATE.victim === a.child
        ) {
          // Our calf is being run down (design.md §19): the parent does not flee
          // with it — it holds itself between the hunter and its young, a living
          // shield on the escape line. A hunter that reaches the blocking parent
          // takes it in the calf's place, and the calf escapes uncaught.
          const calf = a.child
          const h = blockHeading(a.x, a.z, calf.x, calf.z, LION_STATE.lx, LION_STATE.lz, PARENT_BLOCK_OFFSET)
          if (h !== null) {
            a.x += Math.sin(h) * RESCUE_SPEED * dt
            a.z += Math.cos(h) * RESCUE_SPEED * dt
          }
          // SWEPT (point 179): the hunter's last MOVE SEGMENT vs the interposing
          // parent, not its current point — a big clamped-dt step must not carry
          // it THROUGH the living shield without registering contact. The segment
          // is reconstructed from the lion's heading + speed (robust — no stored
          // prev-position that a directly-staged hunt could leave stale, which
          // fired the take a frame too early before the calf could flee).
          const lmv = HUNT_LION_SPEED * dt
          const lpx = LION_STATE.lx - Math.sin(LION_STATE.lionHeading) * lmv
          const lpz = LION_STATE.lz - Math.cos(LION_STATE.lionHeading) * lmv
          if (segPointDist(lpx, lpz, LION_STATE.lx, LION_STATE.lz, a.x, a.z) < PARENT_TAKE_DIST) {
            // The defence roll (design.md §19.8, points 124/125/146), same
            // rule as the charge above: the shield ATTACKS on contact, so it
            // rolls (the point-125 line) — the hunter that reaches it may be
            // kicked off, or killed outright. Deterministic per event.
            const roll = Math.abs(Math.sin(a.phase * 127.1 + a.x * 311.7 + a.z * 74.7)) % 1
            const outcome = parentAttackOutcome(sp, LION_STATE.predator, roll, balance.parentDefense)
            if (outcome !== 'taken') {
              // Driven off or killed mid-chase: the family stays whole, the
              // parent lives unwounded and the hunt ends at this resolution
              // point (the point-121 claim rule).
              a.kick = PARENT_KICK_SECONDS
              LION_STATE.victim = null
              if (outcome === 'kill') {
                // Revenge (point 146): the hunter drops where it stands and
                // becomes an ordinary herd carcass; straight to idle hides
                // the scripted mesh in the same frame — no walk-off.
                slayPredator(LION_STATE.predator, LION_STATE.lx, LION_STATE.lz, LION_STATE.lionHeading)
                LION_STATE.victimHunt = false
                LION_STATE.mode = 'idle'
                LION_STATE.timer = 30 + Math.random() * 30
              } else {
                LION_STATE.mode = 'leave'
                LION_STATE.heading = leaveHeading(LION_STATE.lx, LION_STATE.lz, pos.x, pos.z)
                LION_STATE.leaveHeading = undefined // fresh corridor pick (point 188)
                LION_STATE.leaveT = 0
              }
            } else {
              calf.parent = undefined // freed — it keeps fleeing on its own
              a.child = undefined
              takeAnimal(a, { stain: true })
              LION_STATE.victim = a // the hunt closes out feeding on the parent
            }
          }
        }
      }
    }

    // Calf water drama (design.md §19), over the FULL lists like the predation
    // above: a calf that ends up on open water (usually mid-gambol at a shore)
    // struggles there and drifts with the current; its parent wades in, pulls
    // it out and both walk back to the bank. In water close to a waterfall any
    // of them is swept over and dies — and a calf that goes over is followed
    // by its plunging parent, which dies with it.
    for (const sp of CALF_HUNT_SPECIES) {
      for (const a of herds[sp]) {
        if (a.dead) {
          // A waterfall/water victim sinks away on its own — no scavenger
          // lands on open water.
          if (a.inWater !== undefined && a.dissolve !== undefined && a.dissolve > 0) a.dissolve -= dt
          continue
        }
        if (a.young) {
          const isChaseVictim = LION_STATE.mode === 'chase' && LION_STATE.victim === a
          // The drying waterhole (point 123): a mired calf struggles in
          // place — no drift, no self-rescue — until a predator ends it or
          // the mud releases it after the calibratable window (the drama
          // always resolves, the point-118 lesson).
          if (a.mired !== undefined && a.caught === undefined) {
            a.mired += dt
            if (mireFate(a.mired, balance.waterDrama.mireSeconds) === 'released') {
              a.mired = undefined
            }
          }
          if (a.inWater === undefined && !a.rescued && a.caught === undefined && !isChaseVictim) {
            const ll = worldToLatLon(a.x, a.z)
            const ter = sampleTerrain(ll.lat, ll.lon, seed)
            if (ter.type === 'water') {
              // Fell in: start to struggle. A play bout recorded the entry
              // point; otherwise probe for the nearest bank.
              a.inWater = 0
              a.hop = undefined
              // Struggle AT the rendered sheet (point 196): the pose dips from
              // a.y, and the carved bed sits far below the surface mid-channel.
              a.y = sheetAnchorY(waterSurfaceY(ll.lat, ll.lon, seed, ter.height), ter.height, 0.05)
              if (!a.rescueEntry) a.rescueEntry = findLandNear(a.x, a.z, seed)
            }
          }
          if (a.inWater !== undefined && !a.rescued) {
            a.inWater += dt
            const ll = worldToLatLon(a.x, a.z)
            const fd = fallsDistanceDeg(ll.lat, ll.lon)
            if (fd < FALLS_DEATH_RADIUS_DEG) {
              // Swept over the fall: the calf dies, its parent plunges after it.
              takeAnimal(a) // the river takes it — it sinks, nothing scavenges
              const par = a.parent
              a.parent = undefined
              if (par && !par.dead) {
                par.plungeTo = { x: a.x, z: a.z }
                par.child = undefined
              }
              continue
            }
            // Drift downstream, harder near a fall (§11-style current) and
            // harder in the rains: the wet season swells the whole drama
            // current (point 122, calibratable in balance.waterDrama).
            const bw = balance.waterDrama
            const season = seasonFlowFactor(CURRENT_WEATHER.wetness, bw.dryFlowFactor, bw.wetFlowFactor)
            const flow = riverFlow(ll.lat, ll.lon)
            if (flow.strength > 0) {
              const boost =
                fd < FALLS_DRIFT_RADIUS_DEG ? 1 + (FALLS_DRIFT_BOOST - 1) * (1 - fd / FALLS_DRIFT_RADIUS_DEG) : 1
              const stepDeg = flow.strength * season * CALF_DRIFT_DEG * boost * dt
              // The drift follows the CHANNEL (channelDriftStep): the raw
              // segment tangent cut every bend and beached the calf, where
              // the current dies and neither rescue nor drowning resolves.
              const moved = channelDriftStep(
                a.x,
                a.z,
                flow.dirLon * stepDeg * UNITS_PER_DEGREE,
                -flow.dirLat * stepDeg * UNITS_PER_DEGREE,
                (wx, wz) => {
                  const w = worldToLatLon(wx, wz)
                  return sampleTerrain(w.lat, w.lon, seed).type === 'water'
                },
              )
              a.x = moved.x
              a.z = moved.z
              const nll = worldToLatLon(a.x, a.z)
              const nh = sampleTerrain(nll.lat, nll.lon, seed).height
              a.y = sheetAnchorY(waterSurfaceY(nll.lat, nll.lon, seed, nh), nh, 0.05)
            }
            // Calm water lets an unaided calf clamber out exhausted; a swollen
            // current holds it under until it drowns (design.md §19.8).
            const fate = waterStruggleFate(
              flow.strength * season,
              a.inWater,
              STRUGGLE_SELF_RESCUE,
              bw.drownSeconds,
              bw.drownFlowThreshold,
            )
            if (fate === 'drowned') {
              takeAnimal(a) // the river takes it — it sinks, nothing scavenges
              const par = a.parent
              a.parent = undefined
              if (par) par.child = undefined
              continue
            }
            if (fate === 'self-rescue') a.rescued = true
          }
          if (a.rescued) {
            // Pulled out (or clambering out): walk back to the entry bank.
            const entry = a.rescueEntry ?? (a.rescueEntry = findLandNear(a.x, a.z, seed))
            const dx = entry.x - a.x
            const dz = entry.z - a.z
            const d = Math.hypot(dx, dz)
            if (d > 0.3) {
              a.x += (dx / d) * RETURN_SPEED * dt
              a.z += (dz / d) * RETURN_SPEED * dt
            }
            const ll = worldToLatLon(a.x, a.z)
            const ter = sampleTerrain(ll.lat, ll.lon, seed)
            // Wade out chest-deep ON the sheet (point 196), never along the bed.
            if (ter.type === 'water') a.y = sheetAnchorY(waterSurfaceY(ll.lat, ll.lon, seed, ter.height), ter.height, 0.32)
            if (ter.type !== 'water' || d <= 0.3) {
              // Back on the bank: shake off and rejoin the herd.
              a.inWater = undefined
              a.rescued = undefined
              a.rescueEntry = undefined
              a.y = Math.max(0.02, ter.height)
            }
          }
        } else if (a.plungeTo) {
          // Our calf went over the fall: plunge after it (design.md §19).
          // A SURRENDER, not an attack (point 125): the plunge never rolls
          // the defence — the parent gives itself to the water.
          const dx = a.plungeTo.x - a.x
          const dz = a.plungeTo.z - a.z
          const d = Math.hypot(dx, dz) || 1
          a.x += (dx / d) * PLUNGE_SPEED * dt
          a.z += (dz / d) * PLUNGE_SPEED * dt
          if (d < PLUNGE_REACH) {
            takeAnimal(a, { sink: true }) // sinks in the plunge pool like its calf
          }
        } else if (a.child && !a.child.dead && a.child.inWater !== undefined) {
          const calf = a.child
          if (!calf.rescued) {
            // Wade in toward the struggling calf and pull it out on reach.
            const dx = calf.x - a.x
            const dz = calf.z - a.z
            const d = Math.hypot(dx, dz)
            if (d > RESCUE_REACH) {
              // The swollen current brakes the wader (points 122/127): in the
              // water the burst is divided by the season flow factor, so the
              // rains' drowning drama survives the sprint. On the bank the
              // parent runs the full burst.
              const pll = worldToLatLon(a.x, a.z)
              const bw0 = balance.waterDrama
              const wspd =
                sampleTerrain(pll.lat, pll.lon, seed).type === 'water'
                  ? wadeSpeed(RESCUE_SPEED, seasonFlowFactor(CURRENT_WEATHER.wetness, bw0.dryFlowFactor, bw0.wetFlowFactor))
                  : RESCUE_SPEED
              a.x += (dx / d) * wspd * dt
              a.z += (dz / d) * wspd * dt
            } else {
              calf.rescued = true
              if (!calf.rescueEntry) calf.rescueEntry = findLandNear(calf.x, calf.z, seed)
            }
            // The rescuer is at the river's mercy too: wading close to a fall
            // it is swept over and dies, and the calf struggles on alone —
            // and a parent that stays too long in a swollen current drowns
            // beside its calf (point 122).
            const ll = worldToLatLon(a.x, a.z)
            const ter = sampleTerrain(ll.lat, ll.lon, seed)
            if (ter.type === 'water') {
              // Chest-deep on the rendered sheet (point 196), like a crossing.
              a.y = sheetAnchorY(waterSurfaceY(ll.lat, ll.lon, seed, ter.height), ter.height, 0.32)
              a.wadeTime = (a.wadeTime ?? 0) + dt
              const bw = balance.waterDrama
              const season = seasonFlowFactor(CURRENT_WEATHER.wetness, bw.dryFlowFactor, bw.wetFlowFactor)
              const wadeFlow = riverFlow(ll.lat, ll.lon)
              const swept = fallsDistanceDeg(ll.lat, ll.lon) < FALLS_DEATH_RADIUS_DEG
              const drowned =
                waterStruggleFate(
                  wadeFlow.strength * season,
                  a.wadeTime,
                  Infinity, // a wading parent never "self-rescues" — it leaves by escort
                  bw.drownSeconds,
                  bw.drownFlowThreshold,
                ) === 'drowned'
              if (swept || drowned) {
                takeAnimal(a, { sink: true })
                calf.parent = undefined
                a.child = undefined
              }
            } else {
              a.wadeTime = undefined
              // Ground-follow (point 203(A)): the land approach carries its own
              // standing height — the sweep skips rescue parents entirely.
              if (ter.type !== 'ocean') a.y = Math.max(0.02, ter.height)
            }
          } else if (calf.rescueEntry) {
            // Escort the pulled-out calf back to the bank. The wade is over —
            // the drown clock must not carry into the next drama (point 122).
            a.wadeTime = undefined
            const dx = calf.rescueEntry.x - a.x
            const dz = calf.rescueEntry.z - a.z
            const d = Math.hypot(dx, dz)
            if (d > 1) {
              a.x += (dx / d) * RETURN_SPEED * dt
              a.z += (dz / d) * RETURN_SPEED * dt
              // Ground-follow (point 203(A)): the escort too is sweep-skipped.
              const ell = worldToLatLon(a.x, a.z)
              const ett = sampleTerrain(ell.lat, ell.lon, seed)
              if (ett.type !== 'water' && ett.type !== 'ocean') a.y = Math.max(0.02, ett.height)
            }
          }
        }
      }
    }

    // Trample grief (design.md §19), over the FULL lists like the dramas above:
    // a parent whose calf was trampled charges the nearest elephant's feet and
    // lets itself be trampled too. It runs at the LIVE elephant, not the death
    // spot — the herd walks on. No kill here: the trample check in the render
    // loop takes the arriving parent, which is the whole point (one code path).
    // A SURRENDER, not an attack (point 125): the grief charge never rolls
    // the defence — it goes under the feet by choice (points 119/134).
    // Every species but the elephant raises calves that can be trampled.
    for (const sp of SPECIES) {
      if (sp === 'elephant') continue
      for (const a of herds[sp]) {
        if (a.dead || a.trampleTo === undefined) continue
        // The grief ALWAYS resolves: with no elephant left to trample it (all
        // dead or streamed out), or once the window runs out, the parent stops
        // and rejoins the herd — never a drive that cannot end.
        const target = griefTarget(a.x, a.z, herds.elephant)
        a.grief = (a.grief ?? 0) - dt
        if (target === null || a.grief <= 0) {
          a.trampleTo = undefined
          a.grief = undefined
          continue
        }
        // Aim at the elephant's FRONT (point 259): only a touch from ahead —
        // where the moving elephant is travelling toward the parent — triggers
        // the trample (the trampleKills direction condition in the render loop).
        // A parent that only reaches the flank/rear is not crushed and keeps
        // re-aiming; the grief window (deadline above) still always resolves it.
        const front = frontInterceptTarget(target.x, target.z, target.heading, GRIEF_FRONT_REACH)
        a.trampleTo = front
        const dx = front.x - a.x
        const dz = front.z - a.z
        const d = Math.hypot(dx, dz) || 1
        a.x += (dx / d) * TRAMPLE_GRIEF_SPEED * dt
        a.z += (dz / d) * TRAMPLE_GRIEF_SPEED * dt
      }
    }

    // The vigil (design.md §19.8, point 121), over the FULL lists like the
    // dramas above: the bereaved parent walks to its calf's carcass and holds
    // there. It ALWAYS resolves (the point-118 lesson): once the carcass is
    // gone/dissolved or the window runs out, the field clears and the parent
    // simply resumes normal behaviour — never a drive with no exit.
    // A SURRENDER, not an attack (point 125): a keeper seized by the drawn
    // predator (121 (f)) stands and is taken — it never rolls the defence.
    for (const sp of CALF_HUNT_SPECIES) {
      for (const a of herds[sp]) {
        if (a.dead || a.vigil === undefined) continue
        const v = a.vigil
        v.time += dt
        const carcassGone =
          v.carcass.gone === true || (v.carcass.dissolve !== undefined && v.carcass.dissolve <= 0)
        if (v.time > balance.vigil.seconds || carcassGone) {
          a.vigil = undefined
          continue
        }
        const dx = v.x - a.x
        const dz = v.z - a.z
        const d = Math.hypot(dx, dz)
        if (d > VIGIL_HOLD_DIST) {
          a.x += (dx / d) * YOUNG_FOLLOW_SPEED * dt
          a.z += (dz / d) * YOUNG_FOLLOW_SPEED * dt
          { // ground-follow (point 203(A)): a mover carries its standing height
            const gfl = worldToLatLon(a.x, a.z)
            const gft = sampleTerrain(gfl.lat, gfl.lon, seed)
            if (gft.type !== 'water' && gft.type !== 'ocean') a.y = Math.max(0.02, gft.height)
          }
        }
      }
    }

    // Animal-animal collision (design.md §19): live animals never stand in or
    // walk through one another — each frame every overlapping pair parts, each
    // member resolving its own half of the overlap (a spatial grid keeps the
    // pass O(n·k)). Exempt are the scripted dramas that need contact (a caught
    // or in-water calf, a charging/plunging parent) and the elephant×smaller-
    // prey pair, where walking over a too-slow animal IS the designed trample.
    {
      const inDrama = (b: Animal): boolean =>
        b.dead ||
        b.caught !== undefined ||
        b.inWater !== undefined ||
        b.mired !== undefined ||
        b.rescued !== undefined ||
        b.plungeTo !== undefined ||
        b.trampleTo !== undefined ||
        b.vigil !== undefined ||
        b.crossing !== undefined ||
        b.fireTrapped !== undefined ||
        // A parent wading to a calf in the water is mid-drama too (point 197):
        // the backstop already exempts a child-inWater/mired parent, so the
        // collision push must match — the old list dropped the inWater case.
        (b.child !== undefined && !b.child.dead &&
          (b.child.caught !== undefined || b.child.mired !== undefined || b.child.inWater !== undefined)) ||
        // The active chase victim and its blocking parent sprint on exact
        // lines; herd-mates shoving them every frame trembled the hunt.
        (LION_STATE.mode === 'chase' &&
          (LION_STATE.victim === b || (b.child !== undefined && LION_STATE.victim === b.child)))
      const grid = new Map<string, Array<{ a: Animal; sp: Species }>>()
      for (const sp of SPECIES) {
        for (const a of herds[sp]) {
          if (inDrama(a)) continue
          const key = `${Math.floor(a.x / SEPARATION_CELL)},${Math.floor(a.z / SEPARATION_CELL)}`
          let cellList = grid.get(key)
          if (!cellList) {
            cellList = []
            grid.set(key, cellList)
          }
          cellList.push({ a, sp })
        }
      }
      const neighbors: Array<[number, number, number]> = []
      for (const sp of SPECIES) {
        for (const a of herds[sp]) {
          if (inDrama(a)) continue
          const ra = BODY_RADIUS[sp] * a.scale
          const gx = Math.floor(a.x / SEPARATION_CELL)
          const gz = Math.floor(a.z / SEPARATION_CELL)
          neighbors.length = 0
          for (let dz2 = -1; dz2 <= 1; dz2++) {
            for (let dx2 = -1; dx2 <= 1; dx2++) {
              const cellList = grid.get(`${gx + dx2},${gz + dz2}`)
              if (!cellList) continue
              for (const n of cellList) {
                if (n.a === a) continue
                // A calf plays and nurses right beside its parent — never part
                // the pair, or they jitter as separation fights play/follow.
                if (a.child === n.a || a.parent === n.a) continue
                // Trample pairs stay unseparated (design.md §19).
                if ((sp === 'elephant') !== (n.sp === 'elephant')) continue
                neighbors.push([n.a.x, n.a.z, ra + BODY_RADIUS[n.sp] * n.a.scale])
              }
            }
          }
          if (neighbors.length === 0) continue
          let [dx, dz] = separationPush(a.x, a.z, neighbors)
          // Pinned-at-a-water-edge resolve (point 222): if the raw push would
          // shove this animal toward impassable water, the water setback reverts
          // it every frame and the pair never parts — resolve along the shore
          // tangent instead. The water-dwellers (flamingo wader, crocodile) are
          // exempt; they belong at the water. Cheap: the ring sample runs only
          // when a non-zero push actually points at water.
          if ((dx !== 0 || dz !== 0) && sp !== 'flamingo' && sp !== 'crocodile') {
            const m0 = Math.hypot(dx, dz)
            const reach = ra + 0.6
            const pll = worldToLatLon(a.x + (dx / m0) * reach, a.z + (dz / m0) * reach)
            const pt = sampleTerrain(pll.lat, pll.lon, seed).type
            if (pt === 'water' || pt === 'ocean') {
              const wn = waterNormalAt(a.x, a.z, seed)
              if (wn) [dx, dz] = edgeSeparationPush(a.x, a.z, neighbors, wn)
            }
          }
          if (dx !== 0 || dz !== 0) {
            // Clamp the correction to a walking pace: the full geometric
            // half-overlap per frame acted as a teleport that the behaviours
            // reversed next frame — a push-pull vibration wherever animals
            // bunch (dodging an elephant, playing calves). As a bounded
            // force the pair still parts within moments, just smoothly.
            const m = Math.hypot(dx, dz)
            const cap = SEPARATION_MAX_SPEED * dt
            const k = m > cap ? cap / m : 1
            a.x += dx * k
            a.z += dz * k
            // Ground-follow (point 203(A)): the pushes are small but continuous
            // — at a crowded bank slope (the dry-season gathering) they drifted
            // an animal off its cached standing height until it stood in the
            // earth. Land only; water occupants are owned by their dramas.
            const gfl = worldToLatLon(a.x, a.z)
            const gft = sampleTerrain(gfl.lat, gfl.lon, seed)
            if (gft.type !== 'water' && gft.type !== 'ocean') a.y = Math.max(0.02, gft.height)
          }
        }
      }
    }

    // Animals never walk into the impassable open ocean (design.md §19): a
    // rotating slice of the herds is checked each frame (full coverage every
    // few frames), and anyone standing on an ocean cell is set back to the
    // nearest land. This backstops every mover — flee, dodge, follow, escort
    // and the separation pushes — without sampling every animal every frame.
    {
      const phase = waterSweep.current++ % 7
      for (const sp of SPECIES) {
        // Flamingos are shoreline waders and the crocodile's home IS the
        // water (design.md §19.16) — both stand exempt; everyone else is set
        // back to land.
        if (sp === 'flamingo' || sp === 'crocodile') continue
        const list = herds[sp]
        for (let i = phase; i < list.length; i += 7) {
          const a = list[i]
          // In-game invariants (point 207(i)) — piggyback on the sweep slice so
          // the whole herd is asserted every few frames at no extra pass:
          // positions stay finite, and every timed drama respects its deadline
          // (the I4 rule made loud — a silent violation now fails ANY suite).
          devAssert(
            Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(a.y),
            'animal-position-finite',
            () => `${sp} at ${a.x},${a.z},${a.y}`,
          )
          if (a.crossing !== undefined)
            devAssert(
              a.crossing.time <= balance.waterCross.resolveSeconds + 2,
              'crossing-deadline',
              () => `${sp} crossing for ${a.crossing?.time.toFixed(1)}s`,
            )
          if (a.caught !== undefined)
            devAssert(a.caught <= CAUGHT_DURATION + 2, 'caught-window-bounded', () => `${sp} caught=${a.caught}`)
          // Water drama (struggle, rescue, plunge, a wading parent) owns its
          // own movement; everyone else must never STAND in water — not in
          // the open sea, and not in a river or lake either (an animal only
          // reaches the water's edge to drink, design.md §19). A purposeful
          // CROSSING (point 192) is exempt while it lasts, and so is a CAUGHT
          // victim (point 197: the croc grips its prey at the waterline — the
          // setback used to teleport it out of the grip, the vanish class).
          if (
            a.dead || a.inWater !== undefined || a.mired !== undefined || a.rescued || a.plungeTo ||
            a.trampleTo || a.vigil || a.crossing !== undefined || a.caught !== undefined
          )
            continue
          if (a.child && !a.child.dead && (a.child.inWater !== undefined || a.child.mired !== undefined)) continue
          const ll = worldToLatLon(a.x, a.z)
          const terSample = sampleTerrain(ll.lat, ll.lon, seed)
          const ter = terSample.type
          // Ground re-anchor (the first catch of the 203(A) tripwire): drifting
          // movers (separation pushes, cohesion, dodges) kept their SPAWN
          // height while the ground under them changed — on a slope they stood
          // up to half a body in the earth. Ease the standing height onto the
          // current ground (the sweep already sampled it); the eased step over
          // a few sweep visits avoids a visible snap.
          if (ter !== 'ocean' && ter !== 'water') {
            a.y = Math.max(0.02, terSample.height)
            a.grounded = true // seen by the sweep at least once (203(A) gate)
          }
          if (ter === 'ocean' || ter === 'water') {
            const back = findLandNear(a.x, a.z, seed)
            a.x = back.x
            a.z = back.z
            const l2 = worldToLatLon(a.x, a.z)
            a.y = Math.max(0.02, sampleTerrain(l2.lat, l2.lon, seed).height)
            // Clear the dodge heading: after the land teleport the escape
            // direction must re-engage exactly (re-seeding it from the old
            // facing sent the prey RUNNING at the threat until the turn cap
            // caught up). The RENDERED facing stays smooth regardless — it
            // is turn-capped separately (FACE_TURN).
            a.dodgeHeading = undefined
          }
        }
      }
    }

    // The crocodile ambush (design.md §19.16, point 130): hidden in its
    // water, it lunges only at a bank visitor inside the strike radius,
    // grips its victim through the EXISTING §19.8 struggle window (a parent
    // has those seconds to save it) and the kill sinks — the river takes the
    // body. Per-crocodile state; the single scripted lion hunt is untouched.
    {
      const bc = balance.crocodile
      for (const c of herds.crocodile) {
        if (c.dead) continue
        // Keep every RESTING crocodile ON water (design.md §19.16, point 242): a
        // mask edit (the point-218 river widening) can leave a once-water spawn
        // cell reading as bank/sand, beaching the ambusher flat and fully exposed.
        // A hidden croc off water re-anchors to the nearest river/lake cell and
        // re-seats on that water surface (so the submerge pose sinks it correctly);
        // a lunging/gripping croc is left to its working attack, never relocated.
        if (!c.lunge) {
          const cll = worldToLatLon(c.x, c.z)
          if (crocodileNeedsReanchor(sampleTerrain(cll.lat, cll.lon, seed).type)) {
            const w = findWaterNear(c.x, c.z, seed)
            if (w) {
              c.x = w.x
              c.z = w.z
              const wll = worldToLatLon(w.x, w.z)
              const wt = sampleTerrain(wll.lat, wll.lon, seed)
              c.y = waterSurfaceY(wll.lat, wll.lon, seed, wt.height) ?? wt.height + 0.3
            }
          }
        }
        if (!c.lunge) {
          // Hidden: wait for a drinker standing at a bank inside the radius.
          // A drinking JUVENILE is the strongly-preferred target (point 245),
          // so the §19.8 sacrifice/rescue drama fires more often — score every
          // eligible bank drinker by crocodileTargetWeight (young ≫ adult) and
          // take the best (nearer breaks a same-weight tie), rather than the
          // first one found.
          let bestVictim: Animal | null = null
          let bestScore = -Infinity
          for (const sp of CALF_HUNT_SPECIES) {
            for (const a of herds[sp]) {
              // Skip any animal already owned by another drama or not actually
              // standing at the bank (point 197, the 194 seam pattern): the lion's
              // chase victim (§19.16 — the two systems never claim one animal), a
              // fleeing/dodging drinker whose stale drink target still sits near
              // the croc (it is rendered away at its flight, not at the water), a
              // crossing/vigil/fire-trapped animal. The croc lunges only at an
              // animal genuinely drinking at the bank.
              if (
                a.dead || !a.drink || a.dodgeHeading !== undefined || a.vigil !== undefined ||
                claimedByAnotherDrama({ ...a, isLionVictim: a === LION_STATE.victim })
              )
                continue
              const cycle = ((clock.elapsedTime + a.phase * 40) % 75) / 75
              const atBank = cycle > 0.1 && cycle < 0.4 // rendered standing at the water
              const d = Math.hypot(a.drink.tx - c.x, a.drink.tz - c.z)
              if (!crocodileLungeReady(d, atBank, bc.strikeRadius)) continue
              // Weight dominates (gap ≥ 1); the tiny distance term only breaks
              // ties between two same-age drinkers, so a juvenile always wins.
              const score = crocodileTargetWeight(a.young === true, balance.family.juvenileDrinkCrocBias) - d * 1e-3
              if (score > bestScore) {
                bestScore = score
                bestVictim = a
              }
            }
          }
          if (bestVictim) c.lunge = { victim: bestVictim, timer: 0, homeX: c.x, homeZ: c.z, gripped: false }
        } else if (
          c.lunge.retreat ||
          c.lunge.victim === null ||
          c.lunge.victim.gone === true ||
          // Gripping: slink home only once the catch is fully RESOLVED — the croc
          // stays coupled to its victim through the struggle AND the sink that
          // follows the kill (point 250: no swimming away while the prey still
          // dissolves on its own). Mid-burst (not yet gripped): a victim that died
          // or vanished before contact ends the run.
          (c.lunge.gripped
            ? !crocodileHoldsCatch(true, c.lunge.victim.caught, c.lunge.victim.dead === true, c.lunge.victim.dissolve)
            : c.lunge.victim.dead)
        ) {
          // Meal taken, victim freed or moment passed: slink back and submerge.
          const dx = c.lunge.homeX - c.x
          const dz = c.lunge.homeZ - c.z
          const d = Math.hypot(dx, dz)
          if (d < 0.3) c.lunge = undefined
          else {
            c.x += (dx / d) * Math.min(d, bc.lungeSpeed * 0.3 * dt)
            c.z += (dz / d) * Math.min(d, bc.lungeSpeed * 0.3 * dt)
            c.rot = Math.atan2(dx, dz)
          }
        } else if (!c.lunge.gripped) {
          // The burst: fast, short and visible — never a teleport.
          c.lunge.timer += dt
          const v = c.lunge.victim
          const tx = v.drink ? v.drink.tx : v.x
          const tz = v.drink ? v.drink.tz : v.z
          const dx = tx - c.x
          const dz = tz - c.z
          const d = Math.hypot(dx, dz)
          if (c.lunge.timer > 4) {
            c.lunge.retreat = true // the moment passed — back under
          } else if (d < 0.9) {
            // Seized AT the waterline: the victim struggles there through the
            // shared window while a parent may still charge in and save it.
            v.x = tx
            v.z = tz
            v.drink = undefined
            v.caught = CAUGHT_DURATION
            v.caughtBy = 'crocodile'
            c.lunge.gripped = true
            c.lunge.timer = 0 // restart the clock for the grip's hard deadline (point 186)
          } else {
            c.x += (dx / d) * bc.lungeSpeed * dt
            c.z += (dz / d) * bc.lungeSpeed * dt
            c.rot = Math.atan2(dx, dz)
          }
        } else {
          // Gripping — two coupled phases, the croc holding its victim throughout
          // (point 250), so the prey's removal is the croc's own feed:
          //  (1) STRUGGLE (caught still counting): hold the thrashing victim at
          //      the waterline. The point-186 hard deadline releases a VANISHED
          //      victim whose countdown froze (streamed out in a chunk despawn,
          //      taken by another system) so the drama can never pin the croc —
          //      the §19.8 "every started drama resolves" rule (invariant I4).
          //  (2) SINK (the kill resolved, caught cleared, the body dissolving in
          //      the water): the croc drags it under through the dissolve
          //      (design.md §19.16 — the river keeps the body, no bank carcass);
          //      the retreat branch above releases the croc only once the body is
          //      gone. The dissolve is self-bounded (CARCASS_DISSOLVE_SECONDS), so
          //      the grip deadline is not applied here (it would cut the croc loose
          //      mid-sink and re-decouple the carcass — the point-250 bug).
          const v = c.lunge.victim
          if (v.caught !== undefined) {
            c.lunge.timer += dt
            // Point 207(i): the grip deadline is a hard invariant — a timer past
            // it (while still struggling) means the release below failed.
            devAssert(c.lunge.timer <= bc.gripSeconds + 2, 'croc-grip-bounded', () => `grip ${c.lunge?.timer.toFixed(1)}s`)
            if (crocodileGripExpired(c.lunge.timer, bc.gripSeconds)) {
              c.lunge.retreat = true
            } else {
              c.x = v.x - Math.sin(c.rot) * 0.6
              c.z = v.z - Math.cos(c.rot) * 0.6
            }
          }
          // SINK phase (v.caught === undefined, v.dead): hold position over the
          // sinking body — no move, no deadline; released by the retreat branch.
        }
      }
    }

    // The burning of the steppe (design.md §19.8/§19.13, point 145a).
    {
      const f = FIRE_STATE
      if (f.mode === 'idle') {
        f.timer -= dt
        if (f.timer <= 0) {
          f.timer = FIRE_COOLDOWN_SECONDS
          // Ignite ahead of the traveller where the pure gate allows: cured
          // savanna grass in a fire zone, dry season only.
          const ang = hash(Math.round(pos.x), Math.round(pos.z), 5, seed) * Math.PI * 2
          const ix = pos.x + Math.sin(ang) * 45
          const iz = pos.z + Math.cos(ang) * 45
          const ill = worldToLatLon(ix, iz)
          const ter = sampleTerrain(ill.lat, ill.lon, seed)
          const zone = climateZoneAt(ill.lat, ill.lon, ter.elevation)
          if (ter.type === 'savanna' && grassFireEligible(zone, CURRENT_WEATHER.wetness)) {
            f.mode = 'burning'
            f.x = ix
            f.z = iz
            f.heading = hash(Math.round(ix), Math.round(iz), 6, seed) * Math.PI * 2
            f.front = 2
            f.victim = null
            f.keeper = null
          }
        }
      } else if (f.mode === 'burning') {
        f.front += FIRE_FRONT_SPEED * dt
        if (!f.victim) {
          // A calf standing just ahead of the line is caught by it.
          outer: for (const sp of CALF_HUNT_SPECIES) {
            for (const a of herds[sp]) {
              // The fire never claims a calf another drama already owns (point
              // 197, the 194 seam): the lion's chase victim, a crossing calf.
              if (a.dead || !a.young || claimedByAnotherDrama({ ...a, isLionVictim: a === LION_STATE.victim }))
                continue
              const rx = a.x - f.x
              const rz = a.z - f.z
              const along = rx * Math.sin(f.heading) + rz * Math.cos(f.heading)
              const across = Math.abs(rx * Math.cos(f.heading) - rz * Math.sin(f.heading))
              if (across < FIRE_HALF_WIDTH && along > f.front - 1 && along < f.front + 2.5) {
                a.fireTrapped = FIRE_TRAP_SECONDS
                f.victim = a
                const par = a.parent
                if (par && !par.dead) f.keeper = par
                break outer
              }
            }
          }
        }
        if (f.victim && !f.victim.dead && f.victim.fireTrapped !== undefined) {
          f.victim.fireTrapped -= dt
          if (f.victim.fireTrapped <= 0) {
            f.victim.fireTrapped = undefined
            takeAnimal(f.victim, { stain: true }) // the burn mark where it fell
          }
        }
        // The parent goes in after it — surrender, alive or already lost.
        if (f.keeper && !f.keeper.dead && f.victim) {
          const dx = f.victim.x - f.keeper.x
          const dz = f.victim.z - f.keeper.z
          const d = Math.hypot(dx, dz) || 1
          f.keeper.x += (dx / d) * FIRE_PLUNGE_SPEED * dt
          f.keeper.z += (dz / d) * FIRE_PLUNGE_SPEED * dt
          if (d < 1.2) {
            takeAnimal(f.keeper, { stain: true })
            f.keeper = null
          }
        }
        if (f.front >= FIRE_MAX_FRONT) {
          // The line burns out: the drama ALWAYS resolves (point 118) — a
          // still-struggling calf is released singed, an unarrived keeper's
          // grief passes and it rejoins its herd.
          if (f.victim && !f.victim.dead && f.victim.fireTrapped !== undefined) f.victim.fireTrapped = undefined
          f.victim = null
          f.keeper = null
          f.mode = 'smoulder'
          f.timer = FIRE_SMOULDER_SECONDS
        }
      } else {
        f.timer -= dt
        if (f.timer <= 0) {
          f.mode = 'idle'
          f.timer = FIRE_COOLDOWN_SECONDS
        }
      }
      // Render the line and the blackened band behind it.
      const flames = fireFlames.current
      const band = fireBand.current
      if (flames) {
        flames.visible = f.mode === 'burning'
        if (flames.visible) {
          const fx = f.x + Math.sin(f.heading) * f.front
          const fz = f.z + Math.cos(f.heading) * f.front
          for (let i = 0; i < FIRE_FLAME_COUNT; i++) {
            const off = ((i / (FIRE_FLAME_COUNT - 1)) * 2 - 1) * FIRE_HALF_WIDTH
            const x = fx + Math.cos(f.heading) * off
            const z = fz - Math.sin(f.heading) * off
            const ll2 = worldToLatLon(x, z)
            const g = Math.max(0.02, sampleTerrain(ll2.lat, ll2.lon, seed).height)
            const flick = 0.75 + Math.abs(Math.sin(clock.elapsedTime * 9 + i * 1.7)) * 0.5
            vpos.set(x, g + 0.7 * flick, z)
            euler.set(0, f.heading + Math.PI / 2, 0)
            quat.setFromEuler(euler)
            vscl.set(0.9, flick, 1)
            mtx.compose(vpos, quat, vscl)
            flames.setMatrixAt(i, mtx)
          }
          flames.count = FIRE_FLAME_COUNT
          flames.instanceMatrix.needsUpdate = true
        }
      }
      if (band) {
        band.visible = f.mode !== 'idle'
        if (band.visible) {
          // Terrain-following strip (point 196): one long plane at the midpoint
          // height clipped into rising ground and floated over falling ground —
          // each segment sits at its own sampled ground height instead.
          const segLen = f.front / FIRE_BAND_SEGMENTS
          for (let i = 0; i < FIRE_BAND_SEGMENTS; i++) {
            const along = (i + 0.5) * segLen
            const sx = f.x + Math.sin(f.heading) * along
            const sz = f.z + Math.cos(f.heading) * along
            const ll3 = worldToLatLon(sx, sz)
            const g = Math.max(0.02, sampleTerrain(ll3.lat, ll3.lon, seed).height)
            vpos.set(sx, g + 0.06, sz)
            euler.set(-Math.PI / 2, 0, -f.heading, 'XYZ')
            quat.setFromEuler(euler)
            vscl.set(FIRE_HALF_WIDTH * 2, segLen * 1.08, 1) // slight overlap hides the steps
            mtx.compose(vpos, quat, vscl)
            band.setMatrixAt(i, mtx)
          }
          band.count = FIRE_BAND_SEGMENTS
          band.instanceMatrix.needsUpdate = true
          fireBandMat.opacity = f.mode === 'smoulder' ? 0.8 * (f.timer / FIRE_SMOULDER_SECONDS) : 0.8
        }
      }
    }

    // The broken-wing lure (design.md §19.8, point 145b): a threat close to
    // a plover's nest starts the act — the bird drags itself conspicuously
    // away in front of the threat, wing trailed as if broken; past the safe
    // distance (or when the act has run its time) it recovers and flies
    // home. The one sacrifice that is a lie — and near a predator the lie
    // sometimes fails at the recovery moment.
    {
      const lionActive2 = LION_STATE.mode === 'chase' || LION_STATE.mode === 'feed'
      for (const a of herds.plover) {
        if (a.dead || !a.nest || a.young) continue
        const dPlayerNest = Math.hypot(pos.x - a.nest.x, pos.z - a.nest.z)
        const dLionNest = lionActive2 ? Math.hypot(LION_STATE.lx - a.nest.x, LION_STATE.lz - a.nest.z) : Infinity
        const threatIsLion = dLionNest < dPlayerNest
        const tx2 = threatIsLion ? LION_STATE.lx : pos.x
        const tz2 = threatIsLion ? LION_STATE.lz : pos.z
        const dThreatNest = Math.min(dPlayerNest, dLionNest)
        if (!a.lure) {
          // The act does not loop at a standing threat: after a lure the
          // bird sits alert at its nest through a cooldown.
          if (a.lureCooldown !== undefined) {
            a.lureCooldown -= dt
            if (a.lureCooldown <= 0) a.lureCooldown = undefined
          } else if (ploverShouldLure(dThreatNest)) {
            const side = a.phase < 0.5 ? 1 : -1
            a.lure = { timer: 0, heading: ploverLureHeading(a.nest.x, a.nest.z, tx2, tz2, side), returning: false }
          }
          continue
        }
        a.lure.timer += dt
        if (!a.lure.returning) {
          // The conspicuous drag: slow, weaving, wing trailed (render pose).
          a.x += Math.sin(a.lure.heading + Math.sin(clock.elapsedTime * 6 + a.phase * 9) * 0.5) * 1.3 * dt
          a.z += Math.cos(a.lure.heading + Math.sin(clock.elapsedTime * 6 + a.phase * 9) * 0.5) * 1.3 * dt
          a.rot = a.lure.heading
          if (ploverLureResolve(a.lure.timer, dThreatNest) === 'return') {
            // The recovery moment: near a predator the lie sometimes fails.
            const dPred = lionActive2 ? Math.hypot(LION_STATE.lx - a.x, LION_STATE.lz - a.z) : Infinity
            const roll = Math.abs(Math.sin(a.phase * 127.1 + a.x * 311.7 + a.z * 74.7)) % 1
            if (ploverTaken(roll, dPred < 3)) {
              takeAnimal(a, { stain: true })
              a.lure = undefined
              continue
            }
            a.lure.returning = true
          }
        } else {
          // Fly home in a low arc; the act is over when it lands at the nest.
          const dx = a.nest.x - a.x
          const dz = a.nest.z - a.z
          const d = Math.hypot(dx, dz)
          if (d < 0.4) {
            a.lure = undefined
            a.lureCooldown = 25
          } else {
            a.x += (dx / d) * 6 * dt
            a.z += (dz / d) * 6 * dt
            a.rot = Math.atan2(dx, dz)
          }
        }
      }
    }

    // Walking into a crocodile routes through the EXISTING §14.2 event
    // (machete always protects, rifle only from the canoe) exactly like the
    // wandering-predator contact — no new attack path (point 130 (e)).
    {
      for (const c of herds.crocodile) {
        if (c.dead) continue
        if (Math.hypot(c.x - pos.x, c.z - pos.z) < 1.6) {
          useGame.getState().predatorContact('crocodile')
          break
        }
      }
    }

    // Proximity animal calls for the ambience (design.md §19): report the
    // nearest live animal of each voice group so their sounds rise as the
    // player draws near, all under the single ambience volume.
    {
      const near = { elephant: 0, lion: 0, grazer: 0, flock: 0 }
      const consider = (dx: number, dz: number, key: keyof typeof near) => {
        near[key] = Math.max(near[key], proximityGain(Math.hypot(dx, dz)))
      }
      for (const a of herds.elephant) if (!a.dead) consider(a.x - pos.x, a.z - pos.z, 'elephant')
      for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog', 'giraffe'] as const)
        for (const a of herds[sp]) if (!a.dead) consider(a.x - pos.x, a.z - pos.z, 'grazer')
      for (const a of herds.flamingo) if (!a.dead) consider(a.x - pos.x, a.z - pos.z, 'flock')
      if (LION_STATE.mode === 'chase' || LION_STATE.mode === 'feed')
        consider(LION_STATE.lx - pos.x, LION_STATE.lz - pos.z, 'lion')
      setAmbienceAnimals(near)
    }

    ASSERT_TICK = (ASSERT_TICK + 1) % 13
    const t = clock.elapsedTime
    // Point 193: 'leave' counts as ACTIVE for the prey — the walking-off
    // predator is still a visible lion on the field, and prey grazing calmly
    // beside it read as a broken standoff (the user report: predator and prey
    // standing idle next to each other). Herds part around the leave path and
    // calves hold their play until it is truly gone.
    const lionActive =
      LION_STATE.mode === 'chase' || LION_STATE.mode === 'feed' || LION_STATE.mode === 'leave'

    // Elephants roam as herds (design.md §19): each herd shares a heading that
    // curves in slow arcs; its members keep together (cohesion) and only ever
    // move forward. They do not hunt — a smaller animal is trampled only if it
    // is in the herd's path and dodges too late. First aggregate each live
    // herd's centre and advance its shared heading.
    const herdCentre = new Map<number, { cx: number; cz: number; heading: number }>()
    {
      const sum = new Map<number, { sx: number; sz: number; n: number }>()
      for (const a of herds.elephant) {
        if (a.dead || a.herd === undefined) continue
        const agg = sum.get(a.herd) ?? { sx: 0, sz: 0, n: 0 }
        agg.sx += a.x
        agg.sz += a.z
        agg.n++
        sum.set(a.herd, agg)
      }
      for (const [hid, agg] of sum) {
        const ccx = agg.sx / agg.n
        const ccz = agg.sz / agg.n
        let st = herdState.current.get(hid)
        if (!st) {
          st = { heading: hash(hid, 0, 7, seed) * Math.PI * 2, phase: hash(hid, 0, 8, seed) * Math.PI * 2 }
          herdState.current.set(hid, st)
        }
        // The mourning vigil (design.md §19.8, point 126): the nearest mourn
        // target is the graveyard's bones or a dead herd-mate — generic over
        // the target; no path kills an elephant today, but the drowning/mire
        // dramas may later. A herd whose centre comes inside the draw radius
        // is drawn in once per visit (the `mourned` latch clears only after
        // it has left the radius), and the vigil's deadline grants the
        // walk-in on top of the hold window, so it ALWAYS resolves — never a
        // herd pinned at the bones (point-118 lesson). A vigil, not a
        // sacrifice: nothing dies of it.
        const bm = balance.mourn
        let tgX = GRAVEYARD_POS.x
        let tgZ = GRAVEYARD_POS.z
        let tgD = Math.hypot(tgX - ccx, tgZ - ccz)
        for (const m of herds.elephant) {
          if (!m.dead || m.herd !== hid) continue
          const d = Math.hypot(m.x - ccx, m.z - ccz)
          if (d < tgD) {
            tgD = d
            tgX = m.x
            tgZ = m.z
          }
        }
        if (st.mourn && t >= st.mourn.until) {
          st.mourn = undefined
          st.mourned = true // vigil over — move on; not again until the herd has left the radius
        }
        if (!st.mourn && shouldMourn(tgD, bm.radius, st.mourned === true)) {
          st.mourn = { x: tgX, z: tgZ, until: mournDeadline(t, tgD, bm.seconds, ELEPHANT_SPEED) }
        }
        if (st.mourned && tgD > bm.radius) st.mourned = undefined
        if (st.mourn) {
          // Steer the shared heading toward the bones through the same gentle
          // turn cap as the roam — an arc into the site, never a snap.
          const toX = st.mourn.x - ccx
          const toZ = st.mourn.z - ccz
          if (Math.hypot(toX, toZ) > 1) st.heading = turnToward(st.heading, Math.atan2(toX, toZ), ELEPHANT_TURN * dt)
        } else {
          st.heading += Math.sin(t * 0.08 + st.phase) * ELEPHANT_HERD_ARC * dt
          // Steer the herd away from ground it cannot cross (ahead of its
          // centre) — but only while it STANDS on its own biome: a herd whose
          // vigil ended amid the graveyard's foreign ground sees foreign land
          // in every direction, and this steer would spin the heading forever
          // (members walking tiny circles, the herd pinned — the measured
          // released:false). Standing on foreign ground the escape rule of
          // elephantStepAllowed lets the members walk, so the roam heading
          // simply carries the herd out.
          const cll = worldToLatLon(ccx, ccz)
          const ct = sampleTerrain(cll.lat, cll.lon, seed).type
          const fll = worldToLatLon(ccx + Math.sin(st.heading) * 9, ccz + Math.cos(st.heading) * 9)
          const ft = sampleTerrain(fll.lat, fll.lon, seed).type
          if ((ct === 'savanna' || ct === 'jungle') && ft !== 'savanna' && ft !== 'jungle')
            st.heading += ELEPHANT_TURN * 2 * dt
        }
        herdCentre.set(hid, { cx: ccx, cz: ccz, heading: st.heading })
      }
    }
    // Shared water/ocean blocked-step predicate for the deflected flight steps
    // (points 201/197 — the same shape the calf flee uses).
    const waterBlockedAt = (nx: number, nz: number) => {
      const ll = worldToLatLon(nx, nz)
      const ty = sampleTerrain(ll.lat, ll.lon, seed).type
      return ty === 'ocean' || ty === 'water'
    }
    // A flying bird crosses river/lake water freely — only the open ocean
    // deflects its shy flight (design.md §19).
    const oceanBlockedAt = (nx: number, nz: number) => {
      const ll = worldToLatLon(nx, nz)
      return sampleTerrain(ll.lat, ll.lon, seed).type === 'ocean'
    }
    // Raw terrain type at a world point — the shape fleeCrossing/crossingTarget
    // probe the channel with (point 192).
    const terrainTypeAtWorld = (nx: number, nz: number) => {
      const ll = worldToLatLon(nx, nz)
      return sampleTerrain(ll.lat, ll.lon, seed).type
    }
    // The traveller as a threat source for the player-shy flight (design.md
    // §19): fed into the SAME fleeHeading/held-heading machinery as the
    // elephant dodge — never a second oscillation-prone path.
    const playerThreat: Array<readonly [number, number]> = [[pos.x, pos.z]]
    // Staged §19.16 bank victim (point 247): a crocodile's current lunge
    // target, or a drinker whose bank spot lies inside a lurking crocodile's
    // strike radius (the same distance the lunge trigger measures) — the only
    // drinkers the narrowed player-shy exemption still holds at their stand.
    const stagedBankVictim = (a: Animal): boolean => {
      if (a.drink === undefined) return false
      const strike = balance.crocodile.strikeRadius
      for (const c of herds.crocodile) {
        if (c.lunge !== undefined && c.lunge.victim === a) return true
        if (!c.dead && Math.hypot(a.drink.tx - c.x, a.drink.tz - c.z) <= strike) return true
      }
      return false
    }
    const elephantPos: Array<[number, number]> = []
    // Parallel to elephantPos: this frame's movement vector per elephant (0,0
    // when it held). Drives the trample DIRECTION condition (trampleKills,
    // point 259) — a standing elephant tramples nothing.
    const elephantVel: Array<[number, number]> = []
    // This frame's movement vector per elephant, keyed by the animal, so the
    // point-261 body collider can read the SAME velocity the trample uses and
    // EXEMPT an animal this elephant would trample this step (point 263).
    const elephantVelMap = new Map<Animal, [number, number]>()
    {
      const list = herds.elephant
      const n = Math.min(list.length, MAX_INSTANCES.elephant)
      for (let i = 0; i < n; i++) {
        const a = list[i]
        if (a.dead) continue
        const ex0 = a.x
        const ez0 = a.z
        if (a.heading === undefined) a.heading = a.rot
        const info = a.herd !== undefined ? herdCentre.get(a.herd) : undefined
        const mournInfo = a.herd !== undefined ? herdState.current.get(a.herd)?.mourn : undefined
        // Follow the herd heading; steer back toward the centre if drifting off.
        let desired = a.heading
        let mournHold = false
        if (mournInfo) {
          // The mourning vigil (point 126): each elephant walks to the bones
          // on its own arc — the same gentle turn cap as the roam, applied
          // below, so the approach never snaps — and halts a staggered step
          // short of them (the herd rings the site instead of piling onto one
          // point), still turning softly to face the bones while it holds.
          const toTx = mournInfo.x - a.x
          const toTz = mournInfo.z - a.z
          const dT = Math.hypot(toTx, toTz)
          if (dT > 1e-3) desired = Math.atan2(toTx, toTz)
          mournHold = dT <= MOURN_STAND_DIST + a.phase * 0.25
        } else if (info) {
          const toCx = info.cx - a.x
          const toCz = info.cz - a.z
          desired = Math.hypot(toCx, toCz) > ELEPHANT_COHESION ? Math.atan2(toCx, toCz) : info.heading
        } else {
          desired = a.heading + Math.sin(t * 0.1 + a.phase * 5) * 0.4
        }
        // If the ground just ahead cannot be crossed, redirect the desired
        // heading toward the herd (or away) — but still turn only gently.
        // The ground the elephant itself stands on: standing on foreign land
        // (e.g. the graveyard's dry ground after a vigil) unlocks any land
        // step, so the herd can always walk free (point 126).
        const standLL = worldToLatLon(a.x, a.z)
        const standT = sampleTerrain(standLL.lat, standLL.lon, seed).type
        const aheadLL = worldToLatLon(a.x + Math.sin(a.heading) * 6, a.z + Math.cos(a.heading) * 6)
        const aheadT = sampleTerrain(aheadLL.lat, aheadLL.lon, seed).type
        if (!elephantStepAllowed(aheadT, mournInfo !== undefined, standT)) {
          // The ground ahead is uncrossable (a shore/water edge). DEFLECT ALONG it
          // to the nearest crossable heading (point 180) instead of only turning
          // toward the herd centre: at a lake shore the centre sits AT the crowded
          // water's edge, so that turn gave no tangential escape and the members
          // wedged — separation shoves some onto a water cell, the backstop snaps
          // them straight back to the same bank, cohesion re-crowds them. deflected-
          // Step sweeps +/-90 deg for a heading whose step AND lookahead are dry.
          const blockedStep = (bx: number, bz: number): boolean => {
            const bll = worldToLatLon(bx, bz)
            return !elephantStepAllowed(sampleTerrain(bll.lat, bll.lon, seed).type, mournInfo !== undefined, standT)
          }
          const def = deflectedStep(a.x, a.z, a.heading, ELEPHANT_SPEED * dt, blockedStep, 6)
          if (def.moved) {
            desired = def.heading
          } else {
            // Fully boxed in — keep the herd redirect / turn until a way opens.
            // (info being this animal itself: atan2(0,0) would pin `desired` due
            // north forever, freezing it at a border, so keep turning instead.)
            const dcx = info ? info.cx - a.x : 0
            const dcz = info ? info.cz - a.z : 0
            desired = info && Math.hypot(dcx, dcz) > 0.5 ? Math.atan2(dcx, dcz) : a.heading + Math.PI * 0.6
          }
        }
        let dh = desired - a.heading
        while (dh > Math.PI) dh -= Math.PI * 2
        while (dh < -Math.PI) dh += Math.PI * 2
        // Gentle arc only — clamp the per-frame turn (never a sharp turn).
        a.heading += Math.max(-ELEPHANT_TURN * dt, Math.min(ELEPHANT_TURN * dt, dh))
        // An arrived mourner stands at the bones (point 126) — no step, only
        // the soft turn above; the vigil's deadline moves it on again.
        if (!mournHold) {
          const nx = a.x + Math.sin(a.heading) * ELEPHANT_SPEED * dt
          const nz = a.z + Math.cos(a.heading) * ELEPHANT_SPEED * dt
          const ll = worldToLatLon(nx, nz)
          const ter = sampleTerrain(ll.lat, ll.lon, seed)
          if (elephantStepAllowed(ter.type, mournInfo !== undefined, standT)) {
            a.x = nx
            a.z = nz
            a.y = Math.max(0.02, ter.height)
          }
          // Else hold position this frame and keep turning gently next frame.
        }
        elephantPos.push([a.x, a.z])
        elephantVel.push([a.x - ex0, a.z - ez0])
        elephantVelMap.set(a, [a.x - ex0, a.z - ez0])
      }
    }

    // Elephant body collider (design.md §19.5, point 261): an elephant is a
    // SOLID obstacle to every OTHER animal's locomotion. Each non-elephant
    // animal's whole step this frame (frame-start → now) is swept around every
    // live elephant body so it slides AROUND the body instead of walking through
    // it — the grief parent must ROUTE AROUND the body to reach the front
    // (points 259/261), and no animal clips an elephant in general. The collider
    // radius is the elephant body radius alone (no self radius added), so a
    // deflected animal rests AT the body edge — still inside the wider
    // TRAMPLE_RADIUS (1.5 > 1.3), so the designed §19.5 trample and the
    // grief-crush at the front are never blocked. The elephant's own movement
    // (its trample step) is never deflected here — only the other animals'.
    // A trample the elephant is ABOUT to make is EXEMPT (point 263): an animal
    // this elephant would trample this step (in range AND moving toward it) is
    // NOT slid around the body, or the lateral deflection would rotate the
    // elephant→victim vector perpendicular to the elephant's velocity and the
    // point-259 directional trample could never fire — so the elephant would
    // catch nothing, no stain would be laid and the §19.8 calf-trample grief
    // chain could not start. Each body carries this frame's elephant velocity.
    {
      const bodies: Array<[number, number, number, number, number]> = []
      for (const e of herds.elephant) {
        if (e.dead) continue
        const v = elephantVelMap.get(e) ?? [0, 0]
        bodies.push([e.x, e.z, BODY_RADIUS.elephant * e.scale, v[0], v[1]])
      }
      if (bodies.length > 0) {
        for (const sp of SPECIES) {
          if (sp === 'elephant') continue
          for (const a of herds[sp]) {
            if (a.dead) continue
            const from = stepFrom.get(a)
            if (from === undefined) continue
            let nx = a.x
            let nz = a.z
            // deflectAroundCircle returns the step unchanged when it never
            // touches a body, so a far grazer is untouched; only a step that
            // would enter a body is slid to its edge (never a dead stop) —
            // UNLESS this elephant is about to trample the animal (point 263),
            // in which case the step lands and the trample catches it.
            for (const [ex, ez, r, evx, evz] of bodies) {
              if (elephantWouldTrample(evx, evz, ex, ez, nx, nz, TRAMPLE_RADIUS)) continue
              ;[nx, nz] = deflectAroundCircle(from[0], from[1], nx, nz, ex, ez, r)
            }
            if (nx !== a.x || nz !== a.z) {
              a.x = nx
              a.z = nz
              // Ground-follow (point 203(A)): carry the standing height onto the
              // slid spot; land only, water occupants are owned by their dramas.
              const gfl = worldToLatLon(a.x, a.z)
              const gft = sampleTerrain(gfl.lat, gfl.lon, seed)
              if (gft.type !== 'water' && gft.type !== 'ocean') a.y = Math.max(0.02, gft.height)
            }
          }
        }
      }
    }

    // Scavenging (design.md §19): a carcass that was not eaten by the lion
    // (e.g. trampled) draws a vulture that flies in, lands and consumes it —
    // the carcass dissolves piece by piece as a lion kill does, then is
    // removed. One scavenger works the nearest carcass at a time. The bird
    // never pops in or out of the picture: it spawns beyond the zoom-aware
    // view ring, flies in, and after the meal flies off and despawns only
    // well outside the view again (design.md §19).
    {
      // Every eligible carcass (not a lion's own kill, not a hunt remnant, not
      // vigil-guarded) is a candidate — collected once, then handed out to the
      // flock POOL so each carcass owns its own flock (point 251).
      const eligible: Animal[] = []
      for (const sp of SPECIES) {
        for (const a of herds[sp]) {
          if (!a.dead || a.lionFed) continue // the on-scene predator eats its own kill
          if (a.remnant) continue // hunt scraps belong to the circling kill flock
          if (a.gone) continue
          if (a.dissolve !== undefined && a.dissolve <= 0) continue
          // The vigil (point 121): never commit to a guarded carcass.
          if (vigilBlocksLanding(nearestVigilKeeperDist(herds, a.x, a.z))) continue
          eligible.push(a)
        }
      }
      const flocks = scavengers.current
      // Per-carcass ownership (point 251): keep each flock on its carcass, free
      // a flock whose carcass is gone (it flies off — no hop), and give a free
      // idle flock the nearest still-unowned carcass. N carcasses -> N flocks.
      const nextTargets = assignPerCarcassFlocks(
        flocks.map((f) => ({ target: f.target, available: f.mode === 'idle' })),
        eligible,
        (a) => Math.hypot(a.x - pos.x, a.z - pos.z),
      )
      SCAV_CLEARANCE.v = Infinity
      for (let si = 0; si < flocks.length; si++) {
        const sc = flocks[si]
        sc.target = nextTargets[si]
        const sg = scavengeGroups.current[si]
        const target = sc.target
        flightStep(
          sc,
          target !== null,
          target ? target.x : sc.x,
          target ? target.z : sc.z,
          pos.x,
          pos.z,
          viewR,
          VULTURE_SCAVENGE_SPEED,
          dt,
          0.6,
          (x, z) => !isOnScreen(x, z), // spawn OFF the rendered frame, fly in (point 178)
        )
        sc.landed = sc.mode === 'active' && target !== null
        if (!sg) continue
        sg.visible = sc.mode !== 'idle'
        if (sc.mode === 'idle') {
          sc.landed = false
          continue
        }
        if (sc.landed && target) {
          sc.x = target.x
          sc.z = target.z
          // Group origin ON the carcass ground (point 185) — exactly the kill
          // flock's killGroundY. The shared landedBirdY rule below lifts each
          // bird to its OWN sampled ground and adds LANDED_BIRD_HOVER to clear
          // the pecking body; the old +0.5 group pre-lift DOUBLED that clearance
          // and floated the flock ~0.5 above the carcass it feeds on.
          const scll = worldToLatLon(sc.x, sc.z)
          sc.y = Math.max(0, sampleTerrain(scll.lat, scll.lon, seed).height)
          if (target.dissolve === undefined) target.dissolve = CARCASS_DISSOLVE_SECONDS
          target.dissolve -= dt
        } else if (target && sc.mode === 'in') {
          // Glide down toward the carcass as the approach closes.
          const d = Math.hypot(target.x - sc.x, target.z - sc.z)
          sc.y = target.y + 0.4 + Math.min(1, d / 40) * 13
        } else {
          sc.y = Math.min(14, sc.y + 6 * dt) // climbing away
        }
        sg.position.set(sc.x, sc.y, sc.z)
        sg.children.forEach((bird, i) => {
          const ph = (i / sg.children.length) * Math.PI * 2 + si // per-flock phase offset
          if (sc.landed) {
            const r = 0.5 + i * 0.35
            const bx = Math.cos(ph) * r
            const bz = Math.sin(ph) * r
            // The shared landed-bird rule (points 128 + 202 + 217): positive-only
            // lift onto the HIGHEST ground under the bird's EXTENTS (wing tips +
            // pecking head, not just the centre), clearance from the POSED lowest
            // point — head AND the spread WING TIPS under the pitch/yaw pose (a
            // wing tip on the yaw's low side swings deeper than the head; point
            // 217's reported wing-through-ground clip).
            const pitch = 0.45 + Math.abs(Math.sin(t * 4 + ph)) * 0.3
            let bg = 0
            for (const [ox, oz] of birdExtentOffsets(ph, 1.5)) {
              const bll = worldToLatLon(sc.x + bx + ox, sc.z + bz + oz)
              bg = Math.max(bg, sampleTerrain(bll.lat, bll.lon, seed).height)
            }
            const hop = Math.abs(Math.sin(t * 3 + ph)) * 0.1
            bird.position.set(bx, landedBirdYPosed(sc.y, bg, hop, pitch, ph, 1.5), bz)
            SCAV_CLEARANCE.v = Math.min(SCAV_CLEARANCE.v, landedBirdClearancePosed(sc.y, bg, hop, pitch, ph, 1.5))
            bird.rotation.set(pitch, ph, 0) // heads pecking down
          } else {
            const a2 = t * 0.6 + ph
            bird.position.set(Math.cos(a2) * 2.4, 1.6 + i * 0.6, Math.sin(a2) * 2.4)
            bird.rotation.set(0, -a2 - Math.PI / 2, 0.2)
          }
          bird.scale.setScalar(1.5)
        })
      }
    }

    for (const sp of SPECIES) {
      const mesh = meshRefs.current[sp]
      if (!mesh) continue
      const list = herds[sp]
      const n = Math.min(list.length, MAX_INSTANCES[sp])
      // Juveniles divert into their own baby-schema instanced mesh (design.md
      // §19); adults and calves keep separate instance counters.
      const calfMesh = calfMeshRefs.current[sp]
      let aIdx = 0
      let cIdx = 0
      const write = (a: Animal) => {
        if (a.young && calfMesh) {
          if (cIdx < MAX_CALF_INSTANCES) calfMesh.setMatrixAt(cIdx++, mtx)
        } else {
          mesh.setMatrixAt(aIdx++, mtx)
        }
      }
      let eIdx = 0
      for (let i = 0; i < n; i++) {
        const a = list[i]
        if (a.dead) {
          // Trampled: lies on its side where it was caught, over a stain; once
          // a scavenger lands the carcass shrinks away (design.md §19).
          const df = a.dissolve === undefined ? 1 : Math.max(0, a.dissolve / CARCASS_DISSOLVE_SECONDS)
          euler.set(0, a.rot, Math.PI / 2.15)
          quat.setFromEuler(euler)
          vpos.set(a.x, Math.max(0.02, a.y), a.z)
          vscl.setScalar(a.scale * df)
          mtx.compose(vpos, quat, vscl)
          write(a)
          continue
        }
        const wob = Math.sin(t * 0.25 + a.phase)
        let px: number
        let pz: number
        // The idle shuffle is a render offset ADDED after the behaviours with
        // a BLENDED amplitude (wobTarget per behaviour): switching it on/off
        // per branch popped the rendered position at every behaviour change.
        let wobTarget = sp === 'elephant' ? 0 : 0.8
        if (sp === 'elephant') {
          ;[px, pz] = elephantPos[eIdx++]
        } else {
          px = a.x
          pz = a.z
        }
        // Desired heading this frame; the branches below overwrite it. An
        // elephant faces its line of travel (it walks its own heading), all
        // others idle at their resting orientation with a slow shuffle.
        const idleYaw = sp === 'elephant' ? (a.heading ?? a.rot) : a.rot + wob * 0.4
        let yaw = idleYaw
        let pitch = 0
        let bodyY = a.y
        // The crocodile (design.md §19.16, points 130/242/250): sunk to the eye
        // knobs — the armoured back UNDER the water sheet — while hidden, slinking
        // home, or dragging a kill under as it sinks; riding fully out only during
        // the live STRIKE at prey. bodyY comes from the shared crocodileBodyY so
        // the submerge depth stays tied to the mesh (the old inline 0.24 left the
        // back riding above the water — the exposed prop the user hit, point 242).
        if (sp === 'crocodile') {
          wobTarget = 0
          const hidden = a.lunge === undefined
          const striking = a.lunge !== undefined && !a.lunge.retreat && !(a.lunge.victim?.dead ?? false)
          // Subtle idle life (point 242) only while fully at rest: a slow float
          // bob and a few-degree yaw sway so a hidden croc never reads as a frozen
          // prop. The sway is a BOUNDED oscillation about a FIXED rest heading
          // (point 257) — captured once here, never the live `a.rot`: with yaw set
          // to `a.rot + sway` the facing-steer below wrote the swayed heading back
          // into a.rot, so the sway summed frame over frame into a full-circle
          // rotation (the reported "croc slowly spins"). Anchoring to restYaw keeps
          // it an absolute value that returns to centre; a hidden croc WAITS, it
          // does not roam (§19.16). The bob/sway are dropped mid-attack or mid-sink.
          if (hidden) {
            if (a.restYaw === undefined) a.restYaw = a.rot
            yaw = crocodileIdleYaw(a.restYaw, t, a.phase)
            bodyY = crocodileBodyY(a.y, true) + Math.sin(t * 0.5 + a.phase * 6.283) * 0.008
          } else {
            a.restYaw = undefined
            yaw = a.rot
            bodyY = crocodileBodyY(a.y, !striking)
          }
        }
        // The broken-wing act (point 145b): the luring plover tilts hard onto
        // one wing and flutters; the return flight lifts it in a low arc.
        if (sp === 'plover' && a.lure) {
          wobTarget = 0
          yaw = a.rot
          if (a.lure.returning) {
            bodyY = a.y + 1.2 + Math.sin(clock.elapsedTime * 4 + a.phase) * 0.2
          } else {
            pitch = 0.25
            bodyY = a.y + 0.02
          }
        }
        // The mourning vigil (design.md §19.8, point 126): an elephant
        // standing at the bones lowers its head to them — the same head-down
        // pitch the drink pose uses, with a slow searching sway of the touch.
        if (sp === 'elephant' && a.herd !== undefined) {
          const mst = herdState.current.get(a.herd)?.mourn
          if (mst && Math.hypot(mst.x - a.x, mst.z - a.z) < MOURN_TOUCH_DIST) {
            pitch = 0.42 + Math.sin(t * 0.6 + a.phase) * 0.06
          }
        }
        // Periodic drinking (design.md §19): walk to the shore point, lower
        // the head at the water, walk back. Bathers wade further in and dip
        // their body (a splashing wallow) instead of only lowering the head.
        if (a.drink && sp !== 'elephant') {
          const cycle = ((t + a.phase * 40) % 75) / 75
          if (cycle < 0.5) {
            wobTarget = 0.2
            const k = cycle < 0.12 ? cycle / 0.12 : cycle < 0.38 ? 1 : (0.5 - cycle) / 0.12
            // The target itself sits at the bank (a bather's a step into the
            // shallow edge) — never overshoot toward the channel.
            const toX = a.drink.tx - px
            const toZ = a.drink.tz - pz
            px += toX * k
            pz += toZ * k
            // Stand on the ground under the RENDERED spot (point 196): bodyY
            // kept the spawn-spot ground, so a lower/higher bank floated or
            // buried the drinker — and an endpoint lerp buried it under any
            // ridge on the way, so sample per frame. Over the water's edge a
            // bather rides the sheet chest-deep.
            {
              const dll = worldToLatLon(px, pz)
              const dter = sampleTerrain(dll.lat, dll.lon, seed)
              bodyY =
                dter.type === 'water'
                  ? sheetAnchorY(waterSurfaceY(dll.lat, dll.lon, seed, dter.height), dter.height, 0.32)
                  : Math.max(0.02, dter.height)
            }
            if (k > 0.04) yaw = Math.atan2(toX, toZ) + (cycle >= 0.38 ? Math.PI : 0)
            if (cycle >= 0.12 && cycle < 0.38) {
              if (a.bathe) bodyY += Math.sin(t * 3 + a.phase) * 0.05 // wallow/splash
              else pitch = 0.42 + Math.sin(t * 1.4 + a.phase) * 0.08
            }
          }
        }
        // Family life (design.md §19): a calf keeps close to its parent and
        // nurses; when a hunt runs a calf down the parent shields it — holding
        // itself between hunter and young to be taken in its place — and a
        // caught calf struggles for a few seconds during which the parent's
        // charge can still save it; otherwise a parent stands between an
        // approaching predator and its calf to defend it. These override the
        // flee/dodge below.
        let familyHeld = false
        if (sp !== 'elephant') {
          if ((a.caught !== undefined && a.caught > 0) || a.fireTrapped !== undefined) {
            // Caught by a predator (resolved in the full-list pre-pass above)
            // — or by the grass-fire line (point 145a), same thrash:
            // thrash in place — no stain or shrink yet — while a parent may
            // still reach the predator and save it (§19). Not young-gated:
            // the seized vigil-keeper (point 121 (f)) is the one ADULT that
            // can be caught, and it thrashes like any taken prey.
            px = a.x + Math.sin(t * 13 + a.phase) * 0.14
            pz = a.z + Math.cos(t * 11 + a.phase) * 0.14
            yaw = a.rot + Math.sin(t * 16 + a.phase) * 0.7
            pitch = Math.PI / 2.3 // thrown on its side, thrashing
            familyHeld = true
          } else if (a.crossing !== undefined) {
            // Purposeful water crossing (point 192, the user's water-rule
            // revision): swim straight for the far bank at the seasonal wade
            // speed, chest-deep ON the rendered surface; landing — or the
            // resolve deadline (invariant I4) — ends it.
            const c = a.crossing
            c.time += dt
            const cdx = c.tx - a.x
            const cdz = c.tz - a.z
            const cd = Math.hypot(cdx, cdz)
            const bw2 = balance.waterDrama
            const swim = wadeSpeed(CROSS_SWIM_SPEED, seasonFlowFactor(CURRENT_WEATHER.wetness, bw2.dryFlowFactor, bw2.wetFlowFactor))
            if (cd > 0.05) {
              a.x += (cdx / cd) * Math.min(cd, swim * dt)
              a.z += (cdz / cd) * Math.min(cd, swim * dt)
            }
            const cll2 = worldToLatLon(a.x, a.z)
            const ct2 = sampleTerrain(cll2.lat, cll2.lon, seed)
            const onLand = ct2.type !== 'water' && ct2.type !== 'ocean'
            if ((onLand && cd < 0.6) || c.time > balance.waterCross.resolveSeconds) {
              a.crossing = undefined
              a.y = Math.max(0.02, ct2.height)
            } else if (!onLand) {
              const ws2 = waterSurfaceY(cll2.lat, cll2.lon, seed, ct2.height)
              a.y = sheetAnchorY(ws2, ct2.height, 0.32) // chest-deep on the sheet
            } else {
              a.y = Math.max(0.02, ct2.height) // wading out over the bank
            }
            px = a.x
            pz = a.z
            yaw = Math.atan2(cdx, cdz)
            pitch = 0.08
            familyHeld = true
          } else if (a.kick !== undefined) {
            // The defence strike (design.md §19.8, points 124/125): every
            // parent that drove the hunt off stands its ground, tail to the
            // retreating predator, and throws its hind legs up in a brief
            // strike — front dips (positive pitch), rear flies, then settles.
            px = a.x
            pz = a.z
            // Render at the sim spot: resync bodyY to the maintained sim height.
            // A drink cycle this frame set bodyY to the low bank; a family branch
            // that discards the drink slide (rendering back at a.x,a.z) must reset
            // it, else the parent renders sunk under its own inland ground — the
            // buried-drinker the point-200 anchoring tripwire caught.
            bodyY = a.y
            yaw = Math.atan2(a.x - LION_STATE.lx, a.z - LION_STATE.lz)
            const strike = Math.min(1, Math.max(0, 1 - a.kick / PARENT_KICK_SECONDS))
            pitch = 0.55 * Math.sin(Math.PI * strike)
            familyHeld = true
          } else if (a.child && !a.child.dead && a.child.caught !== undefined && a.child.caught > 0) {
            // Charging the predator eating our calf (movement in the pre-pass):
            // face the calf while rushing in.
            px = a.x
            pz = a.z
            bodyY = a.y // resync off any drink slide (see the kick branch)
            yaw = Math.atan2(a.child.x - a.x, a.child.z - a.z)
            pitch = 0
            familyHeld = true
          } else if (a.young && a.inWater !== undefined && !a.rescued) {
            // Struggling in open water (design.md §19): low in the water,
            // thrashing — movement (drift) happens in the water pre-pass.
            px = a.x + Math.sin(t * 9 + a.phase) * 0.12
            pz = a.z + Math.cos(t * 8 + a.phase) * 0.12
            yaw = a.rot + Math.sin(t * 10 + a.phase) * 0.6
            bodyY = a.y - 0.3 + Math.sin(t * 5 + a.phase) * 0.06
            pitch = 0.25
            familyHeld = true
          } else if (a.young && a.rescued) {
            // Pulled out: walking back to the bank beside the parent.
            px = a.x
            pz = a.z
            if (a.rescueEntry) yaw = Math.atan2(a.rescueEntry.x - a.x, a.rescueEntry.z - a.z)
            pitch = 0
            familyHeld = true
          } else if (a.plungeTo) {
            // Rushing after its swept-over calf (movement in the pre-pass).
            px = a.x
            pz = a.z
            bodyY = a.y // resync off any drink slide (see the kick branch)
            yaw = Math.atan2(a.plungeTo.x - a.x, a.plungeTo.z - a.z)
            pitch = 0
            familyHeld = true
          } else if (a.trampleTo) {
            // Charging the elephant that trampled its calf (movement in the
            // pre-pass). familyHeld is load-bearing here: it suppresses the
            // elephant dodge below, so the parent runs INTO the feet it means
            // to die under instead of darting aside like ordinary prey.
            px = a.x
            pz = a.z
            bodyY = a.y // resync off any drink slide (see the kick branch)
            yaw = Math.atan2(a.trampleTo.x - a.x, a.trampleTo.z - a.z)
            pitch = 0
            familyHeld = true
          } else if (a.vigil) {
            // The vigil (point 121): stand over the fallen calf, facing it
            // (movement in the pre-pass). familyHeld is load-bearing and the
            // no-flight is a DELIBERATE user decision (design.md §19.8): the
            // keeper never flees the predator the carcass draws and never
            // dodges an elephant — one that reaches it takes it through the
            // existing hunt path, a sacrifice at the spot where its young fell.
            px = a.x
            pz = a.z
            bodyY = a.y // resync off any drink slide (see the kick branch)
            yaw = Math.atan2(a.vigil.x - a.x, a.vigil.z - a.z)
            pitch = -0.15 // head lowered over the carcass
            familyHeld = true
          } else if (a.young && a.mired !== undefined) {
            // Mired at the drying waterhole (point 123): it struggles in
            // PLACE — a small shudder, no ground covered, no escape.
            px = a.x
            pz = a.z
            bodyY = a.y + Math.abs(Math.sin(t * 7 + a.phase)) * 0.06
            yaw = a.face ?? a.rot
            pitch = 0.2 // head straining up out of the mud
            familyHeld = true
          } else if (a.child && !a.child.dead && a.child.mired !== undefined) {
            // The vigil (point 123): the parent walks to its mired calf and
            // STANDS beside it while the herd moves on — and does not flee
            // the predator the last water draws (familyHeld suppresses the
            // dodge below, like the trample grief).
            const dxm = a.child.x - a.x
            const dzm = a.child.z - a.z
            const dm = Math.hypot(dxm, dzm)
            if (dm > 1.6) {
              a.x += (dxm / dm) * YOUNG_FOLLOW_SPEED * dt
              a.z += (dzm / dm) * YOUNG_FOLLOW_SPEED * dt
              { // ground-follow (point 203(A))
                const gfl = worldToLatLon(a.x, a.z)
                const gft = sampleTerrain(gfl.lat, gfl.lon, seed)
                if (gft.type !== 'water' && gft.type !== 'ocean') bodyY = a.y = Math.max(0.02, gft.height)
              }
            }
            px = a.x
            pz = a.z
            yaw = Math.atan2(dxm, dzm)
            pitch = -0.15 // head down toward the stuck calf
            familyHeld = true
          } else if (a.child && !a.child.dead && a.child.inWater !== undefined) {
            // Wading to (or escorting) the calf in the water (pre-pass moves).
            px = a.x
            pz = a.z
            // In the water a.y already rides the sheet chest-deep (point 196)
            // — an extra dip here read the wader half a body too low. Resync
            // bodyY to it so a drink slide this frame can't leave the parent
            // sunk at its inland bank height (see the kick branch).
            bodyY = a.y
            yaw = Math.atan2(a.child.x - a.x, a.child.z - a.z)
            pitch = 0.15
            familyHeld = true
          } else if (a.young && LION_STATE.mode === 'chase' && LION_STATE.victim === a) {
            // This calf is the one being run down (design.md §19): it bolts
            // instead of standing at its parent, but slower than its hunter, so
            // the chase is visible in the open before the catch.
            // Steer around a coast or river the way every other mover does
            // (point 157): the old raw step ran straight into the water and
            // pinned the calf. calfFleeStep heads away from the hunter and fans
            // out to a way around; at a concave sea pocket where the whole fan
            // is wet it falls back to the point-188 escape corridor (sticky via
            // a.fleeCorridor) and runs ALONG the shore instead of freezing at
            // the waterline (point 226). Only a genuine dead-end (water on
            // every side) stands (moved:false) for the catch to resolve — the
            // §19.8 "always resolves" rule. Speed and the slower-than-hunter
            // property are unchanged.
            const fleeBlocked = (nx: number, nz: number) => {
              const ll = worldToLatLon(nx, nz)
              const ty = sampleTerrain(ll.lat, ll.lon, seed).type
              return ty === 'ocean' || ty === 'water'
            }
            const fleeStep = calfFleeStep(
              a.x,
              a.z,
              LION_STATE.lx,
              LION_STATE.lz,
              CALF_FLEE_SPEED * dt,
              fleeBlocked,
              0.8,
              a.fleeCorridor,
            )
            a.fleeCorridor = fleeStep.corridor
            a.x = fleeStep.x
            a.z = fleeStep.z
            { // ground-follow (point 203(A)): a mover carries its own standing height
              const gfl = worldToLatLon(a.x, a.z)
              const gft = sampleTerrain(gfl.lat, gfl.lon, seed)
              if (gft.type !== 'water' && gft.type !== 'ocean') bodyY = a.y = Math.max(0.02, gft.height)
            }
            px = a.x
            pz = a.z
            yaw = fleeStep.heading
            pitch = 0
            familyHeld = true
          } else if (a.child && !a.child.dead && LION_STATE.mode === 'chase' && LION_STATE.victim === a.child) {
            // Our calf is being run down: the parent holds itself between the
            // hunter and its young (movement in the pre-pass) so the hunter
            // takes it in the calf's place (§19).
            px = a.x
            pz = a.z
            bodyY = a.y // resync off any drink slide (see the kick branch)
            const h = blockHeading(a.x, a.z, a.child.x, a.child.z, LION_STATE.lx, LION_STATE.lz, PARENT_BLOCK_OFFSET)
            if (h !== null) {
              // Running to hold the station: face the run direction (snap, so the
              // body never lags behind and appears to run backwards).
              yaw = h
              a.face = h
            } else {
              // On station: face the hunter down, keeping the arrival facing.
              yaw = a.face ?? Math.atan2(LION_STATE.lx - a.x, LION_STATE.lz - a.z)
            }
            pitch = 0
            familyHeld = true
          } else if (a.young && a.parent && !a.parent.dead) {
            const toX = a.parent.x - a.x
            const toZ = a.parent.z - a.z
            const d = Math.hypot(toX, toZ)
            // Player shyness (design.md §19): ANY juvenile — even of a stout
            // species whose adults stand their ground — bolts from the nearby
            // traveller before play/follow resume, through the SAME held dodge
            // heading as the adult flight (turnToward under the dodge's own
            // hysteresis ring and turn cap — no second oscillation-prone
            // path). The dramas above own their claims; the arbitration is
            // the ONE shared resolver (point 252) with the FULL drama state —
            // a hunted calf takes its chase-victim branch above, so this
            // follow branch is reached only by a free calf, but the resolver's
            // gate keeps the invariant explicit and ordering-independent.
            // Calves never dart from elephants (the herd is their shield, and
            // the §19.8 trample drama needs them catchable), so the elephant
            // threat list stays empty here. The drink exemption is NARROWED
            // (point 247): only the staged §19.16 bank victims keep their
            // stand — a plain drinking juvenile bolts like any calf.
            const shyRing = a.dodgeHeading === undefined ? PLAYER_SHY_RADIUS : PLAYER_SHY_RADIUS * PREY_PANIC_EXIT
            const shyPick = resolveFleeTarget(
              a.x,
              a.z,
              {
                species: sp,
                isJuvenile: true,
                preyWeapon: balance.parentDefense.preyWeapon,
                drama: dramaStateOf(a, false),
                drinking: a.drink !== undefined,
                stagedBankVictim: stagedBankVictim(a),
              },
              [],
              playerThreat,
              0,
              shyRing,
            )
            if (shyPick !== null) {
              a.hop = undefined
              a.boutDetour = undefined
              a.dodgeHeading =
                a.dodgeHeading === undefined
                  ? shyPick.heading
                  : turnToward(a.dodgeHeading, shyPick.heading, PREY_DODGE_TURN * dt)
              const shyStep = deflectedStep(a.x, a.z, a.dodgeHeading, PLAYER_SHY_SPEED * dt, waterBlockedAt, 0.8)
              // Boxed against the water by the approaching traveller (point
              // 248): cross the river/lake like the predator-fleeing prey
              // does (point 192) instead of pinning at the waterline. The
              // crossing (a drama state) then owns the calf and silences the
              // player-shy flee until it lands.
              const esc = fleeCrossing(
                shyStep.moved,
                a.crossing !== undefined,
                a.x,
                a.z,
                a.dodgeHeading,
                balance.waterCross.maxUnits,
                terrainTypeAtWorld,
              )
              if (esc) a.crossing = { tx: esc.tx, tz: esc.tz, time: 0 }
              a.x = shyStep.x
              a.z = shyStep.z
              { // ground-follow (point 203(A)): a mover carries its own standing height
                const gfl = worldToLatLon(a.x, a.z)
                const gft = sampleTerrain(gfl.lat, gfl.lon, seed)
                if (gft.type !== 'water' && gft.type !== 'ocean') bodyY = a.y = Math.max(0.02, gft.height)
              }
              px = a.x
              pz = a.z
              wobTarget = 0
              yaw = a.dodgeHeading
              pitch = 0
            } else {
              if (a.dodgeHeading !== undefined) {
                // Shy flight over: keep facing where it ended, like the dodge.
                a.rot = a.dodgeHeading
                a.dodgeHeading = undefined
              }
              // Play-lock hysteresis: a bout that ended out of range (a parent
              // that walked off) does not restart at the boundary — only well
              // inside it — so play and follow never alternate per frame.
              if (a.playLock && d < GAMBOL_RANGE * 0.6) a.playLock = undefined
              if (!a.playLock && d > GAMBOL_RANGE) a.playLock = true
              const canPlay =
                !lionActive && !a.playLock && (CALF_HUNT_SPECIES as readonly string[]).includes(sp)
              const bout = canPlay ? gambolState(t, a.phase, GAMBOL_PERIOD, GAMBOL_ACTIVE) : null
              // The drying waterhole (design.md §19.8, point 123): a bout that
              // ENDS at a lake bank whose season has dried to mud may stick the
              // calf — one roll per bout, hashed from the calf's phase and the
              // bout cycle so it is deterministic per (calf, bout).
              if (!bout && a.bouted) {
                a.bouted = undefined
                const bw = balance.waterDrama
                const llm = worldToLatLon(a.x, a.z)
                const bankD = lakeDistance(llm.lat, llm.lon, 0.2)
                const cycle = Math.floor(t / GAMBOL_PERIOD)
                const roll = Math.abs(Math.sin(a.phase * 127.1 + cycle * 311.7)) % 1
                if (
                  mireRoll(bankD, 0.06, CURRENT_WEATHER.wetness, bw.mireDrynessThreshold, bw.mireChancePerBout, roll)
                ) {
                  a.mired = 0
                  a.hop = undefined
                }
              }
              if (bout) {
                a.bouted = true
                // Playful gambolling (design.md §19): scampering hops around the
                // parent, LEASHED — a homeward pull grows toward the range edge
                // so the scamper orbits the parent instead of crossing the
                // boundary (crossing switched play/follow per frame: trembling).
                // The step is real, so a bout at the shore can still carry the
                // calf into the water — the accident the rescue drama hangs on.
                const heading = bout.heading + (a.boutDetour ?? 0)
                const [sx, sz] = leashedGambolDir(heading, toX, toZ, d, GAMBOL_RANGE)
                const beforeX = a.x
                const beforeZ = a.z
                a.x += sx * GAMBOL_SPEED * dt
                a.z += sz * GAMBOL_SPEED * dt
                const llp = worldToLatLon(a.x, a.z)
                const terp = sampleTerrain(llp.lat, llp.lon, seed)
                if (terp.type === 'water') {
                  // Hopped off the bank: remember the entry for the rescue.
                  a.rescueEntry = { x: beforeX, z: beforeZ }
                } else if (terp.type === 'ocean' || terp.height <= 0.02) {
                  // Never gambol into the open sea: bend the rest of the bout
                  // along the bank instead of vibrating in place against it.
                  a.x = beforeX
                  a.z = beforeZ
                  a.boutDetour = ((a.boutDetour ?? 0) + Math.PI / 2) % (Math.PI * 2)
                } else {
                  a.y = Math.max(0.02, terp.height)
                }
                a.hop = bout.hop
                px = a.x
                pz = a.z
                bodyY = a.y + bout.hop * 0.35
                // Face the actual step, not the raw bout heading; a radially
                // pinned calf ([0,0] step) keeps its facing instead of snapping.
                if (Math.hypot(sx, sz) > 0.05) yaw = Math.atan2(sx, sz)
                else yaw = a.face ?? a.rot
                pitch = 0
              } else if (d > YOUNG_FOLLOW_RADIUS) {
                a.hop = undefined
                a.boutDetour = undefined
                a.x += (toX / d) * YOUNG_FOLLOW_SPEED * dt
                a.z += (toZ / d) * YOUNG_FOLLOW_SPEED * dt
                { // ground-follow (point 203(A)) — THE main calf mover: every
                  // background calf tails its drifting parent through this step,
                  // and without the height update they sank into every slope
                  // (the tripwire's persistent young=true burials).
                  const gfl = worldToLatLon(a.x, a.z)
                  const gft = sampleTerrain(gfl.lat, gfl.lon, seed)
                  if (gft.type !== 'water' && gft.type !== 'ocean') bodyY = a.y = Math.max(0.02, gft.height)
                }
                px = a.x
                pz = a.z
                yaw = Math.atan2(toX, toZ)
              } else {
                a.hop = undefined
                a.boutDetour = undefined
                pitch = -0.22 // nurse: head up toward the parent's flank
              }
            }
            familyHeld = true
          } else if (a.child && !a.child.dead && LION_STATE.mode !== 'chase') {
            // No active chase: clear the guard's closest-approach memory so the
            // NEXT hunt starts fresh (a stale low min would mute the guard).
            if (a.guardMinD !== undefined) a.guardMinD = undefined
          } else if (a.child && !a.child.dead && LION_STATE.mode === 'chase') {
            // A parent guards its calf only against a HUNTING (chasing) lion that
            // comes near — not a lion FEEDING on other prey nearby (point 118): a
            // feeder is no approaching threat, and treating it as one made the
            // parent orbit the feeding lion forever (calf never hunted, so never
            // caught or saved). When the lion only feeds, this branch is skipped
            // and the family flees it below like any other prey. The station is
            // the same living-shield point as the chase shield (blockHeading with
            // GUARD_STANDOFF), whose hold-zone stops the parent re-chasing every
            // micro-move of the lion (the old per-frame retarget oscillated).
            const calf = a.child
            // Release-on-recede (point 191): the passive radius gate kept the
            // parent stationed lion-side while the hunt merely PASSED — and the
            // calf follows its parent, so the pair leapfrogged after the hunter
            // to the kill. Guard only while the lion CLOSES on this calf.
            const gd = Math.hypot(LION_STATE.lx - calf.x, LION_STATE.lz - calf.z)
            const eng = guardEngagement(gd, a.guardMinD ?? null, GUARD_RADIUS)
            a.guardMinD = eng.minSeen ?? undefined
            if (eng.engaged) {
              const h = blockHeading(a.x, a.z, calf.x, calf.z, LION_STATE.lx, LION_STATE.lz, GUARD_STANDOFF)
              if (h !== null) {
                a.x += Math.sin(h) * RESCUE_SPEED * dt
                a.z += Math.cos(h) * RESCUE_SPEED * dt
                { // ground-follow (point 203(A)): a mover carries its own standing height
                  const gfl = worldToLatLon(a.x, a.z)
                  const gft = sampleTerrain(gfl.lat, gfl.lon, seed)
                  if (gft.type !== 'water' && gft.type !== 'ocean') bodyY = a.y = Math.max(0.02, gft.height)
                }
                yaw = h
              } else {
                yaw = Math.atan2(LION_STATE.lx - a.x, LION_STATE.lz - a.z) // on station: face it down
              }
              px = a.x
              pz = a.z
              pitch = 0
              familyHeld = true
            }
          }
        }
        // Every drama/play/follow/guard behaviour moves deliberately: the idle
        // shuffle fades out for them (blended below, never switched).
        if (familyHeld) wobTarget = 0
        // Grazing dips on the open grassland.
        if (pitch === 0 && (sp === 'zebra' || sp === 'antelope' || sp === 'wildebeest' || sp === 'warthog')) {
          const g = Math.sin(t * 0.35 + a.phase * 3)
          if (g > 0.65) pitch = (g - 0.65) * 0.9
        }
        // Prey flees from an active predator (design.md §19): it runs away
        // smoothly, accumulating into its own position, so it never teleports
        // when the hunt begins or snaps back when it ends.
        let fleeingLion = false // set once the flee actually fires this frame
        if (!familyHeld && lionActive && FLEES_LION[sp] && sp !== 'elephant') {
          const dx = a.x - LION_STATE.lx
          const dz = a.z - LION_STATE.lz
          const d = Math.hypot(dx, dz)
          if (d < FLEE_RADIUS && d > 0.01) {
            fleeingLion = true
            const urgency = (FLEE_RADIUS - d) / FLEE_RADIUS
            // Water-deflected flight (points 201/197): the raw radial step ran a
            // fleeing animal straight onto a water cell where the §19.5 backstop
            // teleported it back — an on-the-spot pin at the bank (the user's
            // calf standing at the waterline while its parent was taken). Steer
            // along the bank instead; a genuine dead-end stands (the drama or
            // the walk-on resolves it). Point 192 will later allow choosing the
            // water on purpose — this only swaps the blocked predicate then.
            const fleeH = Math.atan2(dx, dz)
            const fleeStep = deflectedStep(a.x, a.z, fleeH, FLEE_SPEED * urgency * dt, waterBlockedAt, 0.8)
            // Boxed against the water with the predator behind (point 192):
            // flee INTO the water — predators do not follow into the deep.
            // Shared fleeCrossing rule (river/lake only, never the ocean).
            {
              const esc = fleeCrossing(
                fleeStep.moved,
                a.crossing !== undefined,
                a.x,
                a.z,
                fleeH,
                balance.waterCross.maxUnits,
                terrainTypeAtWorld,
              )
              if (esc) a.crossing = { tx: esc.tx, tz: esc.tz, time: 0 }
            }
            a.x = fleeStep.x
            a.z = fleeStep.z
            { // ground-follow (point 203(A)): a mover carries its own standing height
              const gfl = worldToLatLon(a.x, a.z)
              const gft = sampleTerrain(gfl.lat, gfl.lon, seed)
              if (gft.type !== 'water' && gft.type !== 'ocean') bodyY = a.y = Math.max(0.02, gft.height)
            }
            px = a.x
            pz = a.z
            wobTarget = 0.3
            yaw = fleeStep.moved ? fleeStep.heading : fleeH // face the escape line
            pitch = 0
          }
        }
        // Dodge an approaching elephant, but only at the last moment (design.md
        // §19): the prey darts away just before it is reached and a touch
        // slower than the herd, so a head-on elephant still catches some. Flee
        // the summed repulsion of ALL nearby elephants (not just the nearest)
        // and turn toward it at a bounded rate, so the facing never flip-flops
        // ~90° between two flanking herd-mates (no oscillation, design.md §19).
        // The SAME block also carries the player shyness (design.md §19): a
        // weak/prey adult — or an orphaned juvenile that fell out of the family
        // branch — flees the traveller through the identical held heading
        // (fleesFromPlayer gates who; elephant calves stay with their herd,
        // whose cohesion is their shield). Both threats feed ONE dodgeHeading;
        // the close-range elephant dart takes strict priority (an equal-weight
        // blend of two opposing headings would have a cancellation point — the
        // exact degeneracy the leash damping teaches to avoid), and the
        // capped turnToward smooths any hand-over between the two sources.
        if (
          !familyHeld && sp !== 'elephant' &&
          (FLEES_LION[sp] || fleesFromPlayer(sp, !!a.young, balance.parentDefense.preyWeapon))
        ) {
          // Hysteresis: once dodging, only disengage well past the trigger
          // ring — a tailing elephant (or the traveller) cannot flap the dodge
          // on and off at the ring.
          const engaged = a.dodgeHeading !== undefined
          const ring = engaged ? PREY_PANIC_RADIUS * PREY_PANIC_EXIT : PREY_PANIC_RADIUS
          const shyRing = engaged ? PLAYER_SHY_RADIUS * PREY_PANIC_EXIT : PLAYER_SHY_RADIUS
          // THE arbitration point (point 252): resolveFleeTarget ranks every
          // co-active threat — drama > predator flee (the block above, fed in
          // as isHunted) > elephant dart > player-shy > idle. A prey actively
          // fleeing the lion or the hunt's designated victim keeps fleeing
          // the LION, not the traveller — so the hunt/drama always resolves
          // rather than stalling when the player wanders near — while the
          // elephant dart stays live even then. The drink exemption is
          // NARROWED (point 247): staged §19.16 bank victims and adult
          // drinkers keep their stand/errand, a plain drinking juvenile
          // bolts. Both sources feed ONE dodgeHeading under the capped
          // turnToward, so a hand-over between them turns smoothly and never
          // flip-flops (the point-237 steady-escape rule ACROSS sources).
          const pick = resolveFleeTarget(
            a.x,
            a.z,
            {
              species: sp,
              isJuvenile: !!a.young,
              preyWeapon: balance.parentDefense.preyWeapon,
              drama: dramaStateOf(a, fleeingLion),
              drinking: a.drink !== undefined,
              stagedBankVictim: stagedBankVictim(a),
            },
            FLEES_LION[sp] ? elephantPos : [],
            playerThreat,
            ring,
            shyRing,
          )
          if (pick !== null) {
            // Steady escape for a JUVENILE (point 237): a calf ringed by a herd
            // sees the summed-repulsion pick flip ~180° between two comparably-
            // good escapes frame to frame; committing to the held heading until
            // a fresh pick diverges past FLEE_COMMIT_MARGIN keeps ONE direction
            // (the escapeCorridorHeading/calfFleeStep sticky-corridor discipline),
            // while the capped turnToward still smooths a genuine switch. Adults
            // already read steady off the summed pick, so the commit is calf-only.
            const fleeTarget = a.young
              ? committedFleeHeading(a.dodgeHeading, pick.heading, FLEE_COMMIT_MARGIN)
              : pick.heading
            a.dodgeHeading =
              a.dodgeHeading === undefined ? pick.heading : turnToward(a.dodgeHeading, fleeTarget, PREY_DODGE_TURN * dt)
            // The elephant dart stays deliberately slower than the herd (the
            // trample must remain possible); a pure player flight runs.
            const spd = pick.source === 'elephant' ? PREY_PANIC_SPEED : PLAYER_SHY_SPEED
            // Deflect the dart along a bank instead of into the water (points
            // 201/197): the raw step ran the dodge onto a water cell where the
            // backstop teleported it back — a vibrating pin at the waterline.
            // A flying bird instead crosses river/lake freely (ocean-only
            // deflection) — it is in the air.
            const dodgeStep = deflectedStep(
              a.x,
              a.z,
              a.dodgeHeading,
              spd * dt,
              sp === 'flamingo' ? oceanBlockedAt : waterBlockedAt,
              0.8,
            )
            if (sp !== 'flamingo') {
              // Boxed against the water with the threat bearing down (point
              // 192): rather than be caught, take to the water — the herd
              // does not follow into the deep. Shared fleeCrossing rule
              // (river/lake only, never the ocean).
              const esc = fleeCrossing(
                dodgeStep.moved,
                a.crossing !== undefined,
                a.x,
                a.z,
                a.dodgeHeading,
                balance.waterCross.maxUnits,
                terrainTypeAtWorld,
              )
              if (esc) a.crossing = { tx: esc.tx, tz: esc.tz, time: 0 }
            }
            a.x = dodgeStep.x
            a.z = dodgeStep.z
            { // ground-follow (point 203(A)): a mover carries its own standing
              // height — and the fleeing wader stands on the sheet over water.
              const gfl = worldToLatLon(a.x, a.z)
              const gft = sampleTerrain(gfl.lat, gfl.lon, seed)
              if (gft.type === 'water' && sp === 'flamingo')
                bodyY = a.y = waderStandY(gft.height, waterSurfaceY(gfl.lat, gfl.lon, seed, gft.height))
              else if (gft.type !== 'water' && gft.type !== 'ocean') bodyY = a.y = Math.max(0.02, gft.height)
            }
            px = a.x
            pz = a.z
            wobTarget = 0
            yaw = a.dodgeHeading
            pitch = 0
          } else if (a.dodgeHeading !== undefined) {
            // Disengaged: keep facing where the dart ended instead of turning
            // back to the pre-flight orientation (design.md §19).
            a.rot = a.dodgeHeading
            a.dodgeHeading = undefined
          }
          // Birds fly off (design.md §19): the climb ramps while the shy
          // flight is engaged and settles once it ends — blended, never a pop.
          if (sp === 'flamingo') {
            if (pick !== null) a.flyLift = Math.min(1, (a.flyLift ?? 0) + dt * 1.5)
            else if (a.flyLift !== undefined) {
              a.flyLift -= dt * 0.8
              if (a.flyLift <= 0) a.flyLift = undefined
            }
            if (a.flyLift !== undefined) bodyY += a.flyLift * BIRD_FLY_LIFT
          }
        }
        // The LOGICAL render spot (point 196): the anchoring assert judges the
        // body here, BEFORE the cosmetic shuffle below — for an idle animal
        // that is its anchor, for a drinker the slid bank spot, never the
        // sub-unit shuffle wobble (which on a slope would sample ~0.9 higher
        // ground and false-fire a burial the player never sees).
        const anchorX = px
        const anchorZ = pz
        // Apply the blended idle-shuffle offset (never a hard on/off switch:
        // the amplitude fades between the behaviours' targets over ~0.4 s).
        if (sp !== 'elephant') {
          const cur = a.wobAmp ?? wobTarget
          const amp = cur + (wobTarget - cur) * Math.min(1, dt * 2.5)
          a.wobAmp = amp
          px += wob * amp
          pz += Math.cos(t * 0.2 + a.phase) * amp
        }
        // Under an elephant: trampled, stays dead on the ground. Checked on
        // the SIM position — the idle-shuffle render offset is cosmetic and
        // must never carry an animal under a trample. (A calf killed by a
        // predator above is already dead; skip the scan and just re-render.)
        if (sp !== 'elephant') {
          const wasDead = a.dead
          if (!a.dead) {
            for (let ei = 0; ei < elephantPos.length; ei++) {
              const [ex, ez] = elephantPos[ei]
              const [evx, evz] = elephantVel[ei]
              // A trample kills only when the elephant is MOVING toward the
              // animal (point 259): a standing elephant a grazer bumps into, or
              // a hit from behind its heading of travel, leaves it unharmed —
              // the §19.5 body-separation parts that overlap instead. Only an
              // elephant driving into/over the animal crushes it.
              if (elephantWouldTrample(evx, evz, ex, ez, a.x, a.z, TRAMPLE_RADIUS)) {
                a.dead = true
                pushStain(a.x, a.z)
                // A trampled CALF takes its parent with it (design.md §19): the
                // parent throws itself before the elephant's feet and is
                // trampled by this same check on arrival. Grief, not a rescue —
                // mirrors the waterfall plunge, where nobody is saved either.
                const par = a.parent
                if (a.young && par && !par.dead) {
                  par.trampleTo = { x: ex, z: ez }
                  par.grief = TRAMPLE_GRIEF_SECONDS
                  par.child = undefined
                  a.parent = undefined
                }
                break
              }
            }
          }
          // The trample crunch (design.md §19.1/§19.5, point 260): one short
          // CRACK/CRUNCH at the victim's world position the frame it is crushed
          // — the ordinary trample above AND the parent grief-trample (the
          // charging parent is trampled by this same check on arrival). An EDGE,
          // not a level: gated on the alive->dead transition so it fires exactly
          // once per kill and never per frame while the carcass lies here; a
          // predator kill (already dead on entry) draws no crunch. Positional —
          // the shared §19.1 proximity fade makes a near trample loud, a far one
          // faint (via the single ambience volume, one audio path).
          if (trampleCrunchFires(!!wasDead, !!a.dead)) {
            playTrampleCrunch(Math.hypot(a.x - pos.x, a.z - pos.z))
          }
          if (a.dead) {
            i-- // re-render this animal in its dead pose immediately
            continue
          }
        }
        // Steer the persistent facing toward this frame's desired heading —
        // no behavior change can snap the body around (design.md §19). The
        // deliberate fast wiggles (a caught calf's thrash, the in-water
        // struggle) pass through unfiltered, and any directional behavior
        // updates the resting orientation so ending it never yanks the animal
        // back toward its spawn-time facing.
        const thrashing =
          (a.caught !== undefined && a.caught > 0) ||
          (a.inWater !== undefined && !a.rescued) ||
          a.mired !== undefined
        const face = thrashing ? yaw : turnToward(a.face ?? yaw, yaw, FACE_TURN * dt)
        a.face = face
        if (sp !== 'elephant' && !thrashing && yaw !== idleYaw) a.rot = face
        vpos.set(px, bodyY, pz)
        if (pitch !== 0) {
          euler.set(pitch, face, 0, 'YXZ')
          quat.setFromEuler(euler)
        } else {
          quat.setFromAxisAngle(up, face)
        }
        vscl.setScalar(a.scale)
        mtx.compose(vpos, quat, vscl)
        // ANCHORING invariant (point 203(A), throttled ~1/13): the rendered
        // body must neither sink under its own ground nor float high over it.
        // Water occupants (dramas, crossings, the §19.16 crocodile, waders)
        // ride the water rules instead and are skipped. Tolerances are generous
        // — this is a tripwire for the buried/floating CLASS (187/190/202/185),
        // not a pixel gate; a violation fails any suite via the assert channel.
        // (Judged at the RENDERED spot px/pz: the drink/bathe slide renders
        // away from the anchor and — since point 196 — carries the bank
        // target's own height, so drinkers are asserted like everyone else;
        // a bather mid-slide stands over a water cell, which is skipped. The
        // drama locks mirror the WATER-SWEEP's exemptions exactly: those
        // animals are never re-anchored there, so asserting them would flag
        // the dramas' own scripted poses, not a real burial.)
        if ((aIdx + ASSERT_TICK) % 13 === 0 && !a.dead && a.grounded === true && sp !== 'crocodile' && sp !== 'flamingo' &&
            a.crossing === undefined && a.inWater === undefined && a.caught === undefined && a.mired === undefined &&
            !a.bathe && !a.vigil && !a.rescued && !a.plungeTo && !a.trampleTo &&
            a.fireTrapped === undefined && LION_STATE.victim !== a) {
          // A bather wades a step past the bank and sits chest-deep in the
          // shallow (point 196) — a water occupant like the drama poses, below
          // the bank ground the assert would sample. The head-dip drinker
          // (feet on the bank, !a.bathe) stays policed.
          const gll = worldToLatLon(anchorX, anchorZ)
          const gt = sampleTerrain(gll.lat, gll.lon, seed)
          if (gt.type !== 'water' && gt.type !== 'ocean') {
            const ground = Math.max(0, gt.height)
            const buried = bodyY < ground - 0.75 * a.scale
            const floating = bodyY > ground + 2.5 * a.scale
            // Two-strike tolerance (point 200): a one-FRAME anchoring transient
            // at a state transition (spawn, drink-cycle start, shore-seed) is
            // imperceptible at 60 fps but the per-frame sample catches it — fire
            // only when the SAME animal violates on 2+ consecutive assert-visits
            // (~13 frames apart), so a persistent float still fails loudly while
            // a single-frame transition does not (kept the closing 3x flake-free).
            a.floatStrike = buried || floating ? (a.floatStrike ?? 0) + 1 : 0
            const persistent = a.floatStrike >= 2
            devAssert(
              !(persistent && buried),
              'animal-buried',
              () =>
                `${sp} bodyY=${bodyY.toFixed(2)} ground=${ground.toFixed(2)} y=${a.y.toFixed(2)} ` +
                `young=${!!a.young} bathe=${!!a.bathe} drink=${!!a.drink} dodge=${a.dodgeHeading !== undefined} hop=${a.hop !== undefined} ` +
                `chunk=${a.chunk ?? 'none'} shoreSeed=${!!a.shoreSeed} parent=${!!a.parent} child=${!!a.child} ` +
                `dPlayer=${Math.hypot(a.x - pos.x, a.z - pos.z).toFixed(0)}`,
            )
            devAssert(!(persistent && floating), 'animal-floating', () => `${sp} bodyY=${bodyY.toFixed(2)} ground=${ground.toFixed(2)}`)
          }
        }
        write(a)
      }
      mesh.count = aIdx
      mesh.instanceMatrix.needsUpdate = true
      if (calfMesh) {
        calfMesh.count = cIdx
        calfMesh.instanceMatrix.needsUpdate = true
      }
    }

    // Blood stains under kills of every kind, laid into the local slope so no
    // wedge is swallowed by rising ground (design.md §19).
    const sm = stainMesh.current
    if (sm) {
      stains.current.forEach((st, i) => {
        euler.set(-Math.PI / 2, 0, 0)
        quat2.setFromEuler(euler)
        nrm.set(st.nx, st.ny, st.nz)
        quat.setFromUnitVectors(up, nrm).multiply(quat2)
        vpos.set(st.x + st.nx * 0.08, st.y + st.ny * 0.08, st.z + st.nz * 0.08)
        vscl.setScalar(1)
        mtx.compose(vpos, quat, vscl)
        sm.setMatrixAt(i, mtx)
      })
      sm.count = stains.current.length
      sm.instanceMatrix.needsUpdate = true
    }

    // Remove carcasses a scavenger has fully consumed, and cull any left far
    // off-screen: a single scavenger cannot keep up with every kill, so an
    // unseen carcass is dropped silently rather than lingering forever (this
    // bounds the herd arrays — otherwise trample kills accumulate without limit
    // and eventually stall the frame loop).
    for (const sp of SPECIES) {
      const list = herds[sp]
      for (let i = list.length - 1; i >= 0; i--) {
        const a = list[i]
        if (!a.dead) continue
        const consumed = a.dissolve !== undefined && a.dissolve <= 0
        const farOffScreen = Math.hypot(a.x - pos.x, a.z - pos.z) > despawnR
        if (consumed || farOffScreen) {
          a.gone = true // releases a scavenger flight bound to this carcass
          list.splice(i, 1)
        }
      }
    }
  })

  return (
    <>
      {SPECIES.map((sp) => (
        <primitive key={sp} object={pool.adult[sp]} dispose={null} />
      ))}
      {CALF_SPECIES.map((sp) => (
        <primitive key={`${sp}-calf`} object={pool.calf[sp]} dispose={null} />
      ))}
      <primitive object={pool.stain} dispose={null} />
      <instancedMesh ref={fireFlames} args={[fireFlameGeo, fireFlameMat, FIRE_FLAME_COUNT]} visible={false} frustumCulled={false} />
      <instancedMesh ref={fireBand} args={[fireBandGeo, fireBandMat, FIRE_BAND_SEGMENTS]} visible={false} frustumCulled={false} />
      {scavengers.current.map((_, si) => (
        <group
          key={si}
          ref={(el) => {
            scavengeGroups.current[si] = el
          }}
          visible={false}
        >
          {[0, 1, 2].map((i) => (
            <mesh key={i} geometry={vultureGeo} material={material} dispose={null} />
          ))}
        </group>
      ))}
    </>
  )
}

/**
 * Purely decorative predator hunt (design.md §19): near grazing herds a
 * region-appropriate predator (lion, cheetah, leopard or hyena) occasionally
 * chases one grazer from its food web; after the catch it visibly feeds on the
 * carcass — lowered, tearing head movements while the prey shrinks away piece
 * by piece over a red, spreading stain. Once the carcass is gone the predator
 * leaves a small prey remnant for the scavenger, trots off away from the
 * traveller and despawns only beyond the zoom-aware view ring. The lion is
 * the apex and the only predator
 * that also attacks the player on contact (§14); the others are pure scenery.
 */
function LionHunt() {
  const seed = useGame((s) => s.seed)
  const lion = useRef<THREE.Group>(null)
  const predatorMesh = useRef<THREE.Mesh>(null)
  const prey = useRef<THREE.Group>(null)
  const preyMesh = useRef<THREE.Mesh>(null)
  const stain = useRef<THREE.Mesh>(null)
  // Module-shared state so the herds and vultures can react to the hunt.
  const state = useRef(LION_STATE)

  // Predator/prey meshes swapped per hunt so different hunters roam the
  // plains and take varied game — geometries and material from the module
  // pool (point 96): with the travel scene's dispose={null} a per-mount
  // useMemo would leak a fresh geometry set on every place visit.
  const { predator: predatorGeo, prey: preyGeo } = getHuntGeos()
  const material = getWildlifeMeshes().material
  const stainUp = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const stainNrm = useMemo(() => new THREE.Vector3(), [])
  const stainFlat = useMemo(() => new THREE.Quaternion(), [])
  const stainEuler = useMemo(() => new THREE.Euler(), [])

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__lionHunt = { state: state.current, lion, prey, stain, predatorMesh }
    return () => {
      delete w.__lionHunt
    }
  }, [])

  const FEED_DURATION = 20

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const t = clock.elapsedTime
    const s = state.current
    const pos = useGame.getState().pos
    // The predator leaves the stage — and a strayed chase ends — only well
    // beyond the visible surroundings, however far the zoom reaches (§19).
    const offstageR = VIEW_AT_ZOOM1 * useUi.getState().travelZoom + HUNT_OFFSTAGE_MARGIN

    if (s.mode === 'idle') {
      // Idle clears any stale calf-hunt bookkeeping so a re-armed hunt starts clean.
      s.victim = null
      s.victimHunt = false
      const herds = ACTIVE_HERDS
      // The carcass draws a predator to the vigil-keeper (design.md §19.8,
      // point 121 (f)): the vigil must SUMMON its ending, so the standing
      // sacrifice reliably plays out instead of quietly expiring. POINT 121
      // OWNS THE LION_STATE-CLAIM RULE: the single global hunt is claimed
      // ONLY from idle — this path runs from idle alone, so a running hunt
      // is never clobbered and a draw simply waits for the next idle window.
      // It does, however, PREEMPT the idle cooldown timer below: the
      // post-hunt cooldown (30-60 s) would outlast the vigil window, and the
      // draw is a scripted guarantee, not a hope on the ambient dice.
      // The hunted species (point 124): recorded with the victim pick so the
      // predator is drawn from the food web that actually takes it, and
      // s.prey reports the truth for the region/web fit checks.
      let victimSpecies: PreyKind | null = null
      let vigilKeeper: Animal | null = null
      if (herds) {
        let bd = CALF_HUNT_SEEK
        for (const csp of CALF_HUNT_SPECIES) {
          for (const k of herds[csp]) {
            if (k.dead || k.caught !== undefined || k.vigil === undefined) continue
            if (!vigilDrawReady(k.vigil.time, balance.vigil.predatorDelay)) continue
            const kd = Math.hypot(k.x - pos.x, k.z - pos.z)
            if (kd < bd) {
              bd = kd
              vigilKeeper = k
              victimSpecies = csp
            }
          }
        }
      }
      if (!vigilKeeper) {
        s.timer -= dt
        if (s.timer > 0) return
      }
      // Sometimes the hunt targets a calf near the PLAYER instead of a generic
      // grazer, so the family drama (struggle → parent charge → sacrifice) plays
      // out on screen rather than far off (design.md §19). Searching around the
      // player — not a random far spawn spot — is what keeps it visible.
      let px: number
      let pz: number
      let ll: { lat: number; lon: number }
      let calf: Animal | null = null
      // A lion cub as the victim (point 145c): the predator is forced to hyena
      // below, and the lioness defends through the shared core — not a
      // food-web pick (a lion is no grazer, so victimSpecies stays null).
      let cubHunt = false
      // The drying waterhole draws the predators (point 123): a MIRED calf
      // in seek range is always the hunt's target — the pair at the last
      // water is genuinely found, not left to the calf-hunt dice.
      if (!vigilKeeper && herds) {
        let bd = CALF_HUNT_SEEK
        for (const csp of CALF_HUNT_SPECIES) {
          for (const c of herds[csp]) {
            if (!c.young || c.dead || c.caught !== undefined || c.mired === undefined || !c.parent || c.parent.dead)
              continue
            if (c.fireTrapped !== undefined) continue // the fire already claims it (point 197)
            if (!regionPreyAt(c.x, c.z).includes(csp)) continue // region fit (point 124)
            const cd = Math.hypot(c.x - pos.x, c.z - pos.z)
            if (cd < bd) {
              bd = cd
              calf = c
              victimSpecies = csp
            }
          }
        }
      }
      if (!vigilKeeper && !calf && herds && prefersJuvenilePrey(Math.random(), balance.family.juvenilePreyBias)) {
        let bd = CALF_HUNT_SEEK
        for (const csp of CALF_HUNT_SPECIES) {
          for (const c of herds[csp]) {
            if (!c.young || c.dead || c.caught !== undefined || c.inWater !== undefined || !c.parent || c.parent.dead)
              continue
            if (c.fireTrapped !== undefined || c.crossing !== undefined) continue // owned by the fire / a crossing (point 197)
            if (!regionPreyAt(c.x, c.z).includes(csp)) continue // region fit (point 124)
            const cd = Math.hypot(c.x - pos.x, c.z - pos.z)
            if (cd < bd) {
              bd = cd
              calf = c
              victimSpecies = csp
            }
          }
        }
      }
      // A hyena hunts a lion cub (design.md §19.8, point 145c). The lion family
      // is outside the food-web prey pools, so it is sought directly here; the
      // lioness (its .parent) defends through the same shared core. Found only
      // when no grazer calf was — the drama is a rare apex-family scene.
      if (!vigilKeeper && !calf && herds && prefersJuvenilePrey(Math.random(), balance.family.juvenilePreyBias)) {
        let bd = CALF_HUNT_SEEK
        for (const c of herds.lion) {
          if (!c.young || c.dead || c.caught !== undefined || !c.parent || c.parent.dead) continue
          const cd = Math.hypot(c.x - pos.x, c.z - pos.z)
          if (cd < bd) {
            bd = cd
            calf = c
            cubHunt = true
          }
        }
      }
      if (vigilKeeper) {
        // The drawn hunt takes the standing keeper itself: the existing
        // victim chase closes on it (it never flees — familyHeld) and the
        // existing catch/caught-countdown kill it; no second kill path.
        px = vigilKeeper.x
        pz = vigilKeeper.z
        ll = worldToLatLon(px, pz)
        s.victim = vigilKeeper
        s.victimHunt = true
      } else if (calf) {
        px = calf.x
        pz = calf.z
        ll = worldToLatLon(px, pz)
        s.victim = calf
        s.victimHunt = true
      } else {
        // Generic hunt: a random savanna spot beyond the frame (point 195). The
        // spot must be OFF the rendered frame so the scripted prey mesh is never
        // seen popping into existence — the chase then enters view as the camera
        // moves, the way you come across a real hunt.
        const ang = Math.random() * Math.PI * 2
        const dist = 25 + Math.random() * 20
        px = pos.x + Math.cos(ang) * dist
        pz = pos.z + Math.sin(ang) * dist
        ll = worldToLatLon(px, pz)
        if (sampleTerrain(ll.lat, ll.lon, seed).type !== 'savanna' || isOnScreen(px, pz)) {
          s.timer = 4
          return
        }
      }
      s.px = px
      s.pz = pz
      // Pick a region-appropriate predator, then prey from its food web that the
      // region actually holds (design.md §19): predator → grazer → grassland.
      const region = regionAt(ll.lat, ll.lon)
      const predPool = REGION_PREDATORS[region] ?? REGION_PREDATORS.east
      // A victim hunt's predator must hold the victim's species in its own
      // food web (point 124): a giraffe calf is run down by the LION only.
      // The lion takes every prey kind and roams every region, so the fit
      // pool is never empty for a huntable species.
      const vs = victimSpecies
      const fitPool = vs ? predPool.filter((p) => PREDATOR_PREY[p].includes(vs)) : predPool
      s.predator = fitPool.length > 0 ? fitPool[Math.floor(Math.random() * fitPool.length)] : 'lion'
      const regionPrey = REGION_PREY[region] ?? REGION_PREY.east
      const preyPool = PREDATOR_PREY[s.predator].filter((p) => regionPrey.includes(p))
      const pool = preyPool.length > 0 ? preyPool : regionPrey
      // The recorded prey species is the truth: the victim's own kind for a
      // family hunt, a food-web pick for the generic hunt.
      s.prey = vs ?? pool[Math.floor(Math.random() * pool.length)]
      // The lion-cub hunt is always a hyena's (point 145c): the lioness would
      // rout any lighter cat, so only the bold hyena makes the threat read —
      // and it only spawns where hyenas roam. The scripted prey mesh stays
      // hidden through the victim hunt, so s.prey's value is cosmetic here.
      if (cubHunt) s.predator = 'hyena'
      if (predatorMesh.current) {
        predatorMesh.current.geometry = predatorGeo[s.predator]
        predatorMesh.current.scale.setScalar(PREDATOR_SCALE[s.predator])
      }
      if (preyMesh.current) {
        preyMesh.current.geometry = preyGeo[s.prey]
        preyMesh.current.scale.setScalar(PREY_SCALE[s.prey])
      }
      if (vigilKeeper) {
        // The drawn predator arrives by the vulture standard (point 121 (f)):
        // it spawns beyond the zoom-aware view ring — inside the offstage
        // abort ring — and visibly WALKS in to the keeper, never popping
        // into sight or finding the carcass already claimed.
        const spawn = offscreenRingSpawn(
          px, pz,
          VIEW_AT_ZOOM1 * useUi.getState().travelZoom + 2, offstageR - 2, Math.random(),
          (x, z) => !isOnScreen(x, z),
        )
        s.lx = spawn.x
        s.lz = spawn.z
      } else {
        // The predator spawns OFF the rendered frame and runs in (point 195):
        // the old raw approach put it HUNT_LION_APPROACH from the spot in a
        // random direction, so beside an on-screen calf it popped into view.
        // Nearest off-screen point on a ring out to the abort radius, so the
        // chase still starts as close as the frustum allows.
        const spawn = offscreenRingSpawn(
          px, pz, HUNT_LION_APPROACH, offstageR - 2, Math.random(), (x, z) => !isOnScreen(x, z),
        )
        s.lx = spawn.x
        s.lz = spawn.z
      }
      s.heading = Math.random() * Math.PI * 2 // per-hunt weave phase
      s.lionHeading = Math.atan2(s.px - s.lx, s.pz - s.lz)
      s.preyHeading = s.lionHeading
      s.mode = 'chase'
    } else if (s.mode === 'chase') {
      const v = s.victim
      if (v) {
        // Calf hunt: chase the actual fleeing calf (drawn by the herds). If it
        // died some other way before we reached it, just close out into feed.
        if (v.dead || v.caught !== undefined) {
          if (v.caughtBy === 'crocodile') {
            // The crocodile stole the chase victim (point 194): §19.16 keeps the
            // two systems apart — the lion never feeds on a croc kill (it sinks).
            // Abort into the ordinary walk-off, never feed on the sinking prey.
            s.mode = 'leave'
            s.heading = leaveHeading(s.px, s.pz, pos.x, pos.z)
            s.leaveHeading = undefined
            s.leaveT = 0
            s.victim = null
            s.victimHunt = false
            s.lx = s.px + 0.7
            s.lz = s.pz + 0.25
          } else {
            s.mode = 'feed'
            s.timer = 30
          }
        } else {
          s.px = v.x
          s.pz = v.z
        }
      } else {
        // Generic hunt: the prey flees the lion but weaves left and right to try
        // to shake it (design.md §19); the lion pursues with a limited turn rate,
        // so sharp cuts throw it wide, though it is faster and closes in.
        const away = Math.atan2(s.px - s.lx, s.pz - s.lz)
        s.preyHeading = away + Math.sin(t * HUNT_WEAVE_FREQ + s.heading) * HUNT_WEAVE_AMP
        const nx = s.px + Math.sin(s.preyHeading) * HUNT_PREY_SPEED * dt
        const nz = s.pz + Math.cos(s.preyHeading) * HUNT_PREY_SPEED * dt
        // The prey balks at the open sea instead of fleeing into it (design.md
        // §19) — the hunter then takes it at the waterline.
        const nll = worldToLatLon(nx, nz)
        if (sampleTerrain(nll.lat, nll.lon, seed).type !== 'ocean') {
          s.px = nx
          s.pz = nz
        }
      }
      if (s.mode === 'chase') {
        const toX = s.px - s.lx
        const toZ = s.pz - s.lz
        const d = Math.hypot(toX, toZ)
        if (v && d < CALF_POUNCE_RADIUS) {
          // Pounce: lunge straight at the calf. The turn-rate limit's minimum
          // circle (~1.9) is wider than the catch distance, so a slow calf could
          // otherwise be orbited forever and never caught.
          s.lionHeading = Math.atan2(toX, toZ)
        } else {
          let dh = Math.atan2(toX, toZ) - s.lionHeading
          while (dh > Math.PI) dh -= Math.PI * 2
          while (dh < -Math.PI) dh += Math.PI * 2
          s.lionHeading += Math.max(-HUNT_LION_TURN * dt, Math.min(HUNT_LION_TURN * dt, dh))
        }
        const lx0 = s.lx
        const lz0 = s.lz
        s.lx += Math.sin(s.lionHeading) * HUNT_LION_SPEED * dt
        s.lz += Math.cos(s.lionHeading) * HUNT_LION_SPEED * dt
        // SWEPT catch (point 179): test the lion's MOVE SEGMENT against the prey,
        // not the pre-move point distance `d` — a big clamped-dt step or a
        // tangential pass would otherwise carry the lion THROUGH the calf without
        // ever sampling within the catch radius (the user report: it ran through
        // parent and calf and ate nobody).
        if (segPointDist(lx0, lz0, s.lx, s.lz, s.px, s.pz) < (v ? CALF_CATCH_DIST : 0.6)) {
          // Caught: a calf begins its struggle (the herds run the outcome); a
          // generic grazer is felled at once.
          if (v && v.caught === undefined && !v.dead) {
            v.caught = CAUGHT_DURATION
            // A seized vigil-keeper's watch is over (point 121 (f)): clearing
            // the field hands its pose to the caught thrash and lets the kill
            // flock reclaim the calf's remains it was standing off.
            v.vigil = undefined
          }
          s.mode = 'feed'
          s.timer = v ? 30 : FEED_DURATION
        }
        // Abort when the hunt strays beyond the visible surroundings — never
        // inside the view, so the animals do not vanish in sight (§19).
        if (Math.hypot(s.lx - pos.x, s.lz - pos.z) > offstageR) {
          s.mode = 'idle'
          s.timer = 10
        }
      }
    } else if (s.mode === 'feed') {
      const v = s.victim
      if (v) {
        // Feeding on a caught calf (or the parent that sacrificed itself): the
        // herds run the 5s struggle and its resolution, then shrink the carcass
        // via its dissolve timer; keep the predator on the victim and move on once
        // it is consumed (design.md §19).
        s.timer -= dt
        s.px = v.x
        s.pz = v.z
        if (v.dead) {
          if (v.dissolve === undefined) v.dissolve = CARCASS_DISSOLVE_SECONDS
          v.dissolve -= dt
        }
        const consumed = v.dead && (v.dissolve ?? 0) <= 0
        if (consumed || s.timer <= 0) {
          // A remnant stays behind only when a kill was actually eaten — a
          // feed that timed out over a rescued calf leaves nothing (§19).
          if (v.dead) {
            const remains = spawnRemnant(s, seed)
            // The vigil follows the remains (point 121 (f)): the keeper's
            // carcass anchor is handed from the consumed victim (dissolve
            // just hit 0 this frame — atomically before any gone-check can
            // observe it) to the scrap the predator leaves, otherwise the
            // vigil ended ~9 s in, long before the next idle window could
            // draw a predator. The remains persist under the keeper because
            // the flock may not land while it stands (§19.6 gate), so the
            // (e) resolve rule is unchanged: remains gone or window over.
            const keeperHerds = ACTIVE_HERDS
            if (remains && keeperHerds) {
              for (const csp of CALF_HUNT_SPECIES) {
                for (const k of keeperHerds[csp]) {
                  if (!k.dead && k.vigil !== undefined && k.vigil.carcass === v) k.vigil.carcass = remains
                }
              }
            }
          }
          s.mode = 'leave'
          s.heading = leaveHeading(s.px, s.pz, pos.x, pos.z)
          s.leaveHeading = undefined // fresh corridor pick per leave (point 188)
          s.leaveT = 0
          s.victim = null
          s.lx = s.px + 0.7
          s.lz = s.pz + 0.25
        }
      } else {
        s.timer -= dt
        if (s.timer <= 0) {
          // Carcass consumed: the lion moves on, leaving a scrap (§19).
          spawnRemnant(s, seed)
          s.mode = 'leave'
          s.heading = leaveHeading(s.px, s.pz, pos.x, pos.z)
          s.leaveHeading = undefined // fresh corridor pick per leave (point 188)
          s.leaveT = 0 // reset the overtime clock — the victim branch does too
          s.lx = s.px + 0.7
          s.lz = s.pz + 0.25
        }
      }
    } else {
      // Moving on: trot straight away from the traveller and leave the stage
      // only well beyond the visible surroundings (zoom-aware) — the predator
      // never despawns in sight (design.md §19). The walk-off obeys the same
      // land constraint as every animal: at a coast it deflects along the
      // shoreline instead of trotting into the open ocean (point 83).
      // The escape course re-aims AWAY FROM THE TRAVELLER every frame; the
      // coast deflection applies per STEP only. A persisted deflected
      // heading let a shoreline hold the predator tangentially inside the
      // view ring forever — it must always strive outward.
      const oceanAt = (nx: number, nz: number) => {
        const ll = worldToLatLon(nx, nz)
        return sampleTerrain(ll.lat, ll.lon, seed).type === 'ocean'
      }
      // Sticky escape corridor (point 188): the every-frame radial re-aim
      // shuttled the predator at a coast pocket — the radial points seaward,
      // the per-step deflection along the beach, and the turn cap dragged the
      // course back each frame. Pick the heading with the longest clear LAND
      // corridor (outward-biased) and HOLD it; re-derive only when the held
      // corridor closes just ahead.
      const radial = leaveHeading(s.lx, s.lz, pos.x, pos.z)
      const aheadBlocked = (h: number, d: number) => oceanAt(s.lx + Math.sin(h) * d, s.lz + Math.cos(h) * d)
      if (s.leaveHeading === undefined || aheadBlocked(s.leaveHeading, 1.2) || aheadBlocked(s.leaveHeading, 2.4)) {
        s.leaveHeading = escapeCorridorHeading(s.lx, s.lz, radial, oceanAt)
      }
      s.heading = turnToward(s.heading, s.leaveHeading, 1.8 * dt)
      if (oceanAt(s.lx, s.lz)) {
        // Standing IN water (a stale or scripted mishap): wade toward the
        // nearest dry probe first; the land rule takes over on the shore.
        for (let k = 0; k < 12; k++) {
          const h = s.heading + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 6)
          if (!oceanAt(s.lx + Math.sin(h) * 1.2, s.lz + Math.cos(h) * 1.2)) {
            s.heading = h
            break
          }
        }
        s.lx += Math.sin(s.heading) * HUNT_LEAVE_SPEED * dt
        s.lz += Math.cos(s.heading) * HUNT_LEAVE_SPEED * dt
      } else {
        let leaveStep = deflectedStep(s.lx, s.lz, s.heading, HUNT_LEAVE_SPEED * dt, oceanAt, 0.8)
        // Boxed in on a spit: walk back inland this frame rather than swim.
        if (!leaveStep.moved) leaveStep = deflectedStep(s.lx, s.lz, s.heading + Math.PI, HUNT_LEAVE_SPEED * dt, oceanAt, 0.8)
        s.lx = leaveStep.x
        s.lz = leaveStep.z
        if (leaveStep.moved) s.heading = leaveStep.heading
      }
      // Overtime backstop (point 188 — the audit found leave was the ONE drama
      // with no deadline): past the calibratable overtime a predator still
      // inside the ring retires the moment its spot is OFF the rendered frame,
      // so a coast pocket can never pin it forever while §19's "never despawns
      // in sight" still holds via the projection (never a radius).
      s.leaveT = (s.leaveT ?? 0) + dt
      const leaveOvertime = s.leaveT > balance.hunt.leaveOvertimeSeconds && !isOnScreen(s.lx, s.lz)
      if (Math.hypot(s.lx - pos.x, s.lz - pos.z) > offstageR || leaveOvertime) {
        s.mode = 'idle'
        s.timer = 30 + Math.random() * 30
        s.leaveHeading = undefined
        s.leaveT = 0
      }
    }

    const active = s.mode !== 'idle'
    const feeding = s.mode === 'feed'

    // Touching a wandering predator triggers its attack (design.md §14/§19):
    // when the player walks into the active predator, fire the event
    // (rate-limited by the store). Every predator attacks on contact now — the
    // lion remains the apex (highest fatal risk), the others less dangerous.
    if (active) {
      const predX = feeding ? s.px + 0.7 : s.lx
      const predZ = feeding ? s.pz + 0.25 : s.lz
      if (Math.hypot(predX - pos.x, predZ - pos.z) < LION_CONTACT_RADIUS) {
        useGame.getState().predatorContact(s.predator)
      }
    }

    if (lion.current) {
      lion.current.visible = active
      if (active) {
        const ll = worldToLatLon(s.lx, s.lz)
        const ground = Math.max(0.02, sampleTerrain(ll.lat, ll.lon, seed).height)
        if (feeding) {
          // Feeding (design.md §19): stand at the carcass flank, head down,
          // rhythmic tearing dips instead of the chase pose.
          lion.current.position.set(s.px + 0.7, ground, s.pz + 0.25)
          lion.current.rotation.y = Math.atan2(-0.7, -0.25)
          lion.current.rotation.x = 0.32 + Math.sin(t * 3.2) * 0.16
        } else {
          lion.current.position.set(s.lx, ground, s.lz)
          // Face the direction of travel (weaving pursuit / walk-off).
          lion.current.rotation.y = s.mode === 'leave' ? s.heading : s.lionHeading
          lion.current.rotation.x = 0
        }
      }
    }
    if (prey.current) {
      // The carcass disappears piece by piece while the lion feeds; once it
      // is gone (leave phase) nothing of it remains. In a calf hunt the victim is
      // a real herd animal drawn by <Herds>, so the scripted mesh stays hidden.
      prey.current.visible = (s.mode === 'chase' || feeding) && !s.victimHunt
      if (prey.current.visible) {
        const ll = worldToLatLon(s.px, s.pz)
        prey.current.position.set(s.px, Math.max(0.02, sampleTerrain(ll.lat, ll.lon, seed).height), s.pz)
        prey.current.rotation.y = feeding ? Math.atan2(s.px - s.lx, s.pz - s.lz) : s.preyHeading
        // Fallen on its side once caught.
        prey.current.rotation.z = feeding ? Math.PI / 2.2 : 0
        const eaten = feeding ? Math.min(1, (FEED_DURATION - s.timer) / FEED_DURATION) : 0
        prey.current.scale.setScalar(Math.max(0.06, 1 - eaten * 0.96))
      }
    }
    if (stain.current) {
      // The red stain stays behind while the lion walks off. A calf kill's stain
      // is drawn by <Herds> at the victim, so the scripted stain stays hidden.
      stain.current.visible = (feeding || s.mode === 'leave') && !s.victimHunt
      if (stain.current.visible) {
        const heightAt = (px: number, pz: number) => {
          const l = worldToLatLon(px, pz)
          return sampleTerrain(l.lat, l.lon, seed).height
        }
        // Laid into the local slope plane — a horizontal disc on a hillside
        // got wedges swallowed by the ground (design.md §19).
        const [nx, ny, nz] = groundNormal(s.px, s.pz, heightAt)
        const y = Math.max(0.02, heightAt(s.px, s.pz))
        stain.current.position.set(s.px + nx * 0.08, y + ny * 0.08, s.pz + nz * 0.08)
        stainFlat.setFromEuler(stainEuler.set(-Math.PI / 2, 0, 0))
        stain.current.quaternion.setFromUnitVectors(stainUp, stainNrm.set(nx, ny, nz)).multiply(stainFlat)
        // The stain spreads while the lion feeds.
        const spread = feeding ? Math.min(1, (FEED_DURATION - s.timer) / 6) : 1
        stain.current.scale.setScalar(0.4 + spread * 0.9)
      }
    }
  })

  return (
    <>
      <group ref={lion} visible={false}>
        <mesh ref={predatorMesh} geometry={predatorGeo.lion} material={material} castShadow dispose={null} />
      </group>
      <group ref={prey} visible={false}>
        <mesh ref={preyMesh} geometry={preyGeo.zebra} material={material} castShadow dispose={null} />
      </group>
      <mesh ref={stain} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.1, 20]} />
        <meshStandardMaterial color="#a51512" roughness={1} transparent opacity={0.8} />
      </mesh>
    </>
  )
}

/**
 * Vultures circling the player as a warning sign of poor condition
 * (design.md §19), bound to the health system of design.md §6.
 */
function Vultures() {
  const group = useRef<THREE.Group>(null)
  const killGroup = useRef<THREE.Group>(null)
  // Flight states so neither flock ever pops in or out of the picture: they
  // spawn beyond the zoom-aware view ring, fly in, and when their reason
  // passes fly off and despawn only well outside the view (design.md §19).
  const playerFlight = useRef<FlightState>({ mode: 'idle', x: 0, z: 0 })
  const killFlight = useRef<FlightState>({ mode: 'idle', x: 0, z: 0 })
  /** 0 = circling overhead, 1 = landed on the remnant and feeding. */
  const killDescend = useRef(0)
  /** Dev/verify: this frame's minimum landed-bird clearance above ground. */
  const clearance = useRef(Infinity)
  // Geometry/material from the module pool (point 96): no per-mount rebuild,
  // no leak under the travel scene's dispose={null}.
  const geo = getWildlifeMeshes().vultureGeo
  const material = getWildlifeMeshes().material

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__vultures = { player: group, kill: killGroup, playerFlight, killFlight, killDescend, clearance }
    return () => {
      delete w.__vultures
    }
  }, [])

  const circle = (g: THREE.Group, t: number, baseR: number, height: number) => {
    g.children.forEach((bird, i) => {
      const phase = (i / g.children.length) * Math.PI * 2
      const a = t * 0.45 + phase
      const r = baseR + i * 0.9
      bird.position.set(Math.cos(a) * r, height + Math.sin(t * 0.8 + phase) * 0.6, Math.sin(a) * r)
      bird.rotation.y = -a - Math.PI / 2
      bird.rotation.z = 0.25 // banking into the circle
      bird.scale.setScalar(1.6)
    })
  }

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = useGame.getState()
    const t = clock.elapsedTime
    const viewR = VIEW_AT_ZOOM1 * useUi.getState().travelZoom
    if (group.current) {
      const poor = healthState(s.health) === 'poor' && s.mode === 'travel'
      const f = playerFlight.current
      flightStep(f, poor, s.pos.x, s.pos.z, s.pos.x, s.pos.z, viewR, VULTURE_FLY_SPEED, dt, 2, (x, z) => !isOnScreen(x, z))
      if (f.mode === 'active') {
        // Track the traveller while circling overhead.
        f.x += (s.pos.x - f.x) * Math.min(1, dt * 2)
        f.z += (s.pos.z - f.z) * Math.min(1, dt * 2)
      }
      group.current.visible = f.mode !== 'idle'
      if (f.mode !== 'idle') {
        // Circle relative to the local ground — over high terrain a y=0 base
        // pulled the flock into (or under) the relief.
        const gll = worldToLatLon(f.x, f.z)
        group.current.position.set(f.x, Math.max(0, sampleTerrain(gll.lat, gll.lon, s.seed).height), f.z)
        circle(group.current, t, 4.5, 5.5)
      }
    }
    // Vultures also gather above a lion kill (design.md §19) — and once the
    // predator has moved on, the SAME flock descends onto the remnant and
    // finishes it: the birds that circled the kill take the scrap, no new
    // scavenger flies in for it.
    if (killGroup.current) {
      let remnant: Animal | null = null
      if (ACTIVE_HERDS) {
        outer: for (const sp of SPECIES) {
          for (const a of ACTIVE_HERDS[sp]) {
            if (a.remnant && a.dead && !a.gone && (a.dissolve === undefined || a.dissolve > 0)) {
              remnant = a
              break outer
            }
          }
        }
      }
      // The flock lands as soon as the predator has cleared the site — not
      // only after its whole walk-off despawned (user report: too late).
      // lx/lz is the predator's actual position — during the walk-off px/pz
      // stays at the kill site and would keep the distance at zero forever.
      const toRemnant =
        remnant !== null &&
        killFlockMayDescend(LION_STATE.mode, LION_STATE.lx, LION_STATE.lz, remnant.x, remnant.z) &&
        // The vigil (point 121): while a live keeper stands over the kill site
        // the flock does NOT land — it keeps circling until the vigil ends.
        !(ACTIVE_HERDS !== null && vigilBlocksLanding(nearestVigilKeeperDist(ACTIVE_HERDS, remnant.x, remnant.z)))
      const f = killFlight.current
      flightStep(
        f,
        // Present while the predator FEEDS, and afterwards only if a real kill
        // left a scrap (point 162): a drive-off sends the hunt to 'leave' with no
        // remnant, and the old `mode === 'leave'` keying flew the flock in over a
        // kill that never happened. The feed->leave descent rides on the remnant,
        // not on 'leave', so it is unchanged. killFlockActive is pure-tested.
        killFlockActive(LION_STATE.mode, remnant !== null),
        toRemnant && remnant ? remnant.x : LION_STATE.px,
        toRemnant && remnant ? remnant.z : LION_STATE.pz,
        s.pos.x,
        s.pos.z,
        viewR,
        VULTURE_FLY_SPEED,
        dt,
        2,
        (x, z) => !isOnScreen(x, z), // spawn OFF the rendered frame, fly in (point 178)
      )
      const consuming =
        toRemnant &&
        remnant !== null &&
        f.mode === 'active' &&
        Math.hypot(f.x - remnant.x, f.z - remnant.z) < 2.2
      if (consuming && remnant) {
        f.x += (remnant.x - f.x) * Math.min(1, dt * 3)
        f.z += (remnant.z - f.z) * Math.min(1, dt * 3)
        // Only landed birds eat; the scrap dissolves like a scavenged carcass.
        if (killDescend.current > 0.7) {
          if (remnant.dissolve === undefined) remnant.dissolve = CARCASS_DISSOLVE_SECONDS
          remnant.dissolve -= dt
        }
      }
      killDescend.current = Math.max(
        0,
        Math.min(1, killDescend.current + (consuming ? dt / 1.4 : -dt / 1.4)),
      )
      killGroup.current.visible = f.mode !== 'idle'
      // The clearance metric covers BOTH vulture systems (point 128): the
      // kill flock measured below, the ground scavenger folded in from the
      // Wildlife frame via SCAV_CLEARANCE.
      let killMinClear = Infinity
      clearance.current = SCAV_CLEARANCE.v
      if (f.mode !== 'idle') {
        const kll = worldToLatLon(f.x, f.z)
        const killGroundY = Math.max(0, sampleTerrain(kll.lat, kll.lon, s.seed).height)
        killGroup.current.position.set(f.x, killGroundY, f.z)
        const dsc = killDescend.current
        if (dsc <= 0) {
          circle(killGroup.current, t * 1.15, 3.2, 4.6)
        } else {
          // Blend the circling pose down into the scavenger-style meal
          // cluster: the flock spirals in, lands and pecks.
          const g = killGroup.current
          g.children.forEach((bird, i) => {
            const phase = (i / g.children.length) * Math.PI * 2
            const a = t * 1.15 * 0.45 + phase
            const r = 3.2 + i * 0.9
            const cx = Math.cos(a) * r
            const cy = 4.6 + Math.sin(t * 1.15 * 0.8 + phase) * 0.6
            const cz = Math.sin(a) * r
            const lr = 0.5 + i * 0.35
            const lx = Math.cos(phase) * lr
            const lz = Math.sin(phase) * lr
            // The shared landed-bird rule (points 128 + 202 + 217): positive-only
            // lift onto the highest ground under the bird's EXTENTS, with the
            // clearance derived from the POSED lowest point — head AND the spread
            // WING TIPS under the pitch/yaw pose (a low-side wing tip dips deeper
            // than the head; point 217).
            const kPitch = 0.6 + Math.sin(t * 4 + phase) * 0.3
            let bg = 0
            for (const [ox, oz] of birdExtentOffsets(phase, 1.6)) {
              const bll = worldToLatLon(f.x + lx + ox, f.z + lz + oz)
              bg = Math.max(bg, sampleTerrain(bll.lat, bll.lon, s.seed).height)
            }
            const hop = Math.abs(Math.sin(t * 3 + phase)) * 0.12
            const ly = landedBirdYPosed(killGroundY, bg, hop, kPitch, phase, 1.6)
            bird.position.set(cx + (lx - cx) * dsc, cy + (ly - cy) * dsc, cz + (lz - cz) * dsc)
            if (dsc > 0.6) killMinClear = Math.min(killMinClear, landedBirdClearancePosed(killGroundY, bg, hop, kPitch, phase, 1.6))
            if (dsc > 0.6) {
              bird.rotation.set(kPitch, phase, 0) // pecking down
            } else {
              bird.rotation.set(0, -a - Math.PI / 2, 0.25) // still banking
            }
            bird.scale.setScalar(1.6)
          })
        }
        clearance.current = Math.min(killMinClear, SCAV_CLEARANCE.v)
      }
    }
  })

  return (
    <>
      <group ref={group} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={geo} material={material} dispose={null} />
        ))}
      </group>
      <group ref={killGroup} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={geo} material={material} dispose={null} />
        ))}
      </group>
    </>
  )
}

export function Wildlife() {
  return (
    <>
      <Herds />
      <LionHunt />
      <Vultures />
    </>
  )
}
