// Settlement rain that touches the world (design.md §19.13): drops end on the
// surface under their own x/z, never at the column's lower edge, and their
// impact is one shape — a ring on water, a puff on ground.
import { describe, expect, it } from 'vitest'
import { placeGroundHeight, type PlaceGround } from './placeGround'
import { BANK_WATER_DROP, bankGroundHeight, type PlaceRiverBank } from './riverBank'
import { dropArrival, dropBases, dropFall, impactAge, impactFlag, impactShape, ROOF_COVER, wrapToColumn } from './rainTouch'
import { balance } from '../../config/balance'
import { RAIN_FALL_SPEED, RAIN_HEIGHT, RAIN_RADIUS } from './rainMaterials'

// A bank due +x: flat plate to 20 m, the shore sloping into the water at 22 m.
const BANK = { nx: 1, nz: 0, fx: 0, fz: 1, distance: 22, walkEdge: 20 } as unknown as PlaceRiverBank
const FLAT: PlaceGround = { bank: null, sites: [], progress: [], rocks: [] }
const WITH_BANK: PlaceGround = { bank: BANK, sites: [], progress: [], rocks: [] }
// A low stone the foot walks over (work-order 1149) raises the ground at its spot.
const WITH_ROCK: PlaceGround = { bank: null, sites: [], progress: [], rocks: [[3, 4, 0.12]] }

describe('a drop ends on the ground under its own x/z', () => {
  it('is the footing sampler exactly, on the plate, on a rock and down the shore', () => {
    for (const g of [FLAT, WITH_BANK, WITH_ROCK]) {
      for (const [x, z] of [[0, 0], [3, 4], [21, -2], [-7, 9]] as const) {
        const a = dropArrival(g, x, z)
        if (a.water) continue
        expect(a.y).toBe(placeGroundHeight(g, x, z))
      }
    }
    // the shore between the bank top and the waterline lies below the plate
    const shore = dropArrival(WITH_BANK, 21, 0)
    expect(shore.water).toBe(0)
    expect(shore.y).toBeLessThan(0)
    expect(shore.y).toBe(bankGroundHeight(BANK, 21, 0))
  })

  it('follows the ground where it rises — never one column-wide edge', () => {
    const rock = WITH_ROCK.rocks[0]
    const onRock = dropArrival(WITH_ROCK, rock[0], rock[1]).y
    expect(onRock).toBe(placeGroundHeight(WITH_ROCK, rock[0], rock[1]))
    expect(onRock).toBeGreaterThan(0)
    const ys = new Set([dropArrival(WITH_BANK, 0, 0).y, dropArrival(WITH_BANK, 21, 0).y, dropArrival(WITH_BANK, 30, 0).y])
    expect(ys.size).toBe(3)
    // and it is never the old column bottom (eye height 1.5 m above the plate)
    for (const y of ys) expect(y).toBeLessThan(1.5)
  })

  it('ends on the water SURFACE where the river stands, flagged as water', () => {
    const a = dropArrival(WITH_BANK, 30, 5)
    expect(a.water).toBe(1)
    expect(a.y).toBe(-BANK_WATER_DROP)
    // above the drowned bed, not on it
    expect(a.y).toBeGreaterThan(bankGroundHeight(BANK, 30, 5))
    expect(dropArrival(FLAT, 30, 5).water).toBe(0)
  })
})

describe('impact: one shape, ring on water, puff on ground', () => {
  it('sits at the drop\'s arrival point with its water flag', () => {
    expect(dropArrival(WITH_BANK, 2, 2)).toEqual({ y: placeGroundHeight(WITH_BANK, 2, 2), water: 0 })
    expect(dropArrival(WITH_BANK, 40, 2)).toEqual({ y: -BANK_WATER_DROP, water: 1 })
  })

  it('flags a ring on water, a puff on open ground, none on a roofed floor', () => {
    expect(impactFlag(dropArrival(WITH_BANK, 40, 2), 0)).toBe(1)
    expect(impactFlag(dropArrival(WITH_BANK, 2, 2), 0)).toBe(0)
    expect(impactFlag(dropArrival(WITH_BANK, 2, 2), 1)).toBe(-1)
    // a tree crown lets the rain through: it still splashes under one
    expect(balance.rain.crownCover).toBeLessThan(ROOF_COVER)
    expect(impactFlag(dropArrival(FLAT, 2, 2), balance.rain.crownCover)).toBe(0)
  })

  it('blooms when the drop arrives and fades within its life', () => {
    const phase = 0.37
    // the moment of arrival: the fall reaches 0 and the impact is newborn
    const tArrive = (phase * RAIN_HEIGHT) / RAIN_FALL_SPEED
    expect(dropFall(phase, tArrive - 1e-4, RAIN_HEIGHT, RAIN_FALL_SPEED)).toBeLessThan(0.01)
    expect(impactAge(phase, tArrive + 0.05, RAIN_HEIGHT, RAIN_FALL_SPEED)).toBeCloseTo(0.05, 5)
    const young = impactShape(0.02, 0.3, 0.16)
    const old = impactShape(0.25, 0.3, 0.16)
    expect(young.alpha).toBeGreaterThan(old.alpha)
    expect(old.radius).toBeGreaterThan(young.radius)
    expect(impactShape(0.31, 0.3, 0.16).alpha).toBe(0)
  })

  it('the fall stays in [0, height) for any time (a floored mod)', () => {
    for (const t of [0, 0.3, 7.7, 123.4, 9999.9]) {
      const f = dropFall(0.81, t, RAIN_HEIGHT, RAIN_FALL_SPEED)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(RAIN_HEIGHT)
    }
  })
})

describe('drops keep a fixed world x/z while the column follows the eye', () => {
  it('wraps a base to within half a period of the eye', () => {
    const P = RAIN_RADIUS * 2
    for (const eye of [-100, -3, 0, 15.9, 47]) {
      const x = wrapToColumn(5, eye, P)
      expect(Math.abs(x - eye)).toBeLessThanOrEqual(P / 2 + 1e-9)
      expect(((x - 5) / P) % 1).toBeCloseTo(0)
    }
    // a small step of the eye does not move the drop
    expect(wrapToColumn(5, 1, P)).toBe(wrapToColumn(5, 1.4, P))
  })

  it('bases are deterministic and fill the column', () => {
    const a = dropBases(700, RAIN_RADIUS)
    expect(Array.from(a)).toEqual(Array.from(dropBases(700, RAIN_RADIUS)))
    expect(Math.max(...a)).toBeLessThanOrEqual(RAIN_RADIUS)
    expect(Math.min(...a)).toBeGreaterThanOrEqual(-RAIN_RADIUS)
    expect(Math.max(...a)).toBeGreaterThan(RAIN_RADIUS * 0.9)
    expect(Math.min(...a)).toBeLessThan(-RAIN_RADIUS * 0.9)
  })
})
