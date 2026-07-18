// Baby-schema calf geometry invariants (design.md §19): a juvenile reads as
// young beyond its mere size — a proportionally larger head on a shorter
// neck, a shorter body on a leggy stance, and none of the adult ornaments
// (horns, tusks, beard, mane). The calf builds stay at adult scale; the
// per-animal spawn scale shrinks them.
import { describe, expect, it } from 'vitest'
import type * as THREE from 'three/webgpu'
import {
  buildAntelope,
  buildAntelopeCalf,
  buildElephant,
  buildGiraffe,
  buildLion,
  buildLionCub,
  buildWarthog,
  buildWarthogCalf,
  buildWildebeest,
  buildWildebeestCalf,
  buildZebra,
  buildZebraCalf,
  calfProportions,
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
