// The river a settlement stands on, DRAWN IN THE SCENE (work-order 482): the
// ground plate cut off at the top of the bank, the shore sloping down into the
// water, the water surface itself, and the foam riding it downstream.
//
// It is real geometry standing on the settlement's own ground, not a painting on
// the §2.5 surroundings backdrop — the player walks to it, stands at it and
// looks down at it. Where it ends, at the plate's outer rim, the compressed
// panorama continues the same river out to the horizon, because the bank was
// derived from the world model at the panorama's own scale (`riverBank.ts`) —
// and it LOOKS like the same river because both halves are shaded from the one
// description in `waterAppearance.ts` (work-order 525).
//
// THE CURRENT HAS TO BE VISIBLE. Everything the whole UPSTREAM/DOWNSTREAM
// teaching hangs on is the player being able to SEE which way the water runs, so
// the direction is carried by two independent readings: streaks and foam
// scrolling downstream in the shader, and flecks of foam that are real, moving
// positions — which is what lets a verification MEASURE the direction instead of
// assuming it.

import * as THREE from 'three/webgpu'
import { float, instanceIndex, mx_fractal_noise_float, positionLocal, smoothstep, time, uv, vec3 } from 'three/tsl'
import {
  BANK_BED_DEPTH,
  BANK_BED_REACH,
  BANK_SHORE_HALF,
  BANK_WATER_DROP,
  bankShoreRows,
  type PlaceRiverBank,
} from '../scenes/place/riverBank'
import { groundPlateRadius, type PlaceBounds } from '../scenes/place/boundary'
import { balance } from '../config/balance'
import {
  RIVER_WATER_TONES,
  WATER_FOAM_ROUGHNESS,
  WATER_METALNESS,
  WATER_ROUGHNESS,
  riverWaterSurface,
} from './waterAppearance'

/** How far out from the waterline the drawn water reaches. Enough to pass the
 *  ground plate's rim, where the panorama backdrop takes the river over. It is
 *  the bank profile's own reach (`riverBank.ts`), so water and bed end together. */
export const RIVER_REACH = BANK_BED_REACH
/** Half-length of the drawn water along the bank; the plate and the backdrop
 *  hide whatever of it lies past the bank window. */
export const RIVER_HALF_LENGTH = 42

/** The along-bank span the drifting foam is spread over and recycled in. */
export const RIVER_DRIFT_SPAN = 40

/**
 * The settlement's ground plate: the walkable disc, cut off along the straight
 * top of the river bank where there is one (`groundPlateRadius`). A triangle
 * fan, so every rim vertex lies exactly ON the cut — and a straight line
 * between two points on a straight line IS that line, which is why the cut
 * comes out exact rather than faceted however few segments are used.
 */
export function buildGroundPlateGeometry(
  bounds: PlaceBounds,
  discEdge: number,
  segments: number,
): THREE.BufferGeometry {
  const n = Math.max(8, Math.round(segments))
  const positions = new Float32Array((n + 2) * 3)
  const normals = new Float32Array((n + 2) * 3)
  const indices: number[] = []
  normals[1] = 1
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = groundPlateRadius(bounds, a, discEdge)
    const v = (i + 1) * 3
    positions[v] = Math.cos(a) * r
    positions[v + 2] = Math.sin(a) * r
    normals[v + 1] = 1
    if (i < n) indices.push(0, i + 2, i + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  g.setIndex(indices)
  return g
}

/**
 * The shore: the strip of ground between the top of the bank and the bed,
 * sloping down through the waterline into the water. Drawn with the settlement's
 * own ground material, so the bank is the village's earth rather than a separate
 * surface.
 *
 * Its profile is NOT stated here — it is `bankShoreRows`, the same description
 * the walk reads (work-order 584): the player wades down THIS ground, so a
 * second, drifting shape would be a bank that is not where it is drawn.
 */
export function buildBankShoreGeometry(
  bank: PlaceRiverBank,
  halfLength: number,
  downLength = halfLength,
): THREE.BufferGeometry {
  const rows = bankShoreRows(bank)
  const cols = 2
  const positions: number[] = []
  const indices: number[] = []
  for (const [out, y] of rows) {
    for (let c = 0; c < cols; c++) {
      // Upstream end first, then the downstream one — which may run further,
      // where the bank's walkable lobe does (work-order 1237).
      const along = c === 0 ? -halfLength : downLength
      positions.push(bank.nx * out + bank.fx * along, y, bank.nz * out + bank.fz * along)
    }
  }
  // Wound so the faces look UP: the row step runs outward along the bank normal
  // and the column step downstream, and it is `column × row` that has the
  // positive Y — the other order leaves every normal pointing into the ground
  // and the whole shore renders as an unlit black band.
  for (let r = 0; r + 1 < rows.length; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const a = r * cols + c
      indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  g.setIndex(indices)
  g.computeVertexNormals()
  return g
}

/** How far the river floor runs past the drawn water, out and along (m). Far
 *  enough that no sight line under the transparent water escapes it. */
export const RIVER_FLOOR_REACH = 400
/** The floor lies this far under the deepest bed row, so the bed stays on top. */
export const RIVER_FLOOR_SINK = 0.05

/**
 * THE RIVER'S FLOOR (work-order 1250). The drawn water is transparent and writes
 * no depth, and the bed under it ends `BANK_BED_REACH` out, at the ends of the
 * drawn shore. A sight line that dipped under the surface and passed the bed's
 * edge met nothing opaque until the §2.5 panorama band 200 m off, whose low rows
 * hold the captured savanna — the reported flat yellow band on the river
 * between the dugout and the near bank. One flat opaque quad at bed depth, from
 * the waterline far out and far along, closes the underside; the sloping bed
 * and every surface above it cover it wherever they are drawn.
 */
export function buildRiverFloorGeometry(bank: PlaceRiverBank, halfLength: number, downLength = halfLength): THREE.BufferGeometry {
  const y = -BANK_WATER_DROP - BANK_BED_DEPTH - RIVER_FLOOR_SINK
  const near = bank.distance
  const far = bank.distance + BANK_BED_REACH + RIVER_FLOOR_REACH
  const up = -(halfLength + RIVER_FLOOR_REACH)
  const down = downLength + RIVER_FLOOR_REACH
  const at = (out: number, along: number) => [bank.nx * out + bank.fx * along, y, bank.nz * out + bank.fz * along]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...at(near, up), ...at(near, down), ...at(far, up), ...at(far, down)]), 3))
  // Wound face-up, as the shore is: column (downstream) × row (outward).
  g.setIndex([0, 1, 2, 1, 3, 2])
  g.computeVertexNormals()
  return g
}

/**
 * The water surface. Its UVs carry METRES, not a 0..1 parametrisation: u runs
 * DOWNSTREAM along the bank and v out from the waterline, so the shader's
 * streak scale and shore foam are stated in world size and cannot change with
 * the mesh's extent or its tessellation.
 */
export function buildRiverSurfaceGeometry(
  bank: PlaceRiverBank,
  halfLength: number,
  segments: number,
  downLength = halfLength,
): THREE.BufferGeometry {
  // The segment count is stated for the symmetric span, so a longer downstream
  // reach keeps the same density along the bank (work-order 1237).
  const along = Math.max(1, Math.round((segments * (halfLength + downLength)) / (2 * halfLength)))
  const across = 4
  const inner = bank.distance - BANK_SHORE_HALF
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let r = 0; r <= across; r++) {
    const out = inner + (r / across) * (RIVER_REACH + BANK_SHORE_HALF)
    for (let c = 0; c <= along; c++) {
      const u = -halfLength + (c / along) * (halfLength + downLength)
      positions.push(bank.nx * out + bank.fx * u, -BANK_WATER_DROP, bank.nz * out + bank.fz * u)
      normals.push(0, 1, 0)
      uvs.push(u, out - bank.distance)
    }
  }
  // Wound face-up, for the same reason as the shore above.
  for (let r = 0; r < across; r++) {
    for (let c = 0; c < along; c++) {
      const a = r * (along + 1) + c
      indices.push(a, a + 1, a + along + 1, a + 1, a + along + 2, a + along + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
  g.setIndex(indices)
  return g
}

// Module singletons, one per detail level (point 96): a remount must reuse the
// material so the renderer keeps its program instead of re-linking on the first
// frame back. The octave count is a shader constant, so a level change builds
// its own — and each stays cached for the F9 cycle back.
const riverMaterialCache = new Map<number, THREE.MeshStandardNodeMaterial>()

/**
 * The settlement river's surface: calm water, streaks drawn out along the
 * current and scrolling DOWNSTREAM, foam gathering at the near shore.
 *
 * The appearance itself is NOT stated here — it comes from `waterAppearance.ts`,
 * the one description the panorama's continuation of this same river reads too
 * (work-order 525). What this function contributes is the surface's own frame:
 * the UVs carry metres, `u` growing downstream (the geometry puts metres along
 * the bank into it) and `v` out from the waterline, which is exactly the frame
 * the panorama reconstructs from world position — so the field runs on across
 * the plate's rim instead of restarting at it.
 */
export function createPlaceRiverMaterial(octaves: number): THREE.MeshStandardNodeMaterial {
  const cached = riverMaterialCache.get(octaves)
  if (cached) return cached
  const m = new THREE.MeshStandardNodeMaterial()
  m.transparent = true
  m.depthWrite = false
  m.roughness = WATER_ROUGHNESS
  m.metalness = WATER_METALNESS
  m.side = THREE.DoubleSide

  // Metres along the current, and metres out from the waterline.
  const water = riverWaterSurface({ along: uv().x, across: uv().y, octaves })
  m.colorNode = water.color
  // Only slight movement on the surface (design.md §11): a ripple riding the
  // same current, no wave field.
  m.positionNode = positionLocal.add(vec3(0, water.ripple, 0))
  m.opacityNode = water.opacity
  m.roughnessNode = water.roughness
  riverMaterialCache.set(octaves, m)
  return m
}

// --- The drifting foam patches ------------------------------------------------
//
// They used to be a 10-sided disc in a plain material of their own (matt, one
// flat opacity, a tone no other water used), so at the bank they read as pale
// paper cut-outs with facet corners lying ON the water. Now they are shaded as
// the water's own foam: the shared tone, the water's foam roughness and
// metalness, and an alpha that frays out at a ragged rim, so the water's sheen
// shows through at the edge instead of a hard outline.

/** Rim segments of a patch: enough that no corner survives the stretch. */
export const FOAM_PATCH_SEGMENTS = 32
/** Peak opacity at a patch's heart (art constant, calibratable). */
export const FOAM_PATCH_OPACITY = 0.85
/** Normalised radius where the fade to the rim begins, and how far the noise
 *  pushes the rim in and out (art constants, calibratable). */
export const FOAM_PATCH_CORE = 0.25
export const FOAM_PATCH_FRAY = 0.3
/** Width of the noise-free guard band inside the geometry rim, where the
 *  opacity falls to exactly 0 however far the noise pushed the rim out. */
export const FOAM_PATCH_RIM = 0.15

function smoothstepJs(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** CPU mirror of the patch opacity node: `r` is the normalised distance from
 *  the centre (1 = geometry rim), `churn` the noise sample. Both edge pairs
 *  are ordered (edge0 < edge1), which GLSL ES requires on the WebGL 2 path. */
export function foamPatchOpacity(r: number, churn: number): number {
  const fray = 1 - smoothstepJs(FOAM_PATCH_CORE, 1, r + churn * FOAM_PATCH_FRAY)
  const guard = 1 - smoothstepJs(1 - FOAM_PATCH_RIM, 1, r)
  return fray * guard * FOAM_PATCH_OPACITY
}

/** The unit patch, lying flat and facing up like the water surface. */
export function buildFoamPatchGeometry(): THREE.BufferGeometry {
  return new THREE.CircleGeometry(1, FOAM_PATCH_SEGMENTS).rotateX(-Math.PI / 2)
}

let foamMaterial: THREE.MeshStandardNodeMaterial | null = null

/** The foam patches' material, a module singleton like the river's (point 96). */
export function createRiverFoamMaterial(): THREE.MeshStandardNodeMaterial {
  if (foamMaterial) return foamMaterial
  const m = new THREE.MeshStandardNodeMaterial()
  m.transparent = true
  m.depthWrite = false
  m.color = new THREE.Color(RIVER_WATER_TONES.foam)
  m.roughness = WATER_ROUGHNESS + WATER_FOAM_ROUGHNESS
  m.metalness = WATER_METALNESS
  // Normalised distance from the patch centre (CircleGeometry's UV centre is
  // 0.5, its rim radius 0.5), pushed in and out by a noise that differs per
  // patch and churns slowly, so no two patches share an outline.
  const r = uv().sub(0.5).length().mul(2)
  const churn = mx_fractal_noise_float(
    vec3(uv().mul(3.5), float(instanceIndex).mul(1.37).add(time.mul(0.15))),
    2,
  )
  const edge = r.add(churn.mul(FOAM_PATCH_FRAY))
  // Same formula as foamPatchOpacity.
  const fray = smoothstep(float(FOAM_PATCH_CORE), float(1), edge).oneMinus()
  const guard = smoothstep(float(1 - FOAM_PATCH_RIM), float(1), r).oneMinus()
  m.opacityNode = fray.mul(guard).mul(FOAM_PATCH_OPACITY)
  foamMaterial = m
  return m
}

// --- The flotsam riding the current (work-order 1280) ------------------------
//
// Foam alone read as a few pale dots; a river past a village carries what the
// banks drop into it. So the drift set is MIXED: foam patches, leaves, grass
// tufts torn from the bank, and twigs — all on the one drift phase the water's
// pattern rides (`riverDrift`), so nothing on the surface outruns anything else.

/** What a drifting item is. */
export type FlotsamKind = 'foam' | 'leaf' | 'grass' | 'twig'
export const FLOTSAM_KINDS: readonly FlotsamKind[] = ['foam', 'leaf', 'grass', 'twig']

/** One item riding the current. */
export interface RiverFleck {
  /** What it is. */
  kind: FlotsamKind
  /** Along-bank offset at phase 0, in metres (0 .. `RIVER_DRIFT_SPAN`). */
  along0: number
  /** Distance out from the waterline, in metres. */
  across: number
  /** Nominal size in metres — a foam patch's radius; the other kinds derive
   *  their drawn dimensions from it (`flotsamScale`). */
  size: number
  /** Heading on the water at phase 0 (radians, 0 = along the current). */
  yaw0: number
  /** Slow turn while it drifts, radians per metre travelled (a twig swings
   *  round as it rides, a leaf turns). */
  spin: number
}

/**
 * Deterministic kind sequence for `count` items over the share `mix`: a
 * largest-deficit walk, so the kinds interleave along the current and every
 * count gets its shares to within one item. Index 0 is always foam (the reading
 * the oldest checks were written against) wherever foam has a share.
 */
export function flotsamKinds(count: number, mix: Record<FlotsamKind, number>): FlotsamKind[] {
  const total = FLOTSAM_KINDS.reduce((a, k) => a + Math.max(0, mix[k]), 0)
  const share = (k: FlotsamKind) => (total > 0 ? Math.max(0, mix[k]) / total : k === 'foam' ? 1 : 0)
  const given: Record<FlotsamKind, number> = { foam: 0, leaf: 0, grass: 0, twig: 0 }
  const out: FlotsamKind[] = []
  for (let i = 0; i < count; i++) {
    let best: FlotsamKind = 'foam'
    let deficit = -Infinity
    for (const k of FLOTSAM_KINDS) {
      const d = share(k) * (i + 1) - given[k]
      if (d > deficit + 1e-9) {
        deficit = d
        best = k
      }
    }
    given[best]++
    out.push(best)
  }
  return out
}

/**
 * The flotsam, deterministically spread: evenly along the current (so the flow
 * reads as continuous rather than as a clump) and scattered across it, the
 * kinds interleaved by `mix`. Pure — the scene only advances the phase.
 */
export function buildRiverFlecks(
  count: number,
  mix: Record<FlotsamKind, number> = balance.riverCurrent.flotsamMix,
): RiverFleck[] {
  const out: RiverFleck[] = []
  const n = Math.max(0, Math.round(count))
  const kinds = flotsamKinds(n, mix)
  for (let i = 0; i < n; i++) {
    // A golden-ratio walk across the channel: no seed to carry, no two items
    // in a row at the same distance out, the same set in every run.
    const g = (i * 0.6180339887) % 1
    const h = (i * 0.7548776662) % 1
    out.push({
      kind: kinds[i],
      along0: ((i + 0.5) / n) * RIVER_DRIFT_SPAN,
      across: i % 2 === 0 ? 0.8 + g * 3 : 4 + g * (RIVER_REACH - 5),
      size: 0.35 + ((i * 0.381966) % 1) * 0.3,
      yaw0: (h - 0.5) * Math.PI,
      spin: ((i * 0.5698402910) % 1 - 0.5) * 0.35,
    })
  }
  return out
}

/** The drawn scale (x across, y up, z along the heading) of an item of `kind`
 *  and nominal `size`, applied to that kind's unit geometry. */
export function flotsamScale(kind: FlotsamKind, size: number): [number, number, number] {
  switch (kind) {
    case 'foam':
      return [size * 0.55, 1, size * 2.4]
    case 'leaf':
      return [size * 0.22, 1, size * 0.42] // a 7-14 cm leaf
    case 'grass':
      return [size * 0.7, size * 0.7, size * 0.9] // a torn tuft, 25-50 cm
    case 'twig':
      return [size * 0.9, size * 0.9, size * 1.6] // a 55-105 cm stick
  }
}

/** Height of an item's origin above the water plane, in metres: clear of the
 *  ripple (±0.03 m) so the surface never swallows it. */
export const FLOTSAM_FLOAT: Record<FlotsamKind, number> = { foam: 0.035, leaf: 0.04, grass: 0.04, twig: 0.045 }

/** A unit leaf lying flat: a pointed oval, 1 long (z) and 1 wide (x). */
export function buildLeafGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(0, -0.5)
  shape.quadraticCurveTo(0.55, -0.1, 0, 0.5)
  shape.quadraticCurveTo(-0.55, -0.1, 0, -0.5)
  return new THREE.ShapeGeometry(shape, 4).rotateX(-Math.PI / 2)
}

/** A unit tuft of torn grass: a fan of thin blades lying on the water, the tips
 *  lifted a little, all rooted in one knot. */
export function buildGrassTuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = []
  const blades = 7
  for (let b = 0; b < blades; b++) {
    const a = ((b / (blades - 1)) - 0.5) * 1.1
    const len = 0.75 + ((b * 0.618) % 1) * 0.25
    const tx = Math.sin(a) * len * 0.5
    const tz = Math.cos(a) * len - 0.5
    const w = 0.035
    positions.push(-w * Math.cos(a), 0, -0.5 + w * Math.sin(a), w * Math.cos(a), 0, -0.5 - w * Math.sin(a), tx, 0.08, tz)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  g.computeVertexNormals()
  return g
}

/** A unit twig: a thin round stick of length 1 along z with a short side
 *  shoot, so it reads as wood rather than as a rod. */
export function buildTwigGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.018, 0.026, 1, 5, 1).rotateX(Math.PI / 2)
  const shoot = new THREE.CylinderGeometry(0.008, 0.014, 0.32, 4, 1)
    .rotateX(Math.PI / 2)
    .rotateY(0.7)
    .translate(0.09, 0, 0.12)
  const merged = new THREE.BufferGeometry()
  const parts = [stem.toNonIndexed(), shoot.toNonIndexed()]
  const pos = parts.flatMap((p) => Array.from(p.getAttribute('position').array as Float32Array))
  merged.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  merged.computeVertexNormals()
  stem.dispose()
  shoot.dispose()
  for (const p of parts) p.dispose()
  return merged
}

/** Unit geometry of each non-foam kind (the foam patch keeps its own). */
export function buildFlotsamGeometry(kind: Exclude<FlotsamKind, 'foam'>): THREE.BufferGeometry {
  if (kind === 'leaf') return buildLeafGeometry()
  if (kind === 'grass') return buildGrassTuftGeometry()
  return buildTwigGeometry()
}

/** Tones per kind (art constants, calibratable): each item takes one of its
 *  kind's tones, by index, so a drift of leaves is not one flat colour. */
export const FLOTSAM_TONES: Record<Exclude<FlotsamKind, 'foam'>, readonly string[]> = {
  leaf: ['#6f7a2c', '#8a6a2a', '#5d6b2a', '#9c7b3a'],
  grass: ['#a39a4e', '#8c8a45', '#b5a35a'],
  twig: ['#5a4430', '#6b5238', '#4a3a2a'],
}

let debrisMaterial: THREE.MeshStandardNodeMaterial | null = null

/** The leaves', tufts' and twigs' material: matt, wet-dark, double-sided (a
 *  leaf and a blade are single sheets), coloured per instance. A module
 *  singleton like the foam's. */
export function createFlotsamMaterial(): THREE.MeshStandardNodeMaterial {
  if (debrisMaterial) return debrisMaterial
  const m = new THREE.MeshStandardNodeMaterial()
  m.color = new THREE.Color('#ffffff')
  m.roughness = 0.7
  m.metalness = 0
  m.side = THREE.DoubleSide
  debrisMaterial = m
  return m
}

/**
 * Where a drifting item is at a given drift phase (metres travelled downstream).
 * It rides the current until it has covered the span, then re-enters upstream —
 * so over any window shorter than the span, a patch that did not wrap has moved
 * DOWNSTREAM by exactly the phase advance. That is the measurable claim.
 */
export function fleckPosition(
  bank: PlaceRiverBank,
  fleck: RiverFleck,
  phase: number,
): { x: number; y: number; z: number } {
  const span = RIVER_DRIFT_SPAN
  let along = (fleck.along0 + phase) % span
  if (along < 0) along += span
  along -= span / 2
  const out = bank.distance + fleck.across
  return {
    x: bank.nx * out + bank.fx * along,
    y: -BANK_WATER_DROP + FLOTSAM_FLOAT[fleck.kind],
    z: bank.nz * out + bank.fz * along,
  }
}
