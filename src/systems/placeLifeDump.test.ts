import { afterEach, describe, expect, it } from 'vitest'
import {
  buildPlaceLife,
  placeLifeReportCounts,
  placeLifeSection,
  registerPlaceLifeSource,
  type PlaceLifeInhabitant,
} from './placeLifeDump'

function adult(i: number, x: number, z: number): PlaceLifeInhabitant {
  return {
    id: `errands/${i}`,
    kind: 'adult',
    x,
    z,
    velocity: null,
    yaw: 0,
    pose: 'idle',
    errand: { situation: null, phase: null, target: null, arrived: false, dwellRemaining: null },
  }
}

describe('placeLife dump section', () => {
  const unregister: Array<() => void> = []
  afterEach(() => {
    while (unregister.length) unregister.pop()!()
  })

  it('lists the cap and counts what the cap left out', () => {
    const many = Array.from({ length: 12 }, (_, i) => adult(i, i + 1, 0))
    const d = buildPlaceLife('place', { x: 0, z: 0 }, [{ id: 'errands', data: { inhabitants: many } }], { cap: 5 })!
    expect(d.inhabitants).toHaveLength(5)
    expect(d.inhabitants.map((h) => h.id)).toEqual(['errands/0', 'errands/1', 'errands/2', 'errands/3', 'errands/4'])
    expect(d.counts).toMatchObject({ inhabitants: 12, inRadius: 12, listed: 5, omitted: 7 })
    expect(d.bounds.cap).toBe(5)
  })

  it('counts inhabitants beyond the radius as omitted', () => {
    const d = buildPlaceLife('place', { x: 0, z: 0 }, [{ id: 'e', data: { inhabitants: [adult(0, 1, 0), adult(1, 200, 0)] } }], {
      radius: 50,
    })!
    expect(d.counts).toMatchObject({ inhabitants: 2, inRadius: 1, listed: 1, omitted: 1 })
  })

  it('round-trips a pinned child with its nudge count', () => {
    const child: PlaceLifeInhabitant = {
      id: 'kids/3',
      kind: 'child',
      x: 4.12345,
      z: -2,
      velocity: { x: 0, z: 0 },
      yaw: 1.5,
      pose: 'runner',
      child: {
        tagRole: 'target',
        pinned: true,
        pinnedSeconds: 2.25,
        noProgressSeconds: 3.5,
        nudges: 4,
        carried: 1.75,
        held: false,
      },
    }
    const d = buildPlaceLife('place', null, [
      {
        id: 'kids',
        data: {
          inhabitants: [child],
          tag: { round: 'tag', playing: true, chaser: 1, target: 3, tags: 2, chaserFor: 7.5, phase: null },
          geography: { teachingStone: { x: 1, z: 2, radius: 0.8, height: 0.6 } },
        },
      },
    ])!
    const back = JSON.parse(JSON.stringify(d))
    expect(back.inhabitants[0].child).toEqual(child.child)
    expect(back.inhabitants[0].x).toBe(4.123)
    expect(back.tag.target).toBe(3)
    expect(back.geography.teachingStone).toEqual({ x: 1, z: 2, radius: 0.8, height: 0.6 })
    expect(back.counts.byKind.child).toBe(1)
  })

  it('is absent outside place mode', () => {
    expect(buildPlaceLife('travel', { x: 0, z: 0 }, [{ id: 'e', data: { inhabitants: [adult(0, 1, 0)] } }])).toBeUndefined()
    unregister.push(registerPlaceLifeSource('e', () => ({ inhabitants: [adult(0, 1, 0)] })))
    expect(placeLifeSection('travel', null)).toBeUndefined()
    expect(placeLifeSection('place', null)?.counts.listed).toBe(1)
  })

  it('keeps the other sources when one throws', () => {
    unregister.push(registerPlaceLifeSource('a', () => ({ inhabitants: [adult(0, 1, 0)] })))
    unregister.push(
      registerPlaceLifeSource('b', () => {
        throw new Error('kids gone')
      }),
    )
    const d = placeLifeSection('place', { x: 0, z: 0 })!
    expect(d.counts.listed).toBe(1)
    expect(d.errors).toEqual({ b: 'kids gone' })
  })

  it('reads the report counts back from the shipped JSON', () => {
    const d = buildPlaceLife('place', null, [{ id: 'e', data: { inhabitants: [adult(0, 1, 0)] } }], { radius: 30, cap: 9 })
    expect(placeLifeReportCounts(JSON.stringify({ placeLife: d }))).toEqual({ radius: 30, cap: 9, listed: 1, omitted: 0 })
    expect(placeLifeReportCounts('{"summary":{}}')).toBeNull()
    expect(placeLifeReportCounts('not json')).toBeNull()
  })
})
