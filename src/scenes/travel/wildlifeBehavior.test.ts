import { describe, expect, it } from 'vitest'
import {
  channelDriftStep,
  seasonFlowFactor,
  waterStruggleFate,
  blockHeading,
  fleeHeading,
  FLIGHT_DESPAWN_OUT,
  FLIGHT_SPAWN_OUT,
  flightStep,
  gambolState,
  griefTarget,
  groundNormal,
  leashedGambolDir,
  separationPush,
  turnToward,
  type FlightState,
  killFlockMayDescend,
  VULTURE_DESCEND_CLEAR_DIST,
  deflectedStep,
} from './wildlifeBehavior'

const dir = (h: number): [number, number] => [Math.sin(h), Math.cos(h)]

describe('fleeHeading (design.md §19 — stable prey escape)', () => {
  it('returns null when no threat is within range', () => {
    expect(fleeHeading(0, 0, [[10, 0]], 3)).toBeNull()
    expect(fleeHeading(0, 0, [], 3)).toBeNull()
  })

  it('flees directly away from a single threat', () => {
    // Threat ahead at +z; the animal should flee toward -z (heading π).
    const h = fleeHeading(0, 0, [[0, 2]], 3)
    expect(h).not.toBeNull()
    const [sx, sz] = dir(h as number)
    expect(sx).toBeCloseTo(0, 5)
    expect(sz).toBeCloseTo(-1, 5)
  })

  it('flees the resultant of two flanking threats, moving away from both', () => {
    // Two elephants ~90° apart, both at +x (one at +z, one at -z): the escape
    // heading must point in -x (away from both), not toward either one.
    const threats: [number, number][] = [
      [2, 2],
      [2, -2],
    ]
    const h = fleeHeading(0, 0, threats, 5) as number
    const [sx, sz] = dir(h)
    expect(sx).toBeCloseTo(-1, 2) // moves in -x
    expect(sz).toBeCloseTo(0, 2)
    // A step along the heading increases the distance to BOTH threats.
    const step = 0.5
    for (const [tx, tz] of threats) {
      const before = Math.hypot(0 - tx, 0 - tz)
      const after = Math.hypot(sx * step - tx, sz * step - tz)
      expect(after).toBeGreaterThan(before)
    }
  })

  it('falls back to a single threat when the repulsion cancels out exactly', () => {
    // Two threats exactly opposite at equal distance: the summed vector is zero,
    // so it must still bolt (toward the first-seen one's away side), not freeze
    // on a NaN heading.
    const h = fleeHeading(0, 0, [[0, 1], [0, -1]], 5)
    expect(h).not.toBeNull()
    expect(Number.isNaN(h as number)).toBe(false)
    const [, sz] = dir(h as number)
    expect(sz).toBeLessThan(0) // away from the +z threat seen first
  })

  it('stays stable (no oscillation) as the animal moves away from flankers', () => {
    // Reproduces the reported symptom setup: a prey straddled by two elephants.
    // Walking along the escape heading and recomputing each step must yield a
    // heading that barely changes and never reverses — the old nearest-threat
    // pick would flip ~90° here.
    const threats: [number, number][] = [
      [3, 1.4],
      [3, -1.8],
    ]
    let x = 0
    let z = 0
    let prev = fleeHeading(x, z, threats, 5) as number
    let maxDelta = 0
    let reversals = 0
    let prevDelta = 0
    for (let i = 0; i < 40; i++) {
      const h = fleeHeading(x, z, threats, 5)
      if (h === null) break // fled out of range — fine
      let d = h - prev
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      maxDelta = Math.max(maxDelta, Math.abs(d))
      if (i > 0 && d * prevDelta < -1e-6) reversals++
      prevDelta = d
      prev = h
      const [sx, sz] = dir(h)
      x += sx * 0.2
      z += sz * 0.2
    }
    expect(maxDelta).toBeLessThan(0.35) // no ~90° snap
    expect(reversals).toBeLessThanOrEqual(1)
  })
})

describe('blockHeading (design.md §19 — the parent shields its hunted calf)', () => {
  it('heads for the station between the calf and the predator', () => {
    // Parent at origin, calf at (-4,0), predator at (5,0): the station lies at
    // calf + 1.8·(1,0) = (-2.2, 0) — between the two, on the escape line.
    const h = blockHeading(0, 0, -4, 0, 5, 0, 1.8)
    expect(h).not.toBeNull()
    const [sx, sz] = dir(h as number)
    expect(sx).toBeLessThan(-0.9) // toward -x: back to the station
    expect(Math.abs(sz)).toBeLessThan(0.1)
  })

  it('holds (null) once on station', () => {
    // Station for calf (0,0), predator (6,0), offset 1.8 sits at (1.8, 0).
    expect(blockHeading(1.8, 0, 0, 0, 6, 0, 1.8)).toBeNull()
    expect(blockHeading(1.9, 0.1, 0, 0, 6, 0, 1.8)).toBeNull() // within the eps
    expect(blockHeading(4, 0, 0, 0, 6, 0, 1.8)).not.toBeNull() // off station
  })

  it('holds in the degenerate case of the predator on the calf', () => {
    expect(blockHeading(3, 3, 4, 3, 4, 3, 1.8)).toBeNull()
  })

  it('the shield stays between hunter and calf, and the hunter takes it first', () => {
    // Mini-simulation of the chase contract; the numbers mirror Wildlife.tsx
    // (HUNT_LION_SPEED 5.6, CALF_FLEE_SPEED 3.8, PARENT_BLOCK_SPEED 6,
    // PARENT_BLOCK_OFFSET 1.8, PARENT_TAKE_DIST 1.0, CALF_CATCH_DIST 0.9).
    // The parent holding its blocking station must be reached by the hunter
    // (taken in the calf's place) before the hunter ever reaches the calf.
    const calf = { x: 0, z: 0 }
    const parent = { x: 1.8, z: 0 }
    const pred = { x: 12, z: 0 }
    const dt = 1 / 60
    let taken = false
    let caught = false
    let betweenSamples = 0
    let samples = 0
    for (let i = 0; i < 60 * 30 && !taken && !caught; i++) {
      const toCalf = Math.atan2(calf.x - pred.x, calf.z - pred.z)
      pred.x += Math.sin(toCalf) * 5.6 * dt
      pred.z += Math.cos(toCalf) * 5.6 * dt
      if (Math.hypot(pred.x - calf.x, pred.z - calf.z) < 0.9) {
        caught = true
        break
      }
      const away = Math.atan2(calf.x - pred.x, calf.z - pred.z)
      calf.x += Math.sin(away) * 3.8 * dt
      calf.z += Math.cos(away) * 3.8 * dt
      const h = blockHeading(parent.x, parent.z, calf.x, calf.z, pred.x, pred.z, 1.8)
      if (h !== null) {
        parent.x += Math.sin(h) * 6 * dt
        parent.z += Math.cos(h) * 6 * dt
      }
      samples++
      const dPredParent = Math.hypot(pred.x - parent.x, pred.z - parent.z)
      const dPredCalf = Math.hypot(pred.x - calf.x, pred.z - calf.z)
      if (dPredParent < dPredCalf && Math.hypot(parent.x - calf.x, parent.z - calf.z) < 4) betweenSamples++
      if (dPredParent < 1.0) taken = true
    }
    expect(taken).toBe(true) // the hunter meets the shield…
    expect(caught).toBe(false) // …never the calf
    expect(betweenSamples / samples).toBeGreaterThan(0.8) // the shield held its line
  })
})

describe('griefTarget (design.md §19 — the parent charges the elephant that trampled its calf)', () => {
  it('picks the nearest living elephant', () => {
    const near = griefTarget(0, 0, [
      { x: 20, z: 0 },
      { x: 4, z: 3 }, // distance 5 — the nearest
      { x: 0, z: 12 },
    ])
    expect(near).toEqual({ x: 4, z: 3 })
  })

  it('ignores a dead elephant and takes the next living one', () => {
    const t = griefTarget(0, 0, [
      { x: 1, z: 0, dead: true },
      { x: 9, z: 0 },
    ])
    expect(t).toEqual({ x: 9, z: 0 })
  })

  it('returns null with no elephants at all — the grief must end, not chase nothing', () => {
    expect(griefTarget(0, 0, [])).toBeNull()
  })

  it('returns null when every elephant is dead', () => {
    expect(griefTarget(0, 0, [{ x: 1, z: 1, dead: true }, { x: 5, z: 5, dead: true }])).toBeNull()
  })

  it('the charge reaches the trampling feet well inside the grief window', () => {
    // Mini-simulation of the contract; the numbers mirror Wildlife.tsx
    // (TRAMPLE_GRIEF_SPEED 6.5, ELEPHANT_SPEED 1.5, TRAMPLE_GRIEF_SECONDS 12,
    // TRAMPLE_RADIUS 1.5). The parent must catch an elephant WALKING AWAY from
    // it — otherwise the window would expire and the sacrifice would silently
    // never happen.
    const dt = 1 / 60
    let px = 0
    let pz = 0
    const eleph = { x: 10, z: 0 }
    let grief = 12
    let trampled = false
    while (grief > 0) {
      eleph.x += 1.5 * dt // roaming straight away from the parent
      const t = griefTarget(px, pz, [eleph])
      expect(t).not.toBeNull()
      const dx = t!.x - px
      const dz = t!.z - pz
      const d = Math.hypot(dx, dz) || 1
      px += (dx / d) * 6.5 * dt
      pz += (dz / d) * 6.5 * dt
      if (Math.hypot(eleph.x - px, eleph.z - pz) < 1.5) {
        trampled = true
        break
      }
      grief -= dt
    }
    expect(trampled).toBe(true)
    expect(grief).toBeGreaterThan(6) // reached with the window barely touched
  })
})

describe('gambolState (design.md §19 — playful calf hop-bouts)', () => {
  it('is idle outside the bout window and active inside it', () => {
    // phase 0: the bout is the first quarter of the 16 s cycle.
    expect(gambolState(8, 0)).toBeNull() // cycle 0.5 — idle
    expect(gambolState(15, 0)).toBeNull() // cycle ~0.94 — idle
    const bout = gambolState(1, 0) // cycle ~0.06 — playing
    expect(bout).not.toBeNull()
    expect(bout!.hop).toBeGreaterThanOrEqual(0)
    expect(bout!.hop).toBeLessThanOrEqual(1)
  })

  it('phase-shifts the bouts so herd-mates do not all play at once', () => {
    expect(gambolState(8, 0)).toBeNull()
    expect(gambolState(8, 0.2)).not.toBeNull() // 8 + 0.2*40 = 16 → cycle 0
  })

  it('is deterministic and curves over the bout (heading varies)', () => {
    const a1 = gambolState(0.2, 0)
    const a2 = gambolState(0.2, 0)
    expect(a1).toEqual(a2)
    const b = gambolState(1.75, 0) // near the bend's peak of the same bout
    expect(a1).not.toBeNull()
    expect(b).not.toBeNull()
    expect(Math.abs(a1!.heading - b!.heading)).toBeGreaterThan(0.3)
  })
})

describe('separationPush (design.md §19 — animal body separation)', () => {
  it('returns zero when nothing overlaps', () => {
    expect(separationPush(0, 0, [[3, 0, 2]])).toEqual([0, 0])
    expect(separationPush(0, 0, [])).toEqual([0, 0])
  })

  it('pushes half-way out of a single overlap, directly apart', () => {
    const [dx, dz] = separationPush(0, 0, [[1, 0, 2]])
    expect(dx).toBeCloseTo(-0.5, 6) // overlap 1, own half 0.5, away from neighbour
    expect(dz).toBeCloseTo(0, 6)
  })

  it('parts coincident animals instead of dividing by zero', () => {
    const [dx, dz] = separationPush(2, 2, [[2, 2, 1.5]])
    expect(dx).toBeCloseTo(0.75, 6)
    expect(dz).toBeCloseTo(0, 6)
  })

  it('sums the pushes of several overlapping neighbours', () => {
    // Symmetric flankers cancel; two on the same side add up.
    const [cx] = separationPush(0, 0, [[1, 0, 2], [-1, 0, 2]])
    expect(cx).toBeCloseTo(0, 6)
    const [sx] = separationPush(0, 0, [[1, 0, 2], [0.5, 0, 2]])
    expect(sx).toBeCloseTo(-1.25, 6) // -0.5 and -0.75
  })

  it('mutual application separates a pair to the full distance', () => {
    // Both members resolve their own half per frame — iterating parts them.
    let ax = 0
    let bx = 0.4
    for (let i = 0; i < 8; i++) {
      const [pa] = separationPush(ax, 0, [[bx, 0, 1.4]])
      const [pb] = separationPush(bx, 0, [[ax, 0, 1.4]])
      ax += pa
      bx += pb
      if (Math.abs(bx - ax) >= 1.4) break
    }
    expect(Math.abs(bx - ax)).toBeGreaterThanOrEqual(1.4 - 1e-6)
  })
})

describe('flightStep (design.md §19 — vultures fly in and off, never pop)', () => {
  const mk = (): FlightState => ({ mode: 'idle', x: 0, z: 0 })

  it('spawns beyond the view ring on the far side of the target', () => {
    const s = mk()
    flightStep(s, true, 10, 0, 0, 0, 100, 16, 1 / 60)
    expect(s.mode).toBe('in')
    expect(s.x).toBeCloseTo(100 + FLIGHT_SPAWN_OUT, 6)
    expect(s.z).toBeCloseTo(0, 6)
  })

  it('spawns at a fixed ring point when the target sits on the player', () => {
    const s = mk()
    flightStep(s, true, 0, 0, 0, 0, 100, 16, 1 / 60)
    expect(s.mode).toBe('in')
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(100 + FLIGHT_SPAWN_OUT, 6)
  })

  it('flies in, arrives (active), and stays while wanted', () => {
    const s = mk()
    flightStep(s, true, 10, 0, 0, 0, 100, 16, 1 / 60)
    const d0 = Math.hypot(s.x - 10, s.z)
    for (let i = 0; i < 60 * 20 && s.mode === 'in'; i++) flightStep(s, true, 10, 0, 0, 0, 100, 16, 1 / 60)
    expect(s.mode).toBe('active')
    expect(Math.hypot(s.x - 10, s.z)).toBeLessThan(d0)
    flightStep(s, true, 10, 0, 0, 0, 100, 16, 1 / 60)
    expect(s.mode).toBe('active')
  })

  it('flies off when no longer wanted and despawns only well outside the view', () => {
    const s: FlightState = { mode: 'active', x: 10, z: 0 }
    let lastOutDist = 0
    for (let i = 0; i < 60 * 30 && s.mode !== 'idle'; i++) {
      flightStep(s, false, 10, 0, 0, 0, 100, 16, 1 / 60)
      if (s.mode === 'out') lastOutDist = Math.hypot(s.x, s.z)
    }
    expect(s.mode).toBe('idle')
    expect(lastOutDist).toBeGreaterThan(100 + FLIGHT_DESPAWN_OUT - 1)
  })

  it('retargets while still airborne instead of respawning', () => {
    const s: FlightState = { mode: 'out', x: 50, z: 0 }
    flightStep(s, true, 10, 0, 0, 0, 100, 16, 1 / 60)
    expect(s.mode).toBe('in')
    expect(Math.hypot(s.x - 50, s.z)).toBeLessThan(1) // kept its position
  })
})

describe('groundNormal (design.md §19 — slope-conforming decals)', () => {
  it('returns straight up on flat ground', () => {
    const [nx, ny, nz] = groundNormal(0, 0, () => 1)
    expect(nx).toBeCloseTo(0, 6)
    expect(ny).toBeCloseTo(1, 6)
    expect(nz).toBeCloseTo(0, 6)
  })

  it('tilts against a slope rising toward +x', () => {
    // height = x → surface normal leans toward -x; unit length; ny > 0.
    const [nx, ny, nz] = groundNormal(0, 0, (x) => x)
    expect(nx).toBeLessThan(0)
    expect(nz).toBeCloseTo(0, 6)
    expect(ny).toBeGreaterThan(0)
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6)
    // Exact: slope 1 → normal (-1, 1, 0)/√2.
    expect(nx).toBeCloseTo(-Math.SQRT1_2, 6)
    expect(ny).toBeCloseTo(Math.SQRT1_2, 6)
  })

  it('tilts against a slope rising toward -z', () => {
    const [nx, ny, nz] = groundNormal(0, 0, (_x, z) => -z)
    expect(nx).toBeCloseTo(0, 6)
    expect(nz).toBeGreaterThan(0)
    expect(ny).toBeGreaterThan(0)
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6)
  })
})

describe('turnToward', () => {
  it('caps the step and takes the shorter way around the circle', () => {
    expect(turnToward(0, 1, 0.1)).toBeCloseTo(0.1, 6)
    expect(turnToward(0, -1, 0.1)).toBeCloseTo(-0.1, 6)
    // Wrap: from just below +π toward just above -π goes forward, not all the way back.
    const r = turnToward(3.0, -3.0, 0.2)
    expect(r).toBeCloseTo(3.2, 6)
  })

  it('reaches the target when within one step', () => {
    expect(turnToward(0, 0.05, 0.2)).toBeCloseTo(0.05, 6)
  })
})

describe('leashedGambolDir (design.md §19 — the scamper orbits its parent)', () => {
  const GAMBOL_RANGE = 4
  const GAMBOL_SPEED = 2.2
  const YOUNG_FOLLOW_SPEED = 4.5
  const YOUNG_FOLLOW_RADIUS = 1.8

  it('plays freely near the parent (the leash barely bends the heading)', () => {
    for (const h of [0, 1.2, Math.PI, -2]) {
      const [dx, dz] = leashedGambolDir(h, 0.5, 0.5, 0.7, GAMBOL_RANGE)
      const dot = dx * Math.sin(h) + dz * Math.cos(h)
      expect(dot, `heading ${h}`).toBeGreaterThan(0.9) // nearly the bout direction
    }
  })

  it('never steps outward at the range edge, for EVERY bout heading', () => {
    for (let i = 0; i < 16; i++) {
      const h = (i / 16) * Math.PI * 2
      // Parent sits at the origin, calf at range distance east: outward is
      // +x, and the damped step must carry none of it at the edge.
      const [dx] = leashedGambolDir(h, -GAMBOL_RANGE, 0, GAMBOL_RANGE, GAMBOL_RANGE)
      expect(dx, `heading ${h}`).toBeLessThanOrEqual(1e-9)
    }
  })

  it('returns a finite unit direction in the degenerate cases', () => {
    for (const [tx, tz, d] of [
      [0, 0, 0],
      [1e-9, 0, 1e-9],
    ] as const) {
      const [dx, dz] = leashedGambolDir(1, tx, tz, d, GAMBOL_RANGE)
      expect(Number.isFinite(dx) && Number.isFinite(dz)).toBe(true)
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  // Frame-loop simulation in the shape of the real integrator: the calf must
  // never leave the play range mid-bout (so the follow yank never alternates
  // with play), and its step direction must not saw back and forth.
  it('a full simulated bout stays leashed with no direction sawtooth', () => {
    const dt = 1 / 60
    let x = 0.5
    let z = 0
    const parent = { x: 0, z: 0 }
    let prevStepX: number | null = null
    let prevStepZ: number | null = null
    let flips = 0
    let steps = 0
    let maxDist = 0
    for (let f = 0; f < 3600; f++) {
      const t = f * dt
      const bout = gambolState(t, 0.37)
      const toX = parent.x - x
      const toZ = parent.z - z
      const d = Math.hypot(toX, toZ)
      if (bout) {
        const [sx, sz] = leashedGambolDir(bout.heading, toX, toZ, d, GAMBOL_RANGE)
        x += sx * GAMBOL_SPEED * dt
        z += sz * GAMBOL_SPEED * dt
        if (prevStepX !== null && prevStepZ !== null && sx * prevStepX + sz * prevStepZ < 0) flips++
        prevStepX = sx
        prevStepZ = sz
        steps++
      } else {
        prevStepX = null
        prevStepZ = null
        if (d > YOUNG_FOLLOW_RADIUS) {
          x += (toX / d) * YOUNG_FOLLOW_SPEED * dt
          z += (toZ / d) * YOUNG_FOLLOW_SPEED * dt
        }
      }
      maxDist = Math.max(maxDist, Math.hypot(x - parent.x, z - parent.z))
    }
    expect(steps).toBeGreaterThan(400) // the bout actually ran
    expect(maxDist).toBeLessThanOrEqual(GAMBOL_RANGE + 0.05) // leashed — never past the edge
    expect(flips / Math.max(1, steps)).toBeLessThan(0.02) // no per-frame sawtooth
  })

  it('the OLD unleashed range-switch genuinely sawtoothed (regression witness)', () => {
    const dt = 1 / 60
    let x = 0.5
    let z = 0
    let prevStepX: number | null = null
    let prevStepZ: number | null = null
    let flips = 0
    let steps = 0
    for (let f = 0; f < 3600; f++) {
      const t = f * dt
      const d = Math.hypot(x, z)
      const bout = d <= GAMBOL_RANGE ? gambolState(t, 0.37) : null
      if (bout) {
        const sx = Math.sin(bout.heading)
        const sz = Math.cos(bout.heading)
        x += sx * GAMBOL_SPEED * dt
        z += sz * GAMBOL_SPEED * dt
        if (prevStepX !== null && prevStepZ !== null && sx * prevStepX + sz * prevStepZ < 0) flips++
        prevStepX = sx
        prevStepZ = sz
        steps++
      } else {
        if (d > YOUNG_FOLLOW_RADIUS) {
          const sx = -x / d
          const sz = -z / d
          x += sx * YOUNG_FOLLOW_SPEED * dt
          z += sz * YOUNG_FOLLOW_SPEED * dt
          if (prevStepX !== null && prevStepZ !== null && sx * prevStepX + sz * prevStepZ < 0) flips++
          prevStepX = sx
          prevStepZ = sz
          steps++
        } else {
          prevStepX = null
          prevStepZ = null
        }
      }
    }
    expect(flips / Math.max(1, steps)).toBeGreaterThan(0.05) // the boundary buzz the fix removes
  })
})

describe('clamped separation (design.md §19 — a force, not a teleport)', () => {
  const SEPARATION_MAX_SPEED = 2.2

  it('parts an overlapping pair smoothly and monotonically', () => {
    const dt = 1 / 60
    let ax = 0
    let bx = 0.4 // deep overlap, minDist 1.4
    let prevGap = bx - ax
    for (let f = 0; f < 240; f++) {
      const [pa] = separationPush(ax, 0, [[bx, 0, 1.4]])
      const [pb] = separationPush(bx, 0, [[ax, 0, 1.4]])
      const cap = SEPARATION_MAX_SPEED * dt
      ax += Math.max(-cap, Math.min(cap, pa))
      bx += Math.max(-cap, Math.min(cap, pb))
      const gap = bx - ax
      expect(gap).toBeGreaterThanOrEqual(prevGap - 1e-9) // monotone, no overshoot back
      prevGap = gap
    }
    expect(prevGap).toBeGreaterThanOrEqual(1.4 - 1e-6) // fully parted…
    expect(prevGap).toBeLessThan(1.5) // …but not flung apart
  })

  it('a clamped push never exceeds the walking pace in one frame', () => {
    const dt = 1 / 60
    const [dx, dz] = separationPush(0, 0, [[0.01, 0, 2.0]])
    const m = Math.hypot(dx, dz)
    const cap = SEPARATION_MAX_SPEED * dt
    const k = m > cap ? cap / m : 1
    expect(Math.hypot(dx * k, dz * k)).toBeLessThanOrEqual(cap + 1e-9)
  })
})

describe('killFlockMayDescend (design.md §19.6 — land once the site is clear)', () => {
  it('never lands while the predator feeds', () => {
    expect(killFlockMayDescend('feed', 0, 0, 0, 0)).toBe(false)
    expect(killFlockMayDescend('feed', 100, 100, 0, 0)).toBe(false)
  })

  it('during the walk-off it lands as soon as the predator cleared the site', () => {
    expect(killFlockMayDescend('leave', 5, 0, 0, 0)).toBe(false) // still close
    expect(killFlockMayDescend('leave', VULTURE_DESCEND_CLEAR_DIST + 1, 0, 0, 0)).toBe(true)
  })

  it('a gone predator frees the site immediately', () => {
    expect(killFlockMayDescend('idle', 0, 0, 0, 0)).toBe(true)
  })
})

describe('deflectedStep (scripted walks obey the land constraint, point 83)', () => {
  it('walks straight while the way is clear', () => {
    const r = deflectedStep(0, 0, 0, 1, () => false)
    expect(r.moved).toBe(true)
    expect(r.x).toBeCloseTo(0)
    expect(r.z).toBeCloseTo(1)
    expect(r.heading).toBeCloseTo(0)
  })

  it('deflects along a coast instead of entering the ocean', () => {
    // Ocean everywhere north of z = 0.5; heading north (0).
    const blocked = (_x: number, z: number) => z > 0.5
    const r = deflectedStep(0, 0, 0, 1, blocked)
    expect(r.moved).toBe(true)
    expect(blocked(r.x, r.z)).toBe(false)
    expect(Math.abs(r.heading)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9) // swings at most to the flank
  })

  it('prefers the smallest swing that clears the water', () => {
    // A diagonal coast: the first 15° probe to one side already clears it.
    const blocked = (x: number, z: number) => z > 0.5 && x > -0.2
    const r = deflectedStep(0, 0, 0, 1, blocked)
    expect(r.moved).toBe(true)
    expect(r.heading).toBeLessThan(0) // swung west, away from the blocked side
  })

  it('stands rather than swims when every forward probe is water', () => {
    const r = deflectedStep(0, 0, 0, 1, () => true)
    expect(r.moved).toBe(false)
    expect(r.x).toBe(0)
    expect(r.z).toBe(0)
  })

  it('never steps into a narrow channel even when land lies beyond it', () => {
    // Water only in z ∈ (1.0, 1.1) — a thin channel; the far probe (0.6)
    // lands on dry ground beyond it, but the step itself must not get wet.
    const blocked = (_x: number, z: number) => z > 1.0 && z < 1.1
    const r = deflectedStep(0, 0.98, 0, 0.05, blocked, 0.6)
    expect(r.moved).toBe(true)
    expect(blocked(r.x, r.z)).toBe(false)
  })

  it('the lookahead keeps the walker out of a one-cell dead end', () => {
    // A single land cell at z ∈ [1, 1.2] pokes into water (z > 1.2 wet,
    // z in (1, 1.2] dry pocket). With a probe reaching past the pocket the
    // walker treats the pocket as blocked and swings aside instead.
    const blocked = (x: number, z: number) => z > 1.2 || (z > 1 && Math.abs(x) < 0.05)
    const r = deflectedStep(0, 0.95, 0, 0.1, blocked, 0.6)
    expect(r.moved).toBe(true)
    // It did NOT step straight into the pocket column.
    expect(Math.abs(r.heading)).toBeGreaterThan(0.01)
  })
})

describe('waterStruggleFate (design.md §19.8, point 122 — calm water rescues, a swollen current drowns)', () => {
  const SELF_RESCUE = 25
  const DROWN = 30
  const THRESHOLD = 0.8

  const fate = (flow: number, seconds: number) =>
    waterStruggleFate(flow, seconds, SELF_RESCUE, DROWN, THRESHOLD)

  it('calm water self-rescues after the exhaustion window and never drowns', () => {
    expect(fate(0, 10)).toBe('struggling')
    expect(fate(0, 25.1)).toBe('self-rescue')
    expect(fate(0.5, 26)).toBe('self-rescue')
    // Even absurdly long in calm water: exhaustion wins, the river never does.
    expect(fate(0.79, 10_000)).toBe('self-rescue')
  })

  it('a strong current drowns exactly at the threshold second — and never self-rescues', () => {
    expect(fate(1, 29.99)).toBe('struggling')
    expect(fate(1, 30)).toBe('drowned')
    // The self-rescue must NOT fire in a strong current, or nothing ever
    // drowns: past the 25 s window it keeps struggling until the river takes it.
    expect(fate(1, 26)).toBe('struggling')
  })

  it('the flow boundary is exact: just below clambers out, at it drowns', () => {
    expect(fate(THRESHOLD - 1e-9, 40)).toBe('self-rescue')
    expect(fate(THRESHOLD, 40)).toBe('drowned')
  })

  it('an Infinity self-rescue window (the wading parent) still drowns in a strong current', () => {
    expect(waterStruggleFate(1, 30, Infinity, DROWN, THRESHOLD)).toBe('drowned')
    expect(waterStruggleFate(0.5, 10_000, Infinity, DROWN, THRESHOLD)).toBe('struggling')
  })
})

describe('seasonFlowFactor (point 122 — the rains swell the drama current)', () => {
  it('interpolates dry -> wet over the wetness and clamps outside 0..1', () => {
    expect(seasonFlowFactor(0, 0.6, 1.8)).toBeCloseTo(0.6, 9)
    expect(seasonFlowFactor(1, 0.6, 1.8)).toBeCloseTo(1.8, 9)
    expect(seasonFlowFactor(0.5, 0.6, 1.8)).toBeCloseTo(1.2, 9)
    expect(seasonFlowFactor(-1, 0.6, 1.8)).toBeCloseTo(0.6, 9)
    expect(seasonFlowFactor(2, 0.6, 1.8)).toBeCloseTo(1.8, 9)
  })

  it('with the shipped balance values, a mid-channel flow drowns only in the rains', () => {
    // flow 1.0 (centerline): dry 0.6 < 0.8 (clambers out), rains 1.8 >= 0.8.
    expect(1.0 * seasonFlowFactor(0.05, 0.6, 1.8)).toBeLessThan(0.8)
    expect(1.0 * seasonFlowFactor(0.9, 0.6, 1.8)).toBeGreaterThanOrEqual(0.8)
  })
})

describe('channelDriftStep (point 122 — the current follows the channel, never beaches)', () => {
  it('takes the full step while it stays on water', () => {
    const all = () => true
    expect(channelDriftStep(0, 0, 1, 2, all)).toEqual({ x: 1, z: 2 })
  })

  it('falls back to the in-channel component when the full step would beach', () => {
    // Water is the half-plane x <= 0.5: the x-component beaches, z flows.
    const water = (x: number) => x <= 0.5
    expect(channelDriftStep(0, 0, 1, 2, water)).toEqual({ x: 0, z: 2 })
    // Water is z <= 0.5: the z-component beaches, x flows.
    const waterZ = (_x: number, z: number) => z <= 0.5
    expect(channelDriftStep(0, 0, 1, 2, waterZ)).toEqual({ x: 1, z: 0 })
  })

  it('stays put when every candidate is dry (still in the water at its old spot)', () => {
    const none = () => false
    expect(channelDriftStep(3, 4, 1, 1, none)).toEqual({ x: 3, z: 4 })
  })
})
