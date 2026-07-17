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
import { setAmbienceAnimals } from '../../systems/ambience'
import { setAnimalCollider } from './wildlifeCollision'
import { latLonToWorld, regionAt, PLACES, UNITS_PER_DEGREE, worldToLatLon, type RegionId } from '../../world/geo'
import { RIVER_WIDTH_DEG, sampleTerrain } from '../../world/terrain'
import { drinkWalkDistance } from './waterEdgeRules'
import { CURRENT_WEATHER } from '../../systems/season'
import { lakeDistance, riverDistance, riverFlow } from '../../world/geoIndex'
import { hashChunk, mulberry32 } from '../../world/noise'
import { balance } from '../../config/balance'
import {
  blockHeading,
  griefTarget,
  fleeHeading,
  flightStep,
  gambolState,
  groundNormal,
  leashedGambolDir,
  separationPush,
  turnToward,
  killFlockMayDescend,
  deflectedStep,
  type FlightState,
  channelDriftStep,
  drinkCatchment,
  mireFate,
  mireRoll,
  parentDefends,
  PREDATOR_PREY,
  REGION_PREY,
  type PredatorKind,
  type PreyKind,
  vicinitySeedBounds,
  seasonFlowFactor,
  vigilBlocksLanding,
  vigilDrawReady,
  vigilDrawSpawn,
  waterStruggleFate,
} from './wildlifeBehavior'
import { WATERFALLS } from '../../world/data/landmarks'
import {
  buildAntelope,
  buildAntelopeCalf,
  buildCheetah,
  buildElephant,
  buildFlamingo,
  buildGiraffe,
  buildHyena,
  buildLeopard,
  buildLion,
  buildVulture,
  buildWarthog,
  buildWarthogCalf,
  buildWildebeest,
  buildWildebeestCalf,
  buildZebra,
  buildZebraCalf,
} from '../../render/fauna'

const CHUNK_SIZE = 24

type Species = 'elephant' | 'giraffe' | 'zebra' | 'wildebeest' | 'antelope' | 'warthog' | 'flamingo'
const SPECIES: Species[] = ['elephant', 'giraffe', 'zebra', 'wildebeest', 'antelope', 'warthog', 'flamingo']
const MAX_INSTANCES: Record<Species, number> = {
  elephant: 60,
  giraffe: 60,
  zebra: 120,
  wildebeest: 120,
  antelope: 120,
  warthog: 80,
  flamingo: 140,
}
/** Juveniles render through their own baby-schema geometry (design.md §19) in
 *  a separate instanced mesh per species; one calf per herd group keeps the
 *  counts small. Flamingos raise no young. */
const CALF_SPECIES: Exclude<Species, 'flamingo'>[] = ['elephant', 'giraffe', 'zebra', 'wildebeest', 'antelope', 'warthog']
const MAX_CALF_INSTANCES = 24

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
   *  the facing never snaps between flanking threats (design.md §19). */
  dodgeHeading?: number
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
  /** Seconds left of the defence-kick pose (design.md §19.8, point 124): set
   *  when this parent drove the hunt off its calf — it rears and strikes out
   *  with its hind legs at the departing predator, then settles. */
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
}
const LION_STATE: LionHuntState = {
  mode: 'idle', lx: 0, lz: 0, px: 0, pz: 0, timer: 0, heading: 0, lionHeading: 0, preyHeading: 0,
  predator: 'lion', prey: 'zebra', victim: null, victimHunt: false,
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

/** Which predators roam each region (~1890 range). Lions everywhere; cheetahs
 *  and hyenas favour the open eastern/southern plains; leopards the wooded
 *  west/centre; the arid north holds lion, cheetah and leopard. */
const REGION_PREDATORS: Record<RegionId, PredatorKind[]> = {
  east: ['lion', 'cheetah', 'hyena', 'leopard'],
  south: ['lion', 'cheetah', 'hyena', 'leopard'],
  central: ['lion', 'leopard'],
  west: ['lion', 'leopard'],
  north: ['lion', 'cheetah', 'leopard'],
}
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
}
const TRAMPLE_RADIUS = 1.5
const FLEE_RADIUS = 14
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
/** Family life (design.md §19): a calf keeps within this radius of its parent,
 *  and a parent moves between an approaching predator and its calf to guard it,
 *  standing off a short distance in front of the young. */
const YOUNG_FOLLOW_RADIUS = 1.8
const YOUNG_FOLLOW_SPEED = 4.5
const GUARD_RADIUS = 12
const GUARD_STANDOFF = 2.2
const GUARD_SPEED = 5.5
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
const CALF_HUNT_CHANCE = 0.6 // chance a hunt targets a calf near the player over a generic grazer
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
const PARENT_CHARGE_SPEED = 6.5 // a parent rushes the predator eating its calf faster than it guards
const PARENT_SACRIFICE_DIST = 1.3 // parent reaches the predator → sacrifices itself
const PARENT_TOO_LATE_DIST = 3.2 // parent only this close when the window ends → both eaten
/** The vigil (point 121): the bereaved parent holds this close to the carcass. */
const VIGIL_HOLD_DIST = 1.5
/** The blocking station sits this far from the hunted calf toward the hunter —
 *  beyond the catch reach (CALF_CATCH_DIST), so a closing hunter meets the
 *  shield first. The shield sprints a notch faster than the calf's flee so it
 *  can hold the moving station, and the hunter takes a blocking parent within
 *  PARENT_TAKE_DIST. */
const PARENT_BLOCK_OFFSET = 1.8
const PARENT_BLOCK_SPEED = 6
const PARENT_TAKE_DIST = 1.0
/** Species whose calves a predator hunt can target (design.md §19). The
 *  giraffe joined with point 124 — its calves are run down by the LION only
 *  (the food web gates the predator pick), and its parent's charge may end in
 *  the kick instead of the sacrifice. */
const CALF_HUNT_SPECIES = ['zebra', 'wildebeest', 'antelope', 'warthog', 'giraffe'] as const
/** Duration of the rendered defence kick (design.md §19.8, point 124): the
 *  parent that drove the hunt off rears and strikes before settling back. */
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
const GAMBOL_PERIOD = 16 // s between play bouts (bout = first quarter)
const GAMBOL_ACTIVE = 0.25
const GAMBOL_SPEED = 2.2
const GAMBOL_RANGE = 4 // calves only play while this close to the parent
const CALF_DRIFT_DEG = 0.06 // deg/s downstream drift of a struggling calf
const WADE_SPEED = 4.2 // parent wading to its calf
const RESCUE_REACH = 1.2 // parent this close pulls the calf out
const RETURN_SPEED = 3 // walking back to the rescue entry
const FALLS_DEATH_RADIUS_DEG = 0.2 // in water this close to a fall = swept over
const PLUNGE_SPEED = 5.5 // a parent rushing after its swept-over calf
const PLUNGE_REACH = 1
const STRUGGLE_SELF_RESCUE = 25 // s after which an unaided calf clambers out
const TRAMPLE_GRIEF_SPEED = 6.5 // a parent rushing the elephant that trampled its calf
const TRAMPLE_GRIEF_SECONDS = 12 // grief window; an unresolved charge clears here
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
const SPAWN_RANGE_MAX = 6
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
  return { elephant: [], giraffe: [], zebra: [], wildebeest: [], antelope: [], warthog: [], flamingo: [] }
}

/** Populate one chunk's deterministic herd/flock into the shared herd arrays,
 *  tagging each animal with its chunk key so it can be streamed out later. */
function spawnChunk(herds: Record<Species, Animal[]>, ccx: number, ccz: number, seed: number): void {
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

  let species: Species | null = null
  let count = 0
  if (anchor.type === 'savanna') {
    if (roll < 0.12) species = 'elephant'
    else if (roll < 0.2) species = 'giraffe'
    else if (roll < 0.32) species = 'zebra'
    else if (roll < 0.44) species = 'wildebeest'
    else if (roll < 0.55) species = 'antelope'
    else if (roll < 0.62) species = 'warthog'
    count = species === 'elephant' ? 5 : species === 'giraffe' ? 3 : species === 'warthog' ? 4 : 7
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
      y: shoreline ? 0.02 : Math.max(0.02, s.height),
      rot: r3 * Math.PI * 2,
      scale: sc,
      phase: r1 * Math.PI * 2,
      ...(herdId !== undefined ? { herd: herdId } : {}),
      ...(chunkKey !== undefined ? { chunk: chunkKey } : {}),
    }
    // Animals near water periodically walk to the shore and drink
    // (design.md §19); the shore point follows the water-distance gradient.
    if (!shoreline) {
      const rd = riverDistance(ll.lat, ll.lon, 0.5)
      const ld = lakeDistance(ll.lat, ll.lon, 0.5)
      const wd = Math.min(ld, rd)
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
      if (wd > 0.02 && wd < catchment) {
        const e = 0.03
        const gLat =
          Math.min(lakeDistance(ll.lat + e, ll.lon, 0.6), riverDistance(ll.lat + e, ll.lon, 0.6)) -
          Math.min(lakeDistance(ll.lat - e, ll.lon, 0.6), riverDistance(ll.lat - e, ll.lon, 0.6))
        const gLon =
          Math.min(lakeDistance(ll.lat, ll.lon + e, 0.6), riverDistance(ll.lat, ll.lon + e, 0.6)) -
          Math.min(lakeDistance(ll.lat, ll.lon - e, 0.6), riverDistance(ll.lat, ll.lon - e, 0.6))
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
  // Family life (design.md §19): a herd of at least three raises a juvenile that
  // keeps close to a parent and nurses; the parent guards it against predators.
  // Flamingos (shoreline flocks) are excluded. Counted over the animals actually
  // placed (spots on water are skipped above), so the parent/calf link can never
  // reach back into an earlier group's animals.
  if (!shoreline && list.length - placedStart >= 3) {
    const parent = list[placedStart]
    const calf = list[list.length - 1]
    if (parent && calf && parent !== calf) {
      calf.young = true
      calf.parent = parent
      calf.scale *= 0.55 // a small juvenile
      parent.child = calf
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
    // Deterministic placement from the settlement id + world seed.
    let h = 0
    for (const c of place.id) h = (h * 31 + c.charCodeAt(0)) | 0
    const rand = mulberry32(((seed ^ h) + 0x102) >>> 0)
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
    // Search a few deterministic offsets for a land anchor inside the ring,
    // past the clearance — a coastal port may face water on some bearings.
    let ax = 0
    let az = 0
    let found = false
    for (let k = 0; k < 8 && !found; k++) {
      const dir = rand() * Math.PI * 2
      const dist = bounds.distMin + rand() * Math.max(1, bounds.distMax - bounds.distMin)
      ax = w.x + Math.cos(dir) * dist
      az = w.z + Math.sin(dir) * dist
      const ll = worldToLatLon(ax, az)
      const s = sampleTerrain(ll.lat, ll.lon, seed)
      if (s.type !== 'ocean' && s.type !== 'water' && s.height > 0.05) found = true
    }
    if (!found) continue
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
  const species = pool[Math.floor(rand() * pool.length)]
  const deficit = min - count
  if (herds[species].length + deficit > MAX_INSTANCES[species]) return
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
  }
  const calfGeometries: Record<(typeof CALF_SPECIES)[number], THREE.BufferGeometry> = {
    elephant: buildElephant(true),
    giraffe: buildGiraffe(true),
    zebra: buildZebraCalf(),
    wildebeest: buildWildebeestCalf(),
    antelope: buildAntelopeCalf(),
    warthog: buildWarthogCalf(),
  }
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
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
  // Chunks currently populated in herdsRef (streaming key set).
  const spawnedChunks = useRef(new Set<string>())
  // Shared per-herd roaming state (heading + arc phase), keyed by herd id.
  const herdState = useRef(new Map<number, { heading: number; phase: number }>())
  // Rotating index of the water backstop sweep (open sea AND river/lake
  // water outside the scripted dramas, design.md §19).
  const waterSweep = useRef(0)
  // Scavenger vulture that flies to and consumes a non-lion carcass. Its x/z
  // and mode live in a FlightState so it flies in from — and departs to —
  // beyond the zoom-aware view ring instead of popping (design.md §19).
  const scavengeGroup = useRef<THREE.Group>(null)
  const scavenger = useRef<FlightState & { y: number; landed: boolean; target: Animal | null }>({
    mode: 'idle',
    x: 0,
    z: 0,
    y: 14,
    landed: false,
    target: null,
  })

  // Juveniles keep their own baby-schema build (design.md §19) — geometries,
  // materials and meshes all live in the module pool (point 96).
  const calfMeshRefs = useRef<Partial<Record<Species, THREE.InstancedMesh>>>(pool.calf)
  const material = pool.material
  const vultureGeo = pool.vultureGeo

  useEffect(() => {
    herdsRef.current = emptyHerds()
    spawnedChunks.current.clear()
    herdState.current.clear()
    scavenger.current.target = null
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
      scavenger.current.target = null
    }
    w.__wildlife = { herdsRef, stains, spawnedChunks, scavenger, restock, calfMeshRefs }
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
        spawnChunk(herds, ccx, ccz, seed)
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

    // Calf predation resolution (design.md §19), over the FULL herd lists — not
    // just the rendered slice — so a caught calf's struggle countdown and its
    // parent's rescue charge always resolve, even when a herd exceeds the
    // instance cap and the family straddles the rendered boundary. The render
    // loop below only poses these animals; the state transitions happen here.
    for (const sp of CALF_HUNT_SPECIES) {
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
            takeAnimal(a, { stain: true })
            const par = a.parent
            if (par && !par.dead && Math.hypot(par.x - a.x, par.z - a.z) < PARENT_TOO_LATE_DIST) {
              takeAnimal(par, { stain: true })
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
          a.x += (toX / d) * PARENT_CHARGE_SPEED * dt
          a.z += (toZ / d) * PARENT_CHARGE_SPEED * dt
          if (d < PARENT_SACRIFICE_DIST) {
            // The defence roll (design.md §19.8, point 124): a charging parent
            // may drive the hunt off instead of dying — the giraffe cow's
            // kick. Deterministic per event (hashed from phase and position,
            // like the mire roll — never Math.random in the sim). A MIRED
            // calf never rolls (point 123): the mud deaths are deliberate.
            const roll = Math.abs(Math.sin(a.phase * 127.1 + a.x * 311.7 + a.z * 74.7)) % 1
            if (calf.mired === undefined && parentDefends(sp, roll, balance.parentDefense)) {
              // Driven off: the calf is freed and rises, the parent LIVES and
              // strikes (the kick pose below), and the predator leaves through
              // the existing walk-off — never a despawn in sight.
              calf.caught = undefined
              a.kick = PARENT_KICK_SECONDS
              if (LION_STATE.victim === calf) {
                LION_STATE.victim = null
                LION_STATE.mode = 'leave'
                LION_STATE.heading = leaveHeading(LION_STATE.lx, LION_STATE.lz, pos.x, pos.z)
                // The feeding predator stood at the carcass flank — pick the
                // walk-off up from there, like the feed→leave exit does.
                LION_STATE.lx = LION_STATE.px + 0.7
                LION_STATE.lz = LION_STATE.pz + 0.25
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
              takeAnimal(a, { stain: true })
              if (LION_STATE.victim === calf) LION_STATE.victim = a // the predator feeds on the parent now
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
            a.x += Math.sin(h) * PARENT_BLOCK_SPEED * dt
            a.z += Math.cos(h) * PARENT_BLOCK_SPEED * dt
          }
          if (Math.hypot(LION_STATE.lx - a.x, LION_STATE.lz - a.z) < PARENT_TAKE_DIST) {
            // The defence roll (design.md §19.8, point 124), same rule as the
            // charge above: the hunter that reaches the living shield may be
            // kicked off instead of taking it. Deterministic per event.
            const roll = Math.abs(Math.sin(a.phase * 127.1 + a.x * 311.7 + a.z * 74.7)) % 1
            if (parentDefends(sp, roll, balance.parentDefense)) {
              // Driven off mid-chase: the family stays whole and the hunt
              // ends — the predator turns and leaves from where it stands.
              a.kick = PARENT_KICK_SECONDS
              LION_STATE.victim = null
              LION_STATE.mode = 'leave'
              LION_STATE.heading = leaveHeading(LION_STATE.lx, LION_STATE.lz, pos.x, pos.z)
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
              a.y = Math.max(0.02, ter.height)
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
              a.y = Math.max(0.02, sampleTerrain(nll.lat, nll.lon, seed).height)
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
              a.x += (dx / d) * WADE_SPEED * dt
              a.z += (dz / d) * WADE_SPEED * dt
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
              a.y = Math.max(0.02, ter.height)
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
        a.trampleTo = target
        const dx = target.x - a.x
        const dz = target.z - a.z
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
        (b.child !== undefined && !b.child.dead && (b.child.caught !== undefined || b.child.mired !== undefined)) ||
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
          const [dx, dz] = separationPush(a.x, a.z, neighbors)
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
        // Flamingos are shoreline waders — standing in shallow water is their
        // design (§19); everyone else is set back to land.
        if (sp === 'flamingo') continue
        const list = herds[sp]
        for (let i = phase; i < list.length; i += 7) {
          const a = list[i]
          // Water drama (struggle, rescue, plunge, a wading parent) owns its
          // own movement; everyone else must never STAND in water — not in
          // the open sea, and not in a river or lake either (an animal only
          // reaches the water's edge to drink, design.md §19).
          if (a.dead || a.inWater !== undefined || a.mired !== undefined || a.rescued || a.plungeTo || a.trampleTo || a.vigil)
            continue
          if (a.child && !a.child.dead && (a.child.inWater !== undefined || a.child.mired !== undefined)) continue
          const ll = worldToLatLon(a.x, a.z)
          const ter = sampleTerrain(ll.lat, ll.lon, seed).type
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

    // Proximity animal calls for the ambience (design.md §19): report the
    // nearest live animal of each voice group so their sounds rise as the
    // player draws near, all under the single ambience volume.
    {
      const AUDIBLE = 48
      const near = { elephant: 0, lion: 0, grazer: 0, flock: 0 }
      const consider = (dx: number, dz: number, key: keyof typeof near) => {
        const d = Math.hypot(dx, dz)
        if (d < AUDIBLE) near[key] = Math.max(near[key], 1 - d / AUDIBLE)
      }
      for (const a of herds.elephant) if (!a.dead) consider(a.x - pos.x, a.z - pos.z, 'elephant')
      for (const sp of ['zebra', 'wildebeest', 'antelope', 'warthog', 'giraffe'] as const)
        for (const a of herds[sp]) if (!a.dead) consider(a.x - pos.x, a.z - pos.z, 'grazer')
      for (const a of herds.flamingo) if (!a.dead) consider(a.x - pos.x, a.z - pos.z, 'flock')
      if (LION_STATE.mode === 'chase' || LION_STATE.mode === 'feed')
        consider(LION_STATE.lx - pos.x, LION_STATE.lz - pos.z, 'lion')
      setAmbienceAnimals(near)
    }

    const t = clock.elapsedTime
    const lionActive = LION_STATE.mode === 'chase' || LION_STATE.mode === 'feed'

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
        st.heading += Math.sin(t * 0.08 + st.phase) * ELEPHANT_HERD_ARC * dt
        // Steer the herd away from ground it cannot cross (ahead of its centre).
        const fll = worldToLatLon(ccx + Math.sin(st.heading) * 9, ccz + Math.cos(st.heading) * 9)
        const ft = sampleTerrain(fll.lat, fll.lon, seed).type
        if (ft !== 'savanna' && ft !== 'jungle') st.heading += ELEPHANT_TURN * 2 * dt
        herdCentre.set(hid, { cx: ccx, cz: ccz, heading: st.heading })
      }
    }
    const elephantPos: Array<[number, number]> = []
    {
      const list = herds.elephant
      const n = Math.min(list.length, MAX_INSTANCES.elephant)
      for (let i = 0; i < n; i++) {
        const a = list[i]
        if (a.dead) continue
        if (a.heading === undefined) a.heading = a.rot
        const info = a.herd !== undefined ? herdCentre.get(a.herd) : undefined
        // Follow the herd heading; steer back toward the centre if drifting off.
        let desired = a.heading
        if (info) {
          const toCx = info.cx - a.x
          const toCz = info.cz - a.z
          desired = Math.hypot(toCx, toCz) > ELEPHANT_COHESION ? Math.atan2(toCx, toCz) : info.heading
        } else {
          desired = a.heading + Math.sin(t * 0.1 + a.phase * 5) * 0.4
        }
        // If the ground just ahead cannot be crossed, redirect the desired
        // heading toward the herd (or away) — but still turn only gently.
        const aheadLL = worldToLatLon(a.x + Math.sin(a.heading) * 6, a.z + Math.cos(a.heading) * 6)
        const aheadT = sampleTerrain(aheadLL.lat, aheadLL.lon, seed).type
        if (aheadT !== 'savanna' && aheadT !== 'jungle') {
          desired = info ? Math.atan2(info.cx - a.x, info.cz - a.z) : a.heading + Math.PI * 0.6
        }
        let dh = desired - a.heading
        while (dh > Math.PI) dh -= Math.PI * 2
        while (dh < -Math.PI) dh += Math.PI * 2
        // Gentle arc only — clamp the per-frame turn (never a sharp turn).
        a.heading += Math.max(-ELEPHANT_TURN * dt, Math.min(ELEPHANT_TURN * dt, dh))
        const nx = a.x + Math.sin(a.heading) * ELEPHANT_SPEED * dt
        const nz = a.z + Math.cos(a.heading) * ELEPHANT_SPEED * dt
        const ll = worldToLatLon(nx, nz)
        const ter = sampleTerrain(ll.lat, ll.lon, seed)
        if (ter.type === 'savanna' || ter.type === 'jungle') {
          a.x = nx
          a.z = nz
          a.y = Math.max(0.02, ter.height)
        }
        // Else hold position this frame and keep turning gently next frame.
        elephantPos.push([a.x, a.z])
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
      const sc = scavenger.current
      const targetValid = (a: Animal | null): a is Animal =>
        !!a &&
        !!a.dead &&
        !a.lionFed &&
        !a.remnant &&
        !a.gone &&
        (a.dissolve === undefined || a.dissolve > 0) &&
        // The vigil (point 121): a live keeper standing over the carcass keeps
        // the bird off — an in-flight scavenger releases it and turns away.
        !vigilBlocksLanding(nearestVigilKeeperDist(herds, a.x, a.z))
      if (!targetValid(sc.target)) {
        sc.target = null
        let bestD = Infinity
        for (const sp of SPECIES) {
          for (const a of herds[sp]) {
            if (!a.dead || a.lionFed) continue // the on-scene predator eats its own kill
            if (a.remnant) continue // hunt scraps belong to the circling kill flock
            if (a.dissolve !== undefined && a.dissolve <= 0) continue
            // The vigil (point 121): never commit to a guarded carcass.
            if (vigilBlocksLanding(nearestVigilKeeperDist(herds, a.x, a.z))) continue
            const d = Math.hypot(a.x - pos.x, a.z - pos.z)
            if (d < bestD) {
              bestD = d
              sc.target = a
            }
          }
        }
      }
      const sg = scavengeGroup.current
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
      )
      sc.landed = sc.mode === 'active' && target !== null
      if (sg) {
        sg.visible = sc.mode !== 'idle'
        if (sc.mode !== 'idle') {
          if (sc.landed && target) {
            sc.x = target.x
            sc.z = target.z
            // Stand clear of the ground: the pecking head tilts well below the
            // group origin, so keep the group high enough that it never clips
            // into the terrain (design.md §19).
            sc.y = target.y + 0.5
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
            const ph = (i / sg.children.length) * Math.PI * 2
            if (sc.landed) {
              const r = 0.5 + i * 0.35
              const bx = Math.cos(ph) * r
              const bz = Math.sin(ph) * r
              // Positive-only hop so the body never dips below the group, a
              // gentler peck, and a slope lift: on rising ground beside the
              // carcass the bird stands on ITS ground, not the carcass point.
              const bll = worldToLatLon(sc.x + bx, sc.z + bz)
              const lift = Math.max(0, Math.max(0, sampleTerrain(bll.lat, bll.lon, seed).height) - sc.y)
              bird.position.set(bx, lift + 0.05 + Math.abs(Math.sin(t * 3 + ph)) * 0.1, bz)
              bird.rotation.set(0.45 + Math.abs(Math.sin(t * 4 + ph)) * 0.3, ph, 0) // heads pecking down
            } else {
              const a2 = t * 0.6 + ph
              bird.position.set(Math.cos(a2) * 2.4, 1.6 + i * 0.6, Math.sin(a2) * 2.4)
              bird.rotation.set(0, -a2 - Math.PI / 2, 0.2)
            }
            bird.scale.setScalar(1.5)
          })
        } else {
          sc.landed = false
        }
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
            if (k > 0.04) yaw = Math.atan2(toX, toZ) + (cycle >= 0.38 ? Math.PI : 0)
            if (cycle >= 0.12 && cycle < 0.38) {
              if (a.bathe) bodyY = a.y - 0.35 + Math.sin(t * 3 + a.phase) * 0.05 // wallow/splash
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
          if (a.caught !== undefined && a.caught > 0) {
            // Caught by a predator (resolved in the full-list pre-pass above):
            // thrash in place — no stain or shrink yet — while a parent may
            // still reach the predator and save it (§19). Not young-gated:
            // the seized vigil-keeper (point 121 (f)) is the one ADULT that
            // can be caught, and it thrashes like any taken prey.
            px = a.x + Math.sin(t * 13 + a.phase) * 0.14
            pz = a.z + Math.cos(t * 11 + a.phase) * 0.14
            yaw = a.rot + Math.sin(t * 16 + a.phase) * 0.7
            pitch = Math.PI / 2.3 // thrown on its side, thrashing
            familyHeld = true
          } else if (a.kick !== undefined) {
            // The defence kick (design.md §19.8, point 124): the parent that
            // drove the hunt off stands its ground, tail to the retreating
            // predator, and throws its hind legs up in a brief strike — the
            // front dips (positive pitch), the rear flies, then it settles.
            px = a.x
            pz = a.z
            yaw = Math.atan2(a.x - LION_STATE.lx, a.z - LION_STATE.lz)
            const strike = Math.min(1, Math.max(0, 1 - a.kick / PARENT_KICK_SECONDS))
            pitch = 0.55 * Math.sin(Math.PI * strike)
            familyHeld = true
          } else if (a.child && !a.child.dead && a.child.caught !== undefined && a.child.caught > 0) {
            // Charging the predator eating our calf (movement in the pre-pass):
            // face the calf while rushing in.
            px = a.x
            pz = a.z
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
            yaw = Math.atan2(a.child.x - a.x, a.child.z - a.z)
            {
              const llw = worldToLatLon(a.x, a.z)
              if (sampleTerrain(llw.lat, llw.lon, seed).type === 'water') bodyY = a.y - 0.25
            }
            pitch = 0.15
            familyHeld = true
          } else if (a.young && LION_STATE.mode === 'chase' && LION_STATE.victim === a) {
            // This calf is the one being run down (design.md §19): it bolts
            // instead of standing at its parent, but slower than its hunter, so
            // the chase is visible in the open before the catch.
            const h = Math.atan2(a.x - LION_STATE.lx, a.z - LION_STATE.lz)
            a.x += Math.sin(h) * CALF_FLEE_SPEED * dt
            a.z += Math.cos(h) * CALF_FLEE_SPEED * dt
            px = a.x
            pz = a.z
            yaw = h
            pitch = 0
            familyHeld = true
          } else if (a.child && !a.child.dead && LION_STATE.mode === 'chase' && LION_STATE.victim === a.child) {
            // Our calf is being run down: the parent holds itself between the
            // hunter and its young (movement in the pre-pass) so the hunter
            // takes it in the calf's place (§19).
            px = a.x
            pz = a.z
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
              px = a.x
              pz = a.z
              yaw = Math.atan2(toX, toZ)
            } else {
              a.hop = undefined
              a.boutDetour = undefined
              pitch = -0.22 // nurse: head up toward the parent's flank
            }
            familyHeld = true
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
            if (Math.hypot(LION_STATE.lx - calf.x, LION_STATE.lz - calf.z) < GUARD_RADIUS) {
              const h = blockHeading(a.x, a.z, calf.x, calf.z, LION_STATE.lx, LION_STATE.lz, GUARD_STANDOFF)
              if (h !== null) {
                a.x += Math.sin(h) * GUARD_SPEED * dt
                a.z += Math.cos(h) * GUARD_SPEED * dt
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
        if (!familyHeld && lionActive && FLEES_LION[sp] && sp !== 'elephant') {
          const dx = a.x - LION_STATE.lx
          const dz = a.z - LION_STATE.lz
          const d = Math.hypot(dx, dz)
          if (d < FLEE_RADIUS && d > 0.01) {
            const urgency = (FLEE_RADIUS - d) / FLEE_RADIUS
            a.x += (dx / d) * FLEE_SPEED * urgency * dt
            a.z += (dz / d) * FLEE_SPEED * urgency * dt
            px = a.x
            pz = a.z
            wobTarget = 0.3
            yaw = Math.atan2(dx, dz) // face away while fleeing
            pitch = 0
          }
        }
        // Dodge an approaching elephant, but only at the last moment (design.md
        // §19): the prey darts away just before it is reached and a touch
        // slower than the herd, so a head-on elephant still catches some. Flee
        // the summed repulsion of ALL nearby elephants (not just the nearest)
        // and turn toward it at a bounded rate, so the facing never flip-flops
        // ~90° between two flanking herd-mates (no oscillation, design.md §19).
        if (!familyHeld && sp !== 'elephant' && FLEES_LION[sp]) {
          // Hysteresis: once dodging, only disengage well past the trigger
          // ring — a tailing elephant cannot flap the dodge on and off.
          const ring = a.dodgeHeading === undefined ? PREY_PANIC_RADIUS : PREY_PANIC_RADIUS * PREY_PANIC_EXIT
          const target = fleeHeading(a.x, a.z, elephantPos, ring)
          if (target !== null) {
            a.dodgeHeading =
              a.dodgeHeading === undefined ? target : turnToward(a.dodgeHeading, target, PREY_DODGE_TURN * dt)
            a.x += Math.sin(a.dodgeHeading) * PREY_PANIC_SPEED * dt
            a.z += Math.cos(a.dodgeHeading) * PREY_PANIC_SPEED * dt
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
        }
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
          if (!a.dead) {
            for (const [ex, ez] of elephantPos) {
              if (Math.hypot(a.x - ex, a.z - ez) < TRAMPLE_RADIUS) {
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
      <group ref={scavengeGroup} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={vultureGeo} material={material} dispose={null} />
        ))}
      </group>
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
      // The drying waterhole draws the predators (point 123): a MIRED calf
      // in seek range is always the hunt's target — the pair at the last
      // water is genuinely found, not left to the calf-hunt dice.
      if (!vigilKeeper && herds) {
        let bd = CALF_HUNT_SEEK
        for (const csp of CALF_HUNT_SPECIES) {
          for (const c of herds[csp]) {
            if (!c.young || c.dead || c.caught !== undefined || c.mired === undefined || !c.parent || c.parent.dead)
              continue
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
      if (!vigilKeeper && !calf && herds && Math.random() < CALF_HUNT_CHANCE) {
        let bd = CALF_HUNT_SEEK
        for (const csp of CALF_HUNT_SPECIES) {
          for (const c of herds[csp]) {
            if (!c.young || c.dead || c.caught !== undefined || c.inWater !== undefined || !c.parent || c.parent.dead)
              continue
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
        // Generic hunt: a random savanna spot within view.
        const ang = Math.random() * Math.PI * 2
        const dist = 25 + Math.random() * 20
        px = pos.x + Math.cos(ang) * dist
        pz = pos.z + Math.sin(ang) * dist
        ll = worldToLatLon(px, pz)
        if (sampleTerrain(ll.lat, ll.lon, seed).type !== 'savanna') {
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
        const spawn = vigilDrawSpawn(
          px, pz, pos.x, pos.z,
          VIEW_AT_ZOOM1 * useUi.getState().travelZoom, offstageR, Math.random(),
        )
        s.lx = spawn.x
        s.lz = spawn.z
      } else {
        // The predator closes in from a random direction, so the chase runs any
        // which way rather than always toward the same corner.
        const lionAng = Math.random() * Math.PI * 2
        s.lx = px + Math.cos(lionAng) * HUNT_LION_APPROACH
        s.lz = pz + Math.sin(lionAng) * HUNT_LION_APPROACH
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
          s.mode = 'feed'
          s.timer = 30
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
        s.lx += Math.sin(s.lionHeading) * HUNT_LION_SPEED * dt
        s.lz += Math.cos(s.lionHeading) * HUNT_LION_SPEED * dt
        if (d < (v ? CALF_CATCH_DIST : 0.6)) {
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
      // Steer toward the radial escape under a turn cap: an instant flip
      // back to the radial after an inland detour re-entered the same coast
      // pocket every other frame (an oscillating stand-still).
      const radial = leaveHeading(s.lx, s.lz, pos.x, pos.z)
      s.heading = turnToward(s.heading, radial, 1.8 * dt)
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
      if (Math.hypot(s.lx - pos.x, s.lz - pos.z) > offstageR) {
        s.mode = 'idle'
        s.timer = 30 + Math.random() * 30
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
      flightStep(f, poor, s.pos.x, s.pos.z, s.pos.x, s.pos.z, viewR, VULTURE_FLY_SPEED, dt, 2)
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
      const feeding = LION_STATE.mode === 'feed' || LION_STATE.mode === 'leave'
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
        feeding || remnant !== null,
        toRemnant && remnant ? remnant.x : LION_STATE.px,
        toRemnant && remnant ? remnant.z : LION_STATE.pz,
        s.pos.x,
        s.pos.z,
        viewR,
        VULTURE_FLY_SPEED,
        dt,
        2,
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
      let killMinClear = Infinity
      clearance.current = Infinity
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
            // Positive-only hop, lifted by the slope under the bird so no
            // body ever sinks into rising ground beside the remnant.
            const bll = worldToLatLon(f.x + lx, f.z + lz)
            const lift = Math.max(0, Math.max(0, sampleTerrain(bll.lat, bll.lon, s.seed).height) - killGroundY)
            const ly = lift + 0.15 + Math.abs(Math.sin(t * 3 + phase)) * 0.12
            bird.position.set(cx + (lx - cx) * dsc, cy + (ly - cy) * dsc, cz + (lz - cz) * dsc)
            if (dsc > 0.6) killMinClear = Math.min(killMinClear, ly - lift)
            if (dsc > 0.6) {
              bird.rotation.set(0.6 + Math.sin(t * 4 + phase) * 0.3, phase, 0) // pecking down
            } else {
              bird.rotation.set(0, -a - Math.PI / 2, 0.25) // still banking
            }
            bird.scale.setScalar(1.6)
          })
        }
        clearance.current = killMinClear
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
