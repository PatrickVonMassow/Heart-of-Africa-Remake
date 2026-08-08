// Spawn-freedom helpers (point 155): an inhabitant spawn/target point is usable
// only if the mover fits there AND can leave — no fully enclosed pockets formed
// by stall boards, rocks and walls. The helpers are pure, so they are pinned
// here; the layout sweep in layout.test.ts asserts the real errand points pass.
import { describe, expect, it } from 'vitest'
import {
  boxCollider,
  hasEscapeDirection,
  nudgeToFree,
  nudgeWhere,
  resolveMove,
  spawnPointFree,
  standingClear,
  tryNudgeToFree,
  WALKER_RADIUS,
  type Collider,
} from './collision'

const R = WALKER_RADIUS

// A ring of circles around the origin. TIGHT (ringR 0.85, r 0.5): the mover
// fits at the centre (0.85 > 0.5 + R) but every step of 2·R lands inside a
// circle — fully enclosed. LOOSE (ringR 1.5, r 0.4): the mover fits and a step
// out lands clear — an escape exists.
function ring(ringR: number, r: number, n = 8): Collider[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return { x: Math.cos(a) * ringR, z: Math.sin(a) * ringR, r }
  })
}
const tightRing = () => ring(0.85, 0.5)
const looseRing = () => ring(1.5, 0.4)

describe('standingClear (point 155 — the mover fits)', () => {
  it('is true in open space and false when a collider overlaps', () => {
    expect(standingClear([], 0, 0, R)).toBe(true)
    expect(standingClear([{ x: 0, z: 0, r: 1 }], 0, 0, R)).toBe(false)
    expect(standingClear([{ x: 5, z: 5, r: 1 }], 0, 0, R)).toBe(true)
    // Just touching the edge (distance === r + radius) does not overlap.
    expect(standingClear([{ x: 1 + R, z: 0, r: 1 }], 0, 0, R)).toBe(true)
    expect(standingClear([{ x: 1 + R - 0.05, z: 0, r: 1 }], 0, 0, R)).toBe(false)
  })

  it('respects oriented box colliders', () => {
    const box = boxCollider(0, 0, 1, 1, 0)
    expect(standingClear([box], 0, 0, R)).toBe(false)
    expect(standingClear([box], 3, 0, R)).toBe(true)
  })
})

describe('hasEscapeDirection (point 155 — the mover can leave)', () => {
  it('is true in open space', () => {
    expect(hasEscapeDirection([], 0, 0, R, R * 2)).toBe(true)
  })

  it('is false when a tight ring fully encloses the point', () => {
    expect(hasEscapeDirection(tightRing(), 0, 0, R, R * 2)).toBe(false)
  })

  it('is true when the ring is loose enough to step out of', () => {
    expect(hasEscapeDirection(looseRing(), 0, 0, R, R * 2)).toBe(true)
  })
})

describe('spawnPointFree (point 155)', () => {
  it('needs both a clear circle and an escape', () => {
    expect(spawnPointFree([], 0, 0, R)).toBe(true)
    // Enclosed pocket: the centre is clear but there is no way out.
    const pocket = tightRing()
    expect(standingClear(pocket, 0, 0, R)).toBe(true)
    expect(spawnPointFree(pocket, 0, 0, R)).toBe(false)
  })
})

describe('nudgeToFree (point 155 — relocate to the nearest usable spot)', () => {
  it('keeps a point that is already free', () => {
    expect(nudgeToFree([], 2, 3, R)).toEqual([2, 3])
  })

  it('moves a pocketed point to a spawn-free spot', () => {
    const pocket = tightRing()
    const [x, z] = nudgeToFree(pocket, 0, 0, R)
    expect(x === 0 && z === 0).toBe(false) // it moved
    expect(spawnPointFree(pocket, x, z, R)).toBe(true) // and the result is usable
  })

  it('moves a point sitting inside a solid collider out to free ground', () => {
    const box = [boxCollider(0, 0, 1.5, 1.5, 0)]
    const [x, z] = nudgeToFree(box, 0, 0, R)
    expect(spawnPointFree(box, x, z, R)).toBe(true)
  })
})

describe('tryNudgeToFree (point 198 — report whether a free spot was actually found)', () => {
  it('reports found=true for an already-free point and keeps it', () => {
    const r = tryNudgeToFree([], 2, 3, R)
    expect(r.found).toBe(true)
    expect(r.pos).toEqual([2, 3])
  })

  it('reports found=true and a usable spot when it can escape a pocket', () => {
    const pocket = tightRing()
    const r = tryNudgeToFree(pocket, 0, 0, R)
    expect(r.found).toBe(true)
    expect(spawnPointFree(pocket, r.pos[0], r.pos[1], R)).toBe(true)
  })

  it('reports found=false and falls back to the original when no free spot exists in range', () => {
    // A wide solid box swallows every ring the spiral can reach: no free spot,
    // so the caller must NOT treat the (unchanged) position as a relocation.
    const wall = [boxCollider(0, 0, 20, 20, 0)]
    const r = tryNudgeToFree(wall, 0, 0, R)
    expect(r.found).toBe(false)
    expect(r.pos).toEqual([0, 0])
  })

  it('reports found=false when the search is given no rings and the point is blocked', () => {
    const r = tryNudgeToFree([{ x: 0, z: 0, r: 1 }], 0, 0, R, undefined, 0)
    expect(r.found).toBe(false)
    expect(r.pos).toEqual([0, 0])
  })
})

// --- Fence panels and the swept move (point 413) -----------------------------
// The reported defect: a goat walked THROUGH a compound fence, and where it did
// not it "changed direction abruptly". Two causes stacked — the collider was a
// row of post circles where the picture draws a continuous wall, and the resolve
// was a position test that a long enough step simply steps over.

describe('segment collider — a panel, not a dot (point 413)', () => {
  // A woven panel between two posts 0.9 apart, the spacing a fence ring uses.
  const panel: Collider = { kind: 'segment', x1: -0.45, z1: 0, x2: 0.45, z2: 0, r: 0.42 }

  it('blocks the whole run between the posts, midpoint included', () => {
    for (let x = -0.45; x <= 0.451; x += 0.05) {
      expect(standingClear([panel], x, 0, R), `x=${x.toFixed(2)}`).toBe(false)
    }
  })

  it('is clear beyond the panel band and at its ends', () => {
    expect(standingClear([panel], 0, 0.42 + R + 0.01, R)).toBe(true)
    expect(standingClear([panel], 0.45 + 0.42 + R + 0.01, 0, R)).toBe(true)
  })

  it('pushes out along the WALL normal, not sideways along a post radius', () => {
    // Standing just inside the panel at its midpoint: the correction must be
    // perpendicular to the panel (the abrupt sideways jerk was the old
    // post-circle radius, which at the midpoint points along the wall).
    const [x, z] = resolveMove([panel], 0, 0.1, R)
    expect(x).toBeCloseTo(0, 6)
    expect(z).toBeCloseTo(0.42 + R, 6)
  })

  it('leaves a mover exactly on the axis on a deterministic side', () => {
    const a = resolveMove([panel], 0, 0, R)
    const b = resolveMove([panel], 0, 0, R)
    expect(a).toEqual(b)
    expect(standingClear([panel], a[0], a[1], R)).toBe(true)
  })
})

describe('resolveMove swept from the previous position (point 413)', () => {
  const panel: Collider = { kind: 'segment', x1: -3, z1: 0, x2: 3, z2: 0, r: 0.42 }
  const band = 0.42 + R

  it('stops a step that crosses a fence panel — the un-swept call walks through it', () => {
    // A single frame carrying the mover from one side to the other.
    const swept = resolveMove([panel], 0, 2, R, [0, -2])
    expect(swept[1]).toBeLessThan(0) // still on the near side
    expect(swept[1]).toBeCloseTo(-band, 2) // and standing against the wall
    // The old behaviour, kept for spawns/teleports: the far side, overlapping
    // nothing — this is exactly the goat-through-the-fence case.
    expect(resolveMove([panel], 0, 2, R)[1]).toBe(2)
  })

  it('stops a step of ten collider widths at the NEAR edge', () => {
    const wall: Collider = { x: 0, z: 0, r: 0.42 }
    const width = 2 * wall.r
    const [x, z] = resolveMove([wall], 0, 0, R, [0, -width * 10])
    expect(z).toBeLessThan(0)
    expect(Math.hypot(x, z)).toBeCloseTo(wall.r + R, 3)
  })

  it('truncates a move longer than one sweep budget instead of tunnelling it', () => {
    // A move no walker makes (60 m in a frame) is cut short at the budget, not
    // handed to the position test — a truncated walk is a frame late, a
    // tunnelled one is through the wall.
    const [, z] = resolveMove([], 0, 50, R, [0, -10])
    expect(z).toBeGreaterThan(-10)
    expect(z).toBeLessThan(50)
  })

  it('never lands on the far side, whatever the step length', () => {
    for (const from of [-0.5, -1, -2, -5, -20]) {
      const [, z] = resolveMove([panel], 0, Math.abs(from), R, [0, from])
      expect(z, `from z=${from}`).toBeLessThan(0)
    }
  })

  it('still slides along a wall instead of stopping dead', () => {
    // Pushing diagonally into the panel: the along-wall component survives.
    const [x, z] = resolveMove([panel], 1, 0.5, R, [0, -0.9])
    expect(x).toBeGreaterThan(0.4)
    expect(z).toBeLessThan(0)
    expect(standingClear([panel], x, z, R)).toBe(true)
  })

  it('still pushes an inhabitant standing inside an overlap out (no regression)', () => {
    const rock: Collider = { x: 0, z: 0, r: 1 }
    // Same spot in and out: the mover starts inside and must still be freed.
    const [x, z] = resolveMove([rock], 0.1, 0, R, [0.1, 0])
    expect(Math.hypot(x, z)).toBeCloseTo(1 + R, 6)
    expect(standingClear([rock], x, z, R)).toBe(true)
  })

  it('reaches the target untouched when the path is clear', () => {
    const [x, z] = resolveMove([panel], 4, -1, R, [-4, -1])
    expect(x).toBeCloseTo(4, 6)
    expect(z).toBeCloseTo(-1, 6)
  })

  it('resolves a zero-length move exactly like the position test', () => {
    const rock: Collider = { x: 0, z: 0, r: 1 }
    expect(resolveMove([rock], 0.2, 0.2, R, [0.2, 0.2])).toEqual(resolveMove([rock], 0.2, 0.2, R))
  })

  it('goes through a gate the panels leave open', () => {
    // Two panels with a 3 m opening between them: the swept move must pass.
    const left: Collider = { kind: 'segment', x1: -6, z1: 0, x2: -1.5, z2: 0, r: 0.42 }
    const right: Collider = { kind: 'segment', x1: 1.5, z1: 0, x2: 6, z2: 0, r: 0.42 }
    const [x, z] = resolveMove([left, right], 0, 2, R, [0, -2])
    expect(z).toBeCloseTo(2, 6)
    expect(x).toBeCloseTo(0, 6)
  })
})

// The caller's OWN free ground (point 524): the children's play ground is a
// disc, and a nudge that only escaped the huts teleported a child out of it.
describe('nudgeWhere — the nearest spot the CALLER calls free', () => {
  const disc = (x: number, z: number) => Math.hypot(x, z) <= 5

  it('keeps a point the caller already accepts', () => {
    expect(nudgeWhere(1, 1, disc)).toEqual({ pos: [1, 1], found: true })
  })

  it('finds the nearest accepted point and never returns one outside the rule', () => {
    // Standing 2 m outside the disc: the answer is back inside it, and close.
    const r = nudgeWhere(7, 0, disc)
    expect(r.found).toBe(true)
    expect(disc(r.pos[0], r.pos[1])).toBe(true)
    expect(Math.hypot(r.pos[0] - 7, r.pos[1])).toBeLessThan(3)
  })

  it('honours a rule made of two conditions at once', () => {
    const rock: Collider = { x: 4, z: 0, r: 1.2 }
    const accept = (x: number, z: number) => disc(x, z) && standingClear([rock], x, z, R)
    const r = nudgeWhere(4, 0, accept)
    expect(r.found).toBe(true)
    expect(accept(r.pos[0], r.pos[1])).toBe(true)
  })

  it('reports a rule nothing satisfies instead of inventing a spot', () => {
    const r = nudgeWhere(0, 0, () => false, 0.6, 3)
    expect(r).toEqual({ pos: [0, 0], found: false })
  })

  it('is deterministic — the same pinned child is freed to the same spot', () => {
    expect(nudgeWhere(7, 0, disc)).toEqual(nudgeWhere(7, 0, disc))
  })
})
