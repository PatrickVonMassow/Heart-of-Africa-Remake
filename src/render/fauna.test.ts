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
  buildFlamingo,
  buildGiraffe,
  buildGoat,
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
  createFaunaMaterial,
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
    expect(FAUNA_TESSELLATION.body[0]).toBeGreaterThanOrEqual(20)
    expect(FAUNA_TESSELLATION.body[1]).toBeGreaterThanOrEqual(14)
    expect(FAUNA_TESSELLATION.head[0]).toBeGreaterThanOrEqual(16)
    expect(FAUNA_TESSELLATION.head[1]).toBeGreaterThanOrEqual(12)
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

  it('the built body sphere clearly outresolves the old faceted 8x6 build', () => {
    const body = new THREE.SphereGeometry(1, ...FAUNA_TESSELLATION.body)
    const oldBody = new THREE.SphereGeometry(1, 8, 6)
    expect(body.attributes.position.count).toBeGreaterThan(oldBody.attributes.position.count * 4)
    body.dispose()
    oldBody.dispose()
  })
})
