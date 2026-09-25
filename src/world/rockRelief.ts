/** The asymmetric outline shared by the clay impression and the talus socket.
 * Coordinates are in the face plane; the notch makes orientation readable. */
export const ROCK_RELIEF = [
  [-0.58, -0.36], [0.26, -0.43], [0.6, -0.12], [0.42, 0.18],
  [0.18, 0.18], [0.18, 0.52], [-0.18, 0.6], [-0.55, 0.22],
] as const
export const ROCK_RELIEF_SVG = ROCK_RELIEF.map(([x, y]) => `${x},${-y}`).join(' ')
