// The vulture's size and shape (point 1498): true-sized, a bird and not a
// plank, and the folded landed pose inside the box the clearance rule uses.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { buildVulture, buildVultureLanded, slabFromOutline, vultureWingOutline } from './faunaVulture'
import { VULTURE_SHAPE, vultureLandedBox, vultureLandedCorners } from './vultureShape'
import { buildZebra } from './fauna'

const box = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox()
  return g.boundingBox!
}

describe('vulture size (a ~1 m bird with a ~2.4 m span)', () => {
  it('the spread bird spans 2.2-2.8 units and is about a metre long at render scale', () => {
    const b = box(buildVulture())
    const s = VULTURE_SHAPE.renderScale
    const span = (b.max.x - b.min.x) * s
    const len = (b.max.z - b.min.z) * s
    expect(span).toBeGreaterThan(2.2)
    expect(span).toBeLessThan(2.8)
    expect(len).toBeGreaterThan(0.8)
    expect(len).toBeLessThan(1.2)
  })

  it('the landed bird is far shorter than a zebra and narrower than its own spread wings', () => {
    const landed = box(buildVultureLanded())
    const zebra = box(buildZebra())
    const s = VULTURE_SHAPE.renderScale
    expect((landed.max.z - landed.min.z) * s).toBeLessThan((zebra.max.z - zebra.min.z) * 0.5)
    expect((landed.max.x - landed.min.x) * s).toBeLessThan(0.6)
    expect((landed.max.y - landed.min.y) * s).toBeGreaterThan(0.5) // stands on legs, head up
  })
})

describe('vulture shape (a bird, not planks)', () => {
  it('the wing tip carries six spread primaries (fingers) and the wing is broad at the body', () => {
    const o = vultureWingOutline()
    const H = VULTURE_SHAPE.span / 2
    const tips = o.filter(([x]) => x > H - 0.1)
    expect(tips.length).toBe(6)
    const rootChord = Math.max(...o.filter(([x]) => x < 0.2).map(([, z]) => z)) - Math.min(...o.filter(([x]) => x < 0.2).map(([, z]) => z))
    expect(rootChord).toBeGreaterThan(0.4)
  })

  it('every slab triangle faces along its vertex normal (mirrored wings included)', () => {
    for (const pts of [vultureWingOutline(), vultureWingOutline().map(([x, z]) => [-x, z] as [number, number])]) {
      const g = slabFromOutline(pts, 0.02)
      const p = g.attributes.position
      const n = g.attributes.normal
      const idx = g.index!
      const v = (i: number) => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))
      for (let t = 0; t < idx.count; t += 3) {
        const [a, b, c] = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)]
        const geo = v(b).sub(v(a)).cross(v(c).sub(v(a)))
        if (geo.lengthSq() < 1e-14) continue
        expect(geo.dot(new THREE.Vector3(n.getX(a), n.getY(a), n.getZ(a)))).toBeGreaterThan(0)
      }
    }
  })

  it('the folded bird lies inside the conservative box the clearance rule reads', () => {
    const b = box(buildVultureLanded())
    const c = vultureLandedBox()
    const eps = 1e-6
    expect(b.min.x).toBeGreaterThanOrEqual(c.minX - eps)
    expect(b.max.x).toBeLessThanOrEqual(c.maxX + eps)
    expect(b.min.y).toBeGreaterThanOrEqual(c.minY - eps)
    expect(b.max.y).toBeLessThanOrEqual(c.maxY + eps)
    expect(b.min.z).toBeGreaterThanOrEqual(c.minZ - eps)
    expect(b.max.z).toBeLessThanOrEqual(c.maxZ + eps)
    // The feet stand at the box floor: the bird is not hovering above it.
    expect(b.min.y - c.minY).toBeLessThan(0.03)
    expect(vultureLandedCorners()).toHaveLength(8)
  })
})
