// Where the open-sea plane is laid (point 314). The plane follows the traveller
// so it always covers the view, but its wave field is displaced per VERTEX: a
// plane moved continuously with him slid its vertex lattice across the world,
// so the height the waves reached at a fixed spot — and with it where the
// shallow floor broke through the surface near the shore — changed with every
// step he took, while standing still it held. Snapping the plane's origin to
// whole lattice cells keeps every vertex on fixed world positions.

/** Edge length of the sea plane in world units (30 terrain chunks of 24). */
export const SEA_PLANE_SIZE = 720
/** Grid segments per plane edge. */
export const SEA_PLANE_SEGMENTS = 180

/** The plane origin for a traveller at world (x, z) and a plane scaled by
 *  `scale`: the nearest point of the world-fixed vertex lattice. */
export function seaPlaneOrigin(x: number, z: number, scale = 1): { x: number; z: number } {
  const cell = (SEA_PLANE_SIZE / SEA_PLANE_SEGMENTS) * scale
  return { x: Math.round(x / cell) * cell, z: Math.round(z / cell) * cell }
}
