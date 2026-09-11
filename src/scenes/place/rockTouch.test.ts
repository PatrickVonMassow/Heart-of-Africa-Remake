// THE HAND ON THE STONE (work-order 1065, PART A).
//
// The user's report was that a child names a rock while standing a metre off
// it, so what is asserted here is CONTACT — measured through the same hand
// chain the renderer draws, against the flank the scene actually instances, on
// both play rocks of all three river villages.

import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { FIGURE_LIMBS, CHILD_FIGURE_SCALE } from '../../render/figures'
import { gaitBodyLift } from '../../render/fauna'
import { TOUCH_LEAN } from '../../render/gesture'
import { reachFrom, solveTouch, touchedPoint } from './rockTouch'
import { playRockFlank } from './playRockSurface'
import { buildLayout } from './layout'
import { WALKER_RADIUS, standingClear } from './collision'
import { bankChildBodyLift, createBankGame, rockAt, touchReach, touchStand, TOUCH_GAP, type BankEnd, type BankStage } from './bankGame'

const RIVER_VILLAGES = ['nubian-village', 'bambara-village', 'mandinka-village']
const ENDS: BankEnd[] = ['upstream', 'downstream']
const HAND = FIGURE_LIMBS.handRadius * CHILD_FIGURE_SCALE

/** The children's stage as `PlaceLife` builds it, for one settlement. */
function stageOf(id: string): { stage: BankStage; layout: ReturnType<typeof buildLayout> } {
  const layout = buildLayout(id, 42)
  const rocks = layout.playRocks!
  const stage: BankStage = {
    upstream: rocks.upstream,
    downstream: rocks.downstream,
    flank: playRockFlank(rocks),
    water: { x: 0, z: 0 },
    // No part of this check — the climb has its own (work-order 1080).
    boulder: { x: 0, z: 0, radius: 1, height: 1 },
    roam: { x: 0, z: 0, radius: 1 },
  }
  return { stage, layout }
}

describe('the reach a figure has to a drawn flank', () => {
  /** A stone 1.2 m at its widest and widest at 0.9 m up — the shape that made
   *  the old collider wrong. */
  const flank = (y: number) => {
    const t = (y - 0.9) / 1.05
    return t <= -1 || t >= 1 ? 0 : 1.2 * Math.sqrt(1 - t * t)
  }

  it('puts the hand ON the surface at the stand it solves', () => {
    const solved = solveTouch(flank, CHILD_FIGURE_SCALE)!
    expect(solved).not.toBeNull()
    const at = touchedPoint(solved.stand, solved.elevation, CHILD_FIGURE_SCALE)
    expect(at.radius - HAND).toBeCloseTo(flank(at.height), 6)
    expect(at.height).toBeCloseTo(solved.height, 9)
  })

  it('takes the FURTHEST stand that still touches, so the body stays out of the stone', () => {
    const solved = solveTouch(flank, CHILD_FIGURE_SCALE)!
    const nearer = reachFrom(solved.stand - 0.1, flank, CHILD_FIGURE_SCALE)!
    // A nearer stand still reaches (the arm simply folds), which is what makes
    // the far end the one worth taking.
    expect(Math.abs(nearer.gap)).toBeLessThan(TOUCH_GAP)
    // ...and a further one does not reach at all.
    const further = reachFrom(solved.stand + 0.1, flank, CHILD_FIGURE_SCALE)!
    expect(further.gap).toBeGreaterThan(TOUCH_GAP)
  })

  it('reaches HIGHER than the shoulder, because the stone is taller than the child', () => {
    const solved = solveTouch(flank, CHILD_FIGURE_SCALE)!
    expect(solved.elevation).toBeGreaterThan(0.3)
    expect(solved.height).toBeGreaterThan(FIGURE_LIMBS.shoulderY * CHILD_FIGURE_SCALE)
  })

  it('follows the stone: a wider one is touched from further out', () => {
    const wide = solveTouch((y) => flank(y) * 1.25, CHILD_FIGURE_SCALE)!
    const narrow = solveTouch((y) => flank(y) * 0.75, CHILD_FIGURE_SCALE)!
    expect(wide.stand).toBeGreaterThan(narrow.stand + 0.4)
  })

  it('reports no reach at all for a surface out of the figure`s range', () => {
    expect(solveTouch(() => 0, CHILD_FIGURE_SCALE)).toBeNull()
  })

  it('solves through the trunk`s lean, not past it', () => {
    const leaning = solveTouch(flank, CHILD_FIGURE_SCALE, FIGURE_LIMBS.hipY, TOUCH_LEAN)!
    const upright = solveTouch(flank, CHILD_FIGURE_SCALE, FIGURE_LIMBS.hipY, 0)!
    expect(leaning.stand).toBeGreaterThan(upright.stand)
  })
})

describe('the tapping child reaches the stone it names, in every river village', () => {
  for (const id of RIVER_VILLAGES) {
    for (const end of ENDS) {
      it(`${id}: the ${end} rock is touched, and from ground a child may stand on`, () => {
        const { stage, layout } = stageOf(id)
        // The walk obeys the settlement's colliders, so the goal is solved
        // against them: a spot inside one is a goal the walk deflects round.
        const blocked = (x: number, z: number) => !standingClear(layout.colliders, x, z, WALKER_RADIUS)
        const spot = touchStand(stage, end, blocked)
        expect(spot, `${id}/${end} has no touch spot`).not.toBeNull()
        if (!spot) return

        // THE HAND IS ON THE DRAWN FLANK — measured from the spot, through the
        // renderer's own hand chain, against the mesh's own silhouette.
        const reach = touchReach(stage, end, spot)!
        expect(Math.abs(reach.gap)).toBeLessThanOrEqual(TOUCH_GAP)

        // AND IT IS GROUND THE CHILD MAY ACTUALLY STAND ON: the walk that takes
        // it there obeys the settlement's colliders, so a touch spot inside one
        // would never be reached and the tap would fall silent forever.
        expect(blocked(spot.x, spot.z)).toBe(false)

        // ...and it is a long way nearer than the waiting station it used to be
        // spoken from: the defect was a hand more than a metre off its object.
        const rock = rockAt(stage, end)
        const stand = Math.hypot(spot.x - rock.x, spot.z - rock.z)
        expect(stand).toBeLessThan(1.5)
        expect(stand - reach.gap).toBeGreaterThan(1)
      })
    }
  }

  it('is solved at the height the renderer DRAWS the body at, dip included', () => {
    // WHY THIS TEST EXISTS. The reach is solved in the figure's own frame, so it
    // silently assumes the renderer draws the body at ground level. It does not
    // while the gait is mid-step: `PlaceLife` carries every child at
    // `gaitBodyLift`, and a gait driven by distance walked freezes wherever the
    // walk ended. The play rock NARROWS towards its foot, so a hand drawn lower
    // than it was solved meets a thinner stone and misses it — the LARGE run of
    // 08.09.2026 measured 6.9 cm on a 6 cm tolerance, and this is the arithmetic
    // behind it. `restingPhase` removes the dip (`fauna.test.ts`); this pins the
    // COST of it coming back.
    const legLength = FIGURE_LIMBS.hipY * CHILD_FIGURE_SCALE
    let dip = 0
    for (let k = 0; k < 400; k++) dip = Math.min(dip, gaitBodyLift((k / 400) * 2 * Math.PI, legLength))
    expect(dip).toBeLessThan(-0.02) // a real height, not a rounding error

    let worst = 0
    for (const id of RIVER_VILLAGES) {
      const { stage } = stageOf(id)
      for (const end of ENDS) {
        const spot = touchStand(stage, end)
        if (!spot) continue
        const rock = rockAt(stage, end)
        const bearing = Math.atan2(spot.x - rock.x, spot.z - rock.z)
        const reach = touchReach(stage, end, spot)!
        const flankAt = (y: number) => stage.flank(end, bearing, y)
        // The same hand, drawn `dip` lower: the flank it meets is the thinner one.
        worst = Math.max(worst, reach.gap + (flankAt(reach.height) - flankAt(reach.height + dip)))
      }
    }
    // Over the 6 cm the browser allows — so a stopped child left mid-step CANNOT
    // pass the picture check, and this number is why the settling is not cosmetic.
    expect(worst).toBeGreaterThan(0.06)
  })

  it('solves arrivals from their own bearings on both Bambara flanks, respecting blocked ground', () => {
    const { stage, layout } = stageOf('bambara-village')
    const blocked = (x: number, z: number) => !standingClear(layout.colliders, x, z, WALKER_RADIUS)
    let reached = 0
    for (const end of ENDS) {
      for (let k = 0; k < 24; k++) {
        const bearing = k / 24 * Math.PI * 2
        const stand = touchStand(stage, end, blocked, bearing)
        if (!stand) continue
        reached++
        expect(stand.bearing).toBe(bearing)
        expect(blocked(stand.x, stand.z)).toBe(false)
        const reach = touchReach(stage, end, stand)!
        expect(Math.abs(reach.gap)).toBeLessThanOrEqual(TOUCH_GAP)
        // Check the hand's own bearing too: it hangs to one side of the body.
        const point = touchedPoint(Math.hypot(stand.x - rockAt(stage, end).x, stand.z - rockAt(stage, end).z), reach.elevation, CHILD_FIGURE_SCALE)
        const handBearing = bearing + Math.atan2(-point.offAxis, Math.sqrt(point.radius ** 2 - point.offAxis ** 2))
        expect(Math.abs(point.radius - HAND - stage.flank(end, handBearing, point.height))).toBeLessThanOrEqual(0.06)
      }
    }
    expect(reached).toBeGreaterThan(12)
    expect(touchStand(stage, 'downstream', () => true, 0.7)).toBeNull()
  })

  it('draws an arriving touch at its solved height from the opening frame, regardless of the last stride', () => {
    const cfg = { ...balance.villageLife.tag, ...balance.villageLife.bankGame }
    const { stage } = stageOf('bambara-village')
    const stand = touchStand(stage, 'downstream')!
    const c = createBankGame([stand], () => 0.5, cfg).children[0]
    const reach = touchReach(stage, 'downstream', c)!
    const rock = rockAt(stage, 'downstream')
    const bearing = Math.atan2(c.x - rock.x, c.z - rock.z)
    c.arrival = { end: 'downstream', stand, approachFor: 0, holdFor: cfg.arrivalHoldSeconds }
    const hand = touchedPoint(Math.hypot(c.x - rock.x, c.z - rock.z), reach.elevation, CHILD_FIGURE_SCALE)
    for (let k = 0; k < 100; k++) {
      const dip = gaitBodyLift(k / 100 * Math.PI * 2, FIGURE_LIMBS.hipY * CHILD_FIGURE_SCALE)
      const lift = bankChildBodyLift(c, dip)
      const gap = hand.radius - HAND - stage.flank('downstream', bearing, hand.height + lift)
      expect(Math.abs(gap)).toBeLessThanOrEqual(TOUCH_GAP)
    }
    c.arrival = null
    c.lift = 0.5
    expect(bankChildBodyLift(c, -0.03)).toBeCloseTo(0.47)
  })

  it('does NOT reach from the waiting station the tap used to be spoken from', () => {
    const { stage } = stageOf('nubian-village')
    const rock = rockAt(stage, 'upstream')
    // `standOff` is 2.6 m; anywhere out there the hand is short of the stone by
    // more than a metre, which is exactly what the user reported seeing.
    const away = { x: rock.x + 2.6, z: rock.z }
    const reach = touchReach(stage, 'upstream', away)!
    expect(reach.gap).toBeGreaterThan(1)
  })
})
