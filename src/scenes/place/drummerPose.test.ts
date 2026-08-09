// The one cheap check that would have caught point 576: the drummer's hands
// beat ON the skins, and each on the drum it stands over. Both defects were
// pure geometry — the swing arc lay below the heads and the two arms were
// swapped — so both are measurable without a browser.

import { describe, expect, it } from 'vitest'
import {
  DRUMMER_LEAN,
  DRUM_HEAD_DIP,
  DRUM_STROKE_CLEARANCE,
  HIGH_DRUM,
  LOW_DRUM,
  drumHandPoint,
  drumHandPose,
  drumHeadTop,
  drumHeadY,
  drumStroke,
  type DrumGeometry,
} from './drummerPose'
import { FIGURE_LIMBS } from '../../render/figures'
import { armDirection } from '../../render/gesture'

const DRUMS: ReadonlyArray<[string, DrumGeometry]> = [
  ['the large low drum', LOW_DRUM],
  ['the small high drum', HIGH_DRUM],
]

/** The hand centre the FIGURE actually draws for a pose: shoulder plus the
 *  posed arm (`armDirection`, the render module's own), then the trunk's lean
 *  about the hip — the drummer stands with no legs, so the hip pivot is the
 *  ground and the lean carries the whole upper body. Built from the render
 *  primitives rather than from `handAt`, so the module cannot pass by agreeing
 *  with itself. */
function drawnHand(drum: DrumGeometry, swing: number): [number, number, number] {
  const stroke = drumStroke(drum)
  const dir = armDirection(drumHandPose(stroke, swing))
  const shoulderX = stroke.side === 'left' ? FIGURE_LIMBS.shoulderX : -FIGURE_LIMBS.shoulderX
  const x = shoulderX + FIGURE_LIMBS.armLength * dir[0]
  const y = FIGURE_LIMBS.shoulderY + FIGURE_LIMBS.armLength * dir[1]
  const z = FIGURE_LIMBS.armLength * dir[2]
  const cl = Math.cos(DRUMMER_LEAN)
  const sl = Math.sin(DRUMMER_LEAN)
  return [x, y * cl - z * sl, y * sl + z * cl]
}

describe('the drummer beats ON his drums', () => {
  it.each(DRUMS)('%s: the hand rests on its head and never sinks into it', (_name, drum) => {
    for (let i = 0; i <= 40; i++) {
      const swing = i / 40
      const hand = drawnHand(drum, swing)
      const underside = hand[1] - FIGURE_LIMBS.handRadius
      // The head is where the strike leaves it at THIS swing: fully dipped under
      // the fallen hand, fully risen once the hand is up.
      const headTop = drumHeadY(drum, swing) + drum.headThickness / 2
      expect(underside).toBeGreaterThanOrEqual(headTop - 1e-9)
    }
    // CONTACT at the bottom of the stroke — a hand that merely hovers would beat
    // nothing, and that is as wrong as one inside the shell.
    const struck = drawnHand(drum, 0)
    expect(struck[1] - FIGURE_LIMBS.handRadius).toBeCloseTo(
      drumHeadY(drum, 0) + drum.headThickness / 2,
      5,
    )
    // CLEARANCE at the top, measured against the head at REST.
    const lifted = drawnHand(drum, 1)
    expect(lifted[1] - FIGURE_LIMBS.handRadius - drumHeadTop(drum)).toBeCloseTo(
      DRUM_STROKE_CLEARANCE,
      5,
    )
  })

  it.each(DRUMS)('%s: the hand stays over its own skin, the whole swing', (_name, drum) => {
    for (let i = 0; i <= 40; i++) {
      const hand = drawnHand(drum, i / 40)
      const off = Math.hypot(hand[0] - drum.x, hand[2] - drum.z)
      expect(off).toBeLessThan(drum.headRadius)
    }
    // And it is ON the axis at the moment of contact.
    const struck = drawnHand(drum, 0)
    expect(struck[0]).toBeCloseTo(drum.x, 5)
  })

  it('gives each drum the hand that stands over it — +x is the figure LEFT', () => {
    // The large drum sits at negative x, which is the figure's RIGHT; the small
    // one at positive x, his LEFT. The sides are READ OFF the placement, so the
    // swap of point 576 (b) cannot come back by an edit in one place only.
    expect(LOW_DRUM.x).toBeLessThan(0)
    expect(HIGH_DRUM.x).toBeGreaterThan(0)
    expect(drumStroke(LOW_DRUM).side).toBe('right')
    expect(drumStroke(HIGH_DRUM).side).toBe('left')
    // Two drums, two different arms: no beat is ever played by both.
    expect(drumStroke(LOW_DRUM).side).not.toBe(drumStroke(HIGH_DRUM).side)
  })

  it('gives the two drums their OWN strokes — one shared range fits neither', () => {
    // The heads stand 0.16 m apart, so a single elevation range cannot rest on
    // both; the strike elevations must differ by about that reach.
    const low = drumStroke(LOW_DRUM)
    const high = drumStroke(HIGH_DRUM)
    expect(drumHeadTop(LOW_DRUM)).toBeGreaterThan(drumHeadTop(HIGH_DRUM))
    expect(low.strikeElevation).toBeGreaterThan(high.strikeElevation)
    expect(low.liftElevation).toBeGreaterThan(low.strikeElevation)
    expect(high.liftElevation).toBeGreaterThan(high.strikeElevation)
  })

  it('follows the drum: a taller drum lifts its stroke with it', () => {
    const taller: DrumGeometry = { ...LOW_DRUM, headY: LOW_DRUM.headY + 0.12 }
    const before = drawnHand(LOW_DRUM, 0)[1]
    const after = drawnHand(taller, 0)[1]
    expect(after - before).toBeCloseTo(0.12, 5)
    // and it still rests on the new head rather than in it.
    const underside = after - FIGURE_LIMBS.handRadius
    expect(underside).toBeCloseTo(drumHeadTop(taller) - DRUM_HEAD_DIP, 5)
  })

  it('sinks the struck head under the fallen hand and lets it rise again', () => {
    expect(drumHeadY(LOW_DRUM, 0)).toBeCloseTo(LOW_DRUM.headY - DRUM_HEAD_DIP, 6)
    expect(drumHeadY(LOW_DRUM, 1)).toBeCloseTo(LOW_DRUM.headY, 6)
    // Out-of-range swings are clamped, so a stray value cannot push a head
    // through the shell or a hand through the sky.
    expect(drumHeadY(LOW_DRUM, -3)).toBeCloseTo(LOW_DRUM.headY - DRUM_HEAD_DIP, 6)
    expect(drumHeadY(LOW_DRUM, 7)).toBeCloseTo(LOW_DRUM.headY, 6)
    expect(drumHandPose(drumStroke(LOW_DRUM), 9)).toEqual(drumHandPose(drumStroke(LOW_DRUM), 1))
  })

  it('agrees with the pose the figure is handed — the two chains are one', () => {
    for (const [, drum] of DRUMS) {
      for (const swing of [0, 0.37, 1]) {
        const stroke = drumStroke(drum)
        const stated = drumHandPoint(stroke, swing)
        const drawn = drawnHand(drum, swing)
        stated.forEach((v, i) => expect(v).toBeCloseTo(drawn[i], 9))
      }
    }
  })
})
