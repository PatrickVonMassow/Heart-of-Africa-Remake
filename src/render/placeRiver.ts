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
import { positionLocal, uv, vec3 } from 'three/tsl'
import {
  BANK_BED_REACH,
  BANK_SHORE_HALF,
  BANK_WATER_DROP,
  bankShoreRows,
  type PlaceRiverBank,
} from '../scenes/place/riverBank'
import { groundPlateRadius, type PlaceBounds } from '../scenes/place/boundary'
import { WATER_METALNESS, WATER_ROUGHNESS, riverWaterSurface } from './waterAppearance'

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
export function buildBankShoreGeometry(bank: PlaceRiverBank, halfLength: number): THREE.BufferGeometry {
  const rows = bankShoreRows(bank)
  const cols = 2
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  for (const [out, y] of rows) {
    for (let c = 0; c < cols; c++) {
      const along = (c / (cols - 1) - 0.5) * 2 * halfLength
      positions.push(bank.nx * out + bank.fx * along, y, bank.nz * out + bank.fz * along)
      normals.push(0, 1, 0)
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
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3))
  g.setIndex(indices)
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
): THREE.BufferGeometry {
  const along = Math.max(1, Math.round(segments))
  const across = 4
  const inner = bank.distance - BANK_SHORE_HALF
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let r = 0; r <= across; r++) {
    const out = inner + (r / across) * (RIVER_REACH + BANK_SHORE_HALF)
    for (let c = 0; c <= along; c++) {
      const u = (c / along - 0.5) * 2 * halfLength
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

/** One patch of foam riding the current. */
export interface RiverFleck {
  /** Along-bank offset at phase 0, in metres (0 .. `RIVER_DRIFT_SPAN`). */
  along0: number
  /** Distance out from the waterline, in metres. */
  across: number
  /** Radius of the drawn patch, in metres. */
  size: number
}

/**
 * The foam patches, deterministically spread: evenly along the current (so the
 * flow reads as continuous rather than as a clump) and scattered across it.
 * Pure — the scene only advances the phase.
 */
export function buildRiverFlecks(count: number): RiverFleck[] {
  const out: RiverFleck[] = []
  const n = Math.max(0, Math.round(count))
  for (let i = 0; i < n; i++) {
    // A golden-ratio walk across the channel: no seed to carry, no two patches
    // in a row at the same distance out, the same set in every run.
    const g = (i * 0.6180339887) % 1
    out.push({
      along0: ((i + 0.5) / n) * RIVER_DRIFT_SPAN,
      across: 1.1 + g * (RIVER_REACH - 3),
      size: 0.22 + ((i * 0.381966) % 1) * 0.3,
    })
  }
  return out
}

/**
 * Where a foam patch is at a given drift phase (metres travelled downstream).
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
    y: -BANK_WATER_DROP + 0.035,
    z: bank.nz * out + bank.fz * along,
  }
}
