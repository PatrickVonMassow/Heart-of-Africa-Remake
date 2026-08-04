// Vertical first-person look (design.md §17.5, point 392): the pitch state and
// every input that feeds it. Pure and three-free so the whole rule set — the
// gain, the inversion, the clamp and the order the walking bob composes in — is
// unit-testable; PlaceScene only stores the number and hands it to the camera.
//
// Sign convention throughout: pitch is the camera's rotation about its X axis
// in radians, POSITIVE looking UP (three.js 'YXZ' Euler, the order the camera
// is already set in). Raw input axes are the browser/gamepad convention where
// FORWARD (mouse pushed away, stick pushed away) is NEGATIVE.

/**
 * Hard structural cap on the pitch, in degrees: however the calibratable clamp
 * is set in the debug menu, the view stops short of vertical, so the world can
 * never roll over and the 'YXZ' Euler never reaches its gimbal-lock pole.
 */
export const PITCH_LIMIT_CEILING_DEG = 89

/** The clamp in radians: the calibrated value, itself bounded by the ceiling. */
export function pitchLimit(limitDeg: number): number {
  const deg = Math.min(PITCH_LIMIT_CEILING_DEG, Math.max(0, limitDeg))
  return (deg * Math.PI) / 180
}

/**
 * Apply a pitch delta and clamp. The clamp is applied to the RESULT, never to
 * the delta, so no sequence of inputs — however large, however often repeated —
 * can accumulate past the limit or wrap around it.
 */
export function applyPitch(pitch: number, deltaRad: number, limitDeg: number): number {
  const limit = pitchLimit(limitDeg)
  const next = pitch + deltaRad
  if (!Number.isFinite(next)) return Math.max(-limit, Math.min(limit, pitch))
  return Math.max(-limit, Math.min(limit, next))
}

/**
 * Pitch delta for a raw mouse movement, at the same `balance.mouseSensitivity`
 * (rad/px) the yaw uses.
 *
 * `invert` is the shipped default (user 28.07.2026): pushing the mouse FORWARD
 * (movementY negative) looks DOWN, pulling it back looks UP — the flight-stick
 * convention. Uninverted, forward looks up.
 */
export function mousePitchDelta(movementY: number, sensitivity: number, invert: boolean): number {
  return (invert ? 1 : -1) * movementY * sensitivity
}

/** Angular rate of the gamepad's right stick, rad/s — the yaw's own rate, so
 *  turning and pitching feel the same on the pad. */
export const PAD_LOOK_RATE = 2.4

/**
 * Pitch delta for the gamepad's right-stick VERTICAL axis over `dt` seconds.
 * The axis carries the same forward-is-negative convention as the mouse, so it
 * obeys the same `invert` flag and reaches the same clamped state.
 */
export function padPitchDelta(axisY: number, dt: number, invert: boolean): number {
  return (invert ? 1 : -1) * axisY * PAD_LOOK_RATE * dt
}

/**
 * The first-person camera pose, composed in ONE fixed order so the walking bob
 * and the pitch can never fight each other:
 *
 *  1. the LOGICAL position (x, z) — untouched by look and by bob, it is what
 *     the door/leave/interaction checks read;
 *  2. the bob as a POSITION offset on top of it: vertical on the eye height,
 *     lateral along the camera's right axis (yaw only). The bob is a
 *     translation of the head, so pitching the view must not swing it around —
 *     the offset is deliberately computed from the yaw alone;
 *  3. the ROTATION as the 'YXZ' Euler (yaw, then pitch, then the strafe roll) —
 *     the standard first-person order, in which pitch stays about the camera's
 *     own right axis whatever the yaw is, and the horizon never tilts with it.
 */
export function placeCameraPose(
  x: number,
  z: number,
  eyeHeight: number,
  yaw: number,
  pitch: number,
  roll: number,
  bobY: number,
  lateral: number,
): { position: [number, number, number]; rotation: [number, number, number] } {
  const sin = Math.sin(yaw)
  const cos = Math.cos(yaw)
  return {
    position: [x + cos * lateral, eyeHeight + bobY, z - sin * lateral],
    rotation: [pitch, yaw, roll],
  }
}
