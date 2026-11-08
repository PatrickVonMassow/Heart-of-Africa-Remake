// Steep overhead camera for the garment acceptance frames: the camera stands
// `dist` metres from the aim point along its line of sight, looking down at
// `pitchDeg` below the horizontal. Pure; the suite turns it into a player spot
// (horizontal reach), a camera height and the player's pitch.

/** Look-down angle of the overhead view, degrees below the horizontal. */
export const OVERHEAD_PITCH_DEG = 60

/**
 * @param {number} dist distance from the camera to the aim point along the line of sight (m)
 * @param {number} aimY world height of the aim point (m)
 * @param {number} [pitchDeg] look-down angle below the horizontal (deg)
 * @returns {{ horiz: number, eyeY: number, pitch: number }} horizontal reach,
 *   camera world height, and the player's pitch (rad, negative looks down)
 */
export function overheadCamera(dist, aimY, pitchDeg = OVERHEAD_PITCH_DEG) {
  if (!(dist > 0) || !(pitchDeg > 0 && pitchDeg < 90)) throw new RangeError(`overheadCamera: dist ${dist}, pitch ${pitchDeg}`)
  const r = (pitchDeg * Math.PI) / 180
  return { horiz: dist * Math.cos(r), eyeY: aimY + dist * Math.sin(r), pitch: -r }
}
