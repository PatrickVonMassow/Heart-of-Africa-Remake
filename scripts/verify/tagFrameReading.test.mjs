import { describe, expect, it } from 'vitest'
import {
  AXIS_SAMPLES,
  KID_HEIGHT,
  MIN_CHILD_PIXELS,
  VILLAGE_BEHIND,
  describeReading,
  judgeTagStandpoint,
} from './tagFrameReading.mjs'

/**
 * The readings below are MEASURED, not invented: they were read off the live
 * Maasai village on the seeded world (WebGL 2, 1440x900) by projecting the
 * chaser and its quarry through the place camera and ray-probing each at five
 * heights up its own axis. `back` names the metres the standpoint stood behind
 * the pair and `off` the bearing offset of the sweep, so any row can be
 * re-measured.
 */
const kid = (over = {}) => ({
  pixels: 120,
  occluded: 0,
  confirmed: 5,
  ndcFeet: [0, -0.45],
  ndcHead: [0, -0.18],
  ...over,
})
const standpoint = (over = {}) => ({
  clear: true,
  behind: 6,
  gap: 1.3,
  nearestWall: 5.4,
  separation: 120,
  children: [kid(), kid()],
  ...over,
})

describe('the child figure the floor is derived from', () => {
  it('is the rendered one: 0.55 of a grown figure, 0.737 m to the crown', () => {
    expect(KID_HEIGHT).toBeCloseTo(0.737, 3)
  })

  it('fixes the floor at 67 px — a readable head, not a round number', () => {
    expect(MIN_CHILD_PIXELS).toBe(67)
  })
})

describe('the standpoint the reviewer rejected', () => {
  // The frame that passed every check and was rejected by eye: the camera stood
  // behind the settlement's boulder line, so the rocks hid the children to the
  // shoulders and about forty pixels of figure showed above them.
  it('fails on the occluder the old single chest probe missed', () => {
    // back=5.5 off=5: the chaser's whole axis met `hut-roof` at 0.167 of its
    // distance — every sample but the one the old probe happened to take.
    const v = judgeTagStandpoint(standpoint({ children: [kid({ occluded: 4, confirmed: 1 }), kid()] }))
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('occluded at 4/5')
  })

  it('fails on the pixel height even where nothing stands in the way', () => {
    // 41 px is what the suite's old 14 m distance cap allowed: in frame, clear,
    // and a speck.
    const v = judgeTagStandpoint(standpoint({ children: [kid(), kid({ pixels: 41 })] }))
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('41 px')
  })

  it('fails when only ONE of the two reads', () => {
    const v = judgeTagStandpoint(standpoint({ children: [kid(), kid({ occluded: 2 })] }))
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('the quarry')
  })

  it('still fails on the empty plain the point was written about', () => {
    const v = judgeTagStandpoint(standpoint({ behind: VILLAGE_BEHIND - 1 }))
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('buildings stand behind')
  })

  it('fails a figure whose legs are cut off by the bottom edge', () => {
    // back=3.5 off=6: 226 px of chaser, and its feet at ndc y -0.93.
    const v = judgeTagStandpoint(standpoint({ children: [kid({ pixels: 226, ndcFeet: [0.08, -0.93] }), kid()] }))
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('outside the inner')
  })

  it('fails a child that projects into frame but is not drawn there', () => {
    const v = judgeTagStandpoint(standpoint({ children: [kid({ confirmed: 1 }), kid()] }))
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('not drawn on its sight line')
  })

  it('fails the seconds after a catch, where the rear child hides in the front one', () => {
    // Measured at back=8.5 off=4 with the pair 0.15 m apart: both read 82-84 px
    // tall and clear at every sample, and they project onto the same pixels.
    const v = judgeTagStandpoint(
      standpoint({ separation: 6, children: [kid({ pixels: 82.1 }), kid({ pixels: 83.4 })] }),
    )
    expect(v.ok).toBe(false)
    expect(v.reason).toContain('the two overlap')
  })

  it('demands the separation in BODY WIDTHS, so it scales with the standpoint', () => {
    // A 240 px pair needs twice the pixels between them that a 120 px pair does.
    const near = judgeTagStandpoint(
      standpoint({ separation: 60, children: [kid({ pixels: 240 }), kid({ pixels: 240 })] }),
    )
    expect(near.ok).toBe(false)
    const far = judgeTagStandpoint(
      standpoint({ separation: 60, children: [kid({ pixels: 120 }), kid({ pixels: 120 })] }),
    )
    expect(far.ok).toBe(true)
  })
})

describe('the standpoints that photograph the chase', () => {
  it('accepts 5.5 m with eight buildings behind the pair', () => {
    // back=5.5 off=0: chaser 117 px at 6.0 m, quarry 144 px at 4.9 m, both
    // clear at every sample, 8 buildings behind, nearest wall 6.3 m.
    const v = judgeTagStandpoint(
      standpoint({
        behind: 8,
        nearestWall: 6.3,
        gap: 1.27,
        children: [
          kid({ pixels: 116.7, ndcFeet: [-0.05, -0.42], ndcHead: [-0.05, -0.16] }),
          kid({ pixels: 143.9, ndcFeet: [0.09, -0.55], ndcHead: [0.09, -0.23] }),
        ],
      }),
    )
    expect(v.ok).toBe(true)
  })

  it('accepts the furthest standpoint the sweep may fall back to', () => {
    // back=8.5 off=4: 82 px each — the smallest reading any clear standpoint in
    // this village produced, and it must stay above the floor.
    const v = judgeTagStandpoint(
      standpoint({ behind: 4, nearestWall: 7.87, children: [kid({ pixels: 82.1 }), kid({ pixels: 83.4 })] }),
    )
    expect(v.ok).toBe(true)
  })
})

describe('the rules that already held keep holding', () => {
  it('rejects an obstructed sight line to the pair', () => {
    expect(judgeTagStandpoint(standpoint({ clear: false })).ok).toBe(false)
  })

  it('rejects a pair that has sprinted apart', () => {
    expect(judgeTagStandpoint(standpoint({ gap: 7.2 })).reason).toContain('m apart')
  })

  it('rejects a lens pressed against a wall', () => {
    expect(judgeTagStandpoint(standpoint({ nearestWall: 2.1 })).reason).toContain('from the lens')
  })

  it('rejects a round with no pair in play', () => {
    expect(judgeTagStandpoint(standpoint({ children: [kid()] })).ok).toBe(false)
  })
})

describe('the reading is reported with its numbers', () => {
  it('names what each child measured', () => {
    expect(describeReading(standpoint({ children: [kid({ pixels: 116.7 }), kid({ occluded: 3 })] }))).toBe(
      'chaser 117px/0occl/5hit quarry 120px/3occl/5hit apart=120px behind=6 gap=1.3m wall=5.4m',
    )
  })

  it('probes the child from shin to head', () => {
    expect(AXIS_SAMPLES[0]).toBeLessThan(0.2)
    expect(AXIS_SAMPLES.at(-1)).toBeGreaterThan(0.7)
  })
})
