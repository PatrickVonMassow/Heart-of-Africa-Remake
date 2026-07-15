// Pure movement logic (CLAUDE.md §7.1 pt. 4/20, design.md §11/§2). Ported from
// the window.__movement dev-hook asserts of scripts/verify/enrichments.mjs and
// scripts/verify/settings.mjs — same coverage, no browser.
import { describe, it, expect } from 'vitest'
import { movementPenalty, placeWalkVelocity, pushOutOfCircles, resolveTravelMove } from './movement'

describe('movementPenalty', () => {
  it('jungle without a machete slows the traveller', () => {
    expect(movementPenalty('jungle', {})).toBe('jungle')
    expect(movementPenalty('jungle', { machete: 1 })).toBeNull()
  })

  it('water and ocean without a canoe slow the traveller', () => {
    expect(movementPenalty('water', {})).toBe('water')
    expect(movementPenalty('ocean', {})).toBe('water')
    expect(movementPenalty('water', { canoe: 1 })).toBeNull()
  })

  it('mountain without a rope slows the traveller', () => {
    expect(movementPenalty('mountain', {})).toBe('mountain')
    expect(movementPenalty('mountain', { rope: 1 })).toBeNull()
  })

  it('carrying the canoe is a penalty on every land type', () => {
    expect(movementPenalty('savanna', { canoe: 1 })).toBe('canoeOnLand')
    expect(movementPenalty('desert', { canoe: 1 })).toBe('canoeOnLand')
    expect(movementPenalty('jungle', { canoe: 1, machete: 1 })).toBe('canoeOnLand')
    expect(movementPenalty('mountain', { canoe: 1, rope: 1 })).toBe('canoeOnLand')
  })

  it('the more urgent missing-relief-item penalty wins over the canoe malus', () => {
    // Jungle without a machete but with the canoe: the jungle hint comes first.
    expect(movementPenalty('jungle', { canoe: 1 })).toBe('jungle')
  })

  it('nothing slows an equipped traveller on open savanna', () => {
    expect(movementPenalty('savanna', {})).toBeNull()
    expect(movementPenalty('savanna', { machete: 1, rope: 1 })).toBeNull()
  })
})

describe('placeWalkVelocity', () => {
  const SPEED = 10
  const FACTOR = 0.8

  it('walks forward at full speed', () => {
    expect(placeWalkVelocity(1, 0, SPEED, FACTOR)).toEqual([10, 0])
  })

  it('walks backward and strafes at the strafe factor', () => {
    expect(placeWalkVelocity(-1, 0, SPEED, FACTOR)).toEqual([-8, 0])
    expect(placeWalkVelocity(0, 1, SPEED, FACTOR)).toEqual([0, 8])
    expect(placeWalkVelocity(0, -1, SPEED, FACTOR)).toEqual([0, -8])
  })

  it('normalizes so a diagonal is never faster than a straight walk', () => {
    const [along, side] = placeWalkVelocity(1, 1, SPEED, FACTOR)
    expect(Math.hypot(along, side)).toBeLessThanOrEqual(SPEED + 1e-9)
    // Forward component keeps full weight, sideways is scaled by the factor.
    expect(along).toBeCloseTo((1 / Math.SQRT2) * SPEED, 6)
    expect(side).toBeCloseTo((1 / Math.SQRT2) * SPEED * FACTOR, 6)
  })

  it('is still when there is no input', () => {
    expect(placeWalkVelocity(0, 0, SPEED, FACTOR)).toEqual([0, 0])
  })
})

describe('pushOutOfCircles (bird-eye tree/animal collision, design.md §19)', () => {
  const dist = (a: [number, number], ox: number, oz: number) => Math.hypot(a[0] - ox, a[1] - oz)

  it('leaves a point outside every obstacle untouched', () => {
    expect(pushOutOfCircles(0, 0, [[5, 0, 1]], 0.5)).toEqual([0, 0])
  })

  it('pushes a point that overlaps an obstacle out to just clear of it', () => {
    // Player at (0.8,0), tree at origin r=1, self r=0.5 → must end ≥ 1.5 away.
    const p = pushOutOfCircles(0.8, 0, [[0, 0, 1]], 0.5)
    expect(dist(p, 0, 0)).toBeCloseTo(1.5, 5)
    expect(p[0]).toBeGreaterThan(0.8) // pushed along the away direction (+x)
  })

  it('clears the one obstacle it overlaps while staying clear of a far one', () => {
    // Overlaps the near obstacle at (1,0); the one at (6,0) is out of range.
    const p = pushOutOfCircles(1, 0, [[0, 0, 1], [6, 0, 1]], 0.5)
    expect(dist(p, 0, 0)).toBeCloseTo(1.5, 5) // pushed clear of the near one
    expect(dist(p, 6, 0)).toBeGreaterThan(1.5) // never dragged toward the far one
  })

  it('parts coincident points instead of dividing by zero', () => {
    const p = pushOutOfCircles(3, 3, [[3, 3, 1]], 0.5)
    expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
    expect(p).not.toEqual([3, 3])
  })
})

describe('resolveTravelMove (swept tree/animal collision, design.md §19)', () => {
  const dist = (a: [number, number], ox: number, oz: number) => Math.hypot(a[0] - ox, a[1] - oz)

  it('leaves a move that stays clear untouched', () => {
    expect(resolveTravelMove(0, 0, 0.5, 0, [[5, 0, 1]], 0.5)).toEqual([0.5, 0])
  })

  it('clamps a step that enters an obstacle to its near boundary', () => {
    // From x=-2 heading to x=-0.5 into a tree at origin (r1, self0.5 → minD 1.5).
    const p = resolveTravelMove(-2, 0, -0.5, 0, [[0, 0, 1]], 0.5)
    expect(dist(p, 0, 0)).toBeCloseTo(1.5, 5) // stopped at the boundary, not inside
  })

  it('does not let a fast step tunnel through and pop out the far side', () => {
    // A big step from far west to far east straight through the obstacle: must be
    // clamped to the NEAR (west) boundary, never end up east of the obstacle.
    const p = resolveTravelMove(-3, 0, 3, 0, [[0, 0, 1]], 0.5)
    expect(dist(p, 0, 0)).toBeCloseTo(1.5, 5)
    expect(p[0]).toBeLessThan(0) // still on the near (west) side — did not pass through
  })

  it('pushes a point already resting inside an obstacle out to the boundary', () => {
    const p = resolveTravelMove(0.2, 0, 0.2, 0, [[0, 0, 1]], 0.5)
    expect(dist(p, 0, 0)).toBeCloseTo(1.5, 5)
  })

  it('slides along an obstacle approached off-centre (keeps a lateral component)', () => {
    // Heading east but offset north: clamped short in x, keeping the z offset so
    // the traveller can round the obstacle over following frames.
    const p = resolveTravelMove(-2, 0.6, 0, 0.6, [[0, 0, 1]], 0.5)
    expect(dist(p, 0, 0)).toBeGreaterThanOrEqual(1.5 - 1e-6) // never inside the body
  })

  // Regression for the collision blocker: once the traveller rested against a
  // tree, the resolver clamped *every* subsequent move back to the boundary —
  // including moves leading away — so steering died on first contact. A step
  // that leads away from (or slides tangent to) an obstacle must stay free.
  it('does not pin a traveller that steers straight away from a touched obstacle', () => {
    // Resting on the west boundary (x=-1.5, minD 1.5), heading further west.
    const p = resolveTravelMove(-1.5, 0, -2, 0, [[0, 0, 1]], 0.5)
    expect(p[0]).toBeCloseTo(-2, 6) // free to leave — not pinned at -1.5
    expect(p[1]).toBeCloseTo(0, 6)
  })

  it('lets a traveller slide tangentially along an obstacle it rests against', () => {
    // On the west boundary, pushing due north (tangent): the tangent line stays
    // outside the body, so the full lateral move is kept.
    const p = resolveTravelMove(-1.5, 0, -1.5, 0.5, [[0, 0, 1]], 0.5)
    expect(p[0]).toBeCloseTo(-1.5, 6)
    expect(p[1]).toBeCloseTo(0.5, 6)
  })

  it('keeps an away-and-sideways escape from a resting contact free', () => {
    // Diagonally away from the boundary: the whole path is outside the body.
    const p = resolveTravelMove(-1.5, 0, -2, 0.5, [[0, 0, 1]], 0.5)
    expect(p[0]).toBeCloseTo(-2, 6)
    expect(p[1]).toBeCloseTo(0.5, 6)
  })

  it('still blocks a re-entry attempt from the boundary (into the body)', () => {
    // Resting on the west boundary, pushing east *into* the tree: stays clamped.
    const p = resolveTravelMove(-1.5, 0, -1.2, 0, [[0, 0, 1]], 0.5)
    expect(dist(p, 0, 0)).toBeGreaterThanOrEqual(1.5 - 1e-6)
  })

  it('frees a traveller pinned in the lens between two overlapping obstacles (point 113)', () => {
    // Two trees whose collision bodies overlap; the traveller starts inside the
    // lens where each one's radial push-out points opposite the other's. A hard
    // clamp swallowed the escape direction and trapped him on the axis; sliding
    // keeps the tangential motion, so steering out (here: north) walks him clear.
    const A: [number, number, number] = [0, 0, 0.6]
    const B: [number, number, number] = [1.5, 0, 0.6]
    const obs = [A, B]
    let px = 0.75
    let pz = 0.1
    for (let s = 0; s < 40; s++) {
      ;[px, pz] = resolveTravelMove(px, pz, px, pz + 0.15, obs, 0.4)
    }
    expect(dist([px, pz], A[0], A[1])).toBeGreaterThanOrEqual(0.6 + 0.4 - 0.02)
    expect(dist([px, pz], B[0], B[1])).toBeGreaterThanOrEqual(0.6 + 0.4 - 0.02)
  })

  // Property sweep: for a dense grid of start angles/distances and step
  // directions/lengths around one obstacle, the resolved position is never
  // inside the body, never NaN, and a step pointing strictly away from a
  // resting contact is never shortened.
  it('never resolves inside the body and never yields NaN (dense sweep)', () => {
    const OB: [number, number, number] = [0, 0, 1]
    const MIND = 1.5
    for (let ai = 0; ai < 16; ai++) {
      const ang = (ai / 16) * Math.PI * 2
      for (const d0 of [0, 0.4, 1.2, MIND, 1.6, 3]) {
        const ox = Math.cos(ang) * d0
        const oz = Math.sin(ang) * d0
        for (let mi = 0; mi < 16; mi++) {
          const ma = (mi / 16) * Math.PI * 2
          for (const step of [0.05, 0.5, 2, 6]) {
            const p = resolveTravelMove(ox, oz, ox + Math.cos(ma) * step, oz + Math.sin(ma) * step, [OB], 0.5)
            expect(Number.isFinite(p[0]) && Number.isFinite(p[1])).toBe(true)
            expect(dist(p, 0, 0)).toBeGreaterThanOrEqual(MIND - 1e-6)
          }
        }
      }
    }
  })

  it('a step pointing strictly outward from a resting contact is never shortened', () => {
    const OB: [number, number, number] = [0, 0, 1]
    const MIND = 1.5
    for (let ai = 0; ai < 24; ai++) {
      const ang = (ai / 24) * Math.PI * 2
      const ox = Math.cos(ang) * MIND
      const oz = Math.sin(ang) * MIND
      const tx = ox + Math.cos(ang) * 0.8 // straight away along the contact normal
      const tz = oz + Math.sin(ang) * 0.8
      const p = resolveTravelMove(ox, oz, tx, tz, [OB], 0.5)
      expect(p[0]).toBeCloseTo(tx, 6)
      expect(p[1]).toBeCloseTo(tz, 6)
    }
  })

  // Multi-frame steering simulations — the shape of the real game loop: many
  // small resolved steps in sequence. These would have caught the collision
  // blocker (steering died after first contact) directly.
  const simulate = (
    start: [number, number],
    dir: () => [number, number],
    frames: number,
    obstacles: ReadonlyArray<readonly [number, number, number]>,
  ) => {
    let [x, z] = start
    for (let i = 0; i < frames; i++) {
      const [dx, dz] = dir()
      ;[x, z] = resolveTravelMove(x, z, x + dx, z + dz, obstacles, 0.5)
    }
    return [x, z] as [number, number]
  }

  it('driving into a tree then reversing frees the traveller (frame sequence)', () => {
    const OB: [number, number, number] = [0, 0, 1]
    // 30 frames east into the tree…
    let pos = simulate([-3, 0], () => [0.15, 0], 30, [OB])
    expect(dist(pos, 0, 0)).toBeCloseTo(1.5, 5) // resting on the boundary
    // …then 30 frames west again: must travel the full distance back out.
    pos = simulate(pos, () => [-0.15, 0], 30, [OB])
    expect(pos[0]).toBeLessThan(-5)
  })

  it('holding a diagonal against a tree rounds it instead of sticking (slide)', () => {
    const OB: [number, number, number] = [0, 0, 1]
    // Aim northeast while the tree blocks east: the traveller should slip past
    // on the north side and end up well east of the obstacle.
    const pos = simulate([-3, -0.2], () => [0.12, 0.09], 80, [OB])
    expect(pos[0]).toBeGreaterThan(1.5) // made it past
    expect(dist(pos, 0, 0)).toBeGreaterThanOrEqual(1.5 - 1e-6)
  })

  it('escapes a two-tree pocket by reversing out (no permanent trap)', () => {
    const OBS: ReadonlyArray<readonly [number, number, number]> = [[0, 1.2, 1], [0, -1.2, 1]]
    // Drive east into the gap (too narrow for the 0.5 body), then back west.
    let pos = simulate([-4, 0], () => [0.15, 0], 40, OBS)
    for (const [ox, oz, r] of OBS) expect(dist(pos, ox, oz)).toBeGreaterThanOrEqual(r + 0.5 - 1e-6)
    pos = simulate(pos, () => [-0.15, 0], 40, OBS)
    expect(pos[0]).toBeLessThan(-4.5)
  })

  it('an obstacle dropped onto the traveller does not trap him (animal steps in)', () => {
    // Start dead-centre inside the body (an animal moved onto the resting
    // traveller between frames), then walk east: within a few frames he is out
    // and moving freely.
    const OB: [number, number, number] = [0, 0, 1]
    const pos = simulate([0, 0], () => [0.15, 0], 40, [OB])
    expect(dist(pos, 0, 0)).toBeGreaterThanOrEqual(1.5 - 1e-6)
    expect(pos[0]).toBeGreaterThan(3) // kept travelling after parting from it
  })
})
