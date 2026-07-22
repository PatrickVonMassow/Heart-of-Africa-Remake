// Spring visual & animation maths (design.md §11.3, point 219).
//
// A river rising in open land wells up as a small NATURAL spring: a shallow
// water pool at the source with bubbles rising from its centre and concentric
// ripples spreading over the surface — replacing the former flat symbolic ring.
// The pool sits exactly at the source's ribbon-surface height, so it reads as
// the water's origin and never floats above the ground. The layout is
// region-neutral and cheap (a couple of discs plus a handful of tiny
// ripple/bubble meshes driven by the shared render clock).
//
// These pure, period-looped functions drive the animation; the meshes live in
// Rivers.tsx's <Spring> component. Kept in their own module so the render file
// exports only components (fast-refresh clean).

export const SPRING_POOL_RADIUS = 0.6
export const SPRING_RIPPLE_COUNT = 3
export const SPRING_BUBBLE_COUNT = 5

/** Ripple ring i's surface radius and opacity at render time t (seconds): each
 *  ring wells up near the centre and expands to the pool rim on its own
 *  phase-offset loop, fading as it grows. Pure, seamless (period-looped) and
 *  cheap — a unit ring mesh is uniformly scaled to `radius`. */
export function springRipple(i: number, t: number): { radius: number; opacity: number } {
  const period = 2.8
  const phase = (((t / period + i / SPRING_RIPPLE_COUNT) % 1) + 1) % 1
  return {
    radius: 0.08 + phase * (SPRING_POOL_RADIUS - 0.08),
    opacity: (1 - phase) * 0.45,
  }
}

/** Bubble i's height above the pool surface and scale at render time t: it
 *  rises from the bed to the surface then resets, swelling in mid-climb and
 *  vanishing at the ends. Pure and period-looped. */
export function springBubble(i: number, t: number): { y: number; scale: number } {
  const period = 1.6
  const rise = 0.22
  const phase = (((t / period + i / SPRING_BUBBLE_COUNT) % 1) + 1) % 1
  return {
    y: phase * rise,
    scale: Math.sin(phase * Math.PI) * 0.9,
  }
}
