// Pure touch-input math (design.md §17.5, point 84): virtual-stick vector
// normalisation, pinch ratio and the one-shot engagement latch, shared by the
// TouchControls overlay and the input.ts merge so no magic numbers live in the
// DOM code. three-free and side-effect-free (Vitest-covered).

export interface Axes {
  x: number
  y: number
}

/**
 * Map a drag offset (px) from the virtual stick's centre to movement axes in
 * [-1..1]. Within the dead zone the stick reads zero; past it the magnitude is
 * re-scaled from the dead-zone edge to the stick radius and clamped to 1, so a
 * diagonal is never faster than a straight push (matching the gamepad/keyboard
 * clamp, design.md §2.2). y is negated so dragging UP (screen −y) walks
 * forward, like the gamepad's left stick.
 */
export function stickVector(dx: number, dy: number, radius: number, deadZone: number): Axes {
  const len = Math.hypot(dx, dy)
  if (len <= deadZone) return { x: 0, y: 0 }
  const usable = Math.max(1e-6, radius - deadZone)
  const mag = Math.min(1, (len - deadZone) / usable)
  return { x: (dx / len) * mag, y: -(dy / len) * mag }
}

/**
 * Zoom ratio of a two-finger pinch: the factor the current bird's-eye zoom is
 * multiplied by. Spreading the fingers (newDist > oldDist) zooms in
 * (ratio < 1, a closer camera) to match the mouse wheel's sign, which zooms in
 * on a negative deltaY. Guards a zero/negative starting distance.
 */
export function pinchRatio(oldDist: number, newDist: number): number {
  if (oldDist <= 0 || newDist <= 0) return 1
  return oldDist / newDist
}

/**
 * One-shot deliberate-input latch mirroring the gamepad's engagement guard: the
 * touch layer arms only on the first real touch and never disarms, so a desktop
 * (no touch events) stays pixel-identical.
 */
export interface EngageLatch {
  engaged: () => boolean
  /** Arms the latch; returns true only on the very first call. */
  engage: () => boolean
}

export function createEngageLatch(): EngageLatch {
  let armed = false
  return {
    engaged: () => armed,
    engage: () => {
      const first = !armed
      armed = true
      return first
    },
  }
}
