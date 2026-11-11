// The elephant graveyard's remains (point 1498): bones and ivory, laid out
// deterministically per seed, never a whole elephant body.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import {
  buildElephantSkeleton,
  buildGraveyardRemains,
  buildTusk,
  GRAVEYARD_REMAINS,
  graveyardLayout,
} from './graveyardRemains'
import { buildElephant } from './fauna'

const bbox = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox()
  return g.boundingBox!
}

describe('graveyard layout', () => {
  it('is deterministic per seed and differs between seeds', () => {
    expect(graveyardLayout(7)).toEqual(graveyardLayout(7))
    expect(graveyardLayout(7)).not.toEqual(graveyardLayout(8))
  })

  it('places every piece the schema asks for, inside the site', () => {
    for (const seed of [1, 42, 1234, 99999]) {
      const l = graveyardLayout(seed)
      expect(l.skeletons).toHaveLength(GRAVEYARD_REMAINS.skeletons)
      expect(l.skulls).toHaveLength(GRAVEYARD_REMAINS.looseSkulls)
      expect(l.tusks).toHaveLength(GRAVEYARD_REMAINS.tusks)
      expect(l.longBones).toHaveLength(GRAVEYARD_REMAINS.longBones)
      expect(l.ribs).toHaveLength(GRAVEYARD_REMAINS.ribs)
      for (const s of l.skeletons) expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(GRAVEYARD_REMAINS.skeletonRadius)
      for (const p of [...l.skulls, ...l.tusks, ...l.longBones, ...l.ribs]) {
        expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(GRAVEYARD_REMAINS.scatterRadius)
      }
    }
  })

  it('reaches the full skeleton count for any seed (the gap never starves the sampler)', () => {
    for (let seed = 0; seed < 300; seed++) expect(graveyardLayout(seed * 7919).skeletons).toHaveLength(GRAVEYARD_REMAINS.skeletons)
  })

  it('never overlaps two skeletons', () => {
    for (const seed of [1, 42, 1234, 99999]) {
      const sk = graveyardLayout(seed).skeletons
      for (let i = 0; i < sk.length; i++)
        for (let j = i + 1; j < sk.length; j++)
          expect(Math.hypot(sk[i].x - sk[j].x, sk[i].z - sk[j].z)).toBeGreaterThanOrEqual(GRAVEYARD_REMAINS.skeletonGap)
    }
  })
})

describe('graveyard remains geometry', () => {
  it('a skeleton is elephant-long but lies low: rib arches, no standing body', () => {
    const sk = bbox(buildElephantSkeleton(0.3))
    const body = bbox(buildElephant())
    expect(sk.max.z - sk.min.z).toBeGreaterThan(3.5) // pelvis to skull: a whole elephant's remains
    expect(sk.max.y).toBeLessThan(body.max.y * 0.45) // far below a standing (or lying) body
    expect(sk.max.y).toBeGreaterThan(0.6) // the rib arches stand out of the ground
    expect(sk.min.y).toBeGreaterThan(-0.05) // nothing sunk below the ground
  })

  it('a collapsed cage lies lower than a standing one', () => {
    const up = bbox(buildElephantSkeleton(0)).max.y
    const down = bbox(buildElephantSkeleton(1))
    expect(down.max.y).toBeLessThanOrEqual(up + 1e-6)
  })

  it('a tusk is a curved, tapering ivory piece lying on the ground', () => {
    const t = buildTusk(1.4)
    const b = bbox(t)
    expect(b.max.x - b.min.x).toBeGreaterThan(1.2)
    expect(b.max.z - b.min.z).toBeGreaterThan(0.25) // curved, not a straight rod
    expect(b.min.y).toBeGreaterThan(-0.01)
  })

  it('the whole site merges into a bone and an ivory geometry within the ground patch', () => {
    const { bones, ivory } = buildGraveyardRemains(graveyardLayout(42))
    for (const g of [bones, ivory]) {
      const b = bbox(g)
      expect(Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z)).toBeLessThan(9)
      expect(b.max.y).toBeLessThan(1.3)
      expect(g.getAttribute('color')).toBeTruthy()
    }
  })
})
