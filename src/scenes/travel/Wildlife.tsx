// Ambient wildlife for the travel view (design.md §19): non-threatening
// herds as scenery (elephants, giraffes, zebras, antelopes, flamingos at the
// lakes), a purely decorative lion hunt, and vultures circling the player
// when the expedition is in poor condition. The animals interact with one
// another: wandering elephants trample smaller animals underfoot (dead over
// a red stain), prey scatters away from an active lion, and vultures gather
// above a kill. No gameplay effect.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { healthState, useGame } from '../../state/store'
import { latLonToWorld, worldToLatLon } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import { lakeDistance, riverDistance } from '../../world/geoIndex'
import {
  buildAntelope,
  buildElephant,
  buildFlamingo,
  buildGiraffe,
  buildLion,
  buildVulture,
  buildZebra,
} from '../../render/fauna'

const CHUNK_SIZE = 24
const HERD_RADIUS = 4 // chunks around the player checked for herds

type Species = 'elephant' | 'giraffe' | 'zebra' | 'antelope' | 'flamingo'
const SPECIES: Species[] = ['elephant', 'giraffe', 'zebra', 'antelope', 'flamingo']
const MAX_INSTANCES: Record<Species, number> = {
  elephant: 60,
  giraffe: 60,
  zebra: 120,
  antelope: 120,
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
}
const LION_STATE: LionHuntState = {
  mode: 'idle', lx: 0, lz: 0, px: 0, pz: 0, timer: 0, heading: 0, lionHeading: 0, preyHeading: 0,
}

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
  elephant: false, giraffe: true, zebra: true, antelope: true, flamingo: false,
}
const TRAMPLE_RADIUS = 1.5
const FLEE_RADIUS = 14
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

function hash(cx: number, cz: number, i: number, seed: number): number {
  let h = (seed ^ 0xa51ce5) >>> 0
  h = Math.imul(h ^ cx, 0x85ebca6b)
  h = Math.imul(h ^ cz, 0xc2b2ae35)
  h = Math.imul(h ^ i, 0x27d4eb2f)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

/** Deterministic herds around a center chunk. */
function buildHerds(cx: number, cz: number, seed: number): Record<Species, Animal[]> {
  const herds: Record<Species, Animal[]> = {
    elephant: [],
    giraffe: [],
    zebra: [],
    antelope: [],
    flamingo: [],
  }

  for (let dz = -HERD_RADIUS; dz <= HERD_RADIUS; dz++) {
    for (let dx = -HERD_RADIUS; dx <= HERD_RADIUS; dx++) {
      const ccx = cx + dx
      const ccz = cz + dz
      const roll = hash(ccx, ccz, 0, seed)
      const ax = (ccx + hash(ccx, ccz, 1, seed)) * CHUNK_SIZE
      const az = (ccz + hash(ccx, ccz, 2, seed)) * CHUNK_SIZE
      const ll = worldToLatLon(ax, az)
      const anchor = sampleTerrain(ll.lat, ll.lon, seed)

      // Flamingo flocks gather at lake shores regardless of biome roll.
      // (lakeDistance caps at 0.45°, so the threshold must stay below that.)
      const lakeD = lakeDistance(ll.lat, ll.lon, 1)
      if (lakeD < 0.42 && roll < 0.7) {
        placeGroup(herds.flamingo, ccx, ccz, ax, az, 8 + Math.floor(roll * 10), 3.5, seed, 1.4, true)
        continue
      }

      let species: Species | null = null
      let count = 0
      if (anchor.type === 'savanna') {
        if (roll < 0.12) species = 'elephant'
        else if (roll < 0.2) species = 'giraffe'
        else if (roll < 0.33) species = 'zebra'
        else if (roll < 0.46) species = 'antelope'
        count = species === 'elephant' ? 5 : species === 'giraffe' ? 3 : 7
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
      if (!species) continue
      // Elephants placed together share a herd id (stable per chunk) so they
      // move as one; other species roam/graze individually.
      const herdId = species === 'elephant' ? ccx * 1000003 + ccz : undefined
      placeGroup(herds[species], ccx, ccz, ax, az, count, 7, seed, species === 'elephant' ? 1 : 0.9, false, herdId)
    }
  }
  return herds
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
        }
      }
    }
    list.push(animal)
  }
}

/** Instanced herds, softly shuffling in place. */
function Herds() {
  const seed = useGame((s) => s.seed)
  const meshRefs = useRef<Partial<Record<Species, THREE.InstancedMesh>>>({})
  const herdsRef = useRef<Record<Species, Animal[]> | null>(null)
  const lastCenter = useRef<string | null>(null)
  // Shared per-herd roaming state (heading + arc phase), keyed by herd id.
  const herdState = useRef(new Map<number, { heading: number; phase: number }>())

  const geometries = useMemo<Record<Species, THREE.BufferGeometry>>(
    () => ({
      elephant: buildElephant(),
      giraffe: buildGiraffe(),
      zebra: buildZebra(),
      antelope: buildAntelope(),
      flamingo: buildFlamingo(),
    }),
    [],
  )
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    [],
  )

  useEffect(() => {
    lastCenter.current = null
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
    w.__wildlife = { herdsRef, stains }
    return () => {
      delete w.__wildlife
    }
  }, [])

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.1)
    const pos = useGame.getState().pos
    const cx = Math.floor(pos.x / CHUNK_SIZE)
    const cz = Math.floor(pos.z / CHUNK_SIZE)
    const center = `${cx},${cz}`
    if (center !== lastCenter.current) {
      lastCenter.current = center
      herdsRef.current = buildHerds(cx, cz, seed)
      stains.current = []
      herdState.current.clear()
    }
    const herds = herdsRef.current
    if (!herds) return

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

    for (const sp of SPECIES) {
      const mesh = meshRefs.current[sp]
      if (!mesh) continue
      const list = herds[sp]
      const n = Math.min(list.length, MAX_INSTANCES[sp])
      let eIdx = 0
      for (let i = 0; i < n; i++) {
        const a = list[i]
        if (a.dead) {
          // Trampled: lies on its side where it was caught, over a stain.
          euler.set(0, a.rot, Math.PI / 2.15)
          quat.setFromEuler(euler)
          vpos.set(a.x, Math.max(0.02, a.y), a.z)
          vscl.setScalar(a.scale)
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
        // Periodic drinking (design.md §19): walk to the shore point, lower
        // the head at the water, walk back.
        if (a.drink && sp !== 'elephant') {
          const cycle = ((t + a.phase * 40) % 75) / 75
          if (cycle < 0.5) {
            const k = cycle < 0.12 ? cycle / 0.12 : cycle < 0.38 ? 1 : (0.5 - cycle) / 0.12
            const toX = a.drink.tx - px
            const toZ = a.drink.tz - pz
            px += toX * k
            pz += toZ * k
            if (k > 0.04) yaw = Math.atan2(toX, toZ) + (cycle >= 0.38 ? Math.PI : 0)
            if (cycle >= 0.12 && cycle < 0.38) pitch = 0.42 + Math.sin(t * 1.4 + a.phase) * 0.08
          }
        }
        // Grazing dips on the open grassland.
        if (pitch === 0 && (sp === 'zebra' || sp === 'antelope')) {
          const g = Math.sin(t * 0.35 + a.phase * 3)
          if (g > 0.65) pitch = (g - 0.65) * 0.9
        }
        // Prey scatters away from an active lion (design.md §19).
        if (lionActive && FLEES_LION[sp]) {
          const dx = px - LION_STATE.lx
          const dz = pz - LION_STATE.lz
          const d = Math.hypot(dx, dz)
          if (d < FLEE_RADIUS && d > 0.01) {
            const push = ((FLEE_RADIUS - d) / FLEE_RADIUS) * 6
            px += (dx / d) * push
            pz += (dz / d) * push
            yaw = Math.atan2(dx, dz) // face away while fleeing
            pitch = 0
          }
        }
        // Dodge an approaching elephant, but only at the last moment (design.md
        // §19): the prey darts away just before it is reached and a touch
        // slower than the herd, so a head-on elephant still catches some.
        if (sp !== 'elephant' && FLEES_LION[sp]) {
          let near: [number, number, number] | null = null
          for (const [ex, ez] of elephantPos) {
            const d = Math.hypot(px - ex, pz - ez)
            if (d < PREY_PANIC_RADIUS && (!near || d < near[2])) near = [ex, ez, d]
          }
          if (near) {
            const dx = a.x - near[0]
            const dz = a.z - near[1]
            const d = Math.hypot(dx, dz) || 1
            a.x += (dx / d) * PREY_PANIC_SPEED * dt
            a.z += (dz / d) * PREY_PANIC_SPEED * dt
            px = a.x
            pz = a.z
            yaw = Math.atan2(dx, dz)
            pitch = 0
          }
        }
        // Under an elephant: trampled, stays dead on the ground.
        if (sp !== 'elephant') {
          for (const [ex, ez] of elephantPos) {
            if (Math.hypot(px - ex, pz - ez) < TRAMPLE_RADIUS) {
              a.dead = true
              a.x = px
              a.z = pz
              if (stains.current.length < MAX_STAINS) stains.current.push([px, a.y, pz])
              break
            }
          }
          if (a.dead) {
            i-- // re-render this animal in its dead pose immediately
            continue
          }
        }
        vpos.set(px, a.y, pz)
        if (pitch > 0) {
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
    </>
  )
}

/**
 * Purely decorative lion hunt (design.md §19): near zebra herds a lion
 * occasionally chases one zebra; after the catch the lion visibly feeds on
 * the carcass — lowered, tearing head movements while the prey shrinks away
 * piece by piece over a red, spreading stain. Once the carcass is gone the
 * lion moves on and the scene despawns.
 */
function LionHunt() {
  const seed = useGame((s) => s.seed)
  const lion = useRef<THREE.Group>(null)
  const prey = useRef<THREE.Group>(null)
  const stain = useRef<THREE.Mesh>(null)
  // Module-shared state so the herds and vultures can react to the hunt.
  const state = useRef(LION_STATE)

  const geo = useMemo(() => ({ lion: buildLion(), zebra: buildZebra() }), [])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    [],
  )

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__lionHunt = { state: state.current, lion, prey, stain }
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
      s.timer -= dt
      if (s.timer > 0) return
      // Try to start a hunt somewhere on savanna within view.
      const ang = Math.random() * Math.PI * 2
      const dist = 25 + Math.random() * 20
      const px = pos.x + Math.cos(ang) * dist
      const pz = pos.z + Math.sin(ang) * dist
      const ll = worldToLatLon(px, pz)
      const ter = sampleTerrain(ll.lat, ll.lon, seed)
      if (ter.type !== 'savanna') {
        s.timer = 4
        return
      }
      s.px = px
      s.pz = pz
      // The lion closes in from a random direction, so the chase runs any which
      // way rather than always toward the same corner.
      const lionAng = Math.random() * Math.PI * 2
      s.lx = px + Math.cos(lionAng) * HUNT_LION_APPROACH
      s.lz = pz + Math.sin(lionAng) * HUNT_LION_APPROACH
      s.heading = Math.random() * Math.PI * 2 // per-hunt weave phase
      s.lionHeading = Math.atan2(s.px - s.lx, s.pz - s.lz)
      s.preyHeading = s.lionHeading
      s.mode = 'chase'
    } else if (s.mode === 'chase') {
      // The prey flees away from the lion but weaves left and right to try to
      // shake it (design.md §19); the lion pursues with a limited turn rate, so
      // sharp cuts throw it wide, though it is faster and closes in over time.
      const away = Math.atan2(s.px - s.lx, s.pz - s.lz)
      s.preyHeading = away + Math.sin(t * HUNT_WEAVE_FREQ + s.heading) * HUNT_WEAVE_AMP
      s.px += Math.sin(s.preyHeading) * HUNT_PREY_SPEED * dt
      s.pz += Math.cos(s.preyHeading) * HUNT_PREY_SPEED * dt
      const toX = s.px - s.lx
      const toZ = s.pz - s.lz
      const d = Math.hypot(toX, toZ)
      let dh = Math.atan2(toX, toZ) - s.lionHeading
      while (dh > Math.PI) dh -= Math.PI * 2
      while (dh < -Math.PI) dh += Math.PI * 2
      s.lionHeading += Math.max(-HUNT_LION_TURN * dt, Math.min(HUNT_LION_TURN * dt, dh))
      s.lx += Math.sin(s.lionHeading) * HUNT_LION_SPEED * dt
      s.lz += Math.cos(s.lionHeading) * HUNT_LION_SPEED * dt
      if (d < 0.6) {
        s.mode = 'feed'
        s.timer = FEED_DURATION
      }
      // Abort when the hunt strays too far from the player.
      if (Math.hypot(s.lx - pos.x, s.lz - pos.z) > 90) {
        s.mode = 'idle'
        s.timer = 10
      }
    } else if (s.mode === 'feed') {
      s.timer -= dt
      if (s.timer <= 0) {
        // Carcass fully consumed: the lion moves on (design.md §19).
        s.mode = 'leave'
        s.timer = 9
        s.heading = Math.random() * Math.PI * 2
        s.lx = s.px + 0.7
        s.lz = s.pz + 0.25
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

    // Touching a lion triggers a lion attack (design.md §14): when the player
    // walks into the active lion, fire the event (rate-limited by the store).
    if (active) {
      const lionX = feeding ? s.px + 0.7 : s.lx
      const lionZ = feeding ? s.pz + 0.25 : s.lz
      if (Math.hypot(lionX - pos.x, lionZ - pos.z) < LION_CONTACT_RADIUS) {
        useGame.getState().lionContact()
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
      // is gone (leave phase) nothing of it remains.
      prey.current.visible = s.mode === 'chase' || feeding
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
      // The red stain stays behind while the lion walks off.
      stain.current.visible = feeding || s.mode === 'leave'
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
        <mesh geometry={geo.lion} material={material} castShadow />
      </group>
      <group ref={prey} visible={false}>
        <mesh geometry={geo.zebra} material={material} castShadow />
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
