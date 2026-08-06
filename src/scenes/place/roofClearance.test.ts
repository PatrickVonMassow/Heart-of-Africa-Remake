// HEAD CLEARANCE UNDER ROOFS (work-order 349).
//
// The wall rule of design.md §2.6 keeps the camera out of a building's SIDE.
// This is the same rule turned upward: over every spot the player can stand,
// the lowest roof surface above him clears the eye height plus the camera's
// near plane plus a margin. The bug it pins is the reported Zulu-village
// screenshot — under a rondavel's eave the near plane cut into the thatch,
// filling the frame with the roof's flat underside and open sky above it.
//
// The sweep runs over every place, every building type and several seeds, and
// the regression witness at the bottom proves it BITES: rebuilt with the
// pre-349 wall-only colliders, the same sweep finds the low strips again.

import { describe, expect, it } from 'vitest'
import { buildLayout, dwellingCircleRadius, interactiveCircleRadius, VILLAGE_FIRE, type DwellingDef, type DwellingKind } from './layout'
import { REGION_PLACE_STYLES, type RegionPlaceStyle } from './regionStyles'
import { insidePlace } from './boundary'
import { PLAYER_RADIUS, standingClear, type Collider } from './collision'
import { PLACES } from '../../world/geo'
import {
  CAMERA_NEAR_REACH,
  CHIEF_HUT,
  EYE_HEIGHT,
  HUT_CONE_EAVE,
  HUT_DOME_RADIUS,
  ROOF_HEADROOM,
  dwellingRoofProfile,
  hutRoofProfile,
  hutRoofStandOff,
  lowestRoofAt,
  placeRoofs,
  roofHeadroomAt,
  roofStandOff,
  type PlaceRoof,
} from './roofClearance'

const SEEDS = [7, 42, 1337]
/** Sampling pitch of the sweep, in metres — finer than the narrowest strip a
 *  low eave leaves standable (the widest miss measured was 0.4 m). */
const STEP = 0.12

const styleOf = (region: string) => REGION_PLACE_STYLES[region as keyof typeof REGION_PLACE_STYLES]

/** A hut of the size the ring plans build (design.md §4.5): the Zulu rondavel
 *  of the report — a low wall under a wide cone. */
const RONDAVEL = { r: 1.5, h: 1.5 }

describe('the headroom rule (work-order 349)', () => {
  it('clears the eye, the near plane and a margin', () => {
    expect(ROOF_HEADROOM).toBeGreaterThan(EYE_HEIGHT + CAMERA_NEAR_REACH)
    // Not so generous that a genuine 2 m eave would have to be fenced off.
    expect(ROOF_HEADROOM).toBeLessThan(2)
  })

  it('reads a rondavel eave as too low and a Congo roof as clear', () => {
    const south = styleOf('south') // cone roofs, no stilts
    const cone = hutRoofProfile(south.roof, RONDAVEL.r, RONDAVEL.h, south.stilts)
    // The cone's underside is its base CAP: one flat disc out to the eave.
    expect(cone.rimRadius).toBeCloseTo(RONDAVEL.r * HUT_CONE_EAVE, 6)
    expect(cone.lowest).toBeLessThan(EYE_HEIGHT)
    expect(hutRoofStandOff(south, RONDAVEL.r, RONDAVEL.h)).toBeGreaterThan(RONDAVEL.r + 0.3)

    // Congo: a tall roof on a stilt floor hangs well over the head.
    const central = styleOf('central')
    expect(hutRoofStandOff(central, 1.4, 2.1)).toBe(0)
  })

  it('measures a dome by its own inner surface, lowest at the rim', () => {
    const east = styleOf('east') // dome roofs
    const dome = hutRoofProfile('dome', 2, 2, false)
    expect(dome.rimRadius).toBeCloseTo(2 * HUT_DOME_RADIUS, 6)
    // Highest over the axis, descending to the wall top at the rim.
    expect(dome.underside(0, 0)).toBeGreaterThan(dome.underside(dome.rimRadius, 0))
    expect(dome.underside(dome.rimRadius, 0)).toBeCloseTo(dome.lowest, 6)
    // The chief's hut is big enough that its own wall keeps the camera out.
    expect(interactiveCircleRadius('chief', east)).toBe(3.35)
    expect(interactiveCircleRadius('chief', east) + PLAYER_RADIUS - CAMERA_NEAR_REACH).toBeGreaterThan(
      CHIEF_HUT.r * HUT_DOME_RADIUS,
    )
  })

  it('widens the collider by exactly the near plane’s reach past the eave', () => {
    const south = styleOf('south')
    const profile = hutRoofProfile(south.roof, RONDAVEL.r, RONDAVEL.h, south.stilts)
    // The eye stands at collider + PLAYER_RADIUS; the near plane reaches back in.
    const standOff = roofStandOff(profile)
    expect(standOff + PLAYER_RADIUS - CAMERA_NEAR_REACH).toBeCloseTo(profile.rimRadius, 6)
  })

  it('leaves a roof that hangs high enough entirely alone', () => {
    const north = styleOf('north') // flat roofs
    // A market stall's cloth roof at ~1.88 m is a real shelter, not a hazard.
    const stall: DwellingDef = { kind: 'stall', x: 0, z: 0, rot: 0, r: 1.3, h: 1.9, floors: 1, door: [0, 0] }
    expect(dwellingRoofProfile(stall, north).lowest).toBeGreaterThanOrEqual(ROOF_HEADROOM)
    expect(dwellingCircleRadius(stall, north)).toBe(1.35)
  })
})

/** Every roof of a settlement, with the fire's cook-shelter included. */
function roofsOf(id: string, region: string, kind: string, seed: number) {
  const layout = buildLayout(id, seed)
  const roofs = placeRoofs(layout, styleOf(region), kind as 'port' | 'village' | 'monument', VILLAGE_FIRE)
  return { layout, roofs }
}

/**
 * Every point under `roof` at which a player could stand while the roof (or the
 * near plane's reach around him) hangs below the headroom. Empty is the pass.
 */
function lowStandableSpots(
  roof: PlaceRoof,
  colliders: Collider[],
  bounds: { radius: number; bank: ReturnType<typeof buildLayout>['bank'] },
): Array<{ x: number; z: number; head: number }> {
  const out: Array<{ x: number; z: number; head: number }> = []
  const reach = roof.rimRadius + CAMERA_NEAR_REACH
  for (let dx = -reach; dx <= reach; dx += STEP) {
    for (let dz = -reach; dz <= reach; dz += STEP) {
      const x = roof.x + dx
      const z = roof.z + dz
      const head = roofHeadroomAt([roof], x, z)
      if (head >= ROOF_HEADROOM) continue
      if (!insidePlace(bounds, x, z)) continue
      if (!standingClear(colliders, x, z, PLAYER_RADIUS)) continue
      out.push({ x, z, head })
    }
  }
  return out
}

describe('no roof hangs into the camera over standable ground (work-order 349)', () => {
  it.each(PLACES.map((p) => [p.id, p.region, p.kind] as const))('%s: every roof clears the eye', (id, region, kind) => {
    for (const seed of SEEDS) {
      const { layout, roofs } = roofsOf(id, region, kind, seed)
      const bounds = { radius: layout.radius, bank: layout.bank }
      for (const roof of roofs) {
        const bad = lowStandableSpots(roof, layout.colliders, bounds)
        expect(
          bad.length,
          bad.length === 0
            ? ''
            : `${id} seed ${seed}: ${bad.length} spots under the ${roof.what} leave only ` +
              `${bad[0].head.toFixed(2)} m of headroom, e.g. (${bad[0].x.toFixed(2)}, ${bad[0].z.toFixed(2)}) ` +
              `— lowest there: ${lowestRoofAt(roofs, bad[0].x, bad[0].z)}`,
        ).toBe(0)
      }
    }
  })

  it('sweeps every building type that carries a roof', () => {
    const seen = new Set<string>()
    for (const p of PLACES) {
      for (const seed of SEEDS) {
        const { roofs } = roofsOf(p.id, p.region, p.kind, seed)
        for (const roof of roofs) seen.add(roof.what)
      }
    }
    // Nine building kinds plus the two enterable huts and the cook-shelter: if
    // a kind stops appearing, the sweep above silently stopped covering it.
    expect([...seen].sort()).toEqual([
      'box house roof',
      'cook shelter',
      'granary cap',
      'hut roof',
      'mosque roof',
      'shed roof',
      'stall roof',
      'tent',
      'tower gallery',
      'trade house awning',
      'trade house roof',
      'warehouse roof',
    ])
  })
})

// THE REGRESSION WITNESS. A test that passes because it looks at nothing is
// worth nothing, so the same sweep is replayed against the collider set as it
// stood BEFORE this point — the wall body alone, blind to the overhang — and
// against a deliberately lowered rim. Both must FAIL it.
describe('the sweep bites (work-order 349)', () => {
  /** The pre-349 radii: the drawn wall body, with no roof term. */
  const WALL_ONLY: Partial<Record<DwellingKind, (r: number) => number>> = {
    hut: (r) => r + 0.3,
    granary: () => 1.2,
    tent: (r) => r * 1.3,
    stall: () => 1.35,
    shed: (r) => r + 0.35,
    tower: (r) => r + 0.4,
  }

  const wallOnlyColliders = (layout: ReturnType<typeof buildLayout>): Collider[] =>
    layout.colliders.map((c) => {
      if (c.kind === 'box' || c.kind === 'segment') return c
      const d = layout.dwellings.find((w) => w.x === c.x && w.z === c.z)
      const wall = d && WALL_ONLY[d.kind]
      return wall ? { ...c, r: wall(d.r) } : c
    })

  it('finds the Zulu rondavel eaves again with the pre-349 colliders', () => {
    const layout = buildLayout('zulu-village', SEEDS[0])
    const style = styleOf('south')
    const roofs = placeRoofs(layout, style, 'village', VILLAGE_FIRE)
    const bounds = { radius: layout.radius, bank: layout.bank }
    const legacy = wallOnlyColliders(layout)
    const bad = roofs.flatMap((roof) => lowStandableSpots(roof, legacy, bounds))
    expect(bad.length, 'the wall-only collider set must still expose the low eaves').toBeGreaterThan(0)
    // And it was BELOW the eye — the near plane cut in, it did not merely graze.
    expect(Math.min(...bad.map((b) => b.head))).toBeLessThan(EYE_HEIGHT)
    // The shipped set leaves none of them.
    expect(roofs.flatMap((roof) => lowStandableSpots(roof, layout.colliders, bounds))).toHaveLength(0)
  })

  it('fails a rim deliberately lowered under a roof that clears today', () => {
    const central = styleOf('central') // tall Congo roof on stilts: clear today
    const hut: DwellingDef = { kind: 'hut', x: 0, z: 0, rot: 0, r: 1.4, h: 2.1, floors: 1, door: [0, 0] }
    expect(dwellingRoofProfile(hut, central).lowest).toBeGreaterThanOrEqual(ROOF_HEADROOM)
    expect(dwellingCircleRadius(hut, central)).toBe(hut.r + 0.3)

    // Same hut, same roof, wall dropped to a rondavel's: the rim falls under the
    // eye and the collider must grow past the eave to keep the camera out.
    const lowered: DwellingDef = { ...hut, h: 1.4 }
    const profile = dwellingRoofProfile(lowered, central)
    expect(profile.lowest).toBeLessThan(ROOF_HEADROOM)
    expect(dwellingCircleRadius(lowered, central)).toBeGreaterThan(lowered.r + 0.3)
    // With only the wall body there IS standable ground under that rim.
    const wallOnly: Collider[] = [{ x: 0, z: 0, r: lowered.r + 0.3 }]
    expect(lowStandableSpots(profile, wallOnly, { radius: 40, bank: null }).length).toBeGreaterThan(0)
    // With the widened one there is none.
    const fixed: Collider[] = [{ x: 0, z: 0, r: dwellingCircleRadius(lowered, central) as number }]
    expect(lowStandableSpots(profile, fixed, { radius: 40, bank: null })).toHaveLength(0)
  })
})

describe('the drawn roof and the collider cannot drift apart (work-order 349)', () => {
  it('derives the hut stand-off from the same numbers PlaceScene builds with', () => {
    for (const region of ['north', 'west', 'central', 'east', 'south'] as const) {
      const style: RegionPlaceStyle = REGION_PLACE_STYLES[region]
      for (const r of [1.2, 1.5, 1.9]) {
        for (const h of [1.4, 1.8, 2.4]) {
          const profile = hutRoofProfile(style.roof, r, h, style.stilts)
          const standOff = hutRoofStandOff(style, r, h)
          if (standOff === 0) {
            expect(profile.lowest, `${region} r${r} h${h}`).toBeGreaterThanOrEqual(ROOF_HEADROOM)
          } else {
            // The camera's nearest reach lands exactly on the drawn eave rim.
            expect(standOff + PLAYER_RADIUS - CAMERA_NEAR_REACH, `${region} r${r} h${h}`).toBeCloseTo(
              profile.rimRadius,
              6,
            )
          }
        }
      }
    }
  })
})
