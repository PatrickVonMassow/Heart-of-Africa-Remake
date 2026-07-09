// Ambient wildlife for the travel view (design.md §19): non-threatening
// herds as scenery (elephants, giraffes, zebra, wildebeest, antelope, warthog,
// flamingos at the lakes), a purely decorative predator hunt (lion, cheetah,
// leopard or hyena taking prey from its food web), and vultures circling the
// player when the expedition is in poor condition. The animals interact with
// one another: wandering elephants trample smaller animals underfoot (dead
// over a red stain), prey flee an active predator, and vultures gather above a
// kill. Only walking into the lion attacks the player (§14); otherwise no
// gameplay effect.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { healthState, useGame } from '../../state/store'
import { useUi } from '../../state/ui'
import { setAmbienceAnimals } from '../../systems/ambience'
import { latLonToWorld, regionAt, worldToLatLon, type RegionId } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import { lakeDistance, riverDistance } from '../../world/geoIndex'
import { hashChunk } from '../../world/noise'
import { fleeHeading, turnToward } from './wildlifeBehavior'
import {
  buildAntelope,
  buildCheetah,
  buildElephant,
  buildFlamingo,
  buildGiraffe,
  buildHyena,
  buildLeopard,
  buildLion,
  buildVulture,
  buildWarthog,
  buildWildebeest,
  buildZebra,
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
  /** Seconds of struggle left while a predator eats this calf (design.md §19):
   *  during the window the calf is alive and wriggling (no stain/shrink yet), and
   *  a parent may still save it. */
  caught?: number
  /** This carcass is being consumed by the on-scene predator (the lion hunt),
   *  not the ground scavenger — keeps the vulture from double-feeding on it. */
  lionFed?: boolean
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

/** Decorative predators of ~1890 Africa (design.md §19). The lion is the apex
 *  (and the only one that attacks on contact, §14); the others are scenery. */
type PredatorKind = 'lion' | 'cheetah' | 'leopard' | 'hyena'
/** Prey a predator hunts (design.md §19): grazers fitting its prey scheme. */
type PreyKind = 'zebra' | 'wildebeest' | 'antelope' | 'warthog'
/** Base render scale per prey species (warthog small, wildebeest sturdy). */
const PREY_SCALE: Record<PreyKind, number> = { zebra: 1, wildebeest: 1.05, antelope: 0.85, warthog: 0.62 }

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
/** Food web (design.md §19): each predator's prey scheme. The grazers in turn
 *  feed on the grassland (they graze on open land), so predator → grazer →
 *  plants forms the chain. Lions and hyenas take the big grazers; the cheetah
 *  and leopard take smaller, faster game. */
const PREDATOR_PREY: Record<PredatorKind, PreyKind[]> = {
  lion: ['wildebeest', 'zebra', 'antelope', 'warthog'],
  hyena: ['wildebeest', 'zebra', 'warthog'],
  cheetah: ['antelope', 'warthog'],
  leopard: ['antelope', 'warthog'],
}
/** Region-appropriate grazers for ~1890 Africa (design.md §19). The eastern and
 *  southern plains hold the great herds; the wooded west/centre and the arid
 *  north offer a narrower range. A hunt's prey is the predator's scheme
 *  intersected with what the region holds. */
const REGION_PREY: Record<RegionId, PreyKind[]> = {
  east: ['wildebeest', 'zebra', 'antelope', 'warthog'],
  south: ['wildebeest', 'zebra', 'antelope', 'warthog'],
  central: ['antelope', 'warthog', 'zebra'],
  west: ['antelope', 'warthog', 'zebra'],
  north: ['antelope', 'warthog'],
}
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
/** Family life (design.md §19): a calf keeps within this radius of its parent,
 *  and a parent moves between an approaching predator and its calf to guard it,
 *  standing off a short distance in front of the young. */
const YOUNG_FOLLOW_RADIUS = 1.8
const YOUNG_FOLLOW_SPEED = 4.5
const GUARD_RADIUS = 12
const GUARD_STANDOFF = 2.2
const GUARD_SPEED = 5.5
/** Calf predation (design.md §19): when a predator catches a calf it does not die
 *  at once — it struggles for CAUGHT_DURATION seconds first (no stain/shrink yet).
 *  In that window the parent charges the predator; reaching it (SACRIFICE_DIST)
 *  the parent is taken instead and the calf escapes, while a parent that only got
 *  close (TOO_LATE_DIST) by the time the window ends is eaten alongside the calf. */
const CAUGHT_DURATION = 5
const CALF_HUNT_CHANCE = 0.45 // chance a hunt targets a calf near the player over a generic grazer
const CALF_HUNT_SEEK = 45 // radius around the player within which a huntable calf is picked
const CALF_CATCH_DIST = 0.9 // the predator catches the chased calf within this
/** Inside this radius the predator pounces straight at the calf, bypassing its
 *  turn-rate limit: with speed 5.6 and turn 3 the minimum turning circle is
 *  ~1.9 — wider than the catch distance — so a near-stationary (nursing) calf
 *  could otherwise be orbited forever and never caught. */
const CALF_POUNCE_RADIUS = 3
const PARENT_CHARGE_SPEED = 6.5 // a parent rushes the predator faster than it guards
const PARENT_SACRIFICE_DIST = 1.3 // parent reaches the predator → sacrifices itself
const PARENT_TOO_LATE_DIST = 3.2 // parent only this close when the window ends → both eaten
/** Species whose calves a predator hunt can target (design.md §19). */
const CALF_HUNT_SPECIES = ['zebra', 'wildebeest', 'antelope', 'warthog'] as const
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
const VULTURE_SCAVENGE_SPEED = 9

// Wildlife placement salts the seed so it decorrelates from the terrain
// scatter that shares hashChunk (design.md §19).
const hash = (cx: number, cz: number, i: number, seed: number): number => hashChunk(cx, cz, i, seed ^ 0xa51ce5)

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
    placeGroup(herds.flamingo, ccx, ccz, ax, az, 8 + Math.floor(roll * 10), 3.5, seed, 1.4, true, undefined, key)
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
  placeGroup(herds[species], ccx, ccz, ax, az, count, 7, seed, species === 'elephant' ? 1 : 0.9, false, herdId, key)
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
  shoreline: boolean,
  herdId?: number,
  chunkKey?: string,
) {
  for (let i = 0; i < count; i++) {
    const r1 = hash(ccx, ccz, 10 + i * 3, seed)
    const r2 = hash(ccx, ccz, 11 + i * 3, seed)
    const r3 = hash(ccx, ccz, 12 + i * 3, seed)
    const x = ax + (r1 - 0.5) * spread * 2
    const z = az + (r2 - 0.5) * spread * 2
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
      scale: baseScale * (0.85 + r3 * 0.3),
      phase: r1 * Math.PI * 2,
      ...(herdId !== undefined ? { herd: herdId } : {}),
      ...(chunkKey !== undefined ? { chunk: chunkKey } : {}),
    }
    // Animals near water periodically walk to the shore and drink
    // (design.md §19); the shore point follows the water-distance gradient.
    if (!shoreline) {
      const wd = Math.min(lakeDistance(ll.lat, ll.lon, 0.5), riverDistance(ll.lat, ll.lon, 0.5))
      if (wd > 0.02 && wd < 0.35) {
        const e = 0.03
        const gLat =
          Math.min(lakeDistance(ll.lat + e, ll.lon, 0.6), riverDistance(ll.lat + e, ll.lon, 0.6)) -
          Math.min(lakeDistance(ll.lat - e, ll.lon, 0.6), riverDistance(ll.lat - e, ll.lon, 0.6))
        const gLon =
          Math.min(lakeDistance(ll.lat, ll.lon + e, 0.6), riverDistance(ll.lat, ll.lon + e, 0.6)) -
          Math.min(lakeDistance(ll.lat, ll.lon - e, 0.6), riverDistance(ll.lat, ll.lon - e, 0.6))
        const gl = Math.hypot(gLat, gLon)
        if (gl > 1e-4) {
          // Step down the gradient to just short of the waterline.
          const shoreLat = ll.lat - (gLat / gl) * (wd * 0.85)
          const shoreLon = ll.lon - (gLon / gl) * (wd * 0.85)
          const w = latLonToWorld(shoreLat, shoreLon)
          animal.drink = { tx: w.x, tz: w.z }
          // Some shore visitors also wade in and bathe, not just drink (§19).
          if (hash(ccx, ccz, 40 + i, seed) < 0.4) animal.bathe = true
        }
      }
    }
    list.push(animal)
  }
  // Family life (design.md §19): a herd of at least three raises a juvenile that
  // keeps close to a parent and nurses; the parent guards it against predators.
  // Flamingos (shoreline flocks) are excluded.
  if (!shoreline && count >= 3) {
    const startIdx = list.length - count
    const parent = list[startIdx]
    const calf = list[list.length - 1]
    if (parent && calf && parent !== calf) {
      calf.young = true
      calf.parent = parent
      calf.scale *= 0.55 // a small juvenile
      parent.child = calf
    }
  }
}

/** Instanced herds, softly shuffling in place. */
function Herds() {
  const seed = useGame((s) => s.seed)
  const meshRefs = useRef<Partial<Record<Species, THREE.InstancedMesh>>>({})
  const herdsRef = useRef<Record<Species, Animal[]> | null>(null)
  // Chunks currently populated in herdsRef (streaming key set).
  const spawnedChunks = useRef(new Set<string>())
  // Shared per-herd roaming state (heading + arc phase), keyed by herd id.
  const herdState = useRef(new Map<number, { heading: number; phase: number }>())
  // Scavenger vulture that flies to and consumes a non-lion carcass.
  const scavengeGroup = useRef<THREE.Group>(null)
  const scavenger = useRef<{ x: number; z: number; y: number; landed: boolean; target: Animal | null }>({
    x: 0,
    z: 0,
    y: 14,
    landed: false,
    target: null,
  })

  const geometries = useMemo<Record<Species, THREE.BufferGeometry>>(
    () => ({
      elephant: buildElephant(),
      giraffe: buildGiraffe(),
      zebra: buildZebra(),
      wildebeest: buildWildebeest(),
      antelope: buildAntelope(),
      warthog: buildWarthog(),
      flamingo: buildFlamingo(),
    }),
    [],
  )
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    [],
  )
  const vultureGeo = useMemo(() => buildVulture(), [])

  useEffect(() => {
    herdsRef.current = emptyHerds()
    spawnedChunks.current.clear()
    herdState.current.clear()
    scavenger.current.target = null
  }, [seed])

  const mtx = useMemo(() => new THREE.Matrix4(), [])
  const quat = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const vpos = useMemo(() => new THREE.Vector3(), [])
  const vscl = useMemo(() => new THREE.Vector3(), [])
  const stainMesh = useRef<THREE.InstancedMesh>(null)
  const stains = useRef<Array<[number, number, number]>>([])
  const stainGeo = useMemo(() => new THREE.CircleGeometry(0.9, 16), [])
  const stainMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#a51512', roughness: 1, transparent: true, opacity: 0.8 }),
    [],
  )

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__wildlife = { herdsRef, stains, spawnedChunks, scavenger }
    return () => {
      delete w.__wildlife
    }
  }, [])

  // Drop the shared herd pointer when this scene unmounts so a stale reference
  // never outlives it (design.md §19).
  useEffect(() => () => { ACTIVE_HERDS = null }, [])

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
      stains.current = stains.current.filter(([x, , z]) => Math.hypot(x - pos.x, z - pos.z) <= despawnR)
    }
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
        if (a.caught !== undefined && a.caught > 0) {
          // Caught calf: count down the struggle. Unrescued, the kill completes —
          // and a parent that charged in but only got close (too late) is taken
          // alongside it: both are eaten (§19).
          a.caught -= dt
          if (a.caught <= 0) {
            a.caught = undefined
            a.dead = true
            a.lionFed = true
            a.dissolve = CARCASS_DISSOLVE_SECONDS
            if (stains.current.length < MAX_STAINS) stains.current.push([a.x, a.y, a.z])
            const par = a.parent
            if (par && !par.dead && Math.hypot(par.x - a.x, par.z - a.z) < PARENT_TOO_LATE_DIST) {
              par.dead = true
              par.lionFed = true
              par.dissolve = CARCASS_DISSOLVE_SECONDS
              if (stains.current.length < MAX_STAINS) stains.current.push([par.x, par.y, par.z])
              par.child = undefined
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
            calf.caught = undefined // freed — it rises and flees on its own
            calf.parent = undefined
            a.child = undefined
            a.dead = true
            a.lionFed = true
            a.dissolve = CARCASS_DISSOLVE_SECONDS
            if (stains.current.length < MAX_STAINS) stains.current.push([a.x, a.y, a.z])
            if (LION_STATE.victim === calf) LION_STATE.victim = a // the predator feeds on the parent now
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
    // removed. One scavenger works the nearest carcass at a time.
    {
      const sc = scavenger.current
      const targetValid = (a: Animal | null): a is Animal =>
        !!a && !!a.dead && !a.lionFed && (a.dissolve === undefined || a.dissolve > 0)
      if (!targetValid(sc.target)) {
        sc.target = null
        let bestD = Infinity
        for (const sp of SPECIES) {
          for (const a of herds[sp]) {
            if (!a.dead || a.lionFed) continue // the on-scene predator eats its own kill
            if (a.dissolve !== undefined && a.dissolve <= 0) continue
            const d = Math.hypot(a.x - pos.x, a.z - pos.z)
            if (d < bestD) {
              bestD = d
              sc.target = a
            }
          }
        }
        if (sc.target) {
          sc.x = sc.target.x + 14
          sc.z = sc.target.z + 14
          sc.y = 14
          sc.landed = false
        }
      }
      const sg = scavengeGroup.current
      const target = sc.target
      if (sg && target) {
        sg.visible = true
        const dx = target.x - sc.x
        const dz = target.z - sc.z
        const d = Math.hypot(dx, dz)
        if (!sc.landed && d > 0.6) {
          const step = Math.min(d, VULTURE_SCAVENGE_SPEED * dt)
          sc.x += (dx / d) * step
          sc.z += (dz / d) * step
          sc.y += (target.y + 0.4 - sc.y) * Math.min(1, dt * 2)
        } else {
          sc.landed = true
          sc.x = target.x
          sc.z = target.z
          sc.y = target.y + 0.3
          if (target.dissolve === undefined) target.dissolve = CARCASS_DISSOLVE_SECONDS
          target.dissolve -= dt
        }
        sg.position.set(sc.x, sc.y, sc.z)
        sg.children.forEach((bird, i) => {
          const ph = (i / sg.children.length) * Math.PI * 2
          if (sc.landed) {
            const r = 0.5 + i * 0.35
            bird.position.set(Math.cos(ph) * r, Math.sin(t * 3 + ph) * 0.12, Math.sin(ph) * r)
            bird.rotation.set(0.6 + Math.sin(t * 4 + ph) * 0.3, ph, 0) // heads pecking down
          } else {
            const a2 = t * 0.6 + ph
            bird.position.set(Math.cos(a2) * 2.4, 1.6 + i * 0.6, Math.sin(a2) * 2.4)
            bird.rotation.set(0, -a2 - Math.PI / 2, 0.2)
          }
          bird.scale.setScalar(1.5)
        })
      } else if (sg) {
        sg.visible = false
        sc.landed = false
      }
    }

    for (const sp of SPECIES) {
      const mesh = meshRefs.current[sp]
      if (!mesh) continue
      const list = herds[sp]
      const n = Math.min(list.length, MAX_INSTANCES[sp])
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
          mesh.setMatrixAt(i, mtx)
          continue
        }
        const wob = Math.sin(t * 0.25 + a.phase)
        let px: number
        let pz: number
        if (sp === 'elephant') {
          ;[px, pz] = elephantPos[eIdx++]
        } else {
          px = a.x + wob * 0.8
          pz = a.z + Math.cos(t * 0.2 + a.phase) * 0.8
        }
        let yaw = a.rot + wob * 0.4
        let pitch = 0
        let bodyY = a.y
        // Periodic drinking (design.md §19): walk to the shore point, lower
        // the head at the water, walk back. Bathers wade further in and dip
        // their body (a splashing wallow) instead of only lowering the head.
        if (a.drink && sp !== 'elephant') {
          const cycle = ((t + a.phase * 40) % 75) / 75
          if (cycle < 0.5) {
            const k = cycle < 0.12 ? cycle / 0.12 : cycle < 0.38 ? 1 : (0.5 - cycle) / 0.12
            const reach = a.bathe ? 1.12 : 1 // bathers step a little into the water
            const toX = (a.drink.tx - px) * reach
            const toZ = (a.drink.tz - pz) * reach
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
        // nurses; when a predator eats a calf it struggles for a few seconds
        // first, during which a parent charges in and can sacrifice itself to save
        // it; otherwise a parent stands between an approaching predator and its
        // calf to defend it. These override the flee/dodge below.
        let familyHeld = false
        if (sp !== 'elephant') {
          if (a.young && a.caught !== undefined && a.caught > 0) {
            // Caught by a predator (resolved in the full-list pre-pass above):
            // thrash in place — no stain or shrink yet — while a parent may
            // still reach the predator and save it (§19).
            px = a.x + Math.sin(t * 13 + a.phase) * 0.14
            pz = a.z + Math.cos(t * 11 + a.phase) * 0.14
            yaw = a.rot + Math.sin(t * 16 + a.phase) * 0.7
            pitch = Math.PI / 2.3 // thrown on its side, thrashing
            familyHeld = true
          } else if (a.child && !a.child.dead && a.child.caught !== undefined && a.child.caught > 0) {
            // Charging the predator eating our calf (movement in the pre-pass):
            // face the calf while rushing in.
            px = a.x
            pz = a.z
            yaw = Math.atan2(a.child.x - a.x, a.child.z - a.z)
            pitch = 0
            familyHeld = true
          } else if (a.young && a.parent && !a.parent.dead) {
            const toX = a.parent.x - a.x
            const toZ = a.parent.z - a.z
            const d = Math.hypot(toX, toZ)
            if (d > YOUNG_FOLLOW_RADIUS) {
              a.x += (toX / d) * YOUNG_FOLLOW_SPEED * dt
              a.z += (toZ / d) * YOUNG_FOLLOW_SPEED * dt
              px = a.x
              pz = a.z
              yaw = Math.atan2(toX, toZ)
            } else {
              pitch = -0.22 // nurse: head up toward the parent's flank
            }
            familyHeld = true
          } else if (a.child && !a.child.dead && lionActive) {
            const cx = a.child.x
            const cz = a.child.z
            const pdx = LION_STATE.lx - cx
            const pdz = LION_STATE.lz - cz
            const pd = Math.hypot(pdx, pdz)
            if (pd < GUARD_RADIUS && pd > 0.01) {
              const gx = cx + (pdx / pd) * GUARD_STANDOFF
              const gz = cz + (pdz / pd) * GUARD_STANDOFF
              const toX = gx - a.x
              const toZ = gz - a.z
              const gd = Math.hypot(toX, toZ) || 1
              a.x += (toX / gd) * GUARD_SPEED * dt
              a.z += (toZ / gd) * GUARD_SPEED * dt
              px = a.x
              pz = a.z
              yaw = Math.atan2(pdx, pdz) // face the predator down
              pitch = 0
              familyHeld = true
            }
          }
        }
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
            px = a.x + wob * 0.3
            pz = a.z + Math.cos(t * 0.2 + a.phase) * 0.3
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
          const target = fleeHeading(a.x, a.z, elephantPos, PREY_PANIC_RADIUS)
          if (target !== null) {
            a.dodgeHeading =
              a.dodgeHeading === undefined ? target : turnToward(a.dodgeHeading, target, PREY_DODGE_TURN * dt)
            a.x += Math.sin(a.dodgeHeading) * PREY_PANIC_SPEED * dt
            a.z += Math.cos(a.dodgeHeading) * PREY_PANIC_SPEED * dt
            px = a.x
            pz = a.z
            yaw = a.dodgeHeading
            pitch = 0
          } else {
            a.dodgeHeading = undefined
          }
        }
        // Under an elephant: trampled, stays dead on the ground. (A calf killed
        // by a predator above is already dead; skip the scan and just re-render.)
        if (sp !== 'elephant') {
          if (!a.dead) {
            for (const [ex, ez] of elephantPos) {
              if (Math.hypot(px - ex, pz - ez) < TRAMPLE_RADIUS) {
                a.dead = true
                a.x = px
                a.z = pz
                if (stains.current.length < MAX_STAINS) stains.current.push([px, a.y, pz])
                break
              }
            }
          }
          if (a.dead) {
            i-- // re-render this animal in its dead pose immediately
            continue
          }
        }
        vpos.set(px, bodyY, pz)
        if (pitch !== 0) {
          euler.set(pitch, yaw, 0, 'YXZ')
          quat.setFromEuler(euler)
        } else {
          quat.setFromAxisAngle(up, yaw)
        }
        vscl.setScalar(a.scale)
        mtx.compose(vpos, quat, vscl)
        mesh.setMatrixAt(i, mtx)
      }
      mesh.count = n
      mesh.instanceMatrix.needsUpdate = true
    }

    // Stains beneath trampled animals.
    const sm = stainMesh.current
    if (sm) {
      stains.current.forEach(([x, y, z], i) => {
        euler.set(-Math.PI / 2, 0, 0)
        quat.setFromEuler(euler)
        vpos.set(x, Math.max(0.02, y) + 0.012, z)
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
        if (consumed || farOffScreen) list.splice(i, 1)
      }
    }
  })

  return (
    <>
      {SPECIES.map((sp) => (
        <instancedMesh
          key={sp}
          ref={(el) => {
            meshRefs.current[sp] = el ?? undefined
          }}
          args={[geometries[sp], material, MAX_INSTANCES[sp]]}
          castShadow
          frustumCulled={false}
        />
      ))}
      <instancedMesh ref={stainMesh} args={[stainGeo, stainMat, MAX_STAINS]} frustumCulled={false} />
      <group ref={scavengeGroup} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={vultureGeo} material={material} />
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
 * moves on and the scene despawns. The lion is the apex and the only predator
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

  // Predator meshes swapped per hunt so different hunters roam the plains.
  const predatorGeo = useMemo<Record<PredatorKind, THREE.BufferGeometry>>(
    () => ({
      lion: buildLion(),
      cheetah: buildCheetah(),
      leopard: buildLeopard(),
      hyena: buildHyena(),
    }),
    [],
  )
  // Prey meshes swapped per hunt so the predator takes varied, fitting game.
  const preyGeo = useMemo<Record<PreyKind, THREE.BufferGeometry>>(
    () => ({
      zebra: buildZebra(),
      wildebeest: buildWildebeest(),
      antelope: buildAntelope(),
      warthog: buildWarthog(),
    }),
    [],
  )
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    [],
  )

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

    if (s.mode === 'idle') {
      // Idle clears any stale calf-hunt bookkeeping so a re-armed hunt starts clean.
      s.victim = null
      s.victimHunt = false
      s.timer -= dt
      if (s.timer > 0) return
      // Sometimes the hunt targets a calf near the PLAYER instead of a generic
      // grazer, so the family drama (struggle → parent charge → sacrifice) plays
      // out on screen rather than far off (design.md §19). Searching around the
      // player — not a random far spawn spot — is what keeps it visible.
      let px: number
      let pz: number
      let ll: { lat: number; lon: number }
      const herds = ACTIVE_HERDS
      let calf: Animal | null = null
      if (herds && Math.random() < CALF_HUNT_CHANCE) {
        let bd = CALF_HUNT_SEEK
        for (const csp of CALF_HUNT_SPECIES) {
          for (const c of herds[csp]) {
            if (!c.young || c.dead || c.caught !== undefined || !c.parent || c.parent.dead) continue
            const cd = Math.hypot(c.x - pos.x, c.z - pos.z)
            if (cd < bd) {
              bd = cd
              calf = c
            }
          }
        }
      }
      if (calf) {
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
      s.predator = predPool[Math.floor(Math.random() * predPool.length)]
      const regionPrey = REGION_PREY[region] ?? REGION_PREY.east
      const preyPool = PREDATOR_PREY[s.predator].filter((p) => regionPrey.includes(p))
      const pool = preyPool.length > 0 ? preyPool : regionPrey
      s.prey = pool[Math.floor(Math.random() * pool.length)]
      if (predatorMesh.current) {
        predatorMesh.current.geometry = predatorGeo[s.predator]
        predatorMesh.current.scale.setScalar(PREDATOR_SCALE[s.predator])
      }
      if (preyMesh.current) {
        preyMesh.current.geometry = preyGeo[s.prey]
        preyMesh.current.scale.setScalar(PREY_SCALE[s.prey])
      }
      // The predator closes in from a random direction, so the chase runs any
      // which way rather than always toward the same corner.
      const lionAng = Math.random() * Math.PI * 2
      s.lx = px + Math.cos(lionAng) * HUNT_LION_APPROACH
      s.lz = pz + Math.sin(lionAng) * HUNT_LION_APPROACH
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
        s.px += Math.sin(s.preyHeading) * HUNT_PREY_SPEED * dt
        s.pz += Math.cos(s.preyHeading) * HUNT_PREY_SPEED * dt
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
          if (v && v.caught === undefined && !v.dead) v.caught = CAUGHT_DURATION
          s.mode = 'feed'
          s.timer = v ? 30 : FEED_DURATION
        }
        // Abort when the hunt strays too far from the player.
        if (Math.hypot(s.lx - pos.x, s.lz - pos.z) > 90) {
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
          s.mode = 'leave'
          s.timer = 9
          s.heading = Math.random() * Math.PI * 2
          s.victim = null
          s.lx = s.px + 0.7
          s.lz = s.pz + 0.25
        }
      } else {
        s.timer -= dt
        if (s.timer <= 0) {
          // Carcass fully consumed: the lion moves on (design.md §19).
          s.mode = 'leave'
          s.timer = 9
          s.heading = Math.random() * Math.PI * 2
          s.lx = s.px + 0.7
          s.lz = s.pz + 0.25
        }
      }
    } else {
      // Moving on: walk straight away from the kill site, then despawn.
      s.lx += Math.sin(s.heading) * 2.0 * dt
      s.lz += Math.cos(s.heading) * 2.0 * dt
      s.timer -= dt
      if (s.timer <= 0) {
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
        const ll = worldToLatLon(s.px, s.pz)
        stain.current.position.set(s.px, Math.max(0.02, sampleTerrain(ll.lat, ll.lon, seed).height) + 0.015, s.pz)
        // The stain spreads while the lion feeds.
        const spread = feeding ? Math.min(1, (FEED_DURATION - s.timer) / 6) : 1
        stain.current.scale.setScalar(0.4 + spread * 0.9)
      }
    }
  })

  return (
    <>
      <group ref={lion} visible={false}>
        <mesh ref={predatorMesh} geometry={predatorGeo.lion} material={material} castShadow />
      </group>
      <group ref={prey} visible={false}>
        <mesh ref={preyMesh} geometry={preyGeo.zebra} material={material} castShadow />
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
  const geo = useMemo(() => buildVulture(), [])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    [],
  )

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__vultures = { player: group, kill: killGroup }
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

  useFrame(({ clock }) => {
    const s = useGame.getState()
    const t = clock.elapsedTime
    if (group.current) {
      const poor = healthState(s.health) === 'poor' && s.mode === 'travel'
      group.current.visible = poor
      if (poor) {
        group.current.position.set(s.pos.x, 0, s.pos.z)
        circle(group.current, t, 4.5, 5.5)
      }
    }
    // Vultures also gather above a lion kill (design.md §19).
    if (killGroup.current) {
      const overKill = LION_STATE.mode === 'feed' || LION_STATE.mode === 'leave'
      killGroup.current.visible = overKill
      if (overKill) {
        killGroup.current.position.set(LION_STATE.px, 0, LION_STATE.pz)
        circle(killGroup.current, t * 1.15, 3.2, 4.6)
      }
    }
  })

  return (
    <>
      <group ref={group} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={geo} material={material} />
        ))}
      </group>
      <group ref={killGroup} visible={false}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={geo} material={material} />
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
