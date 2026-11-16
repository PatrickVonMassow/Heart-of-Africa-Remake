// Settlement rain that touches the world (design.md §19.13): drops end on the
// surface under their own x/z, never at the column's lower edge, and their
// impact is one shape — a faint ring, water- or earth-tinted.
import { describe, expect, it } from 'vitest'
import { placeGroundHeight, type PlaceGround } from './placeGround'
import { BANK_WATER_DROP, bankGroundHeight, type PlaceRiverBank } from './riverBank'
import {
  dropArrival,
  dropBases,
  dropFall,
  dropLengthScale,
  dropNearFade,
  dropWidthScale,
  impactSizeScale,
  rainDropCount,
  createRainSpotState,
  stepRainSpots,
  projectPoint,
  screenFraction,
  streakScreenScale,
  type StreakCamera,
  streakFitDistance,
  streakFrameFraction,
  impactAge,
  impactFlag,
  impactShape,
  ROOF_COVER,
  wrapToColumn,
} from './rainTouch'
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
    // covered water: a roof over the bank water blooms no ring either
    expect(impactFlag(dropArrival(WITH_BANK, 40, 2), 1)).toBe(-1)
    expect(impactFlag({ y: 0, water: 1 }, ROOF_COVER)).toBe(-1)
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

describe('a drop near the eye shortens, thins and fades out (no streak reads as a pole)', () => {
  const { dropNearFadeM: near, dropWidthCapM: cap, dropLengthM: len, dropMaxFrameFraction: frac } = balance.rain
  const tanHalfFov = Math.tan((25 * Math.PI) / 180) // the place camera's fov 50
  const far = streakFitDistance(len, tanHalfFov, frac)

  it('projects every streak within ~60 px of a 900 px frame at any distance', () => {
    expect(frac * 900).toBeLessThanOrEqual(60 + 1e-9)
    for (let d = 0.2; d <= 40; d += 0.1) {
      const px = streakFrameFraction(len * dropLengthScale(d, far), d, tanHalfFov) * 900
      expect(px).toBeLessThanOrEqual(60 + 1e-6)
    }
    // the unshortened streak exceeds 60 px exactly inside the fit distance
    expect(streakFrameFraction(len, far * 0.9, tanHalfFov) * 900).toBeGreaterThan(60)
    expect(streakFrameFraction(len, far, tanHalfFov) * 900).toBeCloseTo(60, 6)
  })

  it('fades 0 at and inside the near distance, 1 from the fit distance on, monotone between', () => {
    expect(near).toBeGreaterThan(0)
    expect(far).toBeGreaterThan(near)
    for (const d of [0, near / 2, near]) expect(dropNearFade(d, near, far)).toBe(0)
    for (const d of [far, far + 0.5, 40]) expect(dropNearFade(d, near, far)).toBe(1)
    let prev = 0
    for (let d = near; d <= far; d += (far - near) / 50) {
      const f = dropNearFade(d, near, far)
      expect(f).toBeGreaterThanOrEqual(prev)
      expect(f).toBeLessThanOrEqual(1)
      prev = f
    }
  })

  it('never projects wider than at the cap distance, and one streak is never near-solid', () => {
    expect(dropWidthScale(cap * 2, cap)).toBe(1)
    for (const d of [0.3, 1, 2.5, cap * 0.9]) {
      // projected width ∝ scale / d stays at or below its value at the cap
      expect(dropWidthScale(d, cap) / d).toBeLessThanOrEqual(1 / cap + 1e-9)
    }
    expect(balance.rain.dropOpacity).toBeLessThanOrEqual(0.5)
  })
})

describe('heavy rain is a dense veil, light rain stays sparse', () => {
  const min = balance.rain.dropDensityMinFraction
  it('draws the minimum share at the faintest rain, all at full rain, monotone between', () => {
    expect(min).toBeGreaterThan(0)
    expect(min).toBeLessThan(1)
    expect(rainDropCount(3300, 0, min)).toBe(Math.round(3300 * min))
    expect(rainDropCount(3300, 1, min)).toBe(3300)
    expect(rainDropCount(3300, 2, min)).toBe(3300)
    let prev = 0
    for (let a = 0; a <= 1; a += 0.05) {
      const n = rainDropCount(3300, a, min)
      expect(n).toBeGreaterThanOrEqual(prev)
      prev = n
    }
  })
})

describe('an impact is a small crown that fades out near the eye', () => {
  const { impactRadiusM: r, impactMaxFrameFraction: frac, impactNearFadeM: near, impactNearFullM: full } = balance.rain
  const tanHalfFov = Math.tan((25 * Math.PI) / 180)
  it('never projects wider than its frame fraction (≤ ~10 px of 900), off-axis and pitched', () => {
    // A flat ring on the ground and on raised surfaces, projected point by
    // point: its widest screen chord stays within the cap at every pitch,
    // heading and position, the frame's corners included.
    let worst = 0
    let capped = 0
    for (const pitch of [-0.6, -0.25, 0, 0.3]) {
      for (const yaw of [0, 1.3]) {
        const cam: StreakCamera = { eye: [0, 1.6, 0], yaw, pitch, tanHalfFov, aspect: 1440 / 900 }
        for (let i = -20; i <= 20; i++) {
          for (let j = -20; j <= 20; j++) {
            for (const y of [0, 0.8, 1.4]) {
              const c: [number, number, number] = [i * 0.3, y, j * 0.3]
              const s = impactSizeScale(cam, c, r, frac)
              if (s === 0) continue
              if (s < 1) capped++
              const ring = Array.from({ length: 32 }, (_, k) => {
                const a = (k / 32) * 2 * Math.PI
                return projectPoint(cam, [c[0] + Math.cos(a) * r * s, y, c[2] + Math.sin(a) * r * s])
              })
              if (ring.some((q) => q[2] <= 0)) continue
              for (let k = 0; k < 16; k++) worst = Math.max(worst, screenFraction(ring[k], ring[k + 16], cam.aspect) * 900)
            }
          }
        }
      }
    }
    expect(capped).toBeGreaterThan(0)
    expect(worst).toBeLessThanOrEqual(frac * 900 * 1.02)
    expect(frac * 900).toBeLessThanOrEqual(12)
  })
  it('draws no impact whose centre lies behind or at the eye', () => {
    const cam: StreakCamera = { eye: [0, 1.6, 0], yaw: 0, pitch: 0, tanHalfFov, aspect: 1440 / 900 }
    expect(impactSizeScale(cam, [0, 0, 0.5], r, frac)).toBe(0)
    expect(impactSizeScale(cam, [0, 0, -30], r, frac)).toBe(1)
  })
  it('fades 0 inside the near distance, 1 beyond the full one, monotone between', () => {
    expect(full).toBeGreaterThan(near)
    expect(dropNearFade(near, near, full)).toBe(0)
    expect(dropNearFade(full, near, full)).toBe(1)
    let prev = 0
    for (let d = near; d <= full; d += 0.05) {
      const f = dropNearFade(d, near, full)
      expect(f).toBeGreaterThanOrEqual(prev)
      prev = f
    }
  })
  it('is tinted dark like wet earth, never a pale disc', () => {
    const [cr, cg, cb] = balance.rain.impactGroundColor
    expect(Math.max(cr, cg, cb)).toBeLessThanOrEqual(0.15) // linear
    expect(balance.rain.impactOpacity).toBeLessThanOrEqual(0.35)
  })
})

describe('arrival sampling is spread over the frames, never a once-a-second spike', () => {
  const n = 800
  const bases = dropBases(n, RAIN_RADIUS)
  const period = RAIN_RADIUS * 2
  it('samples all drops on a fresh start, then only wraps plus a rolling share', () => {
    const st = createRainSpotState(n)
    const spots = new Float32Array(n * 4)
    let calls = 0
    const sample = (x: number, z: number) => {
      calls++
      return { y: x * 0 + z * 0 + 0.5, flag: 0 }
    }
    stepRainSpots(st, spots, bases, n, 0, 0, period, 1 / 60, 2, sample)
    expect(calls).toBe(n)
    for (let k = 0; k < n; k++) expect(spots[k * 4 + 1]).toBe(0.5)
    let worst = 0
    for (let f = 1; f <= 240; f++) {
      calls = 0
      stepRainSpots(st, spots, bases, n, 0, 0, period, 1 / 60, 2, sample)
      worst = Math.max(worst, calls)
    }
    expect(worst).toBe(Math.ceil((n * (1 / 60)) / 2)) // a still eye: the rolling share only
  })
  it('re-reads every drop within the refresh period and keeps each spot at its wrapped tile', () => {
    const st = createRainSpotState(n)
    const spots = new Float32Array(n * 4)
    let h = 0
    const sample = () => ({ y: h, flag: 0 })
    stepRainSpots(st, spots, bases, n, 3, -2, period, 1 / 60, 2, sample)
    h = 1
    for (let f = 0; f < 120; f++) stepRainSpots(st, spots, bases, n, 3, -2, period, 1 / 60, 2, sample)
    for (let k = 0; k < n; k++) {
      expect(spots[k * 4 + 1]).toBe(1)
      expect(spots[k * 4]).toBeCloseTo(wrapToColumn(bases[k * 2], 3, period), 4)
      expect(spots[k * 4 + 2]).toBeCloseTo(wrapToColumn(bases[k * 2 + 1], -2, period), 4)
    }
  })
})

describe('a streak is capped on SCREEN after the full projection (off-axis and pitch)', () => {
  const { dropLengthM: len, dropMaxFrameFraction: frac } = balance.rain
  const tanHalfFov = Math.tan((25 * Math.PI) / 180)
  const cams: StreakCamera[] = [-0.5, -0.2, 0, 0.3].flatMap((pitch) =>
    [0, 1.3].map((yaw) => ({ eye: [0, 1.6, 0] as const, yaw, pitch, tanHalfFov, aspect: 1440 / 900 })),
  )
  const px = (cam: StreakCamera, base: [number, number, number], s: number) =>
    screenFraction(projectPoint(cam, base), projectPoint(cam, [base[0], base[1] + len * s, base[2]]), cam.aspect) * 900

  it('keeps a near, low, off-axis drop at the bottom-left edge within ~60 px of a 900 px frame', () => {
    // Looking slightly down; the drop stands 1.2 m ahead, far left and low, so
    // it projects near the frame's bottom-left corner, where a depth-only cap
    // let a 70 px bar through.
    const cam: StreakCamera = { eye: [0, 1.6, 0], yaw: 0, pitch: -0.25, tanHalfFov, aspect: 1440 / 900 }
    const base: [number, number, number] = [-1.4, 0.05, -1.2]
    const ndc = projectPoint(cam, base)
    expect(ndc[0]).toBeLessThan(-0.6)
    expect(ndc[1]).toBeLessThan(-0.6)
    expect(px(cam, base, 1)).toBeGreaterThan(60) // uncapped it is a bar
    expect(px(cam, base, streakScreenScale(cam, base, len, frac))).toBeLessThanOrEqual(60 + 1e-6)
  })

  it('holds for every drop of a dense column, at every pitch and heading', () => {
    let worst = 0
    let capped = 0
    for (const cam of cams) {
      for (let i = -24; i <= 24; i++) {
        for (let j = -24; j <= 24; j++) {
          for (const y of [0, 0.8, 1.5, 2.5, 6]) {
            const base: [number, number, number] = [i * 0.33, y, j * 0.33]
            const s = streakScreenScale(cam, base, len, frac)
            if (s === 0) continue
            if (s < 1) capped++
            worst = Math.max(worst, px(cam, base, s))
          }
        }
      }
    }
    expect(capped).toBeGreaterThan(0)
    expect(worst).toBeLessThanOrEqual(60 + 1e-6)
  })

  it('draws nothing whose tip lies behind or at the eye', () => {
    const cam = cams[2]
    expect(streakScreenScale(cam, [0, 1.5, 0.5], len, frac)).toBe(0) // behind
    expect(streakScreenScale(cam, [0, 1.5, -10], len, frac)).toBe(1) // far ahead: uncapped
  })
})
