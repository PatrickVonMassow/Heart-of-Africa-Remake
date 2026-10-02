import { expect, it } from 'vitest'
import { LINE_CONE, describeOverlap, lineOverlap } from './errandShutter.mjs'

// Lens 3 m off on bearing 0 (+z), looking back along -z at the subject.
const subject = { x: 0, z: 0 }

it('a line nobody stands in is clear', () => {
  expect(lineOverlap(subject, 0, [{ who: 1, x: 4, z: 0 }, { who: 2, x: 0, z: 8 }])).toBeNull()
})

it('a neighbour behind him in the picture spoils the line, as one in front does', () => {
  expect(lineOverlap(subject, 0, [{ who: 3, x: 0.2, z: -2 }])?.who).toBe(3)
  expect(lineOverlap(subject, 0, [{ who: 4, x: 0.1, z: 1.5 }])?.who).toBe(4)
})

it('the cone is angular: the same sideways offset clears near the lens and blocks far from it', () => {
  // 0.6 m aside at 1 m from the lens is 0.54 rad; at 5 m it is 0.12 rad.
  expect(lineOverlap(subject, 0, [{ who: 1, x: 0.6, z: 2 }])).toBeNull()
  expect(lineOverlap(subject, 0, [{ who: 1, x: 0.6, z: -2 }])).not.toBeNull()
})

it('names the worst offender and its margin inside the cone', () => {
  const o = lineOverlap(subject, Math.PI / 2, [{ who: 5, x: -1, z: 0.5 }, { who: 6, x: -2, z: 0.05 }])
  expect(o?.who).toBe(6)
  expect(o?.margin).toBeCloseTo(LINE_CONE - Math.atan2(0.05, 5), 6)
  expect(describeOverlap(o)).toMatch(/^villager 6 0\.01 rad off the view axis at 5\.0 m, 0\.29 rad inside/)
})

it('nobody at or behind the lens, or beyond nine metres, counts', () => {
  expect(lineOverlap(subject, 0, [{ who: 1, x: 0, z: 3.5 }, { who: 2, x: 0, z: -7 }])).toBeNull()
})
