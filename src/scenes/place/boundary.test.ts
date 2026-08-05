// The walkable boundary as THE one source (design.md §2.6, work-order 352/488).
// The band painted on the ground and the leave check must never be able to
// drift apart, so this pins both the module's behaviour and the ONE place the
// scene is allowed to ask its question.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BOUNDARY_LUT_SIZE, buildBoundaryLut, isOutsidePlace, placeBoundaryRadius } from './boundary'
import { buildLayout } from './layout'
import { PLACES } from '../../world/geo'

describe('the walkable boundary', () => {
  it('reports inside/outside against the layout radius', () => {
    const layout = { radius: 28 }
    expect(isOutsidePlace(layout, 0, 0)).toBe(false)
    expect(isOutsidePlace(layout, 27.9, 0)).toBe(false)
    expect(isOutsidePlace(layout, 28.1, 0)).toBe(true)
    expect(isOutsidePlace(layout, 0, -28.5)).toBe(true)
    // Exactly on the line still counts as inside — the check is a strict >.
    expect(isOutsidePlace(layout, 28, 0)).toBe(false)
  })

  it('samples every angle of the full turn, for every place in the roster', () => {
    for (const place of PLACES) {
      const layout = buildLayout(place.id, 4711)
      const lut = buildBoundaryLut(layout)
      expect(lut.length).toBe(BOUNDARY_LUT_SIZE)
      for (let j = 0; j < lut.length; j++) {
        const angle = ((j + 0.5) / lut.length) * Math.PI * 2
        expect(lut[j]).toBe(placeBoundaryRadius(layout, angle))
        expect(lut[j]).toBeGreaterThan(0)
      }
    }
  })

  it('is periodic: the same bearing gives the same radius after a full turn', () => {
    const layout = buildLayout('cairo', 4711)
    for (const angle of [0, 1.3, -2.2, Math.PI]) {
      expect(placeBoundaryRadius(layout, angle)).toBe(placeBoundaryRadius(layout, angle + Math.PI * 2))
    }
  })
})

describe('the settlement scene asks only this module (no second constant)', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/scenes/place/PlaceScene.tsx'), 'utf8')

  it('the leave check goes through isOutsidePlace', () => {
    expect(src).toMatch(/import \{[^}]*isOutsidePlace[^}]*\} from '\.\/boundary'/)
    expect(src).toContain('isOutsidePlace(layout, p.x, p.z)')
  })

  it('no hand-rolled distance-against-radius comparison decides the boundary', () => {
    // `layout.radius` still legitimately sizes the ground disc, the backdrop and
    // the scatter — what may never come back is a SECOND leave/edge test written
    // against it, which is exactly how the painted edge would start to lie.
    expect(src).not.toMatch(/hypot\([^)]*\)\s*[<>]=?\s*layout\.radius/)
    expect(src).not.toMatch(/layout\.radius\s*[<>]=?\s*[A-Za-z_$][\w.$]*\s*\)/)
  })
})
