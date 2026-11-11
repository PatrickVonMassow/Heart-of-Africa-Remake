// Spring bubble animation maths (design.md §11.3).
//
// The open-land spring is a 3D water feature (springGeometry.ts): a welling
// dome whose own surface bubbles and rings in its TSL material. On top of that,
// a few small bubble spheres rise out of the dome's crest (their count is the
// `springBubbles` quality lever, zero on LOW). This pure, period-looped
// function drives those spheres; the mesh lives in Rivers.tsx's <Spring>.
// Kept in its own module so the render file exports only components.

/** How high a bubble climbs above the dome crest before it bursts, world units. */
export const SPRING_BUBBLE_RISE = 0.22
const BUBBLE_PERIOD = 1.6

/** Bubble i of `count` at render time t (seconds): its height above the crest
 *  and its scale — it rises to `SPRING_BUBBLE_RISE` then resets, swelling in
 *  mid-climb and vanishing at the ends. Phases are staggered over the group.
 *  Pure and period-looped. */
export function springBubble(i: number, count: number, t: number): { y: number; scale: number } {
  const n = Math.max(1, count)
  const phase = (((t / BUBBLE_PERIOD + i / n) % 1) + 1) % 1
  return {
    y: phase * SPRING_BUBBLE_RISE,
    scale: Math.sin(phase * Math.PI) * 0.9,
  }
}
