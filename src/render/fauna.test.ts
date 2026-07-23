// Baby-schema calf geometry invariants (design.md §19): a juvenile reads as
// young beyond its mere size — a proportionally larger head on a shorter
// neck, a shorter body on a leggy stance, and none of the adult ornaments
// (horns, tusks, beard, mane). The calf builds stay at adult scale; the
// per-animal spawn scale shrinks them.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import {
  buildAntelope,
  buildAntelopeCalf,
  buildCheetah,
  buildCrocodile,
  buildElephant,
  buildElephantTrunk,
  ELEPHANT_TRUNK_RINGS,
  buildFlamingo,
  buildGiraffe,
  buildGoat,
  buildGoatParts,
  faceVelocity,
  gaitPhase,
  legSwingAngle,
  GAIT_CADENCE,
  buildHyena,
  buildLeopard,
  buildLion,
  buildLionCub,
  buildPlover,
  buildPloverChick,
  buildVulture,
  buildWarthog,
  buildWarthogCalf,
  buildWildebeest,
  buildWildebeestCalf,
  buildZebra,
  buildZebraCalf,
  calfProportions,
  createCrocodileMaterial,
  createFaunaMaterial,
  CROCODILE_FADE_BAND,
  CROCODILE_LAYOUT,
  CROCODILE_SUBMERGE_DEPTH,
  CROCODILE_WATERLINE_NONE,
  crocodileSubmergedAlpha,
  crocodileWaterlineLocal,
  CROCODILE_LUNGE_LIFT,
  crocodileBodyY,
  FAUNA_TESSELLATION,
  type QuadrupedSpec,
} from './fauna'

const zExtent = (g: THREE.BufferGeometry): number => {
  g.computeBoundingBox()
  return g.boundingBox!.max.z - g.boundingBox!.min.z
}
const topY = (g: THREE.BufferGeometry): number => {
  g.computeBoundingBox()
  return g.boundingBox!.max.y
}
const vertices = (g: THREE.BufferGeometry): number => g.attributes.position.count

describe('calfProportions (design.md §19 — baby schema)', () => {
  const adult: QuadrupedSpec = {
    bodyLen: 1.5,
    bodyR: 0.42,
    legH: 0.75,
    legR: 0.07,
    neckLen: 0.65,
    neckTilt: 0.6,
    headSize: 0.2,
    bodyColor: '#d8d4cc',
    horns: true,
    seed: 1,
  }
  const calf = calfProportions(adult)

  it('enlarges the head and shortens neck and body', () => {
    expect(calf.headSize).toBeGreaterThan(adult.headSize * 1.3)
    expect(calf.neckLen).toBeLessThan(adult.neckLen * 0.8)
    expect(calf.bodyLen).toBeLessThan(adult.bodyLen * 0.75)
  })

  it('keeps the leg height for the leggy juvenile stance, on thinner legs', () => {
    expect(calf.legH).toBe(adult.legH)
    expect(calf.legR).toBeLessThan(adult.legR)
  })

  it('drops the adult horns', () => {
    expect(calf.horns).toBe(false)
  })
})

describe('calf geometries (design.md §19 — juveniles read as young)', () => {
  const pairs: Array<[string, THREE.BufferGeometry, THREE.BufferGeometry]> = [
    ['zebra', buildZebra(), buildZebraCalf()],
    ['wildebeest', buildWildebeest(), buildWildebeestCalf()],
    ['antelope', buildAntelope(), buildAntelopeCalf()],
    ['warthog', buildWarthog(), buildWarthogCalf()],
    ['elephant', buildElephant(), buildElephant(true)],
    ['giraffe', buildGiraffe(), buildGiraffe(true)],
    // The predator cub (point 145c): a lion cub reads as young by the same
    // schema, and drops the adult mane and tail.
    ['lion', buildLion(), buildLionCub()],
  ]

  it('every calf is shorter nose-to-tail than its adult (at build scale)', () => {
    for (const [name, adult, calf] of pairs) {
      expect(zExtent(calf), name).toBeLessThan(zExtent(adult))
    }
  })

  it('ornamented adults lose their ornaments as calves (fewer vertices)', () => {
    for (const [name, adult, calf] of pairs) {
      if (name === 'zebra' || name === 'giraffe') continue // no ornaments to drop
      expect(vertices(calf), name).toBeLessThan(vertices(adult))
    }
  })

  it('the giraffe calf carries its bigger head on a much shorter neck', () => {
    const [, adult, calf] = pairs.find(([n]) => n === 'giraffe')!
    expect(topY(calf)).toBeLessThan(topY(adult) - 0.3)
  })
})

// Point 214 — the rounded organic bodies read SMOOTH, not as flat polygon
// panels: the tessellation floors hold, every built species carries smooth
// per-vertex normals (shared vertices whose corner normals curve across a
// face), and the one shared fauna material never flat-shades.
describe('smooth organic shading (CLAUDE.md §7.1 pt. 12, point 214)', () => {
  const builders: Array<[string, () => THREE.BufferGeometry]> = [
    ['elephant', () => buildElephant()],
    ['elephant calf', () => buildElephant(true)],
    ['giraffe', () => buildGiraffe()],
    ['giraffe calf', () => buildGiraffe(true)],
    ['zebra', buildZebra],
    ['zebra calf', buildZebraCalf],
    ['wildebeest', buildWildebeest],
    ['wildebeest calf', buildWildebeestCalf],
    ['antelope', buildAntelope],
    ['antelope calf', buildAntelopeCalf],
    ['warthog', buildWarthog],
    ['warthog calf', buildWarthogCalf],
    ['lion', buildLion],
    ['lion cub', buildLionCub],
    ['cheetah', buildCheetah],
    ['leopard', buildLeopard],
    ['hyena', buildHyena],
    ['flamingo', buildFlamingo],
    ['crocodile', buildCrocodile],
    ['plover', buildPlover],
    ['plover chick', buildPloverChick],
    ['vulture', buildVulture],
    ['goat', buildGoat],
  ]

  it('the tessellation floors hold (old: 8x6 body spheres, 5-6-seg limbs)', () => {
    // Body/head floors raised again for the 16x close-zoom silhouette
    // (point 214 follow-up): at 22x16 the elephant body's OUTLINE still
    // stepped — 36 width segments keep the facet arc at 10° or below.
    expect(FAUNA_TESSELLATION.body[0]).toBeGreaterThanOrEqual(36)
    expect(FAUNA_TESSELLATION.body[1]).toBeGreaterThanOrEqual(24)
    expect(FAUNA_TESSELLATION.head[0]).toBeGreaterThanOrEqual(28)
    expect(FAUNA_TESSELLATION.head[1]).toBeGreaterThanOrEqual(20)
    expect(FAUNA_TESSELLATION.small[0]).toBeGreaterThanOrEqual(10)
    expect(FAUNA_TESSELLATION.small[1]).toBeGreaterThanOrEqual(8)
    expect(FAUNA_TESSELLATION.limb).toBeGreaterThanOrEqual(10)
    expect(FAUNA_TESSELLATION.spike).toBeGreaterThanOrEqual(6)
  })

  it('the shared fauna material is smooth-shaded (never flatShading)', () => {
    const m = createFaunaMaterial()
    expect(m.flatShading).toBe(false)
    expect(m.vertexColors).toBe(true)
    m.dispose()
  })

  it('every species build keeps smooth per-vertex normals after the merge', () => {
    for (const [name, build] of builders) {
      const geo = build()
      // Indexed with shared vertices: the basis for interpolated (smooth)
      // shading — a flat-shaded build would need unindexed per-face corners.
      expect(geo.index, name).not.toBeNull()
      expect(geo.attributes.normal, name).toBeDefined()
      expect(geo.attributes.position.count, name).toBeLessThan(geo.index!.count)

      // Normals stay unit-length through the non-uniform part scaling.
      const n = geo.attributes.normal
      for (let i = 0; i < n.count; i += 7) {
        const len = Math.hypot(n.getX(i), n.getY(i), n.getZ(i))
        expect(len, `${name} normal ${i}`).toBeCloseTo(1, 2)
      }

      // Curvature witness: on most triangles the three corner normals differ
      // (the surface bends across the face). Only the boxy minority (ears,
      // wings, armour plates) and cylinder caps are flat.
      const idx = geo.index!
      const tris = idx.count / 3
      let curved = 0
      for (let t = 0; t < tris; t++) {
        const a = idx.getX(t * 3)
        const b = idx.getX(t * 3 + 1)
        const c = idx.getX(t * 3 + 2)
        const flat =
          n.getX(a) === n.getX(b) && n.getY(a) === n.getY(b) && n.getZ(a) === n.getZ(b) &&
          n.getX(a) === n.getX(c) && n.getY(a) === n.getY(c) && n.getZ(a) === n.getZ(c)
        if (!flat) curved++
      }
      expect(curved / tris, `${name} curved-triangle share`).toBeGreaterThan(0.5)
      geo.dispose()
    }
  })

  it('the vulture keeps its wide spread-wing span (the point-217 clearance model is derived from it)', () => {
    // The landed-bird clearance (wildlifeBehavior.landedBirdLowestDepth) lifts a
    // feeding vulture by its posed WING-TIP reach so the tips never clip the
    // ground (point 217). That reach is derived from these fauna.ts numbers, so
    // pin the span here: if buildVulture's wings change, both must move together.
    const geo = buildVulture()
    const pos = geo.attributes.position
    let maxX = 0
    let maxY = -Infinity
    let minY = Infinity
    for (let i = 0; i < pos.count; i++) {
      maxX = Math.max(maxX, Math.abs(pos.getX(i)))
      maxY = Math.max(maxY, pos.getY(i))
      minY = Math.min(minY, pos.getY(i))
    }
    // Outer wing tip reaches ~1.07 in x; the tips ride ABOVE the body (positive y).
    expect(maxX).toBeGreaterThan(1.0)
    expect(maxX).toBeLessThan(1.15)
    expect(maxY).toBeGreaterThan(0.4) // the dihedral lifts the tips well above the origin
    expect(minY).toBeGreaterThan(-0.11) // body-ellipsoid bottom ~ -0.096 at rest
    geo.dispose()
  })

  it('the built body sphere clearly outresolves the old faceted 8x6 build', () => {
    const body = new THREE.SphereGeometry(1, ...FAUNA_TESSELLATION.body)
    const oldBody = new THREE.SphereGeometry(1, 8, 6)
    expect(body.attributes.position.count).toBeGreaterThan(oldBody.attributes.position.count * 4)
    body.dispose()
    oldBody.dispose()
  })

  it('the raised body/head floors outresolve the first-pass 22x16 / 18x12 build', () => {
    // The 16x close-zoom witness: the first point-214 pass (22x16) still
    // stepped on the elephant body's silhouette, so the raise must be a real
    // resolution jump on both raised primitive classes, not a nudge.
    const body = new THREE.SphereGeometry(1, ...FAUNA_TESSELLATION.body)
    const firstPassBody = new THREE.SphereGeometry(1, 22, 16)
    expect(body.attributes.position.count).toBeGreaterThan(firstPassBody.attributes.position.count * 2)
    const head = new THREE.SphereGeometry(1, ...FAUNA_TESSELLATION.head)
    const firstPassHead = new THREE.SphereGeometry(1, 18, 12)
    expect(head.attributes.position.count).toBeGreaterThan(firstPassHead.attributes.position.count * 2)
    for (const g of [body, firstPassBody, head, firstPassHead]) g.dispose()
  })
})

// The elephant trunk is ONE connected, tapered tube swept along a curved
// centreline (thick at the head root, tapering to a drooping, softly curling
// tip) — no more stacked cylinder segments with gapped joints. The tests read
// the builder's documented ring-major vertex layout: rings of
// FAUNA_TESSELLATION.limb vertices from root to tip, one apex vertex last.
describe('elephant trunk (graceful tapered curve)', () => {
  const radial = FAUNA_TESSELLATION.limb

  /** Per-ring centreline point and mean ring radius from the vertex layout. */
  const ringData = (geo: THREE.BufferGeometry) => {
    const pos = geo.attributes.position
    const centers: THREE.Vector3[] = []
    const radii: number[] = []
    for (let k = 0; k < ELEPHANT_TRUNK_RINGS; k++) {
      const c = new THREE.Vector3()
      for (let j = 0; j < radial; j++) {
        const i = k * radial + j
        c.x += pos.getX(i)
        c.y += pos.getY(i)
        c.z += pos.getZ(i)
      }
      c.multiplyScalar(1 / radial)
      let r = 0
      for (let j = 0; j < radial; j++) {
        const i = k * radial + j
        r += Math.hypot(pos.getX(i) - c.x, pos.getY(i) - c.y, pos.getZ(i) - c.z)
      }
      centers.push(c)
      radii.push(r / radial)
    }
    return { centers, radii }
  }

  it('tapers monotonically root->tip over well more than 4 segments', () => {
    expect(ELEPHANT_TRUNK_RINGS - 1).toBeGreaterThanOrEqual(4)
    for (const calf of [false, true]) {
      const geo = buildElephantTrunk(calf)
      const { radii } = ringData(geo)
      for (let k = 1; k < radii.length; k++) {
        expect(radii[k], `${calf ? 'calf' : 'adult'} ring ${k}`).toBeLessThan(radii[k - 1])
      }
      // The taper is substantial: the root is clearly a thick base, the tip fine.
      expect(radii[0]).toBeGreaterThan(radii[radii.length - 1] * 2)
      geo.dispose()
    }
  })

  it('the centreline curves and droops — not a straight vertical stack', () => {
    for (const calf of [false, true]) {
      const geo = buildElephantTrunk(calf)
      const { centers } = ringData(geo)
      const base = centers[0]
      const tip = centers[centers.length - 1]
      // Droop: the tip hangs well below the root...
      expect(tip.y, calf ? 'calf' : 'adult').toBeLessThan(base.y - 0.5)
      // ...and is offset horizontally (forward of the head), so the line is
      // not vertical...
      expect(Math.abs(tip.z - base.z), calf ? 'calf' : 'adult').toBeGreaterThan(0.2)
      // ...and the direction TURNS along the way (a curve, not a straight
      // slanted line): the first and last segment directions clearly differ.
      const first = centers[1].clone().sub(centers[0]).normalize()
      const last = tip.clone().sub(centers[centers.length - 2]).normalize()
      expect(first.dot(last), calf ? 'calf' : 'adult').toBeLessThan(0.85)
      geo.dispose()
    }
  })

  it('is one connected mesh spanning root to tip (no gapped segments)', () => {
    for (const calf of [false, true]) {
      const geo = buildElephantTrunk(calf)
      const pos = geo.attributes.position
      const idx = geo.index!
      // Union-find over position-sharing vertices (the point-216 palm test):
      // quantized coordinates merge coincident seams, triangle edges connect.
      const parent = Array.from({ length: pos.count }, (_, i) => i)
      const find = (i: number): number => {
        while (parent[i] !== i) {
          parent[i] = parent[parent[i]]
          i = parent[i]
        }
        return i
      }
      const union = (a: number, b: number) => {
        parent[find(a)] = find(b)
      }
      const byPos = new Map<string, number>()
      for (let i = 0; i < pos.count; i++) {
        const key = `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`
        const seen = byPos.get(key)
        if (seen === undefined) byPos.set(key, i)
        else union(i, seen)
      }
      for (let t = 0; t < idx.count; t += 3) {
        union(idx.getX(t), idx.getX(t + 1))
        union(idx.getX(t), idx.getX(t + 2))
      }
      const roots = new Set<number>()
      for (let i = 0; i < pos.count; i++) roots.add(find(i))
      expect(roots.size, calf ? 'calf' : 'adult').toBe(1)
      // The one component spans the trunk's full height: highest and lowest
      // vertices are in it by construction (roots.size === 1), so pin the
      // span itself — the mesh reaches from the head root down to the tip.
      geo.computeBoundingBox()
      const span = geo.boundingBox!.max.y - geo.boundingBox!.min.y
      expect(span, calf ? 'calf' : 'adult').toBeGreaterThan(calf ? 0.6 : 1.2)
      geo.dispose()
    }
  })

  it('holds the tessellation floor with smooth shared-vertex normals', () => {
    // Ring density: each bend step stays a few degrees, no facet panels.
    expect(ELEPHANT_TRUNK_RINGS).toBeGreaterThanOrEqual(10)
    expect(radial).toBe(FAUNA_TESSELLATION.limb)
    for (const calf of [false, true]) {
      const geo = buildElephantTrunk(calf)
      expect(geo.index).not.toBeNull()
      expect(geo.attributes.normal).toBeDefined()
      // Indexed with shared ring vertices — the basis of smooth shading.
      expect(geo.attributes.position.count).toBeLessThan(geo.index!.count)
      const n = geo.attributes.normal
      for (let i = 0; i < n.count; i += 5) {
        expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)), `normal ${i}`).toBeCloseTo(1, 2)
      }
      // Every face bends: the swept tube has no flat panel anywhere.
      const idx = geo.index!
      let curved = 0
      for (let t = 0; t < idx.count; t += 3) {
        const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)]
        const flat =
          n.getX(a) === n.getX(b) && n.getY(a) === n.getY(b) && n.getZ(a) === n.getZ(b) &&
          n.getX(a) === n.getX(c) && n.getY(a) === n.getY(c) && n.getZ(a) === n.getZ(c)
        if (!flat) curved++
      }
      expect(curved / (idx.count / 3)).toBeGreaterThan(0.95)
      geo.dispose()
    }
  })

  it('the calf trunk is the shorter, stubbier variant of the same build', () => {
    const adult = buildElephantTrunk(false)
    const calf = buildElephantTrunk(true)
    adult.computeBoundingBox()
    calf.computeBoundingBox()
    const adultSpan = adult.boundingBox!.max.y - adult.boundingBox!.min.y
    const calfSpan = calf.boundingBox!.max.y - calf.boundingBox!.min.y
    expect(calfSpan).toBeLessThan(adultSpan * 0.7)
    // The calf tip stays proportionally blunter (stubby, not needle-fine).
    const { radii: aR } = ringData(adult)
    const { radii: cR } = ringData(calf)
    expect(cR[cR.length - 1] / cR[0]).toBeGreaterThan(aR[aR.length - 1] / aR[0])
    adult.dispose()
    calf.dispose()
  })
})

// The crocodile silhouette (design.md §19.16, point 243): the rebuilt mesh
// reads as a classic crocodile — a long TAPERED two-jaw snout meeting at a
// narrowed tip well forward of the skull, raised eye knobs as the crown of
// the whole build (the anchor of point 242's submerge pose), a LOW armoured
// back (never the old build's tall thin ridge rod floating above the body),
// a sprawl stance wider than the torso and a tapering tail longer than the
// body core. Normals and tessellation are covered by the point-214 sweep
// above, which includes the crocodile.
describe('crocodile silhouette (design.md §19.16, point 243)', () => {
  const geo = buildCrocodile()
  const pos = geo.attributes.position
  const L = CROCODILE_LAYOUT
  geo.computeBoundingBox()
  const bb = geo.boundingBox!

  /** Full |x| width across the vertices inside the z slab [z0, z1]. */
  const slabWidth = (z0: number, z1: number): number => {
    let w = 0
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i)
      if (z >= z0 && z <= z1) w = Math.max(w, Math.abs(pos.getX(i)) * 2)
    }
    return w
  }

  it('carries a long snout extending well forward of the skull', () => {
    expect(bb.max.z - L.snoutBaseZ).toBeGreaterThan(0.5)
  })

  it('the snout narrows toward its tip — the classic tapered jaw line', () => {
    const base = slabWidth(L.snoutBaseZ, L.snoutBaseZ + 0.15)
    const mid = slabWidth(1.15, 1.3)
    const tip = slabWidth(bb.max.z - 0.125, bb.max.z)
    expect(base).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(tip)
    expect(tip).toBeLessThan(base * 0.5)
  })

  it('raised eye knobs above the skull are the highest point, one per side', () => {
    expect(bb.max.y).toBeGreaterThan(L.backTopY + 0.03)
    let left = false
    let right = false
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) <= bb.max.y - 0.005) continue
      // Every crown vertex sits in the eye region on the skull top...
      expect(pos.getZ(i)).toBeGreaterThan(0.45)
      expect(pos.getZ(i)).toBeLessThan(0.65)
      // ...off the centreline, in the left or right knob.
      if (pos.getX(i) > 0.05) right = true
      if (pos.getX(i) < -0.05) left = true
    }
    expect(left).toBe(true)
    expect(right).toBe(true)
  })

  it('holds the flat low profile: total height a low fraction of the length', () => {
    // The old build peaked at ~0.38 over ~3.0 of length (ratio ~0.13, the
    // ridge rod's line); the rebuilt croc stays clearly under a tenth.
    expect(bb.max.y).toBeLessThan((bb.max.z - bb.min.z) * 0.1)
  })

  it('nothing rides above the back as a tall thin rod — the armour is low and wide', () => {
    // Back region: everything behind the eye/skull section (z < 0.4).
    let backMax = 0
    let minX = Infinity
    let maxX = -Infinity
    let above = 0
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) >= 0.4) continue
      const y = pos.getY(i)
      backMax = Math.max(backMax, y)
      if (y > L.backTopY + 0.008) {
        above++
        minX = Math.min(minX, pos.getX(i))
        maxX = Math.max(maxX, pos.getX(i))
      }
    }
    // The scutes protrude only a touch above the torso's top line (the old
    // rod stood ~0.11 proud of the new back line)...
    expect(backMax).toBeLessThan(L.backTopY + 0.05)
    // ...and what does stand above the back is wider than it is tall — a low
    // armour ridge, never a rod (the old ridge box was 0.06 wide).
    expect(above).toBeGreaterThan(0)
    expect(maxX - minX).toBeGreaterThanOrEqual((backMax - L.backTopY) * 2)
  })

  it('the tail is longer than the body core and tapers to its tip', () => {
    expect(L.tailBaseZ - bb.min.z).toBeGreaterThan(L.torsoFrontZ - L.tailBaseZ)
    const near = slabWidth(-0.9, -0.8)
    const mid = slabWidth(-1.5, -1.4)
    const tip = slabWidth(bb.min.z, bb.min.z + 0.2)
    expect(near).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(tip)
    expect(tip).toBeLessThan(near * 0.25)
  })

  it('four short splayed legs plant the stance wider than the torso', () => {
    expect(bb.max.x).toBeGreaterThan(L.torsoHalfWidth + 0.04)
    expect(bb.min.x).toBeLessThan(-(L.torsoHalfWidth + 0.04))
    // Short legs on a low belly: feet at the ground, nothing sunk into it.
    expect(bb.min.y).toBeGreaterThan(-0.05)
    expect(bb.min.y).toBeLessThan(0.03)
  })
})

// The hidden-crocodile submerge pose (design.md §19.16, point 242): a resting
// crocodile sits SUNK to the eye knobs on the water sheet — its armoured back
// below the surface, only the raised eyes breaking it. The old inline 0.24
// render offset left the back riding above the water, beaching the ambusher as a
// flat, lifeless prop; the pose is now derived from the mesh via crocodileBodyY.
describe('crocodile submerge pose (design.md §19.16, point 242)', () => {
  // Reuse the built mesh from the silhouette block: its eye-knob crown (the
  // highest vertex) is what breaks the surface when the croc lies hidden.
  const geo = buildCrocodile()
  geo.computeBoundingBox()
  const eyeKnobTopY = geo.boundingBox!.max.y // the raised eyes, the crown of the build
  const surfaceY = 3 // an arbitrary water-sheet height to pose against

  it('the submerge depth drops the whole armoured BACK below the water sheet', () => {
    const bodyY = crocodileBodyY(surfaceY, true)
    // The group origin sits below the surface...
    expect(bodyY).toBeLessThan(surfaceY)
    // ...far enough that the torso's top line (the back) sits at or below the
    // sheet — nothing of the low back rides proud of the water.
    expect(bodyY + CROCODILE_LAYOUT.backTopY).toBeLessThanOrEqual(surfaceY + 1e-9)
    expect(CROCODILE_SUBMERGE_DEPTH).toBe(CROCODILE_LAYOUT.backTopY) // derived from the mesh
  })

  it('only the raised eye knobs break the surface while hidden', () => {
    const bodyY = crocodileBodyY(surfaceY, true)
    // The eye knobs — the crown of the build — rise above the sheet...
    expect(bodyY + eyeKnobTopY).toBeGreaterThan(surfaceY)
    // ...and they are the ONLY thing above it: the back top is at/below the water,
    // so the exposed part is just the eye region (higher than the back line).
    expect(eyeKnobTopY).toBeGreaterThan(CROCODILE_LAYOUT.backTopY)
  })

  it('striking at prey it rides fully out — the body clears the sheet', () => {
    const bodyY = crocodileBodyY(surfaceY, false)
    expect(bodyY).toBe(surfaceY - CROCODILE_LUNGE_LIFT)
    // The origin sits just under the surface, so the whole raft of the body
    // (belly at the origin, legs a bare dip below) rides essentially out of the
    // water rather than submerged — only the short feet graze the sheet.
    expect(bodyY + geo.boundingBox!.min.y).toBeGreaterThan(surfaceY - 0.05)
    // The exposed back rides well clear of the water (not the hidden ~0 margin).
    expect(bodyY + CROCODILE_LAYOUT.backTopY).toBeGreaterThan(surfaceY + 0.2)
  })

  it('hidden sits markedly lower than striking — the pose actually changes', () => {
    expect(crocodileBodyY(surfaceY, true)).toBeLessThan(crocodileBodyY(surfaceY, false) - 0.2)
  })
})

// The crocodile submersion fade (design.md §19.16, point 246): the water sheets
// are alpha-blended and depthWrite-off (point 233), and the croc body draws in
// the opaque pass BEFORE them — so a submerged body read as a crisp silhouette
// straight through the water. The croc's own material now fades every fragment
// below the instance's local waterline, so the body vanishes into the murk
// while the eye knobs above the sheet stay crisp.
describe('crocodile submersion fade (design.md §19.16, point 246)', () => {
  const geo = buildCrocodile()
  geo.computeBoundingBox()
  const eyeKnobTopY = geo.boundingBox!.max.y

  it('the local waterline sits at the submerge depth over the instance scale', () => {
    expect(crocodileWaterlineLocal(1, true)).toBeCloseTo(CROCODILE_SUBMERGE_DEPTH, 12)
    // A larger croc is scaled up, so the same world-space depth is a SMALLER
    // local height (the fragment compares pre-scale positionLocal.y).
    expect(crocodileWaterlineLocal(1.2, true)).toBeCloseTo(CROCODILE_SUBMERGE_DEPTH / 1.2, 12)
    expect(crocodileWaterlineLocal(1.2, true)).toBeLessThan(crocodileWaterlineLocal(0.9, true))
  })

  it('riding out drops the waterline far below the geometry — the strike shows the whole body', () => {
    const wl = crocodileWaterlineLocal(1, false)
    expect(wl).toBe(CROCODILE_WATERLINE_NONE)
    // The sentinel plus the fade band still lies below the lowest vertex, so
    // nothing on the body can fade during a strike.
    expect(wl + CROCODILE_FADE_BAND).toBeLessThan(geo.boundingBox!.min.y)
    expect(crocodileSubmergedAlpha(geo.boundingBox!.min.y, wl)).toBe(1)
    expect(crocodileSubmergedAlpha(0, wl)).toBe(1)
  })

  it('hidden: eye knobs stay opaque, belly and legs vanish, the back just under the sheet only hints', () => {
    const wl = crocodileWaterlineLocal(1, true)
    // The eye knobs rise above the waterline — fully opaque, the lurking marker.
    expect(eyeKnobTopY).toBeGreaterThan(wl)
    expect(crocodileSubmergedAlpha(eyeKnobTopY, wl)).toBe(1)
    // At the waterline itself the fade is continuous with the exposed part.
    expect(crocodileSubmergedAlpha(wl, wl)).toBe(1)
    // Belly and feet (local y near 0) lie a full band below — invisible.
    expect(crocodileSubmergedAlpha(0.02, wl)).toBe(0)
    expect(crocodileSubmergedAlpha(geo.boundingBox!.min.y, wl)).toBe(0)
    // Just under the line the back reads only as a faint hint, strictly between.
    const hint = crocodileSubmergedAlpha(wl - CROCODILE_FADE_BAND / 2, wl)
    expect(hint).toBeGreaterThan(0)
    expect(hint).toBeLessThan(1)
    // Monotone with depth: deeper is never more visible.
    let prev = 1
    for (let y = wl; y >= 0; y -= 0.02) {
      const a = crocodileSubmergedAlpha(y, wl)
      expect(a).toBeLessThanOrEqual(prev + 1e-12)
      prev = a
    }
  })

  it('the croc material carries the fade and keeps the shared fauna look', () => {
    const m = createCrocodileMaterial()
    // Transparent with an opacity node: the fade needs alpha blending...
    expect(m.transparent).toBe(true)
    expect(m.opacityNode).toBeTruthy()
    // ...but keeps writing depth so the body self-occludes within its own draw
    // (the water sheets render after it at renderOrder 1 and lie above, so
    // their point-233 depthWrite-off crossfade is untouched).
    expect(m.depthWrite).toBe(true)
    // The shared fauna look (point 214): vertex colors, smooth shading.
    expect(m.vertexColors).toBe(true)
    expect(m.roughness).toBeCloseTo(0.9, 12)
    expect(m.flatShading).toBe(false)
  })
})

describe('animal gait (design.md §19, point 228 — no foot-slide, no backward glide)', () => {
  it('the leg-swing phase is a pure function of DISTANCE travelled, not time', () => {
    // Zero distance → zero phase: a standing animal's legs never move.
    expect(gaitPhase(0)).toBe(0)
    // The phase scales with the distance covered (stride matches speed): walking
    // twice as far advances the cycle twice as much.
    expect(gaitPhase(2)).toBeCloseTo(2 * gaitPhase(1), 12)
    expect(gaitPhase(1)).toBeCloseTo(GAIT_CADENCE, 12)
    // Strictly monotone in distance.
    let prev = -1
    for (let d = 0; d <= 5; d += 0.25) {
      const p = gaitPhase(d)
      expect(p).toBeGreaterThanOrEqual(prev)
      prev = p
    }
  })

  it('the gait cadence reads as a real walk — ~1.5-2 strides per metre, not the old shuffle (point 255)', () => {
    // A full swing cycle is 2π rad, so the cadence is strides-per-world-unit ×
    // 2π. The complaint was that the legs shuffled far too slowly for the speed;
    // the cadence must land in a plausible walking band (~1.2-2.5 strides/m),
    // clearly above the old 3.4 rad/unit (0.54 strides/m — under one per metre).
    const stridesPerUnit = GAIT_CADENCE / (2 * Math.PI)
    expect(stridesPerUnit).toBeGreaterThanOrEqual(1.2)
    expect(stridesPerUnit).toBeLessThanOrEqual(2.5)
    expect(stridesPerUnit).toBeGreaterThan(0.54) // strictly faster than the old shuffle
    // One metre walked completes well over a full stride cycle.
    expect(gaitPhase(1)).toBeGreaterThan(2 * Math.PI)
    expect(gaitPhase(1) / (2 * Math.PI)).toBeCloseTo(stridesPerUnit, 12)
  })

  it('advances the gait over a CURVED path — any displacement, not only a straight heading (point 255)', () => {
    // Walk a quarter circle as many short chords: the heading TURNS every step,
    // yet the phase must ride the accumulated PATH LENGTH — the gait is driven by
    // raw distance travelled, never gated on a straight/velocity-aligned heading
    // (the "legs stop on a turn" complaint). Compare the curved path to its own
    // net (straight-line) displacement: the phase reflects the longer path, so it
    // keeps advancing while the animal turns.
    const R = 5
    const steps = 90
    let dist = 0
    let px = R
    let pz = 0
    let prevYaw = faceVelocity(0, 1, 0)
    let turned = false
    for (let k = 1; k <= steps; k++) {
      const ang = (k / steps) * (Math.PI / 2)
      const nx = Math.cos(ang) * R
      const nz = Math.sin(ang) * R
      const vx = nx - px
      const vz = nz - pz
      dist += Math.hypot(vx, vz) // accumulates on ANY displacement, curve included
      const yaw = faceVelocity(vx, vz, prevYaw)
      if (Math.abs(yaw - prevYaw) > 1e-6) turned = true
      prevYaw = yaw
      px = nx
      pz = nz
    }
    expect(turned).toBe(true) // the path genuinely turns throughout
    const net = Math.hypot(px - R, pz - 0) // start→end chord
    expect(dist).toBeGreaterThan(net) // the arc is longer than its chord
    // The phase rides the full curved path length, not the net displacement —
    // so it advances over a turn instead of freezing.
    expect(gaitPhase(dist)).toBeGreaterThan(gaitPhase(net))
    expect(gaitPhase(dist)).toBeCloseTo(dist * GAIT_CADENCE, 9)
  })

  it('every leg is at neutral at rest (phase 0), and diagonal legs trot in antiphase', () => {
    // At a standing phase (0) each leg — offset 0 or π — reads sin 0 = sin π = 0:
    // no twitch while the animal holds still.
    expect(legSwingAngle(0, 0)).toBeCloseTo(0, 12)
    expect(legSwingAngle(0, Math.PI)).toBeCloseTo(0, 12)
    // The two diagonal beats are opposite as the phase advances (a trot).
    for (let ph = 0.1; ph < Math.PI; ph += 0.3) {
      expect(legSwingAngle(ph, 0)).toBeCloseTo(-legSwingAngle(ph, Math.PI), 12)
    }
    // The swing stays bounded (never flails past the amplitude).
    for (let ph = 0; ph < 20; ph += 0.37) expect(Math.abs(legSwingAngle(ph, 0))).toBeLessThanOrEqual(0.5 + 1e-9)
  })

  it("the walker's facing tracks its velocity — it never glides backward", () => {
    // For any travel direction, the resulting facing points the SAME way as the
    // velocity (facing·velocity ≥ 0): a goat can never face forward while sliding
    // back. Yaw convention: forward = (sin yaw, cos yaw) in (x, z).
    for (let ang = 0; ang < Math.PI * 2; ang += Math.PI / 12) {
      const vx = Math.cos(ang)
      const vz = Math.sin(ang)
      const yaw = faceVelocity(vx, vz, 999)
      const fx = Math.sin(yaw)
      const fz = Math.cos(yaw)
      expect(fx * vx + fz * vz).toBeGreaterThan(0) // faces INTO the motion
    }
  })

  it('holds the previous facing when standing still (no spin at rest)', () => {
    expect(faceVelocity(0, 0, 1.234)).toBe(1.234)
    expect(faceVelocity(1e-9, -1e-9, 0.5)).toBe(0.5)
  })

  it('the goat parts build gives a body and four hip-pivoted legs', () => {
    const { body, legs } = buildGoatParts()
    expect(body.attributes.position.count).toBeGreaterThan(0)
    expect(legs).toHaveLength(4)
    for (const leg of legs) {
      expect(leg.geo.attributes.position.count).toBeGreaterThan(0)
      // The leg hangs BELOW its hip (top at the local origin), so rotating the
      // group about its hip swings the foot — the leg's own top sits at ~0.
      leg.geo.computeBoundingBox()
      expect(leg.geo.boundingBox!.max.y).toBeCloseTo(0, 6)
      expect(leg.geo.boundingBox!.min.y).toBeLessThan(0)
      expect(leg.hip[1]).toBeGreaterThan(0) // the hip sits up on the body
    }
    // Two diagonal beats, two legs each (a trot).
    const zeros = legs.filter((l) => l.phaseOffset === 0).length
    expect(zeros).toBe(2)
    expect(legs.filter((l) => l.phaseOffset === Math.PI)).toHaveLength(2)
  })
})
