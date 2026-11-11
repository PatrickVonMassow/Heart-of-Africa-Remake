// River and lake surfaces for the travel view (design.md §2/§11): the water
// follows the terrain's height profile. Rivers are ribbon meshes laid into
// the carved beds — the surface sits just above the bed for the whole length,
// so the ribbon is never buried and breaks only where a lake's sheet carries
// the water, descending overall from source to mouth — with a calm
// surface (no wave field), edge foam and a visible downstream current that
// speeds up at rapids; the waterfall landmarks get white cascades with
// plunge-pool foam, and rivers rising in open land get a 3D welling spring.
// Lakes are flat polygon surfaces just above their highest interior bed sample.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import {
  attribute,
  color,
  float,
  max,
  min,
  mix,
  mx_fractal_noise_float,
  positionLocal,
  positionWorld,
  smoothstep,
  time,
  uniform,
  uv,
  vec3,
} from 'three/tsl'
import { useGame } from '../../state/store'
import { seaSheetCover } from '../../render/demElevation'
import { latLonToWorld, worldToLatLon } from '../../world/geo'
import { sampleTerrain, RIVER_WIDTH_DEG } from '../../world/terrain'
import { lakeContains } from '../../world/hydro'
import { RIVERS_DATA } from '../../world/data/rivers'
import { LAKES } from '../../world/data/lakes'
import { WATERFALLS } from '../../world/data/landmarks'
// The surface heights and the axis sampling are shared with the module the
// floating canoe reads (waterSurface.ts), so a floater and the rendered
// surface agree — the GPU ripple and the canoe's own local-bed floor aside.
import {
  NILE_FLOOD,
  LAKE_LIFT,
  lakeBedMax,
  mouthSeaness,
  planRibbonRows,
  registerRiverSurfaces,
  riverAxisRows,
  riverIsSeaBound,
  springForRiver,
  renderedSheetY,
  waterSurfaceY,
} from './waterSurface'
import {
  edgeIsInterior,
  buildBankIndex,
  buildJuniorPairs,
  mergeFactorAt,
  BANK_PROBE_DEG,
  type BankAxisSample,
} from './riverBanks'
import { springBubble } from './springAnimation'
import { buildSpringGeometry, springShape, type SpringBuild } from './springGeometry'
import { getSpringMaterial, SPRING_BUBBLE_AMP_U, SPRING_GLOW_U } from './springMaterial'
import { balance } from '../../config/balance'
import { useUi, effectiveSpringBubbles, effectiveSpringSegments } from '../../state/ui'

const HALF_WIDTH = RIVER_WIDTH_DEG * 10 // ribbon half width in world units (1° = 10 units)

interface FallDef {
  x: number
  z: number
  yTop: number
  yBottom: number
  yaw: number
}

interface SpringDef {
  x: number
  z: number
  /** Water level at the source (the ribbon head's surface). */
  y: number
  /** Downstream heading in the xz plane, radians (atan2(dz, dx)). */
  outflowAngle: number
}

function buildRivers(seed: number): {
  geometry: THREE.BufferGeometry
  falls: FallDef[]
  springs: SpringDef[]
  /** Per-river continuity report (dev/verification): the ocean-continuity strip
   *  count (1 = continuous; a lake crossing does not count as a break), points
   *  where the surface would sit below the bed (0 = never buried under the
   *  terrain), and ribbon edges whose outside probe is not a land bank. */
  report: Record<string, { strips: number; buried: number; interiorEdges: number }>
} {
  const positions: number[] = []
  const uvs: number[] = []
  const flows: number[] = []
  const banks: number[] = []
  const merges: number[] = [] // point 233: 0 where a junior arm hands the junction water to its senior
  const seaFades: number[] = [] // point 234: 0 upstream → 1 at the mouth, the ribbon dissolving into the sea
  const floodK: number[] = [] // 1 on the Nile: its vertices ride the flood uniform
  const indices: number[] = []
  const falls: FallDef[] = []
  const springs: SpringDef[] = []
  const report: Record<string, { strips: number; buried: number; interiorEdges: number }> = {}
  const axisSamples: Array<{ lat: number; lon: number; surf: number; nile: boolean }> = []

  // Phase 1 — build every axis first: the bank mask below must see ALL
  // rivers' bands, not only the ones built so far (confluences are between
  // rivers in either build order).
  const built = RIVERS_DATA.map((river) => ({ river, rows: riverAxisRows(river, seed) }))
  const bankSamples: BankAxisSample[] = []
  for (const { river, rows } of built) {
    rows.forEach((p, i) => bankSamples.push({ riverId: river.id, index: i, lat: p.lat, lon: p.lon }))
  }
  const bankIndex = buildBankIndex(bankSamples)
  // Point 233: at each junction exactly one arm draws the shared water — the
  // junior arm's vertices fade out inside its senior partner's channel band.
  const juniorPairs = buildJuniorPairs(
    built.map(({ river, rows }) => ({ id: river.id, pts: rows })),
    RIVER_WIDTH_DEG,
  )

  for (const { river, rows } of built) {
    const world = rows.map((p) => latLonToWorld(p.lat, p.lon))

    // Surface sits just above the carved bed at every point, so the ribbon is
    // never buried under a local rise of the terrain (which would leave visible
    // gaps in the river). The bed itself descends smoothly from source to
    // mouth (the point-232 longitudinal profile), so the water reads as
    // flowing downhill without sea-level canyons (design.md §11). Row heights
    // come from the SHARED builder (point 211b cross-band lift + point 232
    // downstream smoothing) so the canoe float reads the identical surface.
    const surf = rows.map((r) => r.surf)
    for (const r of rows) {
      // Sea rows never ride the flood (point 234): the mouth bridge stays
      // under the sea sheet at flood peak (floodK is zeroed there too).
      axisSamples.push({ lat: r.lat, lon: r.lon, surf: r.surf, nile: river.id === 'nile' && !r.ocean })
    }

    // Flow speed: base current plus local slope; boosted near the river's
    // waterfall landmarks (visibly faster water, design.md §11).
    const riverFalls = WATERFALLS.filter((w) => w.river === river.id)
    const flowAt = (i: number): number => {
      const prev = surf[Math.max(0, i - 2)]
      const next = surf[Math.min(surf.length - 1, i + 2)]
      let f = 1 + Math.min(2.2, Math.max(0, prev - next) * 2.2)
      for (const w of riverFalls) {
        const fw = latLonToWorld(w.lat, w.lon)
        if (Math.hypot(world[i].x - fw.x, world[i].z - fw.z) < 2.2) f += 2
      }
      return f
    }

    // Waterfall cascades at the landmark positions.
    for (const w of riverFalls) {
      const fw = latLonToWorld(w.lat, w.lon)
      let best = 0
      let bestD = Infinity
      for (let i = 0; i < world.length; i++) {
        const d = Math.hypot(world[i].x - fw.x, world[i].z - fw.z)
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      const up = Math.max(0, best - 3)
      const down = Math.min(world.length - 1, best + 3)
      falls.push({
        x: world[best].x,
        z: world[best].z,
        yTop: surf[up],
        yBottom: surf[down],
        yaw: Math.atan2(world[down].x - world[up].x, world[down].z - world[up].z),
      })
    }

    // Spring at the source when the river rises in open land — never at a
    // confluence or a lake outflow (point 234; the pure springForRiver).
    if (springForRiver(river, rows)) {
      const down = world[Math.min(3, world.length - 1)]
      springs.push({
        x: world[0].x,
        z: world[0].z,
        y: surf[0] + 0.04,
        outflowAngle: Math.atan2(down.z - world[0].z, down.x - world[0].x),
      })
    }

    // Ribbon strip. Isolated inland points that the domain-warped biome map
    // misclassifies as ocean are bridged so they do not tear the river into
    // pieces; the mouth of an open strip is carried MOUTH_BRIDGE (waterSurface.ts) points into
    // the sea so it merges with the sea sheet (point 211a); only a sustained
    // ocean run (the open sea beyond the mouth) ends the ribbon. The drawn/
    // connected decisions live in the pure planRibbonRows, which also SUPPRESSES
    // rows lying inside a lake (point 254): the lake sheet already renders that
    // water, so the point-234 in-lake head strip must NOT be drawn over it — it
    // showed through the sheet (the ribbon draws without depth write) as a
    // visible strip.
    // The ribbon resumes at the shore (first row outside the lake): the outflow
    // still reads, no spring returns, and `strips` stays the ocean-continuity
    // count (a lake crossing is continuous water under its sheet, not a gap).
    const plan = planRibbonRows(
      rows.map((r) => r.ocean),
      rows.map((r) => r.lake),
    )
    // Point 234: the ribbon crossfades into the sea over its final approach —
    // no visible boundary where river ends and sea begins.
    const seaness = mouthSeaness(
      rows.map((r) => r.ocean),
      riverIsSeaBound(rows),
    )
    let arc = 0
    let buried = 0
    let interiorEdges = 0
    // A ribbon edge is a real bank only when the probe just OUTSIDE it is
    // land: outside another channel's band (riverBanks), no lake, no ocean.
    const bankAt = (wx: number, wz: number, i: number): number => {
      const q = worldToLatLon(wx, wz)
      if (edgeIsInterior(q.lat, q.lon, river.id, i, bankIndex, RIVER_WIDTH_DEG)) return 0
      if (lakeContains(q.lat, q.lon)) return 0
      if (sampleTerrain(q.lat, q.lon, seed).type === 'ocean') return 0
      return 1
    }
    const PROBE = (HALF_WIDTH + BANK_PROBE_DEG * 10) / HALF_WIDTH
    for (let i = 0; i < world.length; i++) {
      if (i > 0) arc += Math.hypot(world[i].x - world[i - 1].x, world[i].z - world[i - 1].z)
      // Skips the ocean-beyond-bridge rows AND the in-lake rows (point 254): a
      // suppressed row is not emitted and breaks the strip so the next emitted
      // row starts fresh (planRibbonRows already cleared its `connected`).
      if (!plan.emitted[i]) continue
      const isOcean = rows[i].ocean
      if (!isOcean && surf[i] < rows[i].bed - 0.05) buried++
      const a = world[Math.max(0, i - 1)]
      const b = world[Math.min(world.length - 1, i + 1)]
      let px = -(b.z - a.z)
      let pz = b.x - a.x
      const inv = HALF_WIDTH / (Math.hypot(px, pz) || 1)
      px *= inv
      pz *= inv
      const vi = positions.length / 3
      positions.push(world[i].x - px, surf[i], world[i].z - pz, world[i].x + px, surf[i], world[i].z + pz)
      uvs.push(arc, 0, arc, 1)
      const f = flowAt(i)
      flows.push(f, f)
      // Sea rows never ride the flood (point 234): the mouth bridge must
      // stay under the sea sheet at flood peak.
      const fk = river.id === 'nile' && !isOcean ? 1 : 0
      floodK.push(fk, fk)
      // A mouth-bridge vertex sits in the sea: no real bank, and it must not count
      // as an interior edge (the bank/foam metric stays about land banks only).
      const bankL = isOcean ? 0 : bankAt(world[i].x - px * PROBE, world[i].z - pz * PROBE, i)
      const bankR = isOcean ? 0 : bankAt(world[i].x + px * PROBE, world[i].z + pz * PROBE, i)
      // The interior-edge metric counts every edge whose outside probe is not a
      // land bank — a junction band, a lake or the ocean beside the ribbon.
      if (!isOcean) interiorEdges += (1 - bankL) + (1 - bankR)
      banks.push(bankL, bankR)
      // Point 233: per-vertex junction hand-over — a junior arm's water fades
      // out inside its senior partner's band so the shared region blends once.
      const qL = worldToLatLon(world[i].x - px, world[i].z - pz)
      const qR = worldToLatLon(world[i].x + px, world[i].z + pz)
      merges.push(
        mergeFactorAt(qL.lat, qL.lon, river.id, bankIndex, RIVER_WIDTH_DEG, juniorPairs),
        mergeFactorAt(qR.lat, qR.lon, river.id, bankIndex, RIVER_WIDTH_DEG, juniorPairs),
      )
      seaFades.push(seaness[i], seaness[i])
      if (plan.connected[i]) indices.push(vi - 2, vi, vi - 1, vi - 1, vi, vi + 1)
    }
    report[river.id] = { strips: plan.strips, buried, interiorEdges }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
  geometry.setAttribute('flow', new THREE.BufferAttribute(new Float32Array(flows), 1))
  geometry.setAttribute('bank', new THREE.BufferAttribute(new Float32Array(banks), 1))
  geometry.setAttribute('merge', new THREE.BufferAttribute(new Float32Array(merges), 1))
  geometry.setAttribute('seaFade', new THREE.BufferAttribute(new Float32Array(seaFades), 1))
  geometry.setAttribute('floodK', new THREE.BufferAttribute(new Float32Array(floodK), 1))
  geometry.setIndex(indices)
  // Hand the axis samples to the float-height module: the canoe then floats
  // on literally these ribbon heights, and the frame loop never has to build
  // the index itself (a synchronous build there stalls the scene switch).
  registerRiverSurfaces(seed, axisSamples)
  return { geometry, falls, springs, report }
}

// Module singletons (point 96): remounts must reuse the same materials so the
// renderer keeps their programs (a fresh set re-links synchronously on the
// first draw after leavePlace()).
let riverMaterialCache: THREE.MeshStandardNodeMaterial | null = null
let lakeMaterialCache: THREE.MeshStandardNodeMaterial | null = null

// The Nile flood's GPU mirror (point 138): RiversAndLakes copies
// waterSurface.NILE_FLOOD.rise into this uniform each frame, so the rendered
// ribbon and the CPU float height read the same rise from one source. A
// module uniform keeps the material a singleton (point 96 — no re-link).
const NILE_FLOOD_U = uniform(0)
/**
 * River surface material: calm water (only a slight surface shimmer), a
 * visible downstream current from streak noise scrolling along the arc
 * coordinate, foam along the banks and white water where the flow attribute
 * rises (rapids, waterfalls).
 */
function createRiverMaterial(): THREE.MeshStandardNodeMaterial {
  if (riverMaterialCache) return riverMaterialCache
  const m = riverMaterialCache = new THREE.MeshStandardNodeMaterial()
  m.transparent = true
  // Point 233: overlapping junction arms crossfade by the merge attribute —
  // depth writes would let the first-drawn arm's transparent fragments cull
  // the senior arm underneath and punch a hole where the junior fades out.
  m.depthWrite = false
  m.roughness = 0.14
  m.metalness = 0.02
  m.side = THREE.DoubleSide

  const u = uv().x
  const v = uv().y
  // Cast: the TSL typings do not carry the attribute's float type through.
  const flow = attribute('flow', 'float') as unknown as ReturnType<typeof float>
  // 1 at real banks, 0 where the edge lies inside the joined water body
  // (confluences, lake mouths, the sea) — no bank foam across open water.
  const bank = attribute('bank', 'float') as unknown as ReturnType<typeof float>
  // 0 where a junior junction arm hands the shared water to its senior
  // (point 233) — the overlap is drawn once, never alpha-doubled.
  const merge = attribute('merge', 'float') as unknown as ReturnType<typeof float>
  // 0 upstream → 1 at a sea mouth (point 234): the ribbon's colour slides to
  // the sea sheet's nearshore tone and its opacity dissolves, so the river
  // fades into the sea with no recognizable boundary.
  const seaFade = attribute('seaFade', 'float') as unknown as ReturnType<typeof float>


  // Streaks elongated along the flow, scrolling downstream with the current.
  const streak = mx_fractal_noise_float(
    vec3(u.mul(0.55).sub(time.mul(flow).mul(0.5)), v.mul(4.5), 1.0),
    3,
  )
    .mul(0.5)
    .add(0.5)

  const base = mix(color('#2c6285'), color('#4189a4'), streak.mul(0.45))
  const edgeD = min(v, v.oneMinus())
  // Point 314: the streak field alone is a few world units long, so a hard
  // threshold of it painted the foam as flat, uniform white slabs — "plastic
  // plates" drifting down the river. A finer fleck field, carried at the SAME
  // drift speed (its phase scaled by FLECK_ALONG / 0.55), frays every foam
  // patch into froth with water showing through, and the bank band is
  // narrowed to a fringe along the edge.
  const FLECK_ALONG = 2.6
  const fleck = mx_fractal_noise_float(
    vec3(u.mul(FLECK_ALONG).sub(time.mul(flow).mul(0.5 * (FLECK_ALONG / 0.55))), v.mul(22), time.mul(0.05)),
    2,
  )
    .mul(0.5)
    .add(0.5)
  const froth = smoothstep(float(0.42), float(0.66), fleck)
  const bankFoam = smoothstep(float(0.09), float(0.015), edgeD)
    .mul(smoothstep(float(0.35), float(0.7), streak))
    .mul(froth)
    .mul(bank)
  const rapidFoam = smoothstep(float(1.7), float(3.0), flow)
    .mul(smoothstep(float(0.3), float(0.62), streak))
    .mul(froth)
  const foam = max(bankFoam, rapidFoam).mul(0.85)
  // The sea-mouth crossfade is applied LAST, over base and foam alike, so
  // streaks and whitewater dissolve along with the ribbon ('#1c5c86' is the
  // sea sheet's nearshore mid tone, render/water.ts).
  m.colorNode = mix(mix(base, color('#eef6f7'), foam.mul(0.9)), color('#1c5c86'), seaFade)

  // Only slight movement on the surface (design.md §11): a tiny ripple, no
  // wave field.
  const ripple = mx_fractal_noise_float(vec3(u.mul(1.3).sub(time.mul(flow).mul(0.45)), v.mul(3), time.mul(0.1)), 2)
  // The Nile rides its flood (point 138): a vertical rise on its own vertices
  // (floodK = 1), matching the CPU float height exactly. Vertical ONLY — the
  // ribbon keeps its width, so the flood cannot reach new ground.
  const floodRise = (attribute('floodK', 'float') as unknown as ReturnType<typeof float>).mul(NILE_FLOOD_U)
  m.positionNode = positionLocal.add(vec3(0, ripple.mul(0.035).add(floodRise), 0))

  // Point 314: the ribbon dissolves only where the sea sheet really draws.
  // Over its final approach the widened channel still lies on terrain LAND,
  // where the sheet is masked out — fading there left neither surface, and the
  // bare carved bed showed through as pale, greenish, blocky patches rimmed by
  // the sheet's shore foam (the Rosetta mouth). Its colour still slides to
  // the sea tone, so the hand-over at the waterline stays seamless.
  const sheetHere = seaSheetCover(positionWorld.x.div(10), positionWorld.z.negate().div(10))
  m.opacityNode = merge.mul(seaFade.mul(sheetHere).oneMinus()).mul(0.9)
  m.roughnessNode = foam.mul(0.6).add(0.12)
  return m
}

/** Calm lake surface: soft ripple, sky gloss, no current. */
function createLakeMaterial(): THREE.MeshStandardNodeMaterial {
  if (lakeMaterialCache) return lakeMaterialCache
  const m = lakeMaterialCache = new THREE.MeshStandardNodeMaterial()
  m.transparent = true
  m.roughness = 0.1
  m.metalness = 0.02
  const wp = positionLocal.xz
  const ripple = mx_fractal_noise_float(vec3(wp.mul(0.3), time.mul(0.08)), 3).mul(0.5).add(0.5)
  m.colorNode = mix(color('#25607f'), color('#3f8fa8'), ripple.mul(0.4))
  m.opacityNode = float(0.92)
  return m
}

/** Flat lake polygon just above its highest interior bed sample (design.md §2 water). */
function buildLakeSurfaces(
  seed: number,
): Array<{ geometry: THREE.BufferGeometry; y: number; bedMax: number }> {
  return LAKES.map((lake, li) => {
    const shape = new THREE.Shape()
    lake.points.forEach(([lon, lat], i) => {
      const w = latLonToWorld(lat, lon)
      if (i === 0) shape.moveTo(w.x, -w.z)
      else shape.lineTo(w.x, -w.z)
    })
    // The sheet sits just above the highest interior bed sample (see
    // lakeBedMax; a min over the shore points let a single low outlier pull
    // the sheet under the carved bed, TASKS pt. 11).
    const bedMax = lakeBedMax(li, seed)
    const geometry = new THREE.ShapeGeometry(shape)
    geometry.rotateX(-Math.PI / 2)
    return { geometry, y: Math.max(-0.05, bedMax + LAKE_LIFT), bedMax }
  })
}

/** White cascade with plunge-pool foam at a waterfall landmark (§4.4). */
function Waterfall({ fall }: { fall: FallDef }) {
  const drop = Math.max(0.8, fall.yTop - fall.yBottom)
  return (
    <group name="river-waterfall" position={[fall.x, 0, fall.z]} rotation={[0, fall.yaw, 0]}>
      {/* Cascade sheet leaning down the flow direction */}
      <mesh position={[0, fall.yBottom + drop / 2, 0]} rotation={[0.22, 0, 0]}>
        <planeGeometry args={[2.4, drop + 0.4]} />
        <meshStandardMaterial color="#f2f9fb" transparent opacity={0.85} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* Plunge-pool foam */}
      <mesh position={[0, fall.yBottom + 0.06, 1.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.5, 18]} />
        <meshStandardMaterial color="#e8f4f6" transparent opacity={0.75} roughness={0.6} />
      </mesh>
      {/* Rising mist */}
      <mesh position={[0, fall.yBottom + drop * 0.45, 0.9]}>
        <sphereGeometry args={[0.9, 8, 6]} />
        <meshStandardMaterial color="#f4fafc" transparent opacity={0.22} roughness={1} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** Built spring bodies by source, for the dev verification hook. */
const springBodies = new Map<string, { x: number; z: number; waterY: number; build: SpringBuild }>()

/** Spring: a small 3D water feature where a river rises in open land
 *  (design.md §11.3) — a welling dome whose surface boils, ripple rings
 *  running over the wet pool, and a damp apron laid on the terrain with an
 *  outflow lobe toward the river. One mesh (springGeometry.ts, TSL material in
 *  springMaterial.ts) plus a few rising bubble spheres where quality allows. */
function Spring({ spring, seed }: { spring: SpringDef; seed: number }) {
  const segments = useUi(effectiveSpringSegments)
  const bubbleCount = useUi(effectiveSpringBubbles)
  const bubbles = useRef<(THREE.Mesh | null)[]>([])
  const material = useMemo(() => getSpringMaterial(), [])
  const body = useMemo(
    () =>
      buildSpringGeometry({
        shape: springShape(balance.spring.radius, balance.spring.domeHeight),
        waterY: spring.y,
        outflowAngle: spring.outflowAngle,
        segments,
        rings: Math.round(segments / 2),
        groundAt: (dx, dz) => {
          const ll = worldToLatLon(spring.x + dx, spring.z + dz)
          return sampleTerrain(ll.lat, ll.lon, seed).height
        },
      }),
    [spring, seed, segments],
  )
  useEffect(() => {
    const key = `${spring.x},${spring.z}`
    springBodies.set(key, { x: spring.x, z: spring.z, waterY: spring.y, build: body })
    return () => {
      springBodies.delete(key)
      body.geometry.dispose()
    }
  }, [body, spring])
  const crest = body.peakY - spring.y
  useFrame(({ clock }) => {
    SPRING_BUBBLE_AMP_U.value = balance.spring.bubbleAmplitude
    SPRING_GLOW_U.value = balance.spring.glow
    const t = clock.elapsedTime
    for (let i = 0; i < bubbleCount; i++) {
      const m = bubbles.current[i]
      if (!m) continue
      const b = springBubble(i, bubbleCount, t)
      m.position.y = crest + b.y
      const s = Math.max(0.001, b.scale)
      m.scale.set(s, s, s)
    }
  })
  const ringR = balance.spring.radius * 0.08
  return (
    <group name="river-spring" position={[spring.x, spring.y, spring.z]}>
      <mesh name="river-spring-body" geometry={body.geometry} material={material} renderOrder={2} />
      {Array.from({ length: bubbleCount }, (_, i) => {
        const a = (i / Math.max(1, bubbleCount)) * Math.PI * 2
        return (
          <mesh
            key={i}
            ref={(m) => { bubbles.current[i] = m }}
            position={[Math.cos(a) * ringR, crest, Math.sin(a) * ringR]}
          >
            <sphereGeometry args={[0.04, 6, 5]} />
            <meshStandardMaterial color="#e6f6f9" transparent opacity={0.82} roughness={0.2} depthWrite={false} />
          </mesh>
        )
      })}
    </group>
  )
}

// River ribbon + lake sheets, MODULE-cached by seed (point 96): the ribbon and
// lake meshes opt out of disposal (`dispose={null}` on each), so a per-mount
// build would leak the whole river network's GPU buffers on every place visit — the cache reuses them on
// re-entry (and skips the CPU rebuild); a new run disposes and rebuilds.
let riversBundleCache: {
  seed: number
  rivers: ReturnType<typeof buildRivers>
  lakes: ReturnType<typeof buildLakeSurfaces>
} | null = null
function getRiversBundle(seed: number) {
  if (riversBundleCache && riversBundleCache.seed === seed) return riversBundleCache
  if (riversBundleCache) {
    riversBundleCache.rivers.geometry.dispose()
    riversBundleCache.lakes.forEach((l) => l.geometry.dispose())
  }
  riversBundleCache = { seed, rivers: buildRivers(seed), lakes: buildLakeSurfaces(seed) }
  return riversBundleCache
}

export function RiversAndLakes() {
  const seed = useGame((s) => s.seed)
  const bundle = useMemo(() => getRiversBundle(seed), [seed])

  // Mirror the CPU flood rise into the ribbon uniform each frame (point 138):
  // one source (waterSurface.NILE_FLOOD), two readers, no drift.
  useFrame(() => {
    NILE_FLOOD_U.value = NILE_FLOOD.rise
  })
  const { geometry, falls, springs, report } = bundle.rivers
  const lakes = bundle.lakes
  const riverMat = useMemo(() => createRiverMaterial(), [])
  const lakeMat = useMemo(() => createLakeMaterial(), [])

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    // gaps = interior ribbon breaks summed over all rivers (strips-1 each);
    // buried = points where the surface would sit under the terrain. Both 0 =
    // every river renders as one continuous, never-buried ribbon (design.md §11).
    const gaps = Object.values(report).reduce((n, r) => n + Math.max(0, r.strips - 1), 0)
    const buried = Object.values(report).reduce((n, r) => n + r.buried, 0)
    // lakeInfo: each surface's height vs. its highest interior bed sample —
    // y > bedMax for every lake proves no lake surface is buried (TASKS pt. 11).
    const lakeInfo = lakes.map((l) => ({ y: l.y, bedMax: l.bedMax }))
    w.__rivers = {
      falls: falls.length, springs: springs.length, lakes: lakes.length, gaps, buried, report, lakeInfo,
      // The 3D spring bodies (design.md §11.3): centre, water level, dome
      // peak and the outer rim in ABSOLUTE world coordinates, so a check can
      // compare the rim against the terrain heights.
      springBodies: () => [...springBodies.values()].map((b) => ({
        x: b.x, z: b.z, waterY: b.waterY, peakY: b.build.peakY, poolY: b.build.poolY,
        rim: b.build.rim.map((r) => ({ x: b.x + r.dx, z: b.z + r.dz, y: r.y })),
      })),
      // Point 138 — read through the APP's module instance. A probe that
      // dynamic-imports waterSurface.ts by URL can get a FRESH instance after
      // HMR (?t= cache busting) whose NILE_FLOOD is untouched, and then reads a
      // rise of 0 while the game is at full flood. Mutable module state must be
      // read through a dev hook, never through a parallel import.
      floodRise: () => NILE_FLOOD.rise,
      surfaceAt: (lat: number, lon: number) => {
        const s = useGame.getState()
        return waterSurfaceY(lat, lon, s.seed, sampleTerrain(lat, lon, s.seed).height)
      },
      // The visibly drawn sheet height WITHOUT the canoe-float's local-bed
      // floor (point 274) — what a staged hidden crocodile must anchor to.
      sheetAt: (lat: number, lon: number) => renderedSheetY(lat, lon, useGame.getState().seed),
    }
    return () => {
      delete w.__rivers
    }
  }, [falls, springs, lakes, report])

  return (
    <>
      {/* Named so a verification can ask the DRAWN course where the water is
          (work-order 482: the settlement's bank must lie on the same side as
          the ribbon the bird's-eye view actually paints). */}
      <mesh name="rivers-ribbon" geometry={geometry} material={riverMat} renderOrder={1} dispose={null} />
      {lakes.map((l, i) => (
        <mesh key={i} name="lake-sheet" geometry={l.geometry} material={lakeMat} position={[0, l.y, 0]} renderOrder={1} dispose={null} />
      ))}
      {falls.map((f, i) => (
        <Waterfall key={i} fall={f} />
      ))}
      {springs.map((s, i) => (
        <Spring key={i} spring={s} seed={seed} />
      ))}
    </>
  )
}
