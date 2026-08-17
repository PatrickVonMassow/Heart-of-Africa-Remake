import { describe, expect, it } from 'vitest'
import { PLACES } from '../../world/geo'
import { buildLayout } from './layout'
import { figureStance, unplacedInhabitant, UNPLACED_EPS, type PlaceSpot } from './placement'

/** The transform a group that nobody ever placed carries — React's identity. */
const NEVER_WRITTEN = { x: 0, y: 0, z: 0 }

/** A settlement's own placement set, as PlaceLife assembles it. */
function anchorsOf(placeId: string): PlaceSpot[] {
  const layout = buildLayout(placeId, 7)
  return [
    ...layout.dwellings.map((d) => ({ x: d.x, z: d.z })),
    ...layout.errands.map(([x, z]) => ({ x, z })),
  ]
}

describe('figureStance', () => {
  it('puts a figure on the spot its layout assigns it, at ground level', () => {
    expect(figureStance({ x: -4.25, z: 6.5 })).toEqual([-4.25, 0, 6.5])
  })

  it('never yields the unplaced transform for a spot away from the middle', () => {
    const spot = { x: 0.4, z: -3.2 }
    const [x, y, z] = figureStance(spot)
    expect(unplacedInhabitant({ x, y, z }, [])).toBe(false)
  })

  it('reproduces the origin only when the spot itself is the origin', () => {
    expect(figureStance({ x: 0, z: 0 })).toEqual([0, 0, 0])
  })
})

describe('unplacedInhabitant', () => {
  it('flags the uninitialised transform that produced the zero (point 509)', () => {
    // The delivered defect: a walker group whose position was written only from
    // the frame callback's walking branch, so a figure at home kept the identity
    // transform while its dwelling stood elsewhere.
    const home = { x: -7.5, z: 3.25 }
    expect(unplacedInhabitant(NEVER_WRITTEN, [home])).toBe(true)
  })

  it('does not flag it where the layout genuinely places someone at the origin', () => {
    expect(unplacedInhabitant(NEVER_WRITTEN, [{ x: 0, z: 0 }, { x: 5, z: 5 }])).toBe(false)
  })

  it('does not flag a figure standing on its own spot', () => {
    const spot = { x: 2.5, z: -6 }
    const [x, y, z] = figureStance(spot)
    expect(unplacedInhabitant({ x, y, z }, [spot])).toBe(false)
  })

  it('does not flag a villager that merely walks over the middle of its village', () => {
    // A walk is a float path with the walking bob on it — never an exact zero.
    // The tolerance is for float noise, not a zone around the middle.
    const walking = { x: 0.004, y: 0.031, z: -0.002 }
    expect(unplacedInhabitant(walking, [{ x: 9, z: 8.5 }])).toBe(false)
  })

  it('accepts float noise around a genuinely unwritten transform', () => {
    const noisy = { x: UNPLACED_EPS / 2, y: 0, z: -UNPLACED_EPS / 2 }
    expect(unplacedInhabitant(noisy, [{ x: 9, z: 8.5 }])).toBe(true)
  })
})

describe('every settlement places its inhabitants away from its origin', () => {
  const settlements = PLACES.filter((p) => p.kind === 'port' || p.kind === 'village')

  it('covers the whole world model', () => {
    expect(settlements.length).toBeGreaterThan(20)
  })

  it.each(settlements.map((p) => p.id))('%s: every dwelling is a real stance', (id) => {
    const layout = buildLayout(id, 7)
    const anchors = anchorsOf(id)
    expect(layout.dwellings.length).toBeGreaterThan(0)
    for (const d of layout.dwellings) {
      const [x, y, z] = figureStance(d)
      // A walker born in its hut is placed, not unplaced — which is exactly what
      // the group's initial transform now is.
      expect(unplacedInhabitant({ x, y, z }, anchors)).toBe(false)
    }
  })
})
